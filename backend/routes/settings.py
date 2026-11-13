"""Account-scoped Steam history settings. Codes are write-only."""
import uuid
from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, ConfigDict
from backend.services import steam_history as history
from backend.jobs.demo_processing import _queue, job_state


class SteamConnection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    authentication_code: str
    share_code: str


def create_settings_router(require_viewer, db, require_steam):
    router = APIRouter(prefix="/api/settings/steam", tags=["settings"])

    @router.get("")
    async def get_settings(viewer=Depends(require_viewer), conn=Depends(db)):
        require_steam(viewer)
        sql = "SELECT status,message,imported,job_id,last_sync_at,updated_at<now()-interval '20 minutes' AS stale FROM steam_match_sync WHERE account_id=$1"
        row = await conn.fetchrow(sql, viewer["id"])
        if row and row["status"] in ("queued", "syncing"):
            terminal = await run_in_threadpool(job_state, row["job_id"]) in ("failed", "finished", "stopped", "canceled")
            if terminal or row["stale"]:
                async with conn.transaction():
                    if await conn.fetchval("SELECT pg_try_advisory_xact_lock(73024,$1)", viewer["id"]):
                        await conn.execute("UPDATE steam_match_sync SET status='error',message=$2 WHERE account_id=$1 AND job_id=$3 AND status IN ('queued','syncing')", viewer["id"], "การซิงก์หยุดก่อนเสร็จ กรุณาลองอีกครั้ง", row["job_id"])
                row = await conn.fetchrow(sql, viewer["id"])
        steam_id = await conn.fetchval("SELECT steam_id::text FROM accounts WHERE id=$1", viewer["id"])
        return {"steam_id": steam_id, "connected": row is not None, "service_ready": await run_in_threadpool(history.ready),
                "status": row["status"] if row else "disconnected", "message": row["message"] if row else None,
                "imported": row["imported"] if row else 0, "last_sync_at": row["last_sync_at"] if row else None}

    async def lock(conn, account):
        if not await conn.fetchval("SELECT pg_try_advisory_xact_lock(73024,$1)", account):
            raise HTTPException(409, "กำลังซิงก์แมตช์ กรุณารอให้เสร็จก่อน")
        row = await conn.fetchrow("SELECT status FROM steam_match_sync WHERE account_id=$1 FOR UPDATE", account)
        if row and row["status"] in ("queued", "syncing"):
            raise HTTPException(409, "กำลังซิงก์แมตช์ กรุณารอให้เสร็จก่อน")

    @router.put("")
    async def save(body: SteamConnection, viewer=Depends(require_viewer), conn=Depends(db)):
        require_steam(viewer)
        code, share = body.authentication_code.strip(), body.share_code.strip()
        if not history.AUTH_RE.fullmatch(code) or not history.SHARE_RE.fullmatch(share):
            raise HTTPException(400, "รูปแบบ Authentication Code หรือ Match Sharing Code ไม่ถูกต้อง")
        def encrypt_codes():
            key = history.cipher()
            return key.encrypt(code.encode()).decode(), key.encrypt(share.encode()).decode()
        encrypted, cursor = await run_in_threadpool(encrypt_codes)
        async with conn.transaction():
            await lock(conn, viewer["id"])
            await conn.execute("""INSERT INTO steam_match_sync(account_id,auth_cipher,cursor_code) VALUES($1,$2,$3)
              ON CONFLICT(account_id) DO UPDATE SET auth_cipher=$2,cursor_code=$3,seed_pending=TRUE,status='idle',message=NULL,job_id=NULL,updated_at=now()""", viewer["id"], encrypted, cursor)
        return {"saved": True}

    @router.delete("")
    async def disconnect(viewer=Depends(require_viewer), conn=Depends(db)):
        require_steam(viewer)
        async with conn.transaction():
            await lock(conn, viewer["id"])
            await conn.execute("DELETE FROM steam_match_sync WHERE account_id=$1", viewer["id"])
        return {"disconnected": True}

    @router.post("/sync", status_code=202)
    async def sync(viewer=Depends(require_viewer), conn=Depends(db)):
        require_steam(viewer)
        if not await run_in_threadpool(history.ready):
            raise HTTPException(503, "บริการนำเข้าแมตช์ Steam ยังไม่พร้อม กรุณาติดต่อผู้ดูแลระบบ")
        async with conn.transaction():
            await lock(conn, viewer["id"])
            row = await conn.fetchrow("SELECT last_attempt_at > now()-interval '1 minute' AS recent,status FROM steam_match_sync WHERE account_id=$1", viewer["id"])
            if not row:
                raise HTTPException(400, "บันทึกรหัสเชื่อมต่อก่อนซิงก์")
            if row["recent"]:
                raise HTTPException(429, "กรุณารอหนึ่งนาทีก่อนซิงก์อีกครั้ง")
            job_id = str(uuid.uuid4())
            await conn.execute("UPDATE steam_match_sync SET status='queued',message=NULL,imported=0,job_id=$2,updated_at=now(),last_attempt_at=now() WHERE account_id=$1", viewer["id"], job_id)
            try:
                await run_in_threadpool(lambda: _queue().enqueue("backend.jobs.steam_sync.sync_steam_history", viewer["id"], job_id, job_timeout=15*60, job_id=job_id, description="Steam history sync"))
            except Exception:
                raise HTTPException(503, "ส่งงานเข้าคิวไม่ได้ กรุณาลองอีกครั้ง") from None
        return {"status": "queued"}

    return router
