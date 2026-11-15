# คำสั่งและผลการรันจริง

คำสั่งควบคุมรันจาก PowerShell บน Windows; docker exec/run ระบุโปรแกรมที่รันภายใน container
Timestamp ในไฟล์นี้เป็น UTC; เวลาประเทศไทย = UTC+7 ค่าลับถูกปิดไว้ด้วย <REDACTED>
exit code ในตารางเป็นของ child command ที่บันทึกโดย runner รายละเอียด stdout/stderr อยู่ใน log
cwd หลัก: `C:\Users\Juk\Downloads\CS2-UNTITLED\CS2-UNTITLED`

| ชื่อ | UTC | Exit | วินาที | Log |
|---|---|---:|---:|---|
| environment | 2026-11-12T08:02:04.033819+00:00 | 0 | 4.07 | [log](logs/environment.log) |
| effective-config | 2026-11-12T08:02:04.359675+00:00 | 0 | 0.26 | [log](logs/effective-config.log) |
| baseline-pytest | 2026-11-12T08:02:15.801361+00:00 | 1 | 0.05 | [log](logs/baseline-pytest.log) |
| effective-config-final | 2026-11-12T08:02:16.213497+00:00 | 0 | 0.46 | [log](logs/effective-config-final.log) |
| baseline-typecheck | 2026-11-12T08:02:17.617545+00:00 | 1 | 1.72 | [log](logs/baseline-typecheck.log) |
| baseline-frontend-tests | 2026-11-12T08:02:18.231961+00:00 | 1 | 0.54 | [log](logs/baseline-frontend-tests.log) |
| baseline-e2e | 2026-11-12T08:02:18.919892+00:00 | 1 | 0.62 | [log](logs/baseline-e2e.log) |
| infra-up | 2026-11-12T08:02:48.419678+00:00 | 0 | 32.11 | [log](logs/infra-up.log) |
| create-venv | 2026-11-12T08:02:50.966970+00:00 | 0 | 13.82 | [log](logs/create-venv.log) |
| dump-copy | 2026-11-12T08:03:15.198646+00:00 | 0 | 10.0 | [log](logs/dump-copy.log) |
| dump-list | 2026-11-12T08:03:16.699908+00:00 | 0 | 1.23 | [log](logs/dump-list.log) |
| npm-ci | 2026-11-12T08:03:28.557130+00:00 | 0 | 51.42 | [log](logs/npm-ci.log) |
| restore | 2026-11-12T08:03:32.081265+00:00 | 0 | 15.1 | [log](logs/restore.log) |
| database-baseline | 2026-11-12T08:03:34.620155+00:00 | 0 | 2.36 | [log](logs/database-baseline.log) |
| frontend-typecheck | 2026-11-12T08:04:20.863337+00:00 | 0 | 7.5 | [log](logs/frontend-typecheck.log) |
| frontend-tests | 2026-11-12T08:04:32.483304+00:00 | 1 | 11.46 | [log](logs/frontend-tests.log) |
| frontend-build | 2026-11-12T08:04:37.604014+00:00 | 0 | 4.97 | [log](logs/frontend-build.log) |
| frontend-tests-after-fix | 2026-11-12T08:05:54.631492+00:00 | 0 | 13.2 | [log](logs/frontend-tests-after-fix.log) |
| docker-backend | 2026-11-12T08:05:58.749676+00:00 | 0 | 3.79 | [log](logs/docker-backend.log) |
| docker-desktop-settings | 2026-11-12T08:06:00.807619+00:00 | 0 | 1.94 | [log](logs/docker-desktop-settings.log) |
| baseline-build | 2026-11-12T08:06:15.798371+00:00 | 0 | 240.04 | [log](logs/baseline-build.log) |
| cached-image-dependencies | 2026-11-12T08:06:22.823866+00:00 | 0 | 4.2 | [log](logs/cached-image-dependencies.log) |
| playwright-install | 2026-11-12T08:08:12.485714+00:00 | 0 | 214.75 | [log](logs/playwright-install.log) |
| install-backend | 2026-11-12T08:08:43.284123+00:00 | 0 | 351.99 | [log](logs/install-backend.log) |
| model-loads | 2026-11-12T08:09:17.594935+00:00 | 0 | 128.68 | [log](logs/model-loads.log) |
| coach-database-counts | 2026-11-12T08:10:34.305566+00:00 | 0 | 7.76 | [log](logs/coach-database-counts.log) |
| source-list | 2026-11-12T08:11:02.809835+00:00 | 0 | 0.21 | [log](logs/source-list.log) |
| backend-tests | 2026-11-12T08:11:48.993373+00:00 | 0 | 127.92 | [log](logs/backend-tests.log) |
| backend-compile | 2026-11-12T08:11:50.034928+00:00 | 0 | 0.45 | [log](logs/backend-compile.log) |
| backend-pip-freeze | 2026-11-12T08:11:53.578085+00:00 | 0 | 3.36 | [log](logs/backend-pip-freeze.log) |
| original-containers | 2026-11-12T08:12:17.716283+00:00 | 0 | 2.35 | [log](logs/original-containers.log) |
| backend-lint | 2026-11-12T08:12:19.471371+00:00 | 1 | 1.06 | [log](logs/backend-lint.log) |
| rebuild-exclude-audit | 2026-11-12T08:12:32.820184+00:00 | 0 | 278.98 | [log](logs/rebuild-exclude-audit.log) |
| train-mirage | 2026-11-12T08:12:44.178084+00:00 | 0 | 205.76 | [log](logs/train-mirage.log) |
| build-history | 2026-11-12T08:12:49.821532+00:00 | 0 | 2.34 | [log](logs/build-history.log) |
| install-pdf-reader | 2026-11-12T08:13:04.508984+00:00 | 0 | 70.72 | [log](logs/install-pdf-reader.log) |
| services-up | 2026-11-12T08:13:26.917826+00:00 | 0 | 53.23 | [log](logs/services-up.log) |
| runtime-status | 2026-11-12T08:13:40.639854+00:00 | 0 | 1.35 | [log](logs/runtime-status.log) |
| startup-logs | 2026-11-12T08:13:42.201504+00:00 | 0 | 1.4 | [log](logs/startup-logs.log) |
| migration-current | 2026-11-12T08:13:45.310667+00:00 | 0 | 2.93 | [log](logs/migration-current.log) |
| browser-e2e | 2026-11-12T08:14:26.965925+00:00 | 0 | 29.04 | [log](logs/browser-e2e.log) |
| coach-train-baseline | 2026-11-12T08:14:27.291076+00:00 | 1 | 29.36 | [log](logs/coach-train-baseline.log) |
| worker-probe | 2026-11-12T08:14:35.614227+00:00 | 0 | 8.14 | [log](logs/worker-probe.log) |
| worker-job-logs | 2026-11-12T08:14:37.263893+00:00 | 0 | 0.72 | [log](logs/worker-job-logs.log) |
| endpoint-baseline | 2026-11-12T08:15:05.780216+00:00 | 0 | 10.6 | [log](logs/endpoint-baseline.log) |
| runtime-probe-copy | 2026-11-12T08:15:08.781871+00:00 | 0 | 2.39 | [log](logs/runtime-probe-copy.log) |
| runtime-original-models | 2026-11-12T08:15:12.483596+00:00 | 0 | 3.39 | [log](logs/runtime-original-models.log) |
| browser-features | 2026-11-12T08:15:46.988064+00:00 | 0 | 109.02 | [log](logs/browser-features.log) |
| browser-followup | 2026-11-12T08:17:17.072609+00:00 | 0 | 24.1 | [log](logs/browser-followup.log) |
| pdf-validation | 2026-11-12T08:17:21.242873+00:00 | 0 | 3.79 | [log](logs/pdf-validation.log) |
| negative-db-create | 2026-11-12T08:18:00.740946+00:00 | 0 | 5.09 | [log](logs/negative-db-create.log) |
| negative-db-restore | 2026-11-12T08:18:04.427780+00:00 | 1 | 3.67 | [log](logs/negative-db-restore.log) |
| negative-endpoints | 2026-11-12T08:18:04.551931+00:00 | 1 | 9.26 | [log](logs/negative-endpoints.log) |
| prepare-active-models | 2026-11-12T08:18:34.217950+00:00 | 0 | 0.6 | [log](logs/prepare-active-models.log) |
| retrained-effective-config | 2026-11-12T08:18:38.185295+00:00 | 0 | 3.62 | [log](logs/retrained-effective-config.log) |
| retrained-api-up | 2026-11-12T08:19:11.208481+00:00 | 0 | 32.41 | [log](logs/retrained-api-up.log) |
| negative-dump-recopy-retry | 2026-11-12T08:19:31.072240+00:00 | 0 | 2.29 | [log](logs/negative-dump-recopy-retry.log) |
| negative-db-restore-retry | 2026-11-12T08:19:41.987255+00:00 | 0 | 10.9 | [log](logs/negative-db-restore-retry.log) |
| negative-fixture-retry | 2026-11-12T08:19:42.804917+00:00 | 0 | 0.81 | [log](logs/negative-fixture-retry.log) |
| negative-api-start-retry | 2026-11-12T08:19:54.259346+00:00 | 0 | 11.45 | [log](logs/negative-api-start-retry.log) |
| endpoint-retrained | 2026-11-12T08:19:58.457118+00:00 | 0 | 5.11 | [log](logs/endpoint-retrained.log) |
| retrained-load-logs | 2026-11-12T08:19:59.318912+00:00 | 0 | 0.37 | [log](logs/retrained-load-logs.log) |
| runtime-probe-recopy | 2026-11-12T08:19:59.710370+00:00 | 0 | 0.3 | [log](logs/runtime-probe-recopy.log) |
| runtime-retrained-models | 2026-11-12T08:20:02.254955+00:00 | 0 | 2.47 | [log](logs/runtime-retrained-models.log) |
| final-health | 2026-11-12T08:20:04.512825+00:00 | 0 | 2.09 | [log](logs/final-health.log) |
| final-container-health | 2026-11-12T08:20:16.626129+00:00 | 0 | 0.75 | [log](logs/final-container-health.log) |
| reference-counts | 2026-11-12T08:20:17.835833+00:00 | 0 | 1.02 | [log](logs/reference-counts.log) |
| evidence-summary | 2026-11-12T08:21:46.221783+00:00 | 0 | 1.38 | [log](logs/evidence-summary.log) |
| negative-endpoints-retry | 2026-11-12T08:22:10.774992+00:00 | 4294967295 | 163.21 | [log](logs/negative-endpoints-retry.log) |
| negative-api-startup-error | 2026-11-12T08:22:11.448337+00:00 | 0 | 0.58 | [log](logs/negative-api-startup-error.log) |
| negative-api-cleanup | 2026-11-12T08:22:12.067739+00:00 | 0 | 0.53 | [log](logs/negative-api-cleanup.log) |
| negative-fixture-retry2 | 2026-11-12T08:22:12.871968+00:00 | 0 | 0.37 | [log](logs/negative-fixture-retry2.log) |
| negative-api-start-retry2 | 2026-11-12T08:22:14.352839+00:00 | 0 | 1.48 | [log](logs/negative-api-start-retry2.log) |
| negative-api-logs-retry2 | 2026-11-12T08:22:20.107950+00:00 | 0 | 0.51 | [log](logs/negative-api-logs-retry2.log) |
| negative-api-stop-retry2 | 2026-11-12T08:22:21.172406+00:00 | 0 | 1.06 | [log](logs/negative-api-stop-retry2.log) |
| negative-endpoints-final | 2026-11-12T08:22:21.356883+00:00 | 0 | 9.05 | [log](logs/negative-endpoints-final.log) |
| schema-probe-copy | 2026-11-12T08:22:47.600142+00:00 | 0 | 1.3 | [log](logs/schema-probe-copy.log) |
| all-map-schema-inference | 2026-11-12T08:22:49.654324+00:00 | 0 | 1.93 | [log](logs/all-map-schema-inference.log) |
| reproducibility-path-check | 2026-11-12T08:23:14.083392+00:00 | 0 | 1.17 | [log](logs/reproducibility-path-check.log) |
| final-original-data-check | 2026-11-12T08:23:14.959340+00:00 | 0 | 0.77 | [log](logs/final-original-data-check.log) |
| browser-e2e-retrained | 2026-11-12T08:28:05.135823+00:00 | 0 | 27.52 | [log](logs/browser-e2e-retrained.log) |
| final-stack | 2026-11-12T08:28:07.578026+00:00 | 0 | 1.76 | [log](logs/final-stack.log) |

