import argparse
import asyncio
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import asyncpg
import numpy as np
from sklearn.cluster import KMeans
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score
from sklearn.model_selection import GroupShuffleSplit
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from backend.config.database import DATABASE_URL  # noqa: E402
from backend.repositories.coach import load_coach_facts  # noqa: E402
from backend.services.coach import CONTEXT_FEATURES, OPENING_FEATURES, VERSION, build_coach_samples  # noqa: E402

SEED = 42
PATTERN_COUNT = 4
MIN_TRAINING_ROUNDS = 120
MIN_TRAINING_MATCHES = 8
HOLDOUT_SHARE = 0.25
FOCUSED_AREA_SHARE = 0.45
NAMING_AREA_FEATURES = {"A": "a_15", "Mid": "mid_15", "B": "b_15", "Other": "other_15"}


def fit_policy(samples: list[dict], clusters: int = PATTERN_COUNT):
    openings = np.array([sample["opening"] for sample in samples], dtype=float)
    scaler = StandardScaler().fit(openings)
    opening_model = KMeans(n_clusters=clusters, n_init=20, random_state=SEED).fit(scaler.transform(openings))
    pattern_labels = opening_model.labels_

    winning_rounds = np.array([sample["won"] is True for sample in samples])
    contexts = np.array([sample["context"] for sample in samples], dtype=float)
    policy = RandomForestClassifier(
        n_estimators=64, max_depth=5, min_samples_leaf=15, random_state=SEED, n_jobs=1,
    ).fit(contexts[winning_rounds], pattern_labels[winning_rounds])
    return scaler, opening_model, policy, pattern_labels


def evaluate_policy(samples: list[dict]) -> dict:
    match_ids = np.array([sample["match_id"] for sample in samples])
    train_indices, test_indices = next(
        GroupShuffleSplit(n_splits=1, test_size=HOLDOUT_SHARE, random_state=SEED).split(samples, groups=match_ids)
    )
    training_samples = [samples[index] for index in train_indices]
    test_winners = [samples[index] for index in test_indices if samples[index]["won"]]
    scaler, opening_model, policy, _ = fit_policy(training_samples)

    observed_labels = opening_model.predict(scaler.transform([sample["opening"] for sample in test_winners]))
    predicted_labels = policy.predict([sample["context"] for sample in test_winners])
    train_winning_labels = opening_model.predict(
        scaler.transform([sample["opening"] for sample in training_samples if sample["won"]])
    )
    majority_label = int(np.bincount(train_winning_labels).argmax())
    accuracy = float(accuracy_score(observed_labels, predicted_labels))
    baseline_accuracy = float(np.mean(observed_labels == majority_label))

    return {
        "target": "pattern_used_in_winning_reference_round",
        "method": "match_disjoint_holdout",
        "train_matches": sorted(set(int(match_ids[index]) for index in train_indices)),
        "test_matches": sorted(set(int(match_ids[index]) for index in test_indices)),
        "test_winning_rounds": len(test_winners),
        "accuracy": accuracy,
        "baseline": baseline_accuracy,
        "beats_baseline": accuracy > baseline_accuracy,
    }


def pattern_name(profile: np.ndarray, side: str) -> str:
    areas = {name: profile[OPENING_FEATURES.index(feature)] for name, feature in NAMING_AREA_FEATURES.items()}
    leading_area = max(areas, key=areas.get)
    if leading_area == "Other" or areas[leading_area] < FOCUSED_AREA_SHARE:
        return "Default spread" if side == "t" else "Balanced hold"
    return f"{leading_area} pressure" if side == "t" else f"{leading_area}-weighted defense"


def describe_patterns(samples: list[dict], labels: np.ndarray) -> dict:
    patterns = {}
    for pattern_id in range(PATTERN_COUNT):
        winners = [
            sample for sample, label in zip(samples, labels, strict=True)
            if label == pattern_id and sample["won"]
        ]
        profile = np.mean(
            [sample["opening"] for sample, label in zip(samples, labels, strict=True) if label == pattern_id],
            axis=0,
        )
        name = pattern_name(profile, samples[0]["side"])
        patterns[str(pattern_id)] = {
            "name": f"{name} · P{pattern_id + 1}",
            "rounds": len(winners),
            "matches": len({sample["match_id"] for sample in winners}),
            "profile": {key: round(float(value), 4) for key, value in zip(OPENING_FEATURES, profile, strict=True)},
            "evidence": [
                {key: sample[key] for key in ("match_id", "demo_file", "round_num", "side", "context")}
                for sample in winners
            ],
        }
    return patterns


def serialize_forest(policy: RandomForestClassifier) -> list[dict]:
    trees = []
    for estimator in policy.estimators_:
        tree = estimator.tree_
        trees.append({
            "left": tree.children_left.tolist(),
            "right": tree.children_right.tolist(),
            "feature": tree.feature.tolist(),
            "threshold": tree.threshold.tolist(),
            "values": tree.value[:, 0, :].tolist(),
        })
    return trees


def train_side(samples: list[dict]) -> dict | None:
    if len(samples) < MIN_TRAINING_ROUNDS or len({sample["match_id"] for sample in samples}) < MIN_TRAINING_MATCHES:
        return None

    validation = evaluate_policy(samples)
    scaler, opening_model, policy, labels = fit_policy(samples)
    return {
        "mean": scaler.mean_.tolist(),
        "scale": scaler.scale_.tolist(),
        "centers": opening_model.cluster_centers_.tolist(),
        "classes": [int(label) for label in policy.classes_],
        "trees": serialize_forest(policy),
        "patterns": describe_patterns(samples, labels),
        "validation": validation,
        "training_rounds": len(samples),
    }


async def main(args):
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        data = await load_coach_facts(conn, args.map, reference_only=True)
    finally:
        await conn.close()
    if any(r["source"] != "reference" for r in data["facts"]):
        raise ValueError("Uploaded matches must never enter Coach training")
    samples = [r for r in build_coach_samples(data, args.map) if r["opening"] is not None and r["won"] is not None]
    sides = {s: train_side([r for r in samples if r["side"] == s]) for s in ("t", "ct")}
    sides = {s: model for s, model in sides.items() if model is not None}
    if not sides:
        raise ValueError("Insufficient reference data: need 120 complete team-rounds across 8 matches per side")
    model = {"version": VERSION, "map": args.map, "trained_at": datetime.now(UTC).isoformat(),
             "source": "reference_only", "context_features": CONTEXT_FEATURES, "opening_features": OPENING_FEATURES,
             "training_match_ids": sorted({r["match_id"] for r in samples}), "sides": sides,
             "clock_provenance": "stored_start_tick_unverified"}
    output = ROOT / "output" / "models" / args.map / "coach_model.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(model, ensure_ascii=False, allow_nan=False), encoding="utf-8")
    print(json.dumps({"artifact": str(output), "reference_matches": len(model["training_match_ids"]),
                      "sides": {s: {"rounds": m["training_rounds"], **m["validation"]} for s, m in sides.items()}}, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--map", default="de_mirage")
    asyncio.run(main(parser.parse_args()))
