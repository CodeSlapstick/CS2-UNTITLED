import math

import pytest

from backend.services.opening import build_opening_rounds
from backend.services.review import radar_frame, world_to_pixel


def opening_round(**changes):
    match = {"id": 1, "demo_file": "match.dem", "tickrate": 64}
    rnd = {"id": 10, "match_id": 1, "round_num": 1, "start_tick": 1000,
           "side": "t", "death_tick": 1064, "death_x": 50.0, "death_y": 75.0, **changes}
    positions = [{"round_id": 10, "tick": 1000, "health": 100, "x": 0.0, "y": 0.0},
                 {"round_id": 10, "tick": 1064, "health": 0, "x": 999.0, "y": 999.0}]
    return build_opening_rounds([match], [rnd], positions, [], 123, "de_mirage")["rounds"][0]


def test_death_marker_uses_kill_coordinates_without_extending_living_positions():
    result = opening_round()
    expected = world_to_pixel(50, 75, radar_frame("de_mirage"))
    assert result["death_t"] == 1
    assert result["death_px"] == pytest.approx(expected)
    assert len(result["segments"][0]) == 1
    assert result["segments"][0][-1]["t"] == 0


@pytest.mark.parametrize("changes", [{"death_x": None}, {"death_y": math.nan},
                                    {"death_tick": 1000 + 31 * 64}, {"start_tick": None}])
def test_unavailable_or_out_of_window_death_coordinates_are_not_invented(changes):
    assert opening_round(**changes)["death_px"] is None
