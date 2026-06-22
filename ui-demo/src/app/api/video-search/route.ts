import { createMultimodalQueryEmbedding, createQueryEmbedding } from "@/lib/embeddings";
import { getAppDb } from "@/lib/mongodb";
import { getVideoRerankerModel, rerankVideoSegments } from "@/lib/video-rerank";
import { buildVideoTextFilters, buildVideoVectorFilter, videoSegmentProjection } from "@/lib/video-search";
import type { VideoMatchedSegment, VideoSearchFilters, VideoSearchMode, VideoSearchRequest, VideoSearchResponse, VideoSearchResult, VideoSegment, VideoSourceType } from "@/types/video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LIMIT = 20;
const DEFAULT_LIMIT = 8;
const validModes = new Set<VideoSearchMode>(["semantic", "keyword", "hybrid", "multimodal"]);
const validSourceTypes = new Set<VideoSourceType>(["demo", "tutorial", "product", "ugc"]);

function clampLimit(limit: unknown) {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return DEFAULT_LIMIT;
  }

  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit)));
}

function trimString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : undefined;
}

function normalizeFilters(filters: unknown): VideoSearchFilters {
  if (!filters || typeof filters !== "object") {
    return {};
  }

  const input = filters as Record<string, unknown>;
  const sourceType = trimString(input.sourceType, 40);

  return {
    productLine: trimString(input.productLine, 80),
    tag: trimString(input.tag, 80),
    language: trimString(input.language, 20),
    sourceType: sourceType && validSourceTypes.has(sourceType as VideoSourceType) ? (sourceType as VideoSourceType) : undefined,
  };
}

function normalizeRequest(body: VideoSearchRequest) {
  const mode = typeof body.mode === "string" && validModes.has(body.mode) ? body.mode : undefined;

  return {
    query: trimString(body.query, 240) ?? "",
    mode,
    filters: normalizeFilters(body.filters),
    limit: clampLimit(body.limit),
    rerank: Boolean(body.rerank),
  };
}

function combineHybridResults(vectorResults: VideoSegment[], textResults: VideoSegment[], limit: number) {
  const bySegmentId = new Map<string, VideoSegment>();
  const maxSearchScore = Math.max(1, ...textResults.map((segment) => segment.searchScore ?? 0));

  for (const segment of vectorResults) {
    bySegmentId.set(segment.segmentId, {
      ...segment,
      vectorScore: segment.vectorScore ?? 0,
      searchScore: 0,
    });
  }

  for (const segment of textResults) {
    const existing = bySegmentId.get(segment.segmentId);

    bySegmentId.set(segment.segmentId, {
      ...segment,
      ...existing,
      searchScore: segment.searchScore ?? 0,
      vectorScore: existing?.vectorScore ?? 0,
    });
  }

  return Array.from(bySegmentId.values())
    .map((segment) => {
      const normalizedTextScore = (segment.searchScore ?? 0) / maxSearchScore;
      const vectorScore = segment.vectorScore ?? 0;

      return {
        ...segment,
        combinedScore: Number((vectorScore * 0.6 + normalizedTextScore * 0.4).toFixed(6)),
        matchReason: [
          vectorScore > 0 ? "向量语义召回" : "向量未命中",
          (segment.searchScore ?? 0) > 0 ? "全文检索召回" : "全文未命中",
          "应用层混合评分融合",
        ],
      };
    })
    .sort((left, right) => (right.combinedScore ?? 0) - (left.combinedScore ?? 0))
    .slice(0, limit);
}

async function applyOptionalRerank(query: string, segments: VideoSegment[], limit: number, enabled: boolean) {
  if (!enabled) {
    return { results: segments, rerankerModel: undefined };
  }

  try {
    return {
      results: await rerankVideoSegments(query, segments, limit),
      rerankerModel: getVideoRerankerModel(),
    };
  } catch (error) {
    console.warn("Video rerank unavailable", error);

    return {
      results: segments.map((segment) => ({
        ...segment,
        matchReason: [...segment.matchReason, "Rerank unavailable; using retrieval order"],
      })),
      rerankerModel: "unavailable",
    };
  }
}

