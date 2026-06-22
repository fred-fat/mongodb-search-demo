import { getAppDb } from "@/lib/mongodb";
import { getVideoProcessingStatus } from "@/lib/video-processing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const videoId = url.searchParams.get("videoId")?.trim();

  if (!videoId) {
    return Response.json({ error: "Missing videoId." }, { status: 400 });
  }

  const db = await getAppDb();
  const status = await getVideoProcessingStatus(db, videoId);

  if (!status) {
    return Response.json({ error: "Video not found." }, { status: 404 });
  }

  return Response.json(status);
}
