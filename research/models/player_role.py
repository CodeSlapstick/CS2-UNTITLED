from __future__ import annotations

import argparse
import itertools
import json
import math
import sys
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from sklearn.cluster import KMeans
from sklearn.metrics import adjusted_rand_score, silhouette_score
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "output"
ALL_KILLS_CSV = ROOT / "data" / "all_kills.csv"
SEED = 42
N_CLUSTERS = 6
N_BOOTSTRAPS = 40
MIN_ROUNDS = 5

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass


ROLE_ORDER = {
    "t": ["Entry", "Support", "Lurker", "Trader", "Bomb carrier / Site executor"],
    "ct": ["Site Anchor", "Rotator", "Aggressive Defender", "Utility Support", "Retake Player"],
}

CSV_T_FEATURES = [
    "assists_per_round", "flash_assists_per_round", "opening_attempt_rate", "opening_kill_rate",
    "early_engagement_rate",
    "trade_kills_per_round", "traded_death_rate", "postplant_kills_per_round",
    "site_engagement_rate", "avg_kill_time", "place_diversity",
    "place_concentration",
]
CSV_CT_FEATURES = [
    "assists_per_round", "flash_assists_per_round", "opening_attempt_rate",
    "early_engagement_rate", "trade_kills_per_round", "traded_death_rate",
    "postplant_kills_per_round", "site_engagement_rate", "avg_kill_time",
    "place_diversity", "place_concentration",
]

ROLE_SIGNATURES: dict[str, dict[str, dict[str, float]]] = {
    "t": {
        "Entry": {"opening_attempt_rate": 2, "early_engagement_rate": 1.5, "opening_kill_rate": 1, "avg_kill_time": -0.5},
        "Support": {"assists_per_round": 1.5, "flash_assists_per_round": 2},
        "Lurker": {"avg_kill_time": 1.5, "site_engagement_rate": -0.75, "opening_attempt_rate": -0.5},
        "Trader": {"trade_kills_per_round": 2, "traded_death_rate": 0.5},
        "Bomb carrier / Site executor": {"site_engagement_rate": 1.5, "postplant_kills_per_round": 1.5, "place_concentration": 0.5},
    },
    "ct": {
        "Site Anchor": {"place_concentration": 1.5, "site_engagement_rate": 1, "place_diversity": -1},
        "Rotator": {"place_diversity": 1.5, "place_concentration": -1, "site_engagement_rate": 0.5},
        "Aggressive Defender": {"opening_attempt_rate": 2, "early_engagement_rate": 1.5},
        "Utility Support": {"assists_per_round": 1.5, "flash_assists_per_round": 2},
        "Retake Player": {"postplant_kills_per_round": 2, "avg_kill_time": 0.75},
    },
}


def load_kills_csv(path: Path, map_name: str | None = None) -> pd.DataFrame:
    """อ่าน all_kills ที่สร้างจาก demos/reference และตรวจ schema ก่อนเทรน"""
    if not path.is_file():
        raise ValueError(f"ไม่พบไฟล์ {path}")
    kills = pd.read_csv(path, low_memory=False)
    required = {
        "demo_file", "map_name", "round_num", "attacker_steamid", "victim_steamid",
        "assister_steamid", "attacker_side", "victim_side", "assister_side",
        "attacker_name", "victim_name", "assister_name", "attacker_team_clan",
        "victim_team_clan", "assister_team_clan", "attacker_place", "victim_place",
        "weapon", "round_time_seconds", "is_live_round_kill", "is_opening_kill",
        "is_opening_death", "is_early_engagement", "is_postplant_kill",
        "is_site_engagement", "is_flash_assisted_kill", "trade_kill_count",
        "victim_was_traded",
    }
    missing = sorted(required - set(kills.columns))
    if missing:
        raise ValueError(
            "all_kills.csv ยังไม่ใช่ schema role-ready; ขาด " + ", ".join(missing)
            + " — รัน python research/prep/demoparser.py ก่อน"
        )
    if map_name:
        kills = kills[kills["map_name"] == map_name].copy()
    if kills.empty:
        raise ValueError(f"all_kills.csv ไม่มีข้อมูลสำหรับ {map_name or 'ทุกแมพ'}")
    return kills


