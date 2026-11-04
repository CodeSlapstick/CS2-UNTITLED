# ตรวจ dependency และโค้ดที่เลิกใช้ — 4 พฤศจิกายน 2026

## ขอบเขตและสภาพก่อนเริ่ม

- Backend: Python, FastAPI, asyncpg, SQLAlchemy/Alembic, Redis/RQ; ใช้ pip กับ `requirements.txt`/`requirements-dev.txt` ไม่มี Python lockfile เดิม
- Frontend: TypeScript/React, Vite, TanStack Query; ใช้ npm และ `frontend/package-lock.json` (lockfile v3)
- CI/Docker เดิมใช้ Python 3.11 และ Node 20; เครื่องทดสอบมี Python 3.12.0, Node 24.18.1, npm 11.16.0
- ตรวจ README, PROJECT_CONTEXT, PRODUCT, scripts, workflow, Dockerfiles, Compose และ Render config; ไม่พบ AGENTS.md ที่กำกับ source เหล่านี้
- มีงานแก้ค้างก่อนเริ่ม 57 tracked paths รวม parser, API, views, frontend, dependency และไฟล์ deployment ที่ถูกลบ รวมทั้ง untracked scripts/tests เก็บงานเดิมไว้ทั้งหมด
- สำเนาไฟล์ tracked ก่อนงานรอบนี้อยู่ `artifacts/dependency-audit-2026-11-04/before/` (ignored); ไม่ได้ reset, commit หรือ push

## Baseline ก่อนอัปเดต

| การตรวจ | ผลก่อนแก้ |
| --- | --- |
| `python -m pip check` | ผ่าน |
| `python -m compileall -q backend` | ผ่าน |
| `python -m ruff check .` | ผ่าน |
| `python -m pytest -q` | 9 passed |
| `npm run typecheck` | ผ่าน |
| `npm test` | 3 files / 6 tests passed |
| `npm run build` | ผ่าน; พบ CSS syntax warning จาก comment ที่ขาด `/*` และ chunk ใหญ่กว่า 500 kB |
| Docker | รันไม่ได้: ไม่พบ Docker Desktop Linux engine pipe |
| Frontend lint / backend typecheck | ไม่มีคำสั่งหรือ config เดิมสำหรับการตรวจนี้; ไม่เรียก compileall ว่า typecheck |

ข้อบกพร่อง deploy ที่มีมาก่อน: `render.yaml` เรียก `deployment/start_render.py` ซึ่งถูกลบใน working tree ก่อนงานนี้ และ README ระบุ cloud deployment อยู่นอก workflow ปัจจุบัน จึงเก็บ config ไว้เพื่อให้ผู้ดูแลยืนยันว่าจะฟื้นหรือเลิกใช้ Render

## เวอร์ชัน backend

คอลัมน์ก่อนคือเวอร์ชันที่ติดตั้งจริงใน `.venv` ตอนเก็บ baseline เพราะ requirements เดิมส่วนใหญ่เป็น `>=` และไม่มี lockfile ตัวเลขหลังถูก pin ใน requirements เพื่อคงชุด direct dependencies ที่ตรวจแล้ว

