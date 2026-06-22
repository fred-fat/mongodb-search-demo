import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MongoClient } from "mongodb";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "..");
const envPath = path.join(appRoot, ".env.local");

const indexDefinitions = [
  {
    name: "video_vector_index",
    type: "vectorSearch",
    definition: {
      fields: [
        {
          type: "vector",
          path: "embedding",
          numDimensions: 1024,
          similarity: "cosine",
        },
        { type: "filter", path: "productLine" },
        { type: "filter", path: "tags" },
        { type: "filter", path: "language" },
        { type: "filter", path: "sourceType" },
        { type: "filter", path: "videoId" },
      ],
    },
  },
  {
    name: "video_text_index",
    definition: {
      mappings: {
        dynamic: false,
        fields: {
          title: { type: "string" },
          description: { type: "string" },
          transcript: { type: "string" },
          tags: { type: "string" },
          productLine: { type: "string" },
          language: { type: "string" },
          sourceType: { type: "string" },
          videoId: { type: "string" },
        },
      },
    },
  },
  {
    name: "video_multimodal_vector_index",
    type: "vectorSearch",
    definition: {
      fields: [
        {
          type: "vector",
          path: "multimodalEmbedding",
          numDimensions: 1024,
          similarity: "cosine",
        },
        { type: "filter", path: "productLine" },
        { type: "filter", path: "tags" },
        { type: "filter", path: "language" },
        { type: "filter", path: "sourceType" },
        { type: "filter", path: "videoId" },
      ],
    },
  },
];

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

async function main() {
  loadLocalEnv();

  const { MONGODB_URI, MONGODB_DB } = process.env;

  if (!MONGODB_URI || !MONGODB_DB) {
    throw new Error("Missing MONGODB_URI or MONGODB_DB. Set them in ui-demo/.env.local or the shell environment.");
  }

  const client = new MongoClient(MONGODB_URI);

  await client.connect();

  try {
    const collection = client.db(MONGODB_DB).collection("video_segments");
    const existingIndexes = await collection.listSearchIndexes().toArray();
    const existingNames = new Set(existingIndexes.map((index) => index.name));

    for (const index of indexDefinitions) {
      if (existingNames.has(index.name)) {
        await collection.updateSearchIndex(index.name, index.definition);
        console.log(`Updated search index: ${index.name}`);
      } else {
        await collection.createSearchIndex(index);
        console.log(`Created search index: ${index.name}`);
      }
    }

    const indexes = await collection.listSearchIndexes().toArray();
    const videoIndexes = indexes
      .filter((index) => index.name === "video_vector_index" || index.name === "video_text_index" || index.name === "video_multimodal_vector_index")
      .map((index) => ({ name: index.name, status: index.status ?? index.queryable ?? "unknown" }));

    console.log(JSON.stringify({ indexes: videoIndexes }));
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
