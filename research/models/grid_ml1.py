#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Grid ML (unsupervised) — ให้ข้อมูลจัดกลุ่มตัวเอง โดยไม่บอกโมเดลเลยว่าใครชนะ

    python research/models/grid_ml1.py

ต่างจาก grid_ml.py ตรงไหน
    grid_ml.py เป็น supervised: มีเฉลย (คนยิงเป็น CT หรือ T) ให้โมเดลเรียน แล้ววัดว่าทายถูกแค่ไหน
    ไฟล์นี้เป็น unsupervised: ซ่อนฝั่งไว้ตลอด ถามแค่ว่า "การปะทะบนแมพจัดกลุ่มตัวเองอย่างไร"

สองคำถาม สองอัลกอริทึม
    1. จุดปะทะอยู่ตรงไหน
       MeanShift บนพิกัดจุดตาย — ไต่ขึ้นหายอดความหนาแน่น จึงไม่ต้องบอกล่วงหน้าว่ามีกี่จุด
       บอกแค่รัศมีที่ถือว่า "อยู่ใกล้กัน" (BANDWIDTH เป็นหน่วยเกม)
    2. แต่ละช่องกริดเป็นการปะทะ "แบบไหน"
       สรุปโปรไฟล์ของช่อง (เกิดตอนไหนของรอบ / หลังวางระเบิดไหม / ดวลไกลแค่ไหน)
       แล้ว KMeans จับช่องที่โปรไฟล์คล้ายกันไว้ด้วยกัน — ได้ "ประเภทพื้นที่" ที่ไม่มีใครตั้งชื่อให้ล่วงหน้า

unsupervised ไม่มีเฉลยให้เทียบ จึงต้องวัดสามอย่างแทน ไม่งั้นจะได้รูปสวยที่พิสูจน์อะไรไม่ได้
    1. silhouette        กลุ่มแยกจากกันชัดแค่ไหน — ใช้เลือกจำนวนกลุ่ม k
    2. เสถียรภาพ         สุ่มชุดแมตช์ใหม่ (bootstrap) แล้วดูว่ายังได้โครงสร้างเดิมไหม
                         ถ้าเปลี่ยนแมตช์แล้วกลุ่มเปลี่ยนหมด แปลว่าที่เจอคือ noise ไม่ใช่ตัวแมพ
    3. ตรวจกับของจริงทีหลัง เอา "ใครชนะ" ที่ซ่อนไว้ตลอดมาเทียบตอนจบ
                         ถ้ากลุ่มที่โมเดลหาเองแยกฝั่งที่ได้เปรียบออกจากกันได้ ทั้งที่ไม่เคยเห็นฝั่ง
                         แปลว่าโครงสร้างนั้นมีความหมายจริง
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

from sklearn.cluster import KMeans, MeanShift
from sklearn.metrics import adjusted_rand_score, silhouette_score
from sklearn.preprocessing import StandardScaler

# ===========================================================================
# CONFIG
# ===========================================================================
ROOT = Path(__file__).resolve().parents[2]
_ap = argparse.ArgumentParser(description="Train the per-map unsupervised grid model")
_ap.add_argument("--map", default="de_ancient", help="map name, e.g. de_ancient")
_ap.add_argument("--csv", type=Path, default=ROOT / "data" / "all_kills.csv")
_ap.add_argument("--output-dir", type=Path, help="default: output/models/<map>")
_ap.add_argument("--min-kills", type=int, default=10, help="minimum duels per grid cell (default: 10)")
_args = _ap.parse_args()

MAP = _args.map       # csv จะถูกกรองเหลือเฉพาะแมพนี้ก่อนใช้งาน
GRID_N = 32         # แบ่งแมพเป็นกี่ช่องต่อด้าน — ใช้ค่าเดียวกับ grid_ml.py ช่องจะได้ตรงกัน เทียบกันได้
MIN_KILLS = _args.min_kills  # ช่องต้องมีดวลอย่างน้อยเท่านี้ถึงจะสร้างโปรไฟล์

