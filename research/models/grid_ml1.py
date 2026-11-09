"""Train per-map death hotspots and grid-cell clusters from reference kills.

Flow: prepare duels -> bootstrap matches -> MeanShift hotspots -> KMeans cells
      -> summarize the model -> save JSON and CSV artifacts.
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

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from backend.services.review import cells_of, radar_frame  # noqa: E402

# Training settings. Keep these stable when comparing model artifacts.
GRID_N = 16
BANDWIDTH = 300
MIN_BIN_FREQ = 15
FEATURES = ["t_mean", "planted_share", "dist_mean"]
K_RANGE = range(2, 9)
K_CLUSTERS = None  # Set an integer only to lock the number of cell clusters.
N_BOOT = 20
SEED = 0

BOOT_COLS = ["match_id", "victim_X", "victim_Y", "cx", "cy", "t_round", "planted", "dist_xy"]
WORDS = {
    "t_mean": ("early round", "late round"),
    "planted_share": ("pre-plant", "post-plant"),
    "dist_mean": ("close range", "long range"),
}
ARTIFACT_NAMES = ("grid_ml1_cells.csv", "grid_ml1_hotspots.csv", "grid_ml1.json")


class GridInputError(ValueError):
    """An input problem the CLI can explain without hiding unexpected training errors."""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train the per-map unsupervised grid model")
    parser.add_argument("--map", default="de_ancient", help="map name, e.g. de_ancient")
    parser.add_argument("--csv", type=Path, default=ROOT / "data" / "all_kills.csv")
    parser.add_argument("--min-kills", type=int, default=10, help="minimum duels per grid cell (default: 10)")
    return parser.parse_args()


def prepare_duels(csv_path: Path, map_name: str) -> tuple[pd.DataFrame, int, dict]:
    """Filter one map and add timing, grid coordinates, and duel features."""
    kills = pd.read_csv(csv_path)
    raw_rows = len(kills)

    if "map_name" in kills.columns:
        available_maps = sorted(kills["map_name"].unique())
        kills = kills[kills["map_name"] == map_name].copy()
        if kills.empty:
            raise GridInputError(f"No data for map {map_name} in {csv_path.name}; available maps: {available_maps}")

    if "demo_file" in kills.columns:
        kills["match_id"] = kills["demo_file"]
    else:
        # Legacy CSVs identify a new match when the recorded tick moves backward.
        kills["match_id"] = (kills["tick"].diff() < 0).cumsum()

    if "round_start_tick" not in kills.columns:
        raise GridInputError("CSV is missing round_start_tick; run python research/prep/demoparser.py --force first")

    tickrate = kills["tickrate"].fillna(128)
    kills["t_round"] = (kills["tick"] - kills["round_start_tick"]) / tickrate
    kills["planted"] = (
        kills["bomb_plant_tick"].notna() & (kills["tick"] >= kills["bomb_plant_tick"])
    ).astype(int)

    has_attacker = kills["attacker_side"].notna()
    enemy_duel = kills["attacker_side"] != kills["victim_side"]
    duels = kills[has_attacker & enemy_duel].copy()
    duels["ct_won"] = (duels["attacker_side"] == "ct").astype(int)

    radar = json.loads((ROOT / "assets" / "radars.json").read_text(encoding="utf-8"))[map_name]
    frame = radar_frame(map_name)
    duels["cx"], duels["cy"] = cells_of(duels["victim_X"], duels["victim_Y"], frame, GRID_N)
    duels["dist_xy"] = np.hypot(
        duels["attacker_X"] - duels["victim_X"],
        duels["attacker_Y"] - duels["victim_Y"],
    )
    return duels, raw_rows, radar


def top_place(places: pd.Series) -> str:
    """Use the most common callout to make a hotspot or cell easier to locate."""
    modes = places.dropna().mode()
    return modes.iloc[0] if len(modes) else "Unknown"


def resample_matches(duels: pd.DataFrame, rng: np.random.Generator) -> pd.DataFrame:
    """Sample the same number of matches with replacement, retaining all their duels."""
    match_ids = duels["match_id"].unique()
    sampled_ids = rng.choice(match_ids, size=len(match_ids), replace=True)
    return pd.concat(
        [duels[duels["match_id"] == match_id] for match_id in sampled_ids],
        ignore_index=True,
    )


def bootstrap_matches(duels: pd.DataFrame) -> list[pd.DataFrame]:
    """Reuse the same seeded bootstrap samples for both hotspot and cell validation."""
    rng = np.random.default_rng(SEED)
    return [resample_matches(duels[BOOT_COLS], rng) for _ in range(N_BOOT)]


def find_hotspots(duels: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
    """Fit spatial peaks; points outside every peak remain noise with label -1."""
    model = MeanShift(
        bandwidth=BANDWIDTH,
        bin_seeding=True,
        min_bin_freq=MIN_BIN_FREQ,
        cluster_all=False,
    ).fit(duels[["victim_X", "victim_Y"]].to_numpy())
    return model.labels_, model.cluster_centers_


def hotspot_stability(centers: np.ndarray, bootstrap_samples: list[pd.DataFrame]) -> float:
    """Measure how often original peaks reappear within half the bandwidth."""
    recurrence_rates = []
    for sample in bootstrap_samples:
        _, sample_centers = find_hotspots(sample)
        distances = np.linalg.norm(centers[:, None, :] - sample_centers[None, :, :], axis=2)
        recurrence_rates.append((distances.min(axis=1) <= BANDWIDTH / 2).mean())
    return float(np.mean(recurrence_rates))


def train_hotspots(
    duels: pd.DataFrame, bootstrap_samples: list[pd.DataFrame],
) -> tuple[pd.DataFrame, float, float]:
    """Describe MeanShift peaks in descending duel count and evaluate recurrence."""
    labels, centers = find_hotspots(duels)
    busiest_first = np.argsort(-np.bincount(labels[labels >= 0]))
    label_to_rank = {old: new for new, old in enumerate(busiest_first)}
    ranked_labels = np.array([label_to_rank.get(label, -1) for label in labels])
    centers = centers[busiest_first]

    rows = []
    for rank, (center_x, center_y) in enumerate(centers):
        members = duels[ranked_labels == rank]
        radii = np.hypot(members["victim_X"] - center_x, members["victim_Y"] - center_y)
        rows.append({
            "id": rank + 1,
            "x": float(center_x),
            "y": float(center_y),
            "duels": len(members),
            "share": len(members) / len(duels),
            "radius": float(np.percentile(radii, 80)),
            "place": top_place(members["victim_place"]),
            "t_mean": float(members["t_round"].mean()),
            "planted_share": float(members["planted"].mean()),
            # Descriptive statistic from the same data, not a held-out test.
            "ct_win": float(members["ct_won"].mean()),
        })

    noise_share = float((ranked_labels < 0).mean())
    stability = hotspot_stability(centers, bootstrap_samples)
    return pd.DataFrame(rows), noise_share, stability


def cell_profiles(duels: pd.DataFrame, min_kills: int) -> pd.DataFrame:
    """Aggregate duel behavior per grid cell, keeping cells with enough evidence."""
    grouped = duels.groupby(["cx", "cy"])
    profiles = pd.DataFrame({
        "kills": grouped.size(),
        "t_mean": grouped["t_round"].mean(),
        "planted_share": grouped["planted"].mean(),
        "dist_mean": grouped["dist_xy"].mean(),
    })
    return profiles[profiles["kills"] >= min_kills]


def fit_kmeans(scaled_features: np.ndarray, cluster_count: int) -> KMeans:
    return KMeans(n_clusters=cluster_count, n_init=20, random_state=SEED).fit(scaled_features)


def scan_cluster_counts(
    cells: pd.DataFrame,
    scaled_features: np.ndarray,
    bootstrap_profiles: list[pd.DataFrame],
    map_name: str,
) -> pd.DataFrame:
    """Compare candidate k values using silhouette and match-bootstrap ARI."""
    candidates = sorted(set(K_RANGE) | ({K_CLUSTERS} if K_CLUSTERS else set()))
    max_clusters = min([len(cells) - 1, *(len(profiles) for profiles in bootstrap_profiles)])
    candidates = [count for count in candidates if count <= max_clusters]
    if not candidates:
        raise GridInputError(
            f"Not enough grid cells to cluster {map_name}: {len(cells)} cells; "
            "lower --min-kills or add reference demos"
        )

    results = []
    for cluster_count in candidates:
        model = fit_kmeans(scaled_features, cluster_count)
        reference_labels = pd.Series(model.labels_, index=cells.index)
        stability_scores = []
        for profiles in bootstrap_profiles:
            # Only compare cells represented in both the original and bootstrap sample.
            common_cells = cells.index.intersection(profiles.index)
            sample_features = StandardScaler().fit_transform(profiles[FEATURES])
            sample_model = fit_kmeans(sample_features, cluster_count)
            sample_labels = pd.Series(sample_model.labels_, index=profiles.index)
            stability_scores.append(
                adjusted_rand_score(reference_labels.loc[common_cells], sample_labels.loc[common_cells])
            )
        results.append({
            "k": cluster_count,
            "silhouette": float(silhouette_score(scaled_features, model.labels_)),
            "ari": float(np.mean(stability_scores)),
        })
    return pd.DataFrame(results)


def name_cluster(center_z: np.ndarray) -> str:
    """Name a cluster from its two strongest above/below-average signals."""
    strongest = sorted(range(len(FEATURES)), key=lambda index: -abs(center_z[index]))[:2]
    parts = [
        WORDS[FEATURES[index]][int(center_z[index] > 0)]
        for index in strongest if abs(center_z[index]) >= 0.3
    ]
    return " + ".join(parts) or "average"


def describe_cell_clusters(
    duels: pd.DataFrame, cells: pd.DataFrame, cluster_names: list[str],
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Add callouts and descriptive duel win rates after fitting the clusters."""
    extra = duels.groupby(["cx", "cy"]).agg(place=("victim_place", top_place), ct_win=("ct_won", "mean"))
    cells = cells.join(extra)
    duel_clusters = duels.join(cells[["cluster"]], on=["cx", "cy"])

    clusters = cells.groupby("cluster").agg(
        n_cells=("kills", "size"),
        duels=("kills", "sum"),
        t_mean=("t_mean", "mean"),
        planted_share=("planted_share", "mean"),
        dist_mean=("dist_mean", "mean"),
    )
    # Weight the win rate by individual duels rather than by equally weighted cells.
    clusters["ct_win"] = duel_clusters.groupby("cluster")["ct_won"].mean()
    clusters["name"] = cluster_names
    clusters["top_places"] = [
        ", ".join(cells[cells["cluster"] == cluster_id]["place"].value_counts().head(3).index)
        for cluster_id in clusters.index
    ]
    return cells, clusters


