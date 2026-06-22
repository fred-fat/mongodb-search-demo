import { getAppDb } from "@/lib/mongodb";
import type { Product } from "@/types/product";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const productProjection = {
  _id: 0,
  id: 1,
  name: 1,
  description: 1,
  category: 1,
  tags: 1,
  price: 1,
  sale_weight: 1,
  language: 1,
} satisfies Record<keyof Product | "_id", 0 | 1>;

export async function GET() {
  try {
    const db = await getAppDb();
    const products = await db
      .collection<Product>("products")
      .find({}, { projection: productProjection })
      .sort({ sale_weight: -1, id: 1 })
      .toArray();

    return Response.json({ products, total: products.length });
  } catch (error) {
    console.error("Failed to load products", error);

    return Response.json(
      { error: "Failed to load products. Check server environment and MongoDB connectivity." },
      { status: 500 },
    );
  }
}
