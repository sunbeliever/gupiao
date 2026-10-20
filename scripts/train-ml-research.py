"""Offline challenger research only; not imported by the investment UI."""
import json, sys, os, hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
os.environ['OMP_NUM_THREADS']='4'
sys.path.insert(0,str(ROOT/'tools'/'ml-research'))
import numpy as np
import sklearn, joblib
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss

OUT=ROOT/'validation'/'ml-research'
DATA=json.loads((OUT/'labels.json').read_text(encoding='utf-8'))
ROWS=DATA['rows']
PARAMS=dict(max_iter=100,max_leaf_nodes=7,max_depth=3,min_samples_leaf=80,learning_rate=.05,l2_regularization=10,early_stopping=False,random_state=20231019)
MANIFEST=dict(kind='hist-gradient-boosting-price-profit-classifier',params=PARAMS,threshold=.70,horizon=20,features=DATA['featureNames'],
 protocol='For year Y: base model labels mature by Y-2 year-end; calibrate only year Y-1 labels mature by its year-end; freeze for Y. No random split or automatic early stopping.',
 costs='Approximate 0.15% each side in price-profit label, not actual broker fills.',
 limitations=['Current surviving hand-picked stock pool; no unbiased historical constituents.','Development research, not a new untouched live track record.','A predicted 70% probability must be evaluated; it is not a guarantee.'])
(OUT/'manifest-frozen.json').write_text(json.dumps(MANIFEST,ensure_ascii=False,indent=2),encoding='utf-8')

def split_rows(rows, year):
    train_end=f'{year-2}-12-31'; cal_end=f'{year-1}-12-31'; test_end=f'{year}-12-31'
    train=[r for r in rows if r['exitDate']<=train_end]
    calibration=[r for r in rows if r['date'].startswith(str(year-1)+'-') and r['exitDate']<=cal_end]
    test=[r for r in rows if r['date'].startswith(str(year)+'-') and r['exitDate']<=test_end]
    assert all(r['exitDate']<f'{year-1}-01-01' for r in train)
    assert all(r['exitDate']<f'{year}-01-01' for r in calibration)
    return train,calibration,test

def logit(p):
    p=np.clip(p,1e-6,1-1e-6)
    return np.log(p/(1-p)).reshape(-1,1)

def main():
    reports=[]
    for year in [2023,2024,2025,2026]:
        train,calibration,test=split_rows(ROWS,year)
        x=np.asarray([r['x'] for r in train]); y=np.asarray([r['profitable'] for r in train])
        base=HistGradientBoostingClassifier(**PARAMS).fit(x,y)
        cal_x=np.asarray([r['x'] for r in calibration]);cal_y=np.asarray([r['profitable'] for r in calibration])
        cal_p=base.predict_proba(cal_x)[:,1]
        calibrator=LogisticRegression(C=1,max_iter=1000).fit(logit(cal_p),cal_y)
        test_x=np.asarray([r['x'] for r in test]);test_y=np.asarray([r['profitable'] for r in test])
        raw=base.predict_proba(test_x)[:,1];prob=calibrator.predict_proba(logit(raw))[:,1]
        selected=np.where(prob>=.7)[0]
        selections=[dict(symbol=test[i]['symbol'],date=test[i]['date'],exitDate=test[i]['exitDate'],probability=float(prob[i]),profitable=bool(test[i]['profitable']),netReturn=test[i]['netReturn'],entryExecutable=test[i]['entryExecutable'],exitExecutable=test[i]['exitExecutable']) for i in selected]
        summary=dict(year=year,trainLabels=len(train),trainLabelEndMax=max(r['exitDate'] for r in train),calibrationLabels=len(calibration),calibrationLabelEndMax=max(r['exitDate'] for r in calibration),testLabels=len(test),testAsOf=max(r['exitDate'] for r in test),
          directionAccuracy=float(np.mean((prob>=.5)==test_y)),alwaysUpAccuracy=float(np.mean(test_y)),brier=float(brier_score_loss(test_y,prob)),constantPriorBrier=float(np.mean((test_y-float(np.mean(cal_y)))**2)),
          threshold=.7,selectedLabels=len(selected),selectedSignalDays=len(set(r['date'] for r in selections)),selectedWinRate=float(np.mean(test_y[selected])) if len(selected) else None,selectedMeanNetPriceReturn=float(np.mean([test[i]['netReturn'] for i in selected])) if len(selected) else None,selectedUnavailableEntries=sum(not r['entryExecutable'] for r in selections),selectedUnavailableExits=sum(not r['exitExecutable'] for r in selections))
        reports.append(dict(summary=summary,selections=selections))
        joblib.dump(dict(base=base,calibrator=calibrator,manifest=MANIFEST,year=year),OUT/f'challenger-{year}.joblib')
        print(json.dumps(summary,ensure_ascii=False),flush=True)
    report=dict(manifest=MANIFEST,library='scikit-learn '+sklearn.__version__,reports=reports,readiness='unproven',deployed=False)
    (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')

if __name__=='__main__':main()