## คำสั่งเต็ม

### environment

```text
powershell -NoProfile -Command "$PSVersionTable; Get-CimInstance Win32_ComputerSystem | Select Manufacturer,Model,SystemType | Format-List; Get-CimInstance Win32_OperatingSystem | Select Caption,Version,OSArchitecture | Format-List; Get-CimInstance Win32_Processor | Select Name,Architecture | Format-List; docker version; docker compose version; docker context show; wsl -l -v; Get-NetTCPConnection -State Listen | Select LocalAddress,LocalPort | Format-Table"
```

### effective-config

```text
docker compose --env-file audit-20261112/.env -p cs2audit20261112 -f docker-compose.yml -f audit-20261112/compose.override.yml config
```

### baseline-pytest

```text
python -m pytest
```

### effective-config-final

```text
docker compose --env-file audit-20261112/.env -p cs2audit20261112 -f docker-compose.yml -f audit-20261112/compose.override.yml config
```

### baseline-typecheck

```text
npm.cmd --prefix frontend run typecheck
```

### baseline-frontend-tests

```text
npm.cmd --prefix frontend test
```

### baseline-e2e

```text
npm.cmd --prefix frontend run test:e2e
```

### infra-up

```text
docker compose --env-file audit-20261112/.env -p cs2audit20261112 -f docker-compose.yml -f audit-20261112/compose.override.yml up -d --wait db redis
```

