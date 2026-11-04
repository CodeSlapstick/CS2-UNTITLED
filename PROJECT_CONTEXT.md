# Project Context: CS2 Analytics & Scouting Platform

## Architecture & Tech Stack
- Backend: FastAPI on Python 3.12, PostgreSQL via asyncpg, SQLAlchemy model definitions, and Alembic migrations
- Background processing: Redis/RQ worker parses Counter-Strike 2 demo files (`.dem`)
- Frontend: React 19, TypeScript 7, Vite 8, TanStack Query, and project CSS; npm with Node 26 LTS in CI/Docker (Node 24.15+ also supported)
- Parser & data: `backend/services/parser.py` converts demos to JSON documents; parsed documents are also saved under `output/json/`
- Spatial & analytics: calibrated radar coordinates and heatmaps for the seven maps currently listed in `assets/radars.json`; grid clustering and player-role analysis

## Key Directories & Roles
- `backend/routes/`: FastAPI initialization and HTTP route registration; `backend/app.py` remains the stable Uvicorn entry
- `backend/jobs/`: Redis/RQ queue and demo-processing worker
- `backend/services/parser.py`: `.dem` parsing
- `backend/services/etl.py`: idempotent loading of parsed match documents into PostgreSQL
- `backend/models/`, `backend/models/views.sql`, and `backend/alembic/`: database models, summary views, and migrations
- `backend/services/features.py`: per-round player statistics and feature definitions
- `frontend/src/app/`: frontend bootstrap, providers, layout and global CSS
- `frontend/src/routes/`: route tree and protected-page setup
- `frontend/src/features/`: pages and their feature-specific components, hooks, services, types, tests and assets
- `frontend/src/shared/api/`: API client and contracts shared by multiple features
- `assets/maps/` & `assets/radars.json`: radar images and calibrated coordinate bounds used by the app
- `research/prep/`: เตรียมชุดข้อมูลจากเดโมอ้างอิง
- `research/tools/`: ตรวจเรดาร์และนำเข้า asset สำหรับงานวิจัย
- `research/models/`: เทรนโมเดล grid, coach และ player role แบบ offline
- `data/` & `output/`: local reference datasets and generated JSON/model artifacts

## Rules for AI Agent
1. Trace the existing data flow (`routes/application.py` → `jobs/demo_processing.py` → `services/parser.py` → `services/etl.py`) before changing ingestion behavior.
2. Maintain strict typing in TypeScript.
3. Do not scan or modify `node_modules/`, virtual environments, or `.dem` files unless the task requires it.
