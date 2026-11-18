# memory-brain

给 markdown 卡库做本地知识图与三路召回。没模型、没服务、纯 Python，不联网。

## 它是什么

你有一堆 `.md` 卡（每张记一个方法/坑/设备），还有一份记忆 json。它把两者抽成一张「可核查的图」：

- 每个节点带 **重要度、存活度、沉海层、检索权重**（幂律遗忘，旧的不删只降权）
- 边有六种来源：内容引用、共同关键词、项目分类、时间相邻、语义相近、记忆提到卡
- 查询时三路并行（字面 BM25 / 语义 bigram-tfidf / 图上 PPR），按名次 RRF 融合，最后乘沉海权重

## 安装

不需要任何依赖，Python 3.10+ 即可。把两个脚本拷走就能用：

```bash
git clone https://github.com/tasu-99/asu-c
cd asu-c/memory-brain
```

## 用法

```bash
# 1) 重建（算权重、建边、沉海）
python rebuild.py --cards ~/我的卡片 --memory ~/记忆.json --out ./out

# 2) 召回
python recall.py "端口冲突" --brain ./out/brain-data.json --usage ./out/usage.json

# 3) 每晚重建一次（沉海 + 建索引 + 重绘）
schtasks /create /tn "memory-brain rebuild" /tr "python rebuild.py ..." /sc daily /st 03:30
```

参数也可以走环境变量：`BRAIN_CARDS` / `BRAIN_MEMORY` / `BRAIN_OUT` / `BRAIN_DATA` / `BRAIN_USAGE`。

## 卡格式

- 每张卡一个 `.md`，第一行 `# 标题`
- 可选 `**锚点**：` 行，里面反引号包着的词会进关键词
- 正文里的 `` `反引号` `` 内容也会被当作关键词
- `_索引.md` 这类下划线开头的文件会被跳过

记忆 json 是可选输入，格式同 DSH 的 `~/.dsh/agents/memory/global.json`（`records` 数组，带 `id`/`text`/`title`/`importance`/`kind`/`tags`/`recallCount`/`createdAt`）。

## 参数（都写在 rebuild.py 顶部）

| 参数 | 默认 | 说明 |
|---|---|---|
| HALF_BASE | 30 天 | 基础半衰期 |
| HALF_IMP | 2.0 | 重要度对半衰期的放大 |
| K_RRF | 12 | RRF 平滑常数 |
| 路由权重 | 0.40 / 0.35 / 0.15 | 字面 / 语义 / 图 |
| 沉海阈值 | 0.55 / 0.25 / 0.18 | 热 / 温 / 深水 / 阁楼 |

## 已知短板

- 语义路是字符 bigram tfidf 余弦，不是真向量模型。同义改写（「内存紧张」查「内存不够」）召回弱。
- 图扩散的种子取自字面 top5，与字面路高度同源，独立贡献有限。
- 只在本地跑，不处理增量（每次全量重建，几百张卡几秒）。

## 来源

遗忘曲线（幂律而非指数）、五层沉海、RRF 三路融合的思路学自 [dsh-nebula-mind](https://github.com/Lng-ux/dsh-nebula-mind)（MIT）；代码是独立实现，没有复制它的源码。

MIT License。
