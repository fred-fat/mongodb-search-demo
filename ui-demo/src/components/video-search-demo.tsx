"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";

import { mockVideoSegments } from "@/lib/mock-video-data";
import type { VideoSearchDebug, VideoSearchFilters, VideoSearchMode, VideoSearchResponse, VideoSearchResult } from "@/types/video";

type VideoAnalyticsSummary = {
  searchPv: number;
  searchUv: number;
  clickCount: number;
  ctr: number;
  topQueries: Array<{ query: string; count: number }>;
  topSegments: Array<{ segmentId: string; count: number }>;
  zeroResultQueries: Array<{ query: string; count: number }>;
};

type VideoProcessingStatus = {
  videoId: string;
  status: string;
  title?: string;
  durationSec?: number;
  segmentCount: number;
  readyTextEmbeddings: number;
  readyMultimodalEmbeddings: number;
  failedMultimodalEmbeddings: number;
  processingError?: string;
};

type VideoLibrarySummary = {
  totalVideos: number;
  seedVideos: number;
  uploadedVideos: number;
  readyVideos: number;
  segmentCount: number;
  readyMultimodalSegments: number;
};

const modes = [
  { mode: "semantic", label: "语义向量", description: "基础数据：标题、描述、字幕、标签、产品线等文本字段；使用 Voyage 4 文本向量召回。" },
  { mode: "multimodal", label: "多模态视频", description: "基础数据：视频片段画面 clip；使用 Voyage Multimodal 3.5 直接理解画面内容。" },
  { mode: "keyword", label: "全文检索", description: "基础数据：标题、描述、字幕、标签等文本字段；使用 Atlas Search 全文索引。" },
] satisfies Array<{ mode: VideoSearchMode; label: string; description: string }>;

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;

  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