### create-venv

```text
python -m venv audit-20261112/venv
```

### dump-copy

```text
docker cp backup/database.dump cs2audit-db:/tmp/database.dump
```

### dump-list

```text
docker exec cs2audit-db pg_restore --list /tmp/database.dump
```

### npm-ci

```text
npm.cmd --prefix frontend ci
```

### restore

```text
docker exec cs2audit-db pg_restore -U postgres -d cs2_audit --no-owner --no-acl --exit-on-error /tmp/database.dump
```

### database-baseline

```text
docker exec cs2audit-db psql -U postgres -d cs2_audit -c \dt -c "SELECT id,demo_file,map_name,status,source FROM matches ORDER BY id" -c "SELECT * FROM alembic_version" -c "SELECT count(*) AS positions FROM player_positions" -c "SELECT count(*) AS equipment_rows FROM player_rounds"
```

### frontend-typecheck

```text
npm.cmd --prefix frontend run typecheck
```

### frontend-tests

```text
npm.cmd --prefix frontend test
```

### frontend-build

```text
npm.cmd --prefix frontend run build
```

### frontend-tests-after-fix

```text
npm.cmd --prefix frontend test
```

### docker-backend

```text
docker info --format "{{.OSType}} {{.Architecture}} {{.OperatingSystem}} {{.KernelVersion}}"
```

