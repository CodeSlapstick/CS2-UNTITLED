"""Coach training keeps match-disjoint validation and backend-readable artifacts."""

import json

import numpy as np
import pytest

from backend.services.coach import OPENING_FEATURES, VERSION, recommend_round, tree_distribution
from research.models import coach_ml as coach


def training_samples(side="t"):
    """Eight matches contain four reproducible opening patterns and both outcomes."""
    rng = np.random.default_rng(123)
    samples = []
    for match_id in range(100, 108):
        for round_num in range(1, 25):
            pattern = (round_num - 1) % 4
            opening = [float(area == pattern) for _ in (5, 15, 25) for area in range(4)]
            opening.extend([0.1, 0.2, 0.1, 0.0, 0.0])
            opening = (np.array(opening) + rng.normal(0, 0.001, len(opening))).tolist()
            samples.append(
                {
                    "match_id": match_id,
                    "demo_file": f"match-{match_id}.dem",
                    "round_num": round_num,
                    "side": side,
                    "source": "reference",
                    "won": round_num % 5 != 0,
                    "context": [
                        0.2 + pattern * 0.1,
                        0.05 * pattern,
                        float(pattern == 3),
                        float(pattern == 2),
                        float(pattern == 0),
                        float(pattern == 1),
                    ],
                    "opening": opening,
                }
            )
    return samples


@pytest.fixture(scope="module")
def trained():
    return coach.train_side(training_samples())


@pytest.mark.parametrize("case", ["too_few_rounds", "too_few_matches"])
def test_insufficient_reference_data_does_not_train(case):
    samples = training_samples()
    if case == "too_few_rounds":
        samples = sorted(samples, key=lambda sample: (sample["round_num"], sample["match_id"]))[:119]
        assert len({sample["match_id"] for sample in samples}) == 8
    else:
        samples = samples[:120]
        assert len(samples) == 120
        assert len({sample["match_id"] for sample in samples}) < 8

    assert coach.train_side(samples) is None


def test_validation_uses_disjoint_matches_and_only_winning_test_rounds(trained):
    validation = trained["validation"]
    train_ids = set(validation["train_matches"])
    test_ids = set(validation["test_matches"])

    assert len(train_ids) == 6
    assert len(test_ids) == 2
    assert train_ids.isdisjoint(test_ids)
    assert train_ids | test_ids == set(range(100, 108))
    assert validation["test_winning_rounds"] == sum(
        sample["won"] for sample in training_samples() if sample["match_id"] in test_ids
    )
    assert validation["target"] == "pattern_used_in_winning_reference_round"
    assert validation["beats_baseline"] == (validation["accuracy"] > validation["baseline"])
    assert trained["training_rounds"] == 192


def test_pattern_names_profiles_and_evidence_remain_complete(trained):
    assert len(trained["patterns"]) == 4
    assert {pattern["name"].split(" · ")[0] for pattern in trained["patterns"].values()} == {
        "A pressure",
        "Mid pressure",
        "B pressure",
        "Default spread",
    }
    for pattern in trained["patterns"].values():
        assert list(pattern["profile"]) == OPENING_FEATURES
        assert pattern["rounds"] == len(pattern["evidence"])
        assert pattern["matches"] == 8
        assert all(row["match_id"] in range(100, 108) for row in pattern["evidence"])


def test_serialized_forest_predicts_the_same_distribution_as_sklearn(trained):
    samples = training_samples()
    _, _, policy, _ = coach.fit_policy(samples)
    context = samples[0]["context"]
    artifact = json.loads(json.dumps(trained))
    probabilities = np.mean([tree_distribution(context, tree) for tree in artifact["trees"]], axis=0)

    np.testing.assert_allclose(probabilities, policy.predict_proba([context])[0], atol=1e-14)
    assert artifact["classes"] == policy.classes_.tolist()


def test_backend_can_recommend_without_observing_the_target_opening(trained):
    sample = {**training_samples()[0], "match_id": 999, "opening": None}
    model = {
        "version": VERSION,
        "map": "de_dust2",
        "training_match_ids": list(range(100, 108)),
        "sides": {"t": trained},
    }

    result = recommend_round(sample, model, map_name="de_dust2", exclude_match=999)

    assert result["available"] is True
    assert result["observed_pattern"] is None
    assert len(result["options"]) == 3
    assert all(option["rounds"] >= 20 for option in result["options"])


@pytest.mark.parametrize(
    "side,area,share,expected",
    [
        ("t", "a", 0.45, "A pressure"),
        ("t", "a", 0.44, "Default spread"),
        ("t", "other", 0.8, "Default spread"),
        ("ct", "mid", 0.6, "Mid-weighted defense"),
        ("ct", "a", 0.4, "Balanced hold"),
    ],
)
def test_pattern_names_use_the_15_second_snapshot_and_original_threshold(side, area, share, expected):
    profile = np.zeros(len(OPENING_FEATURES))
    profile[OPENING_FEATURES.index("b_5")] = 1
    profile[OPENING_FEATURES.index(f"{area}_15")] = share
    profile[OPENING_FEATURES.index("b_25")] = 1

    assert coach.pattern_name(profile, side) == expected
