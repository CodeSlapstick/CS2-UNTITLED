import argparse
import json
import math
import re
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

import polars as pl
from awpy import Demo
from awpy.parsers.rounds import apply_round_num, create_round_df

from backend.config.settings import ROOT
from backend.services.review import site_of  # บอมบ์ลงไซต์ไหน — สูตรเดียวกับที่ backfill ใช้

# ==================================================================================================
#
# ==================================================================================================
EVENTS = [
    "player_death",           # ตัวคิลเอง
    "round_start",            # สี่อันล่างนี้ create_round_df ใช้หาขอบเขตแต่ละรอบ
    "round_freeze_end",
    "round_end",
    "round_officially_ended",
    "bomb_planted",           # ไม่จำเป็นต่อ kills แต่ทำให้คอลัมน์ bomb_plant ในตารางรอบไม่ว่าง
    "bomb_begindefuse", "bomb_abortdefuse", "bomb_defused", "bomb_exploded",
    "player_blind",           # เวลาเริ่มและระยะเวลาตาบอดสำหรับวงแสงใน replay
]

PLAYER_PROPS = ["last_place_name", "X", "Y", "Z", "health", "team_name"]

GRENADE_TYPES = {
    "flashbang": "flash", "smokegrenade": "smoke", "hegrenade": "he",
    "molotov": "molotov", "incgrenade": "molotov", "decoy": "decoy",
}
PROJECTILE_TYPES = {
    "CSmokeGrenadeProjectile": "smoke",
    "CFlashbangProjectile": "flash",
    "CHEGrenadeProjectile": "he",
    "CMolotovProjectile": "molotov",
    "CIncendiaryGrenadeProjectile": "molotov",
    "CDecoyProjectile": "decoy",
}


# ==================================================================================================
# ==================================================================================================
DEMO_DIR = ROOT / "demos"
OUT_DIR = ROOT / "output" / "json"

SCHEMA_VERSION = 9      # เพิ่ม has_kit ในช่วงกู้บอมบ์; JSON รุ่นเก่าต้อง parse ใหม่
POSITION_SAMPLE_HZ = 8  # ปรับความถี่ replay ได้จากจุดเดียว; tick จริงคำนวณจาก tickrate ของเดโม

TEAMS_RE = re.compile(r"^(?P<a>.+?)-vs-(?P<b>.+?)-[^-]+\.dem$", re.IGNORECASE)

KILL_COLUMNS = {
    "tick": "tick",
    "attacker_steamid": "attacker_id", "victim_steamid": "victim_id", "assister_steamid": "assister_id",
    "attacker_side": "attacker_side", "victim_side": "victim_side",
    "weapon": "weapon", "headshot": "headshot", "hitgroup": "hitgroup",
    "attackerblind": "attacker_blind", "thrusmoke": "thru_smoke", "noscope": "noscope", "assistedflash": "assisted_flash",
    "penetrated": "penetrated", "distance": "distance",
    "attacker_X": "attacker_x", "attacker_Y": "attacker_y", "attacker_Z": "attacker_z", "attacker_place": "attacker_place",
    "victim_X": "victim_x", "victim_Y": "victim_y", "victim_Z": "victim_z", "victim_place": "victim_place",
}

DAMAGE_COLUMNS = {
    "tick": "tick",
    "attacker_steamid": "attacker_id", "user_steamid": "victim_id",
    "weapon": "weapon", "health_lost": "damage", "hitgroup": "hitgroup",
}

TICK_PROPS = ["team_name", "is_alive", "current_equip_value", "balance",
              "X", "Y", "Z", "last_place_name", "health",
              "team_clan_name", "active_weapon_name", "armor_value", "has_helmet", "has_defuser", "yaw", "inventory"]

for _s in (sys.stdout, sys.stderr):     # ให้คอนโซล Windows พิมพ์ไทยได้
    try:
        _s.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass


def teams_from_filename(demo_file: str) -> tuple[str | None, str | None]:
    m = TEAMS_RE.match(demo_file)
    return (m["a"], m["b"]) if m else (None, None)


