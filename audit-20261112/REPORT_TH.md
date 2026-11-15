# ผลตรวจและทดลองรัน CS2 UNTITLED บน Windows

วันที่ทดสอบ: 12 พฤศจิกายน 2026 (Asia/Bangkok) · ใช้ข้อมูลจากการรันบนเครื่องนี้

โปรเจกต์ build และเปิดใช้งานด้วย Docker ได้จริง บริการทั้ง 5 ตัว healthy, restore ฐานข้อมูลสำเร็จ และทดสอบ Guest กับข้อมูล Mirage ได้ Backend tests ผ่าน 125 ข้อ, frontend tests ผ่าน 31 ข้อหลังแก้ตัวเลือกปุ่มใน test, TypeScript ผ่าน และ browser E2E ผ่าน 3 ข้อ พบข้อบกพร่องที่ยังคงอยู่คือ canvas บังปุ่มซูม Heatmap และ footer ของ PDF ทับตารางหน้า 4 ส่วน Coach เทรนใหม่ไม่ได้เนื่องจากฐานข้อมูลไม่มี reference matches

เว็บชุดทดสอบที่เปิดค้างไว้: **http://127.0.0.1:13000** → เข้า Guest

## ขอบเขตและหลักฐานต้นทาง

โฟลเดอร์ที่ตรวจจริงคือ `C:\Users\Juk\Downloads\CS2-UNTITLED\CS2-UNTITLED` ไม่ได้แตก ZIP ซ้ำ และไม่ได้เทียบ hash กับไฟล์ ZIP ต้นฉบับ ตรวจจากโฟลเดอร์ที่ผู้ใช้ระบุ

อ่าน `PACKAGE_MANIFEST.txt`, `README.md`, `SETUP_TH.md`, `research/README.md`, `Dockerfile` และ `docker-compose.yml` ก่อนเริ่มบริการ ค่า manifest ตรงกับที่ขอ:

| รายการ | ผลตรวจ |
|---|---|
| Created | `2026-11-11` |
| Source branch | `backup-v2` |
| Source commit | `336aaea` |
| หลักฐาน Git | ไม่มี `.git` จึงยืนยัน branch/commit ได้เฉพาะค่าที่ manifest ระบุ |
| Source | พบ `backend/`, `frontend/`, `research/`, migration และชุดทดสอบ |
| `backup/database.dump` | อ่านได้ 13,788,056 ไบต์, magic `PGDMP`, PostgreSQL CUSTOM archive |
| `data/all_kills.csv` | อ่านได้ 24,093,162 ไบต์, 50,372 แถว, 347 demo filenames, 7 แผนที่ ไม่มี Mirage |
| `data/mirage_kills.csv` | อ่านได้ 2,022,854 ไบต์, 7,270 แถว, 50 demo filenames, ทั้งหมดเป็น `de_mirage` |
| ไฟล์ `.dem` ดิบ | ไม่พบ สอดคล้องกับรายการ Excluded |

Manifest ระบุเพียงว่ามีโมเดล 8 แผนที่ ไม่ได้แจกแจงชื่อแผนที่ จึงใช้โฟลเดอร์จริง 8 แห่งเป็นรายการตรวจ ไม่อ้างว่ารายชื่อเหล่านี้ปรากฏใน manifest

| โฟลเดอร์ใต้ `output/models/` | `grid_ml1.json` | `coach_model.json` | `player_role.json` | Backend loaders |
|---|---|---|---|---|
| `de_ancient` | ครบ | ครบ | ครบ | โหลดได้ |
| `de_anubis` | ครบ | ครบ | ครบ | โหลดได้ |
| `de_cache` | ครบ | ครบ | ครบ | โหลดได้ |
| `de_dust2` | ครบ | ครบ | ครบ | โหลดได้ |
| `de_inferno` | ครบ | ครบ | ครบ | โหลดได้ |
| `de_mirage` | ครบ | ครบ | ครบ | โหลดได้ |
| `de_nuke` | ครบ | ครบ | ครบ | โหลดได้ |
| `de_overpass` | ครบ | ครบ | ครบ | โหลดได้ |

ไม่มีไฟล์บังคับที่หายหรืออ่านไม่ได้จากรายการข้างต้น JSON ทั้ง 24 ไฟล์อ่านได้ หลักฐาน path, ขนาด, keys และ SHA-256 อยู่ใน [inventory.json](inventory.json) และ [model-loads.json](model-loads.json) ตรวจซ้ำหลังงานแล้วไฟล์ต้นฉบับทั้ง 33 รายการใน inventory มี hash เดิมทั้งหมด ([evidence-summary.json](evidence-summary.json))

มี path ที่อ้างใน metadata ของ Player Role Mirage เดิมแต่ไม่พบในแพ็ก: `output/recovery/mirage-role-training.csv` เป็น `training_source` ของ artifact เดิม ไม่ใช่ไฟล์บังคับที่ manifest รับรอง รอบนี้ใช้ `data/mirage_kills.csv` ที่แนบมาจริงแทน

## สภาพแวดล้อม

