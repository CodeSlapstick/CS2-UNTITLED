import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.cluster import MeanShift

ROOT = Path(__file__).resolve().parents[2]

BANDWIDTH = 300
MIN_BIN_FREQ = 15
N_BOOT = 20
SEED = 0

BOOT_COLS = ["match_id", "victim_X", "victim_Y"]
ARTIFACT_NAMES = ("grid_ml1_hotspots.csv", "grid_ml1.json")


class GridInputError(ValueError):
    pass

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train per-map MeanShift death hotspots")
    parser.add_argument("--map", default="de_ancient", help="map name, e.g. de_ancient")
    parser.add_argument("--csv", type=Path, default=ROOT / "data" / "all_kills.csv")
    args = parser.parse_args()
    return args


def prepare_duels(csv_path: Path, map_name: str) -> tuple[pd.DataFrame, int, dict]:
    kills = pd.read_csv(csv_path)
    raw_rows = len(kills)

    if "map_name" in kills.columns:
        available_maps = sorted(kills["map_name"].unique())
        is_selected_map = kills["map_name"] == map_name
        kills = kills[is_selected_map].copy()
        if kills.empty:
            raise GridInputError(f"No data for map {map_name} in {csv_path.name}; available maps: {available_maps}")

    if "demo_file" in kills.columns:
        kills["match_id"] = kills["demo_file"]
    else:
        tick_difference = kills["tick"].diff()
        starts_new_match = tick_difference < 0
        kills["match_id"] = starts_new_match.cumsum()

    if "round_start_tick" not in kills.columns:
        raise GridInputError("CSV is missing round_start_tick; run python research/prep/demoparser.py --force first")

    tickrate = kills["tickrate"].fillna(128)
    elapsed_ticks = kills["tick"] - kills["round_start_tick"]
    kills["t_round"] = elapsed_ticks / tickrate

    has_attacker = kills["attacker_side"].notna()
    is_enemy_duel = kills["attacker_side"] != kills["victim_side"]
    is_valid_duel = has_attacker & is_enemy_duel
    duels = kills[is_valid_duel].copy()
    ct_is_attacker = duels["attacker_side"] == "ct"
    duels["ct_won"] = ct_is_attacker.astype(int)

    radar_path = ROOT / "assets" / "radars.json"
    radar_text = radar_path.read_text(encoding="utf-8")
    radars_by_map = json.loads(radar_text)
    radar = radars_by_map[map_name]
    return duels, raw_rows, radar


def top_place(places: pd.Series) -> str:
    most_common_places = places.dropna().mode()
    if most_common_places.empty:
        return "Unknown"
    return most_common_places.iloc[0]


def resample_matches(duels: pd.DataFrame, rng: np.random.Generator) -> pd.DataFrame:
    match_ids = duels["match_id"].unique()
    sampled_match_ids = rng.choice(match_ids, size=len(match_ids), replace=True)
    sampled_matches = []
    for match_id in sampled_match_ids:
        belongs_to_match = duels["match_id"] == match_id
        match_rows = duels[belongs_to_match]
        sampled_matches.append(match_rows)

    return pd.concat(sampled_matches, ignore_index=True)


def bootstrap_matches(duels: pd.DataFrame) -> list[pd.DataFrame]:
    rng = np.random.default_rng(SEED)
    positions_by_match = duels[BOOT_COLS]
    samples = []
    for _ in range(N_BOOT):
        sample = resample_matches(positions_by_match, rng)
        samples.append(sample)
    return samples


