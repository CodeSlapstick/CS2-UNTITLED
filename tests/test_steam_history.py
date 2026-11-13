import asyncio
import bz2
import io
import urllib.error
from pathlib import Path
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from backend.services import steam_history as h
from backend.routes.settings import create_settings_router

CODE = "ABCD-ABCDE-ABCD"
SHARE = "CSGO-AAAAA-BBBBB-CCCCC-DDDDD-EEEEE"


def test_encryption_survives_restart_without_returning_plaintext(tmp_path, monkeypatch):
    monkeypatch.setenv("STEAM_SYNC_KEY_FILE", str(tmp_path / "key"))
    token = h.cipher().encrypt(CODE.encode())
    assert CODE.encode() not in token
    assert h.cipher().decrypt(token).decode() == CODE


@pytest.mark.parametrize("url", ["file:///tmp/a", "http://127.0.0.1/730/a.dem.bz2", "http://replay1.valve.net.evil.com/730/a.dem.bz2", "http://replay1.valve.net:8080/730/a.dem.bz2", "http://user@replay1.valve.net/730/a.dem.bz2", "https://replay1.valve.net/other/a.dem.bz2", "http://replay1.valve.net/730/a.dem.bz2?url=x"])
def test_replay_url_allowlist(url):
    with pytest.raises(h.HistoryError):
        h.validate_replay_url(url)


def test_bounded_download_and_incomplete_cleanup(tmp_path, monkeypatch):
    class Response(io.BytesIO):
        pass
    class Opener:
        def open(self, *args, **kwargs):
            return Response(payload)
    monkeypatch.setattr(h.urllib.request, "build_opener", lambda *_: Opener())
    url = "http://replay1.valve.net/730/1_2.dem.bz2"
    payload = bz2.compress(b"PBDEMS2\x00" + b"data" * 10)
    path = tmp_path / "valid.dem"
    assert h.download_demo(url, path, 1000) == 48
    assert path.read_bytes().startswith(b"PBDEMS2\x00")
    payload = bz2.compress(b"PBDEMS2\x00" + b"A" * 10000)
    with pytest.raises(h.HistoryError):
        h.download_demo(url, tmp_path / "bomb.dem", 1000)
    assert not (tmp_path / "bomb.dem").exists()
    payload = bz2.compress(b"PBDEMS2\x00" + b"B" * 30)[:-4]
    with pytest.raises(h.HistoryError):
        h.download_demo(url, tmp_path / "partial.dem", 1000)
    assert not (tmp_path / "partial.dem").exists()


def test_web_api_no_new_and_secret_error_redaction(monkeypatch):
    monkeypatch.setenv("STEAM_API_KEY", "private-api-key")
    class Response(io.BytesIO):
        status = 202
    monkeypatch.setattr(h.urllib.request, "urlopen", lambda *a, **k: Response(b""))
    assert h.next_code("123", CODE, SHARE) is None
    def fail(*args, **kwargs):
        raise urllib.error.HTTPError("url-with-secret", 403, "secret", {}, None)
    monkeypatch.setattr(h.urllib.request, "urlopen", fail)
    with pytest.raises(h.HistoryError) as exc:
        h.next_code("123", CODE, SHARE)
    assert "secret" not in str(exc.value)


class Tx:
    async def __aenter__(self): return self
    async def __aexit__(self, *_): pass


class SettingsDB:
    def __init__(self): self.rows = {}
    def transaction(self): return Tx()
    async def fetchval(self, sql, *args):
        return True if "advisory" in sql else "76561198000000001"
    async def fetchrow(self, sql, account): return self.rows.get(account)
    async def execute(self, sql, *args):
        if sql.startswith("INSERT"):
            self.rows[args[0]] = {"auth_cipher": args[1], "cursor_code": args[2], "status": "idle", "message": None, "imported": 0, "job_id": None, "last_sync_at": None, "stale": False, "recent": False}
        elif sql.startswith("DELETE"):
            self.rows.pop(args[0], None)
        elif "status='error'" in sql:
            self.rows[args[0]]["status"] = "error"


def settings_client(monkeypatch, tmp_path):
    db = SettingsDB()
    viewer = {"type": "steam", "id": 7}
    async def who(): return viewer
    async def connection(): return db
    def require(v):
        if v["type"] != "steam": raise HTTPException(403)
    monkeypatch.setenv("STEAM_SYNC_KEY_FILE", str(tmp_path / "key"))
    monkeypatch.setattr(h, "ready", lambda: False)
    app = FastAPI(); app.include_router(create_settings_router(who, connection, require))
    return TestClient(app), db, viewer


def test_settings_are_account_scoped_write_only_and_disconnect(monkeypatch, tmp_path):
    client, db, viewer = settings_client(monkeypatch, tmp_path)
    assert client.put("/api/settings/steam", json={"authentication_code": CODE, "share_code": SHARE}).status_code == 200
    assert db.rows[7]["auth_cipher"] != CODE
    response = client.get("/api/settings/steam")
    assert response.json()["connected"]
    assert CODE not in response.text and SHARE not in response.text and "auth_cipher" not in response.text
    viewer["id"] = 8
    assert not client.get("/api/settings/steam").json()["connected"]
    assert client.delete("/api/settings/steam").status_code == 200
    assert 7 in db.rows
    viewer["id"] = 7
    assert client.post("/api/settings/steam/sync").status_code == 503
    assert client.delete("/api/settings/steam").status_code == 200
    assert not db.rows


