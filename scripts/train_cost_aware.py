"""Annual chronological cost-aware ETF challengers; no deployment or orders."""
import os,sys,json,hashlib,argparse
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
os.environ['OMP_NUM_THREADS']='4'
sys.path.insert(0,str(ROOT/'tools/ml-research'))
import numpy as np
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import HuberRegressor,Ridge
from sklearn.ensemble import HistGradientBoostingRegressor
import joblib
OUT=ROOT/'validation/cost-aware-optimization'

def split_rows(rows,year):
    train=[r for r in rows if r['label'] is not None and (r.get('labelAvailableAt') or r['exitDate'])<=f'{year-1}-12-31']
    inference=[r for r in rows if r['date'].startswith(f'{year}-')]
    return train,inference

def main():
    global OUT
    parser=argparse.ArgumentParser();parser.add_argument('--year',type=int,required=True);parser.add_argument('--corrected',action='store_true');parser.add_argument('--full-capital',action='store_true');args=parser.parse_args();year=args.year
    if args.corrected:OUT=ROOT/'validation/cost-aware-v2'
    if args.full_capital:OUT=ROOT/'validation/full-capital-optimization'
    if year not in [2023,2024,2025,2026]:raise ValueError('Only declared years allowed')
    if year>2023 and not (OUT/'selection-frozen.json').exists():raise ValueError('Freeze2023 policy selection before later-year inference')
    target=OUT/f'predictions-{year}.json'
    if target.exists():raise ValueError('Keep prior predictions; no replacement or repeat tuning')
    body=(OUT/'dataset.json').read_bytes();data=json.loads(body);manifest=json.loads((OUT/'manifest-frozen.json').read_text(encoding='utf-8'));policy=manifest['policy'];train,rows=split_rows(data['rows'],year)
    if not train or not rows:raise ValueError('Insufficient chronological data')
    x=np.asarray([r['x'] for r in train]);y=np.asarray([r['label']['netReturn'] for r in train]);gross=np.asarray([r['label']['grossReturn'] for r in train]);tx=np.asarray([r['x'] for r in rows]);models={
        'original11-ridge':make_pipeline(StandardScaler(),Ridge(alpha=1)),
        'robust25-huber':make_pipeline(StandardScaler(),HuberRegressor(**policy['huberParameters'])),
        'net25-histogram-tree':HistGradientBoostingRegressor(**policy['treeParameters'])}
    predictions={}
    for name,model in models.items():
        base=name=='original11-ridge';model.fit(x[:,:11] if base else x,gross if base else y);scores=model.predict(tx[:,:11] if base else tx)
        if base:scores=(1+scores)*(1-policy['slippage'])**2-1-2*policy['minFee']/policy['positionLimit']
        predictions[name]=[dict(symbol=r['symbol'],date=r['date'],expectedNetReturn=float(p),trend=r['trend'],breadth=r['breadth']) for r,p in zip(rows,scores)]
        joblib.dump(dict(model=model,features=data['featureNames'][:11] if base else data['featureNames'],trainingLabelEndMax=max(r['exitDate'] for r in train),year=year),OUT/f'{name}-{year}.joblib')
    predictions['trend-baseline']=[dict(symbol=r['symbol'],date=r['date'],expectedNetReturn=r['momentum60']/3-2*policy['minFee']/policy['positionLimit']-2*policy['slippage'],trend=r['trend'],breadth=r['breadth']) for r in rows]
    result=dict(year=year,datasetSha256=hashlib.sha256(body).hexdigest(),featureCount=x.shape[1],trainingLabels=len(train),trainingLabelEndMax=max(r['exitDate'] for r in train),inferenceRows=len(rows),inferenceAsOf=max(r['date'] for r in rows),predictions=predictions,deployed=False)
    target.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')),encoding='utf-8');print(json.dumps({k:v for k,v in result.items() if k!='predictions'}),flush=True)
if __name__=='__main__':main()