def _clean(df: pl.DataFrame) -> pl.DataFrame:
    """NaN ของ float -> null เพื่อให้ออกมาเป็น null ใน JSON (json ไม่มี NaN)"""
    return df.with_columns([pl.col(c).fill_nan(None) for c, t in df.schema.items() if t in (pl.Float32, pl.Float64)])


def _round_table(dem) -> pl.DataFrame:
    """ตารางรอบ + จุดที่วางบอมบ์ — เอาจากตารางรอบโดยตรง จะได้ครบแม้รอบที่ไม่มีคิลเลย"""
    # awpy's generated round schema varies by parser/demo. Short or
    # abandoned matches can legitimately omit bomb_plant entirely.
    bomb_plant = (pl.col("bomb_plant").cast(pl.Int32)
                  if "bomb_plant" in dem.rounds.columns else pl.lit(None, pl.Int32))
    rounds = _clean(dem.rounds.select(
        pl.col("round_num").cast(pl.Int32),
        pl.coalesce("freeze_end", "start").cast(pl.Int32).alias("start_tick"),
        pl.coalesce("official_end", "end").cast(pl.Int32).alias("end_tick"),
        bomb_plant.alias("bomb_plant_tick"),
        pl.col("winner").alias("winner_side"),
        pl.col("reason").alias("end_reason"),
    )).sort("round_num")

    bp = dem.events.get("bomb_planted") if isinstance(dem.events, dict) else None
    if bp is None or not len(bp):
        rounds = rounds.with_columns(pl.lit(None, pl.Float64).alias("bomb_plant_x"),
                                     pl.lit(None, pl.Float64).alias("bomb_plant_y"))
    else:
        plant = (bp.select(pl.col("tick").cast(pl.Int32).alias("bomb_plant_tick"),
                           pl.col("user_X").cast(pl.Float64).alias("bomb_plant_x"),
                           pl.col("user_Y").cast(pl.Float64).alias("bomb_plant_y"))
                 .unique("bomb_plant_tick", keep="first"))
        rounds = rounds.join(plant, on="bomb_plant_tick", how="left")

    map_name = dem.header.get("map_name", "unknown")
    return rounds.with_columns(
        pl.struct(["bomb_plant_x", "bomb_plant_y"])
          .map_elements(lambda r: site_of(r["bomb_plant_x"], r["bomb_plant_y"], map_name), return_dtype=pl.Utf8)
          .alias("bomb_site"))


def _defuse_intervals(events: dict[str, pl.DataFrame], rounds: list[dict]) -> dict[int, list[dict]]:
    """Pair real begin/abort/completion events; never guess a missing start time."""
    def has_kit(value: object) -> bool:
        if isinstance(value, str):
            return value.strip().lower() in {"true", "1", "yes"}
        return value is True or value == 1

    names = ("bomb_begindefuse", "bomb_abortdefuse", "bomb_defused")
    timeline = sorted(
        ((int(row["tick"]), name, str(row["user_steamid"]), has_kit(row.get("haskit")))
         for name in names for row in events.get(name, pl.DataFrame()).iter_rows(named=True)
         if row.get("tick") is not None and row.get("user_steamid") is not None),
        key=lambda item: item[0],
    )
    active: dict[tuple[int, str], tuple[int, bool]] = {}
    intervals: dict[int, list[dict]] = {}
    for tick, name, steamid, haskit in timeline:
        rnd = next((r for r in rounds if r["start_tick"] is not None and r["end_tick"] is not None
                    and r["start_tick"] <= tick <= r["end_tick"]
                    and r.get("bomb_plant_tick") is not None and r["bomb_plant_tick"] <= tick), None)
        if rnd is None:
            continue
        key = (int(rnd["round_num"]), steamid)
        if name == "bomb_begindefuse":
            active[key] = (tick, haskit)
        else:
            previous = active.pop(key, None)
            if previous is not None and tick > previous[0]:
                start, kit = previous
                intervals.setdefault(key[0], []).append({"start_tick": start, "end_tick": tick,
                                                           "steam_id": steamid, "has_kit": kit})
    return intervals


