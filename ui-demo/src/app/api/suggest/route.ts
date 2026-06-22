import { getAppDb } from "@/lib/mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Suggestion = {
  id: string;
  name: string;
  searchScore?: number;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";

  if (!query) {
    return Response.json({ query, suggestions: [] });
  }

  try {
    const db = await getAppDb();
    const suggestions = await db
      .collection("products")
      .aggregate<Suggestion>([
        {
          $search: {
            index: "default",
            autocomplete: {
              query,
              path: "name",
            },
          },
        },
        { $addFields: { searchScore: { $meta: "searchScore" } } },
        { $project: { _id: 0, id: 1, name: 1, searchScore: 1 } },
        { $limit: 5 },
      ])
      .toArray();

    return Response.json({ query, suggestions });
  } catch (error) {
    console.error("Suggestion request failed", error);

    return Response.json(
      { error: "Suggestion request failed. Check Atlas Search autocomplete configuration." },
      { status: 500 },
    );
  }
}
