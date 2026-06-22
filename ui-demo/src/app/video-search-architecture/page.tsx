import Link from "next/link";

function Box({ title, subtitle, tone = "default" }: { title: string; subtitle?: string; tone?: "default" | "green" | "purple" | "dark" | "amber" }) {
  const styles = {
    default: "border-zinc-200 bg-white text-zinc-950",
    green: "border-emerald-300 bg-emerald-50 text-emerald-950",
    purple: "border-violet-300 bg-violet-50 text-violet-950",
    dark: "border-zinc-700 bg-zinc-950 text-white",
    amber: "border-amber-300 bg-amber-50 text-amber-950",
  }[tone];

  return (
    <div className={`rounded-2xl border px-4 py-3 text-center shadow-sm ${styles}`}>
      <p className="text-sm font-semibold">{title}</p>
      {subtitle ? <p className="mt-1 text-xs leading-5 opacity-75">{subtitle}</p> : null}
    </div>
  );
}

function Arrow({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-1 text-zinc-400 lg:py-0">
      <div className="hidden h-px flex-1 bg-zinc-300 lg:block" />
      <span className="mx-2 rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600">{label ?? "→"}</span>
      <div className="hidden h-px flex-1 bg-zinc-300 lg:block" />
    </div>
  );
}

export default function VideoSearchArchitecturePage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#dcfce7,transparent_30rem),radial-gradient(circle_at_bottom_right,#ede9fe,transparent_34rem),linear-gradient(180deg,#fff,#f8fafc)] text-zinc-950">
      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-emerald-700">MongoDB Atlas Single Data Platform</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">视频检索架构图</h1>
          </div>
          <Link href="/video-search-lab" className="rounded-full bg-black px-5 py-2 text-sm font-semibold text-white hover:bg-zinc-800">
            返回 Demo
          </Link>
        </div>

        <div className="mt-6 rounded-[2rem] border border-black/10 bg-white/90 p-5 shadow-sm sm:p-6">
          <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr_1.1fr] lg:items-center">
            <div className="space-y-3">
              <Box title="上传 / Seed 视频" subtitle="MP4 + title / description / tags" tone="green" />
              <Box title="应用层自动处理" subtitle="ffprobe 时长读取 + 50 秒分片 + clip 生成" />
            </div>

            <Arrow label="写入" />

            <div className="rounded-[1.75rem] border-2 border-emerald-500 bg-emerald-50 p-4">
              <p className="text-center text-sm font-bold text-emerald-900">MongoDB Atlas</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Box title="videos" subtitle="完整视频 metadata" tone="green" />
                <Box title="video_segments" subtitle="时间段 + 向量字段" tone="green" />
                <Box title="search_events" subtitle="搜索 / 点击事件" tone="green" />
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_auto_1fr_auto_1fr] lg:items-stretch">
            <div className="rounded-[1.75rem] border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-center text-sm font-bold text-zinc-800">Embedding / AI</p>
              <div className="mt-3 grid gap-3">
                <Box title="voyage-4-large" subtitle="文本字段 → embedding" tone="purple" />
                <Box title="voyage-multimodal-3.5" subtitle="video-only clip → multimodalEmbedding" tone="purple" />
                <Box title="rerank-2.5-lite" subtitle="候选结果二次排序" tone="purple" />
              </div>
            </div>

            <Arrow label="索引" />

            <div className="rounded-[1.75rem] border border-violet-200 bg-violet-50 p-4">
              <p className="text-center text-sm font-bold text-violet-900">Atlas Search / Vector Search</p>
              <div className="mt-3 grid gap-3">
                <Box title="video_text_index" subtitle="全文检索 title / description / tags" />
                <Box title="video_vector_index" subtitle="文本语义向量检索 embedding" />
                <Box title="video_multimodal_vector_index" subtitle="多模态向量检索 multimodalEmbedding" />
              </div>
            </div>

            <Arrow label="查询" />

            <div className="rounded-[1.75rem] border border-zinc-800 bg-zinc-950 p-4 text-white">
              <p className="text-center text-sm font-bold text-white">Next.js Demo API</p>
              <div className="mt-3 grid gap-3">
                <Box title="/api/video-search" subtitle="segment 检索 → videoId 聚合" tone="dark" />
                <Box title="Pre-filter" subtitle="productLine / tags / language / sourceType" tone="dark" />
                <Box title="Video-level Result" subtitle="完整视频 + bestSegment + matchedSegments" tone="dark" />
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_auto_1fr_auto_1fr] lg:items-center">
            <Box title="用户搜索" subtitle="语义向量 / 多模态视频 / 全文检索" tone="amber" />
            <Arrow label="返回" />
            <Box title="完整视频结果" subtitle="播放完整文件，并跳转到命中时间段" tone="amber" />
            <Arrow label="记录" />
            <Box title="运营分析" subtitle="search_events + aggregation：PV / CTR / Top Queries" tone="amber" />
          </div>
        </div>

        <div className="mt-4 grid gap-3 text-center text-xs font-semibold text-zinc-700 sm:grid-cols-4">
          <div className="rounded-full bg-white px-4 py-2 shadow-sm">单一数据平台：MongoDB Atlas</div>
          <div className="rounded-full bg-white px-4 py-2 shadow-sm">同一份 video_segments 支撑三类检索</div>
          <div className="rounded-full bg-white px-4 py-2 shadow-sm">Pre-filter 先缩小候选集合</div>
          <div className="rounded-full bg-white px-4 py-2 shadow-sm">返回完整视频，同时解释命中片段</div>
        </div>
      </section>
    </main>
  );
}