| รายการ | ค่าที่ตรวจพบ |
|---|---|
| ผู้ผลิต / รุ่นเครื่อง | ASUS Vivobook 15 X1504MA |
| CPU | Intel(R) Core(TM) 5 320, architecture code 9 = x64 |
| Windows | Microsoft Windows 11 Home Single Language, version `10.0.26200`, 64-bit |
| PowerShell | Windows PowerShell Desktop `5.1.26100.9711` |
| Python บน Windows | `3.12.0` |
| Node / npm บน Windows | `v26.13.0` / `11.20.0` |
| Docker Desktop | `4.97.0 (244584)` |
| Docker client | `29.9.2`, `windows/amd64` |
| Docker Engine | `29.9.2`, `linux/amd64` (`docker info`: x86_64) |
| Docker Compose | `v5.6.1` ที่ติดตั้งจริง ใช้คำสั่ง `docker compose` ได้; ไม่ใช่เวอร์ชัน v2 |
| Context / containers | `desktop-linux`, Linux containers |
| Backend | Desktop setting `EngineTypeWindows=wsl2`; kernel `6.18.58.1-microsoft-standard-WSL2` |

WSL แสดง Ubuntu และ docker-desktop เป็น distro version 2 และสถานะ Stopped ณ snapshot ที่ตรวจ แม้ Docker Engine ตอบสนอง จึงใช้ kernel กับ Desktop setting เป็นหลักฐาน backend เพิ่มเติม ไม่ได้รันคำสั่งใน Ubuntu หรือ distro ใดโดยตรง ทุกคำสั่งควบคุมรันจาก PowerShell ฝั่ง Windows; `docker exec`/`docker run` รันโปรแกรมภายใน Linux container ตามที่ระบุใน command log

ใช้ `npm.cmd` บน PowerShell และใช้ `;`/การตรวจ exit code แทนรูปแบบคำสั่งที่ต้องใช้ PowerShell 7 ไม่มีการเปลี่ยน platform หรือ architecture ของ image

หลักฐาน: [environment.log](logs/environment.log), [docker-backend.log](logs/docker-backend.log), [docker-desktop-settings.log](logs/docker-desktop-settings.log)

## การแยกชุดทดสอบและจุดต่างจากคู่มือ

Compose เดิมมีชื่อ `cs2-postgres`, `cs2-redis`, `cs2-api`, `cs2-worker`, `cs2-frontend` ตายตัว และมี container เหล่านี้อยู่แล้วในสถานะหยุด จึงเปลี่ยนชื่อเฉพาะชุดทดสอบเป็น `cs2audit-*` ด้วย [compose.override.yml](compose.override.yml) ใช้ project `cs2audit20261112` และ named volume ใหม่ `cs2audit20261112_pgdata` ซึ่งไม่ใช่ external volume ไม่มี explicit volume name ร่วมกับชุดเดิม

| บริการ | Compose เดิม publish | ชุดทดสอบ publish |
|---|---|---|
| Frontend | `0.0.0.0:3000 → 8080` | `127.0.0.1:13000 → 8080` |
| API | `127.0.0.1:8000 → 8000` | `127.0.0.1:18000 → 8000` |
| PostgreSQL | `127.0.0.1:5433 → 5432` | `127.0.0.1:15433 → 5432` |
| Redis | `127.0.0.1:6379 → 6379` | `127.0.0.1:16379 → 6379` |

Snapshot ของ TCP listeners ไม่พบพอร์ตเดิมทั้ง 4 พอร์ตถูกใช้งาน และ bind-check ของพอร์ตใหม่ผ่าน เลือกพอร์ตใหม่เพื่อคงความเป็นอิสระของชุดทดสอบ ไม่ได้หยุดหรือเปลี่ยน container เดิม ใช้ `!override` แทนรายการ ports/volumes เพื่อไม่ให้ Compose merge แล้วคงพอร์ตหรือ bind mount เดิมไว้

สร้าง `audit-20261112/.env` จาก `.env.example` พร้อมรหัสผ่าน DB และ JWT key แบบสุ่ม ใช้ DB `cs2_audit` ไม่ส่งมอบค่าลับในรายงานหรือ ZIP Effective config ที่บันทึกถูกแทนค่าลับด้วย `<REDACTED>`

แยก output และ demos ไปที่ `audit-20261112/output` และ `audit-20261112/demos`; mount `output/models` ต้นฉบับแบบ read-only ก่อนทดลองเทรน ไม่เขียนทับ artifact เดิม กำหนด `GUEST_DEMO_FILE` เป็นแมตช์ ID 9 บน Mirage เพื่อทดสอบเว็บและ ML ของแผนที่เดียวกัน

จุดต่างที่พบจากเอกสาร:

