export type VideoSearchMode = "semantic" | "keyword" | "hybrid" | "multimodal";

export type VideoSourceType = "demo" | "tutorial" | "product" | "ugc";

export type VideoSegment = {
  videoId: string;
  segmentId: string;
  title: string;
  description: string;
  transcript?: string;
  tags: string[];
  productLine?: string;
  language?: string;
  sourceType?: VideoSourceType;
  sourceUrl?: string;
  thumbnailUrl?: string;
  startSec: number;
  endSec: number;
  embedding?: number[];
  vectorScore?: number;
  multimodalScore?: number;
  searchScore?: number;
  combinedScore?: number;
  rerankScore?: number;
  originalRank?: number;
  matchReason: string[];
};

export type VideoMatchedSegment = {
  segmentId: string;
  title: string;
  startSec: number;
  endSec: number;
  vectorScore?: number;
  multimodalScore?: number;
  searchScore?: number;
  combinedScore?: number;
  rerankScore?: number;
  originalRank?: number;
  matchReason: string[];
};

export type VideoSearchResult = {
  videoId: string;
  title: string;
  description?: string;
  tags: string[];
  productLine?: string;
  language?: string;
  sourceType?: VideoSourceType;
  sourceUrl?: string;
  thumbnailUrl?: string;
  durationSec?: number;
  score?: number;
  vectorScore?: number;
  multimodalScore?: number;
  searchScore?: number;
  combinedScore?: number;
  rerankScore?: number;
  bestSegment: VideoMatchedSegment;
  matchedSegments: VideoMatchedSegment[];
  matchReason: string[];
};

export type VideoSearchFilters = {
  productLine?: string;
  tag?: string;
  language?: string;
  sourceType?: VideoSourceType;
};

export type VideoSearchDebug = {
  collection: string;
  mode: VideoSearchMode;
  index?: string;
  pipelineName: string;
  embeddingModel?: string;
  vectorField?: string;
  rerankerModel?: string;
  filters: VideoSearchFilters;
  elapsedMs?: number;
};

export type VideoSearchResponse = {
  query: string;
  mode: VideoSearchMode;
  total: number;
  results: VideoSearchResult[];
  debug: VideoSearchDebug;
};

export type VideoSearchRequest = {
  query?: string;
  mode?: VideoSearchMode;
  filters?: VideoSearchFilters;
  limit?: number;
  rerank?: boolean;
};
