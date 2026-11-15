"""Test-only log instrumentation: record the artifact selected by actual endpoint calls."""
import hashlib
import json
from pathlib import Path
import backend.routes.application as application
import uvicorn

def instrument(name,artifact):
    original=getattr(application,name)
    def traced(*args,**kwargs):
        model=original(*args,**kwargs)
        map_name=kwargs.get('map_name')
        path=Path('/app/retrained')/str(map_name)/artifact
        if path.is_file():
            print('AUDIT_MODEL_LOAD '+json.dumps({'loader':name,'map':map_name,'path':str(path),
               'sha256':hashlib.file_digest(path.open('rb'),'sha256').hexdigest(),'loaded':model is not None}),flush=True)
        return model
    setattr(application,name,traced)

instrument('load_grid_model','grid_ml1.json')
instrument('load_role_model','player_role.json')
instrument('load_coach_model','coach_model.json')
uvicorn.run(application.app,host='0.0.0.0',port=8000)
