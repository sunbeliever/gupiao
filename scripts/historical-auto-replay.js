'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'validation','auto-history-30m'),Paper=require('../assets/paper-engine.js'),Calendar=require('../assets/trading-calendar.js');
// Compatibility tool only: old independent thirty-minute windows are historical
// exploration, not the new EXE's persistent account or a full investment test.
// Current source/calendar/fees can differ from the frozen 2026-10-19 report.
// Existing report/claims are authoritative and must never be overwritten/re-scored.
const LEGACY_MODE='legacy_independent_30m_exploration';
const compatibilityScope='current_source_compatibility_not_original_frozen_2026_10_19_results';
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const iso=time=>new Date(String(time).replace(' ','T')+'+08:00').toISOString();
const clock=ms=>new Date(ms+8*3600000).toISOString().replace('T',' ').slice(0,19);
function parseMinutes(payload){
 const j=typeof payload==='string'?JSON.parse(payload):payload;if(!Array.isArray(j?.data?.klines))throw new Error('No minute bars');
 return j.data.klines.map(line=>{const a=line.split(',');return {time:a[0]+(a[0].length===16?':00':''),open:Number(a[1]),close:Number(a[2]),high:Number(a[3]),low:Number(a[4]),volume:Number(a[5])};}).filter(b=>/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(b.time)&&[b.open,b.close,b.high,b.low,b.volume].every(Number.isFinite)&&b.open>0&&b.close>0&&b.low>0&&b.high>=Math.max(b.open,b.close)&&b.low<=Math.min(b.open,b.close)&&b.volume>=0).sort((a,b)=>a.time.localeCompare(b.time));
}
function quoteSnapshot(universe,minutes,time){
 const day=time.slice(0,10),quotes={};for(const u of universe){const bars=minutes[u.symbol]||[],b=bars.find(b=>b.time===time),opening=bars.find(b=>b.time===day+' 09:35:00');if(b&&opening)quotes[u.symbol]={price:b.close,open:opening.open,sourceTime:b.time,source:'东方财富历史5分钟收盘快照',historical:true};}return quotes;
}
function freezeRounds({minutes,histories,universe,model,analysis,policy}){
 const executionMode=policy.executionMode||LEGACY_MODE;if(![LEGACY_MODE,'continuous_paper'].includes(executionMode))throw Error('Unsupported historical compatibility mode');
 const benchmark=minutes.sh588000||[],dates=[...new Set(benchmark.map(b=>b.time.slice(0,10)))].filter(d=>d>model.cutoff).sort(),candidates=[];
 for(const day of dates)for(const start of policy.windowStartsChina)if(benchmark.some(b=>b.time===day+' '+start))candidates.push({day,start});
 let rng=policy.seed>>>0;for(let i=candidates.length-1;i>0;i--){rng=(Math.imul(rng,1664525)+1013904223)>>>0;const j=Math.floor(rng/4294967296*(i+1));[candidates[i],candidates[j]]=[candidates[j],candidates[i]];}
 return candidates.slice(0,policy.maxWindows).map((c,index)=>{
  const time=c.day+' '+c.start,startAt=iso(time),prefix=Object.fromEntries(universe.map(u=>[u.symbol,(histories[u.symbol]||[]).filter(b=>b.date<c.day)])),signalDate=prefix.sh588000?.at(-1)?.date||null;
  const base={index:index+1,day:c.day,startAt,endAt:new Date(Date.parse(startAt)+policy.durationMs).toISOString(),signalDate,executionMode,compatibilityScope,fullHorizonAccountEvidence:false};
  try{
   if(!signalDate||model.cutoff>signalDate||universe.some(u=>prefix[u.symbol].at(-1)?.date!==signalDate))throw new Error('Missing common completed daily prefix');
   if(signalDate!==Calendar.expectedCompletedSession(startAt))throw new Error('Daily prefix does not match expected completed session');
   const predictions=Object.fromEntries(universe.map(u=>[u.symbol,analysis.predict(model,prefix[u.symbol])])),features=Object.fromEntries(universe.map(u=>[u.symbol,analysis.features(prefix[u.symbol])]));
   // Only completed daily prefixes and the opening/entry snapshot enter the decision engine.
   const entryQuotes=quoteSnapshot(universe,minutes,time),create=executionMode===LEGACY_MODE?Paper.legacyStartAuto:Paper.startAuto,session=create({universe,quotes:entryQuotes,predictions,model,now:startAt,budget:policy.budget,positionLimit:policy.positionLimit,maxPositions:policy.maxPositions,minFee:policy.minCommission,historicalReplay:true});
   return {...base,predictions,features,entryQuotes,session};
  }catch(e){return {...base,unresolved:true,reason:e.message};}
 });
}
function replayRound(round,minutes,engine=Paper){
 if(round.unresolved)return {...round,complete:false,netPnl:null,liveDone:false};
 let session=round.session;const states=[],executionMode=round.executionMode||(session.accountType==='continuous_paper'?'continuous_paper':LEGACY_MODE),advance=executionMode===LEGACY_MODE?engine.legacyStepAuto:engine.stepAuto;
 if(typeof advance!=='function')throw Error('The declared historical compatibility engine is unavailable');
 for(let step=1;step<=6;step++){
  const now=Date.parse(round.startAt)+step*300000,at=new Date(now).toISOString(),quotes=quoteSnapshot(session.universe||session.automation.universe,minutes,clock(now)),before=session.automation.events.length;
  session=advance(session,quotes,at);states.push({at,equity:session.account.equity,cash:session.account.cash,actions:session.automation.events.slice(before)});
 }
 const a=session.automation,complete=a.historicalComplete===true;
 return {index:round.index,day:round.day,startAt:round.startAt,endAt:round.endAt,signalDate:round.signalDate,executionMode,compatibilityScope,fullHorizonAccountEvidence:false,complete,reason:a.failureReason,liveDone:a.done,horizonAccuracy:null,
  netPnl:complete?session.account.equity-session.budget:null,netReturn:complete?session.account.equity/session.budget-1:null,realizedPnl:complete?session.realizedPnl:null,
  exposed:a.events.some(e=>e.action==='buy'),buys:a.events.filter(e=>e.action==='buy').length,sells:a.events.filter(e=>e.action==='sell').length,blockedExits:a.events.filter(e=>e.action==='exit_blocked').length,
  benchmarkReturn:complete?session.benchmark.equity/session.budget-1:null,states,session};
}
function summarize(rounds){const valid=rounds.filter(r=>r.complete),exposed=valid.filter(r=>r.exposed),pnl=valid.map(r=>r.netPnl).sort((a,b)=>a-b);return {sampledWindows:rounds.length,completeWindows:valid.length,unresolvedWindows:rounds.length-valid.length,exposedWindows:exposed.length,cashOnlyWindows:valid.length-exposed.length,profitableExposedWindows:exposed.filter(r=>r.netPnl>0).length,losingExposedWindows:exposed.filter(r=>r.netPnl<0).length,flatExposedWindows:exposed.filter(r=>r.netPnl===0).length,exposedWindowWinFraction:exposed.length?exposed.filter(r=>r.netPnl>0).length/exposed.length:null,averagePnlPerIndependentWindow:valid.length?valid.reduce((s,r)=>s+r.netPnl,0)/valid.length:null,worstWindowPnl:pnl[0]??null,bestWindowPnl:pnl.at(-1)??null,totalBuys:valid.reduce((s,r)=>s+r.buys,0),totalSells:valid.reduce((s,r)=>s+r.sells,0),blockedExitSignals:valid.reduce((s,r)=>s+r.blockedExits,0),liveThirtyMinuteTestsCompleted:0,horizonAccuracy:null};}
async function fetchDataset(Market){
 const destination=path.join(dir,'raw');fs.mkdirSync(destination,{recursive:true});let cursor=0;const minutes={},health=[];
 const workers=Array.from({length:4},async()=>{while(cursor<Market.UNIVERSE.length){const u=Market.UNIVERSE[cursor++],file=path.join(destination,u.symbol+'.json');try{
   let payload,metadata;if(fs.existsSync(file)){const saved=JSON.parse(fs.readFileSync(file,'utf8'));payload=saved.payload;metadata=saved.metadata;}
   else{const secid=(u.symbol.startsWith('sh')?'1.':'0.')+u.symbol.slice(2),url='https://push2his.eastmoney.com/api/qt/stock/kline/get?secid='+secid+'&klt=5&fqt=0&beg=20260101&end=20500101&lmt=1000&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61',r=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error('HTTP '+r.status);payload=await r.json();metadata={receivedAt:new Date().toISOString(),url,payloadSha256:sha(JSON.stringify(payload))};fs.writeFileSync(file,JSON.stringify({metadata,payload}),{flag:'wx'});}
   minutes[u.symbol]=parseMinutes(payload);health.push({symbol:u.symbol,count:minutes[u.symbol].length,first:minutes[u.symbol][0]?.time,last:minutes[u.symbol].at(-1)?.time,...metadata});
  }catch(e){minutes[u.symbol]=[];health.push({symbol:u.symbol,error:e.message});}
 }});await Promise.all(workers);return {minutes,health};
}
async function main(){
 fs.mkdirSync(dir,{recursive:true});const claim=path.join(dir,'experiment.claim');try{fs.closeSync(fs.openSync(claim,'wx'));}catch(e){if(e.code==='EEXIST')throw new Error('Existing historical test must not be replaced or rerun to select profit');throw e;}
 const policy=JSON.parse(fs.readFileSync(path.join(root,'docs/automatic-replay-policy.json'),'utf8')),sourceHashes=Object.fromEntries(['paper-engine.js','analysis.js','market.js','seed.js'].map(name=>[name,sha(fs.readFileSync(path.join(root,'assets',name)))]));
 sourceHashes['historical-auto-replay.js']=sha(fs.readFileSync(__filename));
 fs.mkdirSync(path.join(dir,'frozen'),{recursive:true});for(const name of ['paper-engine.js','analysis.js','market.js','seed.js'])fs.writeFileSync(path.join(dir,'frozen',name),fs.readFileSync(path.join(root,'assets',name)),{flag:'wx'});fs.writeFileSync(path.join(dir,'frozen','historical-auto-replay.js'),fs.readFileSync(__filename),{flag:'wx'});
 fs.writeFileSync(path.join(dir,'policy-frozen.json'),JSON.stringify({declaredAt:new Date().toISOString(),executionMode:policy.executionMode||LEGACY_MODE,compatibilityScope,fullHorizonAccountEvidence:false,policy,sourceHashes},null,2),{flag:'wx'});
 global.Native=require('./research-file-store.js').createFileStore(path.join(dir,'cache'));fs.mkdirSync(path.join(dir,'cache'),{recursive:true});const ctx={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/seed.js'),'utf8'),ctx);const seed=ctx.window.TECH_SEED;global.TECH_SEED=seed;
 const Market=require('../assets/market.js'),Analysis=require('../assets/analysis.js');Market.setTransport(async url=>{const r=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error('HTTP '+r.status);return r.text();});
 const [{minutes,health},histories]=await Promise.all([fetchDataset(Market),Market.syncHistories()]);
 fs.writeFileSync(path.join(dir,'data-health.json'),JSON.stringify(health,null,2));
 const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10);if(Market.UNIVERSE.some(u=>{const c=Market.read('hist_'+u.symbol);return !c||c.fetchedDate!==today||c.errors?.length;}))throw new Error('Daily-history synchronization incomplete; no replay performance fabricated');
 fs.writeFileSync(path.join(dir,'histories-frozen.json'),JSON.stringify(histories),{flag:'wx'});
 const frozen=freezeRounds({minutes,histories,universe:Market.UNIVERSE,model:seed.model,analysis:Analysis,policy});if(!frozen.length)throw new Error('No real historical windows after the deployed training cutoff; no simulated performance invented');
 const body=JSON.stringify({frozenAt:new Date().toISOString(),modelVersion:seed.model.version,modelCutoff:seed.model.cutoff,rounds:frozen},null,2),hash=sha(body);fs.writeFileSync(path.join(dir,'decisions-frozen.json'),body,{flag:'wx'});fs.writeFileSync(path.join(dir,'decisions.sha256'),hash+'\n',{flag:'wx'});
 // Outcome reading starts only after every initial decision has been frozen on disk.
 const rounds=JSON.parse(fs.readFileSync(path.join(dir,'decisions-frozen.json'),'utf8')).rounds.map(r=>replayRound(r,minutes)),report={scoredAt:new Date().toISOString(),executionMode:policy.executionMode||LEGACY_MODE,compatibilityScope,fullHorizonAccountEvidence:false,decisionsSha256:hash,policy,sourceHashes,dataHealth:health,summary:summarize(rounds),rounds};
 fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify({...report.summary,rounds:rounds.map(r=>({day:r.day,startAt:r.startAt,complete:r.complete,netPnl:r.netPnl,buys:r.buys,blockedExits:r.blockedExits,benchmarkReturn:r.benchmarkReturn,reason:r.reason}))}));
}
if(require.main===module)main().catch(e=>{if(fs.existsSync(dir))fs.writeFileSync(path.join(dir,'failure-'+Date.now()+'.json'),JSON.stringify({at:new Date().toISOString(),error:e.stack},null,2));console.error(e.message);process.exitCode=1;});
module.exports={parseMinutes,quoteSnapshot,freezeRounds,replayRound,summarize};