- README ระบุ migration head `0022`; ไฟล์ migration, dump และ `alembic current` จริงเป็น `0023`
- README อธิบาย dev account ผ่าน `DEV_USERNAME`/`DEV_PASSWORD`; ไม่พบตัวแปรหรือ flow นี้ใน backend และ `.env.example` ปัจจุบัน ใช้ Guest/Steam ตามโค้ด
- ความเห็นใน Dockerfile บอกว่า Compose ไม่เปิด API ออก host แต่ Compose จริง publish `127.0.0.1:8000`
- คำสั่งเทรน default ใช้ `all_kills.csv` ซึ่งไม่มี Mirage ต้องระบุ CSV ของ Mirage เอง
- CLI เทรน Grid/Role ไม่มี `--output-dir` จึงเรียกฟังก์ชันเทรนเดิมโดยตรงผ่านสคริปต์ audit แล้วเขียนผลไปโฟลเดอร์แยก
- effective config รอบแรกของสคริปต์ audit ยังเป็น Redis 6379 เพราะ `.env.example` ไม่มีบรรทัด `REDIS_PORT`; แก้ override เป็น 16379 ก่อนเริ่มบริการแล้ว

หลักฐาน effective config ก่อน up: [effective-config-final.log](logs/effective-config-final.log)

## Restore, migration และ worker

เปิด db/redis แล้วใช้ `up -d --wait` รอ healthcheck ทั้งคู่ผ่าน คัดลอก dump ด้วย `docker cp` ซึ่งรักษาไบต์ไฟล์ แล้วใช้ `pg_restore` ใน PostgreSQL container ไม่มีการ pipe ไฟล์ไบนารีผ่าน PowerShell

`pg_restore --list` ระบุ CUSTOM format, dump version 1.15, archive จาก PostgreSQL/pg_dump `16.15`, 129 TOC entries การ restore ด้วย `--no-owner --no-acl --exit-on-error` จบด้วย exit 0

| ผลหลัง restore | จำนวน |
|---|---:|
| Public tables | 13 |
| Matches | 8 |
| Rounds | 175 |
| Kills | 1,257 |
| Player positions | 324,746 |
| Player-round rows / equipment ที่มีค่า | 1,740 / 1,740 |
| Reference matches / reference positions / reference equipment | 0 / 0 / 0 |

แมตช์ทั้งหมดมี `status=done`, `source=upload`: ID 8 Nuke, 9/41/43/51 Mirage, 42/46 Dust2 และ 52 Ancient รายชื่อ demo เต็มอยู่ใน [database-baseline.log](logs/database-baseline.log) การรวมรอบและ equipment ต่อแผนที่อยู่ใน [coach-database-counts.log](logs/coach-database-counts.log)

API เริ่มด้วย `alembic upgrade head` สำเร็จ `alembic current` แสดง `0023 (head)` เนื่องจาก dump อยู่ที่ head อยู่แล้ว จึงยังไม่ได้พิสูจน์การไล่ migration ทั้งหมดจากฐานข้อมูลว่าง

API, worker และ frontend build ผ่านทั้ง baseline และรอบที่ปรับ `.dockerignore` ขณะตรวจทั้ง 5 services เป็น healthy API `/api/health` ตอบ 200: DB ต่อได้, 8 matches, 1,257 kills, Redis queue OK, queued=0, workers=1

ตรวจ worker เกินกว่าการเชื่อมต่อคิว โดย enqueue งาน arithmetic probe `builtins.sum([1,2,3])` ลงคิว `parse` ที่แยกสำหรับชุดทดสอบ พบ job `edb0c15d-3d5b-43ec-ad61-49f106172bdd` เป็น FINISHED ผล 6 และ worker log แสดง Successfully completed งานนี้เป็น probe ของการส่ง/ประมวลผลงาน ไม่ใช่งาน parse `.dem` จริง

หลักฐาน: [restore.log](logs/restore.log), [dump-list.log](logs/dump-list.log), [runtime-status.log](logs/runtime-status.log), [migration-current.log](logs/migration-current.log), [startup-logs.log](logs/startup-logs.log), [worker-probe.log](logs/worker-probe.log), [worker-job-logs.log](logs/worker-job-logs.log)

## ตารางผลทดสอบ

สถานะ “ข้อมูลไม่พอ” หมายถึงเงื่อนไขข้อมูลของงานนั้นไม่ครบ; “ทดสอบไม่ได้” หมายถึงไม่มีอินพุต/เครื่องมือให้พิสูจน์ขั้นตอนนั้น ผลล้มเหลวของเครื่องมือตรวจสอบแยกจากข้อบกพร่องแอปตามรายละเอียดด้านล่าง

