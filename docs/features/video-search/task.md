# Video Search Task Tracker

## Objective

Add a video similarity search scenario to the existing `ui-demo` project, demonstrating MongoDB CRUD, Atlas Search, Atlas Vector Search, text embeddings, multimodal video embeddings, hybrid retrieval, reranking, pre-filtering, segment playback, and analytics.

## Feature Summary

The video search feature demonstrates MongoDB as a unified data platform for video metadata, segment-level retrieval, video-level search results, text embeddings, multimodal video embeddings, Vector Search, Atlas Search, hybrid retrieval, optional reranking, video playback with matched segment seek, uploads, and analytics.

Demo entry: `http://localhost:3000/video-search-lab`

Main implementation files:

- `ui-demo/src/components/video-search-demo.tsx`
- `ui-demo/src/app/api/video-search/route.ts`
- `ui-demo/src/app/api/video-upload/route.ts`
- `ui-demo/src/app/api/video-process/route.ts`
- `ui-demo/src/app/api/video-processing-status/route.ts`
- `ui-demo/src/app/api/video-analytics/route.ts`
- `ui-demo/src/app/api/video-files/[videoId]/route.ts`

MongoDB objects:

| Object | Name | Purpose |
|---|---|---|
| Video collection | `videos` | Video-level metadata and source URLs. |
| Segment collection | `video_segments` | Searchable segment records, timestamps, filters, and embeddings. |
| Event collection | `search_events` | Product and video analytics events; video events use `domain: "video"`. |
| Vector index | `video_vector_index` | Vector search on `video_segments.embedding`. |
| Multimodal vector index | `video_multimodal_vector_index` | Vector search on `video_segments.multimodalEmbedding`. |
| Text index | `video_text_index` | Atlas Search over segment text and metadata. |

Setup commands inside `ui-demo/`:

```bash
node scripts/seed-video-segments.mjs
node scripts/index-video-segments.mjs
node scripts/index-video-segments-multimodal.mjs
node scripts/create-video-search-indexes.mjs
node scripts/check-video-search-indexes.mjs
```

Current segmentation rule:

- `seed-video-segments.mjs` reads actual source duration with `ffprobe`.
- Each video is split into 50-second `video_segments` windows.
- Multimodal embeddings use video-only clips from each segment and do not include text metadata in the multimodal request.

## Current Status

Status: `passed`

Last updated: 2026-06-22

Next action:

1. Optional next phase: add real ASR/transcript extraction from raw videos.
2. Optional next phase: evaluate `voyage-multimodal-3.5` for direct visual/video embeddings.
3. Optional next phase: rename `/video-search-lab` to a customer-facing route if desired.
4. Update `docs/project-status.md` if any of these next phases becomes active.

## Status Legend

| Status | Meaning |
|---|---|
| pending | Not started. |
| in_progress | Work is actively underway. |
| blocked | Waiting on a decision, dependency, credential, or external system. |
| passed | Implemented and verified. |
| skipped | Intentionally deferred with a reason. |

## Subtasks

| Subtask | Scope | Status | Verification |
|---|---|---|---|
| 1 | Baseline verification | passed | Existing app passed lint and build. |
| 2 | Static lab shell | passed | `/video-search-lab` rendered without affecting homepage. |
| 3 | Mock video search API | passed | API contract validated with success and error cases. |
| 4 | Video seed script | passed | Seeded `videos=8`, `video_segments=16`. |
| 5 | Video embedding script | passed | 16 segments have valid 1024-dimensional embeddings. |
| 6 | Atlas index documentation and scripts | passed | `video_vector_index` and `video_text_index` ready and queryable. |
| 7 | DB-backed semantic video search | passed | Semantic API returns relevant MongoDB-backed segments. |
| 8 | Pre-filter UI and API support | passed | Filters verified for product line, tag, language, source type, and combined cases. |
| 9 | Keyword video search | passed | Keyword API uses `video_text_index` and respects filters. |
| 10 | Hybrid video search | passed | Vector and lexical candidates merge with score breakdown and deduplication. |
| 11 | Optional reranker | passed | Rerank works when endpoint is available and degrades gracefully. |
| 12 | Video playback and segment jump | passed | Range streaming and timestamp seek verified. |
| 13 | Video analytics | passed | Video search and click events write to `search_events`; analytics summary works. |
| 14 | Main demo navigation | passed | Homepage links to video search scenario. |
| 15 | Final documentation | passed | README and setup notes updated; final lint/build passed. |

## Required Regression Tests

Run these when video search code, scripts, or indexes change:

```bash
cd ui-demo
npm run lint
npm run build
node scripts/check-video-search-indexes.mjs
```

Manual checks:

- Open `http://localhost:3000/video-search-lab`.
- Run semantic, multimodal, keyword, and hybrid searches.
- Confirm results are complete video records with `bestSegment` and `matchedSegments` annotations.
- Toggle rerank on and off.
- Apply filters and confirm returned segments match filters.
- Click a result and confirm the video player seeks to the segment timestamp.
- Confirm video analytics updates after search and click events.

## Atlas Indexes

`video_vector_index` on `video_segments`:

```json
{
  "fields": [
    { "type": "vector", "path": "embedding", "numDimensions": 1024, "similarity": "cosine" },
    { "type": "filter", "path": "productLine" },
    { "type": "filter", "path": "tags" },
    { "type": "filter", "path": "language" },
    { "type": "filter", "path": "sourceType" },
    { "type": "filter", "path": "videoId" }
  ]
}
```

`video_text_index` on `video_segments` indexes these fields for text search:

- `title`
- `description`
- `transcript`
- `tags`
- `productLine`
- `language`
- `sourceType`
- `videoId`

`video_multimodal_vector_index` on `video_segments`:

```json
{
  "fields": [
    { "type": "vector", "path": "multimodalEmbedding", "numDimensions": 1024, "similarity": "cosine" },
    { "type": "filter", "path": "productLine" },
    { "type": "filter", "path": "tags" },
    { "type": "filter", "path": "language" },
    { "type": "filter", "path": "sourceType" },
    { "type": "filter", "path": "videoId" }
  ]
}
```

## Deferred Scope

- Raw video segmentation.
- ASR transcript extraction.
- Thumbnail generation.
- Full-video embeddings. Current implementation uses 50-second segment windows and short video-only clips for `voyage-multimodal-3.5` to preserve timestamp precision and avoid context limits.

## Historical Note

The full verbose implementation log was removed during documentation cleanup. This tracker is the current source of truth for video search status.
