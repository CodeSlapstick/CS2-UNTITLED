import asyncio
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import sys

ROOT = Path('/workspace')
OUT = Path('/audit')
sys.path.insert(0, str(ROOT))
from backend.services.review import load_grid_model
from backend.services.coach import load_coach_model, CONTEXT_FEATURES, OPENING_FEATURES, build_coach_samples
from backend.services.player_roles import load_role_model
from research.models import grid_ml1, player_role

def dump(name, data):
    (OUT/name).write_text(json.dumps(data, ensure_ascii=False, indent=2, default=str), encoding='utf-8')
    print(json.dumps(data, ensure_ascii=False, default=str), flush=True)

def loaders():
    records=[]
    for folder in sorted((ROOT/'output/models').iterdir()):
        if not folder.is_dir(): continue
        paths={n:folder/f'{n}.json' for n in ('grid_ml1','coach_model','player_role')}
        g=load_grid_model(paths['grid_ml1'])
        c=load_coach_model(paths['coach_model'])
        r=load_role_model(str(paths['player_role']))
        records.append({'map':folder.name, 'grid_loaded':g is not None,
          'grid_hotspots':len(g.hotspots) if g else None,
          'coach_loaded':c is not None, 'coach_features_valid': bool(c and c['context_features']==CONTEXT_FEATURES and c['opening_features']==OPENING_FEATURES),
          'role_loaded':r is not None, 'role_sides': list(r.get('models',{})) if r else [],
          'paths':{n:str(p) for n,p in paths.items()},
          'sha256':{n:hashlib.file_digest(p.open('rb'),'sha256').hexdigest() for n,p in paths.items()}})
    dump('model-loads.json',records)

def train():
    source = ROOT/'data/mirage_kills.csv'
    dest = OUT/'retrained/de_mirage'
    dest.mkdir(parents=True,exist_ok=True)
    payload, hotspots = grid_ml1.train_grid_model(source,'de_mirage')
    grid_ml1.save_results(payload,hotspots,dest)
    grid_ml1.print_training_summary(payload,hotspots)
    kills=player_role.load_kills_csv(source,'de_mirage')
    profiles, roles=player_role.train_from_kills_csv(kills,source,'de_mirage',player_role.MIN_ROUNDS,player_role.N_BOOTSTRAPS)
    (dest/'player_role.json').write_text(json.dumps(roles,ensure_ascii=False,indent=2),encoding='utf-8')
    profiles.to_csv(dest/'player_role_profiles.csv',index=False,encoding='utf-8-sig')
    dump('training-results.json', {'source':str(source),'sha256':hashlib.file_digest(source.open('rb'),'sha256').hexdigest(),
      'versions':{n:importlib.metadata.version(n) for n in ('numpy','pandas','scikit-learn','scipy')},
      'grid':payload['metrics'],'grid_seed':grid_ml1.SEED,'grid_min_bin_freq':grid_ml1.MIN_BIN_FREQ,
      'role':{k:v for k,v in roles.items() if k!='models'},
      'role_models':{s:{'profiles':v['profiles'],'metrics':v['metrics']} for s,v in roles['models'].items()},
      'role_bootstraps':player_role.N_BOOTSTRAPS,'artifacts':[str(p) for p in dest.iterdir()]})

async def coach():
    import asyncpg
    from backend.repositories.coach import load_coach_facts
    conn=await asyncpg.connect(os.environ['DATABASE_URL'])
    try:
        records=[]
        for map_name in [r['map_name'] for r in await conn.fetch('SELECT DISTINCT map_name FROM matches')]:
            d=await load_coach_facts(conn,map_name,reference_only=True)
            samples=build_coach_samples(d,map_name)
            records.append({'map':map_name,'reference_fact_rows':len(d['facts']),
               'reference_positions':len(d['positions']), 'reference_utility':len(d['utility']),
               'complete_samples':sum(s['opening'] is not None and s['won'] is not None for s in samples)})
        dump('coach-readiness.json',records)
    finally: await conn.close()

if __name__=='__main__':
    {'loaders':loaders,'train':train,'coach':lambda:asyncio.run(coach())}[sys.argv[1]]()
