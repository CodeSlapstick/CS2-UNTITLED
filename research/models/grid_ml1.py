import argparse
import json
import sys
from pathlib import Path

import matplotlib
import numpy as np
import pandas as pd

matplotlib.use("Agg")            # Render to files without requiring a display.
import matplotlib.pyplot as plt
from matplotlib.cm import ScalarMappable
from matplotlib.colors import LinearSegmentedColormap, Normalize
from matplotlib.patches import Circle
from PIL import Image
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

MAP = _args.map
GRID_N = 16
MIN_KILLS = _args.min_kills

BANDWIDTH = 300
MIN_BIN_FREQ = 15

FEATURES = ["t_mean", "planted_share", "dist_mean"]
K_RANGE = range(2, 9)
K_CLUSTERS = None
N_BOOT = 20
SEED = 0

CSV = _args.csv
OUT = _args.output_dir or ROOT / "output" / "models" / MAP

sys.path.insert(0, str(ROOT))
from backend.services.review import cells_of, radar_frame

for _s in (sys.stdout, sys.stderr):
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
        sys.exit(f"No data for map {MAP} in {CSV.name}; available maps: {sorted(pd.read_csv(CSV)['map_name'].unique())}")


# ===========================================================================
# ===========================================================================
if "demo_file" in df.columns:
    df["match_id"] = df["demo_file"]
else:
    df["match_id"] = (df["tick"].diff() < 0).cumsum()   # Fallback for legacy CSV files.


# ===========================================================================
# ===========================================================================
if "round_start_tick" not in df.columns:
    sys.exit("CSV is missing round_start_tick; run python research/prep/demoparser.py --force first")

rate = df["tickrate"].fillna(128)
df["t_round"] = (df["tick"] - df["round_start_tick"]) / rate                  # Seconds elapsed in the round.
df["planted"] = (df["bomb_plant_tick"].notna() & (df["tick"] >= df["bomb_plant_tick"])).astype(int)


# ===========================================================================
# ===========================================================================
has_attacker = df["attacker_side"].notna()
enemy_duel = df["attacker_side"] != df["victim_side"]
df = df[has_attacker & enemy_duel].copy()

df["ct_won"] = (df["attacker_side"] == "ct").astype(int)


# ===========================================================================
# ===========================================================================
radar = json.loads((ROOT / "assets" / "radars.json").read_text(encoding="utf-8"))[MAP]   # Metadata and image path.

frame = radar_frame(MAP)
span = frame.span                          # 1024 pixels x 5.0 = 5120 game units.
x_left, x_right, y_bottom, y_top = frame.extent
cell_size = frame.cell_size(GRID_N)        # 5120 / 32 = 160 game units per cell.

df["cx"], df["cy"] = cells_of(df["victim_X"], df["victim_Y"], frame, GRID_N)

df["dist_xy"] = np.hypot(df["attacker_X"] - df["victim_X"], df["attacker_Y"] - df["victim_Y"])

print(f"{n_raw:,} rows -> {len(df):,} valid duels | {df['match_id'].nunique()} matches")


def top_place(s):
    """Return the most common callout to make a cluster easier to locate."""
    m = s.dropna().mode()
    return m.iloc[0] if len(m) else "Unknown"


def resample_matches(d, rng):
    """Bootstrap by resampling matches with replacement while preserving sample size."""
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
                   cluster_all=False)   # Points farther than BANDWIDTH from every peak remain noise (-1).
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
        "radius": float(np.percentile(r, 80)),        # Radius covering 80% of cluster points.
        "place": top_place(m["victim_place"]),
        "t_mean": float(m["t_round"].mean()),
        "planted_share": float(m["planted"].mean()),
        "ct_win": float(m["ct_won"].mean()),          # Held-out validation; not used to find hotspots.
    })
hotspots = pd.DataFrame(rows)
noise_share = float((df["hotspot"] < 0).mean())

found = []
for b in boots:
    _, cb = find_hotspots(b)
    dist = np.linalg.norm(centers[:, None, :] - cb[None, :, :], axis=2)   # Pairwise original-to-bootstrap distances.
    found.append((dist.min(axis=1) <= BANDWIDTH / 2).mean())
hotspot_stability = float(np.mean(found))

