'use strict';
// Read-only benchmark audit. Uses exactly the seeded shared trading calendar and mature labels.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const Analysis=require('../assets/analysis.js');
const scope={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/seed.js'),'utf8'),scope);
const seed=scope.window.TECH_SEED,histories=seed.histories;
const symbols=Object.keys(histories).sort();
const calendar=[...new Set(Object.values(histories).flatMap(a=>a.map(x=>x.date)))].sort();
const maps=Object.fromEntries(symbols.map(s=>[s,new Map(histories[s].map((b,i)=>[b.date,{bar:b,index:i}]))]));
const horizon=20,alpha=seed.model.validation.selectedAlpha;
function previousMonth(date){const y=Number(date.slice(0,4)),m=Number(date.slice(5,7));return new Date(Date.UTC(y,m-1,0)).toISOString().slice(0,10);}
const summaries={};
for(const year of [2025,2026]){
 const original=seed.reports[year],models=new Map();let n=0,up=0,zeroError=0,meanError=0,meanHit=0;
 for(let t=0;t+horizon+1<calendar.length;t++){
  const date=calendar[t],entryDate=calendar[t+1],exitDate=calendar[t+horizon+1];
  if(!date.startsWith(String(year))||exitDate>original.asOf)continue;
  const cutoff=year>=2026?previousMonth(date):(year-1)+'-12-31';
  if(!models.has(cutoff))models.set(cutoff,Analysis.train(histories,{cutoff,horizon,alpha}));
  const mean=models.get(cutoff).intercept;
  for(const symbol of symbols){const point=maps[symbol].get(date),entry=maps[symbol].get(entryDate),exit=maps[symbol].get(exitDate);if(!point||point.index<60||!entry||!exit)continue;
   const y=exit.bar.open/entry.bar.open-1;n++;if(y>=0)up++;zeroError+=Math.abs(y);meanError+=Math.abs(y-mean);if((mean>=0)===(y>=0))meanHit++;
  }
 }
 if(n!==original.sampleCount)throw new Error('Eligibility mismatch for '+year+': '+n+' != '+original.sampleCount);
 summaries[year]={asOf:original.asOf,maturedInstrumentDayLabels:n,direction:{model:original.directionAccuracy,alwaysUp:up/n,priorTrainingMean:meanHit/n},mae:{model:original.mae,zeroReturn:zeroError/n,priorTrainingMean:meanError/n},modelVsMeanMaeImprovement:1-original.mae/(meanError/n),simulatedMaxDrawdown:original.maxDrawdown};
}
const result={auditedAt:new Date().toISOString(),horizonTradingDays:20,languageModelTrained:false,modelKind:seed.model.kind,symbols:symbols.length,source:'Embedded initial seed; not a refreshed live performance report',summaries,limitations:['Current hand-picked research pool has survivorship bias.','Instrument-day labels overlap and correlate; sample count is not independent evidence.','News and financial statements are not inputs to the current forecast.','Direction hit rate alone does not establish investment profitability.','No verified point-in-time universe, broker execution or forward paper-trading track record.']};
fs.writeFileSync(path.join(root,'validation/model-readiness-audit.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
