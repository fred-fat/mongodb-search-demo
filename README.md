# Aha360 Atlas Search PoC

[中文说明](README.zh-CN.md)

This repository contains a MongoDB Atlas Search and Vector Search PoC for Aha360-style product discovery, plus a Next.js UI demo with product search, video segment search, and multimodal video retrieval scenarios.

## Start Here

Read these files in order when returning to the project:

1. `docs/project-status.md`: current feature status, active work, task trackers, and demo readiness.
2. `docs/project-structure.md`: repository layout, feature documentation convention, app structure, collections, and indexes.
3. `docs/architecture.md`: current product and video search architecture.
4. `ui-demo/README.md`: local app setup, commands, and video search setup.

## Current Status

| Area | Status | Tracker |
|---|---|---|
| Product Search PoC | completed | `docs/features/product-search/task.md` |
| Product Search UI Demo | completed | `docs/features/product-search/task.md` |
| Video Search Demo | completed | `docs/features/video-search/task.md` |
| Active Feature | none | `docs/project-status.md` |
| Latest Feature | completed | `docs/features/video-upload-processing/task.md` |
| Video Multimodal Search | completed | `docs/features/video-multimodal-search/task.md` |

When a new feature starts, create `docs/features/<feature-name>/task.md`, then update `docs/project-status.md`.

## Demo Scenarios

Product search demo:

- Entry: `http://localhost:3000`
- Capabilities: keyword search, semantic vector search, autocomplete, fuzzy typo tolerance, synonyms, filtering, business-weighted ranking, zero-result fallback, and analytics preview.

Video search demo:

- Entry: `http://localhost:3000/video-search-lab`
- Capabilities: video upload with metadata, automatic segmentation, text embedding, multimodal video embedding with `voyage-multimodal-3.5`, keyword search, hybrid retrieval, metadata pre-filtering, optional reranking, local video playback with timestamp jump, and analytics preview.

## Quick Start

```bash
cd ui-demo
npm install
cp .env.local.example .env.local
npm run dev
```

Configure `.env.local` with:

```bash
MONGODB_URI="<atlas connection string>"
MONGODB_DB="aha360_poc"
VOYAGE_API_KEY="<mongodb ai / voyage api key>"
```

Create both credentials from MongoDB Atlas:

- `MONGODB_URI`: In Atlas, create or select a cluster, create a database user with `readWrite` access to `aha360_poc`, allow your client IP in Network Access, then use `Connect` -> `Drivers` or `Shell` to copy the `mongodb+srv://...` connection string. Replace the username, password, and cluster host in `.env.local`; do not commit this file.
- `VOYAGE_API_KEY`: In Atlas, create a MongoDB AI / Voyage AI API key from the Atlas platform and put it in `.env.local`. This project calls MongoDB AI Gateway endpoints such as `https://ai.mongodb.com/v1/embeddings`, `https://ai.mongodb.com/v1/multimodalembeddings`, and `https://ai.mongodb.com/v1/rerank`.

Do not use the public Voyage endpoint directly for this demo; the configured key is expected to work through MongoDB Atlas / MongoDB AI Gateway.

For video search setup, run inside `ui-demo/` after environment variables are configured:

```bash
node scripts/seed-video-segments.mjs
node scripts/index-video-segments.mjs
node scripts/index-video-segments-multimodal.mjs
node scripts/create-video-search-indexes.mjs
node scripts/check-video-search-indexes.mjs
```

## Project Layout

```text
.
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
├── ui-demo/                         # Next.js interactive demo
├── video-src/                       # Local video assets for video search
├── uploaded-video-src/              # Ignored local uploaded videos
└── README.md
```

## Key Documents

| Document | Purpose |
|---|---|
| `docs/project-status.md` | Current active/completed feature status and workflow. |
| `docs/project-structure.md` | Clear project structure and documentation rules. |
| `docs/architecture.md` | Current end-to-end architecture. |
| `docs/customer-context.md` | Customer background, feasibility analysis, and requirement mapping. |
| `docs/features/product-search/task.md` | Product search feature summary, task tracker, and regression checks. |
| `docs/features/product-search/poc-guide.md` | Customer self-service guide for reproducing the product search PoC in Atlas. |
| `docs/features/video-search/task.md` | Video search feature summary, task tracker, indexes, and regression checks. |
| `docs/features/video-multimodal-search/task.md` | Multimodal video embedding and search enhancement. |
| `docs/features/video-upload-processing/task.md` | Local video upload, segmentation, embedding, and processing status workflow. |
| `ui-demo/README.md` | App setup and local development commands. |

## Feature Task Rule

Each new feature must be tracked in its own `task.md` until completion:

```text
docs/features/<feature-name>/task.md
```

The tracker should record objective, subtasks, status, required tests, actual test results, blockers, and next action. The global status table in `docs/project-status.md` must point to the active tracker.

## Before Publishing

- Do not commit `.env.local`, `.next/`, `node_modules/`, `.DS_Store`, or local agent config files.
- Use placeholders for connection strings and API keys.
- Run `npm run lint` and `npm run build` inside `ui-demo/` before pushing.
- Do not commit large generated video copies or local secrets.
