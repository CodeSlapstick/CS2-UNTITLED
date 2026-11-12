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
    return parser.parse_args()


def prepare_duels(csv_path: Path, map_name: str) -> tuple[pd.DataFrame, int, dict]:
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
        kills["match_id"] = (kills["tick"].diff() < 0).cumsum()

    if "round_start_tick" not in kills.columns:
        raise GridInputError("CSV is missing round_start_tick; run python research/prep/demoparser.py --force first")

    tickrate = kills["tickrate"].fillna(128)
    kills["t_round"] = (kills["tick"] - kills["round_start_tick"]) / tickrate
    kills["planted"] = (kills["bomb_plant_tick"].notna() & (kills["tick"] >= kills["bomb_plant_tick"])).astype(int)

    has_attacker = kills["attacker_side"].notna()
    enemy_duel = kills["attacker_side"] != kills["victim_side"]
    duels = kills[has_attacker & enemy_duel].copy()
    duels["ct_won"] = (duels["attacker_side"] == "ct").astype(int)

    radar = json.loads((ROOT / "assets" / "radars.json").read_text(encoding="utf-8"))[map_name]
    return duels, raw_rows, radar


def top_place(places: pd.Series) -> str:
    modes = places.dropna().mode()
    return modes.iloc[0] if len(modes) else "Unknown"


def resample_matches(duels: pd.DataFrame, rng: np.random.Generator) -> pd.DataFrame:
    match_ids = duels["match_id"].unique()
    sampled_ids = rng.choice(match_ids, size=len(match_ids), replace=True)
    return pd.concat(
        [duels[duels["match_id"] == match_id] for match_id in sampled_ids],
        ignore_index=True,
    )


def bootstrap_matches(duels: pd.DataFrame) -> list[pd.DataFrame]:
    rng = np.random.default_rng(SEED)
    return [resample_matches(duels[BOOT_COLS], rng) for _ in range(N_BOOT)]


def find_hotspots(duels: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
    model = MeanShift(
        bandwidth=BANDWIDTH,
        bin_seeding=True,
        min_bin_freq=MIN_BIN_FREQ,
        cluster_all=False,
    ).fit(duels[["victim_X", "victim_Y"]].to_numpy())
    return model.labels_, model.cluster_centers_


def hotspot_stability(centers: np.ndarray, bootstrap_samples: list[pd.DataFrame]) -> float:
    recurrence_rates = []
    for sample in bootstrap_samples:
        _, sample_centers = find_hotspots(sample)
        distances = np.linalg.norm(centers[:, None, :] - sample_centers[None, :, :], axis=2)
        recurrence_rates.append((distances.min(axis=1) <= BANDWIDTH / 2).mean())
    return float(np.mean(recurrence_rates))


def train_hotspots(
    duels: pd.DataFrame,
    bootstrap_samples: list[pd.DataFrame],
) -> tuple[pd.DataFrame, float, float]:
    labels, centers = find_hotspots(duels)
    busiest_first = np.argsort(-np.bincount(labels[labels >= 0]))
    label_to_rank = {old: new for new, old in enumerate(busiest_first)}
    ranked_labels = np.array([label_to_rank.get(label, -1) for label in labels])
    centers = centers[busiest_first]

    rows = []
    for rank, (center_x, center_y) in enumerate(centers):
        members = duels[ranked_labels == rank]
        radii = np.hypot(members["victim_X"] - center_x, members["victim_Y"] - center_y)
        rows.append(
            {
                "id": rank + 1,
                "x": float(center_x),
                "y": float(center_y),
                "duels": len(members),
                "share": len(members) / len(duels),
                "radius": float(np.percentile(radii, 80)),
                "place": top_place(members["victim_place"]),
                "t_mean": float(members["t_round"].mean()),
                "planted_share": float(members["planted"].mean()),
                "ct_win": float(members["ct_won"].mean()),
            }
        )

    noise_share = float((ranked_labels < 0).mean())
    stability = hotspot_stability(centers, bootstrap_samples)
    return pd.DataFrame(rows), noise_share, stability


def train_grid_model(csv_path: Path, map_name: str) -> tuple[dict, pd.DataFrame]:
    duels, raw_rows, radar = prepare_duels(csv_path, map_name)
    bootstrap_samples = bootstrap_matches(duels)
    hotspots, noise_share, stability = train_hotspots(duels, bootstrap_samples)

    payload = {
        "map": map_name,
        "radar": {key: radar[key] for key in ("image", "size", "pos_x", "pos_y", "scale")},
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
        "hotspots": hotspots.round(3).to_dict(orient="records"),
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
        hotspots[["id", "place", "duels", "share", "t_mean", "planted_share", "ct_win"]].to_string(
            index=False,
            formatters={
                "share": "{:.1%}".format,
                "t_mean": "{:.0f}s".format,
                "planted_share": "{:.0%}".format,
                "ct_win": "{:.2f}".format,
            },
        )
    )
    print("  CT win rates are descriptive statistics, not held-out validation or round-win probabilities")


def save_results(payload: dict, hotspots: pd.DataFrame, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
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
        payload, hotspots = train_grid_model(args.csv, args.map)
    except GridInputError as exc:
        raise SystemExit(str(exc)) from None

    print_training_summary(payload, hotspots)
    output_dir = ROOT / "output" / "models" / args.map
    save_results(payload, hotspots, output_dir)
    print("\nSaved:")
    for filename in ARTIFACT_NAMES:
        print(f"  {output_dir / filename}")


if __name__ == "__main__":
    main()
