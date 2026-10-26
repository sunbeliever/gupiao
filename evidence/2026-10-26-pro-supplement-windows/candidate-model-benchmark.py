#!/usr/bin/env python3
"""Offline candidate model benchmark for research only; never deploys or changes accounts.
Uses only the supplied immutable HFQ daily bars and chronological rolling folds.
"""
import json, math, hashlib, sys
from pathlib import Path
import numpy as np
from sklearn.ensemble import ExtraTreesRegressor, HistGradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT.parent/'review'/'immutable-dataset'/'series'/'hfq'
DEFAULT_OUT=ROOT.parent/'review'/'candidate-model-benchmark-2026-10-26.json'
OUT=Path(sys.argv[sys.argv.index('--output')+1]).resolve() if '--output' in sys.argv else DEFAULT_OUT
HORIZONS=[5,20,60]

def load():
    out={}
    for p in sorted(DATA.glob('*.json')):
        o=json.loads(p.read_text(encoding='utf-8'))
        out[o['symbol']]=o['bars']
    if len(out)!=6: raise RuntimeError(f'expected six ETF series, got {len(out)}')
    dates=[b['date'] for b in next(iter(out.values()))]
    for s, bars in out.items():
        if [b['date'] for b in bars]!=dates: raise RuntimeError(f'unaligned dates: {s}')
    return out,dates

def feats(bars,i):
    c=np.array([x['close'] for x in bars[:i+1]],dtype=float)
    o=np.array([x['open'] for x in bars[:i+2]],dtype=float)
    v=np.array([x['volume'] for x in bars[:i+1]],dtype=float)
    r=np.diff(np.log(c))
    def mom(n): return c[-1]/c[-1-n]-1 if len(c)>n else np.nan
    def vol(n): return np.std(r[-n:],ddof=1) if len(r)>=n else np.nan
    def ma_ratio(n): return c[-1]/np.mean(c[-n:])-1 if len(c)>=n else np.nan
    delta=np.diff(c[-15:])
    up=np.maximum(delta,0).sum(); dn=np.maximum(-delta,0).sum()
    rsi=50 if up+dn==0 else 100*up/(up+dn)
    return [mom(1),mom(5),mom(10),mom(20),mom(60),vol(5),vol(20),vol(60),ma_ratio(5),ma_ratio(20),ma_ratio(60),rsi/100,
            (v[-1]/np.mean(v[-20:])-1) if len(v)>=20 and np.mean(v[-20:])>0 else np.nan]

def build_rows(histories, dates, h):
    rows=[]
    # Signal at close t; entry next open; exit open h sessions after entry.
    for s,bars in histories.items():
        for i in range(60,len(dates)-h-1):
            x=feats(bars,i)
            entry=bars[i+1]['open']; exitp=bars[i+h+1]['open']
            if not all(np.isfinite(x)) or entry<=0: continue
            rows.append({'symbol':s,'i':i,'date':dates[i],'exit_date':dates[i+h+1], 'x':x,'y':exitp/entry-1})
    return rows

def make_model(name):
    if name=='ridge': return make_pipeline(StandardScaler(),Ridge(alpha=1.0))
    if name=='extra_trees': return ExtraTreesRegressor(n_estimators=120,min_samples_leaf=12,max_features=.8,n_jobs=1,random_state=20261026)
    if name=='hist_gradient_boosting': return HistGradientBoostingRegressor(max_iter=80,max_leaf_nodes=7,l2_regularization=2.0,learning_rate=.05,random_state=20261026)
    raise ValueError(name)

def metric(y,p):
    y=np.asarray(y);p=np.asarray(p)
    return {'n':int(len(y)),'mae_pct':float(np.mean(np.abs(y-p))*100),'rmse_pct':float(np.sqrt(np.mean((y-p)**2))*100),'direction_accuracy_pct':float(np.mean((y>=0)==(p>=0))*100),'mean_actual_return_pct':float(np.mean(y)*100)}

def run():
    if OUT.exists(): raise FileExistsError(f'Refusing to overwrite existing research result: {OUT}; choose a new --output path for a new experiment')
    histories,dates=load(); out={'schema':1,'purpose':'offline candidate benchmark only; not deployed, not a profitability proof','dataset':'provided immutable six-ETF HFQ daily series','date_start':dates[0],'date_end':dates[-1],'symbols':sorted(histories),'feature_count':13,'features':['return_1','momentum_5','momentum_10','momentum_20','momentum_60','volatility_5','volatility_20','volatility_60','close_vs_ma_5','close_vs_ma_20','close_vs_ma_60','rsi14_proxy','volume_vs_ma20'],'folds':[],'summary':[]}
    for h in HORIZONS:
        rows=build_rows(histories,dates,h)
        first=60+252+h+1
        fold_preds={name:[] for name in ['ridge','extra_trees','hist_gradient_boosting','mean']}
        for start in range(first,len(dates)-h-1,63):
            cutoff=start-1
            train=[r for r in rows if r['i']<=cutoff and r['i']+h+1<=cutoff]
            test=[r for r in rows if start<=r['i']<min(start+63,len(dates)-h-1)]
            if len(train)<252*len(histories) or not test: continue
            X=np.asarray([r['x'] for r in train]); y=np.asarray([r['y'] for r in train]); Xt=np.asarray([r['x'] for r in test]); yt=np.asarray([r['y'] for r in test])
            fold={'horizon':h,'train_end':dates[cutoff],'test_start':dates[start],'test_end':dates[min(start+62,len(dates)-h-2)],'n_train':len(train),'n_test':len(test),'models':{}}
            for name in ['ridge','extra_trees','hist_gradient_boosting']:
                model=make_model(name); model.fit(X,y); pred=model.predict(Xt)
                fold_preds[name].extend(zip(yt.tolist(),pred.tolist()))
                fold['models'][name]=metric(yt,pred)
            pred=np.full_like(yt,float(np.mean(y)))
            fold_preds['mean'].extend(zip(yt.tolist(),pred.tolist()))
            fold['models']['mean']=metric(yt,pred)
            out['folds'].append(fold)
        for name,pairs in fold_preds.items():
            if not pairs: continue
            m=metric([a for a,b in pairs],[b for a,b in pairs]);m.update({'horizon':h,'model':name,'fold_count':sum(1 for f in out['folds'] if f['horizon']==h)})
            out['summary'].append(m)
    OUT.write_text(json.dumps(out,indent=2),encoding='utf-8')
    print(json.dumps({'output':str(OUT),'summary':out['summary']},indent=2))
if __name__=='__main__': run()
