import Link from "next/link";

import { SearchDemo } from "@/components/search-demo";
import { getAppDb } from "@/lib/mongodb";
import type { Product } from "@/types/product";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const capabilityCards = [
  "Atlas Search",
  "Vector Search",
  "Autocomplete",
  "Synonyms",
  "Fuzzy Match",
  "Business Ranking",
  "Video Search",
  "Rerank",
];

async function getProducts() {
  const db = await getAppDb();

  return db
    .collection<Product>("products")
    .find(
      {},
      {
        projection: {
          _id: 0,
          id: 1,
          name: 1,
          description: 1,
          category: 1,
          tags: 1,
          price: 1,
          sale_weight: 1,
          language: 1,
        },
      },
    )
    .sort({ sale_weight: -1, id: 1 })
    .toArray();
}

export default async function Home() {
  const products = await getProducts();

  return (
    <main className="min-h-screen bg-[#f5f5f2] text-zinc-950">
      <section className="bg-black px-4 py-2 text-center text-xs font-medium text-white sm:text-sm">
        MongoDB Atlas Search + Vector Search 智能商品搜索 Demo | 基于已通过的 Insta360 PoC 数据
      </section>

      <section id="demo" className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <div className="rounded-[1.5rem] border border-black/10 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                Atlas Search + Vector Search Demo
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                智能商品搜索演示
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
                用 MongoDB 统一数据平台演示商品 CRUD 数据、全文检索、向量检索、混合检索、Embedding、Rerank、视频片段检索和运营分析。下方商品搜索区可直接交互。
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs sm:w-[22rem]">
              <div className="rounded-2xl bg-zinc-50 px-3 py-2">
                <p className="text-lg font-semibold">20</p>
                <p className="text-zinc-500">商品</p>
              </div>
              <div className="rounded-2xl bg-zinc-50 px-3 py-2">
                <p className="text-lg font-semibold">7</p>
                <p className="text-zinc-500">场景</p>
              </div>
              <div className="rounded-2xl bg-emerald-50 px-3 py-2 text-emerald-800">
                <p className="text-lg font-semibold">1024</p>
                <p>向量维度</p>
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {capabilityCards.map((capability) => (
              <span key={capability} className="rounded-full bg-black px-3 py-1.5 text-xs font-semibold text-white">
                {capability}
              </span>
            ))}
            <Link
              href="/data-indexes"
              className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900 hover:border-black"
            >
              查看数据与索引配置说明
            </Link>
            <Link
              href="/video-search-lab"
              className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-900 hover:border-violet-500"
            >
              打开视频搜索场景
            </Link>
          </div>
        </div>
      </section>

      <SearchDemo initialProducts={products} />
    </main>
  );
}
