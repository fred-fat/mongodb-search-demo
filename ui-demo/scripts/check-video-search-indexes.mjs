import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MongoClient } from "mongodb";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "..");
const envPath = path.join(appRoot, ".env.local");
const EMBEDDING_MODEL = "voyage-4-large";
const EMBEDDING_ENDPOINT = "https://ai.mongodb.com/v1/embeddings";
const MULTIMODAL_MODEL = "voyage-multimodal-3.5";
const MULTIMODAL_ENDPOINT = "https://ai.mongodb.com/v1/multimodalembeddings";

function loadLocalEnv() {
  if (!existsSync(envPath)) {
    return;
  }

  const content = readFileSync(envPath, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

async function createQueryEmbedding(input) {
  const response = await fetch(EMBEDDING_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: [input],
      input_type: "query",
    }),
  });

  if (!response.ok) {
    throw new Error(`Embedding request failed with status ${response.status}`);
  }

  const data = await response.json();
  const embedding = data.data?.[0]?.embedding;

  if (!Array.isArray(embedding) || embedding.length !== 1024 || !embedding.every((value) => typeof value === "number")) {
    throw new Error("Embedding response did not include a valid 1024-dimension vector.");
  }

  return embedding;
}

async function createMultimodalQueryEmbedding(input) {
  const response = await fetch(MULTIMODAL_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MULTIMODAL_MODEL,
      input_type: "query",
      inputs: [
        {
          content: [{ type: "text", text: input }],
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Multimodal embedding request failed with status ${response.status}`);
  }

  const data = await response.json();
  const embedding = data.data?.[0]?.embedding ?? data.embeddings?.[0];

  if (!Array.isArray(embedding) || embedding.length !== 1024 || !embedding.every((value) => typeof value === "number")) {
    throw new Error("Multimodal embedding response did not include a valid 1024-dimension vector.");
  }

  return embedding;
}

async function main() {
  loadLocalEnv();

  const { MONGODB_URI, MONGODB_DB, VOYAGE_API_KEY } = process.env;

  if (!MONGODB_URI || !MONGODB_DB) {
    throw new Error("Missing MONGODB_URI or MONGODB_DB. Set them in ui-demo/.env.local or the shell environment.");
  }

  if (!VOYAGE_API_KEY || VOYAGE_API_KEY.includes("<")) {
    throw new Error("Missing valid VOYAGE_API_KEY. Set it in ui-demo/.env.local or the shell environment.");
  }

  const client = new MongoClient(MONGODB_URI);
  const queryVector = await createQueryEmbedding("骑行第一视角防抖");
  const multimodalQueryVector = await createMultimodalQueryEmbedding("first person desert rally bike action camera footage");

  await client.connect();

  try {
    const collection = client.db(MONGODB_DB).collection("video_segments");
    const vectorResults = await collection
      .aggregate([
        {
          $vectorSearch: {
            index: "video_vector_index",
            path: "embedding",
            queryVector,
            numCandidates: 100,
            limit: 5,
            filter: {
              productLine: "Action Camera",
            },
          },
        },
        { $addFields: { vectorScore: { $meta: "vectorSearchScore" } } },
        {
          $project: {
            _id: 0,
            segmentId: 1,
            title: 1,
            tags: 1,
            productLine: 1,
            vectorScore: 1,
          },
        },
      ])
      .toArray();

    const textResults = await collection
      .aggregate([
        {
          $search: {
            index: "video_text_index",
            compound: {
              must: [
                {
                  text: {
                    query: "骑行 防抖",
                    path: ["title", "description", "transcript", "tags"],
                  },
                },
              ],
              filter: [
                {
                  text: {
                    query: "Action Camera",
                    path: "productLine",
                  },
                },
              ],
            },
          },
        },
        { $addFields: { searchScore: { $meta: "searchScore" } } },
        {
          $project: {
            _id: 0,
            segmentId: 1,
            title: 1,
            tags: 1,
            productLine: 1,
            searchScore: 1,
          },
        },
        { $limit: 5 },
      ])
      .toArray();

    const multimodalResults = await collection
      .aggregate([
        {
          $vectorSearch: {
            index: "video_multimodal_vector_index",
            path: "multimodalEmbedding",
            queryVector: multimodalQueryVector,
            numCandidates: 100,
            limit: 5,
            filter: {
              productLine: "Action Camera",
            },
          },
        },
        { $addFields: { multimodalScore: { $meta: "vectorSearchScore" } } },
        {
          $project: {
            _id: 0,
            segmentId: 1,
            title: 1,
            tags: 1,
            productLine: 1,
            multimodalScore: 1,
          },
        },
      ])
      .toArray();

    console.log(
      JSON.stringify({
        vectorCount: vectorResults.length,
        textCount: textResults.length,
        multimodalCount: multimodalResults.length,
        vectorTop: vectorResults[0],
        textTop: textResults[0],
        multimodalTop: multimodalResults[0],
      }),
    );
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