### docker-desktop-settings

```text
powershell -NoProfile -Command "Get-Content -LiteralPath C:\Users\Juk\AppData\Roaming\Docker\settings-store.json -Raw | ConvertFrom-Json | Select EngineTypeWindows,SettingsVersion | ConvertTo-Json"
```

### baseline-build

```text
docker compose --env-file audit-20261112/.env -p cs2audit20261112 -f docker-compose.yml -f audit-20261112/compose.override.yml build api worker frontend
```

### cached-image-dependencies

```text
docker run --rm --entrypoint python cs2-analytics-api:latest -m pip list --format=json
```

### playwright-install

```text
npm.cmd --prefix frontend exec -- playwright install chromium
```

### install-backend

```text
audit-20261112/venv/Scripts/python.exe -m pip install -r requirements-dev.txt
```

### model-loads

```text
docker run --rm --entrypoint python --mount type=bind,source=C:\Users\Juk\Downloads\CS2-UNTITLED\CS2-UNTITLED,target=/workspace,readonly --mount type=bind,source=C:\Users\Juk\Downloads\CS2-UNTITLED\CS2-UNTITLED\audit-20261112,target=/audit -w /workspace cs2-analytics-api:latest /audit/ml_audit.py loaders
```

### coach-database-counts

```text
docker exec cs2audit-db psql -U postgres -d cs2_audit -c "SELECT m.map_name,m.source,count(DISTINCT m.id) AS matches,count(DISTINCT r.id) AS rounds,count(pr.id) AS player_rounds,count(pr.equip_value) AS equipment_present FROM matches m LEFT JOIN rounds r ON r.match_id=m.id LEFT JOIN player_rounds pr ON pr.round_id=r.id GROUP BY m.map_name,m.source ORDER BY m.map_name" -c "SELECT m.source,count(*) AS positions FROM player_positions pp JOIN matches m ON m.id=pp.match_id GROUP BY m.source"
```

