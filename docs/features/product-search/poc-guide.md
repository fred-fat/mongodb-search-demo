# MongoDB Atlas Search / Vector Search 自助 PoC 操作指南

本文档用于在一个全新的 MongoDB Atlas M10 集群上，自助复现已经演示过的 Aha360 商品搜索 PoC。客户按顺序执行本文中的数据导入、向量生成、索引创建和查询语句后，可以验证以下能力：

- 语义向量搜索
- 关键词搜索
- 业务权重排序
- Autocomplete 前缀联想
- 错别字模糊搜索
- 同义词召回
- 分类与标签联合过滤
- 零结果兜底推荐

本文档不依赖 UI 工程，所有核心步骤都可以直接在 `mongosh` 中执行。

---

## 目录

- [0. 开始之前](#0-开始之前)
- [1. 架构总览](#1-架构总览)
- [2. 环境准备](#2-环境准备)
- [3. 数据准备](#3-数据准备)
- [4. 索引创建](#4-索引创建)
- [5. 七个查询场景](#5-七个查询场景)
- [6. 调试与排序原理](#6-调试与排序原理)
- [7. 扩展实验](#7-扩展实验)
- [8. 常见问题](#8-常见问题)
- [9. 生产化建议](#9-生产化建议)
- [10. 可选：拉起 UI Demo](#10-可选拉起-ui-demo)
- [11. 清理与下线](#11-清理与下线)
- [附录 A：完整商品数据](#附录-a完整商品数据)
- [附录 B：完整索引定义](#附录-b完整索引定义)
- [附录 C：查询语句汇总](#附录-c查询语句汇总)
- [附录 D：术语表](#附录-d术语表)
- [附录 E：参考资料](#附录-e参考资料)

---

## 0. 开始之前

### 0.1 需要准备的资源

请在执行本文之前准备好以下资源：

| 资源 | 要求 | 说明 |
|---|---|---|
| MongoDB Atlas 账号 | 必须 | 用于创建 M10 集群、数据库用户、网络白名单和 Search 索引 |
| Atlas 集群 | M10 或更高 | 本 PoC 使用 Atlas Vector Search，建议使用 M10 或更高规格 |
| 数据库用户 | `readWrite` 权限 | 至少需要对 `aha360_poc` 数据库有读写权限 |
| 网络白名单 | 本机 IP 或公司出口 IP | 否则 `mongosh` 无法连接集群 |
| `mongosh` | 推荐 2.x 或更新版本 | 用于执行本文中的 JavaScript 语句 |
| Embedding API Key | Atlas 平台 Voyage AI API Key | 用于生成 `description_embedding` 向量 |

### 0.2 为什么建议 M10

本 PoC 同时使用 Atlas Search 和 Atlas Vector Search。建议客户直接使用 M10 或更高规格集群，以避免免费/共享规格集群在搜索索引、向量搜索和性能能力上的限制。

### 0.3 本文使用的固定命名

| 对象 | 名称 |
|---|---|
| 数据库 | `aha360_poc` |
| 商品集合 | `products` |
| 同义词集合 | `synonyms_collection` |
| 全文搜索索引 | `default` |
| 向量搜索索引 | `vector_index` |
| 向量字段 | `description_embedding` |
| Embedding 模型 | `voyage-4-large` |
| 向量维度 | `1024` |
| 向量相似度 | `cosine` |

### 0.4 检查点

执行下一章前，请确认：

- 已经有可用的 Atlas 账号
- 准备创建 M10 或更高规格集群
- 已经可以获取 Atlas 平台 Voyage AI API Key
- 本地可以安装并运行 `mongosh`

---

## 1. 架构总览

### 1.1 PoC 架构

```text
用户查询
  |
  |-- 关键词 / 前缀 / 错别字 / 同义词 / 过滤
  |       |
  |       v
  |   Atlas Search Index: default
  |       |
  |       v
  |   products 集合
  |
  |-- 自然语言需求
          |
          v
    Embedding API: voyage-4-large
          |
          v
    Atlas Vector Search Index: vector_index
          |
          v
       products.description_embedding

辅助数据：
  synonyms_collection -> default Search Index synonym mapping
```

### 1.2 七个场景与能力对应

| 场景 | 查询输入 | 验证能力 |
|---|---|---|
| 语义向量搜索 | `我想潜水去水下拍鱼，或者冲浪用，需要能防水防雾的装备` | 自然语言意图理解、Vector Search |
| 关键词 + 业务权重排序 | `自拍杆` | Atlas Search、BM25、业务权重排序 |
| Autocomplete 前缀联想 | `St`、`稳` | 搜索框下拉提示、前缀召回 |
| 错别字模糊搜索 | `全井相机` | 错别字容错、拼写纠错 |
| 同义词召回 | `云台` | 运营词库、同义词扩展 |
| 分类 + 标签过滤 | `category = 配件` 且 `tags = 骑行` | 结构化过滤、搜索结果页筛选 |
| 零结果兜底推荐 | `无人机苹果手机壳` | 零结果处理、热销推荐 |

### 1.3 数据流

1. 将 20 条商品写入 `products`。
2. 将同义词规则写入 `synonyms_collection`。
3. 对每条商品的 `description` 调用 Embedding API，生成 1024 维向量并写入 `description_embedding`。
4. 创建 Atlas Search 索引 `default`，支持中文分词、autocomplete、token 过滤和同义词。
5. 创建 Atlas Vector Search 索引 `vector_index`，索引 `description_embedding`。
6. 执行七个查询场景，检查 Top 结果是否符合预期。

### 1.4 检查点

执行下一章前，请确认你理解以下关系：

- `products` 是商品主集合
- `synonyms_collection` 是同义词配置集合
- `default` 负责全文、补全、纠错、同义词、过滤
- `vector_index` 负责语义向量搜索

---

## 2. 环境准备

### 2.1 创建 Atlas M10 集群

在 Atlas 控制台中执行以下操作：

1. 创建一个 Project，或使用已有 Project。
2. 创建一个 Dedicated Cluster。
3. Cluster Tier 选择 `M10` 或更高。
4. Cloud Provider 和 Region 根据客户网络和合规要求选择。
5. 等待集群状态变为可用。

### 2.2 配置数据库用户

在 Atlas 控制台中进入 `Database Access`，创建数据库用户：

- Username：可自定义，例如 `aha360_poc_user`
- Password：客户自行生成强密码
- Role：对 `aha360_poc` 数据库授予 `readWrite`

即使是 PoC，也应优先只对 `aha360_poc` 数据库授予 `readWrite`，避免授予跨数据库写权限。

### 2.3 配置网络白名单

在 Atlas 控制台中进入 `Network Access`：

- 添加本机公网 IP
- 或添加公司出口 IP/CIDR
- 不建议长期开放 `0.0.0.0/0`

### 2.4 获取连接串

在 Atlas 集群页面点击 `Connect`，选择 `Shell`，复制连接串，格式类似：

```text
mongodb+srv://<username>:<password>@<cluster-host>/?retryWrites=true&w=majority
```

### 2.5 准备 Atlas 平台 Voyage AI API Key

本 PoC 统一使用 Atlas 平台提供的 Voyage AI，不使用 Voyage 官网 API。Embedding 请求固定发送到 MongoDB AI Gateway：

```text
https://ai.mongodb.com/v1/embeddings
```
使用模型：

```text
voyage-4-large
```

### 2.6 导出本地环境变量

macOS / Linux：

```bash
export MONGODB_URI='mongodb+srv://<username>:<password>@<cluster-host>/?retryWrites=true&w=majority'
export VOYAGE_API_KEY='<atlas-platform-voyage-ai-api-key>'
```

Windows PowerShell：

```powershell
$env:MONGODB_URI='mongodb+srv://<username>:<password>@<cluster-host>/?retryWrites=true&w=majority'
$env:VOYAGE_API_KEY='<atlas-platform-voyage-ai-api-key>'
```

### 2.7 连接 Atlas

```bash
mongosh "$MONGODB_URI"
```

连接成功后执行：

```javascript
use aha360_poc;
db.runCommand({ ping: 1 });
```

期望返回：

```javascript
{ ok: 1 }
```

### 2.8 检查点

执行下一章前，请确认：

- 可以通过 `mongosh` 连接 Atlas 集群
- 已经切换到 `aha360_poc`
- 已经配置 `VOYAGE_API_KEY`
- 连接用户对 `aha360_poc` 有读写权限

---

## 3. 数据准备

### 3.1 切换数据库

```javascript
use aha360_poc;
```

### 3.2 导入 20 条商品

执行附录 A 中的完整 `insertMany` 语句。

执行后验证：

```javascript
db.products.countDocuments({});
```

期望输出：

```text
20
```

### 3.3 导入同义词

```javascript
db.synonyms_collection.deleteMany({});

db.synonyms_collection.insertOne({
  mappingType: 'equivalent',
  synonyms: ['云台', '稳定器']
});
```

验证：

```javascript
db.synonyms_collection.find({}, { _id: 0 }).toArray();
```

期望输出包含：

```javascript
[
  {
    mappingType: 'equivalent',
    synonyms: ['云台', '稳定器']
  }
]
```

### 3.4 生成商品描述向量：Atlas 平台 Voyage AI

在 `mongosh` 中执行以下语句。这里使用 Atlas 平台的 Voyage AI endpoint：`https://ai.mongodb.com/v1/embeddings`。

```javascript
const key = process.env.VOYAGE_API_KEY;

if (!key) {
  throw new Error('Missing VOYAGE_API_KEY environment variable');
}

const docs = db.products
  .find({}, { id: 1, description: 1 })
  .sort({ id: 1 })
  .toArray();

const resp = await fetch('https://ai.mongodb.com/v1/embeddings', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer ' + key,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'voyage-4-large',
    input: docs.map((d) => d.description),
    input_type: 'document'
  })
});

if (!resp.ok) {
  throw new Error('Embedding request failed: HTTP ' + resp.status + ' ' + await resp.text());
}

const data = await resp.json();

for (let i = 0; i < docs.length; i++) {
  db.products.updateOne(
    { _id: docs[i]._id },
    { $set: { description_embedding: data.data[i].embedding } }
  );
}

db.products.countDocuments({ description_embedding: { $exists: true } });
```

期望输出：

```text
20
```

### 3.5 验证向量维度

```javascript
db.products.aggregate([
  {
    $project: {
      _id: 0,
      id: 1,
      name: 1,
      vectorLength: { $size: '$description_embedding' }
    }
  },
  {
    $group: {
      _id: null,
      count: { $sum: 1 },
      minDimensions: { $min: '$vectorLength' },
      maxDimensions: { $max: '$vectorLength' }
    }
  }
]);
```

期望输出：

```javascript
[
  {
    _id: null,
    count: 20,
    minDimensions: 1024,
    maxDimensions: 1024
  }
]
```

### 3.6 检查点

执行下一章前，请确认：

- `products` 有 20 条商品
- `synonyms_collection` 有 1 条同义词规则
- 20 条商品均包含 `description_embedding`
- 所有向量长度均为 1024

---

## 4. 索引创建

### 4.1 创建 Atlas Search 索引 `default`

在 `mongosh` 中执行：

```javascript
db.products.createSearchIndex('default', {
  analyzer: 'lucene.chinese',
  mappings: {
    dynamic: false,
    fields: {
      name: [
        { type: 'string', analyzer: 'lucene.chinese' },
        {
          type: 'autocomplete',
          analyzer: 'lucene.chinese',
          tokenization: 'edgeGram',
          minGrams: 1,
          maxGrams: 20
        }
      ],
      description: { type: 'string', analyzer: 'lucene.chinese' },
      category: { type: 'token' },
      tags: { type: 'token' }
    }
  },
  synonyms: [
    {
      name: 'aha360_synonyms',
      analyzer: 'lucene.chinese',
      source: { collection: 'synonyms_collection' }
    }
  ]
});
```

配置说明：

| 配置 | 作用 | 对应功能 |
|---|---|---|
| `analyzer: 'lucene.chinese'` | 使用中文分词分析器 | 中文关键词、纠错、同义词 |
| `dynamic: false` | 只索引显式配置字段 | 控制索引范围，减少噪音 |
| `name` 的 `string` 类型 | 支持商品名称全文检索 | 关键词搜索、错别字纠错 |
| `name` 的 `autocomplete` 类型 | 支持前缀联想 | 搜索框下拉提示 |
| `autocomplete.tokenization: 'edgeGram'` | 从词首生成前缀 token | `St` 可匹配 Stabilizer 系列 |
| `description` 的 `string` 类型 | 支持商品描述全文检索 | 关键词、同义词 |
| `category` 的 `token` 类型 | 支持分类精确过滤 | 分类筛选 |
| `tags` 的 `token` 类型 | 支持标签精确过滤 | 标签筛选 |
| `synonyms.name` | 定义查询时引用的同义词映射名称 | 同义词召回 |
| `synonyms.source.collection` | 指向同义词来源集合 | 运营维护词库 |

### 4.2 创建 Atlas Vector Search 索引 `vector_index`

```javascript
db.products.createSearchIndex('vector_index', {
  fields: [
    {
      type: 'vector',
      path: 'description_embedding',
      numDimensions: 1024,
      similarity: 'cosine'
    }
  ]
});
```

配置说明：

| 配置 | 作用 |
|---|---|
| `type: 'vector'` | 声明这是向量字段 |
| `path: 'description_embedding'` | 指定商品描述向量字段 |
| `numDimensions: 1024` | 必须与 embedding 输出维度一致 |
| `similarity: 'cosine'` | 使用余弦相似度比较语义接近度 |

### 4.3 等待索引就绪

索引创建后需要等待状态变为 `READY`。

```javascript
db.products.getSearchIndexes().toArray();
```

期望看到：

```text
default      READY
vector_index READY
```

实际返回字段会随 Atlas / mongosh 版本略有不同，重点检查 `status` 或 `queryable`。

### 4.4 检查点

执行下一章前，请确认：

- `default` 索引已创建并处于 READY
- `vector_index` 索引已创建并处于 READY
- `default` 索引中包含同义词 mapping `aha360_synonyms`

---

## 5. 七个查询场景

本章所有查询都可以直接在 `mongosh` 中执行。为了便于复制，语句中尽量只使用 `db.products.aggregate(...)` 和少量变量。

### 5.1 场景 1：语义向量检索 - 潜水防水装备

业务问题：用户不知道准确商品名，只用自然语言描述需求，例如“我想潜水去水下拍鱼”。传统关键词搜索可能无法覆盖全部意图。

对应能力：Atlas Vector Search + Embedding 语义召回。

查询文本：

```text
我想潜水去水下拍鱼，或者冲浪用，需要能防水防雾的装备
```

先生成 query vector：

```javascript
const key = process.env.VOYAGE_API_KEY;
const semanticQuery = '我想潜水去水下拍鱼，或者冲浪用，需要能防水防雾的装备';

const queryResp = await fetch('https://ai.mongodb.com/v1/embeddings', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer ' + key,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'voyage-4-large',
    input: [semanticQuery],
    input_type: 'query'
  })
});

if (!queryResp.ok) {
  throw new Error('Embedding request failed: HTTP ' + queryResp.status + ' ' + await queryResp.text());
}

const queryVector = (await queryResp.json()).data[0].embedding;
```

执行向量搜索：

```javascript
db.products.aggregate([
  {
    $vectorSearch: {
      index: 'vector_index',
      path: 'description_embedding',
      queryVector,
      numCandidates: 20,
      limit: 3
    }
  },
  { $addFields: { vectorSearchScore: { $meta: 'vectorSearchScore' } } },
  {
    $project: {
      _id: 0,
      id: 1,
      name: 1,
      description: 1,
      category: 1,
      tags: 1,
      vectorSearchScore: 1
    }
  }
]);
```

期望结果：

| 排名 | 商品 | 说明 |
|---|---|---|
| Top 1 | `p14 Aha360 ActionCam Pro 潜水套装` | 包含潜水、防水、防雾、水下等语义 |
| Top 2 | `p5 Aha360 MiniCam Ultra 专属深潜水壳` | 明确匹配深潜水壳、防水、防雾 |
| Top 3 | `p3 Aha360 ActionCam Pro 2 运动相机` | 描述中包含潜水、冲浪、防水 |

逐行解读：

- `input_type: 'query'` 表示当前 embedding 是用户查询向量。
- `$vectorSearch.index` 指向 `vector_index`。
- `path` 指向商品文档中的 `description_embedding`。
- `numCandidates` 是候选召回数量，PoC 数据量小，设置为 20 即可。
- `vectorSearchScore` 是向量相似度得分。

扩展实验：把查询改成 `我要给骑行拍摄找稳定的固定支架`，观察是否召回骑行支架和摩托车配件。

### 5.2 场景 2：关键词 + 业务权重排序 - 自拍杆

业务问题：商品搜索不能只按文本相关性排序，还需要叠加销量、利润、库存或运营权重。

对应能力：Atlas Search BM25 相关性 + 应用层业务排序表达式。

查询：

```javascript
db.products.aggregate([
  {
    $search: {
      index: 'default',
      text: {
        query: '自拍杆',
        path: ['name', 'description']
      }
    }
  },
  { $addFields: { searchScore: { $meta: 'searchScore' } } },
  { $addFields: { weightedScore: { $multiply: ['$searchScore', '$sale_weight'] } } },
  { $sort: { weightedScore: -1, searchScore: -1, id: 1 } },
  { $limit: 8 },
  {
    $project: {
      _id: 0,
      id: 1,
      name: 1,
      category: 1,
      tags: 1,
      sale_weight: 1,
      searchScore: 1,
      weightedScore: 1
    }
  }
]);
```

期望 Top 3：

| 排名 | 商品 | 说明 |
|---|---|---|
| Top 1 | `p6 Aha360 114cm 闪速隐形自拍杆` | 文本相关且 `sale_weight = 1.3` |
| Top 2 | `p7 Aha360 2合1隐形自拍杆 + 三脚架` | 文本相关但权重略低 |
| Top 3 | `p2 Aha360 X-Series Lite 8K全景口袋相机` | 描述中有隐形自拍杆视角 |

逐行解读：

- `$search.text` 用于关键词全文搜索。
- `path: ['name', 'description']` 表示同时搜索商品名和商品描述。
- `$meta: 'searchScore'` 取出 Atlas Search 相关性得分。
- `weightedScore = searchScore * sale_weight` 模拟业务排序权重。
- 生产中可以把 `sale_weight` 替换成销量、利润、库存、转化率等字段。

扩展实验：把 `weightedScore` 改成 `searchScore * (sale_weight + 0.2)`，观察排序是否变化。

### 5.3 场景 3：Autocomplete 前缀联想 - St / 稳

业务问题：搜索框需要在用户输入早期就给出候选词或候选商品，降低输入成本。

对应能力：Atlas Search autocomplete。

英文前缀查询：

```javascript
db.products.aggregate([
  {
    $search: {
      index: 'default',
      autocomplete: {
        query: 'St',
        path: 'name'
      }
    }
  },
  { $addFields: { searchScore: { $meta: 'searchScore' } } },
  { $project: { _id: 0, id: 1, name: 1, searchScore: 1 } },
  { $limit: 5 }
]);
```

期望结果包含：

| 商品 |
|---|
| `p20 Aha360 Stabilizer Series 聚光灯补光配件` |
| `p8 Aha360 Stabilizer Pro AI 手机稳定器` |
| `p9 Aha360 Stabilizer AI 追踪手机云台` |

中文前缀查询：

```javascript
db.products.aggregate([
  {
    $search: {
      index: 'default',
      autocomplete: {
        query: '稳',
        path: 'name'
      }
    }
  },
  { $addFields: { searchScore: { $meta: 'searchScore' } } },
  { $project: { _id: 0, id: 1, name: 1, searchScore: 1 } },
  { $limit: 5 }
]);
```

期望结果包含：

| 商品 |
|---|
| `p8 Aha360 Stabilizer Pro AI 手机稳定器` |

逐行解读：

- `autocomplete` 只能用于索引中配置了 `type: 'autocomplete'` 的字段。
- 当前只给 `name` 配置了 autocomplete，因此路径是 `name`。
- 生产中可以对品牌词、类目词、搜索 query 词库分别建立补全能力。

扩展实验：把 `query` 改成 `In`，观察是否召回更多 Aha360 Demo 商品。

### 5.4 场景 4：错别字模糊搜索 - 全井相机

业务问题：用户输入错别字时，系统应该尽量召回正确商品，而不是直接无结果。

对应能力：Atlas Search fuzzy。

查询：

```javascript
db.products.aggregate([
  {
    $search: {
      index: 'default',
      text: {
        query: '全井相机',
        path: 'name',
        fuzzy: { maxEdits: 1 }
      }
    }
  },
  { $addFields: { searchScore: { $meta: 'searchScore' } } },
  { $addFields: { weightedScore: { $multiply: ['$searchScore', '$sale_weight'] } } },
  { $sort: { weightedScore: -1, searchScore: -1, id: 1 } },
  { $limit: 8 },
  {
    $project: {
      _id: 0,
      id: 1,
      name: 1,
      category: 1,
      tags: 1,
      sale_weight: 1,
      searchScore: 1,
      weightedScore: 1
    }
  }
]);
```

期望结果包含：

| 商品 |
|---|
| `p1 Aha360 X-Series Pro 旗舰全景相机` |
| `p2 Aha360 X-Series Lite 8K全景口袋相机` |

逐行解读：

- 用户输入 `全井相机`，真实意图是 `全景相机`。
- `fuzzy.maxEdits = 1` 允许 1 次编辑距离。
- `path: 'name'` 限定商品名，避免描述字段过宽导致噪音变多。

扩展实验：把 `maxEdits` 改成 2，观察召回数量是否增加，以及结果是否更噪。

### 5.5 场景 5：同义词召回 - 云台 / 稳定器

业务问题：用户叫法和商品标准词不一致。例如用户搜“云台”，商品可能写“稳定器”。

对应能力：Atlas Search synonym mapping。

查询：

```javascript
db.products.aggregate([
  {
    $search: {
      index: 'default',
      text: {
        query: '云台',
        path: 'description',
        synonyms: 'aha360_synonyms'
      }
    }
  },
  { $addFields: { searchScore: { $meta: 'searchScore' } } },
  { $addFields: { weightedScore: { $multiply: ['$searchScore', '$sale_weight'] } } },
  { $sort: { weightedScore: -1, searchScore: -1, id: 1 } },
  { $limit: 8 },
  {
    $project: {
      _id: 0,
      id: 1,
      name: 1,
      category: 1,
      tags: 1,
      sale_weight: 1,
      searchScore: 1,
      weightedScore: 1
    }
  }
]);
```

期望结果包含：

| 商品 | 说明 |
|---|---|
| `p8 Aha360 Stabilizer Pro AI 手机稳定器` | 商品描述含稳定器，被云台同义词召回 |
| `p9 Aha360 Stabilizer AI 追踪手机云台` | 商品描述含云台 |
| `p20 Aha360 Stabilizer Series 聚光灯补光配件` | 描述含云台和稳定器 |

逐行解读：

- `synonyms: 'aha360_synonyms'` 必须与索引定义中的同义词名称一致。
- 同义词来源是 `synonyms_collection`。
- `mappingType: 'equivalent'` 表示“云台”和“稳定器”双向等价。

扩展实验：新增同义词 `['自拍杆', '拍摄杆']` 后重建或等待索引同步，再搜索 `拍摄杆`。

### 5.6 场景 6：分类 + 标签联合过滤 - 配件 + 骑行

业务问题：搜索结果页通常需要类目、标签、品牌、语言等结构化筛选条件。

对应能力：Atlas Search `compound.filter`。

查询：

```javascript
db.products.aggregate([
  {
    $search: {
      index: 'default',
      compound: {
        filter: [
          { equals: { path: 'category', value: '配件' } },
          { equals: { path: 'tags', value: '骑行' } }
        ],
        should: [
          {
            text: {
              query: '骑行',
              path: ['name', 'description']
            }
          }
        ]
      }
    }
  },
  { $addFields: { searchScore: { $meta: 'searchScore' } } },
  { $addFields: { weightedScore: { $multiply: ['$searchScore', '$sale_weight'] } } },
  { $sort: { weightedScore: -1, searchScore: -1, id: 1 } },
  { $limit: 8 },
  {
    $project: {
      _id: 0,
      id: 1,
      name: 1,
      category: 1,
      tags: 1,
      sale_weight: 1,
      searchScore: 1,
      weightedScore: 1
    }
  }
]);
```

期望结果：

| 排名 | 商品 | 说明 |
|---|---|---|
| Top 1 | `p10 Aha360 摩托车骑行配件套装` | 分类为配件，标签包含骑行，描述高度相关 |
| Top 2 | `p12 Aha360 胸带固定带` | 配件，标签包含骑行 |
| Top 3 | `p17 Aha360 X-Series Pro 镜头保护镜` | 配件，标签包含骑行 |

逐行解读：

- `filter` 只限定候选集，不主要参与打分。
- `equals` 查询要求字段在 Search 索引中配置为 `token`。
- `should` 中的文本查询用于给候选结果增加相关性区分。

扩展实验：删除 `should` 部分，只保留 `filter`，观察排序是否主要由默认分数和后续排序控制。

### 5.7 场景 7：零结果兜底推荐 - 无人机苹果手机壳

业务问题：搜索无结果时，页面不应该空白。可以返回热销、推荐或相关类目商品。

对应能力：严格首轮召回 + fallback 查询。

首轮严格查询：

```javascript
const first = db.products.aggregate([
  {
    $search: {
      index: 'default',
      compound: {
        must: [
          { text: { query: '无人机', path: ['name', 'description'] } },
          { text: { query: '苹果', path: ['name', 'description'] } },
          { text: { query: '手机壳', path: ['name', 'description'] } }
        ]
      }
    }
  },
  { $addFields: { searchScore: { $meta: 'searchScore' } } },
  { $project: { _id: 0, id: 1, name: 1, searchScore: 1 } },
  { $limit: 8 }
]).toArray();

first;
```

期望首轮结果：

```javascript
[]
```

fallback 查询：

```javascript
const fallback = first.length === 0
  ? db.products
      .find({}, { _id: 0, id: 1, name: 1, sale_weight: 1 })
      .sort({ sale_weight: -1, id: 1 })
      .limit(3)
      .toArray()
  : [];

fallback;
```

期望 fallback Top 3：

| 排名 | 商品 | `sale_weight` |
|---|---|---|
| Top 1 | `p13 Aha360 旗舰创作者套装` | 1.5 |
| Top 2 | `p1 Aha360 X-Series Pro 旗舰全景相机` | 1.45 |
| Top 3 | `p2 Aha360 X-Series Lite 8K全景口袋相机` | 1.4 |

逐行解读：

- 首轮使用 `compound.must`，要求 `无人机`、`苹果`、`手机壳` 三个条件都满足。
- 这样做可以避免简单全文查询因为 `手机` 等词误召回不相关商品。
- fallback 使用 `sale_weight` 最高的商品模拟热销推荐。

扩展实验：把 must 改成 should，观察是否会出现误召回。

### 5.8 本章检查点

完成本章后，请确认：

- 语义搜索能返回潜水、防水、冲浪相关商品
- `自拍杆` 查询中 `p6` 排在 `p7` 前面
- `St` 能补全 稳定器系列
- `全井相机` 能召回全景相机
- `云台` 能召回稳定器
- 分类标签过滤结果都满足 `category = 配件` 且 `tags` 包含 `骑行`
- 零结果首轮为空，fallback 返回 `p13/p1/p2`

---

## 6. 调试与排序原理

### 6.1 `searchScore`

`searchScore` 是 Atlas Search 对全文检索结果计算的相关性分数。它通常受以下因素影响：

- 查询词是否命中字段
- 命中字段的分词结果
- 词频和逆文档频率
- 字段长度
- 查询操作符配置，例如 fuzzy、synonyms、compound

获取方式：

```javascript
{ $addFields: { searchScore: { $meta: 'searchScore' } } }
```

### 6.2 `vectorSearchScore`

`vectorSearchScore` 是 Atlas Vector Search 返回的向量相似度得分。

获取方式：

```javascript
{ $addFields: { vectorSearchScore: { $meta: 'vectorSearchScore' } } }
```

它衡量的是 query vector 与商品 `description_embedding` 的语义接近程度，而不是关键词是否完全匹配。

### 6.3 业务权重排序

PoC 中使用：

```javascript
weightedScore = searchScore * sale_weight
```

这是一种简化的排序表达式。生产中可以替换为：

```text
weightedScore = searchScore * (1 + gmv_7d_weight + stock_weight + campaign_boost)
```

常见业务字段包括：

- 7 日销量
- 7 日 GMV
- 库存状态
- 毛利率
- 运营活动 boost
- 新品权重
- 用户点击率或转化率

### 6.4 `$searchMeta`

如果只想看命中数量或 facet，可以使用 `$searchMeta`。示例：

```javascript
db.products.aggregate([
  {
    $searchMeta: {
      index: 'default',
      count: { type: 'total' },
      text: {
        query: '自拍杆',
        path: ['name', 'description']
      }
    }
  }
]);
```

### 6.5 `explain()`

可以对聚合查询使用 explain，查看查询计划和执行细节：

```javascript
db.products.explain('executionStats').aggregate([
  {
    $search: {
      index: 'default',
      text: {
        query: '自拍杆',
        path: ['name', 'description']
      }
    }
  },
  { $limit: 5 }
]);
```

### 6.6 检查点

完成本章后，请确认你能解释：

- 为什么 `searchScore` 和 `vectorSearchScore` 不是同一种分数
- 为什么业务排序需要叠加 `sale_weight`
- 为什么过滤条件应该尽量放在 `$search.compound.filter` 中

---

## 7. 扩展实验

### 7.1 添加新商品并观察语义搜索变化

添加一条新商品：

```javascript
db.products.insertOne({
  id: 'p21',
  name: 'Aha360 水下冲浪拍摄套装',
  description: '专为冲浪、浮潜和水下旅行准备的防水拍摄套装，包含防雾保护壳、浮力手柄和安全绳。',
  category: '套装',
  tags: ['冲浪', '潜水', '防水', '防雾', '水下'],
  price: 1299,
  sale_weight: 1.21,
  language: 'zh-CN'
});
```

为新商品生成 embedding：

```javascript
const key = process.env.VOYAGE_API_KEY;
const doc = db.products.findOne({ id: 'p21' });

const resp = await fetch('https://ai.mongodb.com/v1/embeddings', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer ' + key,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'voyage-4-large',
    input: [doc.description],
    input_type: 'document'
  })
});

const embedding = (await resp.json()).data[0].embedding;
db.products.updateOne({ id: 'p21' }, { $set: { description_embedding: embedding } });
```

参考答案：重新执行场景 1，新商品应该有机会进入潜水、防水、冲浪相关结果。

### 7.2 修改同义词，让“拍摄杆”召回“自拍杆”

```javascript
db.synonyms_collection.insertOne({
  mappingType: 'equivalent',
  synonyms: ['自拍杆', '拍摄杆']
});
```

查询：

```javascript
db.products.aggregate([
  {
    $search: {
      index: 'default',
      text: {
        query: '拍摄杆',
        path: 'description',
        synonyms: 'aha360_synonyms'
      }
    }
  },
  { $addFields: { searchScore: { $meta: 'searchScore' } } },
  { $project: { _id: 0, id: 1, name: 1, searchScore: 1 } },
  { $limit: 5 }
]);
```

参考答案：期望召回 `p6`、`p7` 等自拍杆相关商品。索引更新可能需要短暂等待。

### 7.3 新增 `language` 过滤字段

当前数据均为 `zh-CN`。如果要让 Search 索引支持语言过滤，需要更新 `default` 索引，把 `language` 加入 token 字段：

```javascript
language: { type: 'token' }
```

查询示例：

```javascript
db.products.aggregate([
  {
    $search: {
      index: 'default',
      compound: {
        must: [
          { text: { query: '相机', path: ['name', 'description'] } }
        ],
        filter: [
          { equals: { path: 'language', value: 'zh-CN' } }
        ]
      }
    }
  },
  { $project: { _id: 0, id: 1, name: 1, language: 1, score: { $meta: 'searchScore' } } },
  { $limit: 5 }
]);
```

参考答案：所有返回结果的 `language` 都应该是 `zh-CN`。

### 7.4 使用 boost 调整排序

示例：让 `name` 命中比 `description` 命中更重要。

```javascript
db.products.aggregate([
  {
    $search: {
      index: 'default',
      compound: {
        should: [
          {
            text: {
              query: '自拍杆',
              path: 'name',
              score: { boost: { value: 3 } }
            }
          },
          {
            text: {
              query: '自拍杆',
              path: 'description'
            }
          }
        ],
        minimumShouldMatch: 1
      }
    }
  },
  { $addFields: { searchScore: { $meta: 'searchScore' } } },
  { $project: { _id: 0, id: 1, name: 1, searchScore: 1 } },
  { $limit: 8 }
]);
```

参考答案：商品名直接包含“自拍杆”的商品会获得更高分。

### 7.5 调整 fuzzy 容错程度

把 `maxEdits` 从 1 改成 2：

```javascript
db.products.aggregate([
  {
    $search: {
      index: 'default',
      text: {
        query: '全井相机',
        path: 'name',
        fuzzy: { maxEdits: 2 }
      }
    }
  },
  { $project: { _id: 0, id: 1, name: 1, score: { $meta: 'searchScore' } } },
  { $limit: 10 }
]);
```

参考答案：召回可能变多，但噪音也可能增加。生产中需要结合真实 query 日志调参。

### 7.6 Hybrid Search 简化示例

生产中可以把关键词搜索和向量搜索结果融合。下面是简化思路：

```javascript
// 先分别跑 lexical 和 vector，再在应用层按 id 合并得分。
// Atlas 聚合内也可以通过 $unionWith 做更复杂的融合，本文不展开。
```

参考答案：Hybrid Search 适合同时解决“精确词命中”和“自然语言语义召回”。

---

## 8. 常见问题

### 8.1 Embedding API 返回 403 Forbidden

常见原因：

- 使用的不是 Atlas 平台 Voyage AI API Key
- 请求 endpoint 不是 `https://ai.mongodb.com/v1/embeddings`
- API Key 没有 `voyage-4-large` 调用权限
- 当前网络无法访问 MongoDB AI Gateway

处理方式：

- 固定使用 Atlas 平台 endpoint：`https://ai.mongodb.com/v1/embeddings`
- 不要使用 Voyage 官网 endpoint
- 确认 API Key 来自 Atlas 平台 Voyage AI
- 确认请求 header 使用 `Authorization: Bearer <key>`

### 8.2 向量维度不匹配

现象：`$vectorSearch` 报维度错误。

处理方式：

- 检查 `description_embedding` 长度是否为 1024
- 检查 `vector_index.numDimensions` 是否为 1024
- 确认商品向量和 query 向量使用同一个模型

### 8.3 Search 索引一直无法查询

处理方式：

- 等待索引状态变为 `READY`
- 检查 Atlas UI Search Indexes 页面
- 确认索引名称是 `default`，查询里也写 `index: 'default'`
- 如果修改了索引定义，需要等待重新构建完成

### 8.4 中文搜索不理想

处理方式：

- 确认索引 analyzer 是 `lucene.chinese`
- 确认 `name` 和 `description` 都配置了 `string`
- 对业务词可增加同义词或 boost

### 8.5 同义词不生效

处理方式：

- 确认 `synonyms_collection` 中有数据
- 确认索引中配置了 `synonyms.name = 'aha360_synonyms'`
- 查询中必须显式写 `synonyms: 'aha360_synonyms'`
- 等待索引同步或重建完成

### 8.6 Autocomplete 没有候选

处理方式：

- 确认 `name` 字段配置了 `autocomplete`
- 查询必须使用 `$search.autocomplete`，不是 `$search.text`
- `path` 必须是 `name`

---

## 9. 生产化建议

### 9.1 数据同步

如果商品主数据仍在 MySQL、PolarDB 或其他 RDS 中，可以考虑：

- OpenAPI 写入 MongoDB
- Debezium + Kafka Connect
- Atlas Stream Processing
- 云厂商 DTS / DMS
- 自研 Binlog 同步服务

同步到 MongoDB 后，Atlas Search 索引会自动异步更新。

### 9.2 运营干预

生产搜索通常需要以下运营配置：

- 同义词词库
- 黑名单 / 白名单
- 类目 boost
- 品牌 boost
- 活动商品 boost
- 零结果推荐策略
- 热搜词和底纹词

这些配置可以放在 MongoDB 集合中，由应用层或搜索 pipeline 读取。

### 9.3 排序策略

PoC 使用简化表达式：

```text
weightedScore = searchScore * sale_weight
```

生产中建议逐步扩展为：

```text
finalScore = lexicalScore * relevanceWeight
           + vectorScore * semanticWeight
           + businessScore * businessWeight
           + operationBoost
```

### 9.4 监控与分析

建议记录以下事件：

- search
- click
- impression
- add_to_cart
- purchase
- no_result

可聚合指标：

- Search PV / UV
- CTR
- 零结果率
- query 转化率
- 类目点击率
- 搜索延迟 P95 / P99

### 9.5 成本和容量

建议按以下维度评估规格：

- 商品数量
- 可搜索字段数量
- embedding 向量维度
- 查询 QPS
- 索引更新频率
- 是否需要跨地域部署

PoC 使用 20 条数据和 M10 即可。生产环境需要根据真实数据规模压测。

### 9.6 安全与合规

建议：

- 使用最小权限数据库用户
- API Key 放在 Secret Manager，不进入前端代码
- Atlas Network Access 限制来源 IP
- 需要合规分区时选择合适 Region
- 定期轮换数据库密码和 API Key

---

## 10. 可选：拉起 UI Demo

如果客户希望查看图形化交互界面，可以使用配套 UI 工程。UI 工程不是完成本文 PoC 的必要条件。

启动步骤：

```bash
cd ui-demo
npm install
cp .env.local.example .env.local
```

编辑 `.env.local`：

```bash
MONGODB_URI="<atlas connection string>"
MONGODB_DB="aha360_poc"
VOYAGE_API_KEY="<api key>"
```

启动：

```bash
npm run dev
```

访问：

```text
http://localhost:3000
```

---

## 11. 清理与下线

PoC 完成后，如果不再需要保留环境，请执行：

1. 删除临时数据库用户。
2. 删除 Network Access 中临时开放的 IP。
3. 删除或停用 Embedding API Key。
4. 删除 Atlas M10 集群，停止继续计费。
5. 如果需要保留结果，先导出 `products`、`synonyms_collection` 和查询结果截图。

---

## 附录 A：完整商品数据

```javascript
use aha360_poc;

db.products.deleteMany({});

db.products.insertMany([
  {
    id: 'p1',
    name: 'Aha360 X-Series Pro 旗舰全景相机',
    description: '旗舰级 8K 全景运动相机，适合旅行、滑雪、骑行和户外创作，支持 HorizonStable 防抖、夜景增强与可更换镜片。',
    category: '相机',
    tags: ['全景', '8K', '运动相机', '防抖', '骑行', '旅行'],
    price: 3499,
    sale_weight: 1.45,
    language: 'zh-CN'
  },
  {
    id: 'p2',
    name: 'Aha360 X-Series Lite 8K全景口袋相机',
    description: '轻便口袋全景相机，支持 8K 全景视频、隐形自拍杆视角和稳定防抖，适合 vlog、摩旅和家庭旅行。',
    category: '相机',
    tags: ['全景', '8K', '口袋相机', '隐形自拍杆', '旅行'],
    price: 2999,
    sale_weight: 1.4,
    language: 'zh-CN'
  },
  {
    id: 'p3',
    name: 'Aha360 ActionCam Pro 2 运动相机',
    description: '徕卡联合设计的运动相机，具备强低光画质、4K 高帧率、防水机身和智能降噪，适合滑雪、潜水、冲浪和夜骑。',
    category: '相机',
    tags: ['运动相机', '防水', '低光', '潜水', '冲浪'],
    price: 2799,
    sale_weight: 1.25,
    language: 'zh-CN'
  },
  {
    id: 'p4',
    name: 'Aha360 MiniCam S 拇指相机',
    description: '超小型拇指运动相机，磁吸佩戴，适合亲子、宠物、骑行第一视角和日常短视频创作。',
    category: '相机',
    tags: ['拇指相机', '轻量', '磁吸', '骑行', 'vlog'],
    price: 2299,
    sale_weight: 1.2,
    language: 'zh-CN'
  },
  {
    id: 'p5',
    name: 'Aha360 MiniCam Ultra 专属深潜水壳',
    description: '为 MiniCam Ultra 设计的深潜水壳，提供可靠密封、防水、防雾和抗压保护，适合潜水、水下拍鱼、浮潜和冲浪拍摄。',
    category: '配件',
    tags: ['潜水', '防水', '防雾', '冲浪', '水下', '保护壳'],
    price: 399,
    sale_weight: 1.32,
    language: 'zh-CN'
  },
  {
    id: 'p6',
    name: 'Aha360 114cm 闪速隐形自拍杆',
    description: '轻量伸缩自拍杆，展开快速，配合全景相机可实现隐形自拍杆视角，适合旅行、滑雪和骑行跟拍。',
    category: '配件',
    tags: ['自拍杆', '隐形自拍杆', '旅行', '骑行', '轻量'],
    price: 199,
    sale_weight: 1.3,
    language: 'zh-CN'
  },
  {
    id: 'p7',
    name: 'Aha360 2合1隐形自拍杆 + 三脚架',
    description: '自拍杆和三脚架二合一设计，适合桌面直播、延时摄影、全景合影和户外固定机位拍摄。',
    category: '配件',
    tags: ['自拍杆', '三脚架', '隐形自拍杆', '直播', '延时摄影'],
    price: 249,
    sale_weight: 1.18,
    language: 'zh-CN'
  },
  {
    id: 'p8',
    name: 'Aha360 Stabilizer Pro AI 手机稳定器',
    description: '面向手机创作者的 AI 追踪稳定器，支持智能构图、三轴防抖、手势控制和便携折叠设计。',
    category: '稳定器',
    tags: ['稳定器', '云台', '手机', 'AI追踪', '防抖'],
    price: 999,
    sale_weight: 1.28,
    language: 'zh-CN'
  },
  {
    id: 'p9',
    name: 'Aha360 Stabilizer AI 追踪手机云台',
    description: '便携手机云台，提供 AI 人物追踪、稳定拍摄、自拍补光和快速展开，适合直播、短视频和旅行 vlog。',
    category: '稳定器',
    tags: ['云台', '稳定器', '手机', 'AI追踪', '直播'],
    price: 799,
    sale_weight: 1.22,
    language: 'zh-CN'
  },
  {
    id: 'p10',
    name: 'Aha360 摩托车骑行配件套装',
    description: '专为摩托车和公路骑行设计的配件套装，包含坚固支架、防震固定件和安全绳，适合第一视角运动拍摄。',
    category: '配件',
    tags: ['骑行', '摩托车', '支架', '防震', '运动拍摄'],
    price: 329,
    sale_weight: 1.36,
    language: 'zh-CN'
  },
  {
    id: 'p11',
    name: 'Aha360 自行车把手支架',
    description: '安装在自行车把手或座管上的轻便支架，适合骑行记录、通勤路线和公路车训练拍摄。',
    category: '配件',
    tags: ['骑行', '自行车', '支架', '轻量'],
    price: 159,
    sale_weight: 1.05,
    language: 'zh-CN'
  },
  {
    id: 'p12',
    name: 'Aha360 胸带固定带',
    description: '用于运动第一视角拍摄的胸带，适合滑雪、跑步、骑行和徒步，佩戴稳定舒适。',
    category: '配件',
    tags: ['胸带', '第一视角', '骑行', '滑雪', '徒步'],
    price: 179,
    sale_weight: 1.08,
    language: 'zh-CN'
  },
  {
    id: 'p13',
    name: 'Aha360 旗舰创作者套装',
    description: '高销量创作者套装，包含全景相机、隐形自拍杆、备用电池和收纳包，适合新手快速开始旅行和运动拍摄。',
    category: '套装',
    tags: ['套装', '高销量', '全景', '自拍杆', '旅行'],
    price: 3999,
    sale_weight: 1.5,
    language: 'zh-CN'
  },
  {
    id: 'p14',
    name: 'Aha360 ActionCam Pro 潜水套装',
    description: '面向潜水和水上运动的相机套装，包含防水保护壳、防雾片和浮力手柄，适合水下风景和鱼群拍摄。',
    category: '套装',
    tags: ['潜水', '防水', '防雾', '水下', '运动相机'],
    price: 3299,
    sale_weight: 1.16,
    language: 'zh-CN'
  },
  {
    id: 'p15',
    name: 'Aha360 X-Series Pro 快充电池',
    description: '为 X-Series Pro 全景相机准备的备用快充电池，提升户外旅行、滑雪和长时间延时拍摄续航。',
    category: '配件',
    tags: ['电池', '快充', '续航', '全景', '旅行'],
    price: 299,
    sale_weight: 1.12,
    language: 'zh-CN'
  },
  {
    id: 'p16',
    name: 'Aha360 多功能收纳包',
    description: '可收纳相机、镜头保护、自拍杆和电池的便携收纳包，适合旅行携带和日常保护。',
    category: '配件',
    tags: ['收纳', '保护', '旅行', '相机包'],
    price: 169,
    sale_weight: 0.96,
    language: 'zh-CN'
  },
  {
    id: 'p17',
    name: 'Aha360 X-Series Pro 镜头保护镜',
    description: '可拆卸镜头保护镜，降低全景相机在骑行、滑雪和户外运动中被刮花的风险。',
    category: '配件',
    tags: ['镜头保护', '全景', '骑行', '滑雪', '保护'],
    price: 199,
    sale_weight: 1.04,
    language: 'zh-CN'
  },
  {
    id: 'p18',
    name: 'Aha360 GPS 预览遥控器',
    description: '带屏幕预览和 GPS 数据记录的遥控器，可远程控制相机并记录速度、路线和海拔信息。',
    category: '配件',
    tags: ['GPS', '遥控器', '骑行', '路线', '数据'],
    price: 599,
    sale_weight: 1.02,
    language: 'zh-CN'
  },
  {
    id: 'p19',
    name: 'Aha360 WebCam C 直播摄像头',
    description: '桌面直播和会议摄像头，支持 4K 画质、智能取景、自动对焦和清晰收音，适合办公与主播。',
    category: '摄像头',
    tags: ['直播', '会议', '4K', '自动对焦', '桌面'],
    price: 1099,
    sale_weight: 1.1,
    language: 'zh-CN'
  },
  {
    id: 'p20',
    name: 'Aha360 Stabilizer Series 聚光灯补光配件',
    description: '适配 稳定器系列手机云台和稳定器的小型补光灯，适合夜景自拍、直播和短视频拍摄。',
    category: '配件',
    tags: ['补光灯', '云台', '稳定器', '手机', '直播'],
    price: 149,
    sale_weight: 1,
    language: 'zh-CN'
  }
]);
```

---

## 附录 B：完整索引定义

```javascript
db.products.createSearchIndex('default', {
  analyzer: 'lucene.chinese',
  mappings: {
    dynamic: false,
    fields: {
      name: [
        { type: 'string', analyzer: 'lucene.chinese' },
        {
          type: 'autocomplete',
          analyzer: 'lucene.chinese',
          tokenization: 'edgeGram',
          minGrams: 1,
          maxGrams: 20
        }
      ],
      description: { type: 'string', analyzer: 'lucene.chinese' },
      category: { type: 'token' },
      tags: { type: 'token' }
    }
  },
  synonyms: [
    {
      name: 'aha360_synonyms',
      analyzer: 'lucene.chinese',
      source: { collection: 'synonyms_collection' }
    }
  ]
});

db.products.createSearchIndex('vector_index', {
  fields: [
    {
      type: 'vector',
      path: 'description_embedding',
      numDimensions: 1024,
      similarity: 'cosine'
    }
  ]
});
```

---

## 附录 C：查询语句汇总

建议直接使用第 5 章中的完整版本。本附录只列查询名称：

| 场景 | 核心操作符 |
|---|---|
| 语义向量检索 | `$vectorSearch` |
| 关键词 + 业务权重排序 | `$search.text` + `$meta: 'searchScore'` |
| Autocomplete | `$search.autocomplete` |
| 错别字模糊搜索 | `$search.text` + `fuzzy.maxEdits` |
| 同义词召回 | `$search.text` + `synonyms` |
| 分类 + 标签过滤 | `$search.compound.filter` |
| 零结果兜底 | `$search.compound.must` + `find().sort()` |

---

## 附录 D：术语表

| 术语 | 说明 |
|---|---|
| Atlas Search | MongoDB Atlas 内置全文搜索能力，基于 Apache Lucene |
| Atlas Vector Search | MongoDB Atlas 内置向量检索能力 |
| Analyzer | 文本分析器，决定文本如何分词、归一化 |
| `lucene.chinese` | 适合中文文本的 Lucene analyzer |
| BM25 | 全文搜索常见相关性评分算法 |
| Embedding | 把文本转换成向量的过程 |
| `voyage-4-large` | 本 PoC 使用的 embedding 模型 |
| cosine similarity | 余弦相似度，常用于向量语义检索 |
| edgeGram | 从词首生成前缀 token 的 autocomplete 技术 |
| token | 不分词的精确值索引类型，适合分类、标签、状态 |
| Synonym Mapping | 同义词映射，让不同叫法可以互相召回 |
| Fuzzy Search | 允许一定编辑距离的模糊搜索 |
| `searchScore` | Atlas Search 相关性得分 |
| `vectorSearchScore` | Atlas Vector Search 相似度得分 |

---

## 附录 E：参考资料

- MongoDB Atlas Search 文档：https://www.mongodb.com/docs/atlas/atlas-search/
- MongoDB Atlas Vector Search 文档：https://www.mongodb.com/docs/atlas/atlas-vector-search/
- Atlas Search `createSearchIndex` 文档：https://www.mongodb.com/docs/manual/reference/method/db.collection.createSearchIndex/
- Atlas Search autocomplete 文档：https://www.mongodb.com/docs/atlas/atlas-search/autocomplete/
- Atlas Search synonyms 文档：https://www.mongodb.com/docs/atlas/atlas-search/synonyms/
- Atlas Vector Search `$vectorSearch` 文档：https://www.mongodb.com/docs/atlas/atlas-vector-search/vector-search-stage/
