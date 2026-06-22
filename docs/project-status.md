# Project Status

Last updated: 2026-06-22

## Purpose

This file is the first status checkpoint for the project. Read it after `README.md` to understand whether any feature is currently in progress, which task tracker owns the work, and what can be demoed safely.

## Overall Status

| Area | Status | Task Tracker | Notes |
|---|---|---|---|
| Product Search PoC | completed | `docs/features/product-search/task.md` | Atlas Search and Vector Search PoC passed all core product search scenarios. |
| Product Search UI Demo | completed | `docs/features/product-search/task.md` | Homepage product search demo is ready for local customer demos. |
| Video Search Demo | completed | `docs/features/video-search/task.md` | Video semantic, keyword, hybrid, rerank, segment playback, and analytics flows are ready. |
| Video Multimodal Search | completed | `docs/features/video-multimodal-search/task.md` | Multimodal embeddings, vector index, API mode, UI mode, analytics compatibility, and final verification completed. |
| Video Upload Processing | completed | `docs/features/video-upload-processing/task.md` | Local demo upload, metadata capture, automatic segmentation, embeddings, playback, and searchable uploaded videos completed. |

## Active Work

Current active feature: none.

Most recent completed feature: Video Upload Processing.

Task tracker: `docs/features/video-upload-processing/task.md`

Next action: optional next phase only if requested, such as background queue processing or object storage.

## Demo Readiness

| Demo | Status | Entry Point | Requirements |
|---|---|---|---|
| Product Search | ready | `http://localhost:3000` | Atlas data, `default` Search index, `vector_index`, `VOYAGE_API_KEY` for semantic mode. |
| Video Search | ready | `http://localhost:3000/video-search-lab` | Seeded/uploaded video collections, text/vector/multimodal indexes, local `video-src/` and `uploaded-video-src/` files, `VOYAGE_API_KEY`. |

## Standard Feature Workflow

Every new feature must have a feature folder and task tracker before code changes begin:

```text
docs/features/<feature-name>/
└── task.md
```

`task.md` should describe the feature and track execution/testing until the feature is complete.

## Required Task Tracker Format

Each feature `task.md` should include:

- Objective.
- Status legend.
- Current status.
- Next action.
- Subtasks.
- Required tests per subtask.
- Actual test results.
- Blockers or decisions.
- Final status and residual risks.

Use these status values consistently:

| Status | Meaning |
|---|---|
| pending | Not started. |
| in_progress | Work is actively underway. |
| blocked | Waiting on a decision, dependency, credential, or external system. |
| passed | Implemented and verified. |
| skipped | Intentionally deferred with a reason. |

## Recommended Reading Order

1. `README.md`
2. `docs/project-status.md`
3. Any `in_progress` feature tracker under `docs/features/*/task.md`
4. `docs/project-structure.md`
5. `docs/architecture.md`
6. Feature-specific `task.md` files
