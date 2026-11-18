# -*- coding: utf-8 -*-
# 把 markdown 卡库 + 记忆 json 抽成「可核查的记忆图」数据 v3
# v3 学自 nebula-mind：幂律遗忘 + 五层沉海 + 来源权重 + 使用强化
# 用法：
#   python rebuild.py                                  # 默认位置
#   python rebuild.py --cards 我的卡库 --memory 记忆.json --out 输出目录
# 也可用环境变量 BRAIN_CARDS / BRAIN_MEMORY / BRAIN_OUT
import os, re, json, datetime, io, math, argparse

DEFAULT_CARDS = os.path.expanduser(r"~/Documents/deepseek-harness/default-workspace/procedures")
DEFAULT_MEMORY = os.path.expanduser(r"~/.dsh/agents/memory/global.json")
DEFAULT_OUT = os.path.expanduser(r"~/.dsh/archive/memory-brain")

ap = argparse.ArgumentParser(description="重建记忆图数据")
ap.add_argument("--cards", default=os.environ.get("BRAIN_CARDS", DEFAULT_CARDS), help="卡库目录（*.md）")
ap.add_argument("--memory", default=os.environ.get("BRAIN_MEMORY", DEFAULT_MEMORY), help="记忆 json（可缺省）")
ap.add_argument("--out", default=os.environ.get("BRAIN_OUT", DEFAULT_OUT), help="输出目录")
args = ap.parse_args()

CARDS_DIR = args.cards
MEM_JSON = args.memory
OUT = args.out
USAGE = os.path.join(OUT, "usage.json")
os.makedirs(OUT, exist_ok=True)

# ---------- 记忆参数（学自 nebula-mind 的幂律与沉海） ----------
HALF_BASE = 30.0      # 天
HALF_IMP = 2.0        # 重要度对半衰期的放大
W_BASE = {"user": 4.0, "self": 2.0, "tool": 1.5, "web": 1.2, "card": 2.0}

def age_days(iso_or_ts):
    if not iso_or_ts:
        return 365.0
    if isinstance(iso_or_ts, (int, float)):
        t = datetime.datetime.fromtimestamp(iso_or_ts)
    else:
        try:
            t = datetime.datetime.fromisoformat(str(iso_or_ts).replace("Z", "+00:00"))
            if t.tzinfo:
                t = t.replace(tzinfo=None)
        except Exception:
            return 365.0
    d = (datetime.datetime.now() - t).total_seconds() / 86400.0
    return max(0.0, d)

def weight_A(age, imp):
    """幂律遗忘：A=0.5 时正好在 age = H 处。"""
    H = HALF_BASE * (1.0 + HALF_IMP * imp)
    S = max(0.1, H / 3.0)
    return (1.0 + age / S) ** -0.5

def depth_of(A, pinned=False):
    if pinned:
        return 0
    if A >= 0.55:
        return 1
    if A >= 0.25:
        return 2
    if A >= 0.18:
        return 3
    return 4

DEPTH_NAMES = {0: "核心", 1: "热", 2: "温", 3: "深水", 4: "阁楼"}

try:
    usage = json.load(io.open(USAGE, encoding="utf-8"))
except Exception:
    usage = {}

nodes, links = [], []
by_prefix = {}
node_by_id = {}
text_of = {}

def usage_of(nid):
    u = usage.get(nid) or {}
    return int(u.get("hits", 0)), u.get("lastSeen")

files = [f for f in sorted(os.listdir(CARDS_DIR)) if f.endswith(".md") and not f.startswith("_")]
for f in files:
    p = os.path.join(CARDS_DIR, f)
    raw = io.open(p, encoding="utf-8").read()
    name = f[:-3]
    title = name
    m = re.search(r"^#\s+(.+)$", raw, re.M)
    if m:
        title = m.group(1).strip()

    kws = set()
    ma = re.search(r"\*\*锚点\*\*[：:]\s*(.+)", raw)
    if ma:
        kws |= set(re.findall(r"`([^`]+)`", ma.group(1)))
    for t in re.findall(r"`([^`\n]{2,40})`", raw):
        kws.add(t.strip())
    kws = {k for k in kws if 2 <= len(k) <= 40}

    prefix = name.split("-")[0] if "-" in name else "其他"
    nid = "card:" + name
    by_prefix.setdefault(prefix, []).append(nid)

    imp = 0.5 + min(0.3, 0.02 * len(kws))
    if prefix == "玩法":
        imp = max(0.35, imp - 0.08)
    hits, last_seen = usage_of(nid)
    age = age_days(last_seen or os.path.getmtime(p))
    A = weight_A(age, imp)
    w = round(imp * A * (1.0 + 0.1 * hits), 3)

    node = {"id": nid, "label": name, "title": title, "kind": "card",
            "prefix": prefix, "anchors": sorted(kws)[:60],
            "chars": len(raw), "text": raw[:800], "mtime": os.path.getmtime(p),
            "imp": round(imp, 3), "source": "card", "hits": hits,
            "lastSeen": last_seen, "A": round(A, 3),
            "depth": depth_of(A), "w": w}
    nodes.append(node)
    node_by_id[nid] = node
    text_of[nid] = title + "\n" + raw[:20000]