def _bomb_resolution_ticks(events: dict[str, pl.DataFrame], rounds: list[dict]) -> dict[int, int]:
    """Use the recorded defuse or explosion tick to end the planted C4 display."""
    resolved: dict[int, int] = {}
    for name in ("bomb_defused", "bomb_exploded"):
        for row in events.get(name, pl.DataFrame()).iter_rows(named=True):
            if row.get("tick") is None:
                continue
            tick = int(row["tick"])
            rnd = next((r for r in rounds if r.get("bomb_plant_tick") is not None
                        and r["end_tick"] is not None and r["bomb_plant_tick"] <= tick <= r["end_tick"]), None)
            if rnd is not None:
                number = int(rnd["round_num"])
                resolved[number] = min(tick, resolved.get(number, tick))
    return resolved


def _kill_table(dem) -> pl.DataFrame:
    """คิล — เปลี่ยนชื่อคอลัมน์ให้ตรง schema ตัดคอลัมน์ที่ DB ไม่เก็บ"""
    return _clean(
        dem.kills.select(["round_num", *KILL_COLUMNS])
                 .rename(KILL_COLUMNS)
                 .with_columns(
                     pl.col("round_num").cast(pl.Int32),
                     pl.col("tick").cast(pl.Int32),
                     pl.col("penetrated").cast(pl.Int32),
                     pl.col(["attacker_id", "victim_id", "assister_id"]).cast(pl.Int64),
                     pl.col(["headshot", "attacker_blind", "thru_smoke", "noscope", "assisted_flash"]).cast(pl.Boolean),
                 )
                 .sort(["round_num", "tick"])
    )


def _damage_table(dem) -> pl.DataFrame:
    return _clean(
        apply_round_num(dem.events["player_hurt"], dem.rounds)
        .drop_nulls(["round_num", "user_steamid"])
        .sort(["round_num", "tick"])
        .with_columns(
            (pl.col("health").shift(1).over(["round_num", "user_steamid"]).fill_null(100) - pl.col("health"))
            .clip(0, 100)
            .alias("health_lost")
        )
        .select(["round_num", *DAMAGE_COLUMNS])
        .rename(DAMAGE_COLUMNS)
        .with_columns(
            pl.col(["round_num", "tick", "damage"]).cast(pl.Int32),
            pl.col(["attacker_id", "victim_id"]).cast(pl.Int64),
        )
        .sort(["round_num", "tick"])
    )


def position_sample_ticks(start_tick: int, end_tick: int, tickrate: int,
                          sample_hz: int = POSITION_SAMPLE_HZ) -> list[int]:
    """คืน tick จริงที่กระจายใกล้ ``sample_hz`` ต่อวินาที โดยไม่สร้าง tick ซ้ำ"""
    if tickrate <= 0 or sample_hz <= 0 or end_tick <= start_tick:
        return []
    out: list[int] = []
    n = 0
    while True:
        tick = start_tick + (2 * n * tickrate + sample_hz) // (2 * sample_hz)
        if tick >= end_tick:
            break
        if not out or tick != out[-1]:
            out.append(tick)
        n += 1
    return out


def _wanted_ticks(dem, tickrate: int) -> tuple[dict[int, tuple[int, str]], dict[int, int]]:
    want: dict[int, tuple[int, str]] = {}
    pos_want: dict[int, int] = {}          # tick จริง -> round_num ของ snapshot replay
    for r in dem.rounds.iter_rows(named=True):
        fe = r["freeze_end"] or r["start"]
        en = r["end"] or r["official_end"]
        if fe is not None:
            want[int(fe)] = (r["round_num"], "start")
        if en is not None:
            want[int(en)] = (r["round_num"], "end")
        replay_end = r["official_end"] or en
        if fe is not None and replay_end is not None:
            for t in position_sample_ticks(int(fe), int(replay_end), tickrate):
                pos_want[t] = int(r["round_num"])
    return want, pos_want