def find_hotspots(duels: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
    position_columns = ["victim_X", "victim_Y"]
    death_positions = duels[position_columns].to_numpy()
    model = MeanShift(
        bandwidth=BANDWIDTH,
        bin_seeding=True,
        min_bin_freq=MIN_BIN_FREQ,
        cluster_all=False,
    )
    model.fit(death_positions)
    return model.labels_, model.cluster_centers_


def hotspot_stability(centers: np.ndarray, bootstrap_samples: list[pd.DataFrame]) -> float:
    nearby_distance = BANDWIDTH / 2
    recurrence_rates = []
    for sample in bootstrap_samples:
        sample_labels, sample_centers = find_hotspots(sample)
        reappeared_nearby = []
        for original_center in centers:
            offsets = original_center - sample_centers
            distances = np.linalg.norm(offsets, axis=1)
            nearest_distance = distances.min()
            found_nearby = nearest_distance <= nearby_distance
            reappeared_nearby.append(found_nearby)

        recurrence_rate = np.mean(reappeared_nearby)
        recurrence_rates.append(recurrence_rate)
    return float(np.mean(recurrence_rates))


def train_hotspots(
    duels: pd.DataFrame,
    bootstrap_samples: list[pd.DataFrame],
) -> tuple[pd.DataFrame, float, float]:
    labels, centers = find_hotspots(duels)

    hotspot_labels = labels[labels >= 0]
    duel_counts = np.bincount(hotspot_labels)
    busiest_first = np.argsort(-duel_counts)
    label_to_rank = {}
    for rank, original_label in enumerate(busiest_first):
        label_to_rank[original_label] = rank

    ranked_label_values = []
    for label in labels:
        new_rank = label_to_rank.get(label, -1)
        ranked_label_values.append(new_rank)
    ranked_labels = np.array(ranked_label_values)
    ranked_centers = centers[busiest_first]

    hotspot_rows = []
    for rank, (center_x, center_y) in enumerate(ranked_centers):
        hotspot_duels = duels[ranked_labels == rank]
        distance_x = hotspot_duels["victim_X"] - center_x
        distance_y = hotspot_duels["victim_Y"] - center_y
        distances_from_center = np.hypot(distance_x, distance_y)
        duel_count = len(hotspot_duels)
        hotspot = {
            "id": rank + 1,
            "x": float(center_x),
            "y": float(center_y),
            "duels": duel_count,
            "share": duel_count / len(duels),
            "radius": float(np.percentile(distances_from_center, 80)),
            "place": top_place(hotspot_duels["victim_place"]),
            "t_mean": float(hotspot_duels["t_round"].mean()),
            "ct_win": float(hotspot_duels["ct_won"].mean()),
        }
        hotspot_rows.append(hotspot)

    noise_share = float((ranked_labels < 0).mean())
    stability = hotspot_stability(ranked_centers, bootstrap_samples)
    return pd.DataFrame(hotspot_rows), noise_share, stability


def train_grid_model(csv_path: Path, map_name: str) -> tuple[dict, pd.DataFrame]:
    duels, raw_rows, radar = prepare_duels(csv_path, map_name)
    bootstrap_samples = bootstrap_matches(duels)
    hotspots, noise_share, stability = train_hotspots(duels, bootstrap_samples)

    radar_for_export = {
        "image": radar["image"],
        "size": radar["size"],
        "pos_x": radar["pos_x"],
        "pos_y": radar["pos_y"],
        "scale": radar["scale"],
    }
    rounded_hotspots = hotspots.round(3)
    hotspot_records = rounded_hotspots.to_dict(orient="records")

    payload = {
        "map": map_name,
        "radar": radar_for_export,
        "metrics": {
            "matches": int(duels["match_id"].nunique()),
            "duels": int(len(duels)),
            "rows_raw": int(raw_rows),
            "bandwidth": BANDWIDTH,
            "n_hotspots": int(len(hotspots)),
            "hotspot_coverage": 1 - noise_share,
            "hotspot_stability": stability,
            "n_boot": N_BOOT,
            "ct_win_overall": float(duels["ct_won"].mean()),
        },
        "hotspots": hotspot_records,
    }
    return payload, hotspots


def print_training_summary(payload: dict, hotspots: pd.DataFrame) -> None:
    metrics = payload["metrics"]
    print(f"{metrics['rows_raw']:,} rows -> {metrics['duels']:,} valid duels | {metrics['matches']} matches")
    print(
        f"\nMeanShift radius {BANDWIDTH} units: found {len(hotspots)} hotspots "
        f"covering {metrics['hotspot_coverage']:.0%} of duels (the remainder is dispersed noise)"
    )
    print(
        f"  Stability: after {N_BOOT} match-level bootstrap runs, "
        f"{metrics['hotspot_stability']:.0%} of peaks reappeared nearby"
    )
    print(
        hotspots[["id", "place", "duels", "share", "t_mean", "ct_win"]].to_string(
            index=False,
            formatters={
                "share": "{:.1%}".format,
                "t_mean": "{:.0f}s".format,
                "ct_win": "{:.2f}".format,
            },
        )
    )
    print("  CT win rates are descriptive statistics, not held-out validation or round-win probabilities")


def save_results(payload: dict, hotspots: pd.DataFrame, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    csv_path = output_dir / "grid_ml1_hotspots.csv"
    hotspots.to_csv(csv_path, index=False, encoding="utf-8-sig")

    json_path = output_dir / "grid_ml1.json"
    json_text = json.dumps(payload, ensure_ascii=False)
    json_path.write_text(json_text, encoding="utf-8")


def main() -> None:
    args = parse_args()
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass

    try:
        payload, hotspots = train_grid_model(args.csv, args.map)
    except GridInputError as error:
        raise SystemExit(str(error)) from None

    print_training_summary(payload, hotspots)
    output_dir = ROOT / "output" / "models" / args.map
    save_results(payload, hotspots, output_dir)
    print("\nSaved:")
    for filename in ARTIFACT_NAMES:
        print(f"  {output_dir / filename}")


if __name__ == "__main__":
    main()
