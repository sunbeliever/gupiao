"""One predeclared market-relative model experiment. No live deployment or orders."""
import os,sys,json,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
os.environ['OMP_NUM_THREADS']='4'
sys.path.insert(0,str(ROOT/'tools/ml-research'))
import numpy as np
from scipy.stats import rankdata
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import Ridge
from sklearn.ensemble import HistGradientBoostingRegressor
import joblib,sklearn
OUT=ROOT/'validation/ranking-research'
PARAMS=dict(max_iter=100,max_leaf_nodes=7,max_depth=3,min_samples_leaf=100,learning_rate=.05,l2_regularization=10,early_stopping=False,random_state=20261019)

def split_rows(rows,year):
    train=[r for r in rows if r['exitDate']<=f'{year-1}-12-31']
    test=[r for r in rows if r['date'].startswith(f'{year}-') and r['exitDate']<=f'{year}-12-31']
    return train,test

def mean(a):return float(np.mean(a)) if len(a) else None

def metrics(rows,pred,calendar,coverage=None):
    groups={}
    for r,p in zip(rows,pred):groups.setdefault(r['date'],[]).append((r,float(p)))
    ic=[]
    for date,group in sorted(groups.items()):
        x=rankdata([p for _,p in group]);y=rankdata([r['excessReturn'] for r,_ in group])
        if len(group)>=5 and np.std(x)>0 and np.std(y)>0:ic.append(float(np.corrcoef(x,y)[0,1]))
    actual=np.asarray([r['excessReturn'] for r in rows])
    eligible=sum(coverage.get(d,{}).get('featureEligible',len(groups[d])) for d in groups) if coverage else None
    return dict(labels=len(rows),signalDays=len(groups),featureEligibleOnScoredDays=eligible,observedLabelCoverage=len(rows)/eligible if eligible else None,meanRankIC=mean(ic),excessMae=float(np.mean(np.abs(actual-pred))),zeroExcessMae=float(np.mean(np.abs(actual))),evaluationScope='Error and correlation conditional on observed labels. No portfolio selection or monetary return is evaluated; label absence never triggers a replacement trade here.')

def main():
    raw=(OUT/'labels.json').read_bytes();data=json.loads(raw);rows=data['rows']
    manifest=dict(kind='market-relative-ranking-research',declaredParameters=PARAMS,dataSha256=hashlib.sha256(raw).hexdigest(),featureNames=data['featureNames'],sourceAsOf=data['sourceAsOf'],symbols=data['symbols'],target='signal-next-open to20sessions-later return minus same-window sh588000 return',protocol='Freeze one model per year using only labels matured before January1. Compare standardized ridge with18 inputs and one fixed histogram-tree candidate. All outcomes are retrospective exploratory research, not a new untouched holdout.',limitations=['Current hand-picked surviving19asset pool, not point-in-time industry constituents.','Rank IC is not probability of profit.','Only observed-label prediction error/correlation are evaluated, with coverage disclosed. No portfolio or monetary returns.','Prior top-three price-window metrics had future-label-availability selection bias and are archived as invalid portfolio evidence.','No deployment based on these already-examined years.'])
    (OUT/'manifest-frozen.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    reports=[]
    for year in [2023,2024,2025,2026]:
        train,test=split_rows(rows,year)
        x=np.asarray([r['x'] for r in train]);y=np.asarray([r['excessReturn'] for r in train]);tx=np.asarray([r['x'] for r in test])
        models={'ridge_relative':make_pipeline(StandardScaler(),Ridge(alpha=1)),'tree_relative':HistGradientBoostingRegressor(**PARAMS)}
        for name,model in models.items():
            model.fit(x,y);p=model.predict(tx);m=metrics(test,p,data['calendar'],data['signalCoverage'])
            r=dict(year=year,model=name,trainingLabels=len(train),trainLabelEndMax=max(v['exitDate'] for v in train),testAsOf=max(v['exitDate'] for v in test),**m);reports.append(r)
            joblib.dump(dict(model=model,manifest=manifest,year=year),OUT/f'{name}-{year}.joblib')
            print(json.dumps({k:v for k,v in r.items() if k!='windows'},ensure_ascii=False),flush=True)
    report=dict(manifest=manifest,library='scikit-learn '+sklearn.__version__,reports=reports,deployed=False,readiness='unproven')
    (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
if __name__=='__main__':main()