| แพ็กเกจ | ก่อน | หลัง |
| --- | --- | --- |
| awpy | 2.0.2 | 2.0.2 — คงไว้ตามข้อจำกัดด้านล่าง |
| demoparser2 | 0.41.4 | 0.42.1 |
| polars | 1.44.2 | 2.1.0 |
| fastapi | 0.141.1 | 0.162.0 |
| pydantic | 2.13.5 (transitive) | 2.14.2 (ประกาศ direct เนื่องจาก report_schemas import จริง) |
| uvicorn | 0.54.0 | 0.54.0 |
| python-multipart | 0.0.32 | 0.0.33 |
| PyJWT | 2.15.0 | 2.15.1 |
| certifi | 2026.7.22 | 2026.10.23 |
| asyncpg | 0.31.0 | 0.32.0 |
| SQLAlchemy | 2.1.1 | 2.1.8 |
| alembic | 1.20.0 | 1.20.1 |
| rq | 2.12.0 | 3.0.0 |
| redis (Python client) | 8.1.0 | 8.1.0 |
| pandas | 3.0.6 | 3.1.0 |
| numpy | 2.5.3 | 2.5.4 |
| scikit-learn | 1.9.1 | 1.9.1 |
| matplotlib | 3.11.2 | 3.11.2 |
| pillow | 12.3.0 | 13.0.0 |
| ruff | 0.16.9 | 0.17.3 |
| pytest | 9.1.1 | 9.2.0 |
| vpk | 1.4.0 | 1.4.0 |
| fakeredis[lua] | ไม่มี | 2.40.0 — dev-only สำหรับทดสอบ RQ |

awpy stable ล่าสุดบน PyPI คือ 3.1.1 แต่เปลี่ยนเป็น Rust parser และไม่มี API ชุดเดิมที่ `backend/services/parser.py` และ `research/prep/demoparser.py` ใช้ (`awpy.parsers.rounds`, `dem.events`, `dem.parser.parse_ticks/parse_event`) จึงคง 2.0.2 ซึ่งเป็น stable ล่าสุดในสาย 2.x การย้ายต้องทำ adapter ใหม่และเทียบ event/round/position/grenade schemas ให้ครบก่อน ไม่ใช่เปลี่ยนเลขแล้วใช้ข้อมูลใหม่แทนทันที

Polars 2 เปลี่ยน lazy execution และลบ API เก่า; parser ปัจจุบันใช้ eager operations และผ่านการเปรียบเทียบเดโมจริง RQ 3 เปลี่ยน dependent jobs/worker internals/cron semantics แต่โปรเจกต์ใช้ queue ปกติ ไม่ได้ subclass worker หรือเรียก cron; เพิ่ม tests ตรวจ serialize, enqueue, worker execution และ finished/failed status

Python ใน CI/Docker เปลี่ยนเป็น 3.12 เพื่อรองรับ NumPy 2.5.4 (`Requires-Python >=3.12`) และตรงกับ runtime ที่ทดสอบ ไม่ได้อ้างว่า Python 3.12 เป็น Python รุ่นล่าสุด

## เวอร์ชัน frontend

คอลัมน์ก่อนมาจาก npm dependency tree/lockfile เดิม ส่วน lockfile ใหม่สร้างด้วย npm โดยไม่ใช้ `--force` หรือ `--legacy-peer-deps`

| แพ็กเกจ | ก่อน | หลัง |
| --- | --- | --- |
| react / react-dom | 18.3.1 | 19.3.1 |
| react-router-dom | 6.30.6 | 7.18.5 |
| @tanstack/react-query | 5.102.8 | 5.105.3 |
| @types/react | 18.3.31 | 19.3.0 |
| @types/react-dom | 18.3.7 | 19.3.0 |
| @vitejs/plugin-react | 4.7.0 | 6.2.1 |
| vite | 5.4.21 | 8.3.5 |
| typescript | 5.9.3 | 7.0.2 |
| vitest | 2.1.9 | 5.1.0 |
| jsdom | 25.0.1 | 30.1.3 |
| @testing-library/react | 16.1.0 | 16.3.3 |
| @testing-library/user-event | 14.5.2 | ลบ |
| @fontsource/anuphan / chakra-petch | 5.3.0 | 5.3.0 |
| echarts | 6.1.0 | 6.1.0 |
| html-to-image | 1.11.13 | 1.11.13 |
| jspdf | 4.2.1 | 4.2.1 |
| @playwright/test | ไม่มี | 1.64.1 — browser smoke test |

