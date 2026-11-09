import argparse
import json
import re
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
RADARS = ROOT / "assets" / "radars.json"
MAPS_DIR = ROOT / "assets" / "maps"
SOURCE_IMAGES = ROOT / "images" / "maps" / "cs2" / "radars"
GRID = 300
SKIP = re.compile(r"^(ar_|rush_|workshop_)|_(v\d|night|s\d|2v2)$")
VPK_GUESSES = [
    Path(p) / "steamapps/common/Counter-Strike Global Offensive/game/csgo/pak01_dir.vpk"
    for p in ("C:/SteamLibrary", "D:/SteamLibrary", "E:/SteamLibrary",
              "C:/Program Files (x86)/Steam", "C:/Program Files/Steam", "D:/Steam")
]
KV = re.compile(r'"(\w+)"\s+"([^"]*)"')


def parse_overview(text: str) -> dict[str, str]:
    """Return every "key" "value" pair after removing // comments."""
    body = "\n".join(line.split("//", 1)[0] for line in text.splitlines())
    return {k: v for k, v in KV.findall(body)}


def alpha_mask(path: Path, size: int) -> np.ndarray:
    im = Image.open(path).convert("RGBA")
    if im.size != (size, size):
        im = im.resize((size, size))
    return np.asarray(im)[:, :, 3] > 20


def same_shape(a: Path, b: Path) -> float:
    """Return the walkable-area IoU of two images; 1.0 means identical shapes."""
    ma, mb = alpha_mask(a, 1024), alpha_mask(b, 1024)
    return float((ma & mb).sum() / max(1, (ma | mb).sum()))


def fix_readme(lines: list[str]) -> list[str]:
    """Repair legacy _readme values stored as one character per list item."""
    out: list[str] = []
    run: list[str] = []
    for x in [*lines, None]:                   # Sentinel flushes the final run.
        if x is not None and len(x) <= 1:
            run.append(x)
            continue
        if len(run) > 3:                       # Recover an accidentally split character run.
            out.append("".join(run).strip(" ."))
        else:
            out.extend(run)
        run = []
        if x is not None:
            out.append(x)
    note = "Add or update maps from game files: python research/tools/import_overviews.py --write"
    return out if note in out else [*out, note]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    ap.add_argument("--vpk", type=Path, help="Path to CS2 pak01_dir.vpk (auto-detected when omitted)")
    ap.add_argument("--write", action="store_true", help="Write files; otherwise only preview changes")
    args = ap.parse_args()

    try:
        import vpk  # noqa: PLC0415 — optional maintenance dependency
    except ImportError:
        sys.exit("Missing optional dependency; install it with: pip install vpk")
    path = args.vpk or next((p for p in VPK_GUESSES if p.exists()), None)
    if not path or not path.exists():
        sys.exit("Could not find CS2 pak01_dir.vpk; specify its path with --vpk")
    pak = vpk.open(str(path))

    data = json.loads(RADARS.read_text(encoding="utf-8"))
    readme = data.pop("_readme", [])
    changes: list[str] = []
    for name in sorted(n for n in pak if n.startswith("resource/overviews/") and n.endswith(".txt")):
        m = Path(name).stem
        src = SOURCE_IMAGES / f"{m}.png"
        if SKIP.search(m) or not src.exists():
            continue
        ov = parse_overview(pak[name].read().decode("utf-8", "replace"))
        if not {"pos_x", "pos_y", "scale"} <= ov.keys():
            continue
        size = Image.open(src).size[0]
        pos_x, pos_y, scale = float(ov["pos_x"]), float(ov["pos_y"]), float(ov["scale"])
        old = data.get(m, {})
        entry = {
            "image": f"/maps/{m}.png", "size": size,
            "pos_x": int(pos_x) if pos_x.is_integer() else pos_x,
            "pos_y": int(pos_y) if pos_y.is_integer() else pos_y,
            "scale": scale, "grid": old.get("grid", GRID),
            "source_note": old.get("source_note") or (
                f"Official values from CS2 resource/overviews/{m}.txt (research/tools/import_overviews.py). "
                "No demo for this map is available yet; validate it with check_radar.py after an upload."),
        }
        if "sites" in old:
            entry["sites"] = old["sites"]
        elif "bombA_x" in ov and "bombB_x" in ov:
            span = size * scale
            entry["sites"] = {
                s: [round(pos_x + float(ov[f"bomb{s}_x"]) * span), round(pos_y - float(ov[f"bomb{s}_y"]) * span)]
                for s in ("A", "B")
            }
            entry["sites"]["source_note"] = f"bombA/bombB icon positions from game file resource/overviews/{m}.txt"
        if old and any(old.get(k) != entry[k] for k in ("pos_x", "pos_y", "scale", "size")):
            changes.append(f"{m}: calibration changed {old.get('pos_x')},{old.get('pos_y')},{old.get('scale')} -> "
                           f"{entry['pos_x']},{entry['pos_y']},{entry['scale']}")
        elif not old:
            changes.append(f"{m}: added pos=({entry['pos_x']}, {entry['pos_y']}) scale={entry['scale']}")
        data[m] = entry

        dest = MAPS_DIR / f"{m}.png"
        if not dest.exists():
            changes.append(f"{m}: copied new radar image")
            if args.write:
                shutil.copyfile(src, dest)
        else:
            iou = same_shape(src, dest)
            if iou < 0.99:
                changes.append(f"{m}: existing image is from an older map version (shape IoU {iou:.1%}); replaced it")
                if args.write:
                    shutil.copyfile(src, dest)

    maps = {k: data[k] for k in sorted(data)}
    out = {"_readme": fix_readme(readme), **maps}
    print("\n".join(changes) or "No changes")
    print(f"\n{len(maps)} maps in radars.json")
    if args.write:
        RADARS.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("Written:", RADARS)
    else:
        print("(Preview only; pass --write to save changes)")


if __name__ == "__main__":
    main()