def _player_round_table(at_start: pl.DataFrame, at_end: pl.DataFrame) -> pl.DataFrame:
    """หนึ่งแถวต่อคนต่อรอบ — ฝั่ง / มูลค่าอุปกรณ์ / รอดถึงจบรอบไหม"""
    return _clean(
        at_start.join(at_end, on=["round_num", "steamid"], how="left")
        .select(
            pl.col("round_num").cast(pl.Int32),
            pl.col("steamid").cast(pl.Int64).alias("steam_id"),
            pl.when(pl.col("team_name") == "CT").then(pl.lit("ct")).otherwise(pl.lit("t")).alias("side"),
            pl.col("current_equip_value").cast(pl.Int32).alias("equip_value"),
            pl.col("balance").cast(pl.Int32),
            pl.col("survived").fill_null(False),
            pl.col("team_clan_name").alias("team_clan"),      # clan tag ณ รอบนั้น — loader ผูกเป็นทีมคงที่ด้วย teams.assign_teams
        )
        .sort(["round_num", "steam_id"])
    )


def _position_table(all_ticks: pl.DataFrame, pos_want: dict[int, int]) -> pl.DataFrame:
    return _clean(
        all_ticks.join(pl.DataFrame({"tick": list(pos_want), "round_num": list(pos_want.values())}), on="tick")
        .filter(pl.col("is_alive"))
        .select(
            pl.col("round_num").cast(pl.Int32),
            pl.col("tick").cast(pl.Int32),
            pl.col("steamid").cast(pl.Int64).alias("steam_id"),
            pl.when(pl.col("team_name") == "CT").then(pl.lit("ct")).otherwise(pl.lit("t")).alias("side"),
            pl.col("X").cast(pl.Float32).alias("x"),
            pl.col("Y").cast(pl.Float32).alias("y"),
            pl.col("Z").cast(pl.Float32).alias("z"),
            pl.col("yaw").cast(pl.Float32),
            pl.col("health").cast(pl.Int16),
            pl.col("last_place_name").alias("place"),
            pl.col("active_weapon_name").cast(pl.Utf8).alias("active_weapon"),
            pl.col("armor_value").cast(pl.Int16).alias("armor"),
            pl.col("has_helmet").cast(pl.Boolean),
            pl.col("has_defuser").cast(pl.Boolean),
            pl.col("balance").cast(pl.Int32).alias("money"),
            (pl.col("inventory").map_elements(
                lambda items: False if items is None else any(
                    str(item).lower().removeprefix("weapon_") == "c4" for item in items
                ),
                return_dtype=pl.Boolean,
            ).alias("has_bomb") if "inventory" in all_ticks.columns
             else pl.lit(None, pl.Boolean).alias("has_bomb")),
        )
        .unique(["round_num", "tick", "steam_id"], keep="first", maintain_order=True)
        .sort(["round_num", "tick", "steam_id"])
    )


