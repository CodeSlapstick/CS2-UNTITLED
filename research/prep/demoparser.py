"""อ่าน reference demos แล้วรวมข้อมูล kill สำหรับ Player Role และ Grid ML1

ลำดับการทำงาน: อ่าน demo/แคช → ระบุทีม → คำนวณเหตุการณ์ในรอบ → บันทึก CSV
รันด้วย: python research/prep/demoparser.py --limit 1
"""

import argparse
import hashlib
import sys
import time
from pathlib import Path

import polars as pl
from awpy import Demo
from awpy.parsers.rounds import create_round_df

ROOT = Path(__file__).resolve().parents[2]

DEMO_DIR = ROOT / "demos" / "reference"
CACHE_DIR = ROOT / "output" / "kills_cache"
OUT_CSV = ROOT / "data" / "all_kills.csv"
CACHE_SCHEMA_VERSION = "kills-v2"
DEFAULT_TICKRATE = 128
EARLY_ENGAGEMENT_SECONDS = 25
TRADE_WINDOW_SECONDS = 5

sys.path.insert(0, str(ROOT))
from backend.services.features import assign_teams  # noqa: E402

EVENTS = [
    "player_death",
    "round_start",
    "round_freeze_end",
    "round_end",
    "round_officially_ended",
    "bomb_planted",
]

PLAYER_PROPS = ["last_place_name", "X", "Y", "team_name", "team_clan_name"]

for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass


def cache_path_for_demo(path: Path) -> Path:
    """Build a cache key that changes with folder, file content metadata, and schema version."""
    resolved = path.resolve()
    try:
        identity = resolved.relative_to(DEMO_DIR.resolve()).as_posix()
    except ValueError:
        identity = resolved.as_posix()
    file_stats = resolved.stat()
    cache_key = f"{CACHE_SCHEMA_VERSION}:{identity}:{file_stats.st_size}:{file_stats.st_mtime_ns}"
    digest = hashlib.sha256(cache_key.encode("utf-8")).hexdigest()[:16]
    return CACHE_DIR / f"{path.stem}-{digest}.parquet"


def parse_one(path: Path) -> pl.DataFrame:
    """อ่าน kill และเวลาเริ่มรอบ/วางระเบิดจาก demo หนึ่งไฟล์ พร้อมระบุทีมผู้เล่น"""
    demo = Demo(path)
    demo.events = demo.parse_events(EVENTS, player_props=PLAYER_PROPS)
    demo.rounds = create_round_df(demo.events)

    # เริ่มจับเวลาหลัง freeze time; ถ้าไม่มีข้อมูล ให้ใช้เวลาเริ่มรอบแทน
    round_context = demo.rounds.select(
        pl.col("round_num"),
        pl.coalesce(pl.col("freeze_end"), pl.col("start")).alias("round_start_tick"),
        pl.col("bomb_plant").alias("bomb_plant_tick"),
    )

    kills = demo.kills.join(round_context, on="round_num", how="left").with_columns(
        pl.lit(path.name).alias("demo_file"),
        pl.lit(demo.header.get("map_name", "unknown")).alias("map_name"),
        pl.lit(demo.tickrate).alias("tickrate"),
    )
    return add_round_review_columns(kills)


