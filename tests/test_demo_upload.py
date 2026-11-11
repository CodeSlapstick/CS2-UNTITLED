"""Upload contract: new matches only, complete files, and explicit queue failures."""

import asyncio
import copy
from contextlib import asynccontextmanager
from io import BytesIO
from unittest.mock import Mock

import asyncpg
import httpx
import pytest
from fastapi import UploadFile

from backend.routes import application as routes
from backend.services import auth

STEAM = {"type": auth.STEAM, "id": 7, "guest_id": None}
DEMO = routes.DEMO_MAGIC + b"test demo bytes"


class UploadConnection:
    """Only the matches operations used by this endpoint; real files are not mocked."""

    def __init__(self):
        self.match = None
        self.conflict_on_insert = False
        self.insert_error = None
        self.commit_error = None
        self.upload_count = 0
        self.calls = []

    @asynccontextmanager
    async def transaction(self):
        previous = copy.deepcopy(self.match)
        try:
            yield
            if self.commit_error:
                raise self.commit_error
        except Exception:
            self.match = previous
            raise

    async def fetchrow(self, query, *args):
        self.calls.append((query, args))
        return self.match

    async def fetchval(self, query, *args):
        self.calls.append((query, args))
        if "count(*)" in query:
            return self.upload_count
        if self.insert_error:
            raise self.insert_error
        if self.conflict_on_insert:
            if "ON CONFLICT (demo_file) DO NOTHING" in query:
                return None
            raise asyncpg.UniqueViolationError("matches_demo_file_key")
        self.match = {
            "id": 42, "demo_file": args[0], "status": "queued", "source": "upload",
            "uploaded_by": args[1], "uploader_type": args[2], "uploader_guest": args[3],
        }
        return 42

    async def execute(self, query, *args):
        self.calls.append((query, args))
        if "pg_advisory_" in query:
            return "SELECT 1"
        assert self.match is not None
        if "status = 'error'" in query:
            self.match.update(status="error", error_message=args[1])
        elif "job_id = $2" in query:
            self.match["job_id"] = args[1]
        return "UPDATE 1"


@pytest.fixture
def upload_env(tmp_path, monkeypatch):
    conn = UploadConnection()
    enqueue = Mock(return_value="job-42")
    monkeypatch.setattr(routes, "DEMOS_DIR", tmp_path)
    monkeypatch.setattr(routes, "enqueue_parse", enqueue)
    return conn, enqueue, tmp_path


def upload(conn, *, name="match.dem", content=DEMO, viewer=None, force=None):
    """Send real multipart HTTP to the application; bypass only auth and the DB pool."""
    async def request():
        routes.app.dependency_overrides[routes.require_viewer] = lambda: viewer or STEAM
        routes.app.dependency_overrides[routes.db] = lambda: conn
        try:
            transport = httpx.ASGITransport(app=routes.app, raise_app_exceptions=False)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                data = {} if force is None else {"force": force}
                return await client.post("/api/demos", files={"file": (name, content)}, data=data)
        finally:
            routes.app.dependency_overrides.clear()

    return asyncio.run(request())


def test_new_upload_publishes_complete_file_before_enqueue(upload_env):
    conn, enqueue, directory = upload_env

    def queue(match_id):
        assert match_id == 42
        assert conn.match["status"] == "queued"
        assert (directory / "match.dem").read_bytes() == DEMO
        assert list(directory.iterdir()) == [directory / "match.dem"]
        return "job-42"

    enqueue.side_effect = queue
    response = upload(conn)

    assert response.status_code == 202
    assert response.json() == {
        "match_id": 42, "demo_file": "match.dem", "size_mb": 0.0,
        "status": "queued", "job_id": "job-42", "status_url": "/api/matches/42/status",
    }
    assert conn.match["uploaded_by"] == 7
    assert conn.match["job_id"] == "job-42"
    enqueue.assert_called_once_with(42)


@pytest.mark.parametrize("status", ["queued", "parsing", "done", "error"])
@pytest.mark.parametrize("force", [None, "1"])
def test_duplicate_never_changes_existing_match_or_file(upload_env, status, force):
    conn, enqueue, directory = upload_env
    conn.match = {
        "id": 9, "demo_file": "match.dem", "status": status, "source": "upload",
        "uploaded_by": 7, "uploader_guest": None, "error_message": "previous error",
    }
    previous = conn.match.copy()
    (directory / "match.dem").write_bytes(b"original file")

    response = upload(conn, force=force)

    assert response.status_code == 409
    assert conn.match == previous
    assert (directory / "match.dem").read_bytes() == b"original file"
    assert len(list(directory.iterdir())) == 1
    enqueue.assert_not_called()


