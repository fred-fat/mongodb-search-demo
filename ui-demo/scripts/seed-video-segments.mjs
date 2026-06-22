import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MongoClient } from "mongodb";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(appRoot, "..");
const envPath = path.join(appRoot, ".env.local");
const videoSourceDir = path.join(repoRoot, "video-src");
const SEGMENT_SECONDS = 50;
const MIN_TRAILING_SECONDS = 2;

const videoSpecs = [
  {
    videoId: "desert-rally-pov",
    fileName: "Have you ever wonder how it is to ride the rally bike from the POV. Thanks to the MX Ride Dubai for providing the rally bike. #rallyraid #dunesriding #desertracing 🎥 Denis Janezic _ Simon Marčič Racing _ Facebook.mp4",
    title: "Desert Rally Bike POV",
    productLine: "Action Camera",
    language: "en",
    sourceType: "ugc",
    tags: ["骑行", "沙漠", "POV", "防抖", "拉力"],
    segments: [
      {
        startSec: 0,
        endSec: 12,
        title: "沙漠拉力第一视角起步",
        description: "拉力摩托车从第一视角进入沙丘路段，展示越野、POV 和高动态运动场景。",
        transcript: "Riding the rally bike from the POV across dunes.",
        tags: ["骑行", "沙漠", "POV", "防抖"],
      },
      {
        startSec: 12,
        endSec: 24,
        title: "沙丘高速穿越",
        description: "摩托车高速穿越沙漠地形，适合测试运动相机防抖、越野和速度相关检索。",
        transcript: "High-speed desert racing with rally bike movement.",
        tags: ["拉力", "沙漠", "高速", "运动"],
      },
    ],
  },
  {
    videoId: "speed-climbing-wall",
    fileName: "C视频︱别眨眼，看攀岩运动员如何5秒内攀登15米高、外伸倾斜5度岩壁_四川在线.mp4",
    title: "Speed Climbing Wall Demo",
    productLine: "Action Camera",
    language: "zh",
    sourceType: "demo",
    tags: ["攀岩", "极限运动", "短视频", "速度"],
    segments: [
      {
        startSec: 0,
        endSec: 8,
        title: "5 秒攀岩冲刺",
        description: "攀岩运动员快速攀登倾斜岩壁，适合展示极限运动和短片段精准定位。",
        transcript: "别眨眼，看攀岩运动员如何 5 秒内攀登 15 米高岩壁。",
        tags: ["攀岩", "极限运动", "速度"],
      },
      {
        startSec: 8,
        endSec: 16,
        title: "垂直岩壁动作细节",
        description: "画面突出手脚动作和垂直运动轨迹，可用于运动分析和动作搜索演示。",
        transcript: "运动员沿岩壁快速上升。",
        tags: ["攀岩", "动作", "垂直运动"],
      },
    ],
  },
  {
    videoId: "bicycle-road-rider",
    fileName: "摩托车 自行车 骑自行车的人 - Free video on Pixabay.mp4",
    title: "Bicycle Road Rider",
    productLine: "Action Camera",
    language: "zh",
    sourceType: "demo",
    tags: ["骑行", "自行车", "户外", "道路"],
    segments: [
      {
        startSec: 0,
        endSec: 10,
        title: "自行车户外骑行",
        description: "骑行者在道路上前进，适合测试骑行、户外、运动记录相关视频搜索。",
        transcript: "骑自行车的人在户外道路骑行。",
        tags: ["骑行", "自行车", "户外"],
      },
      {
        startSec: 10,
        endSec: 20,
        title: "道路运动跟拍",
        description: "道路环境中的运动跟拍画面，可用于展示运动相机和稳定画面检索。",
        transcript: "Road cycling scene with a moving rider.",
        tags: ["道路", "运动", "跟拍"],
      },
    ],
  },
  {
    videoId: "football-neymar-1v1",
    fileName: "When you try to 1v1 Neymar _ Watch.mp4",
    title: "Football 1v1 Neymar Clip",
    productLine: "Action Camera",
    language: "en",
    sourceType: "ugc",
    tags: ["足球", "1v1", "运动", "人物"],
    segments: [
      {
        startSec: 0,
        endSec: 10,
        title: "足球 1v1 对抗",
        description: "足球运动中的一对一对抗片段，适合测试人物运动、球类和动作检索。",
        transcript: "When you try to one versus one Neymar.",
        tags: ["足球", "1v1", "运动"],
      },
      {
        startSec: 10,
        endSec: 20,
        title: "球员动作变化",
        description: "球员快速变向和控球动作，适合演示复杂人物动作场景召回。",
        transcript: "Fast football movement and skill action.",
        tags: ["足球", "人物", "动作"],
      },
    ],
  },
  {
    videoId: "ai-dance-short",
    fileName: "AI 跳舞.mp4",
    title: "AI Dance Short Video",
    productLine: "Creator",
    language: "zh",
    sourceType: "ugc",
    tags: ["AI", "跳舞", "娱乐", "人物"],
    segments: [
      {
        startSec: 0,
        endSec: 10,
        title: "AI 人物跳舞",
        description: "AI 生成的人物舞蹈短视频，适合测试娱乐、人物动作和社交视频素材检索。",
        transcript: "AI dance clip with character movement and music-video style visuals.",
        tags: ["AI", "跳舞", "娱乐"],
      },
      {
        startSec: 10,
        endSec: 20,
        title: "音乐视频风格动作",
        description: "偏音乐视频风格的动作画面，可用于未来多模态视觉检索验证。",
        transcript: "Music-video style AI generated dance movement.",
        tags: ["AI", "人物", "动作"],
      },
    ],
  },
  {
    videoId: "short-drama-fake-bankruptcy",
    fileName: "假破产验出真老公 父母假破产，我反手嫁给顶配老公#假破产验出真老公 #因为一个片段看了整部剧 #甜宠 #打脸 #ai短剧 - 抖音.mp4",
    title: "Fake Bankruptcy Short Drama",
    productLine: "Creator",
    language: "zh",
    sourceType: "ugc",
    tags: ["短剧", "剧情", "甜宠", "打脸"],
    segments: [
      {
        startSec: 0,
        endSec: 15,
        title: "短剧剧情开场",
        description: "中文短剧开场片段，包含家庭、婚恋和剧情反转元素。",
        transcript: "父母假破产，我反手嫁给顶配老公。",
        tags: ["短剧", "剧情", "中文"],
      },
      {
        startSec: 15,
        endSec: 30,
        title: "甜宠反转片段",
        description: "甜宠和打脸主题剧情片段，适合测试非运动类视频语义检索。",
        transcript: "因为一个片段看了整部剧。",
        tags: ["甜宠", "打脸", "剧情"],
      },
    ],
  },
  {
    videoId: "rural-heir-drama",
    fileName: "农村小伙竞聘总监被当众羞辱开除，下一秒接到家族电话 —— 他竟是顶级集团唯一继承人！高调回归碾压对手，一路逆袭掌权，迎娶白富美，登顶商界巅峰！#漫剧 #漫剧推荐 #扮猪.mp4",
    title: "Rural Heir Comeback Drama",
    productLine: "Creator",
    language: "zh",
    sourceType: "ugc",
    tags: ["漫剧", "逆袭", "职场", "剧情"],
    segments: [
      {
        startSec: 0,
        endSec: 18,
        title: "职场羞辱剧情",
        description: "农村小伙竞聘总监被当众羞辱开除，适合测试剧情摘要和中文语义检索。",
        transcript: "农村小伙竞聘总监被当众羞辱开除。",
        tags: ["职场", "剧情", "逆袭"],
      },
      {
        startSec: 18,
        endSec: 36,
        title: "继承人逆袭反转",
        description: "主角接到家族电话后高调回归，包含继承人、逆袭和商业剧情元素。",
        transcript: "他竟是顶级集团唯一继承人。",
        tags: ["继承人", "逆袭", "漫剧"],
      },
    ],
  },
  {
    videoId: "republic-era-romance",
    fileName: "民国爱情.mp4",
    title: "Republic Era Romance",
    productLine: "Creator",
    language: "zh",
    sourceType: "ugc",
    tags: ["民国", "爱情", "剧情", "人物"],
    segments: [
      {
        startSec: 0,
        endSec: 12,
        title: "民国爱情人物场景",
        description: "民国风格爱情剧情片段，适合测试服装、人物、年代感和剧情主题搜索。",
        transcript: "民国爱情故事片段。",
        tags: ["民国", "爱情", "人物"],
      },
      {
        startSec: 12,
        endSec: 24,
        title: "年代剧情氛围",
        description: "带有年代感的剧情氛围片段，可用于非商品类视频内容检索展示。",
        transcript: "A romance scene in a republic-era drama style.",
        tags: ["年代", "剧情", "爱情"],
      },
    ],
  },
];

