"""Score saved current inputs with the frozen offline challenger; never place orders."""
import json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'/'ml-research'))
import numpy as np,joblib
OUT=ROOT/'validation'/'ml-research'
model=joblib.load(OUT/'challenger-2026.joblib')
inputs=json.loads((OUT/'current-inputs.json').read_text(encoding='utf-8'))
raw=np.clip(model['base'].predict_proba(np.array([r['values'] for r in inputs['rows']]))[:,1],1e-6,1-1e-6)
prob=model['calibrator'].predict_proba(np.log(raw/(1-raw)).reshape(-1,1))[:,1]
scores=sorted([dict(symbol=r['symbol'],name=r['name'],asOf=r['asOf'],researchProbability=float(p)) for r,p in zip(inputs['rows'],prob)],key=lambda r:r['researchProbability'],reverse=True)
result=dict(observedAt=inputs['observedAt'],threshold=.7,eligibleSignals=int(np.sum(prob>=.7)),deployed=False,scores=scores)
(OUT/'current-scores.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(dict(eligibleSignals=result['eligibleSignals'],maxProbability=float(np.max(prob)),asOf=scores[0]['asOf'])))