BANDWIDTH = 300     # รัศมีที่ถือว่า "จุดตายอยู่ใกล้กัน" หน่วยเกม (300 ≈ 5.7 เมตร เท่ากับ grid ใน radars.json)
MIN_BIN_FREQ = 15   # ยอดที่มีจุดตายไม่ถึงเท่านี้ในรัศมี ไม่นับเป็นจุดปะทะ กันจุดตายโดด ๆ กลายเป็นยอด

FEATURES = ["t_mean", "planted_share", "dist_mean"]   # โปรไฟล์ของช่อง — ไม่มีตัวไหนบอกฝั่ง
K_RANGE = range(2, 9)   # ไล่ลองจำนวนกลุ่มช่วงนี้
K_CLUSTERS = None       # None = เลือก k ที่ silhouette สูงสุดให้เอง | ใส่ตัวเลขถ้าจะล็อก
N_BOOT = 20             # สุ่มชุดแมตช์กี่รอบตอนวัดเสถียรภาพ
SEED = 0                # ให้รันซ้ำแล้วได้ผลเดิมทุกครั้ง

CSV = _args.csv                              # สร้างด้วย python research/prep/demoparser.py
OUT = _args.output_dir or ROOT / "output" / "models" / MAP

sys.path.insert(0, str(ROOT))           # ให้ import backend.* ได้เมื่อรันจากรากโปรเจกต์
from backend.services.review import cells_of, radar_frame  # noqa: E402  สูตรพิกัดชุดเดียวของทั้งรีโป

for _s in (sys.stdout, sys.stderr):     # ให้คอนโซล Windows พิมพ์ไทยได้
    try:
        _s.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass


# ===========================================================================
# ===========================================================================
df = pd.read_csv(CSV)
n_raw = len(df)

if "map_name" in df.columns:
    df = df[df["map_name"] == MAP]
    if df.empty:
        sys.exit(f"ไม่มีข้อมูลแมพ {MAP} ใน {CSV.name} — มีแต่ {sorted(pd.read_csv(CSV)['map_name'].unique())}")


# ===========================================================================
# ===========================================================================
if "demo_file" in df.columns:
    df["match_id"] = df["demo_file"]
else:
    df["match_id"] = (df["tick"].diff() < 0).cumsum()   # ทางถอยของ csv รุ่นเก่า (ดูคำอธิบายใน grid_ml.py)


# ===========================================================================
# ===========================================================================
if "round_start_tick" not in df.columns:
    sys.exit("csv ไม่มีคอลัมน์บริบทรอบ (round_start_tick) — รัน python research/prep/demoparser.py --force ก่อน")

rate = df["tickrate"].fillna(128)
df["t_round"] = (df["tick"] - df["round_start_tick"]) / rate                  # วินาทีที่เท่าไรของรอบ
df["planted"] = (df["bomb_plant_tick"].notna() & (df["tick"] >= df["bomb_plant_tick"])).astype(int)


# ===========================================================================
# ===========================================================================
has_attacker = df["attacker_side"].notna()
enemy_duel = df["attacker_side"] != df["victim_side"]
df = df[has_attacker & enemy_duel].copy()

df["ct_won"] = (df["attacker_side"] == "ct").astype(int)


# ===========================================================================
# ===========================================================================
radar = json.loads((ROOT / "assets" / "radars.json").read_text(encoding="utf-8"))[MAP]   # ไว้ใส่ payload + path รูป

frame = radar_frame(MAP)
df["cx"], df["cy"] = cells_of(df["victim_X"], df["victim_Y"], frame, GRID_N)

df["dist_xy"] = np.hypot(df["attacker_X"] - df["victim_X"], df["attacker_Y"] - df["victim_Y"])

print(f"{n_raw:,} แถว -> ใช้ได้ {len(df):,} การดวล | {df['match_id'].nunique()} แมตช์")


def top_place(s):
    """ชื่อ callout ที่พบบ่อยสุดในกลุ่ม — ไว้ให้คนอ่านรู้ว่ากลุ่มนี้อยู่แถวไหนของแมพ"""
    m = s.dropna().mode()
    return m.iloc[0] if len(m) else "Unknown"