React Router 7.18.5 คือ latest tag ของแพ็กเกจ `react-router-dom` ณ วันที่ตรวจ ไม่ได้เปลี่ยนไปใช้แพ็กเกจ `react-router` รุ่น 8 คนละสาย API

แก้ React 19 ref types ให้เป็น `RefObject<Element | null>` ใน heatmap/report โดยคงการตรวจ `.current` เดิม ใช้ JSX transform แบบใหม่ที่โปรเจกต์ตั้งอยู่แล้ว ไม่มี legacy ReactDOM.render และไม่มี multi-segment splat route ที่ต้องเปลี่ยนตาม React Router migration guide

Vite 8 เปลี่ยน bundler เป็น Rolldown/Oxc และ default browser target ใหม่ จึงกำหนด `build.target` ให้เท่าชุดเดิมของ Vite 5 เพื่อไม่ลด browser range โดยไม่ตั้งใจ TypeScript 7 ยังเรียก `tsc -b` ได้ตามเดิม

Node ใน CI/Docker เปลี่ยน 20 → 26.13.0 LTS; รองรับ Node 24.15+ ด้วยและตรวจแล้วทั้ง 24.18.1/26.13.0 ใช้ npm เดิม 11.16.0 พร้อมประกาศ packageManager Nginx runtime image เปลี่ยน 1.27-alpine → 1.30.6-alpine (stable ตาม nginx.org และตรวจ tag ใน Docker Hub)

PostgreSQL 16 และ Redis 7 ใน Compose คงไว้ ไม่เปลี่ยน major ของระบบที่มีข้อมูลบน volume และไม่ได้สร้าง migration ใหม่

## โค้ดที่ลบและหลักฐาน

| สิ่งที่ลบ | หลักฐาน |
| --- | --- |
| `frontend/src/ReviewNotes.tsx` (163 บรรทัดใน working tree ก่อนเริ่ม) | ตรวจ entry `index.html → main.tsx`, route tree, imports แบบ static/dynamic, lazy weapon registry, Vite config, scripts และ workflow: ไม่มีเส้นทางเข้าถึงโมดูลนี้ ไม่มี glob loader หรือการ export เป็น public package; component ไม่ได้ถูก mount ใน RoundPage/RoundView ปัจจุบัน |
| `.review-notes` และ `.rn-*` CSS | selectors ใช้เฉพาะ JSX ใน component ที่ไม่ถูก mount ข้างต้น; ไม่มี selector consumer อื่นจาก source/config |
| `backend/services/player_profiles.py::_number` (เดิม `backend/player_profile.py`) | helper private ไม่มี decorator/registration และไม่มี reference ใน AST/source ทั้ง backend/research/tests/scripts; route import เฉพาะ `build_profile/search_players`, ไม่มี dynamic getattr/import ของ helper นี้ |
| `@testing-library/user-event` | ชุดทดสอบใช้ `fireEvent` จาก testing-library/react; ไม่มี setup script, config, CLI หรือ import ของ user-event และ testing-library/react ไม่ต้องพึ่งมัน; uninstall แล้ว npm tree/tests/build ผ่าน |

ไม่ได้ลบ localStorage ของผู้ใช้; โค้ดที่ลบกู้จาก Git หรือ snapshot ได้ คง parser CLI, ETL CLI, `mark_reference`, `fix_bomb_sites`, routes เดิม, migration history, dynamic weapon icons, research scripts และไฟล์ untracked ที่ผู้ใช้กำลังทำอยู่ เพราะมี entry point หรือหลักฐานการใช้งาน

## ผลตรวจหลังแก้