@pytest.mark.parametrize("source, owner", [("reference", None), ("upload", 8)])
def test_duplicate_reference_or_other_owner_also_returns_409(upload_env, source, owner):
    conn, enqueue, directory = upload_env
    conn.match = {"id": 9, "status": "error", "source": source, "uploaded_by": owner}

    assert upload(conn).status_code == 409
    assert list(directory.iterdir()) == []
    enqueue.assert_not_called()


def test_race_lost_at_insert_does_not_publish_staged_file(upload_env):
    conn, enqueue, directory = upload_env
    conn.conflict_on_insert = True
    (directory / "match.dem").write_bytes(b"concurrent winner")

    assert upload(conn).status_code == 409
    assert (directory / "match.dem").read_bytes() == b"concurrent winner"
    assert list(directory.iterdir()) == [directory / "match.dem"]
    enqueue.assert_not_called()


def test_orphan_file_is_preserved_in_backup_and_new_upload_is_queued(upload_env):
    conn, enqueue, directory = upload_env
    (directory / "match.dem").write_bytes(b"orphaned original")

    assert upload(conn).status_code == 202
    assert conn.match["status"] == "queued"
    assert (directory / "match.dem").read_bytes() == DEMO
    backups = list((directory / ".orphaned").iterdir())
    assert len(backups) == 1
    assert backups[0].read_bytes() == b"orphaned original"
    enqueue.assert_called_once_with(42)


def test_invalid_upload_does_not_move_orphan_file(upload_env):
    conn, enqueue, directory = upload_env
    (directory / "match.dem").write_bytes(b"orphaned original")

    assert upload(conn, content=b"invalid").status_code == 400
    assert conn.match is None
    assert (directory / "match.dem").read_bytes() == b"orphaned original"
    assert not (directory / ".orphaned").exists()
    enqueue.assert_not_called()


@pytest.mark.parametrize("failure", ["commit", "publish"])
def test_failed_upload_restores_orphan_file(upload_env, monkeypatch, failure):
    conn, enqueue, directory = upload_env
    (directory / "match.dem").write_bytes(b"orphaned original")
    if failure == "commit":
        conn.commit_error = RuntimeError("commit failed")
    else:
        original_replace = type(directory).replace

        def fail_publish(path, target):
            if path.suffix == ".upload":
                raise OSError("disk unavailable")
            return original_replace(path, target)

        monkeypatch.setattr(type(directory), "replace", fail_publish)

    assert upload(conn).status_code == 500
    assert conn.match is None
    assert (directory / "match.dem").read_bytes() == b"orphaned original"
    assert list((directory / ".orphaned").iterdir()) == []
    assert not list(directory.glob("*.upload"))
    enqueue.assert_not_called()


def test_rollback_finishes_before_another_same_name_upload_can_publish(tmp_path, monkeypatch):
    async def run():
        lock = asyncio.Lock()
        rolled_back = asyncio.Event()
        second_waiting = asyncio.Event()

        class OverlapConnection(UploadConnection):
            @asynccontextmanager
            async def transaction(self):
                try:
                    async with super().transaction():
                        yield
                except Exception:
                    if self.commit_error:
                        rolled_back.set()
                        await second_waiting.wait()
                    raise

            async def execute(self, query, *args):
                if "pg_advisory_lock(" in query:
                    if lock.locked():
                        second_waiting.set()
                    await lock.acquire()
                    return "SELECT 1"
                if "pg_advisory_unlock(" in query:
                    lock.release()
                    return "SELECT 1"
                return await super().execute(query, *args)

        first, second = OverlapConnection(), OverlapConnection()
        first.commit_error = RuntimeError("commit failed")
        (tmp_path / "match.dem").write_bytes(b"original orphan")
        monkeypatch.setattr(routes, "DEMOS_DIR", tmp_path)
        enqueue = Mock(return_value="job-42")
        monkeypatch.setattr(routes, "enqueue_parse", enqueue)

        async def request(conn, content):
            return await routes.api_upload_demo(
                file=UploadFile(file=BytesIO(content), filename="match.dem"), viewer=STEAM, conn=conn,
            )

        async def second_request():
            await rolled_back.wait()
            return await request(second, DEMO + b" second upload")

        results = await asyncio.wait_for(asyncio.gather(
            request(first, DEMO), second_request(), return_exceptions=True,
        ), timeout=10)
        assert isinstance(results[0], RuntimeError)
        assert results[1].status_code == 202
        assert first.match is None
        assert second.match["status"] == "queued"
        assert (tmp_path / "match.dem").read_bytes() == DEMO + b" second upload"
        backups = list((tmp_path / ".orphaned").iterdir())
        assert len(backups) == 1
        assert backups[0].read_bytes() == b"original orphan"
        assert not lock.locked()
        enqueue.assert_called_once_with(42)

    asyncio.run(run())


