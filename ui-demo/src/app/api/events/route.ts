import { getAppDb } from "@/lib/mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EventBody = {
  type?: "search" | "click" | "impression";
  domain?: "product" | "video";
  query?: string;
  mode?: string;
  resultCount?: number;
  fallback?: boolean;
  productId?: string;
  videoId?: string;
  segmentId?: string;
  sessionId?: string;
};

function trimString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : undefined;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as EventBody;

    if (!body.type || !["search", "click", "impression"].includes(body.type)) {
      return Response.json({ error: "Invalid event type." }, { status: 400 });
    }

    const db = await getAppDb();
    const event = {
      type: body.type,
      domain: body.domain === "video" ? "video" : "product",
      query: trimString(body.query, 200) ?? "",
      mode: trimString(body.mode, 40) ?? "unknown",
      resultCount: typeof body.resultCount === "number" ? body.resultCount : undefined,
      fallback: Boolean(body.fallback),
      productId: trimString(body.productId, 80),
      videoId: trimString(body.videoId, 120),
      segmentId: trimString(body.segmentId, 120),
      sessionId: trimString(body.sessionId, 120) ?? "demo-session",
      createdAt: new Date(),
    };

    await db.collection("search_events").insertOne(event);

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Event write failed", error);

    return Response.json({ error: "Event write failed." }, { status: 500 });
  }
}
