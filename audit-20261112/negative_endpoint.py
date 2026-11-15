"""Run insufficient-data HTTP checks in a separate restored database."""
import http.cookiejar
import json
from pathlib import Path
import time
import subprocess
import sys
import urllib.request
from urllib.parse import quote
from run import ROOT,AUDIT,run as base_run

def run(name,args):
    return base_run(name+('-retry2' if '--resume' in sys.argv else '-retry'),args)

env={}
for line in (AUDIT/'.env').read_text(encoding='utf-8').splitlines():
    if line and not line.startswith('#') and '=' in line:
        k,v=line.split('=',1);env[k]=v

if '--resume' not in sys.argv:
    existing=subprocess.check_output(['docker','exec','cs2audit-db','psql','-U','postgres','-Atc',"SELECT 1 FROM pg_database WHERE datname='cs2_audit_negative'"],text=True).strip()
    if not existing:
        assert run('negative-db-create',['docker','exec','cs2audit-db','createdb','-U','postgres','cs2_audit_negative'])==0
    assert run('negative-dump-recopy',['docker','cp',str(ROOT/'backup/database.dump'),'cs2audit-db:/tmp/database.dump'])==0
    assert run('negative-db-restore',['docker','exec','cs2audit-db','pg_restore','-U','postgres','-d','cs2_audit_negative','--no-owner','--no-acl','--exit-on-error','/tmp/database.dump'])==0
sql="""DELETE FROM player_rounds WHERE round_id IN (SELECT id FROM rounds WHERE match_id=9 AND round_num<>1);
UPDATE player_rounds SET equip_value=NULL WHERE round_id IN (SELECT id FROM rounds WHERE match_id=9);
SELECT count(*) AS remaining_player_rounds,count(equip_value) AS equipment_present FROM player_rounds WHERE round_id IN (SELECT id FROM rounds WHERE match_id=9);"""
assert run('negative-fixture',['docker','exec','cs2audit-db','psql','-U','postgres','-d','cs2_audit_negative','-v','ON_ERROR_STOP=1','-c',sql])==0
url=f"postgresql://postgres:{env['POSTGRES_PASSWORD']}@db:5432/cs2_audit_negative"
args=['docker','run','-d','--name','cs2audit-negative-api','--network','cs2audit20261112_default',
 '-e',f'SECRET_KEY={env["SECRET_KEY"]}','-e',f'GUEST_DEMO_FILE={env["GUEST_DEMO_FILE"]}',
 '-e','QUEUE_BACKEND=rq','-e','REDIS_URL=redis://redis:6379/0',
 '-e',f'DATABASE_URL={url}','-p','127.0.0.1:18001:8000',
 '--mount',f'type=bind,source={ROOT / "output/models"},target=/app/output/models,readonly',
 'cs2audit20261112-api:latest']
assert run('negative-api-start',args)==0
try:
    base='http://127.0.0.1:18001'
    client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    for _ in range(60):
        try:
            client.open(base+'/api/health',timeout=3).close();break
        except Exception:time.sleep(1)
    client.open(urllib.request.Request(base+'/auth/guest',data=b''),timeout=20).close()
    demo=quote(env['GUEST_DEMO_FILE'])
    result=[]
    for name,path in [('role',f'/api/analysis/player-behavior?demo={demo}'),('coach',f'/api/coach/{demo}')]:
        with client.open(base+path,timeout=30) as r:status,data=r.status,json.load(r)
        (AUDIT/f'negative-api-{name}.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
        result.append({'endpoint':path,'status':status,'players':len(data.get('players',[])),
          'rounds':len(data.get('rounds',[])), 'reasons':sorted(set(p.get('reason','') or '' for p in data.get('players',[])+data.get('rounds',[])))})
    (AUDIT/'negative-endpoint-results.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps(result),flush=True)
finally:
    run('negative-api-logs',['docker','logs','cs2audit-negative-api'])
    run('negative-api-stop',['docker','rm','-f','cs2audit-negative-api'])
