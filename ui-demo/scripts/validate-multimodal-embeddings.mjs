import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(appRoot, "..");
const envPath = path.join(appRoot, ".env.local");
const videoRoot = path.join(repoRoot, "video-src");

const MODEL = "voyage-multimodal-3.5";
const ENDPOINT = "https://ai.mongodb.com/v1/multimodalembeddings";
const SAMPLE_VIDEO = "Have you ever wonder how it is to ride the rally bike from the POV. Thanks to the MX Ride Dubai for providing the rally bike. #rallyraid #dunesriding #desertracing 🎥 Denis Janezic _ Simon Marčič Racing _ Facebook.mp4";
const CLIP_SECONDS = "2";
const CLIP_SCALE_WIDTH = "160";
const CLIP_FPS = "1";

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

async function requestEmbedding(endpoint, body) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: text.slice(0, 500),
    };
  }

  const data = JSON.parse(text);
  const embedding = data.data?.[0]?.embedding ?? data.embeddings?.[0];

  return {
    ok: Array.isArray(embedding),
    status: response.status,
    dimension: Array.isArray(embedding) ? embedding.length : undefined,
    numeric: Array.isArray(embedding) ? embedding.every((value) => typeof value === "number") : false,
    nonzero: Array.isArray(embedding) ? embedding.some((value) => value !== 0) : false,
    usage: data.usage,
  };
}

async function main() {
  loadLocalEnv();

  if (!process.env.VOYAGE_API_KEY || process.env.VOYAGE_API_KEY.includes("<")) {
    throw new Error("Missing valid VOYAGE_API_KEY. Set it in ui-demo/.env.local or the shell environment.");
  }

  const sampleVideoPath = path.join(videoRoot, SAMPLE_VIDEO);

  if (!existsSync(sampleVideoPath)) {
    throw new Error(`Sample video not found: ${sampleVideoPath}`);
  }

  const tempDir = mkdtempSync(path.join(tmpdir(), "aha360-multimodal-"));
  const clipPath = path.join(tempDir, "sample-clip.mp4");

  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-ss",
      "0",
      "-t",
      CLIP_SECONDS,
      "-i",
      sampleVideoPath,
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

  const videoBase64 = readFileSync(clipPath).toString("base64");
  const videoPayload = `data:video/mp4;base64,${videoBase64}`;

  const textQueryBody = {
    model: MODEL,
    input_type: "query",
    inputs: [
      {
        content: [{ type: "text", text: "desert rally bike first person action camera footage" }],
      },
    ],
  };

  const videoOnlyBody = {
    model: MODEL,
    input_type: "document",
    inputs: [
      {
        content: [{ type: "video_base64", video_base64: videoPayload }],
      },
    ],
  };

  const invalidVideoBody = {
    model: MODEL,
    input_type: "document",
    inputs: [
      {
        content: [{ type: "video_base64", video_base64: "data:video/mp4;base64,not-a-valid-video" }],
      },
    ],
  };

  const queryResult = await requestEmbedding(ENDPOINT, textQueryBody);
  const videoOnlyResult = queryResult.ok ? await requestEmbedding(ENDPOINT, videoOnlyBody) : undefined;
  const invalidVideoResult = queryResult.ok ? await requestEmbedding(ENDPOINT, invalidVideoBody) : undefined;

  try {
    console.log(
      JSON.stringify(
        {
          model: MODEL,
          endpoint: ENDPOINT,
          sampleVideo: SAMPLE_VIDEO,
          generatedClip: {
            seconds: Number(CLIP_SECONDS),
            scaleWidth: Number(CLIP_SCALE_WIDTH),
            fps: Number(CLIP_FPS),
            bytes: readFileSync(clipPath).byteLength,
          },
          query: queryResult,
        videoOnly: videoOnlyResult,
          invalidVideo: invalidVideoResult,
        },
        null,
        2,
      ),
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