def _mode(series: pd.Series) -> Any:
    values = series.dropna()
    if values.empty:
        return None
    modes = values.mode()
    return modes.iloc[0] if not modes.empty else values.iloc[0]


def _csv_participants(kills: pd.DataFrame) -> pd.DataFrame:
    """แปลง attacker/victim/assister เป็นตารางคนรูปเดียวกัน"""
    parts = []
    for who in ("attacker", "victim", "assister"):
        part = kills[[
            "demo_file", "map_name", "round_num", f"{who}_steamid", f"{who}_name",
            f"{who}_side", f"{who}_team_clan",
        ]].rename(columns={
            f"{who}_steamid": "steam_id", f"{who}_name": "name",
            f"{who}_side": "side", f"{who}_team_clan": "team",
        })
        parts.append(part.dropna(subset=["steam_id", "side", "team"]))
    out = pd.concat(parts, ignore_index=True)
    out["steam_id"] = pd.to_numeric(out["steam_id"], errors="coerce")
    out = out.dropna(subset=["steam_id"])
    out["steam_id"] = out["steam_id"].astype("int64")
    return out[out["side"].isin(["t", "ct"])]


def _resolve_team_round_sides(participants: pd.DataFrame) -> pd.DataFrame:

    keys = ["demo_file", "round_num", "team"]
    votes = (participants.drop_duplicates(keys + ["steam_id", "side"])
             .groupby(keys + ["side"])["steam_id"].nunique()
             .unstack(fill_value=0).reindex(columns=["t", "ct"], fill_value=0))
    votes["resolved_side"] = np.where(votes["t"] > votes["ct"], "t", "ct")
    votes["winner"] = votes[["t", "ct"]].max(axis=1)
    votes["runner_up"] = votes[["t", "ct"]].min(axis=1)
    ambiguous = votes[(votes["runner_up"] > 0) & ~((votes["winner"] >= 4) & (votes["runner_up"] <= 1))]
    if not ambiguous.empty:
        raise ValueError("พบ team_clan เดียวอยู่ทั้ง T และ CT ในรอบเดียวกันโดยไม่มี roster ข้างมากชัดเจน")

    resolved = participants.merge(votes[["resolved_side"]].reset_index(), on=keys, how="left")
    resolved["side"] = resolved.pop("resolved_side")
    return resolved