def train_cell_clusters(
    duels: pd.DataFrame,
    bootstrap_samples: list[pd.DataFrame],
    map_name: str,
    min_kills: int,
) -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    """Select k, fit cell clusters, and order cluster IDs from early to late."""
    cells = cell_profiles(duels, min_kills)
    scaler = StandardScaler().fit(cells[FEATURES])
    scaled_features = scaler.transform(cells[FEATURES])
    bootstrap_profiles = [cell_profiles(sample, min_kills) for sample in bootstrap_samples]
    scan = scan_cluster_counts(cells, scaled_features, bootstrap_profiles, map_name)

    cluster_count = K_CLUSTERS or int(scan.loc[scan["silhouette"].idxmax(), "k"])
    selection_rule = f"locked to {K_CLUSTERS}" if K_CLUSTERS else "highest silhouette"
    model = fit_kmeans(scaled_features, cluster_count)

    early_to_late = np.argsort(model.cluster_centers_[:, FEATURES.index("t_mean")])
    label_to_order = {old: new for new, old in enumerate(early_to_late)}
    cells["cluster"] = [label_to_order[label] for label in model.labels_]
    cluster_names = [name_cluster(center) for center in model.cluster_centers_[early_to_late]]
    cells, clusters = describe_cell_clusters(duels, cells, cluster_names)

    selected = scan.loc[scan["k"] == cluster_count].iloc[0]
    metrics = {
        "features": FEATURES,
        "k": cluster_count,
        "k_rule": selection_rule,
        "silhouette": float(selected["silhouette"]),
        "ari": float(selected["ari"]),
        "k_scan": scan.to_dict(orient="records"),
        "n_boot": N_BOOT,
    }
    return cells, clusters, metrics


