# Customer Context: MongoDB Atlas Search Feasibility

## 1. 项目背景

客户当前使用或参考的是云厂商 Legacy Search 类搜索方案，核心场景是商品搜索、搜索推荐、搜索运营分析和多语言检索。现有方案能够覆盖传统关键词检索、分词、过滤、排序、下拉提示、同义词和部分运营分析能力，但在 AI 语义理解、跨语言语义召回、搜索链路简化和智能推荐方面存在明显短板。

本项目目标是评估 MongoDB Atlas 是否能够替代并增强现有 Legacy Search 方案，尤其验证 Atlas Search、Atlas Vector Search、MongoDB 聚合分析和 Atlas Charts 是否能共同支撑客户的搜索、推荐、分析与调试需求。

## 2. 客户核心痛点

- 现有 Legacy Search 系统缺乏 AI 能力，主要依赖关键词分词匹配，无法理解用户真实语义意图。
- 商品搜索涉及大量字段，存在 200+ 字段检索、过滤和排序需求，传统搜索链路配置和维护复杂。
- 数据同步依赖 MySQL 或 PolarDB Binlog 监听，链路较长，增加了延迟、故障点和运维成本。
- 搜索排序不仅需要文本相关性，还要融合业务权重，例如商品权重、销售权重或运营干预权重。
- 需要支持多语言和跨语言搜索，包括中文、英文、法语、日语、德语和亚太语系。
- 需要搜索辅助能力，包括下拉提示、热搜、底纹、纠错、同义词、黑白名单和无结果兜底推荐。
- 需要运营分析后台，统计 PV、UV、CTR、翻页率、留存率、购买率等指标。
- 需要调试能力，能够查看分词结果、搜索调用链和排序得分细节。
- 需要支持合规分区部署，满足不同国家或地区的数据合规要求。

## 3. 需求范围梳理

### 3.1 搜索与召回能力

- 多字段关键词搜索，支持商品名、描述、分类、标签和其他业务字段。
- 文本过滤能力，例如按语言、分类、标签、价格区间等条件过滤。
- 拼写纠错和错别字容错。
- 同义词拓展，例如 `品牌词A -> 品牌词B`，或 `云台 <-> 稳定器`。
- 下拉提示和自动补全。
- 跨语言检索和多语言建索。
- 无结果兜底推荐。

### 3.2 排序与运营干预

- 支持文本相关性得分与业务权重组合排序。
- 支持类似粗排、精排的排序策略。
- 支持黑白名单干预。
- 支持热门商品、热搜词、底纹词等运营配置。

### 3.3 数据同步与运维

- 秒级数据同步。
- 当前参考方案为监听 MySQL 或 PolarDB Binlog。
- 需要降低同步链路复杂度。
- 需要可观察性、调用链调试和得分解释。

### 3.4 数据分析

- 搜索 PV、UV、CTR、翻页率、留存率、购买率分析。
- 用户搜索、点击、购买行为日志沉淀。
- 可视化运营报表。

## 4. MongoDB Atlas 可行性分析

### 4.1 AI 语义搜索

MongoDB Atlas 原生支持 Atlas Vector Search。商品名称、描述、标签和类目等文本可以生成 embedding 后写入 MongoDB 文档，之后通过向量检索实现语义召回。

这能够解决传统关键词搜索无法理解语义的问题。例如用户搜索“适合潜水拍摄的防水装备”，系统可以召回“潜水壳”“运动相机”“防雾配件”等语义相关商品，而不依赖完全命中的关键词。

### 4.2 关键词搜索与过滤

Atlas Search 基于 Apache Lucene，支持 `text`、`phrase`、`autocomplete`、`compound`、`facet`、`equals` 等能力。它可以覆盖商品搜索中的关键词分词、字段过滤、分类筛选、标签筛选、自动补全和同义词召回。

对于 `language = "zh-CN"`、`category = "配件"`、`tags` 包含某个标签等场景，可以通过 `compound.filter` 或结构化查询实现高效过滤。

### 4.3 多语言与跨语言

Atlas Search 内置多种 Lucene Analyzer，包括中文、英文、日文、德文、法文等语言分析器。可以按字段或按语言字段分别配置不同 analyzer。

跨语言搜索建议通过多语言 embedding 模型实现。用户输入任意语言后生成 query vector，再与商品向量进行相似度匹配，从而实现跨语言语义召回。

### 4.4 排序与业务权重

Atlas Search 支持搜索相关性评分，也可以结合文档中的业务字段进行排序。对于商品搜索，可以将 BM25 文本得分与 `sale_weight`、商品运营权重、库存状态或转化率等字段组合，形成复合排序。

这可以替代 Legacy Search 中粗排和精排的部分配置。由于 MongoDB 文档数据与搜索索引在同一平台内，很多场景无需额外搬运候选集到外部服务二次计算。

