import asyncio

import pytest
from fastapi import HTTPException

from backend.app import _safe_next, can_modify_match, require_match_access, require_replace_access
from backend.repositories.reports import ReportRepository
from backend.services import auth


def steam(account_id: int) -> dict:
    return {"type": auth.STEAM, "id": account_id, "guest_id": None}


def guest() -> dict:
    return {"type": auth.GUEST, "id": None, "guest_id": "guest-session"}


def test_only_steam_owner_can_modify_match() -> None:
    match = {"uploaded_by": 7, "uploader_guest": None}

    assert can_modify_match(match, steam(7)) is True
    assert can_modify_match(match, steam(8)) is False
    assert can_modify_match(match, guest()) is False


def test_replace_requires_owner_and_idle_match() -> None:
    match = {"source": "upload", "status": "done", "uploaded_by": 7, "uploader_guest": None}
    require_replace_access(match, steam(7))

    with pytest.raises(HTTPException) as other_user:
        require_replace_access(match, steam(8))
    assert other_user.value.status_code == 403

    with pytest.raises(HTTPException) as busy:
        require_replace_access({**match, "status": "parsing"}, steam(7))
    assert busy.value.status_code == 409


class FakeConnection:
    async def fetchval(self, query: str, *args):
        if "ORDER BY id LIMIT 1" in query:
            return "sample.dem"
        if "WHERE id = $1" in query:
            return {1: "sample.dem", 2: "private.dem"}.get(args[0])
        return None


def test_guest_can_access_only_sample_match() -> None:
    conn = FakeConnection()

    assert asyncio.run(require_match_access(conn, guest(), match_id=1)) == "sample.dem"
    with pytest.raises(HTTPException) as exc:
        asyncio.run(require_match_access(conn, guest(), match_id=2))
    assert exc.value.status_code == 403


def test_steam_viewer_is_not_limited_to_sample_match() -> None:
    assert asyncio.run(require_match_access(FakeConnection(), steam(7), match_id=2)) is None


def test_safe_next_rejects_backslash_and_control_characters() -> None:
    assert _safe_next("/matches/1") == "/matches/1"
    assert _safe_next("/\\example.com") == "/player"
    assert _safe_next("/matches\n/1") == "/player"


class ReportConnection:
    def __init__(self) -> None:
        self.fetchrow_calls = 0

    async def fetchrow(self, query: str, *args):
        self.fetchrow_calls += 1
        if self.fetchrow_calls > 1:
            raise AssertionError("guest report must not query cross-match benchmarks")
        return {"id": 1, "demo_file": "sample.dem", "map_name": "de_mirage"}

    async def fetch(self, query: str, *args):
        return []


def test_guest_report_skips_cross_match_benchmark() -> None:
    conn = ReportConnection()
    result = asyncio.run(ReportRepository(conn, include_benchmark=False).load(1, "all"))

    assert result["benchmark"] == {}
    assert conn.fetchrow_calls == 1
