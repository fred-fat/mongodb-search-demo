# Architecture

## Scope

This project demonstrates two connected search scenarios on MongoDB Atlas:

- Product discovery with Atlas Search and Atlas Vector Search.
- Video segment search with text search, vector search, hybrid retrieval, optional reranking, playback, and analytics.

## End-to-End Architecture

```mermaid
flowchart LR
  subgraph Browser[Browser]
    U1[Product Search UI]
    U2[Video Search Lab UI]
  end

  subgraph Next[Next.js UI Demo]
    A1[GET /]
    A2[POST /api/search]
    A3[GET /api/suggest]
    A4[POST /api/video-search]
    A5["GET /api/video-files/[videoId]"]
    A6[POST /api/events]
    A7[GET /api/analytics]
    A8[GET /api/video-analytics]
    A9[Embedding Modules]
    A10[Video Rerank Module]
  end

  subgraph Atlas[MongoDB Atlas]
    B1[(products)]
    B2[(synonyms_collection)]
    B3[(videos)]
    B4[(video_segments)]
    B5[(search_events)]
    S1[[Search index: default]]
    S2[[Vector index: vector_index]]
    S3[[Search index: video_text_index]]
    S4[[Vector index: video_vector_index]]
    S5[[Vector index: video_multimodal_vector_index]]
  end

  subgraph AI[MongoDB AI / Voyage]
    C1[Embeddings API<br/>voyage-4-large]
    C2[Multimodal Embeddings API<br/>voyage-multimodal-3.5]
    C3[Rerank API<br/>rerank-2.5-lite]
  end

  subgraph Local[Local Assets]
    D1[video-src/]
  end

  U1 --> A1
  U1 --> A2
  U1 --> A3
  U1 --> A6
  U1 --> A7

  U2 --> A4
  U2 --> A5
  U2 --> A6
  U2 --> A8

  A2 --> A9
  A4 --> A9
  A4 --> A10
  A9 --> C1
  A9 --> C2
  A10 --> C3

  A2 --> S1
  A2 --> S2
  A3 --> S1
  A4 --> S3
  A4 --> S4
  A4 --> S5

  S1 --> B1
  S2 --> B1
  B2 --> S1
  S3 --> B4
  S4 --> B4
  S5 --> B4
  B3 --> B4

  A5 --> D1
  A6 --> B5
  A7 --> B5
  A8 --> B5
```

## Product Search Flow

```mermaid
sequenceDiagram
  participant UI as Product UI
  participant API as /api/search
  participant EMB as Embedding Module
  participant AI as MongoDB AI Embeddings
  participant AS as Atlas Search default
  participant VS as Atlas Vector Search vector_index
  participant DB as products
  participant EVT as search_events

  UI->>API: POST query, mode, filters
  alt semantic
    API->>EMB: create query embedding
    EMB->>AI: voyage-4-large query embedding
    AI-->>EMB: query vector
    EMB-->>API: query vector
    API->>VS: $vectorSearch description_embedding
    VS-->>API: vector results
  else keyword, fuzzy, synonyms, filter
    API->>AS: $search text/autocomplete/compound
    AS-->>API: search results
    API->>API: weightedScore = searchScore * sale_weight
  else fallback
    API->>AS: strict no-result query
    AS-->>API: first pass results
    API->>DB: top sale_weight fallback when empty
  end
  API-->>UI: results and debug metadata
  UI->>EVT: search/click events
```

## Video Search Flow

```mermaid
sequenceDiagram
  participant UI as Video UI
  participant API as /api/video-search
  participant EMB as Embedding Module
  participant AI as MongoDB AI Embeddings
  participant TXT as Atlas Search video_text_index
  participant VEC as Atlas Vector Search video_vector_index
  participant MVEC as Atlas Vector Search video_multimodal_vector_index
  participant RR as Rerank Module
  participant RAI as MongoDB AI Rerank
  participant EVT as search_events

  UI->>API: POST query, mode, filters, rerank
  alt semantic
    API->>EMB: create query embedding
    EMB->>AI: voyage-4-large query embedding
    AI-->>EMB: query vector
    API->>VEC: $vectorSearch with optional filter
    VEC-->>API: segment candidates
  else keyword
    API->>TXT: $search compound with optional filter
    TXT-->>API: segment candidates
  else multimodal
    API->>EMB: create multimodal query embedding
    EMB->>AI: voyage-multimodal-3.5 text query embedding
    AI-->>EMB: query vector
    API->>MVEC: $vectorSearch multimodalEmbedding with optional filter
    MVEC-->>API: visual/multimodal segment candidates
  else hybrid
    API->>VEC: vector candidates
    API->>TXT: lexical candidates
    API->>API: merge, deduplicate, and compute combined score
  end
  opt rerank enabled
    API->>RR: top candidates
    RR->>RAI: rerank-2.5-lite
    RAI-->>RR: rerank scores
    RR-->>API: reordered candidates or graceful fallback
  end
  API-->>UI: segment results and debug metadata
  UI->>EVT: video search/click events with domain=video
```

## Data Model Summary

| Collection | Key Fields | Notes |
|---|---|---|
| `products` | `id`, `name`, `description`, `category`, `tags`, `sale_weight`, `description_embedding` | One product document powers text search, vector search, filters, and business ranking. |
| `synonyms_collection` | `mappingType`, `synonyms` | Source collection for product synonym mapping. |
| `videos` | `videoId`, `title`, `sourceUrl`, `durationSec`, `tags` | Video-level metadata. |
| `video_segments` | `videoId`, `segmentId`, `startSec`, `endSec`, `title`, `description`, `transcript`, `tags`, `embedding`, `multimodalEmbedding` | Segment-level retrieval unit for precise timestamp search. |
| `search_events` | `type`, `domain`, `query`, `productId`, `videoId`, `segmentId`, `createdAt` | Shared analytics event collection for product and video search. |

## AI Services

| Service | Endpoint | Usage |
|---|---|---|
| Embeddings | `https://ai.mongodb.com/v1/embeddings` | Product and video query/document embeddings with `voyage-4-large`. |
| Multimodal Embeddings | `https://ai.mongodb.com/v1/multimodalembeddings` | Video segment clip embeddings and multimodal query embeddings with `voyage-multimodal-3.5`. |
| Rerank | `https://ai.mongodb.com/v1/rerank` | Optional video candidate reranking with `rerank-2.5-lite`. |

## Security Notes

- `MONGODB_URI` and `VOYAGE_API_KEY` must stay in `.env.local` or shell environment variables.
- The browser should never receive raw embeddings, connection strings, or API keys.
- `/api/events` and video analytics are suitable for local or controlled demos; add authentication and rate limiting before public deployment.