def resample_matches(d, rng):
    """bootstrap ตามแมตช์: สุ่มแมตช์ซ้ำได้จนครบจำนวนเดิม ได้ชุดข้อมูลขนาดเท่าเดิมแต่ส่วนผสมต่างไป"""
    ids = d["match_id"].unique()
    picked = rng.choice(ids, size=len(ids), replace=True)
    return pd.concat([d[d["match_id"] == m] for m in picked], ignore_index=True)


BOOT_COLS = ["match_id", "victim_X", "victim_Y", "cx", "cy", "t_round", "planted", "dist_xy"]
rng = np.random.default_rng(SEED)
boots = [resample_matches(df[BOOT_COLS], rng) for _ in range(N_BOOT)]


# ===========================================================================
# ===========================================================================
def find_hotspots(d):
    ms = MeanShift(bandwidth=BANDWIDTH, bin_seeding=True, min_bin_freq=MIN_BIN_FREQ,
                   cluster_all=False)   # จุดที่ห่างจากทุกยอดเกิน BANDWIDTH ให้เป็น -1 ไม่ยัดเข้ากลุ่มไหน
    ms.fit(d[["victim_X", "victim_Y"]].to_numpy())
    return ms.labels_, ms.cluster_centers_


labels, centers = find_hotspots(df)

order = np.argsort(-np.bincount(labels[labels >= 0]))
remap = {old: new for new, old in enumerate(order)}
df["hotspot"] = np.array([remap.get(lab, -1) for lab in labels])
centers = centers[order]

rows = []
for i, (hx, hy) in enumerate(centers):
    m = df[df["hotspot"] == i]
    r = np.hypot(m["victim_X"] - hx, m["victim_Y"] - hy)
    rows.append({
        "id": i + 1, "x": float(hx), "y": float(hy),
        "duels": len(m), "share": len(m) / len(df),
        "radius": float(np.percentile(r, 80)),        # รัศมีที่ครอบ 80% ของจุดในกลุ่ม ไว้วาดวงในรูป
        "place": top_place(m["victim_place"]),
        "t_mean": float(m["t_round"].mean()),
        "planted_share": float(m["planted"].mean()),
        "ct_win": float(m["ct_won"].mean()),          # ตรวจทีหลัง — ไม่ได้ใช้ตอนหาจุด
    })
hotspots = pd.DataFrame(rows)
noise_share = float((df["hotspot"] < 0).mean())

found = []
for b in boots:
    _, cb = find_hotspots(b)
    dist = np.linalg.norm(centers[:, None, :] - cb[None, :, :], axis=2)   # ระยะทุกคู่ (จริง x bootstrap)
    found.append((dist.min(axis=1) <= BANDWIDTH / 2).mean())
hotspot_stability = float(np.mean(found))

print(f"\nคำถามที่ 1 — MeanShift รัศมี {BANDWIDTH} หน่วย: เจอจุดปะทะ {len(hotspots)} จุด "
      f"ครอบคลุม {1 - noise_share:.0%} ของการดวล (ที่เหลือกระจายอยู่ห่างจากทุกยอด)")
print(f"  เสถียรภาพ: สุ่มแมตช์ใหม่ {N_BOOT} รอบ ยอดเดิมกลับมาเจอที่เดิม {hotspot_stability:.0%}")
print(hotspots[["id", "place", "duels", "share", "t_mean", "planted_share", "ct_win"]].to_string(
    index=False, formatters={"share": "{:.1%}".format, "t_mean": "{:.0f}s".format,
                             "planted_share": "{:.0%}".format, "ct_win": "{:.2f}".format}))
print("  ct_win = สัดส่วนที่ CT ชนะดวลในจุดนั้น เอามาแปะทีหลังเพื่อตรวจ โมเดลไม่เคยเห็นค่านี้")


