'use strict';
const Analysis=require('../assets/analysis.js');
function buildPanel(histories){
 const symbols=Object.keys(histories).sort(),calendar=[...new Set(Object.values(histories).flatMap(b=>b.map(x=>x.date)))].sort(),maps={},indices={},cache={};
 for(const s of symbols){maps[s]=Object.fromEntries(histories[s].map(b=>[b.date,b]));indices[s]=Object.fromEntries(histories[s].map((b,i)=>[b.date,i]));cache[s]={};}
 const baseNames=Analysis.features((histories.sh588000||[]).slice(0,61)).names,names=baseNames.concat(['benchmark_momentum20','benchmark_momentum60','benchmark_volatility20','benchmark_drawdown60','relative_momentum20','relative_momentum60','pool_momentum20_rank']);
 const pos=Object.fromEntries(baseNames.map((n,i)=>[n,i])),rows=[],signalCoverage={};
 function feature(s,date){if(cache[s][date])return cache[s][date];const i=indices[s][date];if(i===undefined||i<60)return null;const v=Analysis.features(histories[s].slice(i-60,i+1)).values;return cache[s][date]=v;}
 for(let t=0;t+21<calendar.length;t++){
  const date=calendar[t],entryDate=calendar[t+1],exitDate=calendar[t+21],bf=feature('sh588000',date),be=maps.sh588000[entryDate],bx=maps.sh588000[exitDate];if(!bf||!be||!bx)continue;
  const available=symbols.map(s=>({symbol:s,x:feature(s,date)})).filter(r=>r.x),mom=available.map(r=>r.x[pos.momentum20]);
  signalCoverage[date]={featureEligible:available.length,labeled:0};
  for(const {symbol:s,x} of available){const e=maps[s][entryDate],end=maps[s][exitDate];if(!e||!end)continue;
   const rank=mom.length<2?.5:(mom.filter(v=>v<x[pos.momentum20]).length+.5*(mom.filter(v=>v===x[pos.momentum20]).length-1))/(mom.length-1);
   const actualReturn=end.open/e.open-1,benchmarkReturn=bx.open/be.open-1;
   rows.push({symbol:s,date,entryDate,exitDate,x:x.concat([bf[pos.momentum20],bf[pos.momentum60],bf[pos.volatility20],bf[pos.drawdown60],x[pos.momentum20]-bf[pos.momentum20],x[pos.momentum60]-bf[pos.momentum60],rank]),actualReturn,benchmarkReturn,excessReturn:actualReturn-benchmarkReturn,entryExecutable:e.volume>0&&e.high>e.low,exitExecutable:end.volume>0&&end.high>end.low});
   signalCoverage[date].labeled++;
  }
 }
 return {schema:2,featureNames:names,calendar,sourceAsOf:calendar.at(-1),symbols,signalCoverage,rows:rows.sort((a,b)=>a.date.localeCompare(b.date)||a.symbol.localeCompare(b.symbol))};
}
if(require.main===module){const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),root=path.resolve(__dirname,'..'),c={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/seed.js'),'utf8'),c);const panel=buildPanel(c.window.TECH_SEED.histories),dir=path.join(root,'validation/ranking-research');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'labels.json'),JSON.stringify(panel));console.log(JSON.stringify({labels:panel.rows.length,features:panel.featureNames.length,symbols:panel.symbols.length,sourceAsOf:panel.sourceAsOf}));}
module.exports={buildPanel};