- ติดตั้ง Python dependency ใน venv ใหม่ด้วย pip; `pip check`, compileall, Ruff ผ่าน
- Backend 11 tests ผ่าน (เดิม 9 + RQ finished/failed 2 cases); Redis emulator ใช้ RQ จริง แต่ตัวประมวลผลเดโมใน unit test เป็น stub
- Parser เดโมจริง `match730_003846939710958076073_1892608591_154.dem` ให้ผลตรง baseline: ผู้เล่น 10, รอบ 6, kills 41, damages 161, player_rounds 59, grenades 41, positions 8,510 เปรียบเทียบข้อมูลครบทุก record โดยไม่รวม generated_at และลำดับแถวของตาราง; ตรวจซ้ำใน venv ใหม่ผ่าน
- PostgreSQL 18 cluster ชั่วคราวที่ `127.0.0.1:55432`: migration up → down → up และ `alembic check` ผ่าน; โหลด normalized document ลง DB และ views ใช้งานได้ ไม่แตะฐานข้อมูลเดิม
- `npm ci` ผ่านบน Node 24.18.1; typecheck, 6 tests และ production build ผ่านทั้ง Node 24.18.1 และ Node 26.13.0; npm audit ไม่พบช่องโหว่ใน dependency tree ที่ตรวจ
- Chromium browser test ผ่านทั้ง Vite dev และ production preview: `/login` → POST `/auth/guest` → GET `/api/matches` → หน้า `/matches/:demo/rounds/1` แสดง radar จาก API/DB จริง ไม่มี API mock และไม่มี pageerror
- แก้ CSS comment ที่ขาด `/*` แล้ว syntax warning หาย; chunk-size warning ของ main/ECharts ยังมีอยู่
- Reviewer เปรียบเทียบกับ snapshot ก่อนงาน ไม่พบ Critical/Important issues ในส่วนที่ตรวจ

ระหว่างงานพบ pytest เก็บ test จาก snapshot ใน artifacts ด้วย จึงกำหนด `testpaths = ["tests"]` ให้ discovery ตรง test suite จริง การโหลด JSON ผ่าน CLI บน Windows เคยติด UnicodeEncodeError ตอนพิมพ์ log หลัง transaction commit แล้ว; รันทดสอบด้วย `PYTHONUTF8=1` ผ่าน เป็นข้อจำกัด encoding ของ shell ที่ตรวจ ไม่ใช่ข้อมูล parser เปลี่ยน Node 26 มี experimental localStorage warning ระหว่าง unit test แต่ test ผ่าน

`git diff --check` ยังรายงาน blank lineท้ายไฟล์ Heatmap เดิมใน snapshot ก่อนเริ่ม dependency audit จึงไม่รวมเป็น regression จากงานรอบนั้น

## เส้นทางอัปโหลดและบทบาทของ parser

`backend/services/parser.py` ใช้ Polars DataFrame จัดข้อมูลในหน่วยความจำ ไม่ได้อ่านหรือเขียน Excel ในเส้นทางนี้:

1. ผู้ใช้ Steam อัปโหลด `.dem` ผ่าน `POST /api/demos`; API ตรวจสิทธิ์/โควตา เก็บไฟล์ใน `DEMOS_DIR` (ค่าเริ่มต้น `demos/uploads/`) และสร้างสถานะ `queued` ในตาราง `matches`
2. `enqueue_parse(match_id)` ส่งงานเข้าคิว Redis/RQ หรือเริ่ม thread ตาม `QUEUE_BACKEND`; API ตอบ HTTP 202 โดยไม่รอ parse
3. `backend.jobs.demo_processing.parse_demo` เปลี่ยนสถานะเป็น `parsing` แล้วเรียก `backend.services.parser.parse_demo` เพื่อแปลงเดโมเป็นข้อมูล match/players/rounds/events/positions
4. Worker เก็บ JSON ใน `JSON_DIR` (ค่าเริ่มต้น `output/json/`) และเรียก ETL โหลดข้อมูลลง PostgreSQL ก่อนเปลี่ยนสถานะเป็น `done`; หากล้มเหลวบันทึก `error` และข้อความผิดพลาด
5. หน้าเว็บเรียก `/api/matches` ซ้ำทุก 2 วินาทีขณะมีงาน queued/parsing เมื่อเสร็จหน้ารีวิวเรียก `/api/review/...` เพื่ออ่านข้อมูลจาก backend

