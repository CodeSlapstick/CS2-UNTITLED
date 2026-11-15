from pathlib import Path
import shutil
import json
import hashlib
from run import ROOT,AUDIT

dest=AUDIT/'active-models'
manifest=[]
for source in sorted((ROOT/'output/models').glob('*/*.json')):
    if source.name not in ('grid_ml1.json','player_role.json','coach_model.json'):continue
    training=AUDIT/'retrained'/source.parent.name/source.name
    selected=training if training.is_file() else source
    target=dest/source.parent.name/source.name
    target.parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(selected,target)
    manifest.append({'source':str(selected),'target':str(target),'newly_trained':selected==training,
      'sha256':hashlib.file_digest(target.open('rb'),'sha256').hexdigest()})
(AUDIT/'active-models-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print(json.dumps(manifest,indent=2))