# ===========================================================================
# ===========================================================================
def cell_profiles(d):
    g = d.groupby(["cx", "cy"])
    p = pd.DataFrame({
        "kills": g.size(),
        "t_mean": g["t_round"].mean(),          # เกิดตอนไหนของรอบ (วินาที)
        "planted_share": g["planted"].mean(),   # สัดส่วนที่เกิดหลังระเบิดลง
        "dist_mean": g["dist_xy"].mean(),       # ระยะดวลเฉลี่ย (หน่วยเกม)
    })
    return p[p["kills"] >= MIN_KILLS]


cells = cell_profiles(df)
print(f"\nคำถามที่ 2 — ช่องที่มีดวล >= {MIN_KILLS}: {len(cells)} จาก {df.groupby(['cx', 'cy']).ngroups} ช่อง "
      f"(ครอบคลุม {cells['kills'].sum() / len(df):.0%} ของการดวล)")

scaler = StandardScaler().fit(cells[FEATURES])
Z = scaler.transform(cells[FEATURES])


def fit_kmeans(X, k):
    return KMeans(n_clusters=k, n_init=20, random_state=SEED).fit(X)


boot_profiles = [cell_profiles(b) for b in boots]
ks = sorted(set(K_RANGE) | ({K_CLUSTERS} if K_CLUSTERS else set()))   # k ที่ล็อกไว้ต้องโผล่ในตารางด้วย
max_k = min([len(cells) - 1, *(len(bp) for bp in boot_profiles)])
ks = [k for k in ks if k <= max_k]
if not ks:
    sys.exit(f"ข้อมูลไม่พอจัดกลุ่มช่องกริดของ {MAP}: {len(cells)} ช่อง; ลองลด --min-kills หรือเพิ่มเดโมอ้างอิง")
scan = []
for k in ks:
    km = fit_kmeans(Z, k)
    ref = pd.Series(km.labels_, index=cells.index)
    aris = []
    for bp in boot_profiles:
        common = cells.index.intersection(bp.index)     # เทียบเฉพาะช่องที่มีข้อมูลพอทั้งสองชุด
        lab_b = pd.Series(fit_kmeans(StandardScaler().fit_transform(bp[FEATURES]), k).labels_, index=bp.index)
        aris.append(adjusted_rand_score(ref.loc[common], lab_b.loc[common]))
    scan.append({"k": k, "silhouette": float(silhouette_score(Z, km.labels_)), "ari": float(np.mean(aris))})
scan = pd.DataFrame(scan)

k_best = K_CLUSTERS or int(scan.loc[scan["silhouette"].idxmax(), "k"])
k_rule = f"ล็อกไว้ที่ {K_CLUSTERS}" if K_CLUSTERS else "silhouette สูงสุด"

print(f"\n  ไล่ลอง k (เลือกด้วย {k_rule}, bootstrap {N_BOOT} รอบ):")
for r in scan.itertuples():
    mark = "  <- ใช้ตัวนี้" if r.k == k_best else ""
    print(f"    k={r.k}  silhouette {r.silhouette:.3f}  ARI {r.ari:.2f}{mark}")

km = fit_kmeans(Z, k_best)

order = np.argsort(km.cluster_centers_[:, FEATURES.index("t_mean")])
remap = {old: new for new, old in enumerate(order)}
cells["cluster"] = [remap[lab] for lab in km.labels_]
centers_z = km.cluster_centers_[order]   # ค่ากลางแต่ละกลุ่มในหน่วย z-score (0 = เท่าค่าเฉลี่ยของทุกช่อง)

WORDS = {   # (ต่ำกว่าค่าเฉลี่ย, สูงกว่าค่าเฉลี่ย)
    "t_mean": ("early round", "late round"),
    "planted_share": ("pre-plant", "post-plant"),
    "dist_mean": ("close range", "long range"),
}


def name_cluster(z):
    top = sorted(range(len(FEATURES)), key=lambda i: -abs(z[i]))[:2]
    parts = [WORDS[FEATURES[i]][int(z[i] > 0)] for i in top if abs(z[i]) >= 0.3]
    return " + ".join(parts) or "average"


cluster_names = [name_cluster(z) for z in centers_z]

extra = df.groupby(["cx", "cy"]).agg(place=("victim_place", top_place), ct_win=("ct_won", "mean"))
cells = cells.join(extra)