def _add_flash_remaining(positions: pl.DataFrame, blinds: pl.DataFrame | None, tickrate: int) -> pl.DataFrame:
    """คำนวณเวลาตาบอดคงเหลือจาก player_blind เพราะ flash_duration ใน tick ไม่ได้นับถอยหลัง"""
    original_columns = [name for name in positions.columns if name != "flash_remaining"]
    base = positions.select(original_columns)
    def zero() -> pl.DataFrame:
        return base.with_columns(pl.lit(0.0, pl.Float32).alias("flash_remaining"))
    victim_candidates = ("user_steamid", "victim_steamid", "target_steamid", "steam_id", "user_steam_id")
    victim_column = next((name for name in victim_candidates if blinds is not None and name in blinds.columns), None)
    if (base.is_empty() or blinds is None or blinds.is_empty() or tickrate <= 0
            or not {"steam_id", "tick"}.issubset(base.columns)
            or not {"tick", "blind_duration"}.issubset(blinds.columns) or victim_column is None):
        return zero()

    snapshots = (base.with_row_index("__flash_row")
                 .with_columns(
                     pl.col("steam_id").cast(pl.Int64, strict=False).alias("__flash_steam_id"),
                     pl.col("tick").cast(pl.Int64, strict=False).alias("__flash_tick"),
                 ).sort(["__flash_steam_id", "__flash_tick"]))
    events = (blinds.select(
        pl.col(victim_column).cast(pl.Int64, strict=False).alias("__flash_steam_id"),
        pl.col("tick").cast(pl.Int64, strict=False).alias("__blind_tick"),
        pl.col("blind_duration").cast(pl.Float32, strict=False).alias("__blind_duration"),
    ).drop_nulls().filter(pl.col("__blind_duration").is_finite() & (pl.col("__blind_duration") > 0))
        .sort(["__flash_steam_id", "__blind_tick"]))
    if events.is_empty():
        return zero()

    elapsed = (pl.col("__flash_tick") - pl.col("__blind_tick")) / tickrate
    return (snapshots.join_asof(
        events, left_on="__flash_tick", right_on="__blind_tick",
        by="__flash_steam_id", strategy="backward", check_sortedness=False,
    ).with_columns(
        pl.when((elapsed >= 0) & (elapsed <= pl.col("__blind_duration")))
        .then(pl.col("__blind_duration") - elapsed).otherwise(0.0)
        .fill_null(0.0).cast(pl.Float32).alias("flash_remaining")
    ).sort("__flash_row").select([*original_columns, "flash_remaining"]))


def _grenade_rows(dem, tickrate: int) -> list[dict]:
    """ระเบิดทุกลูก จาก weapon_fire พร้อมจุดตกและเวลาที่ควัน/ไฟหมด

    ใช้ weapon_fire เพราะ grenade_thrown ไม่มีในเดโม 14 จาก 50 ไฟล์
    """
    fired = dem.parser.parse_event("weapon_fire", player=["team_name", "X", "Y"])
    if hasattr(fired, "columns") and len(fired):
        thrown = (
            apply_round_num(pl.from_pandas(fired).with_columns(pl.col("weapon").str.replace("^weapon_", "")), dem.rounds)
            .filter(pl.col("weapon").is_in(list(GRENADE_TYPES)))
            .drop_nulls(["round_num"])
            .select(
                pl.col("round_num").cast(pl.Int32),
                pl.col("tick").cast(pl.Int32),
                pl.col("user_steamid").cast(pl.Int64).alias("thrower_id"),
                pl.when(pl.col("user_team_name") == "CT").then(pl.lit("ct")).otherwise(pl.lit("t")).alias("side"),
                pl.col("weapon").replace_strict(GRENADE_TYPES, default="other").alias("type"),
                pl.col("user_X").cast(pl.Float32).alias("throw_x"),     # คนขว้างยืนตรงไหนตอนขว้าง
                pl.col("user_Y").cast(pl.Float32).alias("throw_y"),
            )
            .sort(["round_num", "tick"])
        )
    else:
        thrown = pl.DataFrame(schema={"round_num": pl.Int32, "tick": pl.Int32, "thrower_id": pl.Int64, "side": pl.Utf8,
                                      "type": pl.Utf8, "throw_x": pl.Float32, "throw_y": pl.Float32})
    grenades = attach_landings(thrown.to_dicts(), read_detonations(dem.parser), tickrate)
    return attach_trajectories(grenades, read_projectile_trajectories(dem), tickrate)


def _player_table(dem, at_start: pl.DataFrame) -> pl.DataFrame:
    """ทุก steam_id ที่โผล่ ชื่อล่าสุดที่เห็นชนะ

    รวมคนจาก tick ด้วย จะได้ครบ 10 คนแม้บางคนไม่เคยฆ่าหรือตายเลย (FK ของ player_rounds/grenades ต้องการ)
    """
    def ids(col: str, name: str) -> pl.DataFrame:
        return dem.kills.select(pl.col(col).cast(pl.Int64).alias("steam_id"), pl.col(name).alias("name"))

    return (
        pl.concat([
            ids("attacker_steamid", "attacker_name"),
            ids("victim_steamid", "victim_name"),
            ids("assister_steamid", "assister_name"),
            at_start.select(pl.col("steamid").cast(pl.Int64).alias("steam_id"), pl.col("name")),
        ])
        .drop_nulls("steam_id")
        .with_columns(pl.col("steam_id").cast(pl.Int64))
        .unique(subset="steam_id", keep="last", maintain_order=True)
        .sort("steam_id")
    )


