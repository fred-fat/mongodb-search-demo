"use client";

import { useEffect, useState, useTransition } from "react";

import type { Product } from "@/types/product";
import type { SearchMode, SearchResponse, SearchResult } from "@/types/search";

type DemoMode = SearchMode | "suggest";

const demoQueries = [
  { label: "自拍杆业务权重", query: "自拍杆", mode: "keyword" },
  { label: "稳定器自动补全", query: "St", mode: "suggest" },
  { label: "云台同义词", query: "云台", mode: "synonyms" },
  { label: "全井相机纠错", query: "全井相机", mode: "fuzzy" },
  { label: "潜水防水装备", query: "我想潜水去水下拍鱼，或者冲浪用，需要能防水防雾的装备", mode: "semantic" },
  { label: "骑行配件筛选", query: "骑行", mode: "filter", category: "配件", tags: ["骑行"] },
  { label: "无结果兜底", query: "无人机苹果手机壳", mode: "fallback" },
] satisfies Array<{ label: string; query: string; mode: DemoMode; category?: string; tags?: string[] }>;

const searchModes = [
  { label: "关键词", mode: "keyword", hint: "商品名 / 描述全文检索 + 业务权重排序" },
  { label: "语义搜索", mode: "semantic", hint: "自然语言需求转向量后执行 Vector Search" },
  { label: "模糊纠错", mode: "fuzzy", hint: "适合错别字，例如 全井相机" },
  { label: "同义词", mode: "synonyms", hint: "适合业务词扩展，例如 云台召回稳定器" },
  { label: "零结果兜底", mode: "fallback", hint: "首轮严格匹配无结果后返回热销推荐" },
] satisfies Array<{ label: string; mode: SearchMode; hint: string }>;

function formatPrice(price: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 0,
  }).format(price);
}

function formatScore(score?: number) {
  return typeof score === "number" ? score.toFixed(3) : "-";
}

function toInitialResult(product: Product): SearchResult {
  return {
    ...product,
    matchReason: ["初始商品列表", "业务权重排序"],
  };
}

type SearchDemoProps = {
  initialProducts: Product[];
};

type Suggestion = {
  id: string;
  name: string;
  searchScore?: number;
};

type AnalyticsSummary = {
  searchPv: number;
  searchUv: number;
  clickCount: number;
  ctr: number;
  topQueries: Array<{ query: string; count: number }>;
  zeroResultQueries: Array<{ query: string; count: number }>;
};

