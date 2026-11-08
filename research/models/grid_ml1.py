#!/usr/bin/env python3
"""สร้างโมเดล Grid จากจำนวนการตายและ hotspot บนแผนที่เท่านั้น."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.cluster import MeanShift

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description="Build per-map death-count grid and hotspots")
parser.add_argument("--map", default="de_ancient")
parser.add_argument("--csv", type=Path, default=ROOT / "data" / "all_kills.csv")
parser.add_argument("--output-dir", type=Path)
parser.add_argument("--min-kills", type=int, default=10)
args = parser.parse_args()

MAP = args.map
GRID_N = 32
MIN_KILLS = args.min_kills
BANDWIDTH = 300
MIN_BIN_FREQ = 15
N_BOOT = 20
SEED = 0
OUT = args.output_dir or ROOT / "output" / "models" / MAP

sys.path.insert(0, str(ROOT))
from backend.services.review import cells_of, radar_frame  # noqa: E402

for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass


def top_place(series: pd.Series) -> str:
    modes = series.dropna().mode()
    return str(modes.iloc[0]) if not modes.empty else "Unknown"


def resample_matches(data: pd.DataFrame, rng: np.random.Generator) -> pd.DataFrame:
    ids = data["match_id"].unique()
    picked = rng.choice(ids, size=len(ids), replace=True)
    return pd.concat([data[data["match_id"] == match] for match in picked], ignore_index=True)


def find_hotspots(data: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
    model = MeanShift(bandwidth=BANDWIDTH, bin_seeding=True, min_bin_freq=MIN_BIN_FREQ, cluster_all=False)
    model.fit(data[["victim_X", "victim_Y"]].to_numpy())
    return model.labels_, model.cluster_centers_


def cell_profiles(data: pd.DataFrame) -> pd.DataFrame:
    grouped = data.groupby(["cx", "cy"])
    profiles = pd.DataFrame({"kills": grouped.size()})
    return profiles[profiles["kills"] >= MIN_KILLS]


df = pd.read_csv(args.csv, low_memory=False)
raw_rows = len(df)
if "map_name" in df.columns:
    df = df[df["map_name"] == MAP].copy()
if df.empty:
    raise SystemExit(f"ไม่พบข้อมูลแมพ {MAP} ใน {args.csv.name}")
if "demo_file" not in df.columns:
    df["match_id"] = (df["tick"].diff() < 0).cumsum()
else:
    df["match_id"] = df["demo_file"]
if "round_start_tick" not in df.columns:
    raise SystemExit("CSV ไม่มีคอลัมน์ round_start_tick — รัน demoparser.py ก่อน")

rate = df["tickrate"].fillna(128)
df["t_round"] = (df["tick"] - df["round_start_tick"]) / rate
df["planted"] = (df["bomb_plant_tick"].notna() & (df["tick"] >= df["bomb_plant_tick"])).astype(int)
df = df[df["attacker_side"].notna() & (df["attacker_side"] != df["victim_side"])].copy()
df["ct_won"] = (df["attacker_side"] == "ct").astype(int)

radar = json.loads((ROOT / "assets" / "radars.json").read_text(encoding="utf-8"))[MAP]
frame = radar_frame(MAP)
df["cx"], df["cy"] = cells_of(df["victim_X"], df["victim_Y"], frame, GRID_N)
df["dist_xy"] = np.hypot(df["attacker_X"] - df["victim_X"], df["attacker_Y"] - df["victim_Y"])
print(f"{raw_rows:,} แถว -> ใช้ {len(df):,} การตาย | {df['match_id'].nunique()} แมตช์")

rng = np.random.default_rng(SEED)
boot_data = [resample_matches(df[["match_id", "victim_X", "victim_Y"]], rng) for _ in range(N_BOOT)]
labels, centers = find_hotspots(df)
order = np.argsort(-np.bincount(labels[labels >= 0])) if np.any(labels >= 0) else np.array([], dtype=int)
remap = {old: new for new, old in enumerate(order)}
df["hotspot"] = np.array([remap.get(label, -1) for label in labels])
centers = centers[order]

hotspot_rows = []
for hotspot_id, (hx, hy) in enumerate(centers):
    members = df[df["hotspot"] == hotspot_id]
    radius = np.hypot(members["victim_X"] - hx, members["victim_Y"] - hy)
    hotspot_rows.append({
        "id": hotspot_id + 1, "x": float(hx), "y": float(hy), "duels": len(members),
        "share": len(members) / len(df), "radius": float(np.percentile(radius, 80)),
        "place": top_place(members["victim_place"]), "t_mean": float(members["t_round"].mean()),
        "planted_share": float(members["planted"].mean()), "ct_win": float(members["ct_won"].mean()),
    })
hotspots = pd.DataFrame(hotspot_rows)
noise_share = float((df["hotspot"] < 0).mean())
found = []
for sample in boot_data:
    _, boot_centers = find_hotspots(sample)
    if len(centers) and len(boot_centers):
        distances = np.linalg.norm(centers[:, None, :] - boot_centers[None, :, :], axis=2)
        found.append(float((distances.min(axis=1) <= BANDWIDTH / 2).mean()))
hotspot_stability = float(np.mean(found)) if found else 0.0

cells = cell_profiles(df)
extra = df.groupby(["cx", "cy"]).agg(place=("victim_place", top_place), ct_win=("ct_won", "mean"))
cells = cells.join(extra)
cells["cluster"] = 0
cells["cluster_name"] = "Death count"
clusters = pd.DataFrame([{
    "id": 1, "name": "Death count", "n_cells": int(len(cells)), "duels": int(cells["kills"].sum()),
    "ct_win": float(df["ct_won"].mean()), "top_places": ", ".join(cells["place"].value_counts().head(3).index),
}])

OUT.mkdir(parents=True, exist_ok=True)
cells_out = cells.reset_index()
cells_out["cluster"] += 1
cells_out.to_csv(OUT / "grid_ml1_cells.csv", index=False, encoding="utf-8-sig")
hotspots.to_csv(OUT / "grid_ml1_hotspots.csv", index=False, encoding="utf-8-sig")
payload = {
    "map": MAP, "grid_n": GRID_N, "min_kills": MIN_KILLS,
    "radar": {key: radar[key] for key in ("image", "size", "pos_x", "pos_y", "scale")},
    "metrics": {"matches": int(df["match_id"].nunique()), "duels": int(len(df)), "rows_raw": int(raw_rows),
                "bandwidth": BANDWIDTH, "n_hotspots": int(len(hotspots)), "hotspot_coverage": 1 - noise_share,
                "hotspot_stability": hotspot_stability, "k": 1, "k_rule": "death count only",
                "n_boot": N_BOOT, "ct_win_overall": float(df["ct_won"].mean())},
    "hotspots": hotspots.round(3).to_dict(orient="records"),
    "clusters": clusters.round(3).to_dict(orient="records"),
    "cells": cells_out.round(3).to_dict(orient="records"),
}
(OUT / "grid_ml1.json").write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
print("สร้างผลลัพธ์แล้ว: grid_ml1_cells.csv, grid_ml1_hotspots.csv, grid_ml1.json")