### source-list

```text
rg --files -g !audit-20261112/** -g !frontend/node_modules/** -g !frontend/dist/**
```

### backend-tests

```text
audit-20261112/venv/Scripts/python.exe -m pytest
```

### backend-compile

```text
audit-20261112/venv/Scripts/python.exe -m compileall -q backend
```

### backend-pip-freeze

```text
audit-20261112/venv/Scripts/python.exe -m pip freeze
```

### original-containers

```text
docker ps -a --format "{{.Names}} {{.Status}} {{.Ports}}"
```

### backend-lint

```text
audit-20261112/venv/Scripts/python.exe -m ruff check backend research tests scripts
```

### rebuild-exclude-audit

```text
docker compose --env-file audit-20261112/.env -p cs2audit20261112 -f docker-compose.yml -f audit-20261112/compose.override.yml build api worker frontend
```

### train-mirage

```text
docker run --rm --entrypoint python --mount type=bind,source=C:\Users\Juk\Downloads\CS2-UNTITLED\CS2-UNTITLED,target=/workspace,readonly --mount type=bind,source=C:\Users\Juk\Downloads\CS2-UNTITLED\CS2-UNTITLED\audit-20261112,target=/audit -e OMP_NUM_THREADS=2 -e OPENBLAS_NUM_THREADS=2 -w /workspace cs2-analytics-api:latest /audit/ml_audit.py train
```

### build-history

```text
docker buildx history ls
```

### install-pdf-reader

```text
audit-20261112/venv/Scripts/python.exe -m pip install pymupdf
```

### services-up

```text
docker compose --env-file audit-20261112/.env -p cs2audit20261112 -f docker-compose.yml -f audit-20261112/compose.override.yml up -d --wait api worker frontend
```

### runtime-status

```text
docker compose --env-file audit-20261112/.env -p cs2audit20261112 -f docker-compose.yml -f audit-20261112/compose.override.yml ps
```

### startup-logs

```text
docker compose --env-file audit-20261112/.env -p cs2audit20261112 -f docker-compose.yml -f audit-20261112/compose.override.yml logs --no-color --tail 60 api worker
```

### migration-current

```text
docker exec cs2audit-api alembic current
```

### browser-e2e

```text
npm.cmd --prefix frontend run test:e2e
```

### coach-train-baseline

```text
docker exec cs2audit-api python research/models/coach_ml.py --map de_mirage
```

### worker-probe