export function SearchDemo({ initialProducts }: SearchDemoProps) {
  const [query, setQuery] = useState("自拍杆");
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const [selectedTag, setSelectedTag] = useState<string | undefined>();
  const [selectedMode, setSelectedMode] = useState<SearchMode>("keyword");
  const [showDebug, setShowDebug] = useState(true);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [sessionId] = useState(() => crypto.randomUUID());
  const [isPending, startTransition] = useTransition();

  const results = response?.results ?? initialProducts.map(toInitialResult);
  const categories = Array.from(new Set(initialProducts.map((product) => product.category)));
  const tags = Array.from(new Set(initialProducts.flatMap((product) => product.tags))).slice(0, 10);
  const selectedModeHint = searchModes.find((mode) => mode.mode === selectedMode)?.hint;

  useEffect(() => {
    async function loadAnalytics() {
      try {
        const res = await fetch("/api/analytics");
        const data = (await res.json()) as AnalyticsSummary;

        if (res.ok) {
          setAnalytics(data);
        }
      } catch (analyticsError) {
        console.error("Analytics request failed", analyticsError);
      }
    }

    void loadAnalytics();
  }, []);

  useEffect(() => {
    const trimmedQuery = query.trim();

    if (trimmedQuery.length < 1) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/suggest?q=${encodeURIComponent(trimmedQuery)}`, {
          signal: controller.signal,
        });
        const data = (await res.json()) as { suggestions?: Suggestion[] };

        if (res.ok) {
          setSuggestions(data.suggestions ?? []);
        }
      } catch (suggestError) {
        if (!controller.signal.aborted) {
          console.error("Suggestion request failed", suggestError);
        }
      }
    }, 180);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query]);

  function runSearch(
    nextQuery = query,
    mode: SearchMode = selectedMode,
    filters: { category?: string; tags?: string[] } = { category: selectedCategory, tags: selectedTag ? [selectedTag] : [] },
  ) {
    const trimmedQuery = nextQuery.trim();

    startTransition(async () => {
      setError(null);
      setQuery(nextQuery);
      setSelectedCategory(filters.category);
      setSelectedTag(filters.tags?.[0]);

      try {
        const res = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: trimmedQuery, mode, category: filters.category, tags: filters.tags, limit: 8 }),
        });
        const data = (await res.json()) as SearchResponse | { error?: string };

        if (!res.ok) {
          throw new Error("error" in data && data.error ? data.error : "Search request failed");
        }

        const searchResponse = data as SearchResponse;
        setResponse(searchResponse);
        void fetch("/api/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "search",
            query: searchResponse.query,
            mode: searchResponse.mode,
            resultCount: searchResponse.fallback ? 0 : searchResponse.total,
            fallback: searchResponse.fallback,
            sessionId,
          }),
        }).then(() => fetch("/api/analytics"))
          .then((analyticsResponse) => analyticsResponse.json())
          .then((summary: AnalyticsSummary) => setAnalytics(summary))
          .catch((eventError) => console.error("Event tracking failed", eventError));
      } catch (searchError) {
        setError(searchError instanceof Error ? searchError.message : "Search request failed");
      }
    });
  }

  return (
    <section id="products" className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
      <div className="mb-6 rounded-[2rem] border border-black/10 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-emerald-700">Interactive Search</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">消费级产品智能搜索</h2>
            <p className="mt-2 text-sm text-zinc-600">
              已接入关键词、语义、纠错、同义词、过滤和零结果兜底，搜索后会展示召回能力、排序得分和调试信息。
            </p>
          </div>
          <div className="relative flex w-full flex-col gap-2 sm:flex-row lg:max-w-xl">
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                if (!event.target.value.trim()) {
                  setSuggestions([]);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  runSearch(query, selectedMode);
                }
              }}
              className="min-h-12 flex-1 rounded-full border border-black/10 bg-zinc-50 px-5 text-sm outline-none focus:border-black"
              placeholder="输入关键词，例如：自拍杆"
            />
            {suggestions.length > 0 ? (
              <div className="absolute left-0 right-0 top-14 z-20 overflow-hidden rounded-3xl border border-black/10 bg-white shadow-2xl sm:right-32">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion.id}
                    onClick={() => runSearch(suggestion.name, selectedMode)}
                    className="flex w-full items-center justify-between px-5 py-3 text-left text-sm hover:bg-zinc-50"
                  >
                    <span className="font-semibold">{suggestion.name}</span>
                    <span className="text-xs text-zinc-500">{formatScore(suggestion.searchScore)}</span>
                  </button>
                ))}
              </div>
            ) : null}
            <button
              onClick={() => runSearch(query, selectedMode)}
              disabled={isPending}
              className="min-h-12 rounded-full bg-black px-6 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-400"
            >
              {isPending ? "搜索中..." : "搜索"}
            </button>
          </div>
        </div>

        <div className="mt-5 rounded-3xl border border-black/10 bg-zinc-50 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold">搜索模式</p>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                先选择模式，再在搜索框输入内容；Enter 和“搜索”按钮会按当前模式执行对应后端路由。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {searchModes.map((mode) => (
                <button
                  key={mode.mode}
                  onClick={() => setSelectedMode(mode.mode)}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold ${
                    selectedMode === mode.mode ? "border-black bg-black text-white" : "border-black/10 bg-white text-zinc-800 hover:border-black"
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-3 rounded-2xl bg-white px-4 py-3 text-sm leading-6 text-zinc-600">
            当前模式：<span className="font-semibold text-zinc-950">{selectedMode}</span>
            {selectedModeHint ? ` / ${selectedModeHint}` : null}
          </p>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {demoQueries.map((demo) => (
            <button
              key={demo.label}
              onClick={() => {
                if (demo.mode === "suggest") {
                  setQuery(demo.query);
                  setResponse(null);
                  setSelectedCategory(undefined);
                  setSelectedTag(undefined);
                  return;
                }

                if (demo.mode !== "filter") {
                  setSelectedMode(demo.mode);
                }
                runSearch(demo.query, demo.mode, { category: demo.category, tags: demo.tags });
              }}
              className="rounded-full border border-black/10 bg-zinc-50 px-4 py-2 text-sm font-semibold hover:border-black"
            >
              {demo.label}
            </button>
          ))}
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_0.9fr]">
          <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-950">
            <p className="font-semibold">本次查询能力</p>
            <p className="mt-2">
              {response ? response.capabilities.join(" / ") : "初始列表：MongoDB Query / Business Field Sorting"}
            </p>
            {response?.fallback ? (
              <p className="mt-2 font-semibold text-amber-700">没有找到完全匹配商品，已展示基于热销权重的兜底推荐。</p>
            ) : null}
            {error ? <p className="mt-2 text-red-700">{error}</p> : null}
          </div>
          <div className="rounded-2xl bg-zinc-950 p-4 text-emerald-200">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-semibold text-white">Search Debug Panel</p>
              <button
                onClick={() => setShowDebug((value) => !value)}
                className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white hover:bg-white/20"
              >
                {showDebug ? "收起" : "展开"}
              </button>
            </div>
            {showDebug ? (
              <div className="mt-4 space-y-3 font-mono text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <span>mode: {response?.mode ?? "initial"}</span>
                  <span>index: {response?.debug.index ?? "products collection"}</span>
                  <span>pipeline: {response?.debug.pipelineName ?? "defaultProductList"}</span>
                  <span>elapsedMs: {response?.debug.elapsedMs ?? 0}</span>
                  <span>fallback: {String(response?.fallback ?? false)}</span>
                  <span>total: {response?.total ?? results.length}</span>
                </div>
                <div className="break-all rounded-xl bg-black/40 p-3 text-emerald-100">
                  filters: {JSON.stringify(response?.debug.filters ?? { category: selectedCategory, tags: selectedTag ? [selectedTag] : [] })}
                </div>
                <div className="break-all rounded-xl bg-black/40 p-3 text-emerald-100">
                  topScores: {JSON.stringify(results.slice(0, 3).map((product) => ({
                    id: product.id,
                    searchScore: product.searchScore,
                    vectorSearchScore: product.vectorSearchScore,
                    weightedScore: product.weightedScore,
                  })))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-semibold text-emerald-700">Consumer Products</p>
          <h3 className="mt-2 text-2xl font-semibold tracking-tight">搜索结果</h3>
          <p className="mt-2 text-sm text-zinc-600">结果卡片展示命中原因和排序得分，便于客户理解 Atlas 查询能力。</p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => runSearch("", "filter", { category, tags: selectedTag ? [selectedTag] : [] })}
              className={`rounded-full border px-4 py-2 font-medium ${selectedCategory === category ? "border-black bg-black text-white" : "border-black/10 bg-white"}`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-6 rounded-3xl border border-black/10 bg-white p-4">
        <p className="mb-3 text-sm font-semibold">热门标签筛选预览</p>
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <button
              key={tag}
              onClick={() => runSearch("", "filter", { category: selectedCategory, tags: [tag] })}
              className={`rounded-full px-3 py-1 text-xs font-medium ${selectedTag === tag ? "bg-black text-white" : "bg-zinc-100 text-zinc-700"}`}
            >
              #{tag}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {results.map((product, index) => (
          <article
            key={product.id}
            onClick={() => {
              void fetch("/api/events", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type: "click", query: response?.query ?? query, mode: response?.mode ?? "initial", productId: product.id, sessionId }),
              }).catch((clickError) => console.error("Click tracking failed", clickError));
            }}
            className="group cursor-pointer overflow-hidden rounded-[1.75rem] border border-black/10 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
          >
            <div className="relative flex aspect-[4/3] items-end overflow-hidden bg-[radial-gradient(circle_at_30%_20%,#d9f99d,transparent_28%),linear-gradient(135deg,#18181b,#71717a)] p-5 text-white">
              <span className="absolute right-4 top-4 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur">
                Top {index + 1}
              </span>
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-white/70">{product.category}</p>
                <h3 className="mt-2 line-clamp-2 text-xl font-semibold tracking-tight">{product.name}</h3>
              </div>
            </div>
            <div className="p-5">
              <p className="line-clamp-3 min-h-16 text-sm leading-6 text-zinc-600">{product.description}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {product.matchReason.map((reason) => (
                  <span key={reason} className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    {reason}
                  </span>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-2xl bg-zinc-50 p-2">
                  <p className="text-zinc-500">search</p>
                  <p className="font-semibold">{formatScore(product.searchScore ?? product.vectorSearchScore)}</p>
                </div>
                <div className="rounded-2xl bg-zinc-50 p-2">
                  <p className="text-zinc-500">weight</p>
                  <p className="font-semibold">{product.sale_weight}</p>
                </div>
                <div className="rounded-2xl bg-emerald-50 p-2 text-emerald-800">
                  <p>weighted</p>
                  <p className="font-semibold">{formatScore(product.weightedScore)}</p>
                </div>
              </div>
              <div className="mt-5 flex items-end justify-between border-t border-black/10 pt-4">
                <div>
                  <p className="text-xs text-zinc-500">Demo Price</p>
                  <p className="text-lg font-semibold">{formatPrice(product.price)}</p>
                </div>
                <div className="rounded-2xl bg-zinc-100 px-3 py-2 text-right text-xs font-semibold text-zinc-700">
                  {product.id}<br />{product.language}
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>

      <section className="mt-8 rounded-[2rem] border border-black/10 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-semibold text-emerald-700">Search Operations Preview</p>
            <h3 className="mt-2 text-2xl font-semibold tracking-tight">搜索运营分析预览</h3>
            <p className="mt-2 text-sm text-zinc-600">搜索与点击事件写入 MongoDB `search_events` 集合，以下指标由聚合接口实时读取。</p>
          </div>
          <span className="rounded-full bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-700">Real MongoDB Events</span>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          <div className="rounded-2xl bg-zinc-50 p-4">
            <p className="text-xs text-zinc-500">Search PV</p>
            <p className="mt-2 text-2xl font-semibold">{analytics?.searchPv ?? 0}</p>
          </div>
          <div className="rounded-2xl bg-zinc-50 p-4">
            <p className="text-xs text-zinc-500">Search UV</p>
            <p className="mt-2 text-2xl font-semibold">{analytics?.searchUv ?? 0}</p>
          </div>
          <div className="rounded-2xl bg-zinc-50 p-4">
            <p className="text-xs text-zinc-500">Clicks</p>
            <p className="mt-2 text-2xl font-semibold">{analytics?.clickCount ?? 0}</p>
          </div>
          <div className="rounded-2xl bg-emerald-50 p-4 text-emerald-800">
            <p className="text-xs">CTR</p>
            <p className="mt-2 text-2xl font-semibold">{(((analytics?.ctr ?? 0) * 100)).toFixed(1)}%</p>
          </div>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-black/10 p-4">
            <p className="text-sm font-semibold">热门搜索词</p>
            <div className="mt-3 space-y-2 text-sm text-zinc-600">
              {(analytics?.topQueries.length ? analytics.topQueries : [{ query: "暂无搜索事件", count: 0 }]).map((item) => (
                <div key={item.query} className="flex justify-between gap-3"><span className="min-w-0 break-all">{item.query}</span><span>{item.count}</span></div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-black/10 p-4">
            <p className="text-sm font-semibold">零结果搜索词</p>
            <div className="mt-3 space-y-2 text-sm text-zinc-600">
              {(analytics?.zeroResultQueries.length ? analytics.zeroResultQueries : [{ query: "暂无零结果事件", count: 0 }]).map((item) => (
                <div key={item.query} className="flex justify-between gap-3"><span className="min-w-0 break-all">{item.query}</span><span>{item.count}</span></div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </section>
  );
}
