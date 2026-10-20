import os,sys,json,argparse
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
os.environ['OMP_NUM_THREADS']='4';sys.path.insert(0,str(ROOT/'tools/ml-research'))
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import brier_score_loss,log_loss
OUT=ROOT/'validation/net-profit-probability'
def splits(rows,year):
    available=lambda r:r.get('labelAvailableAt') or r['exitDate']
    train=[r for r in rows if r['label'] and available(r)<=f'{year-2}-12-31']
    calibration=[r for r in rows if r['label'] and r['date'].startswith(f'{year-1}-') and available(r)<=f'{year-1}-12-31']
    inference=[r for r in rows if r['date'].startswith(f'{year}-')]
    return train,calibration,inference
def logit(p):
    p=np.clip(p,1e-5,1-1e-5);return np.log(p/(1-p)).reshape(-1,1)
def main():
    global OUT
    p=argparse.ArgumentParser();p.add_argument('--year',type=int,required=True);p.add_argument('--full-capital',action='store_true');args=p.parse_args();year=args.year
    data_dir=ROOT/'validation/cost-aware-v2'
    if args.full_capital:OUT=ROOT/'validation/net-profit-probability-full';data_dir=ROOT/'validation/full-capital-optimization'
    OUT.mkdir(parents=True,exist_ok=True);target=OUT/f'report-{year}.json'
    if target.exists():raise ValueError('Do not replace a scored probability experiment')
    data=json.loads((data_dir/'dataset.json').read_text(encoding='utf-8'));policy=json.loads((data_dir/'manifest-frozen.json').read_text(encoding='utf-8'))['policy'];protocol=json.loads((ROOT/'docs/profit-probability-protocol.json').read_text(encoding='utf-8'));protocol['labelAllocation']=policy['positionLimit'];protocol['fullCapital']=args.full_capital
    train,cal,rows=splits(data['rows'],year);x=np.asarray([r['x'] for r in train]);y=np.asarray([int(r['label']['netReturn']>0) for r in train]);cx=np.asarray([r['x'] for r in cal]);cy=np.asarray([int(r['label']['netReturn']>0) for r in cal]);tx=np.asarray([r['x'] for r in rows]);prior=float(cy.mean());means=[float(np.mean([r['label']['netReturn'] for r in cal if int(r['label']['netReturn']>0)==k])) for k in [0,1]]
    models={'logistic':make_pipeline(StandardScaler(),LogisticRegression(C=1,max_iter=1000)),'histogram':HistGradientBoostingClassifier(**policy['treeParameters'])};reports=[];scores={}
    for name,base in models.items():
        base.fit(x,y);calibrator=LogisticRegression(C=1,max_iter=1000).fit(logit(base.predict_proba(cx)[:,1]),cy);prob=calibrator.predict_proba(logit(base.predict_proba(tx)[:,1]))[:,1];observed=[i for i,r in enumerate(rows) if r['label'] and (r.get('labelAvailableAt') or r['exitDate'])<=f'{year}-12-31'];actual=np.asarray([int(rows[i]['label']['netReturn']>0) for i in observed]);pr=prob[observed];bins=[]
        for lower in [0,.2,.4,.6,.8]:
            mask=(pr>=lower)&(pr<(lower+.2) if lower<.8 else pr<=1);bins.append(dict(lower=lower,upper=round(lower+.2,2),labels=int(mask.sum()),meanProbability=float(pr[mask].mean()) if mask.any() else None,actualProfitableFraction=float(actual[mask].mean()) if mask.any() else None))
        selected=[i for i in observed if prob[i]>=.7 and prob[i]*means[1]+(1-prob[i])*means[0]>0];nonoverlap=[];last={}
        for i in selected:
            r=rows[i]
            if r['date']>=last.get(r['symbol'],''):
                nonoverlap.append(i);last[r['symbol']]=r['exitDate']
        reports.append(dict(model=name,year=year,trainingLabels=len(train),trainingAvailabilityMax=max((r.get('labelAvailableAt') or r['exitDate']) for r in train),calibrationLabels=len(cal),calibrationAvailabilityMax=max((r.get('labelAvailableAt') or r['exitDate']) for r in cal),observedLabels=len(observed),inferenceLabels=len(rows),brier=float(brier_score_loss(actual,pr)),priorBrier=float(brier_score_loss(actual,np.full(len(actual),prior))),logLoss=float(log_loss(actual,pr)),priorLogLoss=float(log_loss(actual,np.full(len(actual),prior))),thresholdLabels=len(selected),thresholdActualWinFraction=float(np.mean([rows[i]['label']['netReturn']>0 for i in selected])) if selected else None,nonoverlappingPerSymbolCases=len(nonoverlap),nonoverlappingActualWinFraction=float(np.mean([rows[i]['label']['netReturn']>0 for i in nonoverlap])) if nonoverlap else None,reliability=bins))
        scores[name]=[dict(date=r['date'],symbol=r['symbol'],calibratedProbability=float(v),expectedNetReturn=float(v*means[1]+(1-v)*means[0]),trend=r['trend'],breadth=r['breadth']) for r,v in zip(rows,prob)]
    target.write_text(json.dumps(dict(protocol=protocol,reports=reports,scores=scores,deployed=False),ensure_ascii=False,separators=(',',':')),encoding='utf-8');print(json.dumps(dict(year=year,reports=reports,deployed=False)),flush=True)
if __name__=='__main__':main()