function segmentScore(segment: VideoSegment) {
  return segment.rerankScore ?? segment.combinedScore ?? segment.multimodalScore ?? segment.vectorScore ?? segment.searchScore ?? 0;
}

function toMatchedSegment(segment: VideoSegment): VideoMatchedSegment {
  return {
    segmentId: segment.segmentId,
    title: segment.title,
    startSec: segment.startSec,
    endSec: segment.endSec,
    vectorScore: segment.vectorScore,
    multimodalScore: segment.multimodalScore,
    searchScore: segment.searchScore,
    combinedScore: segment.combinedScore,
    rerankScore: segment.rerankScore,
    originalRank: segment.originalRank,
    matchReason: segment.matchReason,
  };
}

async function groupSegmentsToVideos(db: Awaited<ReturnType<typeof getAppDb>>, segments: VideoSegment[], limit: number): Promise<VideoSearchResult[]> {
  const byVideoId = new Map<string, VideoSegment[]>();

  for (const segment of segments) {
    const existing = byVideoId.get(segment.videoId) ?? [];
    existing.push(segment);
    byVideoId.set(segment.videoId, existing);
  }

  const videoIds = Array.from(byVideoId.keys());
  const videos = await db
    .collection("videos")
    .find({ videoId: { $in: videoIds } }, { projection: { _id: 0, videoId: 1, title: 1, description: 1, tags: 1, productLine: 1, language: 1, sourceType: 1, sourceUrl: 1, durationSec: 1 } })
    .toArray();
  const videoById = new Map(videos.map((video) => [video.videoId as string, video]));

  return videoIds
    .map((videoId) => {
      const matchedSegments = (byVideoId.get(videoId) ?? []).sort((left, right) => segmentScore(right) - segmentScore(left));
      const bestSegment = matchedSegments[0];
      const video = videoById.get(videoId);
      const score = segmentScore(bestSegment);

      return {
        videoId,
        title: typeof video?.title === "string" ? video.title : bestSegment.title,
        description: typeof video?.description === "string" ? video.description : bestSegment.description,
        tags: Array.isArray(video?.tags) ? (video.tags as string[]) : bestSegment.tags,
        productLine: typeof video?.productLine === "string" ? video.productLine : bestSegment.productLine,
        language: typeof video?.language === "string" ? video.language : bestSegment.language,
        sourceType: typeof video?.sourceType === "string" ? (video.sourceType as VideoSourceType) : bestSegment.sourceType,
        sourceUrl: typeof video?.sourceUrl === "string" ? video.sourceUrl : bestSegment.sourceUrl,
        thumbnailUrl: bestSegment.thumbnailUrl,
        durationSec: typeof video?.durationSec === "number" ? video.durationSec : undefined,
        score,
        vectorScore: bestSegment.vectorScore,
        multimodalScore: bestSegment.multimodalScore,
        searchScore: bestSegment.searchScore,
        combinedScore: bestSegment.combinedScore,
        rerankScore: bestSegment.rerankScore,
        bestSegment: toMatchedSegment(bestSegment),
        matchedSegments: matchedSegments.map(toMatchedSegment),
        matchReason: [`返回完整视频文件`, `最佳命中片段：${bestSegment.title}`, ...bestSegment.matchReason],
      } satisfies VideoSearchResult;
    })
    .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))
    .slice(0, limit);
}

