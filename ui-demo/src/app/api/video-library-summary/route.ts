import { getAppDb } from "@/lib/mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const db = await getAppDb();
  const videos = db.collection("videos");
  const segments = db.collection("video_segments");

  const [totalVideos, uploadedVideos, readyVideos, segmentCount, readyMultimodalSegments] = await Promise.all([
    videos.countDocuments({}),
    videos.countDocuments({ videoId: /^upload-/ }),
    videos.countDocuments({ $or: [{ uploadStatus: "ready" }, { uploadStatus: { $exists: false } }] }),
    segments.countDocuments({}),
    segments.countDocuments({ multimodalEmbeddingStatus: "ready" }),
  ]);

  return Response.json({
    totalVideos,
    seedVideos: Math.max(0, totalVideos - uploadedVideos),
    uploadedVideos,
    readyVideos,
    segmentCount,
    readyMultimodalSegments,
  });
}