try:
    mem = json.load(io.open(MEM_JSON, encoding="utf-8")).get("records", [])
except Exception:
    mem = []
for r in mem:
    nid = "mem:" + r["id"]
    kws = set()
    tags = r.get("tags") or ""
    if isinstance(tags, str):
        try:
            tags = json.loads(tags.replace("'", '"'))
        except Exception:
            tags = re.findall(r"[^\W\d_]+", tags)
    kws |= set(t for t in tags if isinstance(t, str))
    for t in re.findall(r"`([^`\n]{2,40})`", r["text"]):
        kws.add(t.strip())

    try:
        imp_raw = float(r.get("importance") or 44)
    except Exception:
        imp_raw = 44.0
    imp = min(0.95, max(0.2, imp_raw / 100.0))
    src = str(r.get("source") or "tool").lower()
    ledger = "事实"
    if r.get("kind") == "promise" or "promise" in kws:
        ledger = "约定"
    elif "owner" in kws or r.get("kind") == "preference":
        ledger = "画像"
    try:
        hits = int(r.get("recallCount") or 0)
    except Exception:
        hits = 0
    last_seen = r.get("lastSeenAt")
    age = age_days(last_seen or r.get("createdAt"))
    A = weight_A(age, imp)
    w = round(imp * A * (1.0 + 0.1 * hits), 3)

    node = {"id": nid, "label": r.get("title") or r["text"][:24],
            "title": r.get("title", ""), "kind": "memory", "prefix": "记忆",
            "anchors": sorted(kws)[:40], "chars": len(r["text"]),
            "text": r["text"], "mtime": 0,
            "imp": round(imp, 3), "source": src, "ledger": ledger, "hits": hits,
            "lastSeen": last_seen, "A": round(A, 3),
            "depth": depth_of(A), "w": w}
    nodes.append(node)
    node_by_id[nid] = node
    text_of[nid] = r["text"]
    by_prefix.setdefault("记忆", []).append(nid)

seen_edge = set()
def add(a, b, kind, why, weight=1):
    if a == b or a not in node_by_id or b not in node_by_id:
        return
    key = tuple(sorted((a, b)))
    if key in seen_edge:
        return
    seen_edge.add(key)
    links.append({"source": a, "target": b, "kind": kind, "why": why, "weight": weight})

# ① 内容引用
for a in nodes:
    body = text_of[a["id"]]
    for b in nodes:
        if a["id"] == b["id"] or b["kind"] != "card":
            continue
        if b["label"] in body:
            add(a["id"], b["id"], "cite", f"{a['label']} 里直接写了「{b['label']}」", 2)

# ② 共同关键词
for i, a in enumerate(nodes):
    for b in nodes[i + 1:]:
        inter = set(a["anchors"]) & set(b["anchors"])
        hard = [w for w in inter if len(w) >= 3 or w.isascii()]
        if a["kind"] == "memory" and b["kind"] == "memory":
            need = 2
        elif a["kind"] == "memory" or b["kind"] == "memory":
            need = 1
        else:
            need = 2
        if len(inter) >= need and hard:
            show = "、".join(sorted(hard)[:4])
            add(a["id"], b["id"], "keyword",
                f"共用 {len(inter)} 个关键词：{show}", 1 + min(len(inter), 6) / 10)

# ②b 记忆提到某张卡
for a in nodes:
    if a["kind"] != "memory":
        continue
    body = text_of[a["id"]]
    for b in nodes:
        if b["kind"] != "card":
            continue
        if b["label"] in body or (len(b["title"]) >= 6 and b["title"] in body):
            add(a["id"], b["id"], "cite", f"这条记忆里提到了「{b['label']}」", 2)

