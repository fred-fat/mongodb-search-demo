import type { VideoSearchFilters, VideoSearchMode, VideoSegment } from "@/types/video";

export const mockVideoSegments = [
  {
    videoId: "desert-rally-pov",
    segmentId: "desert-rally-pov-001",
    title: "沙漠拉力第一视角",
    description: "摩托车在沙丘中高速穿越，适合演示运动、越野、POV、防抖相关视频召回。",
    transcript: "Riding the rally bike from the POV across dunes with high-speed desert racing scenes.",
    tags: ["骑行", "沙漠", "POV", "防抖"],
    productLine: "Action Camera",
    language: "en",
    sourceType: "ugc",
    startSec: 6,
    endSec: 16,
    vectorScore: 0.91,
    searchScore: 0.74,
    combinedScore: 0.86,
    matchReason: ["自然语言场景匹配", "运动相机第一视角", "高动态画面"],
  },
  {
    videoId: "speed-climbing-demo",
    segmentId: "speed-climbing-demo-001",
    title: "5 秒攀岩冲刺",
    description: "攀岩运动员快速攀登倾斜岩壁，适合展示极限运动、动作捕捉和短片段定位。",
    transcript: "看攀岩运动员如何在 5 秒内攀登 15 米高的岩壁。",
    tags: ["攀岩", "极限运动", "短视频"],
    productLine: "Action Camera",
    language: "zh",
    sourceType: "demo",
    startSec: 2,
    endSec: 9,
    vectorScore: 0.88,
    searchScore: 0.81,
    combinedScore: 0.85,
    matchReason: ["运动场景", "短时间高强度动作", "中文字幕"],
  },
  {
    videoId: "ai-dance",
    segmentId: "ai-dance-001",
    title: "AI 跳舞短片",
    description: "AI 生成舞蹈视频，适合演示娱乐内容、人物动作、社交短视频素材检索。",
    transcript: "AI dance clip with character movement and music-video style visuals.",
    tags: ["AI", "跳舞", "娱乐"],
    productLine: "Creator",
    language: "zh",
    sourceType: "ugc",
    startSec: 0,
    endSec: 12,
    vectorScore: 0.82,
    searchScore: 0.69,
    combinedScore: 0.78,
    matchReason: ["人物动作", "娱乐短视频", "可扩展多模态检索"],
  },
] satisfies VideoSegment[];

function segmentSearchText(segment: VideoSegment) {
  return [segment.title, segment.description, segment.transcript, segment.productLine, segment.language, segment.sourceType, ...segment.tags]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function filterMockVideoSegments(query: string, filters: VideoSearchFilters, mode: VideoSearchMode, limit: number) {
  const normalizedQuery = query.trim().toLowerCase();

  return mockVideoSegments
    .filter((segment) => {
      const searchable = segmentSearchText(segment);
      const matchesQuery = !normalizedQuery || searchable.includes(normalizedQuery) || segment.tags.some((tag) => normalizedQuery.includes(tag.toLowerCase()));
      const matchesProductLine = !filters.productLine || segment.productLine === filters.productLine;
      const matchesTag = !filters.tag || segment.tags.includes(filters.tag);
      const matchesLanguage = !filters.language || segment.language === filters.language;
      const matchesSourceType = !filters.sourceType || segment.sourceType === filters.sourceType;

      return matchesQuery && matchesProductLine && matchesTag && matchesLanguage && matchesSourceType;
    })
    .sort((left, right) => scoreForMode(right, mode) - scoreForMode(left, mode))
    .slice(0, limit);
}

function scoreForMode(segment: VideoSegment, mode: VideoSearchMode) {
  if (mode === "keyword") {
    return segment.searchScore ?? 0;
  }

  if (mode === "hybrid") {
    return segment.combinedScore ?? 0;
  }

  return segment.vectorScore ?? 0;
}