### 4.5 下拉提示、纠错和同义词

- 下拉提示：Atlas Search 提供 `autocomplete` 算子。
- 拼写纠错：`text` 查询支持 `fuzzy` 参数，可配置编辑距离。
- 同义词：Atlas Search 支持 Synonym Mapping，可以通过集合维护同义词词典。
- 黑白名单：可通过查询条件、过滤条件、boost 或应用层逻辑实现。

### 4.6 数据同步

如果核心商品数据迁移到 MongoDB Atlas，Atlas Search 可以基于 MongoDB 内部变更自动异步更新索引，避免额外维护 Binlog 监听链路。

如果主库继续保留 MySQL 或 PolarDB，可通过 Kafka Connect、Debezium、云厂商 DTS 或自研同步服务，将 Binlog 变更同步到 MongoDB Atlas，继续保持秒级更新。

### 4.7 搜索运营分析

用户搜索、曝光、点击、加购、购买等行为可以写入 MongoDB 日志集合。之后通过 Aggregation Pipeline 统计 PV、UV、CTR、翻页率、留存率、购买率等指标。

Atlas Charts 可以直接基于 MongoDB 数据构建搜索运营大盘，减少额外 BI 或报表系统的接入成本。

### 4.8 调试与可观察性

Atlas Search 支持 explain，用于查看查询计划、分词细节、Lucene 得分拆解、BM25 权重和排序依据。这可以满足开发人员对搜索召回、排序和相关性调优的调试需求。

## 5. 推荐架构方向

### 5.1 推荐方案：MongoDB Atlas 一体化搜索架构

推荐将商品主数据或搜索数据统一存储在 MongoDB Atlas 中，并在同一集合上同时启用 Atlas Search 和 Atlas Vector Search。

该方案的核心优势是：

- 数据库、全文搜索、向量搜索和结构化过滤统一在 MongoDB Atlas 中完成。
- 数据更新后搜索索引自动异步同步，无需单独维护 Binlog 到搜索引擎的同步链路。
- 同一份商品文档可以同时支持关键词搜索、语义搜索、混合搜索和业务过滤。
- 搜索行为日志也可以写入 MongoDB，用聚合管道和 Atlas Charts 形成运营分析闭环。

### 5.2 兼容方案：保留原主库，Atlas 承载搜索与 AI 检索

如果客户短期内不能迁移主数据库，可以保留 MySQL 或 PolarDB 作为主库，通过 Binlog 同步链路把商品数据写入 MongoDB Atlas。

MongoDB Atlas 在该模式下承担搜索索引、向量检索、同义词、自动补全、过滤和运营分析能力。该方案迁移风险较低，但仍需要维护同步链路。

## 6. PoC 验证重点

当前项目已经围绕 Aha360 商品搜索场景完成 PoC 任务设计，重点验证以下能力：

- 商品测试数据导入。
- 使用 `voyage-4-large` 生成商品描述向量。
- 创建 Atlas Search 全文索引。
- 创建 Atlas Vector Search 向量索引。
- 语义向量检索。
- 关键词搜索与业务权重排序。
- Autocomplete 前缀联想。
- 错别字模糊搜索。
- 同义词干预。
- 分类与标签联合过滤。
- 零结果兜底推荐。
- 最终验收与可复现结果整理。

根据现有 `docs/features/product-search/task.md`，PoC 中 Task 1-14 已全部通过，说明 MongoDB Atlas 能够覆盖当前核心搜索需求，并且在 AI 语义检索方面具备明显增强价值。

## 7. 结论

MongoDB Atlas 具备替代并增强云厂商 Legacy Search 类方案的可行性。它不仅可以覆盖传统搜索中的关键词检索、过滤、排序、自动补全、纠错、同义词和运营干预，还可以通过 Atlas Vector Search 补齐客户最关注的 AI 语义理解能力。

对于客户而言，MongoDB Atlas 的核心价值包括：

- 搜索架构简化，减少数据库到外部搜索引擎的同步链路。
- 文本搜索、向量搜索和结构化过滤一体化。
- 支持语义搜索、跨语言搜索和混合检索。
- 支持搜索运营数据沉淀、聚合分析和可视化报表。
- 支持全球多区域部署，满足合规和数据驻留要求。

综合评估，MongoDB Atlas 不只是 Legacy Search 的替代品，更适合作为下一代智能商品搜索与搜索分析平台的基础设施。

## 8. 客户需求与当前实现矩阵

