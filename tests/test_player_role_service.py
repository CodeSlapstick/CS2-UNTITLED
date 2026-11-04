import json

from backend.services.player_roles import build_match_profiles, infer_match, load_role_model


def _model(minimum_rounds: int = 2) -> dict:
    side = {
        "features": ["opening_attempt_rate"],
        "preprocess": {
            "median": {"opening_attempt_rate": 0.0},
            "mean": {"opening_attempt_rate": 0.0},
            "scale": {"opening_attempt_rate": 1.0},
        },
        "clusters": [
            {
                "id": 1,
                "role": "Entry",
                "role_name_status": "supported",
                "center_z": {"opening_attempt_rate": 0.5},
            },
            {
                "id": 2,
                "role": "Support",
                "role_name_status": "supported",
                "center_z": {"opening_attempt_rate": 0.0},
            },
        ],
    }
    return {
        "unit": "player-match-side",
        "min_rounds_per_profile": minimum_rounds,
        "models": {"t": side, "ct": side},
    }


def test_build_profiles_ignores_incomplete_kill_rows() -> None:
    rounds = [
        {"steam_id": 1, "name": "A", "side": "t", "round_num": 1},
        {"steam_id": 2, "name": "B", "side": "ct", "round_num": 1},
    ]
    incomplete_kill = {
        "round_num": 1,
        "start_tick": 100,
        "tick": 200,
        "attacker_id": 1,
        "victim_id": None,
        "attacker_side": "t",
        "victim_side": "ct",
    }

    profiles = build_match_profiles(rounds, [incomplete_kill], 128)

    assert len(profiles) == 2
    assert all(profile["kills"] == 0 for profile in profiles)


def test_inference_marks_short_profiles_unavailable() -> None:
    profile = {"steamid": "1", "name": "A", "side": "t", "rounds": 1,
               "opening_attempt_rate": 0.5}

    result = infer_match([profile], _model())[0]

    assert result == {
        "steamid": "1",
        "name": "A",
        "side": "t",
        "rounds": 1,
        "available": False,
        "reason": "insufficient_rounds",
        "minimum_rounds": 2,
    }


def test_load_model_rejects_incomplete_artifact(tmp_path) -> None:
    path = tmp_path / "player_role.json"
    path.write_text(json.dumps({"unit": "player-match-side", "models": {"t": {}}}), encoding="utf-8")

    assert load_role_model(str(path)) is None
