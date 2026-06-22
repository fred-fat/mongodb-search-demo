import type { Product } from "./product";

export type SearchMode = "auto" | "keyword" | "semantic" | "fuzzy" | "synonyms" | "filter" | "fallback";

export type SearchRequest = {
  query?: string;
  mode?: SearchMode;
  category?: string;
  tags?: string[];
  limit?: number;
};

export type SearchResult = Product & {
  searchScore?: number;
  vectorSearchScore?: number;
  weightedScore?: number;
  matchReason: string[];
};

export type SearchResponse = {
  query: string;
  mode: SearchMode | "keyword_basic" | "keyword_weighted";
  fallback: boolean;
  total: number;
  capabilities: string[];
  results: SearchResult[];
  debug: {
    index?: string;
    pipelineName: string;
    elapsedMs: number;
    filters: {
      category?: string;
      tags: string[];
    };
  };
};
