# -*- coding: utf-8 -*-
# 记忆图三路召回：字面 BM25 + 语义 bigram-tfidf + 图扩散 PPR，RRF 融合，乘沉海权重
# 用法：python recall.py "查询词" [--top n] [--json] [--brain 文件] [--usage 文件]
import json, re, math, os, sys, datetime, io, argparse

DEFAULT_BRAIN = os.path.join(os.path.expanduser("~/.dsh/archive/memory-brain"), "brain-data.json")
DEFAULT_USAGE = os.path.join(os.path.expanduser("~/.dsh/archive/memory-brain"), "usage.json")

K_RRF = 12
W_ROUTE = {"lexical": 0.40, "dense": 0.35, "graph": 0.15}
DEPTH_NAMES = {0: "核心", 1: "热", 2: "温", 3: "深水", 4: "阁楼"}

ap = argparse.ArgumentParser(description="三路召回")
ap.add_argument("query", nargs="?", default="")
ap.add_argument("--top", type=int, default=8)
ap.add_argument("--json", action="store_true")
ap.add_argument("--brain", default=os.environ.get("BRAIN_DATA", DEFAULT_BRAIN))
ap.add_argument("--usage", default=os.environ.get("BRAIN_USAGE", DEFAULT_USAGE))
args = ap.parse_args()

BRAIN = args.brain
USAGE = args.usage
q = args.query

data = json.load(io.open(BRAIN, encoding="utf-8"))
nodes = {n["id"]: n for n in data["nodes"]}
links = data["links"]

# 邻接表（无向，权重）
adj = {nid: [] for nid in nodes}
for l in links:
    a, b = l["source"], l["target"]
    if a in adj and b in adj:
        adj[a].append((b, float(l.get("weight") or 1)))
        adj[b].append((a, float(l.get("weight") or 1)))

def bigrams(s):
    s = re.sub(r"\s+", "", s)
    return {s[i:i + 2] for i in range(len(s) - 1)} if len(s) >= 2 else set()

def text_of(n):
    return (n.get("title") or "") + "\n" + (n.get("label") or "") + "\n" + (n.get("text") or "")

# ---------- 字面 BM25（简化） ----------
N = max(1, len(nodes))
df = {}
for nid, n in nodes.items():
    for g in bigrams(text_of(n)):
        df[g] = df.get(g, 0) + 1
idf = {g: math.log(1 + (N - v + 0.5) / (v + 0.5)) for g, v in df.items()}

def lexical_scores(q):
    qg = bigrams(q)
    if len(q) >= 3:
        qg |= {q[i:i + 3] for i in range(len(q) - 2)}
    scores = {}
    for nid, n in nodes.items():
        t = text_of(n)
        s = 0.0
        for g, w in idf.items():
            if g in qg:
                c = t.count(g)
                if c:
                    s += (c * 2.2) / (c + 1.2) * w
        if q and q in t:
            s += 6.0
        if q and q in (n.get("label") or ""):
            s += 8.0
        scores[nid] = s
    return scores

# ---------- 语义：bigram tfidf 余弦 ----------
def dense_scores(q):
    q_vec = bigrams(q)
    scores = {}
    for nid, n in nodes.items():
        n_vec = bigrams(text_of(n))
        inter = q_vec & n_vec
        if not inter:
            scores[nid] = 0.0
            continue
        s = sum(idf.get(g, 0.5) for g in inter) / (math.sqrt(len(q_vec)) * math.sqrt(len(n_vec)) + 1e-9)
        scores[nid] = s
    return scores

# ---------- 图：从字面种子做 8 次 PPR ----------
def graph_scores(seed_ids, d=0.5, iters=8):
    p = {nid: 0.0 for nid in nodes}
    if not seed_ids:
        return p
    total = sum(seed_ids.values()) or 1.0
    reset = {nid: v / total for nid, v in seed_ids.items()}
    p.update(reset)
    for _ in range(iters):
        new = {nid: (1 - d) * reset.get(nid, 0.0) for nid in nodes}
        for nid in nodes:
            if p[nid] <= 0:
                continue
            nb = adj[nid]
            if not nb:
                continue
            deg = sum(w for _, w in nb)
            for other, w in nb:
                new[other] += d * p[nid] * (w / deg)
        p = new
    return p

def rrf(rank_lists):
    out = {}
    for route, ranked in rank_lists.items():
        for rank, (nid, _) in enumerate(ranked):
            out[nid] = out.get(nid, 0.0) + W_ROUTE[route] / (K_RRF + rank + 1)
    return out

def recall(q, top=8):
    lex = lexical_scores(q)
    den = dense_scores(q)
    ranked_lex = sorted(lex.items(), key=lambda kv: -kv[1])[:60]
    ranked_den = sorted(den.items(), key=lambda kv: -kv[1])[:60]
    seeds = {nid: v for nid, v in ranked_lex[:5] if v > 0}
    grp = graph_scores(seeds)
    ranked_grp = sorted(grp.items(), key=lambda kv: -kv[1])[:60]

    fused = rrf({"lexical": ranked_lex, "dense": ranked_den, "graph": ranked_grp})
    results = []
    for nid, base in sorted(fused.items(), key=lambda kv: -kv[1])[:top * 3]:
        n = nodes[nid]
        final = base * (0.4 + 0.6 * float(n.get("w") or 0.5))
        r = []
        for route, ranked in (("lexical", ranked_lex), ("dense", ranked_den), ("graph", ranked_grp)):
            for rank, (rid, _) in enumerate(ranked):
                if rid == nid:
                    r.append(route[:2])
                    break
        results.append({"id": nid, "score": round(final, 4), "routes": r,
                        "depth": DEPTH_NAMES.get(n.get("depth"), "?"),
                        "kind": n.get("kind"), "title": n.get("title") or n.get("label")})
    results.sort(key=lambda x: -x["score"])
    return results[:top]

def bump_usage(hits):
    try:
        u = json.load(io.open(USAGE, encoding="utf-8"))
    except Exception:
        u = {}
    now = datetime.datetime.now().isoformat(timespec="seconds")
    for nid in hits:
        e = u.setdefault(nid, {"hits": 0, "lastSeen": None})
        e["hits"] = int(e.get("hits", 0)) + 1
        e["lastSeen"] = now
    io.open(USAGE, "w", encoding="utf-8").write(json.dumps(u, ensure_ascii=False, indent=1))

if __name__ == "__main__":
    if not q:
        print("用法: python recall.py \"查询词\" [--top 8] [--json]")
        sys.exit(1)
    res = recall(q, args.top)
    if args.json:
        print(json.dumps(res, ensure_ascii=False, indent=1))
    else:
        for r in res:
            tag = "[" + "/".join(r["routes"]) + "]" if r["routes"] else "[图]"
            print(f"{r['score']:.4f} {tag} {r['depth']:2s} {r['title']}")
    bump_usage([r["id"] for r in res])
