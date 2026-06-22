import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { Db } from "mongodb";

import { getServerEnv } from "./env";

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
export const DEFAULT_SEGMENT_SECONDS = 50;

const MIN_TRAILING_SECONDS = 2;
const TEXT_EMBEDDING_MODEL = "voyage-4-large";
const TEXT_EMBEDDING_ENDPOINT = "https://ai.mongodb.com/v1/embeddings";
const MULTIMODAL_MODEL = "voyage-multimodal-3.5";
const MULTIMODAL_ENDPOINT = "https://ai.mongodb.com/v1/multimodalembeddings";
const EMBEDDING_DIMENSIONS = 1024;
const CLIP_SECONDS = 2;
const CLIP_SCALE_WIDTH = 160;
const CLIP_FPS = 1;

export type UploadSourceType = "demo" | "tutorial" | "product" | "ugc";

export type UploadedVideoMetadata = {
  title: string;
  description: string;
  productLine: string;
  language: string;
  sourceType: UploadSourceType;
  tags: string[];
  segmentSeconds: number;
};

type VideoSegmentDocument = UploadedVideoMetadata & {
  videoId: string;
  segmentId: string;
  startSec: number;
  endSec: number;
  transcript: string;
  sourceUrl: string;
  sourceFileName: string;
  thumbnailUrl: string;
  createdAt?: Date;
  updatedAt: Date;
};

export function getUploadedVideoDir() {
  return path.resolve(process.cwd(), "..", "uploaded-video-src");
}

export function sanitizeUploadText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function parseTags(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeUploadText(item, 40)).filter(Boolean).slice(0, 12);
  }

  return sanitizeUploadText(value, 400)
    .split(/[,，\n]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 12);
}

export function clampSegmentSeconds(value: unknown) {
  const parsed = typeof value === "string" || typeof value === "number" ? Number(value) : DEFAULT_SEGMENT_SECONDS;

  if (!Number.isFinite(parsed)) {
    return DEFAULT_SEGMENT_SECONDS;
  }

  return Math.max(10, Math.min(300, Math.floor(parsed)));
}

export function createUploadVideoId(title: string) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  return `upload-${slug || "video"}-${Date.now().toString(36)}`;
}

export async function saveUploadedVideoFile(file: File, videoId: string) {
  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`Video file must be between 1 byte and ${MAX_UPLOAD_BYTES} bytes.`);
  }

  if (file.type !== "video/mp4" && !file.name.toLowerCase().endsWith(".mp4")) {
    throw new Error("Only MP4 video files are supported.");
  }

  const uploadDir = getUploadedVideoDir();
  mkdirSync(uploadDir, { recursive: true });

  const sourceFileName = `${videoId}.mp4`;
  const sourcePath = path.join(uploadDir, sourceFileName);
  const bytes = Buffer.from(await file.arrayBuffer());
  writeFileSync(sourcePath, bytes);

  return { sourceFileName, sourcePath, size: bytes.byteLength };
}

export function readVideoDurationSec(filePath: string) {
  const output = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", filePath], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const duration = Number.parseFloat(output.trim());

  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("Unable to read a valid video duration.");
  }

  return Math.ceil(duration);
}

