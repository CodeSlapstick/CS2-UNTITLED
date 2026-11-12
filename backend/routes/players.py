"""Player HTTP routes, using the application's shared auth and DB dependencies."""

from collections.abc import Callable
from datetime import date

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.concurrency import run_in_threadpool

from backend.services import auth
from backend.services.features import rating2_approx
from backend.services.player_profiles import build_profile, search_players


def create_player_router(require_viewer: Callable, db: Callable, require_steam_viewer: Callable) -> APIRouter:
    """Keep player endpoints together without importing the application module."""
    router = APIRouter(prefix="/api/players")

    @router.get("/search")
    async def api_player_search(
        q: str = Query(..., min_length=2, max_length=80),
        limit: int = Query(8, ge=1, le=50),
        viewer: dict = Depends(require_viewer),
        conn: asyncpg.Connection = Depends(db),
    ):
        """ค้นเฉพาะผู้เล่นที่มีรอบอยู่ใน demo ที่ระบบประมวลผลแล้ว."""
        require_steam_viewer(viewer)
        return await search_players(conn, q.strip(), limit)

    async def _player_id(conn: asyncpg.Connection, who: str, viewer: dict) -> int:
        """'me' = SteamID ของบัญชีที่ล็อกอินอยู่ · หรือใส่ SteamID64 ตรง ๆ

        ต้องเป็นบัญชี Steam; ใช้ผู้เล่นที่ยืนยันไว้ก่อน หรือ Steam ID ของบัญชี
        หากยังไม่มีข้อมูลของตัวเอง จะตอบ 409 ให้หน้าเว็บแสดงขั้นตอนผูกผู้เล่น
        """
        require_steam_viewer(viewer)
        if who == "me":
            row = await conn.fetchrow(
                """
                SELECT a.steam_id, l.steam_id AS linked_steam_id
                FROM accounts a LEFT JOIN account_player_links l ON l.account_id = a.id
                WHERE a.id = $1
            """,
                viewer["id"],
            )
            if not row or row["steam_id"] is None:
                raise HTTPException(409, "บัญชีนี้ยังไม่ได้ผูกกับ Steam — ล็อกอินด้วย Steam เพื่อดูสถิติของตัวเอง")
            if row["linked_steam_id"] is not None:
                return int(row["linked_steam_id"])
            has_own_data = await conn.fetchval(
                "SELECT EXISTS(SELECT 1 FROM player_round_facts WHERE steam_id = $1)", row["steam_id"]
            )
            if not has_own_data:
                raise HTTPException(409, "บัญชียังไม่ได้ยืนยันผู้เล่นใน demo — ค้นหา เลือก และยืนยันผู้เล่นของคุณ")
            return int(row["steam_id"])
        if not who.isdigit() or len(who) != 17:
            raise HTTPException(400, "ต้องเป็น SteamID64 (ตัวเลข 17 หลัก) หรือ me")
        return int(who)

    @router.post("/me/link")
    async def api_link_my_player(
        request: Request,
        viewer: dict = Depends(require_viewer),
        conn: asyncpg.Connection = Depends(db),
    ):
        """บันทึกเฉพาะ Steam ID ที่ผู้ใช้เลือกและยืนยันเอง; ไม่เดาจาก nickname."""
        if viewer["type"] == auth.GUEST:
            raise HTTPException(403, "ต้องล็อกอินด้วย Steam ก่อนยืนยันผู้เล่น")
        payload = await request.json()
        steam_id = str(payload.get("steam_id", ""))
        if not steam_id.isdigit() or len(steam_id) != 17:
            raise HTTPException(400, "ต้องเป็น SteamID64 17 หลัก")
        exists = await conn.fetchval(
            "SELECT EXISTS(SELECT 1 FROM player_round_facts WHERE steam_id = $1)", int(steam_id)
        )
        if not exists:
            raise HTTPException(404, "ไม่พบผู้เล่นนี้ใน demo ที่ประมวลผลแล้ว")
        await conn.execute(
            """
            INSERT INTO account_player_links (account_id, steam_id, confirmed_at)
            VALUES ($1, $2, now())
            ON CONFLICT (account_id) DO UPDATE
            SET steam_id = EXCLUDED.steam_id, confirmed_at = now()
        """,
            viewer["id"],
            int(steam_id),
        )
        return {"ok": True, "steam_id": steam_id}

    @router.get("/{who}/profile")
    async def api_player_profile(
        who: str,
        recent: int = Query(0, ge=0, le=20),
        date_from: date | None = Query(None),
        date_to: date | None = Query(None),
        map: str | None = Query(None, min_length=1, max_length=80),
        side: str = Query("all", pattern="^(all|ct|t)$"),
        viewer: dict = Depends(require_viewer),
        conn: asyncpg.Connection = Depends(db),
    ):
        """โปรไฟล์หนึ่งคน โดยทุกการ์ดใช้ match/round filter ชุดเดียวกัน."""
        if recent not in (0, 5, 10, 20):
            raise HTTPException(400, "ช่วงแมตช์ต้องเป็น 0, 5, 10 หรือ 20")
        if date_from and date_to and date_from > date_to:
            raise HTTPException(400, "วันเริ่มต้นต้องไม่อยู่หลังวันสิ้นสุด")
        steam_id = await _player_id(conn, who, viewer)
        profile = await build_profile(
            conn, steam_id, recent=int(recent), date_from=date_from, date_to=date_to, map_name=map, side=side
        )
        if profile is None:
            raise HTTPException(404, "ยังไม่มีข้อมูลของผู้เล่นคนนี้ในเดโมที่โหลดไว้")
        return profile

    @router.get("/{who}/summary")
    async def api_player_summary(
        who: str, viewer: dict = Depends(require_viewer), conn: asyncpg.Connection = Depends(db)
    ):
        """สรุปของผู้เล่นคนเดียว: ภาพรวม + entry แยกฝั่ง + clutch 1v1..1v5 (ทั้งหมดจากเดโมที่โหลดไว้)"""
        steam_id = await _player_id(conn, who, viewer)
        row = await conn.fetchrow("SELECT * FROM player_stats WHERE steam_id = $1", steam_id)
        if row is None or not row["rounds"]:
            raise HTTPException(404, "ยังไม่มีข้อมูลของผู้เล่นคนนี้ในเดโมที่โหลดไว้")
        totals = await conn.fetchrow(
            """
            SELECT SUM(damage) AS damage, COUNT(*) FILTER (WHERE kast) AS kast_rounds, COUNT(*) AS rounds,
                   SUM(kills) AS kills, SUM(deaths) AS deaths, SUM(assists) AS assists
            FROM player_round_facts WHERE steam_id = $1""",
            steam_id,
        )
        entry = await conn.fetch(
            """
            SELECT side,
                   COUNT(*) FILTER (WHERE opening_kill)  AS kills,
                   COUNT(*) FILTER (WHERE opening_death) AS deaths
            FROM player_rounds WHERE steam_id = $1 GROUP BY side""",
            steam_id,
        )
        clutches = await conn.fetch(
            """
            SELECT clutch_vs AS vs, COUNT(*) AS attempts, COUNT(*) FILTER (WHERE clutch_won) AS wins
            FROM player_rounds WHERE steam_id = $1 AND clutch_vs > 0 GROUP BY clutch_vs ORDER BY clutch_vs""",
            steam_id,
        )
        account = await conn.fetchrow("SELECT username, avatar FROM accounts WHERE steam_id = $1", steam_id)
        avatar = account["avatar"] if account else None
        if not avatar:
            avatar = await conn.fetchval("SELECT avatar FROM players WHERE steam_id = $1", steam_id)
        if not avatar:
            profile = await run_in_threadpool(auth.steam_persona, str(steam_id))
            avatar = profile["avatar"]
            if avatar:
                await conn.execute("UPDATE players SET avatar = $2 WHERE steam_id = $1", steam_id, avatar)

        by_side = {r["side"]: {"kills": r["kills"], "deaths": r["deaths"]} for r in entry}
        both = {
            "kills": sum(v["kills"] for v in by_side.values()),
            "deaths": sum(v["deaths"] for v in by_side.values()),
        }
        return {
            "player": {
                "steam_id": str(steam_id),
                "name": row["name"],
                "avatar": avatar,
                "linked_account": account["username"] if account else None,
            },
            "totals": {
                k: row[k]
                for k in (
                    "matches",
                    "rounds",
                    "kills",
                    "deaths",
                    "assists",
                    "headshots",
                    "kd",
                    "hs_rate",
                    "adr",
                    "kast",
                    "win_rate",
                    "survival_rate",
                    "rating",
                )
            },
            "rating2_approx": rating2_approx(
                kills=totals["kills"] or 0,
                deaths=totals["deaths"] or 0,
                assists=totals["assists"] or 0,
                damage=totals["damage"] or 0,
                kast_rounds=totals["kast_rounds"],
                rounds=totals["rounds"],
            ),
            "entry": {
                "both": both,
                "t": by_side.get("t", {"kills": 0, "deaths": 0}),
                "ct": by_side.get("ct", {"kills": 0, "deaths": 0}),
            },
            "clutches": [{"vs": c["vs"], "attempts": c["attempts"], "wins": c["wins"]} for c in clutches],
            "source": {"matches": row["matches"], "label": f"จาก {row['matches']} แมตช์ที่โหลดเข้าระบบ"},
        }

    @router.get("/{who}/matches")
    async def api_player_matches(
        who: str,
        limit: int = Query(20, ge=1, le=100),
        viewer: dict = Depends(require_viewer),
        conn: asyncpg.Connection = Depends(db),
    ):
        """แมตช์ล่าสุดของผู้เล่นคนนี้ พร้อมผลแพ้/ชนะและ rating รายแมตช์"""
        steam_id = await _player_id(conn, who, viewer)
        return [
            dict(row)
            for row in await conn.fetch(
                """
            SELECT match_id, demo_file, map_name, team_a, team_b, imported_at, rounds, rounds_won, result,
                   kills, deaths, assists, adr, kast, rating
            FROM player_match_results WHERE steam_id = $1 ORDER BY match_id DESC LIMIT $2""",
                steam_id,
                limit,
            )
        ]

    @router.get("/{who}/maps")
    async def api_player_maps(who: str, viewer: dict = Depends(require_viewer), conn: asyncpg.Connection = Depends(db)):
        """รวมรายแมพ: เล่นกี่แมตช์ ชนะกี่แมตช์ rating/ADR เฉลี่ย"""
        steam_id = await _player_id(conn, who, viewer)
        return [
            dict(row)
            for row in await conn.fetch(
                """
            SELECT map_name, matches, wins, losses, rounds, win_rate, rating, adr
            FROM player_map_stats WHERE steam_id = $1 ORDER BY matches DESC, wins DESC""",
                steam_id,
            )
        ]

    @router.get("/{who}/weapons")
    async def api_player_weapons(
        who: str,
        limit: int = Query(8, ge=1, le=30),
        viewer: dict = Depends(require_viewer),
        conn: asyncpg.Connection = Depends(db),
    ):
        """อาวุธที่ใช้ฆ่าบ่อยที่สุด + %หัวของอาวุธนั้น (นับเฉพาะการดวล)"""
        steam_id = await _player_id(conn, who, viewer)
        return [
            dict(row)
            for row in await conn.fetch(
                """
            SELECT weapon, kills, headshots, hs_rate FROM player_weapon_stats
            WHERE steam_id = $1 ORDER BY kills DESC LIMIT $2""",
                steam_id,
                limit,
            )
        ]

    return router
