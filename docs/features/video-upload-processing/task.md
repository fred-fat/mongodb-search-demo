# Video Upload Processing Task Tracker

## Objective

Add a local demo video upload flow to `/video-search-lab` so a user can upload an MP4 file, provide video metadata, automatically generate duration-based segments, generate text and multimodal embeddings, and make the uploaded video searchable through the existing video search modes.

## Feature Summary

Target local demo flow:

1. User uploads an MP4 and fills metadata: title, description, tags, product line, language, source type, and segment seconds.
2. Server saves the file under a local ignored upload directory.
3. Server writes a `videos` document with processing status.
4. Processing reads real duration with `ffprobe` and creates `video_segments` windows.
5. Processing creates `voyage-4-large` text embeddings from segment metadata.
6. Processing creates `voyage-multimodal-3.5` embeddings from video-only clips.
7. UI polls processing status and uploaded videos become searchable when ready.

## Current Status

Status: `passed`

Last updated: 2026-06-22

Next action:

1. Optional next phase: move local upload processing to a background queue for production-like behavior.
2. Optional next phase: add ASR transcript extraction during upload processing.
3. Optional next phase: replace local storage with object storage.

## Current Fix Scope

Status: `passed`

Requested changes:

- Replace hard-coded local video count in UI with live counts from MongoDB.
- Collapse upload panel into a small `上传视频` button and modal.
- Keep segment-level retrieval internally, but group matched segments by `videoId` and return complete video-level results with `bestSegment` and `matchedSegments` annotations.

Fix progress notes:

- 2026-06-22: Added `GET /api/video-library-summary` for dynamic total, seeded, uploaded, ready, segment, and multimodal-ready counts.
- 2026-06-22: Updated `/video-search-lab` top statistics to read from MongoDB instead of hard-coded `8`.
- 2026-06-22: Collapsed the upload form into a compact `上传视频` button and modal.
- 2026-06-22: Changed `/api/video-search` response shape from segment-level results to video-level results.
- 2026-06-22: Search still retrieves `video_segments` internally, then groups by `videoId` and returns complete video records with `bestSegment` and `matchedSegments`.
- 2026-06-22: Result cards now display complete videos and annotate the best matched segment/time range.
- 2026-06-22: Selecting a result plays the full video and seeks to `bestSegment.startSec`.
- 2026-06-22: Verified video library summary API returned dynamic counts.
- 2026-06-22: Verified `multimodal`, `semantic`, `keyword`, and `hybrid` return video-level results.
- 2026-06-22: Final `npm run lint`, `npm run build`, and `node scripts/check-video-search-indexes.mjs` passed.

## Status Legend

| Status | Meaning |
|---|---|
| pending | Not started. |
| in_progress | Work is actively underway. |
| blocked | Waiting on a decision, dependency, credential, API behavior, or external system. |
| passed | Implemented and verified. |
| skipped | Intentionally deferred with a reason. |

## Constraints

- Demo version only; local filesystem storage is acceptable.
- Use MongoDB AI Gateway only. Do not call official Voyage endpoints directly.
- Supported upload type: MP4 only.
- Initial max upload size: 50 MB.
- Default segment size: 50 seconds.
- Multimodal embedding input must be video-only clip content, not title/description/tags/transcript metadata.
- Existing seeded video search behavior must not regress.

## Proposed Data Changes

`videos` additions:

| Field | Purpose |
|---|---|
| `description` | User-provided video description. |
| `uploadStatus` | `uploaded`, `segmenting`, `embedding_text`, `embedding_multimodal`, `ready`, or `failed`. |
| `segmentSeconds` | Segment window size, default 50. |
| `segmentCount` | Number of generated segments. |
| `processingError` | Sanitized processing error if failed. |
| `uploadedAt` | Upload timestamp. |
| `processedAt` | Successful processing timestamp. |

`video_segments` generated fields:

- `videoId`
- `segmentId`
- `startSec`
- `endSec`
- `title`
- `description`
- `transcript`
- `tags`
- `productLine`
- `language`
- `sourceType`
- `sourceUrl`
- `sourceFileName`
- `embedding`
- `multimodalEmbedding`

## Subtasks

### 1. Baseline And Task Setup

Status: `passed`

Goal: Record the task plan and confirm current project status before edits.

Tests required:

- Read current video search and multimodal task trackers.
- Confirm upload directory should be ignored.

Exit criteria:

- This tracker exists and is referenced from project status.

Progress notes:

- 2026-06-22: Created this task tracker.
- 2026-06-22: Updated `docs/project-status.md` and `README.md` with the active feature.

### 2. Upload Storage And Processing Library

Status: `passed`

Goal: Add reusable server-side processing helpers.

Implementation scope:

- Add ignored local upload directory.
- Add `ui-demo/src/lib/video-processing.ts`.
- Save uploaded files safely.
- Read duration with `ffprobe`.
- Generate duration-based segments.
- Generate text embeddings and multimodal embeddings.
- Update video processing status throughout.

Tests required:

- TypeScript build passes.
- Processing helpers can be called from API routes.

Progress notes:

