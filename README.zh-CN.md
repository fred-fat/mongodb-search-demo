# Atlas Search PoC

本虚拟项目Aha360 是一个基于 MongoDB Atlas Search、Atlas Vector Search 和 Voyage AI 的智能搜索 PoC。它包含商品搜索 Demo、视频检索 Demo、视频多模态检索、视频上传自动处理和运营分析预览。

## 优先阅读

再次进入项目时，建议按顺序阅读：

1. `docs/project-status.md`：当前功能状态、是否有进行中的 feature、任务跟踪文件和 Demo 可用状态。
2. `docs/project-structure.md`：项目目录结构、文档约定、集合和索引说明。
3. `docs/architecture.md`：商品搜索和视频搜索的整体架构。
4. `ui-demo/README.md`：本地启动、环境变量和视频搜索 setup。

## 当前状态

| 模块 | 状态 | 跟踪文档 |
|---|---|---|
| 商品搜索 PoC | completed | `docs/features/product-search/task.md` |
| 商品搜索 UI Demo | completed | `docs/features/product-search/task.md` |
| 视频搜索 Demo | completed | `docs/features/video-search/task.md` |
| 视频多模态检索 | completed | `docs/features/video-multimodal-search/task.md` |
| 视频上传自动处理 | completed | `docs/features/video-upload-processing/task.md` |
| 当前进行中功能 | none | `docs/project-status.md` |

新增 feature 时，需要创建：

```text
docs/features/<feature-name>/task.md
```

并同步更新 `docs/project-status.md`。

## Demo 场景

商品搜索 Demo：

- 入口：`http://localhost:3000`
- 能力：关键词搜索、语义向量搜索、自动补全、错别字纠错、同义词、结构化过滤、业务权重排序、零结果兜底和运营分析预览。

视频搜索 Demo：

- 入口：`http://localhost:3000/video-search-lab`
- 架构说明页：`http://localhost:3000/video-search-architecture`
- 能力：视频上传、metadata 补充、自动分片、文本 embedding、多模态视频 embedding、全文检索、语义检索、多模态检索、pre-filter、可选 rerank、完整视频返回、命中片段标注、视频播放跳转和运营分析预览。

## 快速启动

```bash
cd ui-demo
npm install
cp .env.local.example .env.local
npm run dev
```

启动后访问：

```text
http://localhost:3000
```

## 环境变量配置

编辑 `ui-demo/.env.local`：

```bash
MONGODB_URI="<atlas connection string>"
MONGODB_DB="aha360_poc"
VOYAGE_API_KEY="<mongodb ai / voyage api key>"
```

这两个凭证都需要从 MongoDB Atlas 平台创建或获取。

### 配置 MongoDB URI

1. 在 MongoDB Atlas 中创建或选择一个 Cluster。
2. 在 `Database Access` 中创建数据库用户。
3. 给该用户授予 `aha360_poc` 数据库的 `readWrite` 权限。
4. 在 `Network Access` 中加入本机公网 IP。
5. 在 Atlas Cluster 页面点击 `Connect`。
6. 选择 `Drivers` 或 `Shell`。
7. 复制 `mongodb+srv://...` 连接串。
8. 替换用户名、密码和 cluster host 后写入 `.env.local` 的 `MONGODB_URI`。

不要提交 `.env.local`。

### 配置 Voyage AI API Key

1. 在 MongoDB Atlas 平台创建 MongoDB AI / Voyage AI API Key。
2. 将 key 写入 `.env.local` 的 `VOYAGE_API_KEY`。

本项目只调用Atlas平台的 Voyage AI API：

```text
https://ai.mongodb.com/v1/embeddings
https://ai.mongodb.com/v1/multimodalembeddings
https://ai.mongodb.com/v1/rerank
```

不要直接使用 Voyage 官方 endpoint。

## 视频搜索初始化

配置 `.env.local` 后，在 `ui-demo/` 内执行：

```bash
node scripts/seed-video-segments.mjs
node scripts/index-video-segments.mjs
node scripts/index-video-segments-multimodal.mjs
node scripts/create-video-search-indexes.mjs
node scripts/check-video-search-indexes.mjs
```

这些脚本会完成：

- 写入 `videos` 和 `video_segments`。
- 基于文本字段生成 `embedding`。
- 基于 video-only segment clip 生成 `multimodalEmbedding`。
- 创建或更新 `video_text_index`、`video_vector_index` 和 `video_multimodal_vector_index`。
- 验证全文检索、文本向量检索和多模态向量检索。

## 项目结构

```text
.
├── docs/
│   ├── project-status.md
│   ├── project-structure.md
│   ├── architecture.md
│   ├── customer-context.md
│   └── features/
│       ├── product-search/
│       │   ├── task.md
│       │   └── poc-guide.md
│       ├── video-search/
│       │   └── task.md
│       ├── video-multimodal-search/
│       │   └── task.md
│       └── video-upload-processing/
│           └── task.md
├── ui-demo/                         # Next.js 交互 Demo
├── video-src/                       # 本地种子视频素材，默认不提交
├── uploaded-video-src/              # 本地上传视频，默认不提交
├── README.md
└── README.zh-CN.md
```

## 关键文档

| 文档 | 说明 |
|---|---|
| `docs/project-status.md` | 当前项目状态和 feature 跟踪入口。 |
| `docs/project-structure.md` | 项目结构、集合、索引和文档约定。 |
| `docs/architecture.md` | 当前整体架构。 |
| `docs/customer-context.md` | 背景、需求和能力映射。 |
| `docs/features/product-search/task.md` | 商品搜索功能状态和回归检查。 |
| `docs/features/product-search/poc-guide.md` | 商品搜索 PoC 自助复现指南。 |
| `docs/features/video-search/task.md` | 视频搜索功能状态、索引和回归检查。 |
| `docs/features/video-multimodal-search/task.md` | 多模态视频检索任务记录。 |
| `docs/features/video-upload-processing/task.md` | 视频上传、自动分片和 embedding 处理任务记录。 |
| `ui-demo/README.md` | UI 工程启动和开发说明。 |

## 上传 GitHub 前检查

- 不要提交 `.env.local`。
- 不要提交 `.next/`、`node_modules/`。
- 不要提交 `video-src/` 或 `uploaded-video-src/` 中的大视频文件，除非确认素材可公开。
- 不要提交真实 MongoDB URI、数据库密码或 API Key。
- 在 `ui-demo/` 中运行 `npm run lint` 和 `npm run build`。
