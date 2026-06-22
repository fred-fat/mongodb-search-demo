import { getAppDb } from "@/lib/mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type QueryBucket = {
  _id: string;
  count: number;
};

export async function GET() {
  try {
    const db = await getAppDb();
    const events = db.collection("search_events");
    const [searchPv, clickCount, sessions, topQueries, topSegments, zeroResultQueries] = await Promise.all([
      events.countDocuments({ domain: "video", type: "search" }),
      events.countDocuments({ domain: "video", type: "click" }),
      events.distinct("sessionId", { domain: "video", type: "search" }),
      events
        .aggregate<QueryBucket>([
          { $match: { domain: "video", type: "search", query: { $ne: "" } } },
          { $group: { _id: "$query", count: { $sum: 1 } } },
          { $sort: { count: -1, _id: 1 } },
          { $limit: 5 },
        ])
        .toArray(),
      events
        .aggregate<QueryBucket>([
          { $match: { domain: "video", type: "click", segmentId: { $exists: true, $ne: "" } } },
          { $group: { _id: "$segmentId", count: { $sum: 1 } } },
          { $sort: { count: -1, _id: 1 } },
          { $limit: 5 },
        ])
        .toArray(),
      events
        .aggregate<QueryBucket>([
          { $match: { domain: "video", type: "search", resultCount: 0 } },
          { $group: { _id: "$query", count: { $sum: 1 } } },
          { $sort: { count: -1, _id: 1 } },
          { $limit: 5 },
        ])
        .toArray(),
    ]);

    return Response.json({
      searchPv,
      searchUv: sessions.length,
      clickCount,
      ctr: searchPv > 0 ? clickCount / searchPv : 0,
      topQueries: topQueries.map((item) => ({ query: item._id, count: item.count })),
      topSegments: topSegments.map((item) => ({ segmentId: item._id, count: item.count })),
      zeroResultQueries: zeroResultQueries.map((item) => ({ query: item._id, count: item.count })),
    });
  } catch (error) {
    console.error("Video analytics request failed", error);

    return Response.json({ error: "Video analytics request failed." }, { status: 500 });
  }
}
