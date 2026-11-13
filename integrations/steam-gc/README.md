# Steam match import

Settings is available from the signed-in profile menu at `/settings`. A Steam user can save a Game Authentication Code and a recent Match Sharing Code, remove those codes, and request a manual sync. Saving codes does not validate them; validation happens during sync. No Steam password or Steam Guard code is collected by the website.

## Server setup

The application needs these server-only variables in the project `.env`:

```
STEAM_API_KEY=
STEAM_GC_SERVICE_TOKEN=
STEAM_GC_REFRESH_TOKEN=
```

`STEAM_API_KEY` is a Steam Web API key. `STEAM_GC_SERVICE_TOKEN` is a long random internal bearer secret shared by API/worker/resolver. Generate it locally, for example with Python's `secrets.token_urlsafe(32)`. `STEAM_GC_REFRESH_TOKEN` is a **Steam client** refresh token for an operator-controlled service account with CS2 access. A user's Game Authentication Code is not a client refresh token. Obtain a client token using the maintained [steam-session](https://github.com/DoctorMcKay/node-steam-session) authentication flow on the operator's computer; do not paste it into Settings or chat.

Start the optional internal resolver and update the app:

```
docker compose --profile steam-sync up -d --build steam-gc api worker frontend
```

The resolver has no published host port. Settings disables Sync while the Web API key or authenticated GC session is unavailable. Set `STEAM_GC_URL` in API/worker when running outside Compose. The resolver reports `ready: true` only after connecting to the CS2 Game Coordinator. `STEAM_GC_SERVICE_TOKEN` authenticates resolution requests; health readiness carries no credentials.

The API and worker share `output/.secrets/steam-history.key`, created atomically with owner-only file permissions. Back up this key securely together with the database; without it, users must reconnect their codes. Both saved history authentication and cursor/share codes are encrypted. Neither is returned by Settings API. Do not serve the output directory publicly.

## Flow and bounds

1. POST sync enqueues one RQ job for the logged-in account. Database locks prevent concurrent sync/edit/disconnect.
2. Steam's `ICSGOPlayers_730/GetNextMatchSharingCode/v1` validates the auth/Steam ID pair and discovers following matches. The first sync also imports the initial share code.
3. The internal resolver requests the exact match from GC and returns the replay URL and participating account IDs. The worker verifies that the connected account participated.
4. Only replay-number hosts under `valve.net`, `/730/*.dem.bz2`, and no redirects are accepted. Compressed/decompressed size, time and CS2 magic are checked. Publication shares the normal upload filename lock and rolls back file changes if DB commit fails.
5. At most three matches are imported per request, subject to the existing hourly quota; parser jobs reuse the `parse` queue. Cursor advances only after a match is present/queued successfully. Parse failures remain visible in Matches and may be retried.

Sync is manual; there is no polling scheduler. It cannot recover replays Steam no longer provides and does not cover FACEIT/community matches through this integration. A timed-out/terminal sync is recoverable; old queued jobs cannot run after the connection was replaced. Local disconnect removes saved codes, not already imported match data or the Steam-side authorization (revoke that on Steam).

## Validation

Run `python -m pytest tests/test_steam_history.py tests/test_access_control.py -q`, `npm run typecheck` in frontend, and `npm audit --omit=dev` in this directory. The service is based on [node-globaloffensive](https://github.com/DoctorMcKay/node-globaloffensive) and [node-steam-user](https://github.com/DoctorMcKay/node-steam-user). Live downloading requires real operator credentials and account-owned history codes; fixture tests do not establish live Steam connectivity.
