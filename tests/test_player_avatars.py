import asyncio

import pytest

from backend.routes.application import api_match_avatars
from backend.services import player_avatars


def test_avatar_cache_uses_stored_values_and_caches_unavailable_profiles(monkeypatch):
    player_avatars._steam_avatar.cache_clear()
    calls = []

    def persona(sid):
        calls.append(sid)
        return {"avatar": "https://avatars.steamstatic.com/new.jpg" if sid == "2" else None}

    monkeypatch.setattr(player_avatars.auth, "steam_persona", persona)

    class Connection:
        def __init__(self):
            self.updates = []

        async def fetch(self, sql, match_id):
            assert match_id == 7
            return [{"steam_id": "1", "avatar": "cached.jpg"}, {"steam_id": "2", "avatar": None}, {"steam_id": "3", "avatar": None}]

        async def execute(self, sql, sid, avatar):
            self.updates.append((sid, avatar))

    conn = Connection()
    first = asyncio.run(player_avatars.match_avatars(conn, 7))
    second = asyncio.run(player_avatars.match_avatars(conn, 7))
    assert first == second == {"1": "cached.jpg", "2": "https://avatars.steamstatic.com/new.jpg", "3": None}
    assert sorted(calls) == ["2", "3"]
    assert conn.updates[0] == (2, first["2"])
    player_avatars._steam_avatar.cache_clear()


def test_avatar_endpoint_checks_guest_access_before_loading_profiles(monkeypatch):
    from fastapi import HTTPException

    class Connection:
        async def fetchval(self, sql, *args):
            return "sample.dem" if "ORDER BY id" in sql else "private.dem"

    async def forbidden(*args):
        raise AssertionError("Avatar lookup ran for a forbidden match")

    monkeypatch.setattr("backend.routes.application.match_avatars", forbidden)
    with pytest.raises(HTTPException) as err:
        asyncio.run(api_match_avatars(2, {"type": "guest", "guest_id": "test"}, Connection()))
    assert err.value.status_code == 403