export async function POST(request: Request) {
  const startedAt = performance.now();

  try {
    const body = (await request.json()) as VideoSearchRequest;
    const input = normalizeRequest(body);

    if (!input.mode) {
      return Response.json({ error: "Invalid video search mode." }, { status: 400 });
    }

    if (input.mode === "semantic") {
      if (!input.query) {
        return Response.json({ error: "Semantic video search requires a query." }, { status: 400 });
      }

      const db = await getAppDb();
      const queryVector = await createQueryEmbedding(input.query);
      const filter = buildVideoVectorFilter(input.filters);
      const results = await db
        .collection<VideoSegment>("video_segments")
        .aggregate<VideoSegment>([
          {
            $vectorSearch: {
              index: "video_vector_index",
              path: "embedding",
              queryVector,
              numCandidates: Math.max(100, input.limit * 20),
              limit: input.limit,
              ...(filter ? { filter } : {}),
            },
          },
          { $addFields: { vectorScore: { $meta: "vectorSearchScore" } } },
          { $project: videoSegmentProjection() },
        ])
        .toArray();

      const resultsWithReasons = results.map((segment) => ({
        ...segment,
        matchReason: ["Atlas Vector Search", "voyage-4-large 语义向量", "片段级时间点召回"],
      }));
      const reranked = await applyOptionalRerank(input.query, resultsWithReasons, input.limit, input.rerank);
      const videoResults = await groupSegmentsToVideos(db, reranked.results, input.limit);
      const response: VideoSearchResponse = {
        query: input.query,
        mode: "semantic",
        total: videoResults.length,
        results: videoResults,
        debug: {
          collection: "video_segments",
          mode: "semantic",
          index: "video_vector_index",
          pipelineName: "semanticVideoVectorSearch",
          embeddingModel: "voyage-4-large",
          ...(reranked.rerankerModel ? { rerankerModel: reranked.rerankerModel } : {}),
          filters: input.filters,
          elapsedMs: Math.round(performance.now() - startedAt),
        },
      };

      return Response.json(response);
    }

    if (input.mode === "keyword") {
      if (!input.query) {
        return Response.json({ error: "Keyword video search requires a query." }, { status: 400 });
      }

      const db = await getAppDb();
      const filter = buildVideoTextFilters(input.filters);
      const results = await db
        .collection<VideoSegment>("video_segments")
        .aggregate<VideoSegment>([
          {
            $search: {
              index: "video_text_index",
              compound: {
                must: [
                  {
                    text: {
                      query: input.query,
                      path: ["title", "description", "transcript", "tags", "productLine", "language", "sourceType"],
                    },
                  },
                ],
                ...(filter.length > 0 ? { filter } : {}),
              },
            },
          },
          { $addFields: { searchScore: { $meta: "searchScore" } } },
          { $project: videoSegmentProjection() },
          { $limit: input.limit },
        ])
        .toArray();

      const resultsWithReasons = results.map((segment) => ({
        ...segment,
        matchReason: ["Atlas Search", "标题/描述/字幕/标签全文检索", "片段级结果"],
      }));
      const reranked = await applyOptionalRerank(input.query, resultsWithReasons, input.limit, input.rerank);
      const videoResults = await groupSegmentsToVideos(db, reranked.results, input.limit);
      const response: VideoSearchResponse = {
        query: input.query,
        mode: "keyword",
        total: videoResults.length,
        results: videoResults,
        debug: {
          collection: "video_segments",
          mode: "keyword",
          index: "video_text_index",
          pipelineName: "keywordVideoTextSearch",
          ...(reranked.rerankerModel ? { rerankerModel: reranked.rerankerModel } : {}),
          filters: input.filters,
          elapsedMs: Math.round(performance.now() - startedAt),
        },
      };

      return Response.json(response);
    }

    if (input.mode === "multimodal") {
      if (!input.query) {
        return Response.json({ error: "Multimodal video search requires a query." }, { status: 400 });
      }

      const db = await getAppDb();
      const queryVector = await createMultimodalQueryEmbedding(input.query);
      const filter = buildVideoVectorFilter(input.filters);
      const results = await db
        .collection<VideoSegment>("video_segments")
        .aggregate<VideoSegment>([
          {
            $vectorSearch: {
              index: "video_multimodal_vector_index",
              path: "multimodalEmbedding",
              queryVector,
              numCandidates: Math.max(100, input.limit * 20),
              limit: input.limit,
              ...(filter ? { filter } : {}),
            },
          },
          { $addFields: { multimodalScore: { $meta: "vectorSearchScore" } } },
          { $project: videoSegmentProjection() },
        ])
        .toArray();

      const resultsWithReasons = results.map((segment) => ({
        ...segment,
        matchReason: ["Atlas Vector Search", "voyage-multimodal-3.5 视频片段向量", "视觉/多模态片段级召回"],
      }));
      const reranked = await applyOptionalRerank(input.query, resultsWithReasons, input.limit, input.rerank);
      const videoResults = await groupSegmentsToVideos(db, reranked.results, input.limit);
      const response: VideoSearchResponse = {
        query: input.query,
        mode: "multimodal",
        total: videoResults.length,
        results: videoResults,
        debug: {
          collection: "video_segments",
          mode: "multimodal",
          index: "video_multimodal_vector_index",
          pipelineName: "multimodalVideoVectorSearch",
          embeddingModel: "voyage-multimodal-3.5",
          vectorField: "multimodalEmbedding",
          ...(reranked.rerankerModel ? { rerankerModel: reranked.rerankerModel } : {}),
          filters: input.filters,
          elapsedMs: Math.round(performance.now() - startedAt),
        },
      };

      return Response.json(response);
    }

    if (input.mode === "hybrid") {
      if (!input.query) {
        return Response.json({ error: "Hybrid video search requires a query." }, { status: 400 });
      }

      const db = await getAppDb();
      const queryVector = await createQueryEmbedding(input.query);
      const vectorFilter = buildVideoVectorFilter(input.filters);
      const textFilter = buildVideoTextFilters(input.filters);
      const candidateLimit = Math.max(20, input.limit * 4);
      const collection = db.collection<VideoSegment>("video_segments");
      const [vectorResults, textResults] = await Promise.all([
        collection
          .aggregate<VideoSegment>([
            {
              $vectorSearch: {
                index: "video_vector_index",
                path: "embedding",
                queryVector,
                numCandidates: Math.max(100, candidateLimit * 20),
                limit: candidateLimit,
                ...(vectorFilter ? { filter: vectorFilter } : {}),
              },
            },
            { $addFields: { vectorScore: { $meta: "vectorSearchScore" } } },
            { $project: videoSegmentProjection() },
          ])
          .toArray(),
        collection
          .aggregate<VideoSegment>([
            {
              $search: {
                index: "video_text_index",
                compound: {
                  must: [
                    {
                      text: {
                        query: input.query,
                        path: ["title", "description", "transcript", "tags", "productLine", "language", "sourceType"],
                      },
                    },
                  ],
                  ...(textFilter.length > 0 ? { filter: textFilter } : {}),
                },
              },
            },
            { $addFields: { searchScore: { $meta: "searchScore" } } },
            { $project: videoSegmentProjection() },
            { $limit: candidateLimit },
          ])
          .toArray(),
      ]);
      const results = combineHybridResults(vectorResults, textResults, input.limit);
      const reranked = await applyOptionalRerank(input.query, results, input.limit, input.rerank);
      const videoResults = await groupSegmentsToVideos(db, reranked.results, input.limit);
      const response: VideoSearchResponse = {
        query: input.query,
        mode: "hybrid",
        total: videoResults.length,
        results: videoResults,
        debug: {
          collection: "video_segments",
          mode: "hybrid",
          index: "video_vector_index + video_text_index",
          pipelineName: "hybridVideoSearchFusion",
          embeddingModel: "voyage-4-large",
          ...(reranked.rerankerModel ? { rerankerModel: reranked.rerankerModel } : {}),
          filters: input.filters,
          elapsedMs: Math.round(performance.now() - startedAt),
        },
      };

      return Response.json(response);
    }

    return Response.json({ error: "Invalid video search mode." }, { status: 400 });
  } catch (error) {
    console.error("Mock video search failed", error);

    return Response.json({ error: "Video search request failed." }, { status: 500 });
  }
}