| รายการ | สถานะสุดท้าย | หลักฐาน / สิ่งที่สังเกต |
|---|---|---|
| Source, dump, CSV และโมเดลครบ | ผ่าน | 24 JSON, 8 map directories, inventory และ hashes |
| ยืนยัน Git branch/commit จาก history | ทดสอบไม่ได้ | ไม่มี `.git`; มีเฉพาะ manifest |
| Docker baseline build | ผ่าน | exit 0, `baseline-build.log` |
| DB/Redis และ restore | ผ่าน | healthy, pg_restore exit 0, ตรวจตาราง/จำนวนจริง |
| API / migration / frontend / worker health | ผ่าน | ทั้ง 5 healthy, migration 0023 |
| ประมวลผล RQ job | ผ่าน | arithmetic probe FINISHED ผล 6 |
| Guest และเปิดแมตช์จริง | ผ่าน | ID 9 Mirage, 24 รอบ, 179 kills |
| Replay | ผ่าน | เล่น/หยุด เวลา 0→1.2 วินาที, roster 10 คน, เปิดรอบ 1/2 |
| Heatmap: ข้อมูล/ตัวกรอง/scroll wheel | ผ่าน | 179 จุด, เปลี่ยน deaths, wheel ซูม 1.2 เท่า |
| Heatmap: คลิกปุ่มซูม | ล้มเหลว | canvas intercepts pointer events |
| Economy | ผ่าน | 24 รอบ, เลือก As CT, ขยาย buy-type row |
| Analysis | ผ่าน | ข้อมูลจุดตายจริง; กรอง CT ได้ 81 deaths / 61 cells |
| Opening Routes | ผ่าน | catalog 10 คน, playback 0→1.2 วินาที, 8 live markers |
| Coach ใช้โมเดลที่แนบมา | ผ่าน | HTTP 200, T/CT มีคำแนะนำครบฝั่งละ 24 team-rounds |
| ส่งออก PDF และเปิดไฟล์ | ผ่าน | ไฟล์ all-sides 903,754 ไบต์, 5 หน้า, เปิด/เรนเดอร์ได้ |
| PDF จัดหน้าโดยไม่มีการทับกัน | ล้มเหลว | footer ทับตาราง Economy หน้า 4 และเนื้อหาท้ายหน้ายาวเกินพื้นที่ |
| Backend tests | ผ่าน | pytest 125 passed, exit 0 |
| Frontend tests หลังแก้ test selector | ผ่าน | 10 files, 31 passed, exit 0 |
| TypeScript | ผ่าน | `npm run typecheck`, exit 0 |
| Frontend production build | ผ่าน | `npm run build`, exit 0; มี chunk-size warning |
| Browser E2E ของโปรเจกต์ | ผ่าน | 3 passed, exit 0, ใช้ API/DB จริง |
| Backend compile | ผ่าน | compileall exit 0 |
| Ruff | ล้มเหลว | 5 errors, exit 1; import ordering/unused import |
| โหลดโมเดลทุกแผนที่ / schema inference | ผ่าน | loaders ทั้ง 24 ไฟล์; T/CT Coach/Role probe รันได้ทุกแผนที่ |
| Endpoint กรณีข้อมูลพอ/ไม่พอ | ผ่าน | HTTP 200 พร้อม availability/reason ตามข้อมูล; รายละเอียดถัดไป |
| เทรน Mirage Grid ML1 / Player Role | ผ่าน | CSV จริง 50 แมตช์, artifact และ metrics จากการรันนี้ |
| Backend ใช้โมเดลใหม่ | ผ่าน | MODEL_ROOT ใหม่, HTTP 200, log path และ SHA-256 ตรง artifact |
| เทรน Coach ใหม่ | ข้อมูลไม่พอ | reference 0; CLI exit 1 ด้วยเงื่อนไข 120 team-rounds/8 matches ต่อฝั่ง |
| อัปโหลดและ parse `.dem` ใหม่จริง | ทดสอบไม่ได้ | ไม่มี `.dem` ดิบในแพ็ก; unit tests ของ parser/upload ยังรันผ่าน |

## การใช้เว็บและ PDF

ใช้ Chromium ผ่าน Playwright บน Windows ขนาด viewport 1440×1000 ล็อกอิน Guest ผ่าน UI ไม่มีการ mock API เลือก `match730_003837851867249901660_1125265208_142.dem` (ID 9, `de_mirage`) ชื่อทีมใน DB เป็น null จึงเห็นชื่อ fallback Team A/Team B คะแนนที่ระบบแสดงคือ CT 16 — T 8

Replay อ่าน positions จากฐานข้อมูลและแสดงชื่อผู้เล่น/อุปกรณ์จริง [replay.png](replay.png) เป็นรอบ 2 ที่โหลดเสร็จแล้ว ภาพ [followup-replay.png](followup-replay.png) ถ่ายทันทีหลังนำทางรอบ 2 จึงยังมีสถานะ Loading positions ไม่ใช้ภาพนั้นเพียงภาพเดียวตัดสินผล

Heatmap แสดงจุดจริงและเปลี่ยนตัวกรองได้ [followup-heatmap-wheel.png](followup-heatmap-wheel.png) ปุ่ม zoom ถูก canvas ทับตาม hit testing ของ Playwright การทดสอบ scroll wheel ใช้ input ปกติ ไม่ใช้ force-click หรือเรียก handler แทน เพื่อคงหลักฐานว่าปุ่มยังมีบั๊ก

Economy เลือก As CT และขยายรายการได้; Analysis เปลี่ยนฝั่งแล้ว network response เปลี่ยนเป็น side=ct และข้อมูล 81 deaths; Opening Routes แสดง catalog 10 คน, เล่นเวลาและ marker ได้ [opening.png](opening.png), [followup-economy.png](followup-economy.png), [followup-analysis-filters.png](followup-analysis-filters.png)