| 分类 | 子功能模块 | 需求 / 功能描述 | Atlas / 当前 Demo 实现说明 |
|---|---|---|---|
| 基础搜索功能 | 关键词分词搜索 | 基础的商品 / 业务数据分词匹配，获取结果列表。 | Atlas Search 使用 `default` 全文索引，`name` 和 `description` 配置 `string` 类型，并使用 `lucene.chinese` 中文 analyzer。当前 Demo 中“自拍杆业务权重”场景通过 `$search.text` 查询 `name/description` 返回商品列表。 |
| 基础搜索功能 | 搜索推荐 | 搜索框下方的热搜列表、框内默认的底纹提示。 | 当前 Demo 已把搜索和点击事件写入 `search_events`，并在运营分析预览中聚合热门搜索词。生产环境可基于 `search_events` 或 Stream Processing 生成热搜词、底纹词、推荐 query。 |
| 基础搜索功能 | 搜索过滤 | 单一维度过滤，如只搜指定语种 `language = "zh-CN"` 的商品。 | Atlas Search 可通过 `compound.filter` 对结构化字段做过滤。当前 Demo 已实现 `category` 和 `tags` 过滤。 |
| 基础搜索功能 | AI 语义理解 | 解决关键词系统无法理解用户真实意图的问题。 | Atlas Vector Search 使用 `description_embedding` 向量字段和 `vector_index`。当前 Demo 使用 `voyage-4-large` 生成 1024 维向量。 |
| 基础搜索功能 | 海量字段与秒级同步 | 支持 200+ 字段检索；RDS / PolarDB 数据秒级同步到搜索中。 | Atlas Search 支持多字段索引映射。若主数据在 MongoDB Atlas，Search 索引自动异步更新；若保留 RDS / PolarDB，可通过 Debezium、Kafka Connect、DTS 或自研 Binlog 同步写入 MongoDB。 |
| 基础搜索功能 | 多语言支持 | 英、法、日、德等语言按语系建索引，亚太语义识别。 | Atlas Search 支持多语言 analyzer，语义层面可通过多语言 embedding 模型实现跨语义召回。当前 Demo 主要验证中文。 |
| 基础搜索功能 | 意图识别与纠错 | 拼写纠错、错别字容错、同义词替换和拓展。 | 当前 Demo 使用 `$search.text` + `fuzzy.maxEdits = 1` 实现错别字容错，使用 `synonyms_collection` 实现“云台 / 稳定器”互相召回。 |
| 基础搜索功能 | 两阶段排序 | 粗排控制检索性能，精排结合商品权重算分。 | 当前 Demo 展示简化版排序：`weightedScore = searchScore * sale_weight`。生产可扩展为候选召回、业务特征打分、库存、运营 boost 等多因子排序。 |
| 基础搜索功能 | 下拉提示与动态干预 | 搜索框输入联想，支持多字段来源和黑 / 白名单干预。 | 当前 Demo 使用 `$search.autocomplete` 查询 `name` 字段。黑白名单可通过运营集合、过滤、boost 或后处理实现。 |
| 基础搜索功能 | 多分类与类目预测 | 支持最小粒度类目、标签筛选；通过历史行为预测关联类目。 | 当前 Demo 已通过 `category` 和 `tags` 展示分类与标签过滤。类目预测可基于 `search_events` 离线训练或规则化生成。 |
| 基础搜索功能 | 跨语言搜索 | 支持在 A 语言页面搜出 B 语言内容。 | 可结合多语言 analyzer 和多语言 embedding 实现。当前 Demo 未做跨语言专项演示。 |
| 基础搜索功能 | 无结果推荐 | 搜索无结果时，基于用户点击频率推荐商品。 | 当前 Demo 中“无结果兜底”先做严格查询，首轮 0 结果后按 `sale_weight` 返回 Top 3 热销商品。 |
| 基础搜索功能 | 合规分区部署 | 服务器需支持合规分区部署。 | MongoDB Atlas 支持多区域部署、数据驻留、分区部署和不同云厂商 / 区域选择。 |
| 额外 / 运维功能 | 数据采集 2.0 | 客户端 SDK 上报，统计 PV、CTR、翻页率、留存率、购买率等指标。 | 当前 Demo 已实现轻量事件采集：搜索成功和点击会写入 `search_events`，并聚合 PV、UV、Clicks、CTR、热门搜索词、零结果搜索词。 |
| 额外 / 运维功能 | 数据同步方式 | 提供 OpenAPI 写入同步，以及自动监听 MySQL Binlog 同步两种方式。 | 当前 Demo 直接使用 MongoDB Atlas 数据。生产可通过 OpenAPI / 后端服务写入 MongoDB，或通过 Debezium、Kafka Connect、DTS、自研 Binlog 同步服务同步到 Atlas。 |
| 额外 / 运维功能 | 搜索分析与调试 | 在运营后台查看完整调用链路、分词情况及排序算分回溯。 | 当前 Demo 提供 `Search Debug Panel`，展示 mode、index、pipeline、耗时、fallback、filters、Top scores 等调试信息。 |
