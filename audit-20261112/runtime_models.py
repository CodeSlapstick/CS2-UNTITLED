import hashlib
import json
import os
from pathlib import Path
from backend.services.review import load_grid_model, MODEL_ROOT
from backend.services.coach import load_coach_model, recommend_round
from backend.services.player_roles import load_role_model, assign_profile

records=[]
for folder in sorted(MODEL_ROOT.iterdir()):
    if not folder.is_dir():continue
    paths={n:folder/f'{n}.json' for n in ['grid_ml1','coach_model','player_role']}
    row={'map':folder.name,'paths':{n:str(p) for n,p in paths.items()}}
    row['sha256']={n:hashlib.file_digest(p.open('rb'),'sha256').hexdigest() for n,p in paths.items() if p.is_file()}
    g=load_grid_model(map_name=folder.name);c=load_coach_model(map_name=folder.name);r=load_role_model(map_name=folder.name)
    row.update(grid_loaded=g is not None,coach_loaded=c is not None,role_loaded=r is not None)
    row['coach_schema_inference']={}
    row['role_schema_inference']={}
    for side in ('t','ct'):
        sample={'round_num':1,'side':side,'context':[0.5]*6,'opening':None}
        recommendation=recommend_round(sample,c,map_name=folder.name)
        row['coach_schema_inference'][side]={'executed':True,'available':recommendation['available']}
        profile={f:r['models'][side]['preprocess']['median'][f] for f in r['models'][side]['features']}
        assignment=assign_profile(profile,side,r)
        row['role_schema_inference'][side]={'executed':True,'role':assignment['role']}
    row['role_training_source']=r.get('training_source') if r else None
    records.append(row)
print(json.dumps({'model_root':str(MODEL_ROOT),'models':records},ensure_ascii=False))
