# Insta360 Atlas Search UI Demo

Interactive Next.js demo for showcasing MongoDB Atlas Search, Vector Search, hybrid retrieval, text embeddings, multimodal video embeddings, reranking, video segment search, and analytics against the `insta360_poc` PoC dataset.

## Requirements

- Node.js 20 or newer; 22 LTS recommended
- MongoDB Atlas connection string configured in `.env.local`
- `VOYAGE_API_KEY` configured in `.env.local` for semantic search
- Local test videos under the repository root `video-src/` for the video search scenario

## Environment

Use `.env.local.example` as the template:

```bash
MONGODB_URI="<atlas connection string>"
MONGODB_DB="insta360_poc"
VOYAGE_API_KEY="<mongodb ai / voyage api key>"
```

Do not expose these values to client-side code. `.env.local` is ignored by git.

## Commands

```bash
npm install
npm run dev
npm run build
npm run lint
```

Open `http://localhost:3000` after running `npm run dev`.

## Video Search Setup

The video search scenario is available at `http://localhost:3000/video-search-lab` and is linked from the homepage.

The same page includes a local demo upload panel. Uploaded MP4 files are saved under the ignored root directory `uploaded-video-src/`, then segmented and embedded automatically.

Search retrieval still runs against `video_segments`, but API responses are grouped by `videoId` and returned as complete video results. Each result includes `bestSegment` and `matchedSegments` so the UI can explain which time range matched and seek the full video to that segment.

Run these commands after configuring `.env.local`:

```bash
node scripts/seed-video-segments.mjs
node scripts/index-video-segments.mjs
node scripts/index-video-segments-multimodal.mjs
node scripts/create-video-search-indexes.mjs
node scripts/check-video-search-indexes.mjs
```

The setup uses these MongoDB collections:

- `videos`: video-level metadata and local source file references.
- `video_segments`: searchable segment records with transcript-like text, filters, timestamps, and embeddings.
- `search_events`: product and video analytics events. Video events use `domain: "video"`.

Required video search indexes are documented in `../docs/features/video-search/task.md`:

- `video_vector_index` on `video_segments.embedding` for Atlas Vector Search.
- `video_multimodal_vector_index` on `video_segments.multimodalEmbedding` for multimodal Atlas Vector Search.
- `video_text_index` on video segment text fields for Atlas Search.

Text semantic search uses `voyage-4-large` embeddings over segment title, description, transcript, tags, product line, language, and source type. Multimodal search uses `voyage-multimodal-3.5` embeddings generated from video-only segment clips through MongoDB AI Gateway. The seed script splits source videos into 50-second windows based on actual duration. The optional rerank toggle uses the MongoDB AI rerank endpoint with `rerank-2.5-lite` when the configured key supports it.

Upload APIs:

- `POST /api/video-upload`: accepts MP4 and metadata, saves local file, writes `videos`.
- `POST /api/video-process`: segments uploaded video and generates text/multimodal embeddings.
- `GET /api/video-processing-status?videoId=...`: returns processing status and embedding counts.

## UI Structure

- The top `智能商品搜索演示` section is a compact overview with capability chips only.
- The seven one-click scenario buttons are shown in the `Interactive Search` section, next to the actual search input and results.

## Demo Scenarios

- Semantic Vector Search: natural language waterproof diving query
- Keyword Search + Business Weight Ranking: `自拍杆`
- Autocomplete: `Fl` and `稳`
- Fuzzy Typo Tolerance: `全井相机`
- Synonym Mapping: `云台` recalls `稳定器`
- Category + Tag Filter: `配件` + `骑行`
- Zero Result Fallback: `无人机苹果手机壳`

## Notes

- The UI uses original gradient placeholders and does not copy Insta360 website image assets.
- Search and click events are written to `insta360_poc.search_events` for the operations preview panel.
- Video search and segment click events are also written to `search_events` with `domain: "video"`; multimodal searches are recorded with `mode: "multimodal"`.
- If network or embedding API access fails during a live demo, lexical search scenarios continue to work, but semantic search requires `VOYAGE_API_KEY` and access to `https://ai.mongodb.com/v1/embeddings`.
- Video reranking requires access to `https://ai.mongodb.com/v1/rerank`; if unavailable, the video API falls back to retrieval order.
- This is a demo app. Do not expose it as a public write endpoint without adding authentication or rate limiting to `/api/events`.