```text
docker exec cs2audit-api python -c "from backend.jobs.demo_processing import _queue; import time; q=_queue(); j=q.enqueue('builtins.sum',[1,2,3],description='audit harmless arithmetic probe'); time.sleep(3); j.refresh(); print({'id':j.id,'status':str(j.get_status()),'result':j.return_value()})"
```

### worker-job-logs

```text
docker logs --tail 30 cs2audit-worker
```

### endpoint-baseline

```text
python audit-20261112/api_audit.py -baseline
```

### runtime-probe-copy

```text
docker cp audit-20261112/runtime_models.py cs2audit-api:/tmp/runtime_models.py
```

### runtime-original-models

```text
docker exec -e PYTHONPATH=/app cs2audit-api python /tmp/runtime_models.py
```

### browser-features

```text
node audit-20261112/browser.cjs
```

### browser-followup

```text
node audit-20261112/browser_followup.cjs
```

### pdf-validation

```text
audit-20261112/venv/Scripts/python.exe audit-20261112/pdf_check.py
```

### negative-db-create

```text
docker exec cs2audit-db createdb -U postgres cs2_audit_negative
```

### negative-db-restore

```text
docker exec cs2audit-db pg_restore -U postgres -d cs2_audit_negative --no-owner --no-acl --exit-on-error /tmp/database.dump
```

### negative-endpoints

```text
python audit-20261112/negative_endpoint.py
```

### prepare-active-models

```text
python audit-20261112/prepare_models.py
```

### retrained-effective-config

```text
docker compose --env-file audit-20261112/.env -p cs2audit20261112 -f docker-compose.yml -f audit-20261112/compose.override.yml -f audit-20261112/compose.retrained.yml config
```

### retrained-api-up

```text
docker compose --env-file audit-20261112/.env -p cs2audit20261112 -f docker-compose.yml -f audit-20261112/compose.override.yml -f audit-20261112/compose.retrained.yml up -d --no-deps --wait api
```

### negative-dump-recopy-retry

```text
docker cp C:\Users\Juk\Downloads\CS2-UNTITLED\CS2-UNTITLED\backup\database.dump cs2audit-db:/tmp/database.dump
```

### negative-db-restore-retry

```text
docker exec cs2audit-db pg_restore -U postgres -d cs2_audit_negative --no-owner --no-acl --exit-on-error /tmp/database.dump
```

### negative-fixture-retry

```text
docker exec cs2audit-db psql -U postgres -d cs2_audit_negative -v ON_ERROR_STOP=1 -c "DELETE FROM player_rounds WHERE round_id IN (SELECT id FROM rounds WHERE match_id=9 AND round_num<>1);
UPDATE player_rounds SET equip_value=NULL WHERE round_id IN (SELECT id FROM rounds WHERE match_id=9);
SELECT count(*) AS remaining_player_rounds,count(equip_value) AS equipment_present FROM player_rounds WHERE round_id IN (SELECT id FROM rounds WHERE match_id=9);"
```

### negative-api-start-retry

```text
docker run -d --name cs2audit-negative-api --network cs2audit20261112_default --env-file C:\Users\Juk\Downloads\CS2-UNTITLED\CS2-UNTITLED\audit-20261112\.env -e DATABASE_URL=postgresql://postgres:<REDACTED>@db:5432/cs2_audit_negative -p 127.0.0.1:18001:8000 --mount type=bind,source=C:\Users\Juk\Downloads\CS2-UNTITLED\CS2-UNTITLED\output\models,target=/app/output/models,readonly cs2audit20261112-api:latest
```

### endpoint-retrained

```text
python audit-20261112/api_audit.py -retrained
```

### retrained-load-logs

```text
docker logs --tail 140 cs2audit-api
```

### runtime-probe-recopy

```text
docker cp audit-20261112/runtime_models.py cs2audit-api:/tmp/runtime_models.py
```

### runtime-retrained-models

```text
docker exec -e PYTHONPATH=/app cs2audit-api python /tmp/runtime_models.py
```

### final-health