JSON เป็นผลกลางสำหรับตรวจย้อนหลัง/โหลดซ้ำ ส่วนหน้าเว็บอ่านผ่าน API และฐานข้อมูล การทดสอบครั้งนี้ยืนยัน parser, ETL และ guest review แยกจากกัน ยังไม่ได้ยืนยันการอัปโหลดผ่าน Steam ใน browser ครบทั้งสาย

## สิ่งที่ยังยืนยันไม่ได้ / ต้องตัดสินใจต่อ

1. Linux Docker images และ nginx proxy จริงยังไม่ได้ build/run เพราะ Docker daemon ไม่พร้อม; browser test ใช้ Vite proxy กับ Uvicorn จริงแทน ต้องรัน Compose checks อีกครั้งบนเครื่องที่เปิด Docker
2. Database test ใช้ PostgreSQL 18; PostgreSQL 16 deployment ยังต้องตรวจด้วย workflow เดิมใน CI (ไม่ได้เปลี่ยน schema)
3. Redis/RQ ฝั่ง Linux production ยังไม่ได้ทดสอบ end-to-end กับ Redis service จริง; unit tests ใช้ fakeredis และ browser test ใช้ backend แบบ thread
4. Steam OpenID ภายนอก, การอัปโหลดผ่าน browser แบบ Steam account, การ export PDF และการ retrain โมเดลทั้งหมด ไม่ได้อยู่ใน browser smoke test ครั้งนี้
5. หากต้องย้าย awpy 3 ควรทำงาน migration parser แยก พร้อมชุดเดโมหลายแผนที่/รูปแบบและตรวจ parity ของ replay/statistics
6. Render config เดิมที่อ้างสคริปต์ถูกลบ ต้องยืนยันว่าจะกลับมา deploy Render หรือเลิกใช้ก่อนแก้ส่วนนั้น
7. Python direct dependencies ถูก pin แต่ transitive dependencies ยัง resolve ด้วย pip; ไม่มีการเพิ่ม universal Python lockfile ข้าม Windows/Linux ในงานนี้

## แหล่งตรวจเวอร์ชันและ migration

สอบถาม metadata โดยตรงจาก `https://registry.npmjs.org/<package>/latest` และ `https://pypi.org/pypi/<package>/json` เมื่อ 2026-11-04 โดยใช้ stable latest tag ไม่มี prerelease

- [React 19 migration](https://react.dev/blog/2024/04/25/react-19-upgrade-guide)
- [React Router v6 → v7](https://reactrouter.com/7.18.5/upgrading/v6)
- [Vite 5 → 6](https://v6.vite.dev/guide/migration), [6 → 7](https://v7.vite.dev/guide/migration), [7 → 8](https://vite.dev/guide/migration)
- [Vitest migration](https://vitest.dev/guide/migration/), [jsdom releases](https://github.com/jsdom/jsdom/releases)
- [TypeScript 6](https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/), [TypeScript 7](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)
- [Awpy 3 API](https://awpy.readthedocs.io/en/latest/), [Awpy changelog](https://awpy.readthedocs.io/en/latest/changelog.html)
- [Polars 2 migration](https://docs.pola.rs/releases/upgrade/2/), [Pandas 3.1](https://pandas.pydata.org/docs/whatsnew/v3.1.0.html)
- [RQ 3 changes](https://github.com/rq/rq/blob/master/CHANGES.md), [FastAPI release notes](https://fastapi.tiangolo.com/release-notes/)
- [Pydantic changelog](https://docs.pydantic.dev/latest/changelog/), [Pillow 13](https://pillow.readthedocs.io/en/stable/releasenotes/13.0.0.html)
- [Node release schedule](https://nodejs.org/en/about/previous-releases), [nginx stable](https://nginx.org/en/download.html)
