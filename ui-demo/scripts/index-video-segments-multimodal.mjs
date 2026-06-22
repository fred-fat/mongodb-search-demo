import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MongoClient } from "mongodb";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(appRoot, "..");
const envPath = path.join(appRoot, ".env.local");
const videoSourceDir = path.join(repoRoot, "video-src");

const force = process.argv.includes("--force");
const MODEL = "voyage-multimodal-3.5";
const ENDPOINT = "https://ai.mongodb.com/v1/multimodalembeddings";
const DIMENSIONS = 1024;
const CLIP_SECONDS = 2;
const CLIP_SCALE_WIDTH = 160;
const CLIP_FPS = 1;

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
    const value = rawValue.replace(/^["']|["']$/g, "");

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function readDurationSec(filePath) {
  try {
    const output = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", filePath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const duration = Number.parseFloat(output.trim());

    return Number.isFinite(duration) ? duration : 0;
  } catch {
    return 0;
  }
}

function createSegmentClip(segment, tempDir) {
  if (!segment.sourceFileName) {
    throw new Error("Missing sourceFileName");
  }

  const sourcePath = path.join(videoSourceDir, segment.sourceFileName);

  if (!existsSync(sourcePath)) {
    throw new Error(`Missing source video: ${segment.sourceFileName}`);
  }

  const clipPath = path.join(tempDir, `${segment.segmentId}.mp4`);
  const requestedStartSec = Math.max(0, Number(segment.startSec) || 0);
  const segmentDuration = Math.max(1, (Number(segment.endSec) || requestedStartSec + CLIP_SECONDS) - requestedStartSec);
  const clipDuration = Math.min(CLIP_SECONDS, segmentDuration);
  const sourceDuration = readDurationSec(sourcePath);
  const startSec = sourceDuration > clipDuration ? Math.min(requestedStartSec, sourceDuration - clipDuration) : 0;

  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-ss",
      String(startSec),
      "-t",
      String(clipDuration),
      "-i",
      sourcePath,
      "-vf",
      `scale=${CLIP_SCALE_WIDTH}:-2,fps=${CLIP_FPS}`,
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "32",
      clipPath,
    ],
    { stdio: "ignore" },
  );

  return {
    clipPath,
    startSec,
    requestedStartSec,
    durationSec: clipDuration,
  };
}

async function createMultimodalEmbedding(segment, clipPath) {
  const videoBase64 = readFileSync(clipPath).toString("base64");
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      input_type: "document",
      inputs: [
        {
          content: [{ type: "video_base64", video_base64: `data:video/mp4;base64,${videoBase64}` }],
        },
      ],
    }),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`);
  }

  const data = JSON.parse(text);
  const embedding = data.data?.[0]?.embedding ?? data.embeddings?.[0];

  if (!Array.isArray(embedding) || embedding.length !== DIMENSIONS || !embedding.every((value) => typeof value === "number") || !embedding.some((value) => value !== 0)) {
    throw new Error(`Invalid ${DIMENSIONS}-dimension multimodal embedding response`);
  }

  return {
    embedding,
    usage: data.usage,
  };
}

function sanitizeError(error) {
  return (error instanceof Error ? error.message : String(error)).replace(process.env.VOYAGE_API_KEY ?? "", "<redacted>").slice(0, 1000);
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

  if (!existsSync(videoSourceDir)) {
    throw new Error(`Missing video source directory: ${videoSourceDir}`);
  }

  const client = new MongoClient(MONGODB_URI);
  await client.connect();

  const tempDir = mkdtempSync(path.join(tmpdir(), "aha360-multimodal-index-"));

  try {
    const segments = client.db(MONGODB_DB).collection("video_segments");
    const query = force
      ? {}
      : {
          $or: [{ multimodalEmbedding: { $exists: false } }, { multimodalEmbeddingStatus: { $ne: "ready" } }],
        };
    const docs = await segments.find(query).sort({ videoId: 1, segmentId: 1 }).toArray();

    if (docs.length === 0) {
      console.log("No video segments require multimodal embedding updates.");
      return;
    }

    let ready = 0;
    let failed = 0;

    for (const segment of docs) {
      try {
        const clip = createSegmentClip(segment, tempDir);
        const { embedding, usage } = await createMultimodalEmbedding(segment, clip.clipPath);

        await segments.updateOne(
          { _id: segment._id },
          {
            $set: {
              multimodalEmbedding: embedding,
              multimodalEmbeddingModel: MODEL,
              multimodalEmbeddingDimensions: DIMENSIONS,
              multimodalEmbeddingStatus: "ready",
              multimodalEmbeddingSource: "video_clip",
              multimodalEmbeddingEndpoint: ENDPOINT,
              multimodalEmbeddingUsage: usage,
              multimodalClip: {
                requestedStartSec: clip.requestedStartSec,
                startSec: clip.startSec,
                durationSec: clip.durationSec,
                scaleWidth: CLIP_SCALE_WIDTH,
                fps: CLIP_FPS,
              },
              multimodalEmbeddedAt: new Date(),
              updatedAt: new Date(),
            },
            $unset: { multimodalEmbeddingError: "", multimodalEmbeddingInput: "" },
          },
        );
        ready += 1;
        console.log(`multimodal_ready segmentId=${segment.segmentId}`);
      } catch (error) {
        failed += 1;
        await segments.updateOne(
          { _id: segment._id },
          {
            $set: {
              multimodalEmbeddingStatus: "failed",
              multimodalEmbeddingModel: MODEL,
              multimodalEmbeddingSource: "video_clip",
              multimodalEmbeddingError: sanitizeError(error),
              updatedAt: new Date(),
            },
          },
        );
        console.warn(`multimodal_failed segmentId=${segment.segmentId}`);
      }
    }

    const [total, readyCount, failedCount, invalidDimensionCount] = await Promise.all([
      segments.countDocuments({}),
      segments.countDocuments({ multimodalEmbeddingStatus: "ready", multimodalEmbedding: { $exists: true } }),
      segments.countDocuments({ multimodalEmbeddingStatus: "failed" }),
      segments.countDocuments({ multimodalEmbeddingStatus: "ready", multimodalEmbeddingDimensions: { $ne: DIMENSIONS } }),
    ]);

    console.log(
      JSON.stringify({
        processed: docs.length,
        ready,
        failed,
        total,
        readyCount,
        failedCount,
        invalidDimensionCount,
        model: MODEL,
        dimensions: DIMENSIONS,
        source: "video_clip",
      }),
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
    await client.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? sanitizeError(error) : error);
  process.exit(1);
});