def build_profiles_from_kills(kills: pd.DataFrame, min_rounds: int = MIN_ROUNDS) -> pd.DataFrame:

    participants = _csv_participants(kills)
    if participants.empty:
        return pd.DataFrame()
    participants = _resolve_team_round_sides(participants)

    roster = (participants.groupby(["demo_file", "map_name", "steam_id"], as_index=False)
              .agg(name=("name", _mode), team=("team", _mode)))
    team_rounds = (participants[["demo_file", "map_name", "round_num", "team", "side"]]
                   .drop_duplicates())
    base = roster.merge(team_rounds, on=["demo_file", "map_name", "team"], how="inner")
    base["match_id"] = base["demo_file"]
    keys = ["demo_file", "round_num", "steam_id"]

    live = kills[kills["is_live_round_kill"].fillna(False).astype(bool)].copy()
    live["round_time_seconds"] = pd.to_numeric(live["round_time_seconds"], errors="coerce")
    live["trade_kill_count"] = pd.to_numeric(live["trade_kill_count"], errors="coerce").fillna(0)
    live["is_awp"] = live["weapon"].fillna("").str.lower().eq("awp")

    attack = (live.groupby(["demo_file", "round_num", "attacker_steamid"], as_index=False)
              .agg(
                  kills=("is_live_round_kill", "sum"),
                  opening_kills=("is_opening_kill", "sum"),
                  early_attacks=("is_early_engagement", "sum"),
                  postplant_kills=("is_postplant_kill", "sum"),
                  site_attacks=("is_site_engagement", "sum"),
                  trade_kills=("trade_kill_count", "sum"),
                  kill_time_sum=("round_time_seconds", "sum"),
                  awp_kills=("is_awp", "sum"),
              ).rename(columns={"attacker_steamid": "steam_id"}))
    victim = (live.groupby(["demo_file", "round_num", "victim_steamid"], as_index=False)
              .agg(
                  deaths=("is_live_round_kill", "sum"),
                  opening_deaths=("is_opening_death", "sum"),
                  early_deaths=("is_early_engagement", "sum"),
                  postplant_deaths=("is_postplant_kill", "sum"),
                  site_deaths=("is_site_engagement", "sum"),
                  traded_deaths=("victim_was_traded", "sum"),
              ).rename(columns={"victim_steamid": "steam_id"}))
    assisted = live[live["assister_steamid"].notna()].copy()
    assist = (assisted.groupby(["demo_file", "round_num", "assister_steamid"], as_index=False)
              .agg(assists=("is_live_round_kill", "sum"), flash_assists=("is_flash_assisted_kill", "sum"))
              .rename(columns={"assister_steamid": "steam_id"}))

    for frame in (attack, victim, assist):
        if not frame.empty:
            frame["steam_id"] = pd.to_numeric(frame["steam_id"], errors="coerce").astype("int64")
        base = base.merge(frame, on=keys, how="left")

    count_columns = [
        "kills", "opening_kills", "early_attacks", "postplant_kills", "site_attacks",
        "trade_kills", "kill_time_sum", "awp_kills", "deaths", "opening_deaths",
        "early_deaths", "postplant_deaths", "site_deaths", "traded_deaths", "assists",
        "flash_assists",
    ]
    for column in count_columns:
        base[column] = pd.to_numeric(base[column], errors="coerce").fillna(0.0)

    # Callout diversity/concentration is a kill-event proxy for anchor/rotation behaviour.
    attack_places = live[["demo_file", "attacker_steamid", "attacker_side", "attacker_place"]].rename(
        columns={"attacker_steamid": "steam_id", "attacker_side": "side", "attacker_place": "place"})
    victim_places = live[["demo_file", "victim_steamid", "victim_side", "victim_place"]].rename(
        columns={"victim_steamid": "steam_id", "victim_side": "side", "victim_place": "place"})
    places = pd.concat([attack_places, victim_places], ignore_index=True).dropna(subset=["steam_id", "place"])
    places["steam_id"] = pd.to_numeric(places["steam_id"], errors="coerce").astype("int64")
    place_counts = (places.groupby(["demo_file", "steam_id", "side", "place"]).size()
                    .rename("events").reset_index())
    place_profile = (place_counts.groupby(["demo_file", "steam_id", "side"])
                     .agg(place_diversity=("place", "nunique"), place_events=("events", "sum"),
                          top_place_events=("events", "max")).reset_index())
    place_profile["place_concentration"] = place_profile["top_place_events"] / place_profile["place_events"]

    profile_keys = ["match_id", "demo_file", "map_name", "steam_id", "name", "team", "side"]
    sums = {column: "sum" for column in count_columns}
    sums["round_num"] = "count"
    out = base.groupby(profile_keys, as_index=False).agg(sums).rename(columns={"round_num": "rounds"})
    out = out.merge(place_profile[["demo_file", "steam_id", "side", "place_diversity", "place_concentration"]],
                    on=["demo_file", "steam_id", "side"], how="left")
    out[["place_diversity", "place_concentration"]] = out[["place_diversity", "place_concentration"]].fillna(0.0)

    rounds = out["rounds"].clip(lower=1)
    kills_n = out["kills"].clip(lower=1)
    out["kills_per_round"] = out["kills"] / rounds
    out["deaths_per_round"] = out["deaths"] / rounds
    out["assists_per_round"] = out["assists"] / rounds
    out["flash_assists_per_round"] = out["flash_assists"] / rounds
    out["opening_kill_rate"] = out["opening_kills"] / rounds
    out["opening_death_rate"] = out["opening_deaths"] / rounds
    out["opening_attempt_rate"] = (out["opening_kills"] + out["opening_deaths"]) / rounds
    out["early_engagement_rate"] = (out["early_attacks"] + out["early_deaths"]) / rounds
    out["trade_kills_per_round"] = out["trade_kills"] / rounds
    out["traded_death_rate"] = out["traded_deaths"] / rounds
    out["postplant_kills_per_round"] = out["postplant_kills"] / rounds
    out["site_engagement_rate"] = (out["site_attacks"] + out["site_deaths"]) / rounds
    out["avg_kill_time"] = out["kill_time_sum"] / kills_n
    out.loc[out["kills"] == 0, "avg_kill_time"] = np.nan
    out["survival_rate"] = (1 - out["deaths_per_round"]).clip(0, 1)
    out["awp_kill_share"] = out["awp_kills"] / kills_n
    out.loc[out["kills"] == 0, "awp_kill_share"] = 0.0
    return out[out["rounds"] >= min_rounds].reset_index(drop=True)