ไม่พบ uncaught page errors ในสองรอบตรวจเว็บ พบ `/auth/me` ตอบ 401 ก่อนล็อกอิน Guest รอบละ 2 ครั้งและ console resource error ที่ตรงกัน หลังล็อกอินไม่พบ network response error ของ feature endpoints ที่ตรวจ ไม่จัด 401 ก่อนล็อกอินเป็นระบบล้มเหลว

PDF ที่ส่งออกผ่านปุ่มของแอป:

- [match_mirage_id9_all.pdf](match_mirage_id9_all.pdf): ทั้งสองฝั่ง, 24 รอบ, 5 หน้า, 903,754 ไบต์ เป็นไฟล์หลัก
- [match_Team-A-vs-Team-B.pdf](match_Team-A-vs-Team-B.pdf): รอบแรก scope T, 12 รอบ, 5 หน้า, 905,721 ไบต์

เปิด PDF ด้วย PyMuPDF และเรนเดอร์หน้า 1 กับหน้า 4 เพื่อตรวจด้วยภาพจริง หน้า 1 ระบุ demo, Mirage, 24 rounds, CT16/T8 และสรุป 179 deaths ตรงแมตช์ที่เลือก หน้า 4 มีกราฟ/ตาราง Economy จริง แต่ footer เส้น Page 4/5 ทับตารางช่วงรอบ 21 และเนื้อหาท้ายหน้ายาวจนถูกตัดบางส่วน จึงให้ผ่านเฉพาะ export/open/content และให้ล้มเหลวด้านการจัดหน้า

PDF เป็นภาพ raster ในแต่ละหน้า (text extraction ได้ 0 อักขระ) อ่านจากภาพได้ แต่ค้น/คัดลอกข้อความไม่ได้ หลักฐาน [pdf-validation.json](pdf-validation.json), [หน้า 1](match_mirage_id9_all-page1.png), [หน้า 4](match_mirage_id9_all-page4.png)

## การโหลดโมเดลและ HTTP endpoints

ทดสอบ loaders จากโค้ด backend จริงทั้งใน probe และใน API container เลือก artifact ตาม map ไม่มี legacy fallback ที่ถูกใช้แทนไฟล์ที่ครบอยู่ใน `output/models/<map>/` ตรวจ Grid ด้วย parser จริง, Coach feature arrays/version และทดลอง forest inference, Role preprocess/centers และการ assign T/CT โดยใช้เวกเตอร์ probe จากค่ากลางของ artifact (เป็น schema probe ไม่ใช่ validation accuracy)

หลักฐาน [runtime-original-models.log](logs/runtime-original-models.log) บันทึก path/hash ของ artifact เดิมใน API container; [all-map-schema-inference.log](logs/all-map-schema-inference.log) บันทึก inference probe ของ active models ทั้ง 8 แผนที่ ไม่มี exception

| Request / กรณี | HTTP | ผล |
|---|---:|---|
| `/api/review/<demo>/rounds/1` | 200 | มี match/round/grid/deaths/damages/grenades |
| รอบ 999 ที่ไม่มี | 404 | ไม่สร้างข้อมูลรอบปลอม |
| `/api/analysis/player-behavior?demo=<demo>` | 200 | 20 player-side profiles, available ทั้งหมด, ฝั่งละ 12 รอบ/คน |
| Role กรอง `players=1` ซึ่งไม่มี | 200 | players ว่าง |
| `/api/coach/<demo>?side=t` และ `ct` | 200 | available, ฝั่งละ 24 team-rounds มีคำแนะนำ |
| Coach `side=invalid` | 422 | ปฏิเสธตัวกรองผิด |
| Analysis ข้อมูล match จริง / กรองผู้เล่นที่ไม่มี | 200 | มี cells / deaths=0 และ cells ว่าง ตามลำดับ |
| Guest ขอ reference analysis | 403 | จำกัดการเข้าถึงตาม Guest |
| Opening Routes ผู้เล่นจริง / ID1 ที่ไม่มี | 200 | มีเส้นทาง / ไม่มีรอบ ตามลำดับ |
| Role มีเพียง 1 รอบในฐานข้อมูล negative แยก | 200 | 10 profiles, available=false, `insufficient_rounds` |
| Coach equipment=NULL ในฐานข้อมูล negative แยก | 200 | 1 team-round, options ว่าง, `missing_economy` |

กรณีไม่พอรอบ/ขาด equipment เป็น controlled fixture: restore dump อีกครั้งลง `cs2_audit_negative`, เหลือ player_rounds ของ ID9 เฉพาะรอบ 1 และตั้ง equip_value เป็น NULL เฉพาะในสำเนานี้ เปิด API ชั่วคราวที่ 18001 แล้วเรียก HTTP จริง ก่อนหยุด/ลบ container ชั่วคราว ไม่มีการเปลี่ยน source เป็น reference ฐานข้อมูลหลัก `cs2_audit` ยังมี ID9 player_rounds/equipment 240/240, matches 8 และ positions 324,746 เท่าเดิม