# ③ 项目归属
for prefix, ids in by_prefix.items():
    if len(ids) < 2:
        continue
    pid = "proj:" + prefix
    node = {"id": pid, "label": prefix, "title": prefix + "（分类）", "kind": "project",
            "prefix": prefix, "anchors": [], "chars": 0,
            "text": f"{prefix} 类共 {len(ids)} 张卡", "mtime": 0,
            "imp": 0.4, "source": "card", "hits": 0, "lastSeen": None,
            "A": 1.0, "depth": 1, "w": 0.4}
    nodes.append(node)
    node_by_id[pid] = node
    for i in ids:
        add(i, pid, "project", f"{node_by_id[i]['label']} 属于「{prefix}」类", 1.5)

# ④ 同项目补边
for prefix, ids in by_prefix.items():
    if len(ids) < 2:
        continue
    ordered = sorted(ids, key=lambda x: node_by_id[x]["mtime"])
    for x, y in zip(ordered, ordered[1:]):
        t1 = datetime.datetime.fromtimestamp(node_by_id[x]["mtime"]).strftime("%m-%d %H:%M")
        t2 = datetime.datetime.fromtimestamp(node_by_id[y]["mtime"]).strftime("%m-%d %H:%M")
        add(x, y, "adjacent", f"同为「{prefix}」类且写入时间相邻（{t1} → {t2}）", 0.8)

# ⑤ 语义相近（字符 bigram 余弦 ≥ 0.62，每节点最多 3 条）
def bigrams(s):
    s = re.sub(r"\s+", "", s)
    return {s[i:i + 2] for i in range(len(s) - 1)} if len(s) >= 2 else set()

def cos(a, b):
    if not a or not b:
        return 0.0
    inter = len(a & b)
    return inter / (math.sqrt(len(a)) * math.sqrt(len(b)) + 1e-9)

node_grams = {n["id"]: bigrams(n["title"] + " " + n["text"][:400]) for n in nodes}
sim_edges = {n["id"]: [] for n in nodes}
for i, a in enumerate(nodes):
    for b in nodes[i + 1:]:
        s = cos(node_grams[a["id"]], node_grams[b["id"]])
        if s >= 0.62:
            sim_edges[a["id"]].append((s, b["id"]))
            sim_edges[b["id"]].append((s, a["id"]))
for nid, arr in sim_edges.items():
    arr.sort(reverse=True)
    for s, other in arr[:3]:
        add(nid, other, "semantic", f"文本相似度 {s:.2f}", 0.5)

# ---------- 自验 ----------
deg = {n["id"]: 0 for n in nodes}
for l in links:
    deg[l["source"]] += 1
    deg[l["target"]] += 1
isolated = [n["id"] for n in nodes if deg[n["id"]] == 0]
ncard = sum(1 for n in nodes if n["kind"] == "card")
nmem = sum(1 for n in nodes if n["kind"] == "memory")
nproj = sum(1 for n in nodes if n["kind"] == "project")
print(f"节点 {len(nodes)}（卡 {ncard}，记忆 {nmem}，分类 {nproj}）　边 {len(links)}")
for k in ("cite", "keyword", "project", "adjacent", "semantic"):
    print(f"  {k:9s} {sum(1 for l in links if l['kind']==k)}")
print(f"孤立 {len(isolated)}（{len(isolated)/len(nodes)*100:.1f}%）")
if isolated:
    print("  例：", isolated[:6])

from collections import Counter
layers = Counter(DEPTH_NAMES[n["depth"]] for n in nodes)
print("层分布：", dict(layers))

data = {"generatedAt": datetime.datetime.now().isoformat(timespec="seconds"),
        "params": {"HALF_BASE": HALF_BASE, "HALF_IMP": HALF_IMP,
                   "w_base": W_BASE, "depth_names": DEPTH_NAMES},
        "stats": {"nodes": len(nodes), "links": len(links),
                  "layers": dict(layers), "isolated": len(isolated)},
        "nodes": nodes, "links": links}
io.open(os.path.join(OUT, "brain-data.json"), "w", encoding="utf-8").write(
    json.dumps(data, ensure_ascii=False, indent=1))
print("写出 brain-data.json")