def train_grid_model(csv_path: Path, map_name: str, min_kills: int = 10) -> tuple[dict, pd.DataFrame, pd.DataFrame]:
    """Run both models and build artifacts without writing any files."""
    duels, raw_rows, radar = prepare_duels(csv_path, map_name)
    bootstrap_samples = bootstrap_matches(duels)
    hotspots, noise_share, stability = train_hotspots(duels, bootstrap_samples)
    cells, clusters, cluster_metrics = train_cell_clusters(duels, bootstrap_samples, map_name, min_kills)

    # Internally cluster IDs start at zero; exported cell/cluster IDs start at one.
    cells_out = cells.reset_index()
    cells_out["cluster"] += 1
    cluster_names = clusters["name"].tolist()
    cells_out["cluster_name"] = cells_out["cluster"].map(lambda cluster_id: cluster_names[cluster_id - 1])

    payload = {
        "map": map_name,
        "grid_n": GRID_N,
        "min_kills": min_kills,
        "radar": {key: radar[key] for key in ("image", "size", "pos_x", "pos_y", "scale")},
        "metrics": {
            "matches": int(duels["match_id"].nunique()),
            "duels": int(len(duels)),
            "rows_raw": int(raw_rows),
            "bandwidth": BANDWIDTH,
            "n_hotspots": int(len(hotspots)),
            "hotspot_coverage": 1 - noise_share,
            "hotspot_stability": stability,
            **cluster_metrics,
            "ct_win_overall": float(duels["ct_won"].mean()),
        },
        "hotspots": hotspots.round(3).to_dict(orient="records"),
        "clusters": [
            {
                "id": cluster_id + 1,
                "name": row["name"],
                "n_cells": int(row["n_cells"]),
                "duels": int(row["duels"]),
                "ct_win": round(float(row["ct_win"]), 3),
                "top_places": row["top_places"],
                **{feature: round(float(row[feature]), 3) for feature in FEATURES},
            }
            for cluster_id, row in clusters.iterrows()
        ],
        "cells": cells_out.round(3).to_dict(orient="records"),
    }
    return payload, cells_out, hotspots


