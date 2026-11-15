import hashlib
import json
from pathlib import Path
import zipfile
from run import AUDIT,ROOT

records=[json.loads(line) for line in (AUDIT/'commands.jsonl').read_text(encoding='utf-8').splitlines() if line.strip()]
lines=['# คำสั่งและผลการรันจริง','',
 'คำสั่งควบคุมรันจาก PowerShell บน Windows; docker exec/run ระบุโปรแกรมที่รันภายใน container',
 'Timestamp ในไฟล์นี้เป็น UTC; เวลาประเทศไทย = UTC+7 ค่าลับถูกปิดไว้ด้วย <REDACTED>',
 'exit code ในตารางเป็นของ child command ที่บันทึกโดย runner รายละเอียด stdout/stderr อยู่ใน log',
 'cwd หลัก: `'+str(ROOT)+'`','',
 '| ชื่อ | UTC | Exit | วินาที | Log |','|---|---|---:|---:|---|']
for r in records:
    lines.append(f'| {r["name"]} | {r["time_utc"]} | {r["exit_code"]} | {r["seconds"]} | [log](logs/{r["name"]}.log) |')
lines+=['','## คำสั่งเต็ม','']
for r in records:
    lines.extend([f'### {r["name"]}','', '```text',r['command'],'```',''])
(AUDIT/'COMMANDS.md').write_text('\n'.join(lines),encoding='utf-8')

allowed={'.md','.log','.json','.jsonl','.csv','.patch','.py','.cjs','.yml','.tsx','.txt','.pdf','.png'}
files=[p for p in AUDIT.rglob('*') if p.is_file() and p.suffix.lower() in allowed
       and not any(x in ('venv','__pycache__') for x in p.relative_to(AUDIT).parts)
       and p.name!='DELIVERY.json']
secret_values=[]
for line in (AUDIT/'.env').read_text(encoding='utf-8').splitlines():
    if '=' not in line:continue
    key,value=line.split('=',1)
    if key in ('POSTGRES_PASSWORD','SECRET_KEY') and value:secret_values.append(value.encode())
for p in files:
    data=p.read_bytes()
    if any(value in data for value in secret_values):
        raise SystemExit('Private test value found in delivery: '+str(p.relative_to(AUDIT)))
manifest={'files':[{'path':str(p.relative_to(AUDIT)).replace('\\','/'), 'bytes':p.stat().st_size,
    'sha256':hashlib.file_digest(p.open('rb'),'sha256').hexdigest()} for p in sorted(files)],
    'excluded':['.env','venv','node_modules','database credentials'], 'private_value_scan_passed':True}
(AUDIT/'DELIVERY.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
archive=ROOT/'CS2-UNTITLED-AUDIT-20261112.zip'
with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED) as z:
    for p in files+[AUDIT/'DELIVERY.json']:
        z.write(p,str(p.relative_to(ROOT)))
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    assert not any(name.endswith('/.env') or '/venv/' in name for name in z.namelist())
print(json.dumps({'archive':str(archive),'bytes':archive.stat().st_size,'files':len(files)+1,
    'sha256':hashlib.file_digest(archive.open('rb'),'sha256').hexdigest(), 'secret_scan':'passed','zip_integrity':'passed'},indent=2))