def parse_demo(path: Path) -> dict:
    """อ่านเดโมหนึ่งไฟล์ คืน dict โครง normalized พร้อม json.dumps"""
    dem = Demo(path)
    dem.events = dem.parse_events([*EVENTS, "player_hurt", "player_blind"], player_props=PLAYER_PROPS)
    dem.rounds = create_round_df(dem.events)
    tickrate = int(dem.tickrate)

    want, pos_want = _wanted_ticks(dem, tickrate)
    all_ticks = pl.from_pandas(dem.parser.parse_ticks(wanted_props=TICK_PROPS, ticks=sorted(set(want) | set(pos_want))))
    ticks = all_ticks.join(
        pl.DataFrame({"tick": list(want), "round_num": [v[0] for v in want.values()], "at": [v[1] for v in want.values()]}),
        on="tick",
    )
    at_start = ticks.filter((pl.col("at") == "start") & pl.col("is_alive"))
    at_end = ticks.filter(pl.col("at") == "end").select("round_num", "steamid", pl.col("is_alive").alias("survived"))

    rounds = _round_table(dem)
    kills = _kill_table(dem)
    damages = _damage_table(dem)
    player_rounds = _player_round_table(at_start, at_end)
    positions = _add_flash_remaining(_position_table(all_ticks, pos_want), dem.events.get("player_blind"), tickrate)
    grenades = _grenade_rows(dem, tickrate)
    players = _player_table(dem, at_start)

    team_a, team_b = teams_from_filename(path.name)
    rounds_data = rounds.to_dicts()
    defuses = _defuse_intervals(dem.events, rounds_data)
    resolutions = _bomb_resolution_ticks(dem.events, rounds_data)
    for r in rounds_data:
        r["defuses"] = defuses.get(r["round_num"], [])
        r["bomb_resolved_tick"] = resolutions.get(r["round_num"])

    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "match": {
            "demo_file": path.name,
            "map_name": dem.header.get("map_name", "unknown"),
            "tickrate": tickrate,
            "team_a": team_a,
            "team_b": team_b,
        },
        "counts": {"players": len(players), "rounds": len(rounds), "kills": len(kills), "damages": len(damages),
                   "player_rounds": len(player_rounds), "grenades": len(grenades), "positions": len(positions)},
        "players": players.to_dicts(),
        "rounds": rounds_data,
        "kills": kills.to_dicts(),
        "damages": damages.to_dicts(),
        "player_rounds": player_rounds.to_dicts(),
        "grenades": grenades,
        "positions": positions.to_dicts(),
    }


# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
DETONATE_EVENTS = {"smoke": "smokegrenade_detonate", "flash": "flashbang_detonate",
                   "he": "hegrenade_detonate", "molotov": "inferno_startburn"}
EXPIRE_EVENTS = {"smoke": "smokegrenade_expired", "molotov": "inferno_expire"}
MAX_FLIGHT_SEC = 20     # ขว้างแล้วตกช้าสุดกี่วินาที (ลูกที่เด้งไกลที่สุดยังไม่ถึง 10 วินาที) — เกินนี้ไม่ใช่ลูกเดียวกัน


def _num(v, cast):
    return None if v is None or v != v else cast(v)      # v != v = NaN จาก pandas


def _event_rows(parser, name: str) -> list[dict]:
    try:
        df = parser.parse_event(name)
    except Exception:   # noqa: BLE001 — เดโมบางไฟล์ไม่มี event นี้เลย
        return []
    return df.to_dict("records") if hasattr(df, "columns") and len(df) else []