def print_training_summary(payload: dict, cells: pd.DataFrame, hotspots: pd.DataFrame) -> None:
    """Keep human-readable reporting separate from model calculations."""
    metrics = payload["metrics"]
    print(f"{metrics['rows_raw']:,} rows -> {metrics['duels']:,} valid duels | {metrics['matches']} matches")
    print(
        f"\nQuestion 1 — MeanShift radius {BANDWIDTH} units: found {len(hotspots)} hotspots "
        f"covering {metrics['hotspot_coverage']:.0%} of duels (the remainder is dispersed noise)"
    )
    print(
        f"  Stability: after {N_BOOT} match-level bootstrap runs, "
        f"{metrics['hotspot_stability']:.0%} of peaks reappeared nearby"
    )
    print(hotspots[["id", "place", "duels", "share", "t_mean", "planted_share", "ct_win"]].to_string(
        index=False,
        formatters={
            "share": "{:.1%}".format, "t_mean": "{:.0f}s".format,
            "planted_share": "{:.0%}".format, "ct_win": "{:.2f}".format,
        },
    ))
    print(
        f"\nQuestion 2 — cells with at least {payload['min_kills']} duels: {len(cells)} cells "
        f"(covering {cells['kills'].sum() / metrics['duels']:.0%} of duels)"
    )
    print(f"\n  Scanning k (selected by {metrics['k_rule']}, {N_BOOT} bootstrap runs):")
    for result in metrics["k_scan"]:
        marker = "  <- selected" if result["k"] == metrics["k"] else ""
        print(f"    k={result['k']}  silhouette {result['silhouette']:.3f}  ARI {result['ari']:.2f}{marker}")
    print(
        f"\n  {metrics['k']} cell types (ordered early to late) | "
        f"overall CT duel win rate {metrics['ct_win_overall']:.2f}"
    )
    for cluster in payload["clusters"]:
        print(
            f"    type {cluster['id']}: {cluster['name']:<28} {cluster['n_cells']:>3} cells "
            f"{cluster['duels']:>5} duels | {cluster['t_mean']:.0f}s  "
            f"post-plant {cluster['planted_share']:.0%}  dist {cluster['dist_mean']:.0f}u  "
            f"CT win {cluster['ct_win']:.2f} | {cluster['top_places']}"
        )
    print("  CT win rates are descriptive statistics, not held-out validation or round-win probabilities")


def save_results(payload: dict, cells: pd.DataFrame, hotspots: pd.DataFrame, output_dir: Path) -> None:
    """Write the existing JSON/CSV schemas and filenames used by the backend."""
    output_dir.mkdir(parents=True, exist_ok=True)
    cells.to_csv(output_dir / "grid_ml1_cells.csv", index=False, encoding="utf-8-sig")
    hotspots.to_csv(output_dir / "grid_ml1_hotspots.csv", index=False, encoding="utf-8-sig")
    (output_dir / "grid_ml1.json").write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def main() -> None:
    args = parse_args()
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass

    try:
        payload, cells, hotspots = train_grid_model(args.csv, args.map, args.min_kills)
    except GridInputError as exc:
        raise SystemExit(str(exc)) from None

    print_training_summary(payload, cells, hotspots)
    output_dir = ROOT / "output" / "models" / args.map
    save_results(payload, cells, hotspots, output_dir)
    print("\nSaved:")
    for filename in ARTIFACT_NAMES:
        print(f"  {output_dir / filename}")


if __name__ == "__main__":
    main()