# ===========================================================================
# ===========================================================================
duel_cluster = df.join(cells[["cluster"]], on=["cx", "cy"])       # ดวลไหนอยู่ช่องที่ถูกจัดกลุ่มไหน
clusters = cells.groupby("cluster").agg(
    n_cells=("kills", "size"), duels=("kills", "sum"),
    t_mean=("t_mean", "mean"), planted_share=("planted_share", "mean"),
    dist_mean=("dist_mean", "mean"),
)
clusters["ct_win"] = duel_cluster.groupby("cluster")["ct_won"].mean()   # เฉลี่ยรายดวล ไม่ใช่รายช่อง
clusters["name"] = cluster_names
clusters["top_places"] = [
    ", ".join(cells[cells["cluster"] == c]["place"].value_counts().head(3).index) for c in clusters.index
]

print(f"\n  {k_best} ประเภทช่อง (เรียงต้นรอบ -> ท้ายรอบ) | CT ชนะดวลรวมทั้งแมพ {df['ct_won'].mean():.2f}")
for c, r in clusters.iterrows():
    print(f"    type {c + 1}: {r['name']:<28} {int(r['n_cells']):>3} ช่อง {int(r['duels']):>5} ดวล | "
          f"{r['t_mean']:.0f}s  post-plant {r['planted_share']:.0%}  dist {r['dist_mean']:.0f}u  "
          f"CT ชนะ {r['ct_win']:.2f} | {r['top_places']}")
print("  CT ชนะ = เฉลยที่โมเดลไม่เคยเห็น ถ้าแต่ละประเภทต่างกันชัด แปลว่ากลุ่มที่เจอมีความหมาย")


OUT.mkdir(parents=True, exist_ok=True)


# ===========================================================================
# ===========================================================================
cells_out = cells.reset_index()
cells_out["cluster"] += 1                        # ให้เบอร์เริ่มที่ 1 เหมือนในรูป
cells_out["cluster_name"] = cells_out["cluster"].map(lambda c: cluster_names[c - 1])
cells_out.to_csv(OUT / "grid_ml1_cells.csv", index=False, encoding="utf-8-sig")
hotspots.to_csv(OUT / "grid_ml1_hotspots.csv", index=False, encoding="utf-8-sig")

payload = {
    "map": MAP,
    "grid_n": GRID_N,
    "min_kills": MIN_KILLS,
    "radar": {k: radar[k] for k in ("image", "size", "pos_x", "pos_y", "scale")},
    "metrics": {
        "matches": int(df["match_id"].nunique()),
        "duels": int(len(df)),
        "rows_raw": int(n_raw),
        "bandwidth": BANDWIDTH,
        "n_hotspots": int(len(hotspots)),
        "hotspot_coverage": 1 - noise_share,
        "hotspot_stability": hotspot_stability,
        "features": FEATURES,
        "k": k_best,
        "k_rule": k_rule,
        "silhouette": float(scan.loc[scan["k"] == k_best, "silhouette"].iloc[0]),
        "ari": float(scan.loc[scan["k"] == k_best, "ari"].iloc[0]),
        "k_scan": scan.to_dict(orient="records"),
        "n_boot": N_BOOT,
        "ct_win_overall": float(df["ct_won"].mean()),
    },
    "hotspots": hotspots.round(3).to_dict(orient="records"),
    "clusters": [
        {"id": c + 1, "name": r["name"], "n_cells": int(r["n_cells"]), "duels": int(r["duels"]),
         "ct_win": round(float(r["ct_win"]), 3), "top_places": r["top_places"],
         **{f: round(float(r[f]), 3) for f in FEATURES}}
        for c, r in clusters.iterrows()
    ],
    "cells": cells_out.round(3).to_dict(orient="records"),
}
(OUT / "grid_ml1.json").write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

print("\nเซฟแล้ว:")
for _f in ("grid_ml1_cells.csv", "grid_ml1_hotspots.csv", "grid_ml1.json"):
    print(f"  {OUT / _f}")