Responses baseline อยู่ใน `api-*.json` กับ [api-results-baseline.json](api-results-baseline.json); หลังใช้โมเดลใหม่อยู่ใน [endpoints-retrained/](endpoints-retrained/); negative อยู่ใน [negative-endpoint-results.json](negative-endpoint-results.json), [negative-api-role.json](negative-api-role.json), [negative-api-coach.json](negative-api-coach.json)

## ผลเทรน ML จากการรันนี้

แหล่งข้อมูลทั้งสองขั้นตอนคือไฟล์เดียวกันบน host `data/mirage_kills.csv`, ภายใน container คือ `/workspace/data/mirage_kills.csv`, SHA-256 `4e8be10d7ecf54750f0d0f215f3e2c6830b73c366a2637f2fa0f2fa37ff9b891` อ่าน 7,270 kill rows จาก 50 demo filenames ไม่ได้นำ matches ที่ upload ใน PostgreSQL มาใช้เทรน

ใช้ [ml_audit.py](ml_audit.py) เรียก `train_grid_model`/`save_results` และ `load_kills_csv`/`train_from_kills_csv` จาก `research/models` เดิมโดยตรง เพื่อเลือก output แยก เนื่องจาก CLI ไม่มี output option รุ่น dependency ที่ตรวจจาก container: NumPy 2.5.4, pandas 3.1.0, scikit-learn 1.9.1, SciPy 1.18.1 ใช้ cached image `cs2-analytics-api:latest` เป็นสภาพแวดล้อม Python โดย mount source ปัจจุบันแบบ read-only ที่ `/workspace`; รุ่น runtime dependencies ตรง pins ที่ตรวจ ไม่ได้ใช้ source ภายใน cached image แทน source ปัจจุบัน

| โมเดล | การตั้งค่า / ตัวอย่าง | Metrics ที่ได้จริง |
|---|---|---|
| Grid ML1 | MeanShift bandwidth=300, min_bin_freq=15, bin_seeding=true, cluster_all=false; seed=0; match bootstrap 20; 7,158 valid enemy duels จาก 7,270 raw rows/50 matches | 17 hotspots; coverage **0.7479742945**; stability **0.7941176471**; descriptive CT win **0.5399552948** |
| Player Role T | StandardScaler + KMeans, k=6, n_init=50, seed=42, min_rounds=5, bootstrap 40 (bootstrap KMeans n_init=20); 470 player-match-side profiles | silhouette **0.091216**, bootstrap ARI **0.404127** |
| Player Role CT | ตั้งค่าเดียวกัน แต่เทรนแยกจาก T; 470 profiles | silhouette **0.113937**, bootstrap ARI **0.513507** |

ตัวเลขเหล่านี้มาจากการรันครั้งนี้ใน [train-mirage.log](logs/train-mirage.log) และ [training-results.json](training-results.json) ไม่ใช่ตัวเลขตัวอย่างในเอกสาร Grid CT win เป็นสถิติเชิงพรรณนา ไม่ใช่ held-out accuracy และ silhouette/ARI ของ Role ไม่ใช่ความแม่นยำต่อ label บทบาทที่ทราบจริง

Artifact ใหม่อยู่ใน [retrained/de_mirage/](retrained/de_mirage/): `grid_ml1.json`, `grid_ml1_hotspots.csv`, `player_role.json`, `player_role_profiles.csv` ไม่เขียนทับ `output/models`

สร้าง `active-models/` โดย copy JSON ต้นฉบับของทุก map แล้วแทนเฉพาะ Grid/Role Mirage ด้วยผลใหม่ Coach ทุก map ยังคงเป็น artifact เดิม รายการ source/target/hash มีใน [active-models-manifest.json](active-models-manifest.json)

ตั้ง API `MODEL_ROOT=/app/retrained` และ mount `active-models` read-only ผ่าน [compose.retrained.yml](compose.retrained.yml) ใช้ [serve_retrained.py](serve_retrained.py) เพิ่ม log รอบ loader จริงที่ endpoint เรียก โดยไม่เปลี่ยนค่าที่ loader คืน เมื่อเรียก Round Review และ Player Behavior ได้ HTTP 200 และ API log ระบุ:

```text
load_grid_model → /app/retrained/de_mirage/grid_ml1.json
SHA-256 65c660002e49f2d56c11385e2875fd6491d25b58597244955733e19deed14037
load_role_model → /app/retrained/de_mirage/player_role.json
SHA-256 f191663f41233fa2f8a7f76e792741e00aa83cf60e3ad6bb8398e3327ddbe87f
```

Grid ที่เทรนใหม่มี hash เท่าต้นฉบับ สอดคล้องกับ deterministic training ของ CSV/ค่าตั้งเดียวกัน จึงใช้หลักฐาน path จาก live request ประกอบ ไม่ใช้ hash อย่างเดียวเป็นหลักฐานการสลับไฟล์ Player Role hash เปลี่ยนและ training_source เป็น CSV Mirage ที่ใช้จริง หลักฐาน [retrained-load-logs.log](logs/retrained-load-logs.log), [runtime-retrained-models.log](logs/runtime-retrained-models.log)

