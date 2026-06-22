import type { VideoSearchFilters } from "@/types/video";

export function buildVideoVectorFilter(filters: VideoSearchFilters) {
  const clauses = [
    ...(filters.productLine ? [{ productLine: filters.productLine }] : []),
    ...(filters.tag ? [{ tags: filters.tag }] : []),
    ...(filters.language ? [{ language: filters.language }] : []),
    ...(filters.sourceType ? [{ sourceType: filters.sourceType }] : []),
  ];

  if (clauses.length === 0) {
    return undefined;
  }

  if (clauses.length === 1) {
    return clauses[0];
  }

  return { $and: clauses };
}

export function videoSegmentProjection() {
  return {
    _id: 0,
    videoId: 1,
    segmentId: 1,
    title: 1,
    description: 1,
    transcript: 1,
    tags: 1,
    productLine: 1,
    language: 1,
    sourceType: 1,
    sourceUrl: 1,
    thumbnailUrl: 1,
    startSec: 1,
    endSec: 1,
    vectorScore: 1,
    multimodalScore: 1,
    searchScore: 1,
  };
}

export function buildVideoTextFilters(filters: VideoSearchFilters) {
  return [
    ...(filters.productLine
      ? [
          {
            text: {
              query: filters.productLine,
              path: "productLine",
            },
          },
        ]
      : []),
    ...(filters.tag
      ? [
          {
            text: {
              query: filters.tag,
              path: "tags",
            },
          },
        ]
      : []),
    ...(filters.language
      ? [
          {
            text: {
              query: filters.language,
              path: "language",
            },
          },
        ]
      : []),
    ...(filters.sourceType
      ? [
          {
            text: {
              query: filters.sourceType,
              path: "sourceType",
            },
          },
        ]
      : []),
  ];
}
