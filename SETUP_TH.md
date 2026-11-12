# เปิด CS2 UNTITLED บนเครื่องเพื่อน

ชุดนี้เตรียมสำหรับใช้งานด้วย Docker Desktop บน Windows โดยมี source code, สื่อหน้าเว็บ, โมเดล Machine Learning และฐานข้อมูลตัวอย่างครบใน ZIP เดียว

## สิ่งที่ต้องติดตั้ง

- Docker Desktop
- อินเทอร์เน็ตสำหรับดาวน์โหลด Docker images และ dependencies ในครั้งแรก

## เริ่มใช้งานครั้งแรก

แตก ZIP แล้วเปิด PowerShell ในโฟลเดอร์ที่มี `docker-compose.yml` จากนั้นรัน:

```powershell
Copy-Item .env.example .env
docker compose up -d db redis
docker compose exec -T db pg_isready -U postgres -d cs2_analytics
docker compose cp backup/database.dump db:/tmp/database.dump
docker compose exec -T db pg_restore -U postgres -d cs2_analytics --no-owner --no-acl --exit-on-error /tmp/database.dump
docker compose up -d --build
```

เมื่อบริการพร้อม ให้เปิด <http://localhost:3000> และเข้าโหมดผู้เยี่ยมชมเพื่อดูข้อมูลตัวอย่าง

ครั้งต่อไปเปิดระบบด้วย:

```powershell
docker compose up -d
```

ปิดระบบด้วย:

```powershell
docker compose down
```

## ข้อมูลที่แนบมา

- `output/models/` — โมเดล Coach, Grid ML1 และ Player Role ของ 8 แผนที่ รวมโมเดล Grid ML1 ของ Mirage ที่สร้างจาก 50 แมตช์อ้างอิง
- `data/all_kills.csv` — ข้อมูล kill events สำหรับงานวิจัยและเทรนโมเดลหลัก
- `data/mirage_kills.csv` — ข้อมูล Mirage ที่ใช้สร้างโมเดลส่วนที่ขาด
- `backup/database.dump` — ฐานข้อมูล PostgreSQL ตัวอย่าง 8 แมตช์ พร้อมข้อมูล replay และสถิติ
- `frontend/public/media/home/` — ไฟล์ภาพและวิดีโอที่หน้าเว็บเรียกใช้จริง ซึ่งถูกปรับขนาดแล้ว
- `Media/` — ไฟล์สื่อต้นฉบับสำหรับแก้ไขหรือสร้าง preview ใหม่

## ไฟล์ที่ไม่ได้แนบ

- ไฟล์ `.dem` อ้างอิงจำนวนมาก เพราะมีขนาดรวมประมาณ 118 GB และข้อมูล replay ตัวอย่างอยู่ในฐานข้อมูลแล้ว
- cache, artifacts ระหว่างประมวลผล, `.git`, `.venv`, `node_modules` และ Docker volumes เพราะสร้างใหม่ได้
- `.env` ของเครื่องต้นทางและข้อมูลลับ ให้สร้างจาก `.env.example` บนเครื่องเพื่อน

หากต้องการทดลองอัปโหลดแมตช์ใหม่ ให้ใช้ไฟล์ `.dem` ของตนเอง ระบบจะเก็บไฟล์ใหม่ในโฟลเดอร์ `demos/`