- 2026-06-22: Added `uploaded-video-src/` to `.gitignore`.
- 2026-06-22: Added `ui-demo/src/lib/video-processing.ts`.
- 2026-06-22: Implemented local MP4 saving, duration reading with `ffprobe`, duration-based segmentation, text embeddings, video-only multimodal embeddings, and status updates.
- 2026-06-22: Fixed segment upsert conflict by removing `createdAt` from `$set` payload and keeping it only in `$setOnInsert`.

### 3. Upload, Process, And Status APIs

Status: `passed`

Goal: Expose upload and processing workflow through API routes.

Implementation scope:

- Add `POST /api/video-upload`.
- Add `POST /api/video-process`.
- Add `GET /api/video-processing-status`.
- Validate MP4 type and max size.
- Return safe JSON without secrets.

Tests required:

- Upload rejects non-MP4 files.
- Upload accepts MP4 and creates `videos` document.
- Process creates segments and embeddings.
- Status endpoint returns counts.

Progress notes:

- 2026-06-22: Added `POST /api/video-upload`.
- 2026-06-22: Added `POST /api/video-process`.
- 2026-06-22: Added `GET /api/video-processing-status`.
- 2026-06-22: Verified non-MP4 upload is rejected with HTTP 400.
- 2026-06-22: Verified MP4 upload creates a `videos` record and processing reaches `ready`.

### 4. Uploaded Video Playback Support

Status: `passed`

Goal: Let existing playback endpoint stream uploaded files.

Implementation scope:

- Update `/api/video-files/[videoId]` to resolve source file from `videos.sourcePath` when available.
- Preserve existing seeded `video-src/` playback.
- Keep HTTP Range support.

Tests required:

- Existing seeded video range request still returns `206 video/mp4`.
- Uploaded video range request returns `206 video/mp4`.

Progress notes:

- 2026-06-22: Updated `/api/video-files/[videoId]` to allow both `video-src/` and `uploaded-video-src/` roots.
- 2026-06-22: Verified uploaded video range request returned `206 video/mp4`.

### 5. Upload UI And Status Polling

Status: `passed`

Goal: Add a demo upload panel to `/video-search-lab`.

Implementation scope:

- Add form fields for file, title, description, product line, language, source type, tags, and segment seconds.
- Upload file with `FormData`.
- Trigger processing.
- Poll status until `ready` or `failed`.
- Show segment and embedding progress.

Tests required:

- Manual upload flow completes for a small MP4.
- Ready uploaded video can be searched with `multimodal` mode.

Progress notes:

- 2026-06-22: Added upload panel to `/video-search-lab` with file, title, description, product line, language, source type, tags, and segment seconds.
- 2026-06-22: Added upload, processing trigger, and status polling UI.
- 2026-06-22: UI displays status, segment count, text embedding count, multimodal embedding count, and `videoId`.

### 6. Final Verification And Docs

Status: `passed`

Goal: Verify the full demo and update docs.

Tests required:

```bash
cd ui-demo
npm run lint
npm run build
node scripts/check-video-search-indexes.mjs
```

Manual checks:

- Upload one MP4 with metadata.
- Process completes to `ready`.
- Uploaded video plays through `/api/video-files/[videoId]`.
- `multimodal` search can return uploaded videos with matched segment annotations.
- Existing seeded video search still works.

Exit criteria:

- All checks pass.
- `docs/project-status.md`, `README.md`, and `ui-demo/README.md` are updated.

Progress notes:

- 2026-06-22: End-to-end upload test used `AI 跳舞.mp4`.
- 2026-06-22: Upload returned `videoId=upload-uploaded-ai-dance-demo-mqp1avfb`, `durationSec=10`, `segmentSeconds=50`.
- 2026-06-22: Processing completed with `segmentCount=1`, `readyTextEmbeddings=1`, `readyMultimodalEmbeddings=1`, `failedMultimodalEmbeddings=0`.
- 2026-06-22: Uploaded video range request returned `206 video/mp4`.
- 2026-06-22: `mode=multimodal` search with `tag=上传` returned the uploaded segment.
- 2026-06-22: `mode=semantic` search with `tag=上传` returned the uploaded segment.
- 2026-06-22: Non-MP4 upload rejection returned HTTP 400.
- 2026-06-22: Final `npm run lint` passed.
- 2026-06-22: Final `npm run build` passed.
- 2026-06-22: Final `node scripts/check-video-search-indexes.mjs` passed.

## Final Status

Status: `passed`

Last updated: 2026-06-22

Completed scope:

- Local MP4 upload.
- User-provided metadata fields for `videos` and `video_segments`.
- Automatic duration-based segmentation.
- Text embedding generation with `voyage-4-large`.
- Video-only multimodal embedding generation with `voyage-multimodal-3.5` through MongoDB AI Gateway.
- Upload processing status API and UI polling.
- Uploaded video playback through existing Range streaming API.
- Uploaded segment search through `semantic` and `multimodal` modes.
- Dynamic video library statistics.
- Compact upload modal.
- Video-level search results with matched segment annotations.

Residual risks:

- Processing is still request-driven and local-demo oriented; production should use a background queue.
- Uploaded files are stored on local disk; production should use object storage or GridFS.
- Upload limit is fixed at 50 MB for the demo.
