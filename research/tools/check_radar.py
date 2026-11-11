import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

CSV = ROOT / "data" / "all_kills.csv"

SQL = """
SELECT m.demo_file, m.map_name, m.tickrate,
       r.round_num, r.start_tick AS round_start_tick, r.bomb_plant_tick, r.winner_side AS round_winner,
       k.tick, k.attacker_side, k.victim_side,
       k.victim_x   AS "victim_X",   k.victim_y   AS "victim_Y",   k.victim_place,
       k.attacker_x AS "attacker_X", k.attacker_y AS "attacker_Y", k.attacker_place,
       k.weapon, k.headshot
FROM kills k
JOIN rounds r  ON r.id = k.round_id
JOIN matches m ON m.id = r.match_id
WHERE ($1::text IS NULL OR m.map_name = $1)
ORDER BY m.demo_file, r.round_num, k.tick, k.id
"""


def _from_db(map_name: str | None) -> pd.DataFrame:
    import asyncpg

    from backend.config.database import DATABASE_URL, redacted_url

    async def go():
        conn = await asyncpg.connect(DATABASE_URL, timeout=5)
        try:
            return await conn.fetch(SQL, map_name)
        finally:
            await conn.close()

    rows = asyncio.run(go())
    df = pd.DataFrame([dict(r) for r in rows])
    df.attrs["source"] = f"PostgreSQL {redacted_url()}"
    return df


def _from_csv(map_name: str | None) -> pd.DataFrame:
    if not CSV.exists():
        raise FileNotFoundError(f"Missing {CSV}; run python research/prep/demoparser.py first")
    df = pd.read_csv(CSV)
    if map_name and "map_name" in df.columns:
        df = df[df["map_name"] == map_name]
    df.attrs["source"] = f"csv {CSV.name}"     # Set after filtering because pandas may not preserve attrs.
    return df


def load_kills(map_name: str | None = None, source: str = "auto") -> pd.DataFrame:
    """Load kills for one map (or all maps) from db, csv, or auto.

    auto tries the database first and falls back to CSV when unavailable or empty.
    The ML_SOURCE environment variable can provide the default source.
    """
    source = (source or os.environ.get("ML_SOURCE") or "auto").lower()
    if source == "db":
        return _from_db(map_name)
    if source == "csv":
        return _from_csv(map_name)
    if source != "auto":
        raise ValueError(f"source must be db, csv, or auto; received {source!r}")

    try:
        df = _from_db(map_name)
        if not df.empty:
            return df
        print(f"!! Database contains no kills for map {map_name}; falling back to CSV")
    except Exception as e:                        # Database unavailable, asyncpg missing, or credentials invalid.
        print(f"!! Database connection failed ({type(e).__name__}); falling back to CSV")
    return _from_csv(map_name)


RADARS = ROOT / "assets" / "radars.json"
ASSETS = ROOT / "assets"
ALPHA_MIN = 8       # Lower alpha values are treated as transparent and outside the map.
PASS_PCT = 99.0     # Lower scores indicate suspicious calibration.

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass


def project(xs, ys, cal):
    """Convert game coordinates to image pixels using the application's projection formula."""
    return (xs - cal["pos_x"]) / cal["scale"], (cal["pos_y"] - ys) / cal["scale"]


def check(map_name: str, cal: dict, source: str = "auto", save_png: bool = False) -> float:
    df = load_kills(map_name, source=source)
    df = df.dropna(subset=["victim_X", "victim_Y"])
    if df.empty:
        print(f"{map_name}: no death positions available; upload a demo for this map first")
        return float("nan")

    img = Image.open(ASSETS / cal["image"].lstrip("/")).convert("RGBA")
    size = img.size[0]
    if img.size[0] != img.size[1]:
        print(f"{map_name}: image is not square ({img.size}); this projection supports square images only")
    if size != cal["size"]:
        print(f"{map_name}: image is {size}px but radars.json declares size={cal['size']}; fix the mismatch")

    px, py = project(df["victim_X"].to_numpy(float), df["victim_Y"].to_numpy(float), cal)
    inside = (px >= 0) & (px < size) & (py >= 0) & (py < size)

    alpha = np.array(img)[:, :, 3]
    walkable = inside.copy()
    xi = np.clip(px.astype(int), 0, size - 1)
    yi = np.clip(py.astype(int), 0, size - 1)
    walkable[inside] = alpha[yi[inside], xi[inside]] > ALPHA_MIN

    pct_in, pct_ok = inside.mean() * 100, walkable.mean() * 100
    mark = "PASS" if pct_ok >= PASS_PCT else "SUSPICIOUS"
    print(f"{map_name}: {len(df):,} points | inside image {pct_in:5.1f}% | on walkable area {pct_ok:5.1f}%  -> {mark}"
          f"   (pos {cal['pos_x']}/{cal['pos_y']} scale {cal['scale']})")

    if save_png:
        out = ROOT / "output" / f"check_radar_{map_name}.png"
        out.parent.mkdir(parents=True, exist_ok=True)
        canvas = Image.alpha_composite(Image.new("RGBA", img.size, (10, 19, 34, 255)), img)
        a = np.array(canvas)
        for x, y, ok in zip(xi[inside], yi[inside], walkable[inside]):
            colour = (110, 231, 168) if ok else (255, 90, 70)      # Green = valid; red = outside walkable area.
            a[max(y - 1, 0):y + 2, max(x - 1, 0):x + 2, :3] = colour
        Image.fromarray(a).convert("RGB").save(out)
        print(f"          Saved validation image to {out} (green = valid, red = outside map)")

    return pct_ok


def main() -> None:
    ap = argparse.ArgumentParser(description="Validate radar calibration using real death positions")
    ap.add_argument("map", nargs="?", help="Map name, e.g. de_dust2 (omit to check all maps in radars.json)")
    ap.add_argument("--try", dest="trial", nargs=3, type=float, metavar=("POS_X", "POS_Y", "SCALE"),
                    help="Try new calibration values without modifying radars.json")
    ap.add_argument("--source", default="auto", help="Data source: db, csv, or auto (default)")
    ap.add_argument("--png", action="store_true", help="Save a radar image with death positions overlaid")
    args = ap.parse_args()

    data = json.loads(RADARS.read_text(encoding="utf-8"))
    maps = {k: v for k, v in data.items() if isinstance(v, dict) and not k.startswith("_")}

    if args.map:
        if args.map not in maps and not args.trial:
            sys.exit(f"{args.map} is not in radars.json; use --try POS_X POS_Y SCALE to test new values")
        cal = dict(maps.get(args.map, {"image": f"/maps/{args.map}.png", "size": 1024}))
        if args.trial:
            cal["pos_x"], cal["pos_y"], cal["scale"] = args.trial[0], args.trial[1], args.trial[2]
        maps = {args.map: cal}

    worst = 100.0
    for name, cal in maps.items():
        pct = check(name, cal, source=args.source, save_png=args.png)
        if pct == pct:                      # Ignore NaN results for maps without data.
            worst = min(worst, pct)

    if worst < PASS_PCT:
        sys.exit(f"\nAt least one map scored below {PASS_PCT}%; its calibration is likely wrong")
    print(f"\nAll maps with available data passed the {PASS_PCT}% threshold")


if __name__ == "__main__":
    main()