def add_round_review_columns(kills: pl.DataFrame) -> pl.DataFrame:
    """ผูก Steam ID กับทีมตลอดแมตช์ เพื่อให้ชื่อทีมคงที่แม้สลับฝั่ง CT/T"""
    player_rows = []
    for player_role in ("attacker", "victim"):
        clan_column = f"{player_role}_team_clan_name"
        clan = pl.col(clan_column) if clan_column in kills.columns else pl.lit(None)
        players = kills.select(
            pl.col(f"{player_role}_steamid").cast(pl.Int64).alias("steam_id"),
            pl.col("round_num"),
            pl.col(f"{player_role}_side").alias("side"),
            clan.alias("clan"),
        ).drop_nulls("steam_id")
        player_rows.extend(players.to_dicts())
    team_by_steam_id = assign_teams(player_rows)

    def team_column(player_role: str) -> pl.Expr:
        return (
            pl.col(f"{player_role}_steamid")
            .cast(pl.Int64)
            .replace_strict(team_by_steam_id, default=None, return_dtype=pl.Utf8)
            .alias(f"{player_role}_team_clan")
        )

    raw_clan_columns = [column for column in kills.columns if column.endswith("_team_clan_name")]
    return kills.with_columns(
        team_column("attacker"),
        team_column("victim"),
        team_column("assister"),
    ).drop(raw_clan_columns)


ROLE_EVENT_COLUMNS = [
    "round_time_seconds",
    "is_enemy_kill",
    "is_live_round_kill",
    "round_kill_order",
    "is_opening_kill",
    "is_opening_death",
    "is_early_engagement",
    "is_postplant_kill",
    "trade_kill_count",
    "victim_was_traded",
    "is_site_engagement",
    "is_flash_assisted_kill",
]

MODEL_KILL_COLUMNS = [
    "demo_file",
    "map_name",
    "round_num",
    "tick",
    "tickrate",
    "round_start_tick",
    "bomb_plant_tick",
    "round_time_seconds",
    "attacker_name",
    "attacker_steamid",
    "attacker_side",
    "attacker_team_clan",
    "attacker_place",
    "attacker_X",
    "attacker_Y",
    "victim_name",
    "victim_steamid",
    "victim_side",
    "victim_team_clan",
    "victim_place",
    "victim_X",
    "victim_Y",
    "assister_name",
    "assister_steamid",
    "assister_side",
    "assister_team_clan",
    "weapon",
    "is_live_round_kill",
    "is_opening_kill",
    "is_opening_death",
    "is_early_engagement",
    "is_postplant_kill",
    "is_site_engagement",
    "is_flash_assisted_kill",
    "trade_kill_count",
    "victim_was_traded",
]


def select_model_columns(kills: pl.DataFrame) -> pl.DataFrame:
    """Keep only columns consumed by Player Role and Grid ML1."""
    missing = [column for column in MODEL_KILL_COLUMNS if column not in kills.columns]
    if missing:
        raise ValueError(f"all_kills is missing model columns: {', '.join(missing)}")
    return kills.select(MODEL_KILL_COLUMNS)


def _add_round_timing(kills: pl.DataFrame) -> pl.DataFrame:
    """แปลง tick เป็นวินาทีหลังเริ่มรอบ และระบุ kill ฝ่ายตรงข้ามที่เกิดในรอบจริง"""
    tickrate = pl.col("tickrate").fill_null(DEFAULT_TICKRATE).clip(lower_bound=1)
    is_enemy_kill = (
        pl.col("attacker_steamid").is_not_null()
        & pl.col("attacker_side").is_in(["ct", "t"])
        & pl.col("victim_side").is_in(["ct", "t"])
        & (pl.col("attacker_side") != pl.col("victim_side"))
    )
    has_round_started = pl.col("round_start_tick").is_not_null() & (pl.col("tick") >= pl.col("round_start_tick"))
    elapsed_ticks = pl.col("tick") - pl.col("round_start_tick")

    return kills.with_columns(
        is_enemy_kill.alias("is_enemy_kill"),
        (is_enemy_kill & has_round_started).alias("is_live_round_kill"),
        pl.when(has_round_started).then(elapsed_ticks / tickrate).otherwise(None).alias("round_time_seconds"),
    )


