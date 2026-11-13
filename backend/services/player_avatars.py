"""Resolve and cache Steam avatars without blocking the match scoreboard response."""

import asyncio
import time
from functools import lru_cache

from fastapi.concurrency import run_in_threadpool

from backend.services import auth


@lru_cache(maxsize=512)
def _steam_avatar(steam_id: str, interval: int) -> str | None:
    # Cache unsuccessful lookups as well, so unavailable profiles are retried at most every 15 minutes.
    return auth.steam_persona(steam_id).get("avatar")


async def match_avatars(conn, match_id: int) -> dict[str, str | None]:
    players = await conn.fetch("""
        SELECT p.steam_id::text AS steam_id, COALESCE(a.avatar, p.avatar) AS avatar
        FROM match_players mp JOIN players p ON p.steam_id = mp.steam_id
        LEFT JOIN accounts a ON a.steam_id = p.steam_id
        WHERE mp.match_id = $1""", match_id)
    avatars = {player["steam_id"]: player["avatar"] for player in players}
    semaphore = asyncio.Semaphore(3)

    async def lookup(steam_id: str):
        async with semaphore:
            return steam_id, await run_in_threadpool(_steam_avatar, steam_id, int(time.time() // 900))

    missing = [steam_id for steam_id, avatar in avatars.items() if not avatar]
    for steam_id, avatar in await asyncio.gather(*(lookup(steam_id) for steam_id in missing)):
        if avatar:
            await conn.execute("UPDATE players SET avatar = $2 WHERE steam_id = $1", int(steam_id), avatar)
            avatars[steam_id] = avatar
    return avatars
