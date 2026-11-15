import http.cookiejar
import json
from pathlib import Path
import sys
import urllib.request
import urllib.error
from urllib.parse import quote

OUT = Path(__file__).resolve().parent
if len(sys.argv)>1 and sys.argv[1]!='-baseline':
    OUT=OUT/('endpoints'+sys.argv[1])
    OUT.mkdir(exist_ok=True)
BASE='http://127.0.0.1:13000'
client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
records=[]
def call(name,url,post=False):
    request=urllib.request.Request(BASE+url,data=b'' if post else None)
    try:
        with client.open(request,timeout=60) as r: status,body=r.status,r.read()
    except urllib.error.HTTPError as e: status,body=e.code,e.read()
    data=json.loads(body)
    filename=f'api-{name}.json'
    (OUT/filename).write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
    records.append({'name':name,'url':url,'status':status,'response':filename})
    print(json.dumps(records[-1]),flush=True)
    return data

call('health','/api/health')
call('guest','/auth/guest',True)
matches=call('matches','/api/matches')
match=matches[0];demo=quote(match['demo_file']);map_name=match['map_name']
call('round-review',f'/api/review/{demo}/rounds/1')
call('round-no-data',f'/api/review/{demo}/rounds/999')
call('role-sufficient',f'/api/analysis/player-behavior?demo={demo}')
call('role-empty',f'/api/analysis/player-behavior?demo={demo}&players=1')
call('coach-t',f'/api/coach/{demo}?side=t')
call('coach-ct',f'/api/coach/{demo}?side=ct')
call('coach-invalid',f'/api/coach/{demo}?side=invalid')
call('analysis-data',f'/api/analysis/deaths?map={map_name}&scope=upload&demo={demo}')
call('analysis-empty',f'/api/analysis/deaths?map={map_name}&scope=upload&demo={demo}&players=1')
call('guest-reference-forbidden',f'/api/analysis/deaths?map={map_name}&scope=reference')
call('report',f'/api/reports/coach/{match["id"]}')
catalog=call('opening-catalog','/api/opening-route/catalog')
if catalog:
    call('opening-data',f'/api/opening-route?steamid={catalog[0]["steamid"]}&map={map_name}&side=t')
call('opening-empty',f'/api/opening-route?steamid=1&map={map_name}&side=t')
(OUT/f'api-results{sys.argv[1] if len(sys.argv)>1 else ""}.json').write_text(json.dumps(records,indent=2),encoding='utf-8')