export function VideoSearchDemo() {
  const [query, setQuery] = useState("骑行第一视角防抖");
  const [selectedMode, setSelectedMode] = useState<VideoSearchMode>("semantic");
  const [filters, setFilters] = useState<VideoSearchFilters>({});
  const initialSegment = mockVideoSegments[0];
  const initialSourceUrl = "sourceUrl" in initialSegment && typeof initialSegment.sourceUrl === "string" ? initialSegment.sourceUrl : undefined;
  const initialThumbnailUrl = "thumbnailUrl" in initialSegment && typeof initialSegment.thumbnailUrl === "string" ? initialSegment.thumbnailUrl : undefined;
  const initialResult: VideoSearchResult = {
    videoId: initialSegment.videoId,
    title: initialSegment.title,
    description: initialSegment.description,
    tags: initialSegment.tags,
    productLine: initialSegment.productLine,
    language: initialSegment.language,
    sourceType: initialSegment.sourceType,
    sourceUrl: initialSourceUrl,
    thumbnailUrl: initialThumbnailUrl,
    bestSegment: {
      segmentId: initialSegment.segmentId,
      title: initialSegment.title,
      startSec: initialSegment.startSec,
      endSec: initialSegment.endSec,
      matchReason: initialSegment.matchReason,
    },
    matchedSegments: [
      {
        segmentId: initialSegment.segmentId,
        title: initialSegment.title,
        startSec: initialSegment.startSec,
        endSec: initialSegment.endSec,
        matchReason: initialSegment.matchReason,
      },
    ],
    matchReason: initialSegment.matchReason,
  };
  const [results, setResults] = useState<VideoSearchResult[]>([initialResult]);
  const [selectedVideo, setSelectedVideo] = useState<VideoSearchResult | null>(initialResult);
  const [debug, setDebug] = useState<VideoSearchDebug | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rerankEnabled, setRerankEnabled] = useState(false);
  const [analytics, setAnalytics] = useState<VideoAnalyticsSummary | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadDescription, setUploadDescription] = useState("");
  const [uploadProductLine, setUploadProductLine] = useState("Uploaded");
  const [uploadLanguage, setUploadLanguage] = useState("zh");
  const [uploadSourceType, setUploadSourceType] = useState<NonNullable<VideoSearchFilters["sourceType"]>>("ugc");
  const [uploadTags, setUploadTags] = useState("上传,Demo");
  const [uploadSegmentSeconds, setUploadSegmentSeconds] = useState(50);
  const [uploadStatus, setUploadStatus] = useState<VideoProcessingStatus | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [librarySummary, setLibrarySummary] = useState<VideoLibrarySummary | null>(null);
  const [sessionId] = useState(() => crypto.randomUUID());
  const [isPending, startTransition] = useTransition();
  const videoRef = useRef<HTMLVideoElement>(null);

  const productLines = Array.from(new Set(mockVideoSegments.map((segment) => segment.productLine).filter(Boolean))) as string[];
  const tags = Array.from(new Set(mockVideoSegments.flatMap((segment) => segment.tags)));
  const languages = Array.from(new Set(mockVideoSegments.map((segment) => segment.language).filter(Boolean))) as string[];
  const sourceTypes = Array.from(new Set(mockVideoSegments.map((segment) => segment.sourceType).filter(Boolean))) as NonNullable<VideoSearchFilters["sourceType"]>[];
  const activeMode = modes.find((mode) => mode.mode === selectedMode);

  async function loadAnalytics() {
    try {
      const response = await fetch("/api/video-analytics");
      const summary = (await response.json()) as VideoAnalyticsSummary;

      if (response.ok) {
        setAnalytics(summary);
      }
    } catch (analyticsError) {
      console.error("Video analytics request failed", analyticsError);
    }
  }

  async function loadLibrarySummary() {
    try {
      const response = await fetch("/api/video-library-summary");
      const summary = (await response.json()) as VideoLibrarySummary;

      if (response.ok) {
        setLibrarySummary(summary);
      }
    } catch (summaryError) {
      console.error("Video library summary request failed", summaryError);
    }
  }

  async function loadProcessingStatus(videoId: string) {
    const response = await fetch(`/api/video-processing-status?videoId=${encodeURIComponent(videoId)}`);
    const status = (await response.json()) as VideoProcessingStatus | { error?: string };

    if (!response.ok) {
      throw new Error("error" in status && status.error ? status.error : "Processing status request failed");
    }

    setUploadStatus(status as VideoProcessingStatus);

    return status as VideoProcessingStatus;
  }

  async function uploadAndProcessVideo() {
    if (!uploadFile) {
      setUploadError("请选择一个 MP4 视频文件。");
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadStatus(null);

    try {
      const formData = new FormData();
      formData.set("file", uploadFile);
      formData.set("title", uploadTitle || uploadFile.name.replace(/\.mp4$/i, ""));
      formData.set("description", uploadDescription);
      formData.set("productLine", uploadProductLine);
      formData.set("language", uploadLanguage);
      formData.set("sourceType", uploadSourceType);
      formData.set("tags", uploadTags);
      formData.set("segmentSeconds", String(uploadSegmentSeconds));

      const uploadResponse = await fetch("/api/video-upload", {
        method: "POST",
        body: formData,
      });
      const uploadData = (await uploadResponse.json()) as { videoId?: string; error?: string };

      if (!uploadResponse.ok || !uploadData.videoId) {
        throw new Error(uploadData.error ?? "Video upload failed");
      }

      setUploadStatus({
        videoId: uploadData.videoId,
        status: "uploaded",
        segmentCount: 0,
        readyTextEmbeddings: 0,
        readyMultimodalEmbeddings: 0,
        failedMultimodalEmbeddings: 0,
      });

      const processPromise = fetch("/api/video-process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: uploadData.videoId }),
      });

      let done = false;
      while (!done) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const status = await loadProcessingStatus(uploadData.videoId);
        done = status.status === "ready" || status.status === "failed";
      }

      const processResponse = await processPromise;
      const processData = (await processResponse.json()) as { error?: string };

      if (!processResponse.ok) {
        throw new Error(processData.error ?? "Video processing failed");
      }

      await loadProcessingStatus(uploadData.videoId);
      await loadLibrarySummary();
      setSelectedMode("multimodal");
      setQuery(uploadTitle || uploadFile.name.replace(/\.mp4$/i, ""));
    } catch (uploadProcessError) {
      setUploadError(uploadProcessError instanceof Error ? uploadProcessError.message : "Video upload or processing failed");
    } finally {
      setIsUploading(false);
    }
  }

  function runMockSearch(nextFilters = filters, mode = selectedMode) {
    startTransition(async () => {
      setError(null);

      try {
        const response = await fetch("/api/video-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, mode, filters: nextFilters, limit: 8, rerank: rerankEnabled }),
        });
        const data = (await response.json()) as VideoSearchResponse | { error?: string };

        if (!response.ok) {
          throw new Error("error" in data && data.error ? data.error : "Video search request failed");
        }

        const searchResponse = data as VideoSearchResponse;
        setResults(searchResponse.results);
        setSelectedVideo(searchResponse.results[0] ?? null);
        setDebug(searchResponse.debug);
        void fetch("/api/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "search",
            domain: "video",
            query: searchResponse.query,
            mode: searchResponse.mode,
            resultCount: searchResponse.total,
            sessionId,
          }),
        })
          .then(() => loadAnalytics())
          .catch((eventError) => console.error("Video search event tracking failed", eventError));
      } catch (searchError) {
        setError(searchError instanceof Error ? searchError.message : "Video search request failed");
      }
    });
  }

  function updateFilters(nextFilters: VideoSearchFilters) {
    setFilters(nextFilters);
    runMockSearch(nextFilters);
  }

  function selectVideo(video: VideoSearchResult) {
    setSelectedVideo(video);
    void fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "click",
        domain: "video",
        query,
        mode: selectedMode,
        videoId: video.videoId,
        segmentId: video.bestSegment.segmentId,
        sessionId,
      }),
    })
      .then(() => loadAnalytics())
      .catch((eventError) => console.error("Video click event tracking failed", eventError));
  }

  useEffect(() => {
    if (!selectedVideo || !videoRef.current) {
      return;
    }

    videoRef.current.currentTime = selectedVideo.bestSegment.startSec;
  }, [selectedVideo]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadLibrarySummary();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  return (
    <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="rounded-[2rem] border border-black/10 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-violet-700">Video Similarity Search Lab</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">视频片段相似度搜索</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600">
              使用同一份 `video_segments` 数据演示文本语义向量、视频多模态向量、Atlas Search 全文检索、混合检索、Rerank、片段跳转和运营分析。
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs sm:w-[26rem]">
            <div className="rounded-2xl bg-zinc-50 px-3 py-3">
              <p className="text-xl font-semibold">{librarySummary?.totalVideos ?? "-"}</p>
              <p className="text-zinc-500">视频文件</p>
            </div>
            <div className="rounded-2xl bg-violet-50 px-3 py-3 text-violet-800">
              <p className="text-xl font-semibold">{librarySummary ? `${librarySummary.seedVideos}+${librarySummary.uploadedVideos}` : "-"}</p>
              <p>本地 / 上传</p>
            </div>
            <div className="rounded-2xl bg-zinc-50 px-3 py-3">
              <p className="text-xl font-semibold">{librarySummary?.segmentCount ?? "-"}</p>
              <p className="text-zinc-500">视频片段</p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Link href="/video-search-architecture" target="_blank" className="rounded-full bg-zinc-100 px-5 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-200">
            架构说明
          </Link>
          <button onClick={() => setUploadModalOpen(true)} className="rounded-full bg-violet-700 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-800">
            上传视频
          </button>
        </div>

        <div className="mt-6 rounded-3xl border border-black/10 bg-zinc-50 p-4">
          <div className="flex flex-col gap-3 lg:flex-row">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  runMockSearch();
                }
              }}
              className="min-h-12 flex-1 rounded-full border border-black/10 bg-white px-5 text-sm outline-none focus:border-black"
              placeholder="输入视频场景，例如：骑行第一视角防抖"
            />
            <button onClick={() => runMockSearch()} disabled={isPending} className="min-h-12 rounded-full bg-black px-6 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-400">
              {isPending ? "搜索中..." : "搜索视频片段"}
            </button>
          </div>

          {error ? <p className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}

          <div className="mt-5 grid gap-3 lg:grid-cols-3">
            {modes.map((mode) => (
              <button
                key={mode.mode}
                onClick={() => {
                  setSelectedMode(mode.mode);
                  runMockSearch(filters, mode.mode);
                }}
                className={`rounded-3xl border p-4 text-left ${
                  selectedMode === mode.mode ? "border-black bg-black text-white" : "border-black/10 bg-white text-zinc-900 hover:border-black"
                }`}
              >
                <p className="text-sm font-semibold">{mode.label}</p>
                <p className={`mt-2 text-xs leading-5 ${selectedMode === mode.mode ? "text-white/70" : "text-zinc-500"}`}>{mode.description}</p>
              </button>
            ))}
          </div>

          <div className="mt-5 rounded-2xl bg-white px-4 py-3">
            <p className="text-sm font-semibold text-zinc-950">Pre-filter</p>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              先用产品线、标签、语言和素材类型缩小候选范围，再执行语义向量、多模态向量或全文检索。这样可以减少无关候选，提高相关性，并让 Atlas Vector Search 在更小的候选集合内计算相似度。
            </p>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <select
              value={filters.productLine ?? ""}
              onChange={(event) => updateFilters({ ...filters, productLine: event.target.value || undefined })}
              className="min-h-11 rounded-2xl border border-black/10 bg-white px-4 text-sm"
            >
              <option value="">全部产品线</option>
              {productLines.map((productLine) => (
                <option key={productLine} value={productLine}>{productLine}</option>
              ))}
            </select>
            <select
              value={filters.tag ?? ""}
              onChange={(event) => updateFilters({ ...filters, tag: event.target.value || undefined })}
              className="min-h-11 rounded-2xl border border-black/10 bg-white px-4 text-sm"
            >
              <option value="">全部场景标签</option>
              {tags.map((tag) => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </select>
            <select
              value={filters.language ?? ""}
              onChange={(event) => updateFilters({ ...filters, language: event.target.value || undefined })}
              className="min-h-11 rounded-2xl border border-black/10 bg-white px-4 text-sm"
            >
              <option value="">全部语言</option>
              {languages.map((language) => (
                <option key={language} value={language}>{language}</option>
              ))}
            </select>
            <select
              value={filters.sourceType ?? ""}
              onChange={(event) => updateFilters({ ...filters, sourceType: (event.target.value || undefined) as VideoSearchFilters["sourceType"] })}
              className="min-h-11 rounded-2xl border border-black/10 bg-white px-4 text-sm"
            >
              <option value="">全部素材类型</option>
              {sourceTypes.map((sourceType) => (
                <option key={sourceType} value={sourceType}>{sourceType}</option>
              ))}
            </select>
          </div>

          <label className="mt-4 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-zinc-800">
            <input
              type="checkbox"
              checked={rerankEnabled}
              onChange={(event) => setRerankEnabled(event.target.checked)}
              className="h-4 w-4 accent-black"
            />
            启用 Voyage Rerank 二次排序
          </label>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          {results.length > 0 ? results.map((video) => (
            <article key={video.videoId} className={`rounded-[2rem] border bg-white p-4 shadow-sm sm:p-5 ${selectedVideo?.videoId === video.videoId ? "border-black" : "border-black/10"}`}>
              <div className="flex flex-col gap-4 md:flex-row">
                <div className="flex h-40 items-center justify-center rounded-3xl bg-gradient-to-br from-zinc-950 via-violet-900 to-emerald-500 text-center text-sm font-semibold text-white md:w-56">
                  {video.title}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-black px-3 py-1 text-xs font-semibold text-white">
                      命中 {formatTime(video.bestSegment.startSec)} - {formatTime(video.bestSegment.endSec)}
                    </span>
                    {video.durationSec ? <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-700">完整视频 {formatTime(video.durationSec)}</span> : null}
                    {video.productLine ? <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-800">{video.productLine}</span> : null}
                    {video.language ? <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-700">{video.language}</span> : null}
                  </div>
                  <h2 className="mt-3 text-xl font-semibold tracking-tight">{video.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-zinc-600">{video.description}</p>
                  <p className="mt-2 rounded-2xl bg-violet-50 px-4 py-3 text-xs leading-5 text-violet-800">
                    返回完整视频文件；最佳命中片段为「{video.bestSegment.title}」({formatTime(video.bestSegment.startSec)} - {formatTime(video.bestSegment.endSec)})。
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {video.tags.map((tag) => (
                      <span key={tag} className="rounded-full border border-black/10 px-3 py-1 text-xs font-semibold text-zinc-700">{tag}</span>
                    ))}
                  </div>
                  {video.matchedSegments.length > 1 ? (
                    <div className="mt-3 rounded-2xl bg-zinc-50 px-4 py-3 text-xs leading-5 text-zinc-600">
                      <p className="font-semibold text-zinc-800">匹配片段</p>
                      {video.matchedSegments.slice(0, 3).map((matched) => (
                        <p key={matched.segmentId}>{formatTime(matched.startSec)} - {formatTime(matched.endSec)} / {matched.title}</p>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-3 grid gap-2 text-xs text-zinc-600 sm:grid-cols-5">
                    <span className="rounded-2xl bg-zinc-50 px-3 py-2">Vector: {video.vectorScore?.toFixed(3) ?? "-"}</span>
                    <span className="rounded-2xl bg-violet-50 px-3 py-2 text-violet-800">Multi: {video.multimodalScore?.toFixed(3) ?? "-"}</span>
                    <span className="rounded-2xl bg-zinc-50 px-3 py-2">Text: {video.searchScore?.toFixed(3) ?? "-"}</span>
                    <span className="rounded-2xl bg-zinc-50 px-3 py-2">Hybrid: {video.combinedScore?.toFixed(3) ?? "-"}</span>
                    <span className="rounded-2xl bg-zinc-50 px-3 py-2">Rerank: {video.rerankScore?.toFixed(3) ?? "-"}</span>
                  </div>
                  <button onClick={() => selectVideo(video)} className="mt-4 rounded-full bg-black px-4 py-2 text-sm font-semibold text-white">
                    播放完整视频并跳转命中片段
                  </button>
                </div>
              </div>
            </article>
          )) : (
            <div className="rounded-[2rem] border border-black/10 bg-white p-8 text-center text-sm text-zinc-500">
              当前 mock 数据没有匹配片段。后续接入 MongoDB 后会展示真实零结果和 fallback 行为。
            </div>
          )}
        </div>

        <aside className="rounded-[2rem] border border-black/10 bg-white p-5 shadow-sm lg:sticky lg:top-6 lg:self-start">
          <div className="mb-5 overflow-hidden rounded-3xl bg-black">
            {selectedVideo?.sourceUrl ? (
              <video
                key={selectedVideo.videoId}
                ref={videoRef}
                controls
                playsInline
                preload="metadata"
                src={selectedVideo.sourceUrl}
                onLoadedMetadata={(event) => {
                  event.currentTarget.currentTime = selectedVideo.bestSegment.startSec;
                }}
                className="aspect-video w-full bg-black"
              />
            ) : (
              <div className="flex aspect-video items-center justify-center px-4 text-center text-sm font-semibold text-white">
                搜索后选择一个片段播放
              </div>
            )}
          </div>
          {selectedVideo ? (
            <div className="mb-5 rounded-2xl bg-zinc-50 p-4 text-sm">
              <p className="font-semibold text-zinc-950">当前视频</p>
              <p className="mt-1 text-zinc-600">{selectedVideo.title}</p>
              <p className="mt-2 text-xs text-zinc-500">
                命中片段 {formatTime(selectedVideo.bestSegment.startSec)} - {formatTime(selectedVideo.bestSegment.endSec)} / {selectedVideo.videoId}
              </p>
            </div>
          ) : null}
          <p className="text-sm font-semibold text-zinc-950">Search Debug Preview</p>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Mode</dt>
              <dd className="font-semibold">{debug?.mode ?? selectedMode}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Collection</dt>
              <dd className="font-semibold">{debug?.collection ?? "video_segments"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Index</dt>
              <dd className="text-right font-semibold">{debug?.index ?? "mock"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Embedding</dt>
              <dd className="font-semibold">{debug?.embeddingModel ?? "n/a"}</dd>
            </div>
            {debug?.vectorField ? (
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">Vector Field</dt>
                <dd className="font-semibold">{debug.vectorField}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Reranker</dt>
              <dd className="font-semibold">{debug?.rerankerModel ?? "off"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Results</dt>
              <dd className="font-semibold">{results.length}</dd>
            </div>
            {debug?.elapsedMs !== undefined ? (
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">Latency</dt>
                <dd className="font-semibold">{debug.elapsedMs} ms</dd>
              </div>
            ) : null}
          </dl>
          <div className="mt-4 rounded-2xl bg-zinc-50 p-4 text-xs leading-5 text-zinc-600">
            当前 API 已接入 MongoDB Atlas。`semantic` 使用文本向量字段 `embedding`，`multimodal` 使用视频片段向量字段 `multimodalEmbedding`。
          </div>
          {activeMode ? <p className="mt-4 text-xs leading-5 text-zinc-500">当前模式：{activeMode.description}</p> : null}

          <div className="mt-5 rounded-2xl bg-zinc-50 p-4">
            <p className="text-sm font-semibold text-zinc-950">Video Operations Preview</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-2xl bg-white px-2 py-3">
                <p className="text-lg font-semibold">{analytics?.searchPv ?? 0}</p>
                <p className="text-zinc-500">Search PV</p>
              </div>
              <div className="rounded-2xl bg-white px-2 py-3">
                <p className="text-lg font-semibold">{analytics?.searchUv ?? 0}</p>
                <p className="text-zinc-500">Search UV</p>
              </div>
              <div className="rounded-2xl bg-white px-2 py-3">
                <p className="text-lg font-semibold">{analytics?.clickCount ?? 0}</p>
                <p className="text-zinc-500">Clicks</p>
              </div>
            </div>
            <div className="mt-3 text-xs leading-5 text-zinc-600">
              <p className="font-semibold text-zinc-800">Top Video Queries</p>
              {(analytics?.topQueries.length ?? 0) > 0 ? analytics?.topQueries.map((item) => (
                <p key={item.query} className="flex justify-between gap-3">
                  <span className="truncate">{item.query}</span>
                  <span>{item.count}</span>
                </p>
              )) : <p className="text-zinc-500">暂无视频搜索事件</p>}
            </div>
          </div>
        </aside>
      </div>

      {uploadModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-[2rem] bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-violet-800">Upload Video Demo</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight">上传视频并写入 Collection 字段</h2>
                <p className="mt-2 text-xs leading-5 text-zinc-500">上传 MP4 后自动分片，生成文本 embedding 和 video-only 多模态 embedding。</p>
              </div>
              <button onClick={() => setUploadModalOpen(false)} className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-semibold text-zinc-700">关闭</button>
            </div>
            <div className="mt-5 grid gap-3 lg:grid-cols-3">
              <label className="space-y-1 lg:col-span-3">
                <span className="text-xs font-semibold text-zinc-700">视频文件</span>
                <input type="file" accept="video/mp4,.mp4" onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)} className="w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm" />
                <span className="block text-xs leading-5 text-zinc-500">选择要导入的 MP4 文件。Demo 限制 50 MB，文件会保存到本地 `uploaded-video-src/`。</span>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold text-zinc-700">标题</span>
                <input value={uploadTitle} onChange={(event) => setUploadTitle(event.target.value)} placeholder="例如：城市骑行测试" className="w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm" />
                <span className="block text-xs leading-5 text-zinc-500">写入 `videos.title`，也会作为每个自动分片标题的前缀。</span>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold text-zinc-700">产品线</span>
                <input value={uploadProductLine} onChange={(event) => setUploadProductLine(event.target.value)} placeholder="例如：Action Camera" className="w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm" />
                <span className="block text-xs leading-5 text-zinc-500">写入 `productLine`，用于筛选和文本检索上下文。</span>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold text-zinc-700">语言</span>
                <input value={uploadLanguage} onChange={(event) => setUploadLanguage(event.target.value)} placeholder="例如：zh / en" className="w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm" />
                <span className="block text-xs leading-5 text-zinc-500">写入 `language`，用于语言筛选和运营分析。</span>
              </label>
              <label className="space-y-1 lg:col-span-2">
                <span className="text-xs font-semibold text-zinc-700">描述</span>
                <textarea value={uploadDescription} onChange={(event) => setUploadDescription(event.target.value)} placeholder="说明视频内容、场景、人物或用途" className="min-h-24 w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm" />
                <span className="block text-xs leading-5 text-zinc-500">写入 `description`，用于标准文本 embedding 和全文检索；多模态 embedding 不会混入该字段。</span>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold text-zinc-700">标签</span>
                <input value={uploadTags} onChange={(event) => setUploadTags(event.target.value)} placeholder="例如：骑行,户外,防抖" className="w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm" />
                <span className="block text-xs leading-5 text-zinc-500">用逗号分隔，写入 `tags`，用于筛选、全文检索和文本 embedding。</span>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold text-zinc-700">素材类型</span>
                <select value={uploadSourceType} onChange={(event) => setUploadSourceType(event.target.value as NonNullable<VideoSearchFilters["sourceType"]>)} className="w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm">
                  <option value="ugc">ugc</option>
                  <option value="demo">demo</option>
                  <option value="tutorial">tutorial</option>
                  <option value="product">product</option>
                </select>
                <span className="block text-xs leading-5 text-zinc-500">写入 `sourceType`，用于区分用户素材、教程、产品视频或演示素材。</span>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold text-zinc-700">分片秒数</span>
                <input type="number" min={10} max={300} value={uploadSegmentSeconds} onChange={(event) => setUploadSegmentSeconds(Number(event.target.value))} className="w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm" />
                <span className="block text-xs leading-5 text-zinc-500">按真实视频时长自动切分，默认 50 秒一个 segment。</span>
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setUploadModalOpen(false)} className="rounded-full bg-zinc-100 px-5 py-2 text-sm font-semibold text-zinc-700">取消</button>
              <button onClick={uploadAndProcessVideo} disabled={isUploading} className="rounded-full bg-violet-700 px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-violet-300">
                {isUploading ? "处理中..." : "上传并处理"}
              </button>
            </div>
            {uploadError ? <p className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{uploadError}</p> : null}
            {uploadStatus ? (
              <div className="mt-3 grid gap-2 rounded-2xl bg-zinc-50 p-4 text-xs text-zinc-700 sm:grid-cols-5">
                <span>Status: <strong>{uploadStatus.status}</strong></span>
                <span>Segments: <strong>{uploadStatus.segmentCount}</strong></span>
                <span>Text: <strong>{uploadStatus.readyTextEmbeddings}</strong></span>
                <span>Multi: <strong>{uploadStatus.readyMultimodalEmbeddings}</strong></span>
                <span>VideoId: <strong className="break-all">{uploadStatus.videoId}</strong></span>
                {uploadStatus.processingError ? <span className="text-red-700 sm:col-span-5">{uploadStatus.processingError}</span> : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
