import { getServerEnv } from "./env";

type EmbeddingResponse = {
  data?: Array<{
    embedding?: number[];
  }>;
  embeddings?: number[][];
};

const EMBEDDING_TIMEOUT_MS = 15_000;

export async function createQueryEmbedding(input: string) {
  const { VOYAGE_API_KEY } = getServerEnv();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EMBEDDING_TIMEOUT_MS);

  const response = await fetch("https://ai.mongodb.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${VOYAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    signal: controller.signal,
    body: JSON.stringify({
      model: "voyage-4-large",
      input: [input],
      input_type: "query",
    }),
  }).finally(() => clearTimeout(timeout));

  if (!response.ok) {
    throw new Error(`Embedding request failed with status ${response.status}`);
  }

  const data = (await response.json()) as EmbeddingResponse;
  const embedding = data.data?.[0]?.embedding;

  if (!embedding || embedding.length !== 1024 || !embedding.every((value) => typeof value === "number")) {
    throw new Error("Embedding response did not include a valid 1024-dimension vector");
  }

  return embedding;
}

export async function createMultimodalQueryEmbedding(input: string) {
  const { VOYAGE_API_KEY } = getServerEnv();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EMBEDDING_TIMEOUT_MS);

  const response = await fetch("https://ai.mongodb.com/v1/multimodalembeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${VOYAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    signal: controller.signal,
    body: JSON.stringify({
      model: "voyage-multimodal-3.5",
      input_type: "query",
      inputs: [
        {
          content: [{ type: "text", text: input }],
        },
      ],
    }),
  }).finally(() => clearTimeout(timeout));

  if (!response.ok) {
    throw new Error(`Multimodal embedding request failed with status ${response.status}`);
  }

  const data = (await response.json()) as EmbeddingResponse;
  const embedding = data.data?.[0]?.embedding ?? data.embeddings?.[0];

  if (!embedding || embedding.length !== 1024 || !embedding.every((value) => typeof value === "number")) {
    throw new Error("Multimodal embedding response did not include a valid 1024-dimension vector");
  }

  return embedding;
}