print(f"\nQuestion 1 — MeanShift radius {BANDWIDTH} units: found {len(hotspots)} hotspots "
      f"covering {1 - noise_share:.0%} of duels (the remainder is dispersed noise)")
print(f"  Stability: after {N_BOOT} match-level bootstrap runs, {hotspot_stability:.0%} of peaks reappeared nearby")
print(hotspots[["id", "place", "duels", "share", "t_mean", "planted_share", "ct_win"]].to_string(
    index=False, formatters={"share": "{:.1%}".format, "t_mean": "{:.0f}s".format,
                             "planted_share": "{:.0%}".format, "ct_win": "{:.2f}".format}))
print("  ct_win = CT duel win rate added afterward for validation; the model never sees this value")


# ===========================================================================
# ===========================================================================
def cell_profiles(d):
    g = d.groupby(["cx", "cy"])
    p = pd.DataFrame({
        "kills": g.size(),
        "t_mean": g["t_round"].mean(),          # Mean time within the round, in seconds.
        "planted_share": g["planted"].mean(),   # Share occurring after the bomb was planted.
        "dist_mean": g["dist_xy"].mean(),       # Mean duel distance in game units.
    })
    return p[p["kills"] >= MIN_KILLS]


cells = cell_profiles(df)
print(f"\nQuestion 2 — cells with at least {MIN_KILLS} duels: {len(cells)} of {df.groupby(['cx', 'cy']).ngroups} cells "
      f"(covering {cells['kills'].sum() / len(df):.0%} of duels)")

scaler = StandardScaler().fit(cells[FEATURES])
Z = scaler.transform(cells[FEATURES])


def fit_kmeans(X, k):
    return KMeans(n_clusters=k, n_init=20, random_state=SEED).fit(X)


boot_profiles = [cell_profiles(b) for b in boots]
ks = sorted(set(K_RANGE) | ({K_CLUSTERS} if K_CLUSTERS else set()))   # Include a manually locked k in the scan.
max_k = min([len(cells) - 1, *(len(bp) for bp in boot_profiles)])
ks = [k for k in ks if k <= max_k]
if not ks:
    sys.exit(f"Not enough grid cells to cluster {MAP}: {len(cells)} cells; lower --min-kills or add reference demos")
scan = []
for k in ks:
    km = fit_kmeans(Z, k)
    ref = pd.Series(km.labels_, index=cells.index)
    aris = []
    for bp in boot_profiles:
        common = cells.index.intersection(bp.index)     # Compare only cells represented in both samples.
        lab_b = pd.Series(fit_kmeans(StandardScaler().fit_transform(bp[FEATURES]), k).labels_, index=bp.index)
        aris.append(adjusted_rand_score(ref.loc[common], lab_b.loc[common]))
    scan.append({"k": k, "silhouette": float(silhouette_score(Z, km.labels_)), "ari": float(np.mean(aris))})
scan = pd.DataFrame(scan)

k_best = K_CLUSTERS or int(scan.loc[scan["silhouette"].idxmax(), "k"])
k_rule = f"locked to {K_CLUSTERS}" if K_CLUSTERS else "highest silhouette"

print(f"\n  Scanning k (selected by {k_rule}, {N_BOOT} bootstrap runs):")
for r in scan.itertuples():
    mark = "  <- selected" if r.k == k_best else ""
    print(f"    k={r.k}  silhouette {r.silhouette:.3f}  ARI {r.ari:.2f}{mark}")

km = fit_kmeans(Z, k_best)

order = np.argsort(km.cluster_centers_[:, FEATURES.index("t_mean")])
remap = {old: new for new, old in enumerate(order)}
cells["cluster"] = [remap[lab] for lab in km.labels_]
centers_z = km.cluster_centers_[order]   # Cluster centers as z-scores; zero equals the mean across cells.

