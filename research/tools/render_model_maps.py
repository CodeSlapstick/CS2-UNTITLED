"""Render map-style visualizations for the role and coach models."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from matplotlib.colors import Normalize
from matplotlib.patches import Circle
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from backend.services.coach import AREAS  # noqa: E402


def radar(map_name: str) -> tuple[np.ndarray, list[float], dict]:
    metadata = json.loads((ROOT / "assets" / "radars.json").read_text(encoding="utf-8"))[map_name]
    image = np.asarray(Image.open(ROOT / "assets" / metadata["image"].lstrip("/" )).convert("RGB"))
    size = float(metadata["size"])
    scale = float(metadata["scale"])
    left = float(metadata["pos_x"])
    top = float(metadata["pos_y"])
    return image, [left, left + size * scale, top - size * scale, top], metadata


def plot_base(ax, image: np.ndarray, extent: list[float]) -> None:
    ax.imshow(image, extent=extent, origin="upper")
    ax.set_xticks([])
    ax.set_yticks([])


def render_player_role(map_name: str, profiles_path: Path, csv_path: Path, output: Path) -> None:
    image, extent, metadata = radar(map_name)
    profiles = pd.read_csv(profiles_path)
    profiles = profiles[profiles["map_name"] == map_name]
    kills = pd.read_csv(csv_path, low_memory=False)
    kills = kills[kills["map_name"] == map_name].copy()

    events = []
    for who, x, y, side in (("attacker", "attacker_X", "attacker_Y", "attacker_side"),
                            ("victim", "victim_X", "victim_Y", "victim_side")):
        part = kills[["demo_file", f"{who}_steamid", f"{who}_name", x, y, side]].rename(
            columns={f"{who}_steamid": "steam_id", f"{who}_name": "name", x: "x", y: "y", side: "side"})
        part["steam_id"] = pd.to_numeric(part["steam_id"], errors="coerce")
        events.append(part)
    events = pd.concat(events, ignore_index=True).dropna(subset=["demo_file", "steam_id", "x", "y", "side"])
    events["steam_id"] = events["steam_id"].astype("int64")
    # Demo filenames can differ between parser runs; player identity plus side is
    # sufficient for this map-level visualization.
    role_lookup = profiles[["steam_id", "name", "side", "role"]].drop_duplicates()
    events["name"] = events["name"].astype(str)
    role_lookup["name"] = role_lookup["name"].astype(str)
    events = events.merge(role_lookup[["name", "side", "role"]], on=["name", "side"], how="inner")
    events = events.drop_duplicates(["demo_file", "steam_id", "x", "y", "role"])

    roles = sorted(events["role"].dropna().unique())
    colors = plt.get_cmap("tab10")(np.linspace(0, 1, len(roles))) if roles else np.empty((0, 4))
    color_by_role = dict(zip(roles, colors, strict=True))
    fig, axes = plt.subplots(1, 2, figsize=(17, 8), constrained_layout=True)
    for ax, side in zip(axes, ("t", "ct"), strict=True):
        plot_base(ax, image, extent)
        subset = events[events["side"] == side]
        for role in roles:
            points = subset[subset["role"] == role]
            if points.empty:
                continue
            ax.scatter(points["x"], points["y"], s=5, alpha=.22, color=color_by_role[role],
                       linewidths=0, label=f"{role} ({len(points):,})")
        ax.set_title(f"{side.upper()} events by inferred role", fontsize=12)
        ax.legend(loc="upper right", fontsize=7, framealpha=.85)
    fig.suptitle(f"Player Role Model · {map_name} · map overlay\n"
                 "Dots are kill-event positions joined to player-match-side role clusters; roles are not ground-truth labels",
                 fontsize=14)
    output.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(output, dpi=150)
    plt.close(fig)


def render_coach_policy(map_name: str, model_path: Path, output: Path) -> None:
    image, extent, metadata = radar(map_name)
    model = json.loads(model_path.read_text(encoding="utf-8"))
    sites = metadata.get("sites", {})
    a = np.array(sites.get("A", [extent[0] + (extent[1] - extent[0]) * .72, extent[2] + (extent[3] - extent[2]) * .35]), dtype=float)
    b = np.array(sites.get("B", [extent[0] + (extent[1] - extent[0]) * .28, extent[2] + (extent[3] - extent[2]) * .70]), dtype=float)
    anchors = {"a": a, "mid": (a + b) / 2, "b": b}
    colors = {"a": "#ef4444", "mid": "#f59e0b", "b": "#2563eb"}
    fig, axes = plt.subplots(1, len(model["sides"]), figsize=(17, 8), squeeze=False, constrained_layout=True)
    for ax, side in zip(axes[0], model["sides"], strict=True):
        plot_base(ax, image, extent)
        side_model = model["sides"][side]
        centers = np.asarray(side_model["centers"], dtype=float)
        mean = np.asarray(side_model["mean"], dtype=float)
        scale = np.asarray(side_model["scale"], dtype=float)
        opening = centers * scale + mean
        features = model["opening_features"]
        pressure = {area: float(np.max([opening[:, features.index(f"{area}_{t}")].max() for t in (5, 15, 25)]))
                    for area in AREAS if area != "other"}
        norm = Normalize(vmin=0, vmax=max(1e-6, max(pressure.values())))
        for area, point in anchors.items():
            value = max(0.0, pressure[area])
            radius = (extent[1] - extent[0]) * (.035 + .09 * norm(value))
            ax.add_patch(Circle(point, radius, color=colors[area], alpha=.18 + .42 * norm(value), lw=2,
                                ec=colors[area]))
            ax.text(point[0], point[1], f"{area.upper()}\n{value:.2f}", ha="center", va="center",
                    fontsize=9, fontweight="bold", color="#111827",
                    bbox={"boxstyle": "round,pad=.25", "fc": "white", "ec": colors[area], "alpha": .85})
        ax.set_title(f"{side.upper()} opening pressure projection", fontsize=12)
    fig.suptitle(f"Coach Policy Model · {map_name} · map overlay\n"
                 "Circle size/color projects learned A/Mid/B opening features onto radar anchors; it is not player-path data",
                 fontsize=14)
    output.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(output, dpi=150)
    plt.close(fig)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--map", default="de_mirage")
    parser.add_argument("--csv", type=Path, default=ROOT / "data" / "all_kills.csv")
    parser.add_argument("--role-profiles", type=Path)
    parser.add_argument("--coach-model", type=Path)
    parser.add_argument("--output-dir", type=Path)
    args = parser.parse_args()
    out = args.output_dir or ROOT / "output" / "models" / args.map
    role_profiles = args.role_profiles or out / "player_role_profiles.csv"
    coach_model = args.coach_model or out / "coach_model.json"
    render_player_role(args.map, role_profiles, args.csv, out / "player_role_map.png")
    render_coach_policy(args.map, coach_model, out / "coach_policy_map.png")
    print(json.dumps({"player_role_map": str(out / "player_role_map.png"),
                      "coach_policy_map": str(out / "coach_policy_map.png")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