function formatTimeLabel(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const rest = safeSeconds % 60;

  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function generateSegments(metadata: UploadedVideoMetadata, videoId: string, sourceFileName: string, durationSec: number) {
  const segments: VideoSegmentDocument[] = [];
  let startSec = 0;
  const now = new Date();

  while (startSec < durationSec) {
    let endSec = Math.min(startSec + metadata.segmentSeconds, durationSec);
    const remaining = durationSec - endSec;

    if (remaining > 0 && remaining < MIN_TRAILING_SECONDS) {
      endSec = durationSec;
    }

    const index = segments.length + 1;
    const paddedIndex = String(index).padStart(3, "0");

    segments.push({
      ...metadata,
      videoId,
      segmentId: `${videoId}-${paddedIndex}`,
      startSec,
      endSec,
      title: `${metadata.title} ${formatTimeLabel(startSec)}-${formatTimeLabel(endSec)}`,
      description: metadata.description,
      transcript: "",
      sourceUrl: `/api/video-files/${videoId}`,
      sourceFileName,
      thumbnailUrl: `/video-thumbnails/${videoId}-${paddedIndex}.jpg`,
      updatedAt: now,
    });

    startSec = endSec;
  }

  return segments;
}

function segmentEmbeddingText(segment: VideoSegmentDocument) {
  return [
    `Title: ${segment.title}`,
    `Description: ${segment.description}`,
    segment.transcript ? `Transcript: ${segment.transcript}` : undefined,
    segment.productLine ? `Product line: ${segment.productLine}` : undefined,
    segment.language ? `Language: ${segment.language}` : undefined,
    segment.sourceType ? `Source type: ${segment.sourceType}` : undefined,
    segment.tags.length > 0 ? `Tags: ${segment.tags.join(", ")}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}

async function createTextEmbeddings(inputs: string[]) {
  const { VOYAGE_API_KEY } = getServerEnv();
  const response = await fetch(TEXT_EMBEDDING_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${VOYAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: TEXT_EMBEDDING_MODEL, input: inputs, input_type: "document" }),
  });

  if (!response.ok) {
    throw new Error(`Text embedding request failed with status ${response.status}`);
  }

  const data = await response.json();
  const embeddings = data.data?.map((item: { embedding?: number[] }) => item.embedding);

  if (!Array.isArray(embeddings) || embeddings.length !== inputs.length) {
    throw new Error("Text embedding response count mismatch.");
  }

  for (const embedding of embeddings) {
    if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSIONS || !embedding.every((value) => typeof value === "number")) {
      throw new Error("Invalid text embedding response.");
    }
  }

  return embeddings as number[][];
}

function createSegmentClip(sourcePath: string, segment: VideoSegmentDocument, tempDir: string) {
  const clipPath = path.join(tempDir, `${segment.segmentId}.mp4`);
  const segmentDuration = Math.max(1, segment.endSec - segment.startSec);
  const clipDuration = Math.min(CLIP_SECONDS, segmentDuration);
  const startSec = segment.startSec;

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

  return { clipPath, durationSec: clipDuration };
}

async function createMultimodalEmbedding(clipPath: string) {
  const { VOYAGE_API_KEY } = getServerEnv();
  const videoBase64 = readFileSync(clipPath).toString("base64");
  const response = await fetch(MULTIMODAL_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${VOYAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MULTIMODAL_MODEL,
      input_type: "document",
      inputs: [{ content: [{ type: "video_base64", video_base64: `data:video/mp4;base64,${videoBase64}` }] }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Multimodal embedding request failed with status ${response.status}`);
  }

  const data = await response.json();
  const embedding = data.data?.[0]?.embedding ?? data.embeddings?.[0];

  if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSIONS || !embedding.every((value) => typeof value === "number")) {
    throw new Error("Invalid multimodal embedding response.");
  }

  return { embedding: embedding as number[], usage: data.usage };
}

function sanitizeError(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).replace(getServerEnv().VOYAGE_API_KEY, "<redacted>").slice(0, 1000);
}

