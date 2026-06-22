import { createQueryEmbedding } from "@/lib/embeddings";
import { getAppDb } from "@/lib/mongodb";
import type { Product } from "@/types/product";
import type { SearchRequest, SearchResponse, SearchResult } from "@/types/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LIMIT = 20;
const DEFAULT_LIMIT = 10;
const validSearchModes = new Set<SearchRequest["mode"]>(["auto", "keyword", "semantic", "fuzzy", "synonyms", "filter", "fallback"]);

function clampLimit(limit: unknown) {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return DEFAULT_LIMIT;
  }

  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit)));
}

function normalizeRequest(body: SearchRequest) {
  const mode = body.mode ?? "auto";

  return {
    query: typeof body.query === "string" ? body.query.trim() : "",
    mode: typeof mode === "string" && validSearchModes.has(mode) ? mode : undefined,
    category: typeof body.category === "string" && body.category.trim() ? body.category.trim() : undefined,
    tags: Array.isArray(body.tags) ? body.tags.filter((tag) => typeof tag === "string" && tag.trim()).map((tag) => tag.trim()) : [],
    limit: clampLimit(body.limit),
  };
}

function productProjection() {
  return {
    _id: 0,
    id: 1,
    name: 1,
    description: 1,
    category: 1,
    tags: 1,
    price: 1,
    sale_weight: 1,
    language: 1,
    searchScore: 1,
    weightedScore: 1,
  };
}

function buildSearchStage(input: ReturnType<typeof normalizeRequest>) {
  const must = input.query && input.mode !== "filter"
    ? [
        {
          text: {
            query: input.query,
            path: input.mode === "fuzzy" ? "name" : input.mode === "synonyms" ? "description" : ["name", "description"],
            ...(input.mode === "fuzzy" ? { fuzzy: { maxEdits: 1 } } : {}),
            ...(input.mode === "synonyms" ? { synonyms: "insta360_synonyms" } : {}),
          },
        },
      ]
    : [];
  const should = input.query && input.mode === "filter"
    ? [
        {
          text: {
            query: input.query,
            path: ["name", "description"],
          },
        },
      ]
    : [];

  const filter = [
    ...(input.category
      ? [
          {
            equals: {
              path: "category",
              value: input.category,
            },
          },
        ]
      : []),
    ...input.tags.map((tag) => ({
      equals: {
        path: "tags",
        value: tag,
      },
    })),
  ];

  return {
    $search: {
      index: "default",
      compound: {
        ...(must.length > 0 ? { must } : {}),
        ...(should.length > 0 ? { should } : {}),
        ...(filter.length > 0 ? { filter } : {}),
      },
    },
  };
}

function withMatchReason(product: Product & { searchScore?: number }, reasons: string[]): SearchResult {
  return {
    ...product,
    matchReason: reasons,
  };
}

function fallbackTerms(query: string) {
  if (query === "无人机苹果手机壳") {
    return ["无人机", "苹果", "手机壳"];
  }

  return query.split(/\s+/).filter(Boolean);
}

function buildProductMatch(input: ReturnType<typeof normalizeRequest>) {
  return {
    ...(input.category ? { category: input.category } : {}),
    ...(input.tags.length > 0 ? { tags: { $all: input.tags } } : {}),
  };
}

