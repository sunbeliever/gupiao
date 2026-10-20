"""Evaluate the already-frozen models on the six ETF rows; never retrain."""
import json
from train_ranking_research import OUT,split_rows,metrics,np,joblib
data=json.loads((OUT/'labels.json').read_text(encoding='utf-8'))
etfs={'sh588000','sh512760','sh515070','sh512720','sh515880','sz159852'}
results=[]
for year in [2023,2024,2025,2026]:
    _,test=split_rows(data['rows'],year);rows=[r for r in test if r['symbol'] in etfs]
    for name in ['ridge_relative','tree_relative']:
        frozen=joblib.load(OUT/f'{name}-{year}.joblib');p=frozen['model'].predict(np.asarray([r['x'] for r in rows]))
        m=metrics(rows,p,data['calendar']);result=dict(year=year,model=name,**{k:v for k,v in m.items() if k!='windows'})
        results.append(result);print(json.dumps(result,ensure_ascii=False))
(OUT/'etf-diagnostics.json').write_text(json.dumps(dict(kind='diagnostics only, no retraining, no deployment',reports=results),ensure_ascii=False,indent=2),encoding='utf-8')
