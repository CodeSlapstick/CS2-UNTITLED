"""Add recorded utility inventories to existing snapshots without reparsing match statistics."""
import asyncio
from pathlib import Path

from demoparser2 import DemoParser

from backend.config.database import connect
from backend.config.settings import ROOT
from backend.services.utility_inventory import utility_inventory


async def main():
    conn = await connect()
    try:
        matches = await conn.fetch("""SELECT id, demo_file FROM matches WHERE status='done'
            AND EXISTS (SELECT 1 FROM player_positions p WHERE p.match_id=matches.id
                        AND p.utility_inventory IS NULL) ORDER BY id""")
        for match in matches:
            paths = [p for p in (ROOT / "demos").rglob(match["demo_file"]) if ".orphaned" not in p.parts]
            if not paths:
                print(f"Missing demo: {match['demo_file']}", flush=True)
                continue
            ticks = await conn.fetch("SELECT DISTINCT tick FROM player_positions WHERE match_id=$1 AND utility_inventory IS NULL ORDER BY tick", match["id"])
            print(f"Reading {match['demo_file']} ({len(ticks)} ticks)", flush=True)
            parsed = DemoParser(str(paths[0])).parse_ticks(["inventory"], ticks=[r["tick"] for r in ticks])
            records = [(int(row["tick"]), int(row["steamid"]), utility_inventory(row["inventory"]))
                       for row in parsed.to_dict("records") if row["steamid"] is not None]
            async with conn.transaction():
                await conn.execute("CREATE TEMP TABLE utility_backfill (tick INTEGER, steam_id BIGINT, inventory TEXT[]) ON COMMIT DROP")
                await conn.copy_records_to_table("utility_backfill", records=records)
                result = await conn.execute("""UPDATE player_positions p SET utility_inventory=u.inventory
                    FROM utility_backfill u WHERE p.match_id=$1 AND p.tick=u.tick AND p.steam_id=u.steam_id
                    AND p.utility_inventory IS NULL""", match["id"])
            print(f"{match['demo_file']}: {result}", flush=True)
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