def read_detonations(parser) -> dict[str, list[dict]]:
    """{ชนิด: [{tick, thrower_id, x, y, end_tick}]} เรียงตาม tick — end_tick มาจาก event ตอนหมดของ entity เดียวกัน"""
    out: dict[str, list[dict]] = {}
    for gtype, event in DETONATE_EVENTS.items():
        dets = sorted(({"tick": int(r["tick"]), "thrower_id": _num(r.get("user_steamid"), int),
                        "x": _num(r.get("x"), float), "y": _num(r.get("y"), float),
                        "entityid": r.get("entityid"), "end_tick": None} for r in _event_rows(parser, event)),
                      key=lambda d: d["tick"])
        if gtype in EXPIRE_EVENTS:
            expires = sorted((int(r["tick"]), r.get("entityid")) for r in _event_rows(parser, EXPIRE_EVENTS[gtype]))
            for d in dets:     # entityid ถูกใช้ซ้ำได้ทั้งแมตช์ จึงเอา "ตัวแรกหลังตก" ของ entity เดียวกัน
                d["end_tick"] = next((t for t, e in expires if e == d["entityid"] and t >= d["tick"]), None)
        out[gtype] = dets
    return out


def attach_landings(throws: list[dict], detonations: dict[str, list[dict]], tickrate: int) -> list[dict]:
    window = MAX_FLIGHT_SEC * int(tickrate)
    used: set[tuple[str, int]] = set()
    out = []
    for g in sorted(throws, key=lambda g: g["tick"]):
        row = {**g, "land_x": None, "land_y": None, "land_tick": None, "end_tick": None}
        for i, d in enumerate(detonations.get(g["type"], [])):
            if d["tick"] > g["tick"] + window:
                break
            if (g["type"], i) in used or d["thrower_id"] != g.get("thrower_id") or d["tick"] < g["tick"]:
                continue
            used.add((g["type"], i))
            row.update(land_x=d["x"], land_y=d["y"], land_tick=d["tick"],
                       end_tick=d["end_tick"] if g["type"] in EXPIRE_EVENTS else d["tick"])
            break
        out.append(row)
    return out


def read_projectile_trajectories(dem) -> list[dict]:
    """อ่านพิกัด projectile จริงราย tick ที่ demoparser2 มีให้; ไม่สร้างจุดจาก endpoints"""
    try:
        raw = dem.parse_grenades()
    except Exception:  # noqa: BLE001 — demo เก่าบางไฟล์ไม่มี entity stream นี้
        return []
    if raw is None or not len(raw):
        return []
    return (
        raw.filter(pl.col("grenade_type").is_in(list(PROJECTILE_TYPES)), pl.col("X").is_not_null(), pl.col("Y").is_not_null())
        .select(
            pl.col("thrower_steamid").cast(pl.Int64).alias("thrower_id"),
            pl.col("grenade_type").replace_strict(PROJECTILE_TYPES).alias("type"),
            pl.col("entity_id").cast(pl.Int32),
            pl.col("tick").cast(pl.Int32),
            pl.col("X").cast(pl.Float32).alias("x"),
            pl.col("Y").cast(pl.Float32).alias("y"),
            pl.col("Z").cast(pl.Float32).alias("z"),
        )
        .sort(["thrower_id", "type", "entity_id", "tick"])
        .to_dicts()
    )