def _add_event_flags(kills: pl.DataFrame) -> pl.DataFrame:
    """เพิ่มลำดับ kill และตัวบอกเหตุการณ์ เช่น opening, early และ post-plant"""
    is_live_kill = pl.col("is_live_round_kill")
    live_kill_count = is_live_kill.cast(pl.Int64).cum_sum().over(["demo_file", "round_num"])
    is_at_bombsite = pl.col("attacker_place").fill_null("").str.starts_with("Bombsite") | pl.col(
        "victim_place"
    ).fill_null("").str.starts_with("Bombsite")

    flagged_kills = kills.with_columns(
        pl.when(is_live_kill).then(live_kill_count).otherwise(None).cast(pl.Int64).alias("round_kill_order"),
        (is_live_kill & pl.col("round_time_seconds").is_between(0, EARLY_ENGAGEMENT_SECONDS)).alias(
            "is_early_engagement"
        ),
        (is_live_kill & pl.col("bomb_plant_tick").is_not_null() & (pl.col("tick") >= pl.col("bomb_plant_tick"))).alias(
            "is_postplant_kill"
        ),
        is_at_bombsite.alias("is_site_engagement"),
        pl.col("assistedflash").fill_null(False).cast(pl.Boolean).alias("is_flash_assisted_kill"),
    )

    # ต้องสร้าง round_kill_order ก่อน จึงจะอ้างคอลัมน์นี้ใน Polars ได้
    is_first_kill = (pl.col("round_kill_order") == 1).fill_null(False)
    return flagged_kills.with_columns(
        is_first_kill.alias("is_opening_kill"),
        is_first_kill.alias("is_opening_death"),
    )


def _add_trade_columns(ordered: pl.DataFrame) -> pl.DataFrame:
    """นับการฆ่าคืนภายใน 5 วินาที และทำเครื่องหมายผู้ตายที่มีเพื่อนฆ่าคืนให้"""
    trade_counts = [0] * len(ordered)
    victims_were_traded = [False] * len(ordered)

    # ตรวจแยกแต่ละรอบ เพื่อไม่ให้ trade ข้ามรอบหรือข้ามแมตช์
    for round_rows in ordered.partition_by(["demo_file", "round_num"], maintain_order=True):
        previous_kills: list[dict] = []
        for current_kill in round_rows.iter_rows(named=True):
            if not current_kill["is_live_round_kill"]:
                continue

            tickrate = current_kill["tickrate"] or DEFAULT_TICKRATE
            trade_window_ticks = TRADE_WINDOW_SECONDS * tickrate
            for previous_kill in previous_kills:
                ticks_since_death = current_kill["tick"] - previous_kill["tick"]
                is_within_trade_window = 0 < ticks_since_death <= trade_window_ticks
                killed_previous_attacker = current_kill["victim_steamid"] == previous_kill["attacker_steamid"]
                is_teammate_of_victim = current_kill["attacker_side"] == previous_kill["victim_side"]

                if is_within_trade_window and killed_previous_attacker and is_teammate_of_victim:
                    # หนึ่ง kill อาจฆ่าคืนให้เพื่อนหลายคน จึงนับทุกเหตุการณ์ที่ตรงเงื่อนไข
                    trade_counts[current_kill["_role_row"]] += 1
                    victims_were_traded[previous_kill["_role_row"]] = True

            previous_kills.append(current_kill)

    return ordered.with_columns(
        pl.Series("trade_kill_count", trade_counts, dtype=pl.Int64),
        pl.Series("victim_was_traded", victims_were_traded, dtype=pl.Boolean),
    )