WORDS = {   # (below average, above average)
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
duel_cluster = df.join(cells[["cluster"]], on=["cx", "cy"])       # Assign each duel to its cell cluster.
clusters = cells.groupby("cluster").agg(
    n_cells=("kills", "size"), duels=("kills", "sum"),
    t_mean=("t_mean", "mean"), planted_share=("planted_share", "mean"),
    dist_mean=("dist_mean", "mean"),
)
clusters["ct_win"] = duel_cluster.groupby("cluster")["ct_won"].mean()   # Duel-weighted rather than cell-weighted.
clusters["name"] = cluster_names
clusters["top_places"] = [
    ", ".join(cells[cells["cluster"] == c]["place"].value_counts().head(3).index) for c in clusters.index
]

print(f"\n  {k_best} cell types (ordered early to late) | overall CT duel win rate {df['ct_won'].mean():.2f}")
for c, r in clusters.iterrows():
    print(f"    type {c + 1}: {r['name']:<28} {int(r['n_cells']):>3} cells {int(r['duels']):>5} duels | "
          f"{r['t_mean']:.0f}s  post-plant {r['planted_share']:.0%}  dist {r['dist_mean']:.0f}u  "
          f"CT win {r['ct_win']:.2f} | {r['top_places']}")
print("  CT win rate is held-out validation; clear differences indicate meaningful clusters")


# ===========================================================================
# ===========================================================================
img = np.asarray(Image.open(ROOT / "assets" / radar["image"].lstrip("/")).convert("RGB"))
extent = [x_left, x_right, y_bottom, y_top]      # Game-coordinate extent covered by the radar image.

FREQ_HEX = ["#FF0000", "#DF5B5B", "#FFA0A0", "#E9D5FF"]
_freq = LinearSegmentedColormap.from_list("duels", FREQ_HEX)
FREQ_CMAP = LinearSegmentedColormap.from_list("duels_hot", _freq(np.linspace(0.15, 1.0, 256)))

hot_norm = Normalize(vmin=hotspots["duels"].min(), vmax=hotspots["duels"].max())
HOT_COLORS = [FREQ_CMAP(hot_norm(d)) for d in hotspots["duels"]]


def ink(rgba) -> str:
    """Choose readable text color: dark ink on light backgrounds, white on dark backgrounds."""
    r, g, b = rgba[:3]
    return "#1B1023" if 0.299 * r + 0.587 * g + 0.114 * b > 0.62 else "white"

fig, ax = plt.subplots(figsize=(11, 10))
ax.imshow(img, extent=extent, origin="upper")
noise = df[df["hotspot"] < 0]
ax.scatter(noise["victim_X"], noise["victim_Y"], s=3, c="#bbbbbb", alpha=0.35, linewidths=0)
for i, h in hotspots.iterrows():
    m = df[df["hotspot"] == i]
    ax.scatter(m["victim_X"], m["victim_Y"], s=4, color="#C084FC", alpha=0.30, linewidths=0)
    ax.add_patch(Circle((h["x"], h["y"]), h["radius"], fill=False, ec=HOT_COLORS[i], lw=2.2))
    ax.text(h["x"], h["y"], str(int(h["id"])), ha="center", va="center", fontsize=8, fontweight="bold",
            color=ink(HOT_COLORS[i]),
            bbox=dict(boxstyle="circle,pad=0.25", fc=HOT_COLORS[i], ec="white", lw=0.8))
cb = fig.colorbar(ScalarMappable(norm=hot_norm, cmap=FREQ_CMAP), ax=ax, fraction=0.036, pad=0.012)
cb.set_label("deaths in this hotspot (dark = fewer, bright = more)", fontsize=9)
cb.ax.tick_params(labelsize=8)
ax.set_title(f"{MAP} death hotspots — MeanShift, bandwidth {BANDWIDTH} units\n"
             f"{len(hotspots)} hotspots contain {1 - noise_share:.0%} of deaths · number 1 = busiest · "
             f"grey = outside every hotspot\n"
             f"{hotspot_stability:.0%} of hotspot centers recur under match-level bootstrap", fontsize=11)
ax.set_xticks([])
ax.set_yticks([])
fig.tight_layout()

OUT.mkdir(parents=True, exist_ok=True)
fig.savefig(OUT / "grid_ml1_map.png", dpi=140)


# ===========================================================================
# ===========================================================================
cells_out = cells.reset_index()
cells_out["cluster"] += 1                        # Use one-based cluster IDs in exported artifacts.
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

print("\nSaved:")
for _f in ("grid_ml1_map.png", "grid_ml1_cells.csv", "grid_ml1_hotspots.csv", "grid_ml1.json"):
    print(f"  {OUT / _f}")
