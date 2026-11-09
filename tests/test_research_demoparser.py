import polars as pl
import pytest
from polars.testing import assert_frame_equal

from research.prep.demoparser import add_role_event_columns


def event(seconds, **changes):
    return {
        "demo_file": "match.dem", "round_num": 1, "tick": 1000 + seconds * 128,
        "tickrate": 128, "round_start_tick": 1000, "bomb_plant_tick": 1000 + 25 * 128,
        "attacker_steamid": 1, "victim_steamid": 2,
        "attacker_side": "t", "victim_side": "ct",
        "attacker_place": "Middle", "victim_place": "Middle", "assistedflash": False,
        **changes,
    }


def test_round_time_opening_and_event_boundaries():
    kills = pl.DataFrame([
        event(-1), event(0),
        event(25, attacker_place="BombsiteA", assistedflash=True), event(26),
    ])
    result = add_role_event_columns(kills)
    assert result["round_time_seconds"].to_list() == [None, 0.0, 25.0, 26.0]
    assert result["is_opening_kill"].to_list() == [False, True, False, False]
    assert result["is_opening_death"].equals(result["is_opening_kill"])
    assert result["is_early_engagement"].to_list() == [False, True, True, False]
    assert result["is_postplant_kill"].to_list() == [False, False, True, True]
    assert result["is_site_engagement"].to_list() == [False, False, True, False]
    assert result["is_flash_assisted_kill"].to_list() == [False, False, True, False]
    assert "_role_row" not in result.columns


def test_friendly_and_world_deaths_do_not_take_the_opening_slot():
    result = add_role_event_columns(pl.DataFrame([
        event(1, victim_side="t"), event(2, attacker_steamid=None), event(3),
    ]))
    assert result["is_live_round_kill"].to_list() == [False, False, True]
    assert result["round_kill_order"].to_list() == [None, None, 1]


@pytest.mark.parametrize("delay, expected", [(0, 0), (5, 1), (6, 0)])
def test_trade_requires_a_later_kill_within_five_seconds(delay, expected):
    result = add_role_event_columns(pl.DataFrame([
        event(1),
        event(1 + delay, attacker_steamid=3, victim_steamid=1, attacker_side="ct", victim_side="t"),
    ]))
    assert result["trade_kill_count"].sum() == expected
    assert result["victim_was_traded"].sum() == expected


def test_one_kill_can_trade_multiple_previous_deaths():
    result = add_role_event_columns(pl.DataFrame([
        event(1, victim_steamid=2), event(2, victim_steamid=3),
        event(6, attacker_steamid=4, victim_steamid=1, attacker_side="ct", victim_side="t"),
    ]))
    assert result["trade_kill_count"].to_list() == [0, 0, 2]
    assert result["victim_was_traded"].to_list() == [True, True, False]


@pytest.mark.parametrize("separation", [{"round_num": 2}, {"demo_file": "other.dem"}])
def test_trades_do_not_cross_round_or_match_boundaries(separation):
    result = add_role_event_columns(pl.DataFrame([
        event(1),
        event(2, attacker_steamid=3, victim_steamid=1, attacker_side="ct", victim_side="t", **separation),
    ]))
    assert result["trade_kill_count"].sum() == 0
    assert result["victim_was_traded"].sum() == 0


def test_reprocessing_rebuilds_derived_columns_without_changing_results():
    first = add_role_event_columns(pl.DataFrame([event(26), event(1)]))
    assert_frame_equal(add_role_event_columns(first), first, check_exact=True)


def test_empty_input_and_missing_columns_keep_the_original_contract():
    empty = pl.DataFrame()
    assert_frame_equal(add_role_event_columns(empty), empty)
    with pytest.raises(ValueError, match="missing source columns for role features: assistedflash"):
        add_role_event_columns(pl.DataFrame([event(1)]).drop("assistedflash"))