export async function createUploadedVideoRecord(db: Db, metadata: UploadedVideoMetadata, fileInfo: { sourceFileName: string; sourcePath: string; size: number }, videoId: string) {
  const durationSec = readVideoDurationSec(fileInfo.sourcePath);
  const now = new Date();

  await db.collection("videos").updateOne(
    { videoId },
    {
      $set: {
        videoId,
        title: metadata.title,
        description: metadata.description,
        sourceUrl: `/api/video-files/${videoId}`,
        sourceFileName: fileInfo.sourceFileName,
        sourcePath: fileInfo.sourcePath,
        durationSec,
        productLine: metadata.productLine,
        language: metadata.language,
        sourceType: metadata.sourceType,
        tags: metadata.tags,
        uploadStatus: "uploaded",
        segmentSeconds: metadata.segmentSeconds,
        segmentCount: 0,
        fileSize: fileInfo.size,
        uploadedAt: now,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
      $unset: { processingError: "", processedAt: "" },
    },
    { upsert: true },
  );

  return { durationSec };
}

export async function processUploadedVideo(db: Db, videoId: string) {
  const videos = db.collection("videos");
  const segmentsCollection = db.collection("video_segments");
  const video = await videos.findOne({ videoId });

  if (!video?.sourcePath || !video.sourceFileName) {
    throw new Error("Uploaded video source not found.");
  }

  try {
    await videos.updateOne({ videoId }, { $set: { uploadStatus: "segmenting", updatedAt: new Date() }, $unset: { processingError: "" } });

    const metadata: UploadedVideoMetadata = {
      title: video.title,
      description: video.description ?? "",
      productLine: video.productLine ?? "Uploaded",
      language: video.language ?? "zh",
      sourceType: video.sourceType ?? "ugc",
      tags: Array.isArray(video.tags) ? video.tags : [],
      segmentSeconds: video.segmentSeconds ?? DEFAULT_SEGMENT_SECONDS,
    };
    const durationSec = readVideoDurationSec(video.sourcePath);
    const segments = generateSegments(metadata, videoId, video.sourceFileName, durationSec);
    const expectedSegmentIds = segments.map((segment) => segment.segmentId);

    await segmentsCollection.deleteMany({ videoId, segmentId: { $nin: expectedSegmentIds } });

    for (const segment of segments) {
      await segmentsCollection.updateOne(
        { segmentId: segment.segmentId },
        { $set: segment, $setOnInsert: { createdAt: new Date() } },
        { upsert: true },
      );
    }

    await videos.updateOne({ videoId }, { $set: { uploadStatus: "embedding_text", segmentCount: segments.length, durationSec, updatedAt: new Date() } });

    const textInputs = segments.map(segmentEmbeddingText);
    const textEmbeddings = await createTextEmbeddings(textInputs);

    for (const [index, segment] of segments.entries()) {
      await segmentsCollection.updateOne(
        { segmentId: segment.segmentId },
        {
          $set: {
            embedding: textEmbeddings[index],
            embeddingModel: TEXT_EMBEDDING_MODEL,
            embeddingDimensions: EMBEDDING_DIMENSIONS,
            embeddingStatus: "ready",
            embeddingInput: textInputs[index],
            embeddedAt: new Date(),
            updatedAt: new Date(),
          },
        },
      );
    }

    await videos.updateOne({ videoId }, { $set: { uploadStatus: "embedding_multimodal", updatedAt: new Date() } });

    const tempDir = mkdtempSync(path.join(tmpdir(), "insta360-upload-process-"));

    try {
      for (const segment of segments) {
        const clip = createSegmentClip(video.sourcePath, segment, tempDir);
        const { embedding, usage } = await createMultimodalEmbedding(clip.clipPath);

        await segmentsCollection.updateOne(
          { segmentId: segment.segmentId },
          {
            $set: {
              multimodalEmbedding: embedding,
              multimodalEmbeddingModel: MULTIMODAL_MODEL,
              multimodalEmbeddingDimensions: EMBEDDING_DIMENSIONS,
              multimodalEmbeddingStatus: "ready",
              multimodalEmbeddingSource: "video_clip",
              multimodalEmbeddingEndpoint: MULTIMODAL_ENDPOINT,
              multimodalEmbeddingUsage: usage,
              multimodalClip: {
                requestedStartSec: segment.startSec,
                startSec: segment.startSec,
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
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }

    await videos.updateOne({ videoId }, { $set: { uploadStatus: "ready", processedAt: new Date(), updatedAt: new Date() }, $unset: { processingError: "" } });

    return { videoId, status: "ready", segmentCount: segments.length };
  } catch (error) {
    await videos.updateOne({ videoId }, { $set: { uploadStatus: "failed", processingError: sanitizeError(error), updatedAt: new Date() } });
    throw error;
  }
}

export async function getVideoProcessingStatus(db: Db, videoId: string) {
  const video = await db.collection("videos").findOne({ videoId }, { projection: { _id: 0 } });

  if (!video) {
    return undefined;
  }

  const segments = db.collection("video_segments");
  const [segmentCount, readyTextEmbeddings, readyMultimodalEmbeddings, failedMultimodalEmbeddings] = await Promise.all([
    segments.countDocuments({ videoId }),
    segments.countDocuments({ videoId, embeddingStatus: "ready" }),
    segments.countDocuments({ videoId, multimodalEmbeddingStatus: "ready" }),
    segments.countDocuments({ videoId, multimodalEmbeddingStatus: "failed" }),
  ]);

  return {
    videoId,
    status: video.uploadStatus ?? "unknown",
    title: video.title,
    durationSec: video.durationSec,
    segmentCount,
    readyTextEmbeddings,
    readyMultimodalEmbeddings,
    failedMultimodalEmbeddings,
    processingError: video.processingError,
  };
}
