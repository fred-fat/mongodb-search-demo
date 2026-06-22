import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

import { getAppDb } from "@/lib/mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type VideoDocument = {
  videoId: string;
  sourcePath?: string;
};

function parseRange(range: string | null, fileSize: number) {
  if (!range) {
    return undefined;
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range);

  if (!match) {
    return undefined;
  }

  const start = match[1] ? Number.parseInt(match[1], 10) : 0;
  const end = match[2] ? Number.parseInt(match[2], 10) : fileSize - 1;

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || end >= fileSize) {
    return undefined;
  }

  return { start, end };
}

function isAllowedVideoPath(sourcePath: string) {
  const allowedRoots = [path.resolve(process.cwd(), "..", "video-src"), path.resolve(process.cwd(), "..", "uploaded-video-src")];

  return allowedRoots.some((root) => sourcePath === root || sourcePath.startsWith(`${root}${path.sep}`));
}

export async function GET(request: Request, context: { params: Promise<{ videoId: string }> }) {
  const { videoId } = await context.params;
  const db = await getAppDb();
  const video = await db.collection<VideoDocument>("videos").findOne({ videoId }, { projection: { _id: 0, videoId: 1, sourcePath: 1 } });

  if (!video?.sourcePath) {
    return Response.json({ error: "Video not found." }, { status: 404 });
  }

  const sourcePath = path.resolve(video.sourcePath);

  if (!isAllowedVideoPath(sourcePath) || !existsSync(sourcePath)) {
    return Response.json({ error: "Video source unavailable." }, { status: 404 });
  }

  const fileSize = statSync(sourcePath).size;
  const range = parseRange(request.headers.get("range"), fileSize);

  if (range) {
    const stream = createReadStream(sourcePath, { start: range.start, end: range.end });

    return new Response(Readable.toWeb(stream) as BodyInit, {
      status: 206,
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Length": String(range.end - range.start + 1),
        "Content-Range": `bytes ${range.start}-${range.end}/${fileSize}`,
        "Content-Type": "video/mp4",
      },
    });
  }

  const stream = createReadStream(sourcePath);

  return new Response(Readable.toWeb(stream) as BodyInit, {
    headers: {
      "Accept-Ranges": "bytes",
      "Content-Length": String(fileSize),
      "Content-Type": "video/mp4",
    },
  });
}
