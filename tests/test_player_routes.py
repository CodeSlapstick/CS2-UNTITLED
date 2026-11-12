"""HTTP contracts for player routes while moving them out of application.py."""

import asyncio
from datetime import date

import httpx
import pytest

from backend.routes import application, players

STEAM_ID = "76561198000000001"
LINKED_ID = "76561198000000002"
STEAM = {"type": "steam", "id": 7, "guest_id": None}
GUEST = {"type": "guest", "id": None, "guest_id": "guest-session"}
PLAYER_REQUESTS = [
    ("GET", "/api/players/search?q=player"),
    ("POST", "/api/players/me/link"),
    ("GET", f"/api/players/{STEAM_ID}/profile"),
    ("GET", f"/api/players/{STEAM_ID}/summary"),
    ("GET", f"/api/players/{STEAM_ID}/matches"),
    ("GET", f"/api/players/{STEAM_ID}/maps"),
    ("GET", f"/api/players/{STEAM_ID}/weapons"),
]


class PlayerConnection:
    def __init__(self):
        self.calls = []
        self.account = {"steam_id": int(STEAM_ID), "linked_steam_id": None}
        self.has_data = True
        self.records = [{"result": "unchanged"}]

    async def fetchrow(self, sql, *args):
        self.calls.append((sql, args))
        if "FROM accounts a" in sql:
            return self.account
        return None

    async def fetchval(self, sql, *args):
        self.calls.append((sql, args))
        assert "EXISTS" in sql
        return self.has_data

    async def fetch(self, sql, *args):
        self.calls.append((sql, args))
        return self.records

    async def execute(self, sql, *args):
        self.calls.append((sql, args))
        return "INSERT 0 1"


def request(method, path, conn, *, viewer=STEAM, payload=None):
    async def run():
        previous = application.app.dependency_overrides.copy()
        application.app.dependency_overrides[application.db] = lambda: conn
        if viewer is not None:
            application.app.dependency_overrides[application.require_viewer] = lambda: viewer
        try:
            transport = httpx.ASGITransport(app=application.app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                return await client.request(method, path, json=payload)
        finally:
            application.app.dependency_overrides.clear()
            application.app.dependency_overrides.update(previous)

    return asyncio.run(run())


@pytest.mark.parametrize("method,path", PLAYER_REQUESTS)
@pytest.mark.parametrize("viewer,status", [(None, 401), (GUEST, 403)])
def test_player_routes_require_steam_before_querying(method, path, viewer, status):
    conn = PlayerConnection()
    response = request(method, path, conn, viewer=viewer, payload={"steam_id": STEAM_ID})

    assert response.status_code == status
    assert conn.calls == []


@pytest.mark.parametrize("endpoint,limit", [("matches", 20), ("maps", None), ("weapons", 8)])
def test_player_collections_preserve_response_and_query_arguments(endpoint, limit):
    conn = PlayerConnection()
    response = request("GET", f"/api/players/{STEAM_ID}/{endpoint}", conn)

    assert response.status_code == 200
    assert response.json() == conn.records
    assert conn.calls[-1][1] == ((int(STEAM_ID), limit) if limit else (int(STEAM_ID),))


@pytest.mark.parametrize("endpoint", ["profile", "summary", "matches", "maps", "weapons"])
def test_player_routes_reject_invalid_identity(endpoint):
    conn = PlayerConnection()
    response = request("GET", f"/api/players/invalid/{endpoint}", conn)

    assert response.status_code == 400
    assert conn.calls == []


@pytest.mark.parametrize(
    "query,status",
    [
        ("recent=3", 400),
        ("date_from=2026-02-02&date_to=2026-01-01", 400),
        ("side=invalid", 422),
        ("recent=21", 422),
    ],
)
def test_profile_rejects_invalid_filters_before_querying(query, status):
    conn = PlayerConnection()
    response = request("GET", f"/api/players/{STEAM_ID}/profile?{query}", conn)

    assert response.status_code == status
    assert conn.calls == []


def test_profile_passes_all_filters_to_service(monkeypatch):
    calls = []

    async def profile(conn, steam_id, **filters):
        calls.append((steam_id, filters))
        return {"player": {"steam_id": str(steam_id)}}

    monkeypatch.setattr(players, "build_profile", profile)
    response = request(
        "GET",
        f"/api/players/{STEAM_ID}/profile?recent=5&date_from=2026-01-01&date_to=2026-02-01&map=de_mirage&side=ct",
        PlayerConnection(),
    )

    assert response.status_code == 200
    assert response.json() == {"player": {"steam_id": STEAM_ID}}
    assert calls == [
        (
            int(STEAM_ID),
            {
                "recent": 5,
                "date_from": date(2026, 1, 1),
                "date_to": date(2026, 2, 1),
                "map_name": "de_mirage",
                "side": "ct",
            },
        )
    ]


def test_search_trims_query_and_preserves_results():
    conn = PlayerConnection()
    conn.records = [{"steam_id": int(STEAM_ID), "name": "Player", "total": 1}]
    response = request("GET", "/api/players/search?q=%20Player%20&limit=3", conn)

    assert response.status_code == 200
    assert response.json() == {
        "items": [{"steam_id": STEAM_ID, "name": "Player"}],
        "total": 1,
        "has_players": True,
    }
    assert conn.calls[0][1] == ("Player", "Player", 3)


def test_profile_returns_404_when_service_has_no_player(monkeypatch):
    async def no_profile(*args, **kwargs):
        return None

    monkeypatch.setattr(players, "build_profile", no_profile)
    response = request("GET", f"/api/players/{STEAM_ID}/profile", PlayerConnection())

    assert response.status_code == 404


def test_summary_returns_404_for_missing_player():
    response = request("GET", f"/api/players/{STEAM_ID}/summary", PlayerConnection())

    assert response.status_code == 404


@pytest.mark.parametrize("linked", [False, True])
def test_me_resolves_own_or_confirmed_linked_identity(linked):
    conn = PlayerConnection()
    if linked:
        conn.account["linked_steam_id"] = int(LINKED_ID)
        conn.has_data = False
    response = request("GET", "/api/players/me/matches", conn)

    assert response.status_code == 200
    assert conn.calls[-1][1] == (int(LINKED_ID if linked else STEAM_ID), 20)


@pytest.mark.parametrize("missing_account", [False, True])
def test_me_requires_account_and_available_player_data(missing_account):
    conn = PlayerConnection()
    conn.has_data = False
    if missing_account:
        conn.account = None
    response = request("GET", "/api/players/me/matches", conn)

    assert response.status_code == 409
    assert not any("player_match_results" in sql for sql, _ in conn.calls)


@pytest.mark.parametrize(
    "steam_id,has_data,status",
    [
        ("invalid", True, 400),
        (STEAM_ID, False, 404),
        (STEAM_ID, True, 200),
    ],
)
def test_link_validates_player_and_writes_only_confirmed_identity(steam_id, has_data, status):
    conn = PlayerConnection()
    conn.has_data = has_data
    response = request("POST", "/api/players/me/link", conn, payload={"steam_id": steam_id})

    assert response.status_code == status
    writes = [(sql, args) for sql, args in conn.calls if "INSERT INTO" in sql]
    if status == 200:
        assert response.json() == {"ok": True, "steam_id": STEAM_ID}
        assert len(writes) == 1
        assert writes[0][1] == (STEAM["id"], int(STEAM_ID))
    else:
        assert writes == []
