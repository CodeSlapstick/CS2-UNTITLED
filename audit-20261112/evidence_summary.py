import collections
import csv
import difflib
import hashlib
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=Path(__file__).resolve().parent
inventory=json.loads((OUT/'inventory.json').read_text(encoding='utf-8'))
summary={'csv':{},'original_files_unchanged':[],'endpoint_baseline':{}}
for name in ('all_kills.csv','mirage_kills.csv'):
    maps=collections.Counter();demos=set();rows=0
    with (ROOT/'data'/name).open(encoding='utf-8-sig',newline='') as f:
        reader=csv.DictReader(f)
        columns=reader.fieldnames
        for row in reader:
            rows+=1;maps[row.get('map_name','<none>')]+=1;demos.add(row.get('demo_file',''))
    summary['csv'][name]={'rows':rows,'unique_demo_files':len(demos),'maps':dict(maps),'columns':columns}
for row in inventory['files']:
    if 'sha256' not in row:continue
    path=ROOT/row['path']
    sha=hashlib.file_digest(path.open('rb'),'sha256').hexdigest()
    summary['original_files_unchanged'].append({'path':row['path'],'unchanged':sha==row['sha256']})
for suffix in ('t','ct'):
    data=json.loads((OUT/f'api-coach-{suffix}.json').read_text(encoding='utf-8'))
    summary['endpoint_baseline'][f'coach-{suffix}']={'available':data['available'],'rounds':len(data['rounds']),
      'available_rounds':sum(bool(r['available']) for r in data['rounds']),
      'reasons':dict(collections.Counter(r.get('reason') for r in data['rounds']))}
data=json.loads((OUT/'api-role-sufficient.json').read_text(encoding='utf-8'))
summary['endpoint_baseline']['role']={'profiles':len(data['players']),'available':sum(p['available'] for p in data['players']),
      'minimum_rounds':data['minimum_rounds'],'source':data['source']}
data=json.loads((OUT/'api-round-review.json').read_text(encoding='utf-8'))
summary['endpoint_baseline']['round_review_keys']=list(data)
summary['endpoint_baseline']['opening']=json.loads((OUT/'api-opening-data.json').read_text(encoding='utf-8'))
test=ROOT/'frontend/src/features/coach/coachTranslation.test.tsx'
after=test.read_text(encoding='utf-8')
before=after.replace('screen, within }','screen }').replace('  const languageToggle = within(screen.getByTestId("lang-toggle"));\n','').replace('languageToggle.getByRole','screen.getByRole')
(OUT/'coachTranslation.test.before.tsx').write_text(before,encoding='utf-8')
diff=''.join(difflib.unified_diff(before.splitlines(True),after.splitlines(True),fromfile='a/frontend/src/features/coach/coachTranslation.test.tsx',tofile='b/frontend/src/features/coach/coachTranslation.test.tsx'))
diff+=''.join(difflib.unified_diff((OUT/'dockerignore.before.txt').read_text(encoding='utf-8').splitlines(True),(ROOT/'.dockerignore').read_text(encoding='utf-8').splitlines(True),fromfile='a/.dockerignore',tofile='b/.dockerignore'))
(OUT/'changes.patch').write_text(diff,encoding='utf-8')
(OUT/'evidence-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'csv':{k:{x:v[x] for x in ('rows','unique_demo_files','maps')} for k,v in summary['csv'].items()},
  'all_original_files_unchanged':all(r['unchanged'] for r in summary['original_files_unchanged']),
  'endpoints':{k:v for k,v in summary['endpoint_baseline'].items() if k!='opening'}},ensure_ascii=False,indent=2))
