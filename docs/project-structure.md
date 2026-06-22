# Project Structure

## Repository Layout

```text
.
├── README.md
├── docs/
│   ├── project-status.md
│   ├── project-structure.md
│   ├── architecture.md
│   ├── customer-context.md
│   └── features/
│       ├── product-search/
│       │   ├── task.md
│       │   └── poc-guide.md
│       ├── video-search/
│       │   └── task.md
│       ├── video-multimodal-search/
│       │   └── task.md
│       └── video-upload-processing/
│           └── task.md
├── ui-demo/
│   ├── src/
│   ├── scripts/
│   └── README.md
├── video-src/
└── uploaded-video-src/
```

## Documentation Roles

| Path | Role |
|---|---|
| `README.md` | Project entry point and recommended reading order. |
| `docs/project-status.md` | Current project status, active feature, demo readiness, and task workflow. |
| `docs/project-structure.md` | This file; explains repository organization. |
| `docs/architecture.md` | Current product and video search architecture. |
| `docs/customer-context.md` | Customer background, pain points, Atlas feasibility analysis, and requirement mapping. |
| `docs/features/*/task.md` | Feature summary, task tracker, and test status. |
| `ui-demo/README.md` | Next.js app setup, commands, and local development notes. |

## Feature Documentation Convention

Every feature should have:

```text
docs/features/<feature-name>/
└── task.md
```

Use `task.md` for stable feature explanation, current implementation status, subtask progress, test results, blockers, and next actions.

When a feature becomes active, also update `docs/project-status.md`.

## Application Layout

```text
ui-demo/
├── src/
│   ├── app/
│   │   ├── page.tsx
│   │   ├── video-search-lab/
│   │   │   └── page.tsx
│   │   └── api/
│   │       ├── search/
│   │       ├── suggest/
│   │       ├── events/
│   │       ├── analytics/
│   │       ├── video-search/
│   │       ├── video-analytics/
│   │       └── video-files/[videoId]/
│   ├── components/
│   │   ├── search-demo.tsx
│   │   └── video-search-demo.tsx
│   ├── lib/
│   │   ├── mongodb.ts
│   │   ├── embeddings.ts
│   │   ├── video-search.ts
│   │   └── video-rerank.ts
│   └── types/
├── scripts/
│   ├── seed-video-segments.mjs
│   ├── index-video-segments.mjs
│   ├── create-video-search-indexes.mjs
│   └── check-video-search-indexes.mjs
└── README.md
```

## Runtime Data

| Collection | Domain | Purpose |
|---|---|---|
| `products` | Product search | Product records, business fields, and `description_embedding`. |
| `synonyms_collection` | Product search | Synonym mapping source for Atlas Search. |
| `videos` | Video search | Video-level metadata and source URL. |
| `video_segments` | Video search | Searchable segment records, timestamps, metadata filters, and embeddings. |
| `search_events` | Product and video search | Search and click events used for operations previews. |

## Atlas Indexes

| Index | Collection | Purpose |
|---|---|---|
| `default` | `products` | Product text search, autocomplete, fuzzy search, synonyms, and filters. |
| `vector_index` | `products` | Product semantic vector search on `description_embedding`. |
| `video_text_index` | `video_segments` | Video segment keyword search. |
| `video_vector_index` | `video_segments` | Video segment semantic vector search and pre-filtering. |
| `video_multimodal_vector_index` | `video_segments` | Video segment multimodal vector search on `multimodalEmbedding`. |

## Local Assets

`video-src/` contains seeded local test videos used by the video search scenario.

`uploaded-video-src/` contains local demo uploads and is ignored by git.

The app streams both through `GET /api/video-files/[videoId]` with HTTP Range support, so large video files do not need to be copied into `ui-demo/public/`.

## Markdown Cleanup Policy

Root-level Markdown should stay limited to `README.md`.

Place durable project documents under `docs/`.

Place feature-specific documents under `docs/features/<feature-name>/`.

Do not add new root-level task or summary files. Use the feature `task.md` tracker instead.
