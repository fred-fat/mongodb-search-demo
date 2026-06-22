import Link from "next/link";

const schemaExample = `{
  id: "p1",
  name: "Insta360 X5 旗舰全景相机",
  description: "旗舰级 8K 全景运动相机，适合旅行、滑雪、骑行...",
  category: "相机",
  tags: ["全景", "8K", "运动相机", "防抖", "骑行", "旅行"],
  price: 3499,
  sale_weight: 1.45,
  language: "zh-CN",
  description_embedding: [1024 维向量]
}`;

const searchIndexConfigs = [
  {
    config: "analyzer: lucene.chinese",
    purpose: "对中文商品名和描述做分词，支持中文相关性检索。",
    scenarios: "自拍杆业务权重、全井相机纠错、云台同义词",
  },
  {
    config: "dynamic: false",
    purpose: "只索引显式配置字段，避免无关字段进入搜索索引。",
    scenarios: "控制 Demo 搜索范围，保证 7 个场景结果可解释",
  },
  {
    config: "name: string",
    purpose: "让商品名称支持全文检索和 Lucene 相关性评分。",
    scenarios: "自拍杆业务权重、全井相机纠错",
  },
  {
    config: "name: autocomplete + edgeGram",
    purpose: "按商品名前缀生成补全 token，用户输入早期即可返回建议。",
    scenarios: "Flow 自动补全",
  },
  {
    config: "description: string",
    purpose: "让商品描述参与全文检索，补充商品名称之外的召回信息。",
    scenarios: "自拍杆业务权重、云台同义词、无结果首轮查询",
  },
  {
    config: "category: token",
    purpose: "把分类作为精确值过滤，不做全文分词匹配。",
    scenarios: "骑行配件筛选",
  },
  {
    config: "tags: token",
    purpose: "把标签作为精确值过滤，支持多标签筛选。",
    scenarios: "骑行配件筛选",
  },
  {
    config: "synonyms: insta360_synonyms",
    purpose: "从 synonyms_collection 读取同义词，例如 云台 <=> 稳定器。",
    scenarios: "云台同义词",
  },
];

const vectorIndexConfigs = [
  {
    config: "source field: description",
    purpose: "用商品描述生成 embedding，表达商品适用场景和功能语义。",
    requirement: "用户不知道准确商品名时，可以用自然语言描述需求。",
  },
  {
    config: "embedding field: description_embedding",
    purpose: "把 1024 维商品描述向量写回同一条商品文档。",
    requirement: "同一份商品数据同时支持结构化查询、全文检索和语义检索。",
  },
  {
    config: "model: voyage-4-large",
    purpose: "为商品描述和用户查询生成同一向量空间下的 embedding。",
    requirement: "支撑 AI 语义理解和需求型搜索。",
  },
  {
    config: "vector_index.path: description_embedding",
    purpose: "指定 Atlas Vector Search 检索的向量字段。",
    requirement: "潜水防水装备语义搜索。",
  },
  {
    config: "numDimensions: 1024",
    purpose: "与 voyage-4-large 实际输出维度一致，避免查询维度不匹配。",
    requirement: "保证 Vector Search 可稳定执行。",
  },
  {
    config: "similarity: cosine",
    purpose: "用余弦相似度比较用户需求向量和商品描述向量的语义接近程度。",
    requirement: "潜水、防水、防雾、冲浪等语义相关商品召回。",
  },
];

const searchEventExample = `{
  type: "search",
  query: "自拍杆",
  mode: "keyword_weighted",
  resultCount: 7,
  fallback: false,
  sessionId: "browser-session-id",
  createdAt: ISODate("2026-05-19T...")
}`;

const clickEventExample = `{
  type: "click",
  query: "自拍杆",
  mode: "keyword_weighted",
  productId: "p6",
  sessionId: "browser-session-id",
  createdAt: ISODate("2026-05-19T...")
}`;

const analyticsMetrics = [
  {
    metric: "Search PV",
    logic: 'countDocuments({ type: "search" })',
    meaning: "统计搜索次数。",
  },
  {
    metric: "Search UV",
    logic: 'distinct("sessionId", { type: "search" })',
    meaning: "按浏览会话粗略统计搜索用户数。",
  },
  {
    metric: "Clicks",
    logic: 'countDocuments({ type: "click" })',
    meaning: "统计商品卡片点击次数。",
  },
  {
    metric: "CTR",
    logic: "clickCount / searchPv",
    meaning: "用点击数除以搜索次数，得到 Demo 级点击率。",
  },
  {
    metric: "热门搜索词",
    logic: "$match search -> $group by query -> $sort count desc -> $limit 5",
    meaning: "找出被搜索最多的 query。",
  },
  {
    metric: "零结果搜索词",
    logic: "$match search + resultCount: 0 -> $group by query -> $limit 5",
    meaning: "找出首轮无结果的 query，用于后续补词、同义词和商品优化。",
  },
];