```text
powershell -NoProfile -Command "Invoke-RestMethod http://127.0.0.1:13000/api/health | ConvertTo-Json -Depth 5"
```

### final-container-health

```text
docker ps --format "{{.Names}} {{.Status}} {{.Ports}}"
```

### reference-counts

```text
docker exec cs2audit-db psql -U postgres -d cs2_audit -c "SELECT count(*) AS reference_matches FROM matches WHERE source='reference'" -c "SELECT count(*) AS reference_positions FROM player_positions p JOIN matches m ON m.id=p.match_id WHERE m.source='reference'" -c "SELECT count(pr.equip_value) AS reference_equipment FROM player_rounds pr JOIN rounds r ON r.id=pr.round_id JOIN matches m ON m.id=r.match_id WHERE m.source='reference'" -c "SELECT count(*) AS all_matches FROM matches"
```

### evidence-summary

```text
python audit-20261112/evidence_summary.py
```

### negative-endpoints-retry

```text
python audit-20261112/negative_endpoint.py
```

### negative-api-startup-error

```text
docker logs cs2audit-negative-api
```

### negative-api-cleanup

```text
docker rm -f cs2audit-negative-api
```

### negative-fixture-retry2

```text
docker exec cs2audit-db psql -U postgres -d cs2_audit_negative -v ON_ERROR_STOP=1 -c "DELETE FROM player_rounds WHERE round_id IN (SELECT id FROM rounds WHERE match_id=9 AND round_num<>1);
UPDATE player_rounds SET equip_value=NULL WHERE round_id IN (SELECT id FROM rounds WHERE match_id=9);
SELECT count(*) AS remaining_player_rounds,count(equip_value) AS equipment_present FROM player_rounds WHERE round_id IN (SELECT id FROM rounds WHERE match_id=9);"
```

### negative-api-start-retry2

```text
docker run -d --name cs2audit-negative-api --network cs2audit20261112_default -e SECRET_KEY=<REDACTED> -e GUEST_DEMO_FILE=match730_003837851867249901660_1125265208_142.dem -e QUEUE_BACKEND=rq -e REDIS_URL=redis://redis:6379/0 -e DATABASE_URL=postgresql://postgres:<REDACTED>@db:5432/cs2_audit_negative -p 127.0.0.1:18001:8000 --mount type=bind,source=C:\Users\Juk\Downloads\CS2-UNTITLED\CS2-UNTITLED\output\models,target=/app/output/models,readonly cs2audit20261112-api:latest
```

### negative-api-logs-retry2

```text
docker logs cs2audit-negative-api
```

### negative-api-stop-retry2

```text
docker rm -f cs2audit-negative-api
```

### negative-endpoints-final

```text
python audit-20261112/negative_endpoint.py --resume
```

### schema-probe-copy

```text
docker cp audit-20261112/runtime_models.py cs2audit-api:/tmp/runtime_models.py
```

### all-map-schema-inference

```text
docker exec -e PYTHONPATH=/app cs2audit-api python /tmp/runtime_models.py
```

### reproducibility-path-check

```text
powershell -NoProfile -Command "Test-Path output/recovery/mirage-role-training.csv; Test-Path .git; Get-Item backup/database.dump,data/all_kills.csv,data/mirage_kills.csv | Select FullName,Length | Format-List"
```

### final-original-data-check

```text
docker exec cs2audit-db psql -U postgres -d cs2_audit -c "SELECT count(*) AS match9_player_rounds,count(pr.equip_value) AS match9_equipment FROM player_rounds pr JOIN rounds r ON r.id=pr.round_id WHERE r.match_id=9" -c "SELECT count(*) AS matches FROM matches" -c "SELECT count(*) AS positions FROM player_positions"
```

### browser-e2e-retrained

```text
npm.cmd --prefix frontend run test:e2e
```

### final-stack

```text
docker compose --env-file audit-20261112/.env -p cs2audit20261112 -f docker-compose.yml -f audit-20261112/compose.override.yml -f audit-20261112/compose.retrained.yml ps
```