def attach_trajectories(grenades: list[dict], points: list[dict], tickrate: int) -> list[dict]:
    segments: dict[tuple[int, str], list[list[dict]]] = {}
    current: dict[tuple[int, str, int], list[dict]] = {}
    for p in points:
        if p.get("thrower_id") is None:
            continue
        entity_key = (int(p["thrower_id"]), p["type"], int(p["entity_id"]))
        seg = current.get(entity_key)
        if seg is None or int(p["tick"]) > int(seg[-1]["tick"]) + 1:
            seg = []
            current[entity_key] = seg
            segments.setdefault(entity_key[:2], []).append(seg)
        seg.append(p)

    used: set[int] = set()
    out: list[dict] = []
    max_flight = MAX_FLIGHT_SEC * int(tickrate)
    for grenade in grenades:
        row = {**grenade, "trajectory": None}
        thrower = grenade.get("thrower_id")
        if thrower is None:
            out.append(row)
            continue
        start = int(grenade["tick"])
        stop = int(grenade.get("land_tick") or (start + max_flight))
        candidates = []
        for segment in segments.get((int(thrower), grenade["type"]), []):
            if id(segment) in used:
                continue
            first = int(segment[0]["tick"])
            if start - 2 <= first <= stop:
                throw_x = segment[0]["x"] if grenade.get("throw_x") is None else grenade["throw_x"]
                throw_y = segment[0]["y"] if grenade.get("throw_y") is None else grenade["throw_y"]
                distance = math.hypot(float(segment[0]["x"]) - float(throw_x),
                                      float(segment[0]["y"]) - float(throw_y))
                candidates.append((abs(first - start), distance, segment))
        if candidates:
            segment = min(candidates, key=lambda item: (item[0], item[1]))[2]
            used.add(id(segment))
            actual = [p for p in segment if start <= int(p["tick"]) <= stop]
            if actual:
                row["trajectory"] = [[int(p["tick"]), float(p["x"]), float(p["y"]), _num(p.get("z"), float)] for p in actual]
        out.append(row)
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description="แปลง .dem เป็น JSON แบบ normalized ไฟล์ละแมตช์")
    ap.add_argument("demos", nargs="*", type=Path, help="ไฟล์ .dem (ไม่ใส่ = ทุกไฟล์ใน demos/)")
    ap.add_argument("--out", type=Path, default=OUT_DIR, help=f"โฟลเดอร์ผลลัพธ์ (ค่าตั้งต้น {OUT_DIR.relative_to(ROOT)})")
    ap.add_argument("--limit", type=int, help="อ่านแค่กี่ไฟล์ (ไว้ทดสอบ)")
    ap.add_argument("--force", action="store_true", help="เขียนทับ JSON ที่มีอยู่แล้ว")
    args = ap.parse_args()

    demos = args.demos or sorted(DEMO_DIR.glob("*.dem"))
    demos = demos[: args.limit]
    if not demos:
        sys.exit(f"ไม่เจอไฟล์ .dem ใน {DEMO_DIR}")

    args.out.mkdir(parents=True, exist_ok=True)
    totals = {"players": 0, "rounds": 0, "kills": 0, "damages": 0, "player_rounds": 0, "grenades": 0}
    done = failed = skipped = 0
    for i, path in enumerate(demos, 1):
        target = args.out / f"{path.stem}.json"
        if target.exists() and not args.force:
            with target.open(encoding="utf-8") as cached:
                header = cached.read(256)
            version = re.search(r'"schema_version"\s*:\s*(\d+)', header)
            if version and int(version.group(1)) >= SCHEMA_VERSION:
                print(f"[{i}/{len(demos)}] {path.name} — มีแล้ว ข้าม")
                skipped += 1
                continue

        t0 = time.time()
        try:
            doc = parse_demo(path)
        except Exception as e:                        # เดโมเสียหนึ่งไฟล์ ไม่ควรทำให้ทั้ง batch ล่ม
            print(f"[{i}/{len(demos)}] {path.name} — พัง: {e}")
            failed += 1
            continue

        tmp = target.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        tmp.replace(target)

        for k in totals:
            totals[k] += doc["counts"][k]
        done += 1
        c = doc["counts"]
        print(f"[{i}/{len(demos)}] {path.name} — {c['rounds']} รอบ {c['kills']} คิล {c['damages']} ดาเมจ {c['grenades']} ระเบิด "
              f"{target.stat().st_size / 1024:.0f} KB ({time.time() - t0:.1f}s)")

    print(f"\nเสร็จ {done} · ข้าม {skipped} · พัง {failed}  ->  {args.out}")
    if done:
        print(f"รวมที่ parse รอบนี้: {totals['rounds']:,} รอบ {totals['kills']:,} คิล "
              f"{totals['damages']:,} ดาเมจ {totals['grenades']:,} ระเบิด {totals['players']:,} นักแข่ง")


if __name__ == "__main__":
    main()