def assign_role_names(centers_z: np.ndarray, side: str, features: list[str],
                      signatures_by_side: dict[str, dict[str, dict[str, float]]] | None = None,
                      ) -> tuple[list[str], np.ndarray]:
    """Find the globally best one-to-one mapping from centroids to role names."""
    roles = ROLE_ORDER[side]
    signatures = (signatures_by_side or ROLE_SIGNATURES)[side]
    score = np.zeros((len(centers_z), len(roles)))
    for ci, center in enumerate(centers_z):
        for ri, role in enumerate(roles):
            weights = np.array([signatures[role].get(feature, 0.0) for feature in features])
            norm = np.linalg.norm(weights)
            score[ci, ri] = float(center @ weights / norm) if norm else 0.0

    best_perm: tuple[int, ...] | None = None
    best_total = -math.inf
    for perm in itertools.permutations(range(len(centers_z)), len(roles)):
        total = sum(score[cluster_idx, role_idx] for role_idx, cluster_idx in enumerate(perm))
        if total > best_total:
            best_total, best_perm = total, perm
    assert best_perm is not None
    names = ["Hybrid / Unresolved"] * len(centers_z)
    for role_idx, cluster_idx in enumerate(best_perm):
        names[cluster_idx] = roles[role_idx]
    return names, score


def bootstrap_stability(x: np.ndarray, labels: np.ndarray, seed: int, n_bootstraps: int,
                        n_clusters: int = N_CLUSTERS) -> float:
    """Mean ARI between full-fit labels and bootstrap model predictions."""
    rng = np.random.default_rng(seed)
    scores = []
    for i in range(n_bootstraps):
        sample = rng.integers(0, len(x), size=len(x))
        if len(np.unique(sample)) < n_clusters:
            continue
        model = KMeans(n_clusters=n_clusters, n_init=20, random_state=seed + i + 1).fit(x[sample])
        scores.append(adjusted_rand_score(labels, model.predict(x)))
    return float(np.mean(scores)) if scores else 0.0


