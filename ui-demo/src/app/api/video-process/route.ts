import { getAppDb } from "@/lib/mongodb";
import { processUploadedVideo } from "@/lib/video-processing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { videoId?: unknown };
    const videoId = typeof body.videoId === "string" ? body.videoId.trim() : "";

    if (!videoId) {
      return Response.json({ error: "Missing videoId." }, { status: 400 });
    }

    const db = await getAppDb();
    const result = await processUploadedVideo(db, videoId);

    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Video processing failed." }, { status: 500 });
  }
}