def add_role_event_columns(kills: pl.DataFrame) -> pl.DataFrame:
    """ตรวจคอลัมน์ → เรียง kill → คำนวณเวลา → ระบุเหตุการณ์ → ตรวจ trade"""
    if kills.is_empty():
        return kills

    required = {
        "demo_file",
        "round_num",
        "tick",
        "tickrate",
        "round_start_tick",
        "bomb_plant_tick",
        "attacker_steamid",
        "victim_steamid",
        "attacker_side",
        "victim_side",
        "attacker_place",
        "victim_place",
        "assistedflash",
    }
    missing = sorted(required - set(kills.columns))
    if missing:
        raise ValueError("all_kills is missing source columns for role features: " + ", ".join(missing))

    # คำนวณคอลัมน์เหล่านี้ใหม่เสมอ แม้อินพุตจะมาจากแคชหรือเคยประมวลผลแล้ว
    existing_role_columns = [column for column in ROLE_EVENT_COLUMNS if column in kills.columns]
    if existing_role_columns:
        kills = kills.drop(existing_role_columns)

    ordered = kills.sort(["demo_file", "round_num", "tick"]).with_row_index("_role_row")
    kills_with_timing = _add_round_timing(ordered)
    kills_with_flags = _add_event_flags(kills_with_timing)
    kills_with_trades = _add_trade_columns(kills_with_flags)
    return kills_with_trades.drop("_role_row")


def main() -> None:
    """อ่านตัวเลือก → โหลดแต่ละ demo → รวมข้อมูล → บันทึกและสรุปผล"""
    argument_parser = argparse.ArgumentParser(description="Parse reference demos into one role-ready CSV")
    argument_parser.add_argument("--limit", type=int, help="Parse only the first N demo files")
    argument_parser.add_argument("--force", action="store_true", help="Re-parse all demos instead of using cache")
    argument_parser.add_argument("--out", type=Path, default=OUT_CSV, help=f"Output CSV path (default: {OUT_CSV.name})")
    args = argument_parser.parse_args()

    # ค้นหาในโฟลเดอร์ย่อยด้วย และเลือกเฉพาะไฟล์ที่ลงท้าย .dem
    demo_paths = sorted(DEMO_DIR.rglob("*.dem"))
    if not demo_paths:
        sys.exit(f"No .dem files found in {DEMO_DIR}")
    if args.limit:
        demo_paths = demo_paths[: args.limit]

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    kill_frames: list[pl.DataFrame] = []
    failed_demos: list[tuple[str, str]] = []

    for demo_number, path in enumerate(demo_paths, start=1):
        cache_path = cache_path_for_demo(path)
        size_mb = path.stat().st_size / 1e6
        progress = f"[{demo_number}/{len(demo_paths)}]"

        if cache_path.exists() and not args.force:
            kill_frames.append(pl.read_parquet(cache_path))
            print(f"{progress} skip (cached) {path.name}", flush=True)
            continue

        print(f"{progress} parsing {path.name} ({size_mb:.0f} MB) ...", end=" ", flush=True)
        started_at = time.perf_counter()
        try:
            kills = parse_one(path)
        except Exception as error:
            # demo เสียหนึ่งไฟล์ไม่ควรหยุดการประมวลผลไฟล์ที่เหลือ
            error_message = f"{type(error).__name__}: {error}"
            print(f"failed: {error_message}", flush=True)
            failed_demos.append((path.name, error_message))
            continue
        kills.write_parquet(cache_path)
        kill_frames.append(kills)
        elapsed_seconds = time.perf_counter() - started_at
        print(f"{len(kills):,} kills in {elapsed_seconds:.0f}s", flush=True)

    if not kill_frames:
        sys.exit("No demo was parsed successfully")

    combined_kills = pl.concat(kill_frames, how="diagonal_relaxed")
    kills_with_events = add_role_event_columns(combined_kills)
    model_kills = select_model_columns(kills_with_events)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    model_kills.write_csv(args.out)

    demo_count = model_kills.n_unique("demo_file")
    print(f"\n=== complete: {demo_count} matches | {len(model_kills):,} kills ===")
    map_counts = dict(model_kills["map_name"].value_counts().iter_rows())
    print(f"maps: {map_counts}")
    print(f"saved to: {args.out}")
    if failed_demos:
        print(f"\nfailed to parse {len(failed_demos)} files:")
        for demo_name, error_message in failed_demos:
            print(f"  {demo_name} - {error_message}")


if __name__ == "__main__":
    main()
