'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const Analysis=require('../assets/analysis.js'),Market=require('../assets/market.js');
const POLICIES=['ridge','stock-risk','etf-risk'];
function allocate(policy,universe,predictions,indicators){
 const passing=u=>{const i=indicators[u.symbol];return i&&i.ma20>i.ma60&&i.momentum20>0&&i.rsi<= (policy==='etf-risk'?75:70)&&i.drawdown<=.25&&i.volatility<=1;};
 let candidates;
 if(policy==='etf-risk')candidates=universe.filter(u=>u.type==='etf'&&passing(u)).sort((a,b)=>indicators[b.symbol].momentum60/(indicators[b.symbol].volatility+.1)-indicators[a.symbol].momentum60/(indicators[a.symbol].volatility+.1)||a.symbol.localeCompare(b.symbol)).slice(0,2);
 else candidates=universe.filter(u=>u.type==='stock'&&predictions[u.symbol]?.eligible&&predictions[u.symbol].expectedReturn>0&&(policy==='ridge'||passing(u))).sort((a,b)=>predictions[b.symbol].expectedReturn-predictions[a.symbol].expectedReturn||a.symbol.localeCompare(b.symbol)).slice(0,3);
 return candidates.map(u=>({symbol:u.symbol,name:u.name,weight:policy==='stock-risk'?.2:policy==='etf-risk'?.25:1/candidates.length}));
}
function simulate(histories,year,policy){
 const calendar=[...new Set(Object.values(histories).flatMap(b=>b.map(x=>x.date)))].sort(),maps=Object.fromEntries(Object.entries(histories).map(([s,b])=>[s,Object.fromEntries(b.map(x=>[x.date,x]))]));
 const cutoff=(year-1)+'-12-31',training=Object.fromEntries(Object.entries(histories).map(([s,b])=>[s,b.filter(x=>x.date<=cutoff)])),model=Analysis.train(training,{cutoff,horizon:20,alpha:.1}),fee=.0015;
 const start=calendar.findIndex(d=>d.startsWith(year+'-')),rounds=[],curve=[];let nav=1,peak=1,dd=0,unresolved=false;
 for(let t=start;t>=0&&t+21<calendar.length&&calendar[t+21]<=(year+'-12-31');t+=20){
  if(!calendar[t].startsWith(year+'-'))break;
  const signalDate=calendar[t],entryDate=calendar[t+1],exitDate=calendar[t+21];
  const prefix=Object.fromEntries(Object.entries(histories).map(([s,b])=>[s,b.filter(x=>x.date<=signalDate)]));
  const pred=Object.fromEntries(Market.UNIVERSE.map(u=>[u.symbol,Analysis.predict(model,prefix[u.symbol]||[])])),ind=Object.fromEntries(Market.UNIVERSE.map(u=>[u.symbol,Analysis.indicators(prefix[u.symbol]||[])]));
  const weights=allocate(policy,Market.UNIVERSE,pred,ind),positions=weights.map(p=>({...p,entry:maps[p.symbol]?.[entryDate],exit:maps[p.symbol]?.[exitDate]})).map(p=>({...p,entered:!!p.entry&&p.entry.volume>0&&p.entry.high>p.entry.low}));
  if(positions.some(p=>p.entered&&(!p.exit||p.exit.volume<=0||p.exit.high===p.exit.low))){unresolved=true;rounds.push({signalDate,entryDate,exitDate,status:'unresolved',positions:weights});break;}
  const exposure=positions.filter(p=>p.entered).reduce((n,p)=>n+p.weight,0),before=nav;
  function value(date,last){return 1-exposure+positions.filter(p=>p.entered).reduce((n,p)=>{const observed=prefix[p.symbol].concat((histories[p.symbol]||[]).filter(b=>b.date>signalDate&&b.date<=date));const mark=last?p.exit.open:maps[p.symbol]?.[date]?.close||observed.at(-1)?.close;return n+p.weight*mark/p.entry.open*(1-fee)*(last?1-fee:1);},0);}
  for(let i=t+1;i<=t+21;i++){const equity=before*value(calendar[i],i===t+21);peak=Math.max(peak,equity);dd=Math.max(dd,1-equity/peak);curve.push({date:calendar[i],nav:equity});}
  nav=before*value(exitDate,true);rounds.push({signalDate,entryDate,exitDate,status:'resolved',exposure,netReturn:nav/before-1,positions:positions.map(p=>({symbol:p.symbol,name:p.name,weight:p.weight,entered:p.entered,netReturn:p.entered?p.exit.open/p.entry.open*(1-fee)*(1-fee)-1:0}))});
 }
 const active=rounds.filter(r=>r.status==='resolved'&&r.exposure>0),positions=rounds.flatMap(r=>r.positions).filter(p=>p.entered);
 return {year,policy,trainingCutoff:cutoff,alpha:.1,horizon:20,unresolved,netReturn:unresolved?null:nav-1,maxDrawdown:dd,activeRounds:active.length,profitableRounds:active.filter(r=>r.netReturn>0).length,roundWinRate:active.length?active.filter(r=>r.netReturn>0).length/active.length:null,positionWinRate:positions.length?positions.filter(p=>p.netReturn>0).length/positions.length:null,rounds,curve};
}
if(require.main===module){const root=path.resolve(__dirname,'..'),dir=path.join(root,'validation','risk-research');fs.mkdirSync(dir,{recursive:true});const c={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/seed.js'),'utf8'),c);const h=c.window.TECH_SEED.histories;
 const manifest={policies:POLICIES,declaredAt:new Date().toISOString(),selectionYear:2022,criterion:'2022 validation netReturn - 2 * maxDrawdown, among risk candidates; must beat cash and have >=6 active rounds',constants:{alpha:.1,horizon:20,stockCap:.2,stockTotalCap:.6,etfCap:.25,etfTotalCap:.5,feeEachSide:.0015},noPromise:'70% is a research aspiration, not a guarantee. Later retrospective results are already broadly known; this is development research, not an untouched live performance record.'};
 fs.writeFileSync(path.join(dir,'manifest-frozen.json'),JSON.stringify(manifest,null,2));
 const validation=POLICIES.map(p=>simulate(h,2022,p));
 const candidates=validation.filter(r=>r.policy!=='ridge'&&!r.unresolved&&r.activeRounds>=6&&r.netReturn>0).sort((a,b)=>(b.netReturn-2*b.maxDrawdown)-(a.netReturn-2*a.maxDrawdown));
 const selected=candidates[0]?.policy||null;
 fs.writeFileSync(path.join(dir,'selection-frozen.json'),JSON.stringify({selected,validation,manifestSha256:crypto.createHash('sha256').update(JSON.stringify(manifest)).digest('hex')},null,2));
 const reports=[2023,2024,2025,2026].flatMap(y=>POLICIES.map(p=>simulate(h,y,p)));
 const report={manifest,selected,validation,reports,readiness:'unproven',limitations:['Current surviving hand-picked technology pool, not historical constituent membership.','Daily adjusted valuations, no guaranteed executions; one-price/missing exits stop a simulation as unresolved.','Strategy research only. Cash preservation can reduce exposure but cannot guarantee profit.','70% win-rate alone is not sufficient; correlated cases, drawdown and cost matter.']};
 fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({selected,rows:validation.concat(reports).map(({year,policy,netReturn,maxDrawdown,activeRounds,roundWinRate,positionWinRate,unresolved})=>({year,policy,netReturn,maxDrawdown,activeRounds,roundWinRate,positionWinRate,unresolved}))},null,2));
}
module.exports={allocate,simulate};
