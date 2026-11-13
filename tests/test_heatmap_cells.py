import pytest

from backend.services.review import RadarFrame, build_heatmap_cells


FRAME = RadarFrame("test", "/test.png", 1024, 0, 1024, 1)


def test_event_counts_and_cell_boundaries():
    grid = build_heatmap_cells([
        {"x": 1, "y": 1023}, {"x": 2, "y": 1022},
        {"x": 32, "y": 992}, {"x": 1023.99, "y": .01},
        {"x": None, "y": 0}, {"x": 1024, "y": 0},
    ], FRAME, "kills", 128)
    assert grid["unit"] == "events"
    assert grid["cells"] == [[0, 0, 2], [1, 1, 1], [31, 31, 1]]
    assert grid["max"] == 2


def test_position_seconds_cap_recording_gaps_and_ignore_dead_players():
    grid = build_heatmap_cells([
        {"x": 1, "y": 1023, "health": 100, "tick": 0, "next_tick": 16},
        {"x": 1, "y": 1023, "health": 100, "tick": 16, "next_tick": 32},
        {"x": 1, "y": 1023, "health": 100, "tick": 32, "next_tick": 3200},
        {"x": 1, "y": 1023, "health": 100, "tick": 3200, "next_tick": None},
        {"x": 32, "y": 992, "health": 0, "tick": 0, "next_tick": 16},
        {"x": 32, "y": 992, "health": None, "tick": 0, "next_tick": 16},
    ], FRAME, "positions", 128)
    assert grid["unit"] == "player_seconds"
    assert grid["cells"] == [[0, 0, .375]]


@pytest.mark.parametrize("event,unit", [("kills", "events"), ("positions", "samples")])
def test_empty_grid(event, unit):
    assert build_heatmap_cells([], FRAME, event, 128) == {"n": 32, "unit": unit, "cells": [], "max": 0}


def test_position_data_without_timing_reports_samples():
    grid = build_heatmap_cells([{"x": 1, "y": 1023, "health": 100}], FRAME, "positions", 0)
    assert grid["unit"] == "samples"
    assert grid["cells"] == [[0, 0, 1]]
