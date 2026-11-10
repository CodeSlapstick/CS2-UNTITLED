# research/ — งานเตรียมข้อมูล เครื่องมือตรวจสอบ และโมเดล offline

รันจากรากโปรเจกต์เสมอ · อ่านจาก `demos/` `data/` แล้วเขียนผลลง `data/` หรือ `output/`

| ไฟล์ | ทำอะไร | อ่าน → เขียน |
|---|---|---|
| `prep/demoparser.py` | อ่านเดโมอ้างอิง รวม kill events และสร้างฟีเจอร์สำหรับเทรน | `demos/reference/**/*.dem` → `data/all_kills.csv` |
| `tools/check_radar.py` | ตรวจค่าปรับเทียบใน `assets/radars.json` กับจุดตายจริง | DB หรือ `data/all_kills.csv` |
| `tools/import_overviews.py` | นำเข้าค่าพิกัดและภาพเรดาร์จากไฟล์เกม CS2 | ไฟล์เกม → `assets/` |
| `models/grid_ml1.py` | เทรน MeanShift เพื่อหาจุดปะทะหนาแน่น | `data/all_kills.csv` → `output/models/<map>/grid_ml1.json` และ `grid_ml1_hotspots.csv` |
| `models/coach_ml.py` | สร้างตัวเลือกแผนจากรอบอ้างอิง | DB → `output/coach_model.json` |
| `models/player_role.py` | จัดกลุ่มรูปแบบการเล่นแยกฝั่ง T/CT | CSV → `output/models/<map>/player_role.json` |

`all_kills.csv` เรียงคอลัมน์เป็น 7 หมวด: Match & Round → Role Signals → Attacker → Victim → Assister / Support → Combat → Technical ส่วนไฟล์ `output/all_kills_readable.xlsx` เป็นเวอร์ชันสำหรับเปิดอ่าน มี filter, freeze pane, สีหัวตารางแยกหมวด และ Data Dictionary ภาษาไทย โดย CSV ยังเป็นแหล่งข้อมูลหลักของสคริปต์และโมเดล

## เทรนโมเดลบทบาทผู้เล่น

```bash
python research/models/player_role.py --csv data/all_kills.csv --map de_ancient
```

หนึ่งแถวที่ใช้จัดกลุ่มคือผู้เล่นหนึ่งคนในหนึ่งแมตช์ต่อหนึ่งฝั่ง โมเดลฝั่ง T และ CT แยกจากกันโดยสมบูรณ์ และข้อมูลที่ผู้ใช้อัปโหลดจะไม่ถูกนำมาเทรน ชื่ออย่าง `Entry`, `Support`, `Site Anchor` เป็นคำอธิบาย centroid หลังจัดกลุ่ม ไม่ใช่ label ที่ใช้สอนโมเดลหรือคำตัดสินผู้เล่น โมเดลเทรนจาก kill events ใน CSV จึงไม่มี grenade throws, movement หรือ planter id: Support ใช้ assist/flash-assist, Anchor/Rotator ใช้ callout ของ kill events และ Bomb carrier / Site executor ใช้ site/post-plant events เป็น proxy

## เพิ่มเดโมแล้วอยากให้บริบทบนหน้ารอบอัปเดต

```bash
python research/prep/demoparser.py
python research/models/grid_ml1.py --map de_ancient
python research/models/player_role.py --map de_ancient
```

รันสองคำสั่งเทรนท้ายสุดซ้ำตามชื่อแมพที่มีใน CSV อย่าใช้แคชของแมพที่ไม่มีไฟล์ demo ต้นทางมาปะปนใน CSV

`grid_ml1.py` เหลือเฉพาะ MeanShift และการวัดความคงที่ของ hotspot ด้วย match-level bootstrap ไม่มี KMeans, การเลือกค่า k, cell profiles หรือ `--min-kills` อีกต่อไป สร้างเฉพาะ JSON กับ CSV ของ hotspots; ไฟล์ `grid_ml1_cells.csv` ที่สร้างไว้ก่อนหน้านี้ไม่ได้ถูกลบอัตโนมัติ Backend ยังอ่าน JSON รูปแบบเดิมได้

หน้า Analysis ที่แสดงจุดตาย จำนวนครั้ง และสัดส่วน ใช้ข้อมูลแมตช์จาก PostgreSQL แล้วนับลงกริดโดยตรง จึงไม่ต้องเทรน `grid_ml1.py` เพื่อให้หน้านี้ทำงาน MeanShift เป็นบริบทเพิ่มเติมของจุดตายใน API หน้า Round Review

API เลือก artifact ตาม `match.map_name` จาก `output/models/<map>/` โดยอัตโนมัติ และยังรองรับไฟล์ legacy ใน `output/` เป็น fallback
ตัวเลือกแมพหน้า Analysis อ่านจาก PostgreSQL: หลังเทรนให้รัน `python -m backend.parser <ไฟล์.dem>` และ `python -m backend.etl_loader output/json/<ชื่อไฟล์>.json` สำหรับเดโมอ้างอิงแต่ละไฟล์ แล้วรัน `python -m backend.etl_loader --mark-reference` เพื่อให้ endpoint ของหน้า Analysis เห็นแมพนั้น (คำสั่งนี้ค้นโฟลเดอร์รายแมพและไม่เปลี่ยน source ของชุดอ้างอิงที่ archive ไปแล้ว)
เมื่อสร้างหรือเปลี่ยน artifact ของแมพ ให้วางไฟล์ไว้ใน `output/models/<map>/` เพื่อให้ backend โหลด artifact ของแมพนั้นได้
สูตรแปลงพิกัดบนหน้าเว็บอยู่ที่ `backend/services/review.py` ที่เดียว กริดนับจุดตายของหน้า Analysis แยกจาก MeanShift ซึ่งใช้พิกัดเกมโดยตรง
