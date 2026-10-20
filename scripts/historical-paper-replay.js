'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const Analysis=require('../assets/analysis.js'),Market=require('../assets/market.js');
function freeze(histories){
 const calendar=[...new Set(Object.values(histories).flatMap(a=>a.map(b=>b.date)))].sort(),year=calendar.filter(d=>d.startsWith('2023-'));let rng=20231019;
 const random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
 const rounds=[];
 for(let i=0;i<8;i++){
  const date=year[3+i*27+Math.floor(random()*4)];if(!date)throw new Error('Not enough 2023 dates');
  const prefix=Object.fromEntries(Object.entries(histories).map(([s,bars])=>[s,bars.filter(b=>b.date<=date)]));
  // This alpha is declared before scoring; it does not use the 2024 tuning or 2023 outcomes.
  const model=Analysis.train(prefix,{cutoff:date,horizon:20,alpha:.1});
  const predictions=Market.UNIVERSE.filter(u=>u.type==='stock').map(u=>({symbol:u.symbol,name:u.name,...Analysis.predict(model,prefix[u.symbol]||[])})).filter(p=>p.eligible&&Number.isFinite(p.expectedReturn));
  const chosen=predictions.slice().sort((a,b)=>b.expectedReturn-a.expectedReturn||a.symbol.localeCompare(b.symbol)).filter(p=>p.expectedReturn>0).slice(0,3);
  rounds.push({signalDate:date,model,predictions:predictions.map(p=>({symbol:p.symbol,name:p.name,asOf:p.asOf,expectedReturn:p.expectedReturn})),chosen:chosen.map(p=>({symbol:p.symbol,name:p.name,expectedReturn:p.expectedReturn,features:Analysis.features(prefix[p.symbol])}))});
 }
 return {schema:1,experiment:'2023-fixed-sample-prefix-only',samplingSeed:20231019,horizon:20,alpha:.1,rounds,
  limitations:['Current hand-picked surviving technology pool; not point-in-time unbiased universe.','Only daily adjusted-price valuation; not real shares or confirmed broker fills.','Eight prespecified sampled rounds do not establish investment accuracy.']};
}
function score(frozen,histories){
 const calendar=[...new Set(Object.values(histories).flatMap(a=>a.map(b=>b.date)))].sort(),maps=Object.fromEntries(Object.entries(histories).map(([s,b])=>[s,Object.fromEntries(b.map(x=>[x.date,x]))])),fee=.0015;
 const rounds=frozen.rounds.map(r=>{const t=calendar.indexOf(r.signalDate),entryDate=calendar[t+1],exitDate=calendar[t+21];
  function outcome(p){const entry=maps[p.symbol]?.[entryDate],exit=maps[p.symbol]?.[exitDate];const entryExecutable=!!entry&&entry.volume>0&&entry.high>entry.low;
   if(!entry||!exit)return {...p,available:false,entryAvailable:!!entry,entryExecutable,reason:entry?'missing_exit':'missing_entry'};
   const actual=exit.open/entry.open-1;return {...p,available:true,entryAvailable:true,actualReturn:actual,netReturn:(1+actual)*(1-fee)*(1-fee)-1,directionCorrect:(p.expectedReturn>=0)===(actual>=0),absoluteError:Math.abs(p.expectedReturn-actual),entryExecutable,exitExecutable:exit.volume>0&&exit.high>exit.low};}
  function basket(positions){if(positions.some(p=>p.entryAvailable&&p.entryExecutable&&!p.available))return null;return positions.length?positions.reduce((s,p)=>s+(p.available&&p.entryExecutable?p.netReturn:0),0)/positions.length:0;}
  const all=r.predictions.map(outcome),chosen=r.chosen.map(outcome),etf=outcome({symbol:'sh588000',expectedReturn:0});
  return {signalDate:r.signalDate,trainingCutoff:r.model.cutoff,labelEndMax:r.model.labelEndMax,entryDate,exitDate,chosen,all,
   modelReturn:basket(chosen),poolReturn:basket(all),etfReturn:etf.available?etf.netReturn:null};
 });
 const labels=rounds.flatMap(r=>r.all).filter(p=>p.available),mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
 const compound=key=>rounds.some(r=>r[key]===null)?null:rounds.reduce((nav,r)=>nav*(1+r[key]),1)-1;
 return {schema:1,scoredAt:new Date().toISOString(),rounds,summary:{rounds:rounds.length,unresolvedRounds:rounds.filter(r=>r.modelReturn===null).length,labels:labels.length,directionAccuracy:mean(labels.map(p=>+p.directionCorrect)),alwaysUpAccuracy:mean(labels.map(p=>+(p.actualReturn>=0))),mae:mean(labels.map(p=>p.absoluteError)),zeroMae:mean(labels.map(p=>Math.abs(p.actualReturn))),profitableRounds:rounds.filter(r=>r.modelReturn>0).length,modelCompoundReturn:compound('modelReturn'),poolCompoundReturn:compound('poolReturn'),etfCompoundReturn:compound('etfReturn')},limitations:frozen.limitations,notes:['0.15% approximate fee each side. No actual tax/commission schedule or market impact simulation.','Compounded only across the eight sampled holding windows, with cash between windows; not a full-year return. Missing exits remain unresolved, never retroactive cash.','Direction accuracy counts overlapping instruments within each round and is not an independent win probability.']};
}
if(require.main===module){const root=path.resolve(__dirname,'..'),dir=path.join(root,'validation','historical-paper');fs.mkdirSync(dir,{recursive:true});const c={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/seed.js'),'utf8'),c);const histories=c.window.TECH_SEED.histories;
 const frozen=freeze(histories),json=JSON.stringify(frozen,null,2),hash=crypto.createHash('sha256').update(json).digest('hex');
 fs.writeFileSync(path.join(dir,'decisions-frozen.json'),json);fs.writeFileSync(path.join(dir,'decisions.sha256'),hash+'\n');
 // Outcome evaluation is a separate call after the decision artifact has been written.
 const report=score(JSON.parse(fs.readFileSync(path.join(dir,'decisions-frozen.json'),'utf8')),histories);report.decisionsSha256=hash;fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({sha256:hash,...report.summary,rounds:report.rounds.map(r=>({signalDate:r.signalDate,entryDate:r.entryDate,exitDate:r.exitDate,chosen:r.chosen.map(p=>p.name),modelReturn:r.modelReturn,poolReturn:r.poolReturn,etfReturn:r.etfReturn}))},null,2));
}
module.exports={freeze,score};
