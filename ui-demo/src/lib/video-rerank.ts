import { getServerEnv } from "./env";
import type { VideoSegment } from "@/types/video";

type RerankResponse = {
  data?: Array<{
    index?: number;
    relevance_score?: number;
  }>;
};

const RERANK_MODEL = "rerank-2.5-lite";
const RERANK_ENDPOINT = "https://ai.mongodb.com/v1/rerank";

function segmentDocument(segment: VideoSegment) {
  return [
    `Title: ${segment.title}`,
    `Description: ${segment.description}`,
    segment.transcript ? `Transcript: ${segment.transcript}` : undefined,
    segment.productLine ? `Product line: ${segment.productLine}` : undefined,
    segment.language ? `Language: ${segment.language}` : undefined,
    segment.sourceType ? `Source type: ${segment.sourceType}` : undefined,
    segment.tags.length > 0 ? `Tags: ${segment.tags.join(", ")}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}

export function getVideoRerankerModel() {
  return RERANK_MODEL;
}

export async function rerankVideoSegments(query: string, segments: VideoSegment[], limit: number) {
  if (segments.length <= 1) {
    return segments.map((segment, index) => ({ ...segment, originalRank: index + 1 }));
  }

  const { VOYAGE_API_KEY } = getServerEnv();
  const response = await fetch(RERANK_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${VOYAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: RERANK_MODEL,
      query,
      documents: segments.map(segmentDocument),
      top_k: Math.min(limit, segments.length),
    }),
  });

  if (!response.ok) {
    throw new Error(`Rerank request failed with status ${response.status}`);
  }

  const data = (await response.json()) as RerankResponse;

  if (!Array.isArray(data.data)) {
    throw new Error("Rerank response did not include ranked results.");
  }

  return data.data.map((item) => {
    if (typeof item.index !== "number" || typeof item.relevance_score !== "number" || !segments[item.index]) {
      throw new Error("Rerank response included an invalid result item.");
    }

    return {
      ...segments[item.index],
      originalRank: item.index + 1,
      rerankScore: item.relevance_score,
      matchReason: [...segments[item.index].matchReason, "Voyage Rerank 二次排序"],
    };
  });
}
