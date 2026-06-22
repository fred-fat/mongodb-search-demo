import { getAppDb } from "@/lib/mongodb";
import {
  clampSegmentSeconds,
  createUploadVideoId,
  createUploadedVideoRecord,
  MAX_UPLOAD_BYTES,
  parseTags,
  sanitizeUploadText,
  saveUploadedVideoFile,
  type UploadSourceType,
  type UploadedVideoMetadata,
} from "@/lib/video-processing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const validSourceTypes = new Set<UploadSourceType>(["demo", "tutorial", "product", "ugc"]);

function readFormString(formData: FormData, key: string, maxLength: number) {
  return sanitizeUploadText(formData.get(key), maxLength);
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return Response.json({ error: "Missing video file." }, { status: 400 });
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return Response.json({ error: "Video file exceeds the 50 MB demo limit." }, { status: 400 });
    }

    if (file.type !== "video/mp4" && !file.name.toLowerCase().endsWith(".mp4")) {
      return Response.json({ error: "Only MP4 video files are supported." }, { status: 400 });
    }

    const sourceTypeInput = readFormString(formData, "sourceType", 40) as UploadSourceType;
    const metadata: UploadedVideoMetadata = {
      title: readFormString(formData, "title", 120) || file.name.replace(/\.mp4$/i, ""),
      description: readFormString(formData, "description", 800),
      productLine: readFormString(formData, "productLine", 80) || "Uploaded",
      language: readFormString(formData, "language", 20) || "zh",
      sourceType: validSourceTypes.has(sourceTypeInput) ? sourceTypeInput : "ugc",
      tags: parseTags(formData.get("tags")),
      segmentSeconds: clampSegmentSeconds(formData.get("segmentSeconds")),
    };

    if (!metadata.description) {
      return Response.json({ error: "Description is required." }, { status: 400 });
    }

    if (metadata.tags.length === 0) {
      return Response.json({ error: "At least one tag is required." }, { status: 400 });
    }

    const videoId = createUploadVideoId(metadata.title);
    const fileInfo = await saveUploadedVideoFile(file, videoId);
    const db = await getAppDb();
    const { durationSec } = await createUploadedVideoRecord(db, metadata, fileInfo, videoId);

    return Response.json({ videoId, status: "uploaded", durationSec, segmentSeconds: metadata.segmentSeconds });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Video upload failed." }, { status: 500 });
  }
}