export default function DataIndexesPage() {
  return (
    <main className="min-h-screen bg-[#f5f5f2] text-zinc-950">
      <section className="bg-black px-4 py-2 text-center text-xs font-medium text-white sm:text-sm">
        MongoDB Atlas Search + Vector Search 数据与索引配置说明
      </section>

      <section className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <div className="rounded-[2rem] border border-black/10 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-emerald-700">Data & Index Setup</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">数据格式、全文索引与向量索引说明</h1>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-600">
                Demo 使用同一份 `products` 商品文档承载结构化字段、全文搜索字段和语义向量字段。下方说明每个索引配置为什么存在，以及它对应支撑哪个 UI 场景按钮。
              </p>
            </div>
            <Link
              href="/"
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-black/10 bg-zinc-50 px-5 text-sm font-semibold hover:border-black"
            >
              返回搜索 Demo
            </Link>
          </div>

          <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full bg-zinc-100 px-3 py-1.5 text-zinc-700">products: 20 docs</span>
            <span className="rounded-full bg-zinc-100 px-3 py-1.5 text-zinc-700">search_events: behavior logs</span>
            <span className="rounded-full bg-zinc-100 px-3 py-1.5 text-zinc-700">default Search index</span>
            <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-700">vector_index: 1024 dims</span>
          </div>

          <div className="mt-6 space-y-5">
            <div className="rounded-3xl bg-zinc-950 p-5 text-white">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Schema Example</p>
                  <h2 className="mt-2 text-xl font-semibold">一条商品记录说明 Schema</h2>
                </div>
                <span className="w-fit rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">MongoDB Document</span>
              </div>
              <pre className="mt-4 overflow-x-auto rounded-2xl bg-black/40 p-4 text-xs leading-6 text-emerald-100">
                <code>{schemaExample}</code>
              </pre>
              <p className="mt-4 text-sm leading-6 text-zinc-300">
                `name` 和 `description` 负责关键词搜索，`category` 和 `tags` 负责结构化过滤，`sale_weight` 参与业务排序，`description_embedding` 负责语义向量检索。
              </p>
            </div>

            <div className="rounded-3xl border border-black/10 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Atlas Search Index</p>
              <h2 className="mt-2 text-xl font-semibold">全文索引 `default` 配置作用</h2>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[44rem] border-separate border-spacing-0 text-left text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-[0.12em] text-zinc-500">
                      <th className="border-b border-black/10 py-3 pr-4 font-semibold">配置</th>
                      <th className="border-b border-black/10 px-4 py-3 font-semibold">作用</th>
                      <th className="border-b border-black/10 py-3 pl-4 font-semibold">对应场景需求</th>
                    </tr>
                  </thead>
                  <tbody>
                    {searchIndexConfigs.map((item) => (
                      <tr key={item.config} className="align-top">
                        <td className="border-b border-black/5 py-3 pr-4 font-mono text-xs text-zinc-900">{item.config}</td>
                        <td className="border-b border-black/5 px-4 py-3 leading-6 text-zinc-600">{item.purpose}</td>
                        <td className="border-b border-black/5 py-3 pl-4 leading-6 text-zinc-700">{item.scenarios}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-3xl border border-emerald-100 bg-emerald-50/60 p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Atlas Vector Search</p>
                  <h2 className="mt-2 text-xl font-semibold">向量字段与 `vector_index` 配置作用</h2>
                </div>
                <span className="w-fit rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700">对应：潜水防水装备语义搜索</span>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {vectorIndexConfigs.map((item) => (
                  <div key={item.config} className="rounded-2xl bg-white p-4 shadow-sm">
                    <p className="font-mono text-xs font-semibold text-emerald-700">{item.config}</p>
                    <p className="mt-2 text-sm leading-6 text-zinc-700">{item.purpose}</p>
                    <p className="mt-3 rounded-2xl bg-zinc-50 px-3 py-2 text-xs leading-5 text-zinc-500">{item.requirement}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-black/10 bg-white p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Search Operations Preview</p>
                  <h2 className="mt-2 text-xl font-semibold">搜索运营分析预览实现</h2>
                </div>
                <span className="w-fit rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-700">collection: search_events</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-zinc-600">
                当前 Demo 创建并使用 `search_events` 集合保存行为日志。搜索成功后写入 `type = search` 事件，商品卡片点击时写入 `type = click` 事件；页面底部的运营指标由 `/api/analytics` 从该集合实时聚合得出。
              </p>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl bg-zinc-950 p-4 text-white">
                  <p className="text-sm font-semibold text-emerald-300">搜索事件写入</p>
                  <pre className="mt-3 overflow-x-auto rounded-xl bg-black/40 p-3 text-xs leading-6 text-emerald-100">
                    <code>{searchEventExample}</code>
                  </pre>
                  <p className="mt-3 text-xs leading-5 text-zinc-300">
                    `/api/search` 返回后，前端调用 `POST /api/events` 写入搜索词、搜索模式、结果数、是否兜底和 sessionId。
                  </p>
                </div>
                <div className="rounded-2xl bg-zinc-950 p-4 text-white">
                  <p className="text-sm font-semibold text-emerald-300">点击事件写入</p>
                  <pre className="mt-3 overflow-x-auto rounded-xl bg-black/40 p-3 text-xs leading-6 text-emerald-100">
                    <code>{clickEventExample}</code>
                  </pre>
                  <p className="mt-3 text-xs leading-5 text-zinc-300">
                    用户点击商品卡片时，前端调用 `POST /api/events` 写入当前 query、mode、productId 和 sessionId。
                  </p>
                </div>
              </div>

              <div className="mt-5 overflow-x-auto rounded-2xl border border-black/10">
                <table className="w-full min-w-[48rem] border-separate border-spacing-0 text-left text-sm">
                  <thead>
                    <tr className="bg-zinc-50 text-xs uppercase tracking-[0.12em] text-zinc-500">
                      <th className="border-b border-black/10 px-4 py-3 font-semibold">指标</th>
                      <th className="border-b border-black/10 px-4 py-3 font-semibold">统计方式</th>
                      <th className="border-b border-black/10 px-4 py-3 font-semibold">说明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analyticsMetrics.map((item) => (
                      <tr key={item.metric} className="align-top">
                        <td className="border-b border-black/5 px-4 py-3 font-semibold text-zinc-900">{item.metric}</td>
                        <td className="border-b border-black/5 px-4 py-3 font-mono text-xs leading-6 text-emerald-700">{item.logic}</td>
                        <td className="border-b border-black/5 px-4 py-3 leading-6 text-zinc-600">{item.meaning}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