## Coach training และความพร้อมของข้อมูล

`research/models/coach_ml.py` เรียก `load_coach_facts(..., reference_only=True)` ต้องมีอย่างน้อย **120 complete team-rounds จาก 8 reference matches ต่อฝั่ง** โดยต้องมีผู้เล่น 5 คน/equipment ครบ, start tick/tickrate และ snapshots ในช่วงประมาณ 5/15/25 วินาที (คลาดได้ไม่เกิน 0.6 วินาที, มีผู้เล่นพร้อม place อย่างน้อย 3 คน) รวม utility ช่วงเปิดรอบ

PostgreSQL ที่ restore มี reference matches=0, reference positions=0, reference equipment=0 แม้ upload data จะมีครบจำนวนมาก จึงทดลองคำสั่งเดิมจริงแล้วได้ exit 1:

```text
ValueError: Insufficient reference data: need 120 complete team-rounds across 8 matches per side
```

ไม่มี artifact/metrics Coach ที่เทรนใหม่ในรอบนี้ และไม่ได้แปลง upload ให้เป็น reference เพื่อให้ผ่าน การ inference ด้วย Coach ที่แนบมายังทำงานได้ เพราะอ่าน JSON เดิม ซึ่ง endpoint ระบุว่าเทรนจาก 49 reference matches ในอดีต ค่า validation/experimental ที่อยู่ใน response เป็น metadata ของ artifact เดิม ไม่ใช่ผลเทรนใหม่รอบนี้

หลักฐาน [reference-counts.log](logs/reference-counts.log), [coach-train-baseline.log](logs/coach-train-baseline.log), [api-coach-t.json](api-coach-t.json)

## Baseline, การแก้ไข และผลรันซ้ำ

| ขั้น | ก่อนแก้ / ผลแรก | หลังดำเนินการ |
|---|---|---|
| Backend tests ก่อนติดตั้ง dependencies | exit 1: `No module named pytest` | สร้าง venv แยกและติดตั้ง requirements-dev pins; 125 passed |
| TypeScript ก่อน `npm ci` | exit 1: `'tsc' is not recognized` | หลังติดตั้งผ่าน exit 0 |
| Frontend tests ก่อน `npm ci` | exit 1: `'vitest' is not recognized` | หลังติดตั้งพบ 30 passed / 1 failed จริง |
| Frontend tests หลังติดตั้ง ก่อนแก้ test | `Found multiple elements with the role "button" and name "EN"` | scope query ด้วย `within(lang-toggle)` แล้ว 31 passed |
| E2E ก่อนติดตั้ง | exit 1: `'playwright' is not recognized` | ติดตั้ง Chromium แล้ว 3 passed |
| Docker build เดิม | exit 0 | หลังยกเว้น audit folder และ rebuild ผ่าน exit 0 |
| Browser script รอบแรก: Replay | waitForURL glob ไม่รองรับ query `?t=0.0` | ใช้ pathname predicate แล้วผ่าน ไม่ใช่บั๊ก navigation ของแอป |
| Browser script รอบแรก: Economy | หาปุ่มชื่อ CT แต่ชื่อจริงคือ As CT | แก้ locator แล้วเลือก/ขยายรายการผ่าน |
| Browser script: Heatmap | canvas intercepts zoom click | ทดสอบ wheel ต่อได้; ปุ่มยังเป็นบั๊กที่ไม่ได้แก้ |

ไฟล์ในโปรเจกต์ที่แก้จริงมี 2 ไฟล์:

1. `frontend/src/features/coach/coachTranslation.test.tsx`: จำกัดปุ่ม TH/EN ให้อยู่ใน language switcher ของแอป เนื่องจากมีอีกชุดสำหรับ PDF จึงไม่ลด assertion หรือบังคับให้ test ผ่านโดยข้ามพฤติกรรม
2. `.dockerignore`: เพิ่ม `audit-*/` เพื่อไม่ copy `.env` ทดสอบ, venv และหลักฐานเข้า image รอบถัดไป

Patch และต้นฉบับก่อนแก้อยู่ใน [changes.patch](changes.patch), [coachTranslation.test.before.tsx](coachTranslation.test.before.tsx), [dockerignore.before.txt](dockerignore.before.txt) สคริปต์/Compose overrides ใน `audit-20261112` เป็นไฟล์เพิ่มเพื่อการตรวจสอบ ไม่ได้แก้ inference/training source หรือ logic ของแอป

ข้อผิดพลาดของเครื่องมือตรวจสอบที่เก็บไว้แยกจากบั๊กแอป:

- run.py รอบแรกพิมพ์ Unicode ออก console cp874 ไม่ได้หลังเขียน UTF-8 log สำเร็จ จึงเห็น wrapper exit 1 แม้ child build/Playwright install/build บางคำสั่ง exit 0 อ้างอิง child exit ใน JSON header; แก้ stdout/stderr เป็น UTF-8 แล้ว
- Negative DB รอบแรกหา `/tmp/database.dump` ไม่พบ เพราะ Compose recreate db container ไปแล้ว แต่ volume ข้อมูลยังอยู่ จึง copy dump ซ้ำก่อน restore สำเนา
- Negative API รอบแรกใช้ `docker run --env-file` กับค่าที่มี inline comment จาก `.env.example` ทำให้ `int('600 # ...')` ล้มเหลว ต่างจาก Compose dotenv parsing แก้สคริปต์ให้ส่งเฉพาะ env ที่จำเป็นแล้ว HTTP negative checks ผ่าน เก็บ error และ log ไว้ ไม่จัดเป็น Compose startup bug

