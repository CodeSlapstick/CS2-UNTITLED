# Project Context: CS2 Analytics & Scouting Platform

## Architecture & Tech Stack
- Backend: FastAPI on Python 3.11, PostgreSQL via asyncpg, SQLAlchemy model definitions, and Alembic migrations
- Background processing: Redis/RQ worker parses Counter-Strike 2 demo files (`.dem`)
- Frontend: React 18, TypeScript, Vite, TanStack Query, and project CSS
- Parser & data: `backend/parser.py` converts demos to JSON documents; parsed documents are also saved under `output/json/`
- Spatial & analytics: calibrated radar coordinates and heatmaps for the seven maps currently listed in `assets/radars.json`; grid clustering and player-role analysis

## Key Directories & Roles
- `backend/app.py`: FastAPI initialization, authentication, upload handling, and API routes
- `backend/jobs.py`: Redis/RQ job queue and demo-processing worker
- `backend/parser.py`: `.dem` parsing
- `backend/etl_loader.py`: Idempotent loading of parsed match documents into PostgreSQL
- `backend/models.py`, `backend/views.sql`, and `backend/alembic/`: database models, summary views, and migrations
- `backend/features.py`: per-round player statistics and feature definitions
- `frontend/src/main.tsx`: frontend routes and protected-page setup
- `frontend/src/api.ts`: Frontend API client
- `frontend/src/`: React pages for matches, round review, analysis, player profiles, coaching, and reports
- `assets/maps/` & `assets/radars.json`: radar images and calibrated coordinate bounds used by the app
- `research/`: offline parsing, radar validation, clustering, coaching, and player-role research scripts
- `data/` & `output/`: local reference datasets and generated JSON/model artifacts

## Rules for AI Agent
1. Trace the existing data flow (`app.py` → `jobs.py` → `parser.py` → `etl_loader.py`) before changing ingestion behavior.
2. Maintain strict typing in TypeScript.
3. Do not scan or modify `node_modules/`, virtual environments, or `.dem` files unless the task requires it.