def test_queue_failure_marks_error_and_keeps_uploaded_demo(upload_env):
    conn, enqueue, directory = upload_env
    enqueue.side_effect = routes.QueueUnavailable("queue offline")

    assert upload(conn).status_code == 503
    assert conn.match["status"] == "error"
    assert conn.match["error_message"] == "queue offline"
    assert (directory / "match.dem").read_bytes() == DEMO
    assert list(directory.iterdir()) == [directory / "match.dem"]
    assert upload(conn).status_code == 409
    enqueue.assert_called_once()


@pytest.mark.parametrize("content, expected", [(b"", 400), (b"not a CS2 demo", 400)])
def test_invalid_content_leaves_no_match_or_temporary_file(upload_env, content, expected):
    conn, enqueue, directory = upload_env
    assert upload(conn, content=content).status_code == expected
    assert conn.match is None
    assert list(directory.iterdir()) == []
    enqueue.assert_not_called()


def test_upload_limit_still_rejects_large_files(upload_env, monkeypatch):
    conn, enqueue, directory = upload_env
    monkeypatch.setattr(routes, "MAX_DEMO_MB", 0)
    assert upload(conn).status_code == 413
    assert conn.match is None
    assert list(directory.iterdir()) == []
    enqueue.assert_not_called()


def test_guest_cannot_upload(upload_env):
    conn, enqueue, directory = upload_env
    viewer = {"type": auth.GUEST, "id": None, "guest_id": "guest"}
    assert upload(conn, viewer=viewer).status_code == 403
    assert conn.calls == []
    assert list(directory.iterdir()) == []
    enqueue.assert_not_called()


def test_bad_filename_and_quota_are_checked_before_saving(upload_env):
    conn, enqueue, directory = upload_env
    assert upload(conn, name="invalid.txt").status_code == 400
    conn.upload_count = routes.UPLOAD_MAX_PER_HOUR
    assert upload(conn).status_code == 429
    assert conn.match is None
    assert list(directory.iterdir()) == []
    enqueue.assert_not_called()


def test_database_failure_removes_staged_file(upload_env):
    conn, enqueue, directory = upload_env
    conn.insert_error = RuntimeError("database offline")
    assert upload(conn).status_code == 500
    assert list(directory.iterdir()) == []
    enqueue.assert_not_called()


def test_commit_failure_removes_only_the_newly_published_file(upload_env):
    conn, enqueue, directory = upload_env
    conn.commit_error = RuntimeError("commit failed")
    assert upload(conn).status_code == 500
    assert conn.match is None
    assert list(directory.iterdir()) == []
    enqueue.assert_not_called()


def test_upload_api_no_longer_advertises_force():
    schema = routes.app.openapi()
    body = schema["paths"]["/api/demos"]["post"]["requestBody"]["content"]["multipart/form-data"]["schema"]
    properties = schema["components"]["schemas"][body["$ref"].split("/")[-1]]["properties"]
    assert set(properties) == {"file"}


def test_atomic_publish_failure_rolls_back_match_and_removes_staged_file(upload_env, monkeypatch):
    conn, enqueue, directory = upload_env
    original_replace = type(directory).replace

    def fail_publish(path, target):
        if path.suffix == ".upload":
            raise OSError("disk unavailable")
        return original_replace(path, target)

    monkeypatch.setattr(type(directory), "replace", fail_publish)
    assert upload(conn).status_code == 500
    assert conn.match is None
    assert list(directory.iterdir()) == []
    enqueue.assert_not_called()


def test_save_upload_does_not_publish_partial_content(tmp_path):
    class InterruptedStream(BytesIO):
        def read(self, size=-1):
            if self.tell():
                raise OSError("upload interrupted")
            return super().read(size)

    staged = tmp_path / ".match.dem.token.upload"
    with pytest.raises(OSError, match="upload interrupted"):
        routes.save_upload(UploadFile(file=InterruptedStream(DEMO), filename="match.dem"), staged)
    assert list(tmp_path.iterdir()) == []
