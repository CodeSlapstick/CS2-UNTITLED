import hashlib
import json
from pathlib import Path
import secrets
import socket
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from run import ROOT, AUDIT, run

maps = sorted(p.name for p in (ROOT/'output/models').iterdir() if p.is_dir())
files = ['PACKAGE_MANIFEST.txt', 'README.md', 'SETUP_TH.md', 'research/README.md', 'Dockerfile',
         'docker-compose.yml', 'backup/database.dump', 'data/all_kills.csv', 'data/mirage_kills.csv']
files += [f'output/models/{m}/{n}.json' for m in maps for n in ['grid_ml1','coach_model','player_role']]
inventory = []
for name in files:
    p = ROOT/name
    try:
        h = hashlib.file_digest(p.open('rb'), 'sha256').hexdigest()
        row = {'path': name, 'bytes': p.stat().st_size, 'sha256': h, 'readable': True}
        if p.suffix == '.json':
            data = json.loads(p.read_text(encoding='utf-8'))
            row.update(map=data.get('map'), version=data.get('version'), keys=list(data))
        inventory.append(row)
    except Exception as e:
        inventory.append({'path': name, 'error': str(e)})
(AUDIT/'inventory.json').write_text(json.dumps({'maps_discovered': maps, 'manifest_names_no_maps': True,
    'git_present': (ROOT/'.git').exists(), 'raw_demos': [str(p) for p in ROOT.rglob('*.dem')],
    'dump_header_hex': (ROOT/'backup/database.dump').open('rb').read(32).hex(), 'files': inventory}, indent=2), encoding='utf-8')
ports = {'POSTGRES_PORT':15433,'REDIS_PORT':16379,'WEB_PORT':13000,'API_PORT':18000}
for k,v in ports.items():
    with socket.socket() as s:
        s.bind(('127.0.0.1',v))
template = (ROOT/'.env.example').read_text(encoding='utf-8')
values = {**ports, 'POSTGRES_PASSWORD':secrets.token_hex(24), 'SECRET_KEY':secrets.token_hex(32), 'POSTGRES_DB':'cs2_audit'}
lines=[]
for line in template.splitlines():
    k=line.split('=',1)[0]
    if k in values: line=f'{k}={values[k]}'
    if k=='DATABASE_URL': line=f"DATABASE_URL=postgresql://postgres:{values['POSTGRES_PASSWORD']}@127.0.0.1:15433/cs2_audit"
    if k=='REDIS_URL': line='REDIS_URL=redis://127.0.0.1:16379/0'
    lines.append(line)
(AUDIT/'.env').write_text('\n'.join(lines)+'\n', encoding='utf-8')
(AUDIT/'output').mkdir(exist_ok=True)
(AUDIT/'demos').mkdir(exist_ok=True)
override='''services:
  db:
    container_name: cs2audit-db
  redis:
    container_name: cs2audit-redis
  api:
    container_name: cs2audit-api
    ports: !override
      - "127.0.0.1:18000:8000"
    volumes: !override
      - ./audit-20261112/demos:/app/demos
      - ./audit-20261112/output:/app/output
      - ./output/models:/app/output/models:ro
  worker:
    container_name: cs2audit-worker
    volumes: !override
      - ./audit-20261112/demos:/app/demos
      - ./audit-20261112/output:/app/output
      - ./output/models:/app/output/models:ro
  frontend:
    container_name: cs2audit-frontend
    ports: !override
      - "127.0.0.1:13000:8080"
'''
(AUDIT/'compose.override.yml').write_text(override, encoding='utf-8')
print(json.dumps({'maps':maps,'inventory_files':len(files),'ports':ports,'dump_header':(ROOT/'backup/database.dump').open('rb').read(5).decode('ascii')}))
