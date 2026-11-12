"""Profile service contracts across filtered rounds, whole-match outcomes and empty data."""

import asyncio
import copy
from datetime import date
from unittest.mock import AsyncMock

import pytest

from backend.services import player_profiles as profiles

STEAM_ID = 76561198000000001


def profile_rows():
    first = {
        "steam_id": STEAM_ID,
        "match_id": 42,
        "round_id": 100,
        "round_num": 1,
        "side": "ct",
        "map_name": "de_dust2",
        "demo_file": "match.dem",
        "team_a": "A",
        "team_b": "B",
        "team_clan": "A",
        "imported_at": "2026-01-05",
        "kills": 2,
        "deaths": 0,
        "assists": 1,
        "headshots": 1,
        "damage": 150,
        "kast": True,
        "survived": True,
        "won": True,
        "opening_kill": True,
        "opening_death": False,
        "features_version": 1,
        "clutch_vs": 2,
        "clutch_won": True,
    }
    return [
        first,
        {
            **first,
            "round_id": 101,
            "round_num": 2,
            "kills": 1,
            "deaths": 1,
            "assists": 0,
            "headshots": 0,
            "damage": 50,
            "kast": False,
            "survived": False,
            "won": False,
            "opening_kill": False,
            "opening_death": True,
            "clutch_vs": 0,
            "clutch_won": False,
        },
    ]


class ProfileConnection:
    """Return facts for known SQL reads and fail if an unexpected query is added."""

    def __init__(self):
        self.calls = []
        self.identity = {
            "steam_id": STEAM_ID,
            "name": "Player",
            "avatar": "avatar.png",
            "username": "Account",
            "all_matches": 3,
        }
        self.facts = profile_rows()
        self.latest = {"team_clan": "A"}
        self.weapons = [{"weapon": "ak47", "kills": 3, "headshots": 1, "hs_rate": 33.3, "accuracy": None}]

    async def fetchrow(self, sql, *args):
        self.calls.append((sql, args))
        if "COALESCE(a.avatar" in sql:
            return self.identity
        if "SELECT mp.team_clan" in sql:
            return self.latest
        raise AssertionError(sql)

    async def fetch(self, sql, *args):
        self.calls.append((sql, args))
        if "WITH eligible" in sql:
            return copy.deepcopy(self.facts)
        if "AS result" in sql:
            return [{"match_id": 42, "result": "loss"}]
        if "SELECT k.weapon" in sql:
            return self.weapons
        if "SELECT DISTINCT m.map_name" in sql:
            return [{"map_name": "de_dust2"}, {"map_name": "de_mirage"}]
        raise AssertionError(sql)


@pytest.fixture
def behavior(monkeypatch):
    result = AsyncMock(return_value={"available": False, "reason": "insufficient_data", "sides": []})
    monkeypatch.setattr(profiles, "_behavior", result)
    return result


def test_missing_identity_stops_before_loading_profile_facts(behavior):
    conn = ProfileConnection()
    conn.identity = None

    assert asyncio.run(profiles.build_profile(conn, STEAM_ID)) is None
    assert len(conn.calls) == 1
    behavior.assert_not_awaited()


def test_profile_preserves_filters_round_denominators_and_whole_match_results(behavior):
    conn = ProfileConnection()
    result = asyncio.run(
        profiles.build_profile(
            conn,
            STEAM_ID,
            recent=5,
            date_from=date(2026, 1, 1),
            date_to=date(2026, 2, 1),
            map_name="de_dust2",
            side="ct",
        )
    )

    assert conn.calls[1][1] == (STEAM_ID, date(2026, 1, 1), date(2026, 2, 1), "de_dust2", 5, "ct")
    assert result["totals"]["kills"] == 3
    assert result["totals"]["rounds"] == 2
    assert result["totals"]["adr"] == 100
    assert result["totals"]["kast"] == 50
    assert result["recent_matches"][0]["result"] == "loss"  # Whole match, not the selected side's draw.
    assert result["maps"][0]["win_rate"] == 0
    assert result["clutches"][1] == {"vs": 2, "attempts": 1, "wins": 1}
    assert result["weapons"] == conn.weapons
    assert result["filters"]["available_maps"] == ["de_dust2", "de_mirage"]
    assert result["source"]["selected_matches"] == 1
    assert result["source"]["all_matches"] == 3
    behavior.assert_awaited_once_with(conn, STEAM_ID, [42], "ct")


def test_empty_filtered_rounds_skip_outcomes_and_weapons_but_keep_identity(behavior):
    conn = ProfileConnection()
    conn.facts = []
    result = asyncio.run(profiles.build_profile(conn, STEAM_ID))

    assert result["player"]["name"] == "Player"
    assert result["totals"] is None
    assert result["weapons"] == []
    assert result["recent_matches"] == []
    assert result["source"]["selected_matches"] == 0
    assert result["source"]["selected_rounds"] == 0
    assert not any("AS result" in sql or "SELECT k.weapon" in sql for sql, _ in conn.calls)
    behavior.assert_awaited_once_with(conn, STEAM_ID, [], "all")


def test_profile_handles_missing_latest_team(behavior):
    conn = ProfileConnection()
    conn.latest = None

    result = asyncio.run(profiles.build_profile(conn, STEAM_ID))

    assert result["player"]["latest_team"] is None
