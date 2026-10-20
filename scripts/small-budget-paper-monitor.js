'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const corrected=process.argv.includes('--corrected');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'validation',corrected?'small-budget-v2-live':'small-budget-live');
fs.mkdirSync(path.join(dir,'cache'),{recursive:true});
const save=(name,value)=>{const f=path.join(dir,name);fs.writeFileSync(f+'.pending',JSON.stringify(value,null,2));fs.renameSync(f+'.pending',f);};
global.Native=require('./research-file-store.js').createFileStore(path.join(dir,'cache'));
const ctx={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/seed.js'),'utf8'),ctx);const seed=ctx.window.TECH_SEED;global.TECH_SEED=seed;
const Market=require('../assets/market.js'),Analysis=require('../assets/analysis.js'),Paper=require('../assets/paper-engine.js');
Market.setTransport(async url=>{const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 TechScopeResearch/1.2',Referer:'https://www.eastmoney.com/'},signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error('HTTP '+r.status);return url.includes('qt.gtimg.cn')?new TextDecoder('gb18030').decode(await r.arrayBuffer()):r.text();});
async function main(){
 if(fs.existsSync(path.join(dir,'status.json'))||fs.existsSync(path.join(dir,'experiment.claim'))){const e=new Error('Existing small-budget run must not be replaced');e.code='EXPERIMENT_EXISTS';throw e;}
 try{fs.closeSync(fs.openSync(path.join(dir,'experiment.claim'),'wx'));}catch(e){if(e.code==='EEXIST')e.code='EXPERIMENT_EXISTS';throw e;}
 const policy={profile:'beginner',policyVersion:corrected?'beginner-open-reference-v2':'beginner-initial-v1',budget:10000,positionLimit:500,minFee:5,maxPositions:3,durationMs:3600000},engineSource=fs.readFileSync(path.join(root,'assets/paper-engine.js'));
 fs.writeFileSync(path.join(dir,'paper-engine-frozen.js'),engineSource,{flag:'wx'});
 save('declaration-frozen.json',{declaredAt:new Date().toISOString(),...policy,engineSha256:crypto.createHash('sha256').update(engineSource).digest('hex'),note:'Software-selected virtual experiment only. Excludes STAR/ChiNext individual stocks. Default commission is an assumption, not an actual broker contract. Do not restart to pick profitable results. Corrected version explicitly translates the signal-next-open forecast to the actual intraday entry price.'});
 const histories=await Market.syncHistories(),model=seed.model,predictions=Object.fromEntries(Market.UNIVERSE.map(u=>[u.symbol,Analysis.predict(model,histories[u.symbol]||[])]));
 const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10),latest=Object.values(predictions).map(p=>p.asOf||'').sort().pop();
 if(!latest||Date.now()-Date.parse(latest+'T15:00:00+08:00')>12*86400000||Market.UNIVERSE.some(u=>{const c=Market.read('hist_'+u.symbol);return !c||c.fetchedDate!==today||c.errors?.length||predictions[u.symbol].asOf!==latest;}))throw new Error('Incomplete current-day historical synchronization; cannot report data failure as a cash strategy');
 const quotes=await Market.quotes();if(Market.UNIVERSE.some(u=>!quotes[u.symbol]||quotes[u.symbol].cached||Market.isStale(quotes[u.symbol])))throw new Error('Complete fresh quote set required');
 let session=Paper.start({...policy,universe:Market.UNIVERSE,quotes,predictions,model});const start=Date.parse(session.startedAt),end=start+policy.durationMs;let ticks=0,errors=0;const sourceTimes=new Set();
 save('manifest.json',{...policy,startedAt:session.startedAt,plannedEndAt:new Date(end).toISOString(),historyCutoff:latest,predictions,features:Object.fromEntries(Market.UNIVERSE.map(u=>[u.symbol,Analysis.features(histories[u.symbol])])),session});fs.writeFileSync(path.join(dir,'ticks.jsonl'),'');
 console.log(JSON.stringify({startedAt:session.startedAt,plannedEndAt:new Date(end).toISOString(),holdings:session.account.holdings,cash:session.account.cash,excluded:session.selectionPlan.rows.map(r=>({name:r.name,reason:r.reasonCode}))}));
 while(true){const at=new Date().toISOString();try{const q=ticks?await Market.quotes():quotes;session=Paper.mark(session,q,at);const source=Object.values(q).map(x=>x.sourceTime||'').sort().pop();if(source)sourceTimes.add(source);fs.appendFileSync(path.join(dir,'ticks.jsonl'),JSON.stringify({observedAt:at,sourceTime:source,quotes:q,equity:session.account.equity,benchmarkEquity:session.benchmark.equity})+'\n');}catch(e){errors++;fs.appendFileSync(path.join(dir,'ticks.jsonl'),JSON.stringify({observedAt:at,error:e.message})+'\n');}
  ticks++;const done=Date.now()>=end;save('status.json',{done,startedAt:session.startedAt,plannedEndAt:new Date(end).toISOString(),observedAt:session.observedAt,elapsedMs:Date.now()-start,ticks,errors,distinctSourceTimes:sourceTimes.size,lastSourceTime:[...sourceTimes].sort().pop(),session,pid:process.pid});
  if(ticks===1||ticks%10===0||done)console.log(JSON.stringify({done,ticks,errors,equity:session.account.equity,benchmark:session.benchmark.equity}));
  if(done)break;await new Promise(resolve=>setTimeout(resolve,Math.min(30000,Math.max(1,end-Date.now()))));
 }
}
if(require.main===module)main().catch(e=>{if(e.code!=='EXPERIMENT_EXISTS')save('failure.json',{at:new Date().toISOString(),error:e.stack});console.error(e.message);process.exitCode=1;});
