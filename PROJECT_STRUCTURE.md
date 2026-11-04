# โครงสร้างโปรเจกต์

Backend ใช้ FastAPI บน Python ส่วน frontend ใช้ React/TypeScript บน Vite โครงสร้างนี้แยกตามหน้าที่ใน backend และแยกตาม feature ใน frontend โดยคง HTTP routes และ entry points เดิม

```text
backend/
  app.py                 Uvicorn compatibility entry: backend.app:app
  config/                database connection, environment and filesystem settings
  jobs/                  Redis/RQ queue and demo processing; python -m backend.jobs
  models/                SQLAlchemy tables and PostgreSQL views.sql
  repositories/          database queries for coach and reports
  routes/                FastAPI application/route registration
  schemas/               Pydantic request/response models
  services/              parser, ETL and feature/domain services
    reports/             report generation and serialization
  utilities/             utilities shared across backend concerns
  alembic/               migration chain

frontend/src/
  app/                    React bootstrap, providers, layout and global CSS
  routes/                 URL tree and authentication guard
  features/
    analysis/             analysis and heatmap pages
    auth/                 login page and redirect safety test
    coach/                coach page and export types
    home/                 landing page and sample replay
    matches/              match list/detail/economy pages
    opening/              opening-route page and playback
    players/              player profile page
    reports/              report components, hooks, API, types and export utilities
    rounds/               round replay, playback and grenade assets
    search/               player search UI
  shared/
    api/                  API transport and contracts used by multiple features
    assets/               icons used across features
    i18n/                 translation provider and dictionaries
    theme/                theme provider
    ui/                   shared UI helpers and game icons
```

Compatibility modules `backend/app.py`, `backend/db.py`, `backend/parser.py` and `backend/etl_loader.py` preserve existing Uvicorn, import and CLI entry points while their implementations live in the folders above. Frontend imports use the `@/` alias configured in both `tsconfig.json` and `vite.config.ts`.
