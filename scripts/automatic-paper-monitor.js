'use strict';
// One prospectively declared run, using the exact shared desktop decision engine.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const fullCapital=process.argv.includes('--full-capital'),verifiedRelease=process.argv.includes('--verified-release'),correctedAllocation=process.argv.includes('--corrected-allocation'),freshnessCorrected=process.argv.includes('--freshness-corrected'),root=path.resolve(__dirname,'..'),dir=path.join(root,'validation',fullCapital?(verifiedRelease?'auto-full-v4-30m-2026-10-20':freshnessCorrected?'auto-full-v3-30m-2026-10-20':correctedAllocation?'auto-full-v2-30m-2026-10-20':'auto-full-30m-2026-10-20'):'auto-30m-2026-10-20');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function save(name,value){const file=path.join(dir,name);fs.writeFileSync(file+'.pending',JSON.stringify(value,null,2));fs.renameSync(file+'.pending',file);}
function prepare(){
 fs.mkdirSync(dir,{recursive:true});
 if(fs.existsSync(path.join(dir,'declaration.json')))throw new Error('Declaration already exists; never replace this run');
 const files={};for(const name of ['paper-engine.js','corporate-actions.js','corporate-events.js','analysis.js','market.js','seed.js']){const b=fs.readFileSync(path.join(root,'assets',name));fs.writeFileSync(path.join(dir,name),b,{flag:'wx'});files[name]=sha(b);}
 const declaration={schema:1,declaredAt:new Date().toISOString(),scheduledDate:'2026-10-20',expectedHistoryDate:'2026-10-19',earliestEntry:'2026-10-20T09:30:00+08:00',latestEntry:'2026-10-20T09:35:00+08:00',durationMs:1800000,intervalMs:30000,
  policy:{budget:10000,positionLimit:fullCapital?10000:500,allocationMode:fullCapital?'full':'capped',maxPositions:3,minFee:5,commissionRate:.0003,slippage:.001,stockTransferRate:.00001,stockSellStampRate:.0005},files,
  allocationRule:fullCapital?'Allocate all available cash across1to3 qualifying choices, leaving lot/fee remainder; later entries use remaining cash and unused slots. Never force negative-net forecasts or count waiting cash as success.':'Legacy500yuan cap per position; retained, superseded before start.',
  exitRule:'Price reaches the frozen model expected 20-session target. New purchases cannot be sold the same day (T+1). No forced exit at the thirty-minute boundary. Each symbol bought at most once. No human discretionary trades.',
  notes:['All transactions virtual; no broker account or actual fills.','Source heartbeat is not a trade timestamp.','Cash zero is not a successful price forecast.','This added target-exit policy has no validated performance; it is not the old four fixed-holding observations.','The forecast horizon is twenty sessions, not thirty minutes.','Fixed commission assumption may differ from an actual contract. Last-price fills do not model order-book queues or liquidity.'],
  ruleSources:['https://one.sse.com.cn/onething/gptz/','https://www.sse.com.cn/assortment/fund/etf/question/','https://www.sse.com.cn/assortment/fund/etf/home/c/c_20151111_4011009.shtml','https://www.kysec.cn/html/2023/gonggaoban_0828/6064.html']};
 save('declaration.json',declaration);console.log(JSON.stringify({prepared:true,dir,scheduledDate:declaration.scheduledDate,earliestEntry:declaration.earliestEntry,latestEntry:declaration.latestEntry,files}));return declaration;
}
function load(){
 const d=JSON.parse(fs.readFileSync(path.join(dir,'declaration.json'),'utf8'));
 for(const [name,hash]of Object.entries(d.files))if(sha(fs.readFileSync(path.join(dir,name)))!==hash)throw new Error('Frozen source hash mismatch: '+name);
 fs.mkdirSync(path.join(dir,'cache'),{recursive:true});global.Native=require('./research-file-store.js').createFileStore(path.join(dir,'cache'));
 const ctx={window:{}};vm.runInNewContext(fs.readFileSync(path.join(dir,'seed.js'),'utf8'),ctx);const seed=ctx.window.TECH_SEED;global.TECH_SEED=seed;
 const Market=require(path.join(dir,'market.js')),Analysis=require(path.join(dir,'analysis.js')),Paper=require(path.join(dir,'paper-engine.js'));
 Market.setTransport(async url=>{const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 TechScopePaper/1.4',Referer:'https://www.eastmoney.com/'},signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error('HTTP '+r.status);return url.includes('qt.gtimg.cn')?new TextDecoder('gb18030').decode(await r.arrayBuffer()):r.text();});
 return {d,seed,Market,Analysis,Paper};
}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function preflight(){const {d,seed,Market,Paper}=load(),quotes=await Market.quotes();const result={observedAt:new Date().toISOString(),quoteCount:Object.keys(quotes).length,cachedQuotes:Object.values(quotes).filter(q=>q.cached).length,sourceTimes:[...new Set(Object.values(quotes).map(q=>q.sourceTime))],modelVersion:seed.model.version,modelCutoff:seed.model.cutoff,marketOpen:Paper.trading(Date.now()),scheduledDate:d.scheduledDate,realTimeTestStarted:false};save('preflight.json',result);console.log(JSON.stringify(result));}
function summary(session){const a=session.automation;return {done:a.done,windowEnded:a.windowEnded,startedAt:session.startedAt,plannedEndAt:a.plannedEndAt,observedAt:session.observedAt,elapsedMs:a.elapsedMs,validObservations:a.validObservations,dataFailureTicks:a.dataFailureTicks,maxGapMs:a.maxGapMs,failureReason:a.failureReason||null,budget:session.budget,equity:session.account.equity,unrealizedAndRealizedPnl:session.account.equity-session.budget,realizedPnl:session.realizedPnl,cash:session.account.cash,benchmarkEquity:session.benchmark.equity,buyCount:a.events.filter(e=>e.action==='buy').length,sellCount:a.events.filter(e=>e.action==='sell').length,blockedExitCount:a.events.filter(e=>e.action==='exit_blocked').length,horizonAccuracy:null,cashIsPredictionSuccess:false,pid:process.pid,session};}
async function run(){
 if(fs.existsSync(path.join(dir,'superseded-before-start.json')))throw new Error('This unstarted snapshot was superseded; preserve it and use the verified release snapshot');
 const {d,seed,Market,Analysis,Paper}=load(),today=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
 if(today!==d.scheduledDate||Date.now()>Date.parse(d.latestEntry)||Date.now()<Date.parse(d.earliestEntry)-5*60000)throw new Error('Outside the declared one-time start window; do not restart on another date');
 try{fs.closeSync(fs.openSync(path.join(dir,'experiment.claim'),'wx'));}catch(e){if(e.code==='EEXIST'){e.code='ALREADY_ATTEMPTED';e.message='This declared test was already attempted; preserve all existing records';}throw e;}
 const histories=await Market.syncHistories(),predictions=Object.fromEntries(Market.UNIVERSE.map(u=>[u.symbol,Analysis.predict(seed.model,histories[u.symbol]||[])]));
 if(Market.UNIVERSE.some(u=>{const c=Market.read('hist_'+u.symbol);return !c||c.fetchedDate!==today||c.errors?.length||predictions[u.symbol].asOf!==d.expectedHistoryDate;}))throw new Error('Incomplete or unexpected historical cutoff; no cash strategy or transactions were fabricated');
 while(Date.now()<Date.parse(d.earliestEntry))await pause(Math.min(10000,Date.parse(d.earliestEntry)-Date.now()));
 let session,quotes,lastError;
 while(Date.now()<=Date.parse(d.latestEntry)){
  try{quotes=await Market.quotes();if(Date.now()>Date.parse(d.latestEntry))throw new Error('Opening quote arrived after the declared latest entry time');session=Paper.startAuto({...d.policy,universe:Market.UNIVERSE,quotes,predictions,model:seed.model});break;}catch(e){lastError=e;await pause(5000);}
 }
 if(!session)throw lastError||new Error('No valid opening quote set before the declared deadline');
 save('manifest.json',{declaration:d,startedAt:session.startedAt,historyCutoff:d.expectedHistoryDate,predictions,features:Object.fromEntries(Market.UNIVERSE.map(u=>[u.symbol,Analysis.features(histories[u.symbol])])),session});
 fs.writeFileSync(path.join(dir,'ticks.jsonl'),JSON.stringify({observedAt:session.startedAt,quotes,equity:session.account.equity,events:session.automation.events})+'\n',{flag:'wx'});save('status.json',summary(session));console.log(JSON.stringify({startedAt:session.startedAt,plannedEndAt:session.automation.plannedEndAt,holdings:session.account.holdings,cash:session.account.cash}));
 let lastEvent=session.automation.events.length;
 while(!session.automation.windowEnded){
  const next=Math.min(d.intervalMs,Math.max(1,Date.parse(session.automation.plannedEndAt)-Date.now()));await pause(next);
  let error=null;try{quotes=await Market.quotes();}catch(e){error=e.message;quotes={};}
  const at=new Date().toISOString();session=Paper.stepAuto(session,quotes,at);
  const events=session.automation.events.slice(lastEvent);lastEvent=session.automation.events.length;
  fs.appendFileSync(path.join(dir,'ticks.jsonl'),JSON.stringify({observedAt:at,quotes,error,events,equity:session.account.equity,cash:session.account.cash,benchmarkEquity:session.benchmark.equity})+'\n');save('status.json',summary(session));
 }
 const result=summary(session);save('result.json',result);console.log(JSON.stringify({done:result.done,equity:result.equity,pnl:result.unrealizedAndRealizedPnl,buys:result.buyCount,sells:result.sellCount,blockedExits:result.blockedExitCount,failureReason:result.failureReason}));
}
if(require.main===module){const task=process.argv.includes('--prepare')?Promise.resolve().then(prepare):process.argv.includes('--preflight')?preflight():process.argv.includes('--run')?run():Promise.reject(new Error('Use --prepare, --preflight, or --run'));task.catch(e=>{if(e.code!=='ALREADY_ATTEMPTED'&&fs.existsSync(dir))save('failure-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json',{observedAt:new Date().toISOString(),error:e.stack});console.error(e.message);process.exitCode=1;});}
module.exports={summary};
