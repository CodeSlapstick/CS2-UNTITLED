"""Compare normalized demo data across dependency upgrades without touching the DB.

Run as: python -m scripts.check_parser_compatibility DEMO --output snapshot.json
Then:   python -m scripts.check_parser_compatibility DEMO --compare snapshot.json
"""
import argparse
import hashlib
import json
from pathlib import Path

from backend.services.parser import parse_demo


def fingerprint(value):
    # DataFrame row order is not part of the stored relational data contract.
    if isinstance(value, list):
        value = sorted(json.dumps(row, sort_keys=True, allow_nan=False) for row in value)
    return hashlib.sha256(json.dumps(value, sort_keys=True, allow_nan=False).encode()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("demo", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--compare", type=Path)
    args = parser.parse_args()
    doc = parse_demo(args.demo)
    assert doc["counts"]["rounds"] > 0, "Demo must contain played rounds"
    for key, count in doc["counts"].items():
        assert len(doc[key]) == count, key
    print(json.dumps({"match": doc["match"], "counts": doc["counts"]}, indent=2))
    if args.compare:
        baseline = json.loads(args.compare.read_text(encoding="utf-8"))
        changed = [key for key in baseline.keys() | doc.keys()
                   if key != "generated_at" and fingerprint(baseline.get(key)) != fingerprint(doc.get(key))]
        if changed:
            raise SystemExit(f"Parser output changed: {', '.join(sorted(changed))}")
        print("Parser output matches baseline (excluding timestamp and table row order).")
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(doc, ensure_ascii=False, allow_nan=False), encoding="utf-8")


if __name__ == "__main__":
    main()