## ปัญหาที่ควรแก้ก่อนทดสอบซ้ำ เรียงตามผลกระทบ

| ลำดับ | ปัญหา / ผลกระทบ | สิ่งที่ต้องแก้ / วิธีตรวจซ้ำ |
|---|---|---|
| 1 | Heatmap zoom buttons ถูก canvas บัง ผู้ใช้เมาส์คลิก +/− ไม่ได้ | ปรับตำแหน่ง/stacking ของ `.heat-box .map-zoom` เหนือ `.heat-stage` แล้วตรวจ ordinary click และ reset; wheel ใช้ได้อยู่ |
| 2 | PDF หน้า 4 footer ทับ Economy table และท้ายหน้าล้น ทำให้เอกสารส่งต่อบางส่วนอ่านไม่ครบ | แบ่งตาราง/turning points ข้ามหน้า, สำรองพื้นที่ footer แล้ว export match9 all-sides และตรวจทุกหน้า |
| 3 | Coach training ทำซ้ำไม่ได้จาก PostgreSQL ชุดนี้ | เพิ่มชุด reference ที่มี positions/equipment ครบและอย่างน้อย 8 matches/120 valid team-rounds ต่อฝั่ง; ไม่ใช้การเปลี่ยน source ของ upload |
| 4 | Ruff ล้มเหลว 5 จุด | จัด import ใน `backend/services/parser.py`, `backend/services/utility_inventory.py`, `scripts/prepare_home_media.py`, `tests/test_utility_inventory.py`; ลบ unused Path ใน `scripts/backfill_utility_inventory.py`; รัน Ruff ซ้ำ |
| 5 | เอกสารไม่ตรง migration/auth/API publish และ Mirage default CSV | ปรับ README/Dockerfile comments/คำสั่งเทรนให้ตรง configuration จริง |
| 6 | Mirage Role artifact เดิมอ้าง CSV recovery ที่ไม่แนบ และ PDF ไม่มี text layer | บันทึก provenance ของ artifact ให้ทำซ้ำได้; หากต้องการค้นข้อความ PDF ให้ปรับ exporter ให้มี text layer |

Frontend test selector ได้แก้และรันทดสอบผ่านแล้ว ข้อบกพร่อง UI/PDF/lint ที่ระบุข้างต้นยังคงอยู่เพื่อให้แยกผลการตรวจจากการแก้ product ได้ชัดเจน

## คำสั่ง ไฟล์ส่งมอบ และสถานะหลังจบ

คำสั่งที่รันจริง พร้อม cwd, UTC timestamp, exit code และระยะเวลาอยู่ใน [commands.jsonl](commands.jsonl) และ [COMMANDS.md](COMMANDS.md) แต่ละรายการลิงก์ไป stdout/stderr ฉบับเต็มใน `logs/` คำสั่งสำคัญใช้ prefix นี้จาก project root:

```powershell
docker compose --env-file audit-20261112/.env -p cs2audit20261112 -f docker-compose.yml -f audit-20261112/compose.override.yml
```

ไฟล์รายงาน/หลักฐานทั้งหมดใน ZIP ส่งมอบไม่รวม `.env`, venv, node_modules หรือ database credentials โมเดล/CSV ต้นฉบับของแพ็กยังมี hash เดิม ชุด container เดิมไม่ได้ถูกเปิด/หยุด/ลบโดยงานนี้ เก็บ container ชุดทดสอบ 5 ตัวและ volume ใหม่ไว้ให้ตรวจต่อ พร้อม active models ที่ใช้ผล Mirage ใหม่ ฐานข้อมูล `cs2_audit_negative` เป็นสำเนาที่ปรับเพื่อทดสอบเท่านั้น API ชั่วคราว 18001 ถูกลบแล้ว

เปิดชุดทดสอบเดิมต่อหรือหยุดเฉพาะชุดนี้ด้วยไฟล์ config ชุดเดียวกัน:

```powershell
docker compose --env-file audit-20261112/.env -p cs2audit20261112 -f docker-compose.yml -f audit-20261112/compose.override.yml -f audit-20261112/compose.retrained.yml up -d
docker compose --env-file audit-20261112/.env -p cs2audit20261112 -f docker-compose.yml -f audit-20261112/compose.override.yml -f audit-20261112/compose.retrained.yml stop
```

ผลนี้ยืนยันฟีเจอร์ที่ทดลองกับข้อมูลที่ระบุและ schema probe ของโมเดลทุก map ไม่ใช่การยืนยันการ parse demo ใหม่หรือความถูกต้องของผลวิเคราะห์ทุกแมตช์ในแพ็ก
