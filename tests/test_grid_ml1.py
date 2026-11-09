"""Readability refactors must keep grid training importable and its artifacts usable."""

import subprocess
import sys
from pathlib import Path

import pandas as pd
import pytest

from backend.services.review import load_grid_model, radar_frame
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
    """Three matches share six populated cells with distinct timing and range signals."""
    frame = radar_frame("de_ancient")
    cell_size = frame.cell_size(grid.GRID_N)
    rows = []
    for match in range(3):
        for cell in range(6):
            victim_x = frame.x_left + (2 + 2 * (cell % 3) + 0.5) * cell_size
            victim_y = frame.y_bottom + (2 + 2 * (cell // 3) + 0.5) * cell_size
            for event in range(6):
                elapsed = 10 + cell * 8 + event
                rows.append({
                    "demo_file": f"match-{match}.dem", "map_name": "de_ancient",
                    "tick": 1000 + elapsed * 64, "tickrate": 64, "round_start_tick": 1000,
                    "bomb_plant_tick": 1000 + 30 * 64 if cell >= 3 else None,
                    "attacker_side": "ct" if event % 2 else "t",
                    "victim_side": "t" if event % 2 else "ct",
                    "victim_X": victim_x + event, "victim_Y": victim_y + event,
                    "attacker_X": victim_x + 100 + cell * 80, "attacker_Y": victim_y,
                    "victim_place": f"Place-{cell}",
                })
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
    assert set(duels["cx"]) == {2, 4, 6}
    assert set(duels["cy"]) == {2, 4}
    assert (duels[duels["t_round"] < 30]["planted"] == 0).all()
    assert radar["size"] > 0


def test_min_kills_filters_cells_and_win_rate_is_duel_weighted():
    duels = pd.DataFrame({
        "cx": [0] * 2 + [1] * 8,
        "cy": [0] * 10,
        "t_round": [10] * 2 + [30] * 8,
        "planted": [0] * 2 + [1] * 8,
        "dist_xy": [100] * 10,
        "victim_place": ["A"] * 2 + ["B"] * 8,
        "ct_won": [1] * 2 + [0] * 8,
    })
    assert grid.cell_profiles(duels, min_kills=3).index.tolist() == [(1, 0)]

    cells = grid.cell_profiles(duels, min_kills=2)
    cells["cluster"] = 0
    _, clusters = grid.describe_cell_clusters(duels, cells, ["test cluster"])

    assert clusters.loc[0, "ct_win"] == 0.2  # Two CT wins in ten duels, not an average of 1 and 0.
    assert clusters.loc[0, "t_mean"] == 20  # Timing remains the original equally weighted cell mean.
    assert clusters.loc[0, "duels"] == 10


def test_small_training_exports_artifacts_accepted_by_backend(kills_csv, tmp_path, monkeypatch):
    # Keep real MeanShift/KMeans and reduce only the number of bootstrap repetitions.
    monkeypatch.setattr(grid, "N_BOOT", 2)
    payload, cells, hotspots = grid.train_grid_model(kills_csv, "de_ancient", min_kills=3)
    output_dir = tmp_path / "trained"
    grid.save_results(payload, cells, hotspots, output_dir)

    assert {path.name for path in output_dir.iterdir()} == set(grid.ARTIFACT_NAMES)
    assert payload["map"] == "de_ancient"
    assert payload["metrics"]["matches"] == 3
    assert payload["metrics"]["duels"] == 108
    assert payload["metrics"]["n_boot"] == 2
    assert len(cells) == 6
    assert cells["cluster"].min() == 1
    assert cells["cluster"].max() == payload["metrics"]["k"]
    assert cells["cluster_name"].notna().all()
    assert hotspots["id"].tolist() == list(range(1, len(hotspots) + 1))

    loaded = load_grid_model(output_dir / "grid_ml1.json")
    assert loaded is not None
    assert loaded.grid_n == grid.GRID_N
    assert len(loaded.cells) == 6
    pd.testing.assert_frame_equal(pd.read_csv(output_dir / "grid_ml1_cells.csv"), cells, check_dtype=False)


def test_missing_map_and_missing_round_clock_give_actionable_errors(kills_csv):
    with pytest.raises(ValueError, match="No data for map de_mirage"):
        grid.prepare_duels(kills_csv, "de_mirage")

    pd.read_csv(kills_csv).drop(columns="round_start_tick").to_csv(kills_csv, index=False)
    with pytest.raises(ValueError, match="missing round_start_tick"):
        grid.prepare_duels(kills_csv, "de_ancient")
