import asyncio
import os
import secrets
import asyncpg
from backend.config.database import DATABASE_URL
from backend.config.settings import DEMOS_DIR
from backend.jobs import enqueue_parse
from backend.services import steam_history as history


def sync_steam_history(account_id, expected_job_id):
    asyncio.run(_sync(account_id, expected_job_id))


async def _sync(account_id, expected_job_id=None):
    conn = await asyncpg.connect(DATABASE_URL)
    locked = False
    imported = 0
    try:
        await conn.execute("SELECT pg_advisory_lock(73024,$1)", account_id)
        locked = True
        row = await conn.fetchrow("SELECT s.*,a.steam_id::text FROM steam_match_sync s JOIN accounts a ON a.id=s.account_id WHERE account_id=$1", account_id)
        if not row:
            return
        if expected_job_id is not None and (row["job_id"] != expected_job_id or row["status"] != "queued"):
            return  # An orphaned old queue job must not run after settings were replaced.
        await conn.execute("UPDATE steam_match_sync SET status='syncing',updated_at=now() WHERE account_id=$1", account_id)
        code = history.cipher().decrypt(row["auth_cipher"].encode()).decode()
        cursor, seed = history.cipher().decrypt(row["cursor_code"].encode()).decode(), row["seed_pending"]
        for _ in range(3):
            # Validates the owner/auth pair even when importing the initial seed.
            following = await asyncio.to_thread(history.next_code, row["steam_id"], code, cursor)
            candidate = cursor if seed else following
            if not candidate:
                break
            details = await asyncio.to_thread(history.gc_request, "/resolve", {"share_code": candidate})
            match_id = str(details.get("match_id", ""))
            account32 = str(int(row["steam_id"]) & 0xffffffff)
            if not match_id.isdigit() or len(match_id) > 22 or account32 not in [str(a) for a in details.get("account_ids", [])]:
                raise history.HistoryError("แมตช์นี้ไม่มีบัญชี Steam ของคุณ หรือข้อมูลผู้เล่นยังไม่ครบ")
            imported += await _import_match(conn, account_id, row["steam_id"], match_id, details.get("demo_url", ""))
            cursor, seed = candidate, False
            await conn.execute("UPDATE steam_match_sync SET cursor_code=$2,seed_pending=FALSE,imported=$3,updated_at=now() WHERE account_id=$1", account_id, history.cipher().encrypt(cursor.encode()).decode(), imported)
        await conn.execute("UPDATE steam_match_sync SET status='done',message=$2,imported=$3,last_sync_at=now(),updated_at=now() WHERE account_id=$1", account_id,
            "นำเข้าแมตช์แล้ว รอประมวลผลในหน้าแมตช์" if imported else "ไม่พบแมตช์ใหม่ที่ต้องนำเข้า", imported)
    except Exception as error:
        message = str(error) if isinstance(error, history.HistoryError) else "ซิงก์ไม่สำเร็จ กรุณาลองใหม่หรือตรวจรหัสเชื่อมต่อ"
        await conn.execute("UPDATE steam_match_sync SET status='error',message=$2,imported=$3,updated_at=now() WHERE account_id=$1", account_id, message, imported)
    finally:
        if locked:
            await conn.execute("SELECT pg_advisory_unlock(73024,$1)", account_id)
        await conn.close()


async def _import_match(conn, account_id, steam_id, match_id, url):
    name = f"steam_{steam_id}_{match_id}.dem"
    lock = f"demo-upload:{name.lower()}"
    await conn.execute("SELECT pg_advisory_lock(hashtextextended($1,0))", lock)
    try:
        existing = await conn.fetchrow("SELECT id,status,uploaded_by,source FROM matches WHERE lower(demo_file)=lower($1)", name)
        if existing:
            if existing["uploaded_by"] != account_id or existing["source"] != "upload":
                raise history.HistoryError("ชื่อเดโมนี้มีอยู่ในระบบแล้ว กรุณาตรวจสอบในหน้าแมตช์")
            if existing["status"] != "error":
                return 0
            match = existing["id"]
            await conn.execute("UPDATE matches SET status='queued',error_message=NULL WHERE id=$1", match)
        else:
            used = await conn.fetchval("SELECT count(*) FROM matches WHERE uploaded_by=$1 AND imported_at>now()-interval '1 hour'", account_id)
            if used >= int(os.environ.get("UPLOAD_MAX_PER_HOUR", "20")):
                raise history.HistoryError("นำเข้าแมตช์ถึงโควตารายชั่วโมงแล้ว กรุณาลองใหม่ภายหลัง")
            DEMOS_DIR.mkdir(parents=True, exist_ok=True)
            destination = DEMOS_DIR / name
            staged = DEMOS_DIR / f".{secrets.token_hex(16)}.download"
            backup = None
            published = False
            try:
                await asyncio.to_thread(history.download_demo, url, staged, int(os.environ.get("MAX_DEMO_MB", "600"))*1024*1024)
                async with conn.transaction():
                    match = await conn.fetchval("INSERT INTO matches(demo_file,status,uploaded_by,uploader_type) VALUES($1,'queued',$2,'steam') RETURNING id", name, account_id)
                    if destination.exists():
                        orphan = DEMOS_DIR / ".orphaned"
                        orphan.mkdir(exist_ok=True)
                        backup = orphan / f"{name}.{secrets.token_hex(8)}.bak"
                        destination.replace(backup)
                    staged.replace(destination)
                    published = True
            except Exception:
                if published:
                    destination.unlink(missing_ok=True)
                if backup and backup.exists() and not destination.exists():
                    backup.replace(destination)
                raise
            finally:
                staged.unlink(missing_ok=True)
        try:
            job = await asyncio.to_thread(enqueue_parse, match)
            await conn.execute("UPDATE matches SET job_id=$2 WHERE id=$1", match, job)
        except Exception:
            await conn.execute("UPDATE matches SET status='error',error_message=$2 WHERE id=$1", match, "ส่งงานประมวลผลเข้าคิวไม่ได้ กรุณาซิงก์ใหม่")
            raise history.HistoryError("ส่งงานประมวลผลเข้าคิวไม่ได้ กรุณาซิงก์ใหม่") from None
        return 1
    finally:
        await conn.execute("SELECT pg_advisory_unlock(hashtextextended($1,0))", lock)
