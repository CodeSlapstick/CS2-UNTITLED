# ใช้งาน CS2 UNTITLED จากโฟลเดอร์นี้

เว็บ: http://localhost:3000 — เข้า Guest เพื่อดูแมตช์ Mirage ที่เตรียมไว้

เปิด Docker Desktop ก่อน แล้วรันจาก PowerShell:

```powershell
.\Start-CS2.ps1
```

หลังดึงโค้ดใหม่จากเพื่อน ให้ build image ใหม่ด้วย:

```powershell
git pull --ff-only origin main
powershell -NoProfile -ExecutionPolicy Bypass -File .\Start-CS2.ps1 -Build
```

การเปิดระบบโดยไม่มี `-Build` จะใช้ image ที่มีอยู่ จึงอาจยังเห็นเว็บเวอร์ชันเก่าแม้ดึงโค้ดใหม่แล้ว

หยุดบริการโดยเก็บข้อมูลไว้:

```powershell
.\Stop-CS2.ps1
```

ใช้ Compose project `cs2audit20261112` และฐานข้อมูลที่ restore ไว้แล้วใน volume `cs2audit20261112_pgdata` พร้อมโมเดล Mirage ที่เทรนใหม่ จึงไม่ต้อง restore ซ้ำ ข้อมูลตั้งค่าและไฟล์ที่ใช้งานอยู่ยังอยู่ใน `audit-20261112/` ให้เก็บโฟลเดอร์นี้ไว้ด้วย รหัสผ่านอยู่ใน `.env` ภายในโฟลเดอร์นั้น

พอร์ต: เว็บ 3000, API 18000, PostgreSQL 15433, Redis 16379 ทั้งหมด bind เฉพาะ loopback ของเครื่อง

ใช้สคริปต์ด้านบนเพื่อให้เลือก config และฐานข้อมูลชุดเดียวกับที่เปิดใช้งานอยู่ การรัน `docker compose up` โดยไม่มีไฟล์ตั้งค่าชุดนี้จะเลือกบริการคนละชุด รายงานการตรวจเดิมอ้างพอร์ต 13000 ซึ่งเป็นพอร์ตในช่วงทดสอบก่อนย้ายมา 3000
