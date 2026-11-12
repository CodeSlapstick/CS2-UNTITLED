"""Hotspot-only training stays usable without KMeans or cell-type artifacts."""

import subprocess
import sys
from pathlib import Path

import pandas as pd
import pytest

from backend.services.review import cell_of, death_context, load_grid_model, parse_grid_model, radar_frame
from research.models import grid_ml1 as grid


def test_import_does_not_parse_arguments_train_or_write_files(tmp_path):
    script = Path(__file__).resolve().parents[1] / "research" / "models" / "grid_ml1.py"
    code = """
import importlib.util
import sys
sys.argv = ['unrelated-program', '--not-a-grid-option']
spec = importlib.util.spec_from_file_location('grid_training', SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
print('import completed without training')
""".replace("SCRIPT", repr(str(script)))
    result = subprocess.run([sys.executable, "-c", code], cwd=tmp_path, capture_output=True, text=True)

    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "import completed without training"
    assert list(tmp_path.iterdir()) == []


@pytest.fixture
def kills_csv(tmp_path):
    """Three matches share six spatial peaks with different timing signals."""
    frame = radar_frame("de_ancient")
    cell_size = frame.cell_size(16)
    rows = []
    for match in range(3):
        for cell in range(6):
            victim_x = frame.x_left + (2 + 2 * (cell % 3) + 0.5) * cell_size
            victim_y = frame.y_bottom + (2 + 2 * (cell // 3) + 0.5) * cell_size
            for event in range(6):
                elapsed = 10 + cell * 8 + event
                rows.append(
                    {
                        "demo_file": f"match-{match}.dem",
                        "map_name": "de_ancient",
                        "tick": 1000 + elapsed * 64,
                        "tickrate": 64,
                        "round_start_tick": 1000,
                        "bomb_plant_tick": 1000 + 30 * 64 if cell >= 3 else None,
                        "attacker_side": "ct" if event % 2 else "t",
                        "victim_side": "t" if event % 2 else "ct",
                        "victim_X": victim_x + event,
                        "victim_Y": victim_y + event,
                        "attacker_X": victim_x + 100 + cell * 80,
                        "attacker_Y": victim_y,
                        "victim_place": f"Place-{cell}",
                    }
                )
    path = tmp_path / "kills.csv"
    pd.DataFrame(rows).to_csv(path, index=False)
    return path


def test_prepare_duels_filters_map_and_non_enemy_kills(kills_csv):
    original = pd.read_csv(kills_csv)
    extras = original.iloc[:3].copy()
    extras.loc[0, "map_name"] = "de_dust2"
    extras.loc[1, "attacker_side"] = extras.loc[1, "victim_side"]
    extras.loc[2, "attacker_side"] = None
    pd.concat([original, extras], ignore_index=True).to_csv(kills_csv, index=False)

    duels, raw_rows, radar = grid.prepare_duels(kills_csv, "de_ancient")

    assert raw_rows == 111
    assert len(duels) == 108
    assert duels["match_id"].nunique() == 3
    assert duels["t_round"].iloc[0] == 10
    assert duels["ct_won"].sum() == 54
    assert not {"cx", "cy", "dist_xy"}.intersection(duels.columns)
    assert (duels[duels["t_round"] < 30]["planted"] == 0).all()
    assert radar["size"] > 0


def test_hotspot_training_no_longer_needs_attacker_coordinates(kills_csv):
    pd.read_csv(kills_csv).drop(columns=["attacker_X", "attacker_Y"]).to_csv(kills_csv, index=False)

    duels, _, _ = grid.prepare_duels(kills_csv, "de_ancient")

    assert len(duels) == 108
    assert "dist_xy" not in duels.columns


def test_small_training_exports_artifacts_accepted_by_backend(kills_csv, tmp_path, monkeypatch):
    # Keep real MeanShift and reduce only the number of bootstrap repetitions.
    monkeypatch.setattr(grid, "N_BOOT", 2)
    payload, hotspots = grid.train_grid_model(kills_csv, "de_ancient")
    output_dir = tmp_path / "trained"
    grid.save_results(payload, hotspots, output_dir)

    assert {path.name for path in output_dir.iterdir()} == set(grid.ARTIFACT_NAMES)
    assert payload["map"] == "de_ancient"
    assert payload["metrics"]["matches"] == 3
    assert payload["metrics"]["duels"] == 108
    assert payload["metrics"]["n_boot"] == 2
    assert not {"cells", "clusters", "grid_n", "min_kills"}.intersection(payload)
    assert not {"k", "k_scan", "silhouette", "ari", "features"}.intersection(payload["metrics"])
    assert len(hotspots) == 6
    assert hotspots["ct_win"].eq(0.5).all()
    assert hotspots["id"].tolist() == list(range(1, len(hotspots) + 1))

    loaded = load_grid_model(output_dir / "grid_ml1.json")
    assert loaded is not None
    assert loaded.cells == {}
    assert loaded.clusters == {}
    assert len(loaded.hotspots) == 6
    pd.testing.assert_frame_equal(pd.read_csv(output_dir / "grid_ml1_hotspots.csv"), hotspots, check_dtype=False)

    peak = hotspots.iloc[0]
    context = death_context(peak["x"], peak["y"], "t", True, loaded, radar_frame("de_ancient"))
    assert context["hotspot"]["id"] == peak["id"]
    assert context["cell"] is None
    assert context["enemy_win"] is None
    assert context["disadvantaged"] is None
    assert context["reason"] is None


def test_missing_map_and_missing_round_clock_give_actionable_errors(kills_csv):
    with pytest.raises(ValueError, match="No data for map de_mirage"):
        grid.prepare_duels(kills_csv, "de_mirage")

    pd.read_csv(kills_csv).drop(columns="round_start_tick").to_csv(kills_csv, index=False)
    with pytest.raises(ValueError, match="missing round_start_tick"):
        grid.prepare_duels(kills_csv, "de_ancient")


@pytest.fixture
def hotspot_payload():
    frame = radar_frame("de_ancient")
    return {
        "map": "de_ancient",
        "metrics": {"matches": 3, "duels": 100, "ct_win_overall": 0.6, "bandwidth": 300},
        "hotspots": [{"id": 1, "x": frame.x_left + 500, "y": frame.y_bottom + 500, "place": "Test", "share": 0.2}],
    }


def test_backend_still_reads_legacy_cell_models(hotspot_payload):
    frame = radar_frame("de_ancient")
    peak = hotspot_payload["hotspots"][0]
    cx, cy = cell_of(peak["x"], peak["y"], frame, 16)
    hotspot_payload.update(
        {
            "grid_n": 16,
            "min_kills": 3,
            "clusters": [{"id": 1, "name": "legacy", "ct_win": 0.8}],
            "cells": [{"cx": cx, "cy": cy, "cluster": 1, "ct_win": 0.7, "kills": 10}],
        }
    )

    model = parse_grid_model(hotspot_payload)
    context = death_context(peak["x"], peak["y"], "t", True, model, frame)

    assert context["cell"]["cluster_name"] == "legacy"
    assert context["cell"]["cell_ct_win"] == 0.7
    assert context["enemy_win"] == 0.8
    assert context["disadvantaged"] is True
    assert context["hotspot"]["id"] == 1


@pytest.mark.parametrize(
    "case,reason",
    [
        ("missing_position", "no_position"),
        ("missing_model", "no_model"),
        ("wrong_map", "no_model"),
        ("away_from_peaks", "insufficient"),
    ],
)
def test_hotspot_context_handles_missing_or_unrelated_data(hotspot_payload, case, reason):
    model = parse_grid_model(hotspot_payload)
    frame = radar_frame("de_ancient")
    peak = hotspot_payload["hotspots"][0]
    x, y = peak["x"], peak["y"]
    if case == "missing_position":
        x = None
    elif case == "missing_model":
        model = None
    elif case == "wrong_map":
        frame = radar_frame("de_dust2")
    else:
        x += 1000

    context = death_context(x, y, "ct", True, model, frame)

    assert context["reason"] == reason
    assert context["hotspot"] is None
    assert context["cell"] is None