def test_guests_validation_and_active_job_protection(monkeypatch, tmp_path):
    client, db, viewer = settings_client(monkeypatch, tmp_path)
    body = {"authentication_code": CODE, "share_code": SHARE}
    assert client.put("/api/settings/steam", json={**body, "account_id": 8}).status_code == 422
    assert client.put("/api/settings/steam", json={**body, "share_code": "bad"}).status_code == 400
    client.put("/api/settings/steam", json=body)
    db.rows[7]["status"] = "syncing"
    assert client.put("/api/settings/steam", json=body).status_code == 409
    assert client.delete("/api/settings/steam").status_code == 409
    viewer["type"] = "guest"
    for method, path, kwargs in [("get", "", {}), ("put", "", {"json": body}), ("delete", "", {}), ("post", "/sync", {})]:
        assert getattr(client, method)("/api/settings/steam" + path, **kwargs).status_code == 403


def test_sync_cursor_only_advances_after_success(monkeypatch, tmp_path):
    from backend.jobs import steam_sync as job
    monkeypatch.setenv("STEAM_SYNC_KEY_FILE", str(tmp_path / "key"))
    encrypted = h.cipher().encrypt(CODE.encode()).decode()
    encrypted_cursor = h.cipher().encrypt(SHARE.encode()).decode()
    class DB:
        def __init__(self): self.executions = []
        def transaction(self): return Tx()
        async def execute(self, sql, *args): self.executions.append((sql, args))
        async def fetchrow(self, sql, *args):
            if "steam_match_sync" in sql: return {"auth_cipher": encrypted, "cursor_code": encrypted_cursor, "seed_pending": True, "steam_id": "76561197960265729"}
            return None
        async def fetchval(self, sql, *args): return 0 if "count(*)" in sql else 42
        async def close(self): pass
    db = DB()
    monkeypatch.setattr(job.asyncpg, "connect", AsyncMock(return_value=db))
    monkeypatch.setattr(job, "DEMOS_DIR", tmp_path / "demos")
    monkeypatch.setattr(h, "next_code", lambda *args: None)
    monkeypatch.setattr(h, "gc_request", lambda *args: {"match_id": "123", "demo_url": "url", "account_ids": [1]})
    monkeypatch.setattr(job, "enqueue_parse", lambda _: "job")
    def download(url, path, limit): Path(path).write_bytes(b"PBDEMS2\x00")
    monkeypatch.setattr(h, "download_demo", download)
    asyncio.run(job._sync(7))
    assert any("cursor_code=$2" in sql for sql, _ in db.executions)
    assert (tmp_path / "demos/steam_76561197960265729_123.dem").exists()
    db.executions.clear()
    def fail(*args): raise h.HistoryError("Download failed")
    monkeypatch.setattr(h, "download_demo", fail)
    asyncio.run(job._sync(7))
    assert not any("cursor_code=$2" in sql for sql, _ in db.executions)
    assert any("status='error'" in sql for sql, _ in db.executions)


def test_atomic_key_initialization(tmp_path, monkeypatch):
    from concurrent.futures import ThreadPoolExecutor
    monkeypatch.setenv("STEAM_SYNC_KEY_FILE", str(tmp_path / "key"))
    with ThreadPoolExecutor(max_workers=16) as pool:
        tokens = list(pool.map(lambda _: h.cipher().encrypt(b"value"), range(32)))
    assert all(h.cipher().decrypt(token) == b"value" for token in tokens)
    assert list(tmp_path.iterdir()) == [tmp_path / "key"]


def test_orphaned_sync_recovery(monkeypatch, tmp_path):
    from backend.routes import settings
    client, db, viewer = settings_client(monkeypatch, tmp_path)
    client.put("/api/settings/steam", json={"authentication_code": CODE, "share_code": SHARE})
    row = db.rows[7]; row.update(status="queued", job_id="missing", stale=True)
    monkeypatch.setattr(settings, "job_state", lambda _: None)
    assert client.get("/api/settings/steam").json()["status"] == "error"
    assert client.delete("/api/settings/steam").status_code == 200


def test_retry_enqueue_failure_is_recoverable(monkeypatch):
    from backend.jobs import steam_sync as job
    class DB:
        status = "error"
        async def execute(self, sql, *args):
            if "SET status='queued'" in sql: self.status = "queued"
            if "SET status='error'" in sql: self.status = "error"
        async def fetchrow(self, *args): return {"id": 1, "status": self.status, "uploaded_by": 7, "source": "upload"}
    db = DB()
    def fail(_): raise OSError("Redis down")
    monkeypatch.setattr(job, "enqueue_parse", fail)
    with pytest.raises(h.HistoryError): asyncio.run(job._import_match(db, 7, "123", "456", "url"))
    assert db.status == "error"
    monkeypatch.setattr(job, "enqueue_parse", lambda _: "retry")
    assert asyncio.run(job._import_match(db, 7, "123", "456", "url")) == 1
    assert db.status == "queued"
    with pytest.raises(h.HistoryError): asyncio.run(job._import_match(db, 8, "123", "456", "url"))


def test_file_publication_rolls_back_on_commit_failure(monkeypatch, tmp_path):
    from backend.jobs import steam_sync as job
    class FailCommit(Tx):
        async def __aexit__(self, *_): raise OSError("Commit failed")
    class DB:
        def transaction(self): return FailCommit()
        async def execute(self, *args): pass
        async def fetchrow(self, *args): return None
        async def fetchval(self, sql, *args): return 0 if "count(*)" in sql else 42
    monkeypatch.setattr(job, "DEMOS_DIR", tmp_path)
    original = tmp_path / "steam_123_456.dem"; original.write_bytes(b"original orphan")
    monkeypatch.setattr(h, "download_demo", lambda url, path, limit: Path(path).write_bytes(b"new file"))
    with pytest.raises(OSError): asyncio.run(job._import_match(DB(), 7, "123", "456", "url"))
    assert original.read_bytes() == b"original orphan"
    assert not list(tmp_path.glob("*.download"))