function loadLocalEnv() {
  if (!existsSync(envPath)) {
    return;
  }

  const content = readFileSync(envPath, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function readDurationSec(filePath) {
  try {
    const output = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", filePath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const duration = Number.parseFloat(output.trim());

    return Number.isFinite(duration) ? Math.round(duration) : 0;
  } catch {
    return 0;
  }
}

function formatTimeLabel(seconds) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const rest = safeSeconds % 60;

  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function generateSegments(video, durationSec) {
  const safeDuration = Math.max(1, Number(durationSec) || 1);
  const segments = [];
  let startSec = 0;

  while (startSec < safeDuration) {
    let endSec = Math.min(startSec + SEGMENT_SECONDS, safeDuration);
    const remaining = safeDuration - endSec;

    if (remaining > 0 && remaining < MIN_TRAILING_SECONDS) {
      endSec = safeDuration;
    }

    segments.push({
      startSec: Math.round(startSec),
      endSec: Math.round(endSec),
      title: `${video.title} ${formatTimeLabel(startSec)}-${formatTimeLabel(endSec)}`,
      description: `${video.title} segment from ${formatTimeLabel(startSec)} to ${formatTimeLabel(endSec)}.`,
      transcript: "",
      tags: video.tags,
    });

    startSec = endSec;
  }

  return segments;
}

function segmentDoc(video, segment, index, now) {
  return {
    videoId: video.videoId,
    segmentId: `${video.videoId}-${String(index + 1).padStart(3, "0")}`,
    startSec: segment.startSec,
    endSec: segment.endSec,
    title: segment.title,
    description: segment.description,
    transcript: segment.transcript,
    tags: segment.tags,
    productLine: video.productLine,
    language: video.language,
    sourceType: video.sourceType,
    sourceUrl: `/api/video-files/${video.videoId}`,
    sourceFileName: video.fileName,
    thumbnailUrl: `/video-thumbnails/${video.videoId}-${String(index + 1).padStart(3, "0")}.jpg`,
    updatedAt: now,
  };
}

async function main() {
  loadLocalEnv();

  const { MONGODB_URI, MONGODB_DB } = process.env;

  if (!MONGODB_URI || !MONGODB_DB) {
    throw new Error("Missing MONGODB_URI or MONGODB_DB. Set them in ui-demo/.env.local or the shell environment.");
  }

  if (!existsSync(videoSourceDir)) {
    throw new Error(`Missing video source directory: ${videoSourceDir}`);
  }

  const now = new Date();
  const client = new MongoClient(MONGODB_URI);

  await client.connect();

  try {
    const db = client.db(MONGODB_DB);
    const videos = db.collection("videos");
    const segments = db.collection("video_segments");
    let seededVideos = 0;
    let seededSegments = 0;

    for (const video of videoSpecs) {
      const sourcePath = path.join(videoSourceDir, video.fileName);

      if (!existsSync(sourcePath)) {
        console.warn(`Skipping missing video file for ${video.videoId}`);
        continue;
      }

      const durationSec = readDurationSec(sourcePath);
      await videos.updateOne(
        { videoId: video.videoId },
        {
          $set: {
            videoId: video.videoId,
            title: video.title,
            sourceUrl: `/api/video-files/${video.videoId}`,
            sourceFileName: video.fileName,
            sourcePath,
            durationSec,
            productLine: video.productLine,
            language: video.language,
            sourceType: video.sourceType,
            tags: video.tags,
            updatedAt: now,
          },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true },
      );
      seededVideos += 1;

      const generatedSegments = generateSegments(video, durationSec);
      const expectedSegmentIds = [];

      for (const [index, segment] of generatedSegments.entries()) {
        const doc = segmentDoc(video, segment, index, now);
        expectedSegmentIds.push(doc.segmentId);
        await segments.updateOne(
          { segmentId: doc.segmentId },
          {
            $set: doc,
            $setOnInsert: { createdAt: now, embeddingStatus: "pending" },
          },
          { upsert: true },
        );
        seededSegments += 1;
      }

      await segments.deleteMany({ videoId: video.videoId, segmentId: { $nin: expectedSegmentIds } });
    }

    const [videoCount, segmentCount, pendingEmbeddingCount] = await Promise.all([
      videos.countDocuments({}),
      segments.countDocuments({}),
      segments.countDocuments({ embeddingStatus: "pending" }),
    ]);

    console.log(`Seeded or updated ${seededVideos} videos and ${seededSegments} video segments.`);
    console.log(`Current collection counts: videos=${videoCount}, video_segments=${segmentCount}, pending_embeddings=${pendingEmbeddingCount}`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
