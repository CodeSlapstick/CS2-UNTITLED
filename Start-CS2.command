#!/bin/zsh
set -eu
cd "${0:A:h}"
open -a Docker
for attempt in {1..60}; do
  if docker info >/dev/null 2>&1; then break; fi
  sleep 1
done
if ! docker info >/dev/null 2>&1; then
  echo 'Docker Desktop ยังไม่พร้อม กรุณารอแล้วเปิดไฟล์นี้อีกครั้ง'
  read -r '?กด Enter เพื่อปิด'
  exit 1
fi
if ! docker compose up -d --build --wait --wait-timeout 180; then
  docker compose logs --tail 60 api worker frontend
  read -r '?เริ่มระบบไม่สำเร็จ กด Enter เพื่อปิด'
  exit 1
fi
open http://127.0.0.1:3000
