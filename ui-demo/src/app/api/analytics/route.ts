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
    const [searchPv, clickCount, sessions, topQueries, zeroResultQueries] = await Promise.all([
      events.countDocuments({ type: "search" }),
      events.countDocuments({ type: "click" }),
      events.distinct("sessionId", { type: "search" }),
      events
        .aggregate<QueryBucket>([
          { $match: { type: "search", query: { $ne: "" } } },
          { $group: { _id: "$query", count: { $sum: 1 } } },
          { $sort: { count: -1, _id: 1 } },
          { $limit: 5 },
        ])
        .toArray(),
      events
        .aggregate<QueryBucket>([
          { $match: { type: "search", resultCount: 0 } },
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
      zeroResultQueries: zeroResultQueries.map((item) => ({ query: item._id, count: item.count })),
    });
  } catch (error) {
    console.error("Analytics request failed", error);

    return Response.json({ error: "Analytics request failed." }, { status: 500 });
  }
}
