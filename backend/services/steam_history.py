"""Steam history helpers. Never log URLs containing Web API keys or auth codes."""
import bz2
import json
import os
import re
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from cryptography.fernet import Fernet
from backend.config.settings import ROOT

SHARE_RE = re.compile(r"^CSGO-(?:[A-Za-z0-9]{5}-){4}[A-Za-z0-9]{5}$")
AUTH_RE = re.compile(r"^[A-Za-z0-9]{4}-[A-Za-z0-9]{5}-[A-Za-z0-9]{4}$")


class HistoryError(Exception):
    pass


def cipher():
    # Shared API/worker output volume; key is never returned through the API.
    path = Path(os.environ.get("STEAM_SYNC_KEY_FILE", ROOT / "output/.secrets/steam-history.key"))
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        fd, temporary = tempfile.mkstemp(dir=path.parent, prefix=".key-")
        try:
            with os.fdopen(fd, "wb") as stream:
                stream.write(Fernet.generate_key())
                stream.flush()
                os.fsync(stream.fileno())
            try:
                os.link(temporary, path)  # Publish complete key without replacing a concurrent winner.
            except FileExistsError:
                pass
        finally:
            Path(temporary).unlink(missing_ok=True)
    return Fernet(path.read_bytes())


def gc_request(path, payload=None):
    base = os.environ.get("STEAM_GC_URL", "").rstrip("/")
    token = os.environ.get("STEAM_GC_SERVICE_TOKEN", "")
    if not base or not token:
        raise HistoryError("บริการนำเข้าแมตช์ Steam ยังไม่พร้อม กรุณาติดต่อผู้ดูแลระบบ")
    request = urllib.request.Request(base + path, data=None if payload is None else json.dumps(payload).encode(),
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=3 if path == "/health" else 40) as response:
            return json.load(response)
    except Exception:
        raise HistoryError("ติดต่อบริการ Steam ไม่สำเร็จ กรุณาลองใหม่ภายหลัง") from None


def ready():
    if not os.environ.get("STEAM_API_KEY"):
        return False
    try:
        return bool(gc_request("/health").get("ready"))
    except HistoryError:
        return False


def next_code(steam_id, auth_code, known):
    key = os.environ.get("STEAM_API_KEY", "")
    if not key:
        raise HistoryError("เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า Steam API key")
    query = urllib.parse.urlencode({"key": key, "steamid": steam_id, "steamidkey": auth_code, "knowncode": known})
    try:
        with urllib.request.urlopen("https://api.steampowered.com/ICSGOPlayers_730/GetNextMatchSharingCode/v1/?" + query, timeout=20) as response:
            if response.status == 202:
                return None
            code = json.load(response).get("result", {}).get("nextcode")
            if response.status == 202 or code == "n/a":
                return None
            if code and SHARE_RE.fullmatch(code):
                return code
            raise HistoryError("Steam ส่งข้อมูลแมตช์กลับมาไม่ครบ กรุณาลองใหม่")
    except urllib.error.HTTPError as error:
        if error.code in (403, 412):
            raise HistoryError("Steam ไม่ยอมรับรหัส กรุณาตรวจ Authentication Code และใช้ Share Code ของแมตช์ล่าสุด") from None
        raise HistoryError("Steam ยังให้ข้อมูลแมตช์ไม่ได้ กรุณาลองใหม่ภายหลัง") from None
    except (OSError, ValueError):
        raise HistoryError("ติดต่อ Steam ไม่สำเร็จ กรุณาลองใหม่ภายหลัง") from None


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def validate_replay_url(url):
    parsed = urllib.parse.urlsplit(url)
    if (parsed.scheme not in ("http", "https") or not re.fullmatch(r"replay\d+\.valve\.net", parsed.hostname or "")
        or parsed.port not in (None, 80, 443) or parsed.username or parsed.password
        or not re.fullmatch(r"/730/[A-Za-z0-9_]+\.dem\.bz2", parsed.path) or parsed.query or parsed.fragment):
        raise HistoryError("ลิงก์เดโมที่ได้รับไม่ถูกต้อง")
    return url


def download_demo(url, destination, max_bytes):
    validate_replay_url(url)
    decoder = bz2.BZ2Decompressor()
    downloaded = written = 0
    started = time.monotonic()
    try:
        opener = urllib.request.build_opener(NoRedirect())
        with opener.open(url, timeout=30) as response, open(destination, "xb") as target:
            while chunk := response.read(128 * 1024):
                downloaded += len(chunk)
                if downloaded > max_bytes or time.monotonic() - started > 180:
                    raise HistoryError("เดโมใหญ่เกินกำหนดหรือดาวน์โหลดนานเกินไป")
                data = chunk
                while True:
                    out = decoder.decompress(data, max_length=min(1024 * 1024, max_bytes - written + 1))
                    written += len(out)
                    if written > max_bytes:
                        raise HistoryError("เดโมใหญ่เกินขนาดที่ระบบรับได้")
                    target.write(out)
                    if decoder.eof or decoder.needs_input:
                        break
                    data = b""
            if not decoder.eof:
                raise HistoryError("ดาวน์โหลดเดโมไม่ครบ กรุณาลองใหม่")
        with open(destination, "rb") as source:
            if source.read(8) != b"PBDEMS2\x00":
                raise HistoryError("ไฟล์ที่ได้รับไม่ใช่เดโม CS2")
        return written
    except HistoryError:
        Path(destination).unlink(missing_ok=True)
        raise
    except Exception:
        Path(destination).unlink(missing_ok=True)
        raise HistoryError("ดาวน์โหลดเดโมไม่ได้ ลิงก์อาจหมดอายุหรือ Steam ยังไม่พร้อม") from None