def fit_side(profiles: pd.DataFrame, side: str, seed: int = SEED,
             n_bootstraps: int = N_BOOTSTRAPS, features: list[str] | None = None,
             signatures_by_side: dict[str, dict[str, dict[str, float]]] | None = None,
             n_clusters: int = N_CLUSTERS,
             ) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Fit and describe one side-specific model."""
    features = features or (CSV_T_FEATURES if side == "t" else CSV_CT_FEATURES)
    rows = profiles[profiles["side"] == side].copy()
    if len(rows) < n_clusters * 3:
        raise ValueError(f"ฝั่ง {side.upper()} มีเพียง {len(rows)} profiles — ต้องมีอย่างน้อย {n_clusters * 3}")
    x_raw = rows[features].replace([np.inf, -np.inf], np.nan)
    medians = x_raw.median().fillna(0.0)
    x_raw = x_raw.fillna(medians)
    scaler = StandardScaler().fit(x_raw)
    x = scaler.transform(x_raw)
    model = KMeans(n_clusters=n_clusters, n_init=50, random_state=seed).fit(x)
    role_names, role_scores = assign_role_names(model.cluster_centers_, side, features, signatures_by_side)

    rows["cluster"] = model.labels_ + 1
    rows["role"] = [role_names[label] for label in model.labels_]
    distance = model.transform(x)
    rows["role_distance"] = distance[np.arange(len(rows)), model.labels_]

    clusters = []
    for cluster_id, role in enumerate(role_names):
        member = rows[rows["cluster"] == cluster_id + 1]
        top = sorted(zip(features, model.cluster_centers_[cluster_id], strict=True), key=lambda item: -abs(item[1]))[:5]
        role_score = None if role == "Hybrid / Unresolved" else float(
            role_scores[cluster_id, ROLE_ORDER[side].index(role)])
        clusters.append({
            "id": cluster_id + 1,
            "role": role,
            "profiles": int(len(member)),
            "role_name_score": round(role_score, 4) if role_score is not None else None,
            "role_name_status": "unassigned" if role_score is None else ("supported" if role_score >= 0.25 else "weak"),
            "top_signals": [{"feature": feature, "z": round(float(value), 4)} for feature, value in top],
            "center_z": {feature: round(float(value), 6) for feature, value in zip(features, model.cluster_centers_[cluster_id], strict=True)},
            "center_raw": {feature: round(float(value), 6) for feature, value in zip(features, scaler.inverse_transform(model.cluster_centers_[[cluster_id]])[0], strict=True)},
        })

    payload = {
        "side": side,
        "roles": ROLE_ORDER[side],
        "features": features,
        "profiles": int(len(rows)),
        "players": int(rows["steam_id"].nunique()),
        "matches": int(rows["match_id"].nunique()),
        "metrics": {
            "silhouette": round(float(silhouette_score(x, model.labels_)), 6),
            "bootstrap_ari": round(bootstrap_stability(x, model.labels_, seed, n_bootstraps, n_clusters), 6),
            "n_bootstraps": n_bootstraps,
            "n_clusters": n_clusters,
        },
        "preprocess": {
            "median": {f: round(float(medians[f]), 6) for f in features},
            "mean": {f: round(float(v), 6) for f, v in zip(features, scaler.mean_, strict=True)},
            "scale": {f: round(float(v), 6) for f, v in zip(features, scaler.scale_, strict=True)},
        },
        "clusters": clusters,
    }
    return rows, payload


def train_from_kills_csv(kills: pd.DataFrame, csv_path: Path, map_name: str | None,
                         min_rounds: int, n_bootstraps: int) -> tuple[pd.DataFrame, dict[str, Any]]:
    profiles = build_profiles_from_kills(kills, min_rounds=min_rounds)
    if profiles.empty:
        raise ValueError("ไม่พบ player profiles ที่ผ่านเกณฑ์ขั้นต่ำใน all_kills.csv")
    assigned, models = [], {}
    for side in ("t", "ct"):
        features = CSV_T_FEATURES if side == "t" else CSV_CT_FEATURES
        side_rows, models[side] = fit_side(
            profiles, side, n_bootstraps=n_bootstraps, features=features,
            signatures_by_side=ROLE_SIGNATURES, n_clusters=N_CLUSTERS,
        )
        assigned.append(side_rows)
    result = pd.concat(assigned, ignore_index=True)
    payload = {
        "model": "separate-side-player-role-kmeans",
        "version": 2,
        "map": map_name or "all",
        "unit": "player-match-side",
        "n_clusters_per_side": N_CLUSTERS,
        "min_rounds_per_profile": min_rounds,
        "training_source": str(csv_path),
        "source_matches": int(kills["demo_file"].nunique()),
        "source_kills": int(len(kills)),
        "interpretation_note": (
            "Role names interpret unsupervised centroids; they are not training labels, performance grades, "
            "or permanent identities. CSV-only training has no grenade throws, movement, or planter id. "
            "Support uses assist/flash-assist proxies; anchor/rotator use kill-event callout proxies; "
            "bomb carrier/site executor uses site and post-plant kill-event proxies. A sixth "
            "Hybrid / Unresolved cluster prevents forcing a role name when kill events do not support one."
        ),
        "models": models,
    }
    return result, payload


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train separate T/CT player-role clusters")
    parser.add_argument("--csv", type=Path, default=ALL_KILLS_CSV,
                        help=f"role-ready all_kills.csv (default: {ALL_KILLS_CSV})")
    parser.add_argument("--map", dest="map_name", default=None, help="optional map filter, e.g. de_mirage")
    parser.add_argument("--min-rounds", type=int, default=MIN_ROUNDS)
    parser.add_argument("--bootstraps", type=int, default=N_BOOTSTRAPS)
    parser.add_argument("--output-dir", type=Path, default=OUT)
    return parser.parse_args()


def save_role_diagram(payload: dict[str, Any], path: Path) -> None:
    """Render T/CT role centroids as comparable z-score heatmaps."""
    fig, axes = plt.subplots(2, 1, figsize=(18, 11), constrained_layout=True)
    image = None
    for ax, side in zip(axes, ("t", "ct"), strict=True):
        model = payload["models"][side]
        features = model["features"]
        clusters = model["clusters"]
        values = np.array([[cluster["center_z"][feature] for feature in features] for cluster in clusters])
        image = ax.imshow(values, cmap="RdBu_r", vmin=-2, vmax=2, aspect="auto")
        ax.set_xticks(range(len(features)))
        ax.set_xticklabels([feature.replace("_", "\n") for feature in features], fontsize=8)
        ax.set_yticks(range(len(clusters)))
        ax.set_yticklabels([
            f"{cluster['id']}. {cluster['role']} ({cluster['profiles']} profiles)" for cluster in clusters
        ], fontsize=9)
        for row in range(values.shape[0]):
            for col in range(values.shape[1]):
                value = values[row, col]
                ax.text(col, row, f"{value:+.1f}", ha="center", va="center", fontsize=7,
                        color="white" if abs(value) > 1.0 else "black")
        metrics = model["metrics"]
        ax.set_title(
            f"{side.upper()} role profiles · {model['profiles']} profiles · "
            f"silhouette {metrics['silhouette']:.3f} · bootstrap ARI {metrics['bootstrap_ari']:.3f}",
            fontsize=11,
        )
    fig.colorbar(image, ax=axes, shrink=0.78, label="cluster centroid z-score")
    fig.suptitle(
        f"Player role clusters · {payload['map']} · unsupervised player-match-side profiles\n"
        "Role names interpret cluster centroids; they are not performance grades",
        fontsize=14,
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path, dpi=150)
    plt.close(fig)


def main() -> None:
    args = parse_args()
    if args.min_rounds < 1 or args.bootstraps < 0:
        raise SystemExit("--min-rounds ต้องไม่น้อยกว่า 1 และ --bootstraps ต้องไม่ติดลบ")
    try:
        kills = load_kills_csv(args.csv, args.map_name)
        profiles, payload = train_from_kills_csv(
            kills, args.csv, args.map_name, args.min_rounds, args.bootstraps)
    except ValueError as exc:
        raise SystemExit(
            f"เทรนไม่ได้: {exc}\n"
            "รัน python research/prep/demoparser.py ก่อน และตรวจว่ามีข้อมูลอย่างน้อยตาม --min-rounds"
        ) from None
    args.output_dir.mkdir(parents=True, exist_ok=True)
    json_path = args.output_dir / "player_role.json"
    csv_path = args.output_dir / "player_role_profiles.csv"
    diagram_path = args.output_dir / "player_role_diagram.png"
    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    profiles.to_csv(csv_path, index=False, encoding="utf-8-sig")
    save_role_diagram(payload, diagram_path)

    scope = args.map_name or "ทุกแมพ"
    print(f"Player role model · {scope} · csv · reference only")
    for side in ("t", "ct"):
        model = payload["models"][side]
        print(f"\n{side.upper()} · {model['profiles']} profiles · silhouette {model['metrics']['silhouette']:.3f} "
              f"· bootstrap ARI {model['metrics']['bootstrap_ari']:.3f}")
        for cluster in model["clusters"]:
            print(f"  {cluster['id']}. {cluster['role']:<30} {cluster['profiles']:>4} profiles")
    print(f"\nบันทึกแล้ว:\n  {json_path}\n  {csv_path}\n  {diagram_path}")


if __name__ == "__main__":
    main()
