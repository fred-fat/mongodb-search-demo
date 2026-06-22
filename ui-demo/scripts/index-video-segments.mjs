import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MongoClient } from "mongodb";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "..");
const envPath = path.join(appRoot, ".env.local");
const force = process.argv.includes("--force");
const EMBEDDING_MODEL = "voyage-4-large";
const EMBEDDING_DIMENSIONS = 1024;
const EMBEDDING_ENDPOINT = "https://ai.mongodb.com/v1/embeddings";
const BATCH_SIZE = 16;

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

function segmentEmbeddingText(segment) {
  return [
    `Title: ${segment.title}`,
    `Description: ${segment.description}`,
    segment.transcript ? `Transcript: ${segment.transcript}` : undefined,
    segment.productLine ? `Product line: ${segment.productLine}` : undefined,
    segment.language ? `Language: ${segment.language}` : undefined,
    segment.sourceType ? `Source type: ${segment.sourceType}` : undefined,
    Array.isArray(segment.tags) && segment.tags.length > 0 ? `Tags: ${segment.tags.join(", ")}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}

async function createEmbeddings(inputs) {
  const response = await fetch(EMBEDDING_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: inputs,
      input_type: "document",
    }),
  });

  if (!response.ok) {
    throw new Error(`Embedding request failed with status ${response.status}`);
  }

  const data = await response.json();
  const embeddings = data.data?.map((item) => item.embedding);

  if (!Array.isArray(embeddings) || embeddings.length !== inputs.length) {
    throw new Error("Embedding response did not match requested input count.");
  }

  for (const embedding of embeddings) {
    if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSIONS || !embedding.every((value) => typeof value === "number")) {
      throw new Error(`Embedding response did not include valid ${EMBEDDING_DIMENSIONS}-dimension vectors.`);
    }
  }

  return embeddings;
}

function chunk(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
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

  await client.connect();

  try {
    const db = client.db(MONGODB_DB);
    const segments = db.collection("video_segments");
    const query = force ? {} : { $or: [{ embedding: { $exists: false } }, { embeddingStatus: { $ne: "ready" } }] };
    const docs = await segments.find(query).sort({ videoId: 1, segmentId: 1 }).toArray();

    if (docs.length === 0) {
      console.log("No video segments require embedding updates.");
      return;
    }

    let updated = 0;

    for (const batch of chunk(docs, BATCH_SIZE)) {
      const inputs = batch.map(segmentEmbeddingText);
      const embeddings = await createEmbeddings(inputs);

      for (const [index, segment] of batch.entries()) {
        await segments.updateOne(
          { _id: segment._id },
          {
            $set: {
              embedding: embeddings[index],
              embeddingModel: EMBEDDING_MODEL,
              embeddingDimensions: EMBEDDING_DIMENSIONS,
              embeddingStatus: "ready",
              embeddingInput: inputs[index],
              embeddedAt: new Date(),
              updatedAt: new Date(),
            },
          },
        );
        updated += 1;
      }
    }

    const [readyCount, invalidDimensionCount] = await Promise.all([
      segments.countDocuments({ embeddingStatus: "ready", embedding: { $exists: true } }),
      segments.countDocuments({ embeddingStatus: "ready", embeddingDimensions: { $ne: EMBEDDING_DIMENSIONS } }),
    ]);

    console.log(`Generated embeddings for ${updated} video segments.`);
    console.log(`Current embedding status: ready=${readyCount}, invalid_dimensions=${invalidDimensionCount}`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
