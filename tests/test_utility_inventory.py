import polars as pl

from backend.services.utility_inventory import utility_inventory
from backend.services.parser import _position_table
from backend.services.etl import _position_rows
from backend.services.review import build_round_positions, radar_frame


def test_inventory_preserves_counts_and_distinguishes_unknown_from_empty():
    assert utility_inventory(None) is None
    assert utility_inventory([]) == []
    assert utility_inventory(["Karambit", "AK-47", "Flashbang", "Flashbang", "High Explosive Grenade", "weapon_smokegrenade"]) == [
        "Flashbang", "Flashbang", "HE Grenade", "Smoke Grenade"]


def test_inventory_survives_parser_etl_and_replay_response():
    data = pl.DataFrame([dict(tick=1000, steamid=1, team_name="CT", X=0., Y=0., Z=0., yaw=0.,
        is_alive=True, health=100, last_place_name="Mid", active_weapon_name="Karambit", armor_value=100,
        has_helmet=True, has_defuser=True, balance=1000, inventory=["Flashbang", "Flashbang", "Incendiary Grenade"])])
    parsed = _position_table(data, {1000: 1}).to_dicts()[0]
    assert parsed["utility_inventory"] == ["Flashbang", "Flashbang", "Incendiary Grenade"]
    stored = _position_rows([parsed, parsed], 1, {1: 1}, {1})
    assert len(stored) == 1
    assert stored[0][-1] == ("Flashbang", "Flashbang", "Incendiary Grenade")
    response = build_round_positions([parsed], start_tick=1000, tickrate=64, frame=radar_frame("de_dust2"))
    assert response["frames"][0]["players"][0]["utility_inventory"] == parsed["utility_inventory"]


def test_old_snapshots_do_not_invent_inventory():
    row = dict(tick=1000, steam_id=1, x=0., y=0., health=100, side="ct")
    response = build_round_positions([row], start_tick=1000, tickrate=64, frame=radar_frame("de_dust2"))
    assert "utility_inventory" not in response["frames"][0]["players"][0]
