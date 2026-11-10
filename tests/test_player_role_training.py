"""Profile aggregation keeps round denominators, side splits and event features."""

import math

import pandas as pd
import pytest

from research.models.player_role import build_profiles_from_kills


def event(round_num=1, **changes):
    return {
        "demo_file": "match.dem", "map_name": "de_dust2", "round_num": round_num,
        "attacker_steamid": 1, "attacker_name": "One", "attacker_team_clan": "A", "attacker_side": "t",
        "victim_steamid": 2, "victim_name": "Two", "victim_team_clan": "B", "victim_side": "ct",
        "assister_steamid": 3, "assister_name": "Three", "assister_team_clan": "A", "assister_side": "t",
        "attacker_place": "BombsiteA", "victim_place": "Middle", "weapon": "awp",
        "round_time_seconds": 10.0, "is_live_round_kill": True,
        "is_opening_kill": True, "is_opening_death": True, "is_early_engagement": True,
        "is_postplant_kill": False, "is_site_engagement": True, "is_flash_assisted_kill": True,
        "trade_kill_count": 2, "victim_was_traded": True,
        **changes,
    }


@pytest.fixture
def kills():
    return pd.DataFrame([
        event(),
        event(2, attacker_steamid=2, attacker_name="Two", attacker_team_clan="B", attacker_side="ct",
              victim_steamid=1, victim_name="One", victim_team_clan="A", victim_side="t",
              assister_steamid=4, assister_name="Four", assister_team_clan="B", assister_side="ct",
              attacker_place="Middle", victim_place="Middle", weapon="ak47",
              round_time_seconds=40.0, is_early_engagement=False, is_postplant_kill=True,
              is_site_engagement=False, is_flash_assisted_kill=False, trade_kill_count=0),
        event(3, attacker_side="ct", victim_side="t", assister_side="ct", attacker_place="BombsiteB"),
    ])


def test_profile_counts_include_rounds_without_player_events_and_split_sides(kills):
    profiles = build_profiles_from_kills(kills, min_rounds=1)
    one = profiles[(profiles.steam_id == 1) & (profiles.side == "t")].iloc[0]
    support = profiles[(profiles.steam_id == 3) & (profiles.side == "t")].iloc[0]

    assert one["rounds"] == 2
    assert one["kills_per_round"] == 0.5
    assert one["deaths_per_round"] == 0.5
    assert one["opening_attempt_rate"] == 1
    assert one["trade_kills_per_round"] == 1
    assert one["avg_kill_time"] == 10
    assert one["awp_kill_share"] == 1
    assert one["place_diversity"] == 2
    assert one["place_concentration"] == 0.5
    assert support["rounds"] == 2
    assert support["assists_per_round"] == 0.5
    assert support["flash_assists_per_round"] == 0.5
    assert support["awp_kill_share"] == 0
    assert math.isnan(support["avg_kill_time"])
    assert profiles[(profiles.steam_id == 1) & (profiles.side == "ct")].iloc[0]["rounds"] == 1


def test_minimum_rounds_filters_each_player_side_separately(kills):
    profiles = build_profiles_from_kills(kills, min_rounds=2)

    assert len(profiles) == 4
    assert profiles["rounds"].eq(2).all()
    assert profiles.loc[profiles.steam_id == 1, "side"].tolist() == ["t"]


def test_non_live_events_do_not_change_combat_features(kills):
    extra = pd.DataFrame([event(is_live_round_kill=False)])
    expected = build_profiles_from_kills(kills, min_rounds=1)
    actual = build_profiles_from_kills(pd.concat([kills, extra], ignore_index=True), min_rounds=1)

    pd.testing.assert_frame_equal(actual, expected, check_exact=True)


def test_no_participants_returns_empty_profiles(kills):
    for who in ("attacker", "victim", "assister"):
        kills[f"{who}_steamid"] = None

    assert build_profiles_from_kills(kills).empty


def test_ambiguous_team_side_is_rejected():
    kills = pd.DataFrame([event(), event(attacker_side="ct", assister_side="ct")])

    with pytest.raises(ValueError, match="team_clan"):
        build_profiles_from_kills(kills, min_rounds=1)