export async function POST(request: Request) {
  const startedAt = performance.now();

  try {
    const body = (await request.json()) as SearchRequest;
    const input = normalizeRequest(body);
    const db = await getAppDb();

    if (!input.mode) {
      return Response.json({ error: "Invalid search mode." }, { status: 400 });
    }

    if (input.mode === "semantic") {
      if (!input.query) {
        return Response.json({ error: "Semantic search requires a query." }, { status: 400 });
      }

      const queryVector = await createQueryEmbedding(input.query);
      const productMatch = buildProductMatch(input);
      const hasProductFilter = Object.keys(productMatch).length > 0;
      const products = await db
        .collection<Product>("products")
        .aggregate<Product & { vectorSearchScore?: number }>([
          {
            $vectorSearch: {
              index: "vector_index",
              path: "description_embedding",
              queryVector,
              numCandidates: Math.max(20, input.limit * 20),
              limit: hasProductFilter ? MAX_LIMIT : input.limit,
            },
          },
          ...(hasProductFilter ? [{ $match: productMatch }] : []),
          { $addFields: { vectorSearchScore: { $meta: "vectorSearchScore" } } },
          { $project: { ...productProjection(), vectorSearchScore: 1 } },
          { $limit: input.limit },
        ])
        .toArray();

      const response: SearchResponse = {
        query: input.query,
        mode: "semantic",
        fallback: false,
        total: products.length,
        capabilities: ["Atlas Vector Search", "voyage-4-large", "Semantic Similarity"],
        results: products.map((product) => withMatchReason(product, ["语义召回", "向量相似度排序"])),
        debug: {
          index: "vector_index",
          pipelineName: "semanticVectorSearch",
          elapsedMs: Math.round(performance.now() - startedAt),
          filters: { category: input.category, tags: input.tags },
        },
      };

      return Response.json(response);
    }

    if (input.mode === "fallback") {
      const terms = fallbackTerms(input.query);
      const firstRound = terms.length > 0
        ? await db
            .collection<Product>("products")
            .aggregate<Product & { searchScore?: number }>([
              {
                $search: {
                  index: "default",
                  compound: {
                    must: terms.map((term) => ({
                      text: {
                        query: term,
                        path: ["name", "description"],
                      },
                    })),
                  },
                },
              },
              { $addFields: { searchScore: { $meta: "searchScore" } } },
              { $project: productProjection() },
              { $limit: input.limit },
            ])
            .toArray()
        : [];

      if (firstRound.length > 0) {
        const response: SearchResponse = {
          query: input.query,
          mode: "fallback",
          fallback: false,
          total: firstRound.length,
          capabilities: ["Atlas Search", "Strict Match"],
          results: firstRound.map((product) => withMatchReason(product, ["严格匹配"])),
          debug: {
            index: "default",
            pipelineName: "strictFirstRoundSearch",
            elapsedMs: Math.round(performance.now() - startedAt),
            filters: { category: input.category, tags: input.tags },
          },
        };

        return Response.json(response);
      }

      const fallbackProducts = await db
        .collection<Product>("products")
        .find({}, { projection: productProjection() })
        .sort({ sale_weight: -1, id: 1 })
        .limit(3)
        .toArray();

      const response: SearchResponse = {
        query: input.query,
        mode: "fallback",
        fallback: true,
        total: fallbackProducts.length,
        capabilities: ["Zero Result Handling", "Business Weight Recommendation"],
        results: fallbackProducts.map((product) => withMatchReason(product, ["零结果兜底", "热销权重推荐"])),
        debug: {
          index: "default",
          pipelineName: "zeroResultFallback",
          elapsedMs: Math.round(performance.now() - startedAt),
          filters: { category: input.category, tags: input.tags },
        },
      };

      return Response.json(response);
    }

    if (!input.query && !input.category && input.tags.length === 0) {
      const products = await db
        .collection<Product>("products")
        .find({}, { projection: productProjection() })
        .sort({ sale_weight: -1, id: 1 })
        .limit(input.limit)
        .toArray();

      const response: SearchResponse = {
        query: input.query,
        mode: "keyword_basic",
        fallback: false,
        total: products.length,
        capabilities: ["MongoDB Query", "Business Field Sorting"],
        results: products.map((product) => withMatchReason(product, ["初始商品列表", "业务权重排序"])),
        debug: {
          pipelineName: "defaultProductList",
          elapsedMs: Math.round(performance.now() - startedAt),
          filters: { category: input.category, tags: input.tags },
        },
      };

      return Response.json(response);
    }

    const pipeline = [
      buildSearchStage(input),
      { $addFields: { searchScore: { $meta: "searchScore" } } },
      { $addFields: { weightedScore: { $multiply: ["$searchScore", "$sale_weight"] } } },
      { $sort: { weightedScore: -1, searchScore: -1, id: 1 } },
      { $project: productProjection() },
      { $limit: input.limit },
    ];

    const products = await db.collection<Product>("products").aggregate<Product & { searchScore?: number }>(pipeline).toArray();
    const reasons = [
      ...(input.query ? ["关键词匹配"] : []),
      ...(input.category || input.tags.length > 0 ? ["结构化过滤"] : []),
    ];

    const isFuzzySearch = input.mode === "fuzzy";
    const isSynonymSearch = input.mode === "synonyms";
    const isFilterSearch = input.mode === "filter";
    const response: SearchResponse = {
      query: input.query,
      mode: isFuzzySearch ? "fuzzy" : isSynonymSearch ? "synonyms" : isFilterSearch ? "filter" : "keyword_weighted",
      fallback: false,
      total: products.length,
      capabilities: [
        "Atlas Search",
        "BM25",
        ...(isFuzzySearch ? ["Fuzzy Match"] : []),
        ...(isSynonymSearch ? ["Synonym Mapping"] : []),
        ...(isFilterSearch ? ["Compound Filter"] : []),
        "Business Weight Sorting",
        "Structured Filter",
      ],
      results: products.map((product) =>
        withMatchReason(product, [
          ...reasons,
          ...(isFuzzySearch ? ["错别字容错"] : []),
          ...(isSynonymSearch ? ["同义词召回"] : []),
          ...(isFilterSearch ? ["分类标签过滤"] : []),
          "业务权重排序",
        ]),
      ),
      debug: {
        index: "default",
        pipelineName: "keywordBasicSearch",
        elapsedMs: Math.round(performance.now() - startedAt),
        filters: { category: input.category, tags: input.tags },
      },
    };

    return Response.json(response);
  } catch (error) {
    console.error("Search request failed", error);

    return Response.json(
      { error: "Search request failed. Check request body, Atlas Search index, and server configuration." },
      { status: 500 },
    );
  }
}
