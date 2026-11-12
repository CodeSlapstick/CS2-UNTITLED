# CS2 UNITITLED ANALYSIS
Local Counter-Strike 2 demo-analysis platform for teams and coaches. Upload a `.dem` file, parse it in the background, and review match, round, player, economy, utility, opening, trade, clutch, KAST, and positioning statistics.

## Current status

The application currently runs locally with Docker Compose:

```text
Browser -> React/Vite frontend + nginx (:3000)
        -> FastAPI API -> PostgreSQL + Redis
        -> background worker for demo parsing
```

The API runs Alembic migrations automatically when its container starts. The current migration head is `0022`.

## Run locally

Requirements: Docker Desktop with Docker Compose and a Counter-Strike 2 `.dem` file.

From the repository root:

```powershell
Copy-Item .env.example .env
docker compose up -d
```

Open [http://localhost:3000](http://localhost:3000).

```powershell
docker compose ps
docker compose logs -f api worker
docker compose down
docker compose down -v
```

`docker compose down` stops containers and keeps the database volume. The `-v` variant also deletes the local database volume.

Local PostgreSQL connection:

```text
Host: 127.0.0.1
Port: 5433
Database: cs2_analytics
User: postgres
Password: postgres
```

## Authentication

The local API creates a development account on startup. Configure `DEV_USERNAME` and `DEV_PASSWORD` in `.env`. Guest access and Steam OpenID login are available through their corresponding `.env` settings.

## Application areas

- `/login` — authentication
- `/player` — player summary and match history
- `/matches` — uploaded and parsed matches
- `/matches/{demo_file}/rounds/{round_num}` — round review and replay data
- `/analysis` — heatmaps, opening routes, player behavior, and tactical analysis
- `/api/docs` — FastAPI Swagger documentation

## Data flow

1. The frontend uploads a demo through the API.
2. The API stores the file and queues a match.
3. Redis/RQ sends the job to the worker.
4. The worker parses the demo with `awpy` and `demoparser2`.
5. Parsed events and derived features are stored in PostgreSQL.
6. The frontend reads the match and analysis endpoints.

Uploads create new matches only. A duplicate `demo_file` returns HTTP 409, including matches with an `error` status;
delete an existing match you own before uploading that filename again. Files are staged as `.upload` before an atomic
rename. If queue submission fails, the API returns HTTP 503 and keeps the demo with match status `error` so it can be
deleted and uploaded again once the queue is available.

Feature definitions are in `backend/services/features.py`; parsing and ETL are in `backend/services/parser.py` and `backend/services/etl.py`. The old parser and ETL module paths remain as compatibility CLIs.

## Database

Main tables include `accounts`, `users`, `matches`, `rounds`, `players`, `match_players`, `player_rounds`, `kills`, `damages`, `grenades`, and `player_positions`.

The reporting views are defined in `backend/models/views.sql`: `match_summary`, `match_scoreboard`, `player_stats`, `player_round_facts`, `player_clutches`, `player_map_stats`, `player_match_results`, `player_weapon_stats`, and `round_economy`.

Create schema changes with Alembic rather than editing the database manually:

```powershell
docker compose exec api alembic upgrade head
docker compose exec api alembic current
```

## Development checks

Use Python 3.12 and Node 26 LTS (Node 24.15+ is also supported), with pip and npm.
Install backend tools with `python -m pip install -r requirements-dev.txt`.
Direct Python dependencies are pinned in the requirements files; frontend installs use `package-lock.json`.

```powershell
python -m compileall -q backend
ruff check .
pytest
cd frontend
npm ci
npm run typecheck
npm test
npm run build
```

For a browser check against a running frontend/API and PostgreSQL containing a completed guest demo:

```powershell
cd frontend
npx playwright install chromium
# Optional: $env:E2E_BASE_URL = "http://127.0.0.1:3000"
npm run test:e2e
```

The browser test signs in as a guest, loads real match data, and opens the round replay. It does not mock the API.
No standalone frontend linter or backend static typechecker is configured; TypeScript checks include unused locals and parameters.

Before changing parser dependencies, capture and compare a real demo's normalized output:

```powershell
python -m scripts.check_parser_compatibility demos/uploads/example.dem --output tmp/parser-before.json
# Upgrade dependencies, then:
python -m scripts.check_parser_compatibility demos/uploads/example.dem --compare tmp/parser-before.json
```

## Repository layout

```text
backend/       FastAPI API, parser, worker, models, migrations, and views
frontend/      React + TypeScript + Vite application
research/      Offline model and data-preparation work
assets/        Radar images and map metadata
demos/         Reference and uploaded demo files
output/        Parser and research artifacts
tests/         Automated tests
```

The current workflow is local development and analysis. Cloud deployment configuration is intentionally excluded for now.
