'use strict';
// Forward-only collection and virtual account driver. No broker, order gateway or model fitting.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const Audit=require('../assets/audit-identity.js'),Calendar=require('../assets/trading-calendar.js'),Fee=require('../assets/fee-profile.js');
const RUNTIME_FILES=Object.freeze(['paper-engine.js','paper-account.js','trading-calendar.js','fee-profile.js','audit-identity.js','corporate-actions.js','corporate-events.js','analysis.js','market.js','news-facts.js','seed.js']);
const DEFAULT_ROOT=path.resolve(__dirname,'..'),clone=x=>JSON.parse(JSON.stringify(x)),sha=x=>crypto.createHash('sha256').update(x).digest('hex'),iso=x=>new Date(x).toISOString();
function instant(x){const n=typeof x==='number'?x:Date.parse(x);if(!Number.isFinite(n))throw Error('Invalid instant');return n;}
function explicitTime(x){if(typeof x!=='string'||!/(?:Z|[+-]\d{2}:\d{2})$/.test(x))throw Error('Use an ISO timestamp with explicit timezone');return instant(x);}
function safeId(id){if(typeof id!=='string'||!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id))throw Error('Invalid experiment ID');return id;}
function experimentDirectory(root,id){return path.join(path.resolve(root),'validation','continuous',safeId(id));}
function atomic(file,value){const pending=file+'.pending-'+process.pid+'-'+crypto.randomBytes(4).toString('hex');fs.writeFileSync(pending,JSON.stringify(value,null,2),{flag:'wx'});fs.renameSync(pending,file);}
function equalKeys(a,b){return JSON.stringify(Object.keys(a||{}).sort())===JSON.stringify(Object.keys(b||{}).sort());}
function validateGate(gate,sourceHashes,exeHash){
 if(gate?.schema!=='continuous-release-gate-v1'||gate.exeSha256!==exeHash)throw Error('Release gate or EXE hash mismatch');
 if(!equalKeys(gate.runtimeFiles,sourceHashes)||!equalKeys(gate.tests?.sourceHashes,sourceHashes)||Object.entries(sourceHashes).some(([n,h])=>gate.runtimeFiles[n]!==h||gate.tests.sourceHashes[n]!==h))throw Error('Release/test source hash mismatch');
 if(gate.tests?.passed!==true||gate.tests.failed!==0||!Number.isInteger(gate.tests.count)||gate.tests.count<1)throw Error('Formal test gate incomplete');
 for(const key of ['passed','persistencePassed','networkPassed','allHistoriesCurrent'])if(gate.native?.[key]!==true)throw Error('Native Windows gate incomplete: '+key);
 return true;
}
function prepare(options){
 const root=path.resolve(options.root||DEFAULT_ROOT),id=safeId(options.id),now=options.now===undefined?Date.now():instant(options.now),entry=explicitTime(options.entryAfter),latest=options.latestEntry?explicitTime(options.latestEntry):entry+300000;
 if(entry<=now)throw Error('Entry must be strictly in the future; no backfilled entry');
 if(!Calendar.isTradingTime(entry)||!Calendar.isTradingTime(latest)||Calendar.sessionOf(entry)!==Calendar.sessionOf(latest)||latest<=entry)throw Error('Entry window must remain within one continuous exchange session');
 const directory=experimentDirectory(root,id);if(fs.existsSync(directory))throw Error('Experiment ID already exists; preserve its account and failures');
 const exe=path.resolve(options.exe||''),verification=path.resolve(options.verification||options.releaseVerification||''),sourceHashes=Object.fromEntries(RUNTIME_FILES.map(n=>[n,sha(fs.readFileSync(path.join(root,'assets',n)))])),exeHash=sha(fs.readFileSync(exe)),gate=JSON.parse(fs.readFileSync(verification,'utf8'));
 validateGate(gate,sourceHashes,exeHash);
 const universe=clone(require(path.join(root,'assets/market.js')).UNIVERSE);if(universe.length!==19||universe.filter(u=>u.type==='etf').length!==6)throw Error('Unexpected frozen research universe; requires original 19 assets / six ETFs');
 const policy={budget:10000,preset:'full_capital',allocationMode:'full',feeProfile:Fee.resolve(),riskLimits:{investableLimit:10000,maxExposure:1,maxPositions:3,maxThemeWeight:1},stopLossRate:.08};
 const manifest={schema:1,id,declaredAt:iso(now),entryAfter:iso(entry),latestEntry:iso(latest),executionMode:'continuous_forward_node',intervalMs:30000,historyRefreshMs:300000,universe,executionSymbols:universe.filter(u=>u.type==='etf').map(u=>u.symbol),policy,files:sourceHashes,exeSha256:exeHash,releaseVerificationHash:sha(fs.readFileSync(verification)),driverHash:sha(fs.readFileSync(__filename)),nativeRuntimeCaveat:true,notes:['All orders virtual; separate account from the Windows UI, never merge their returns.','Same frozen account rules and model as the verified EXE; Node connectivity does not prove permanent native connectivity.','Thirty minutes measures engineering only. Twenty-session profitability remains unproven.','Known 2023-2026 historical exploration is not a blind test. Only actual forward timestamps are recorded.','No added capital, commission waiver, human stock picking, training or automatic model promotion.']};
 fs.mkdirSync(path.dirname(directory),{recursive:true});fs.mkdirSync(directory);fs.mkdirSync(path.join(directory,'sources'));fs.mkdirSync(path.join(directory,'cache'));
 try{for(const n of RUNTIME_FILES)fs.copyFileSync(path.join(root,'assets',n),path.join(directory,'sources',n),fs.constants.COPYFILE_EXCL);fs.copyFileSync(exe,path.join(directory,'release.exe'),fs.constants.COPYFILE_EXCL);fs.copyFileSync(verification,path.join(directory,'release-verification.json'),fs.constants.COPYFILE_EXCL);fs.copyFileSync(__filename,path.join(directory,'driver-source.js'),fs.constants.COPYFILE_EXCL);atomic(path.join(directory,'manifest.json'),manifest);}
 catch(e){atomic(path.join(directory,'prepare-failure.json'),{at:iso(Date.now()),error:e.message});throw e;}
 return {directory,manifest};
}
function validateFrozen(directory){
 const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'));safeId(manifest.id);
 if(!equalKeys(manifest.files,Object.fromEntries(RUNTIME_FILES.map(n=>[n,null]))))throw Error('Frozen runtime module set mismatch');
 for(const [name,hash]of Object.entries(manifest.files))if(sha(fs.readFileSync(path.join(directory,'sources',name)))!==hash)throw Error('Frozen source hash mismatch: '+name);
 if(sha(fs.readFileSync(path.join(directory,'release.exe')))!==manifest.exeSha256||sha(fs.readFileSync(path.join(directory,'release-verification.json')))!==manifest.releaseVerificationHash||sha(fs.readFileSync(path.join(directory,'driver-source.js')))!==manifest.driverHash)throw Error('Frozen release/gate/driver integrity mismatch');
 if(sha(fs.readFileSync(__filename))!==manifest.driverHash)throw Error('Active driver differs from the frozen driver; preserve account and review an explicit migration');
 validateGate(JSON.parse(fs.readFileSync(path.join(directory,'release-verification.json'),'utf8')),manifest.files,manifest.exeSha256);return manifest;
}
function sealState(state){const body=clone(state);delete body.stateHash;delete body.lastTickHash;state.stateHash=Audit.hash(body);return state;}
function validateState(state,manifest,runtime){const body=clone(state);delete body.stateHash;delete body.lastTickHash;if(state.schema!==1||state.experimentId!==manifest.id||state.manifestHash!==Audit.hash(manifest)||state.stateHash!==Audit.hash(body))throw Error('Monitor state integrity or manifest hash mismatch');if(state.session)runtime.Paper.resume(state.session);return state;}
function initialState(manifest){return sealState({schema:1,experimentId:manifest.id,manifestHash:Audit.hash(manifest),sequence:0,lastTickHash:null,entryClosed:false,session:null,research:null,lastDecisionAt:null,runStatus:'prepared_no_entry',collectionFailures:0});}
function inputHealth(input,runtime,manifest){
 const now=instant(input.at),symbols=manifest.universe.map(u=>u.symbol),history=runtime.Market.validateHistoryPool(input.histories||{},{at:now,symbols}),statuses=input.historyStatuses||[],statusOk=statuses.length===symbols.length&&symbols.every(s=>statuses.some(x=>x.symbol===s&&x.ok===true&&x.expectedAsOf===history.expectedAsOf&&x.dataAsOf===history.expectedAsOf));
 const minute=value=>{const d=new Date(value+8*3600000);return d.getUTCHours()*60+d.getUTCMinutes()+d.getUTCSeconds()/60;};
 const rows=manifest.universe.map(u=>{
  const q=input.quotes?.[u.symbol],t=runtime.Paper.sourceMs(q),received=Date.parse(q?.receivedAt);let entryOk=false,valuationOk=false,mode=null,reason=null;
  const valid=q&&!q.cached&&!q.error&&Number.isFinite(q.price)&&q.price>0&&Number.isFinite(t)&&t<=now+30000&&Number.isFinite(received)&&received<=now;
  if(valid)try{
   const today=runtime.Calendar.sessionOf(now),sourceDate=runtime.Calendar.sessionOf(t),isSession=runtime.Calendar.isSession(today),currentTrading=runtime.Calendar.isTradingTime(now),same=sourceDate===today,m=minute(now),sourceMinute=minute(t),ageOk=now-t>=-30000&&now-t<=180000;
   entryOk=currentTrading&&same&&ageOk&&runtime.Calendar.isTradingTime(t);
   // A fresh response carrying the last legal close is usable during a scheduled
   // pause, while its original source time remains unchanged and orders stay shut.
   const closeDate=isSession&&m>=897?today:history.expectedAsOf;
   const closeCarry=!currentTrading&&sourceDate===closeDate&&sourceMinute>=897&&sourceMinute<=900.5&&(!isSession||m>=897||m<570);
   const lunchCarry=isSession&&m>=690&&m<780&&same&&sourceMinute>=689&&sourceMinute<=690.5;
   valuationOk=entryOk||closeCarry||lunchCarry;mode=entryOk?'continuous':closeCarry?'last_close':lunchCarry?'scheduled_lunch':null;
   if(!valuationOk)reason='quote_expired_or_invalid_phase';
  }catch(e){reason=e.message;}
  else reason=!q?'quote_missing':q.cached?'cached_quote':q.error?'quote_transport_error':'invalid_quote';
  return {symbol:u.symbol,ok:entryOk,entryOk,valuationOk,mode,reason};
 });
 const historyOk=history.ok&&statusOk,entryQuoteComplete=rows.every(x=>x.entryOk),valuationQuoteComplete=rows.every(x=>x.valuationOk),collectionOk=historyOk&&valuationQuoteComplete&&!input.error;
 return {ok:historyOk&&entryQuoteComplete&&!input.error,collectionOk,historyOk,entryQuoteComplete,valuationQuoteComplete,quotePoolComplete:entryQuoteComplete,expectedAsOf:history.expectedAsOf,history,historyStatuses:clone(statuses),quoteRows:rows,reason:!historyOk?'history_incomplete_or_stale':input.error?'transport_error':!valuationQuoteComplete?'quote_collection_incomplete':!entryQuoteComplete?'entry_session_closed':null};
}
function accountSummary(session){
 const describe=a=>{const marketValue=a.holdings.reduce((n,h)=>n+h.shares*h.lastPrice,0),receivables=(a.receivables||[]).reduce((n,x)=>n+x.amount,0),equity=a.cash+marketValue+receivables;return {cash:a.cash,marketValue,receivables,equity:a.equity,accountingBalanced:Number.isFinite(equity)&&Math.abs(equity-a.equity)<1e-6,realizedPnl:a.realizedPnl,unrealizedPnl:a.unrealizedPnl,netPnl:a.equity-session.budget,feesPaid:a.feesPaid,slippageCost:a.slippageCost,frozenFunds:a.frozenFunds,exposure:a.equity>0?marketValue/a.equity:null,stalePositions:a.holdings.filter(h=>h.stale).map(h=>({symbol:h.symbol,sourceTime:h.lastSourceTime,price:h.lastPrice,reason:h.staleReason})),entryComplete:a.entryComplete??null,valuationComplete:a.valuationComplete??!a.holdings.some(h=>h.stale),fingerprint:a.fingerprint||session.fingerprint};};
 const model=describe(session.account),rejected=session.orders.filter(o=>o.status==='rejected');return {...model,budget:session.budget,accountId:session.accountId,fingerprint:session.fingerprint,comparisons:Object.fromEntries(Object.entries(session.comparisons).map(([k,a])=>[k,describe(a)])),rejectedOrders:clone(rejected),observation:clone(session.automation),investmentContinues:true,strategySuccess:false,horizonAccuracy:null};
}
function advanceTick(value,input,runtime,manifest){
 validateState(value,manifest,runtime);const state=clone(value),now=instant(input.at),at=iso(now);if(state.lastDecisionAt&&now<=instant(state.lastDecisionAt))throw Error('Decision clock must strictly advance; duplicate ticks cannot create trades');
 const health=inputHealth(input,runtime,manifest),priorOrders=state.session?.orders.length||0,priorLedger=state.session?.ledger.length||0,previousHash=state.lastTickHash;let collectionReason=health.reason;
 if(health.historyOk){const historyHash=Audit.hash(input.histories);if(state.research?.historyHash!==historyHash){const predictions=Object.fromEntries(manifest.universe.map(u=>{const p=runtime.Analysis.predict(runtime.seed.model,input.histories[u.symbol]||[]);return [u.symbol,{...p,horizon:20,publishedAt:at,firstReceivedAt:at}];}));state.research={historyHash,predictions,features:Object.fromEntries(manifest.universe.map(u=>[u.symbol,runtime.Analysis.features(input.histories[u.symbol]||[])])),firstPublishedAt:at,firstReceivedAt:at,dataAsOf:health.expectedAsOf};}}
 const context={predictions:state.research?.predictions||{},dataHealth:{...health,ok:health.ok},model:runtime.seed.model};
 if(state.session){state.session=runtime.Paper.stepAuto(state.session,input.quotes||{},at,context);state.runStatus='account_continues';}
 else if(now>instant(manifest.latestEntry)||state.entryClosed){state.entryClosed=true;state.runStatus='collection_only_entry_closed';collectionReason='entry_deadline_missed_no_backfill';}
 else if(now<instant(manifest.entryAfter)){state.runStatus='collecting_before_declared_entry';collectionReason='before_declared_entry';}
 else if(health.ok&&runtime.Calendar.isTradingTime(now)){state.session=runtime.Paper.startAuto({...manifest.policy,accountId:manifest.id,executionMode:manifest.executionMode,universe:manifest.universe,quotes:input.quotes,predictions:context.predictions,historyHash:state.research.historyHash,dataHealth:context.dataHealth,model:runtime.seed.model,now:at});state.runStatus='account_created';}
 else state.runStatus='collection_only_invalid_inputs';
 if(!health.collectionOk)state.collectionFailures++;state.sequence++;state.lastDecisionAt=at;
 const summary=state.session?accountSummary(state.session):null;if(summary&&!summary.accountingBalanced)throw Error('Cash + holdings + receivables do not equal equity');
 sealState(state);
 const tick={schema:1,experimentId:manifest.id,sequence:state.sequence,previousHash,decisionAt:at,responseReceivedAt:input.responseReceivedAt||at,quotes:clone(input.quotes||{}),error:input.error||null,dataHealth:health,historyHash:state.research?.historyHash||null,firstPredictionPublishedAt:state.research?.firstPublishedAt||null,firstPredictionReceivedAt:state.research?.firstReceivedAt||null,accountCreated:!value.session&&!!state.session,collectionReason,runStatus:state.runStatus,strategySuccess:false,summary,orders:state.session?clone(state.session.orders.slice(priorOrders)):[],ledger:state.session?clone(state.session.ledger.slice(priorLedger)):[],checkpointDigest:state.stateHash};
 tick.tickHash=Audit.hash(tick);state.lastTickHash=tick.tickHash;tick.state=clone(state);return {state,tick};
}
function verifyTick(tick,previousHash,sequence,manifest,runtime){const body=clone(tick);delete body.tickHash;delete body.state;if(tick.previousHash!==previousHash||tick.sequence!==sequence||tick.tickHash!==Audit.hash(body)||tick.state?.lastTickHash!==tick.tickHash||tick.checkpointDigest!==tick.state?.stateHash)throw Error('Append-only tick hash chain integrity mismatch');validateState(tick.state,manifest,runtime);return tick.state;}
function readTicks(directory,manifest,runtime){const file=path.join(directory,'ticks.jsonl');if(!fs.existsSync(file))return [];const text=fs.readFileSync(file,'utf8');if(text&&!text.endsWith('\n'))throw Error('Incomplete append-only tick tail; preserve it for explicit repair');let prior=null,sequence=1;return text.trim()?text.trim().split('\n').map(line=>{const tick=JSON.parse(line);verifyTick(tick,prior,sequence++,manifest,runtime);prior=tick.tickHash;return tick;}):[];}
function persistTick(directory,result){
 fs.mkdirSync(directory,{recursive:true});const file=path.join(directory,'ticks.jsonl');let previous=null,count=0;if(fs.existsSync(file)){const text=fs.readFileSync(file,'utf8');if(text&&!text.endsWith('\n'))throw Error('Incomplete tick tail; never overwrite it');if(text.trim()){const lines=text.trim().split('\n');count=lines.length;previous=JSON.parse(lines.at(-1)).tickHash;}}
 if(result.tick.previousHash!==previous||result.tick.sequence!==count+1)throw Error('Append-only sequence or predecessor mismatch');
 const fd=fs.openSync(file,'a');try{fs.writeSync(fd,JSON.stringify(result.tick)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}atomic(path.join(directory,'state.json'),result.state);
 atomic(path.join(directory,'status.json'),{at:result.tick.decisionAt,runStatus:result.state.runStatus,sequence:result.state.sequence,accountId:result.state.session?.accountId||null,collectionReason:result.tick.collectionReason,inputValid:result.tick.dataHealth.ok,entryQuoteComplete:result.tick.dataHealth.entryQuoteComplete,valuationQuoteComplete:result.tick.dataHealth.valuationQuoteComplete,collectionOk:result.tick.dataHealth.collectionOk,strategySuccess:false,summary:result.tick.summary,lastTickHash:result.tick.tickHash});
 const day=result.tick.decisionAt?Calendar.sessionOf(result.tick.decisionAt):null;if(day&&result.tick.summary)atomic(path.join(directory,'eod-'+day+'.json'),{date:day,asOf:result.tick.decisionAt,valuationOnly:true,accountContinues:true,...result.tick.summary});
}
function loadState(directory,manifest,runtime){const ticks=readTicks(directory,manifest,runtime),file=path.join(directory,'state.json');let saved=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;if(saved)validateState(saved,manifest,runtime);if(!ticks.length){if(saved&&saved.sequence!==0)throw Error('State has no matching tick ledger');if(!saved&&fs.existsSync(path.join(directory,'experiment.claim')))throw Error('Persistent claim has no state or tick ledger; never recreate/reset a potentially funded account');return saved||initialState(manifest);}const latest=ticks.at(-1).state;if(saved&&(saved.sequence>latest.sequence||saved.sequence===latest.sequence&&(saved.stateHash!==latest.stateHash||saved.lastTickHash!==latest.lastTickHash)))throw Error('State/checkpoint mismatch; never reset account');return latest;}
function alive(pid){try{process.kill(pid,0);return true;}catch(e){if(e.code==='ESRCH')return false;throw e;}}
function acquireLease(directory,{pid=process.pid,resume=false,isAlive=alive,now=Date.now()}={}){
 const file=path.join(directory,'monitor.lease'),token=crypto.randomBytes(16).toString('hex'),lease={pid,token,acquiredAt:iso(now)};
 if(fs.existsSync(file)){const existing=JSON.parse(fs.readFileSync(file,'utf8'));if(isAlive(existing.pid))throw Error('Active monitor lease; concurrent account writers are forbidden');if(!resume)throw Error('Dead process lease requires explicit --resume; do not restart/reset the account');const recovery=path.join(directory,'lease-recovery.lock'),fd=fs.openSync(recovery,'wx');try{const current=JSON.parse(fs.readFileSync(file,'utf8'));if(isAlive(current.pid))throw Error('Active monitor lease appeared during recovery');fs.renameSync(file,path.join(directory,'lease-stale-'+current.token+'.json'));fs.writeFileSync(file,JSON.stringify(lease),{flag:'wx'});}finally{fs.closeSync(fd);fs.unlinkSync(recovery);}}
 else fs.writeFileSync(file,JSON.stringify(lease),{flag:'wx'});
 return {lease,release(){if(fs.existsSync(file)&&JSON.parse(fs.readFileSync(file,'utf8')).token===token)fs.unlinkSync(file);}};
}
function runtimeFromFrozen(directory){
 const sources=path.join(directory,'sources'),sandbox={window:{}};vm.runInNewContext(fs.readFileSync(path.join(sources,'seed.js'),'utf8'),sandbox);const seed=sandbox.window.TECH_SEED;
 global.TECH_SEED=seed;global.Native={read(key){if(!/^[A-Za-z0-9_.-]+$/.test(key))return '';const file=path.join(directory,'cache',key+'.json');return fs.existsSync(file)?fs.readFileSync(file,'utf8'):'';},write(key,value){if(!/^[A-Za-z0-9_.-]+$/.test(key))return false;try{atomic(path.join(directory,'cache',key+'.json'),JSON.parse(value));return true;}catch(e){return false;}}};
 const runtime={seed,Paper:require(path.join(sources,'paper-engine.js')),Calendar:require(path.join(sources,'trading-calendar.js')),Analysis:require(path.join(sources,'analysis.js')),Market:require(path.join(sources,'market.js'))};
 runtime.Market.setTransport(async url=>{const response=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 TechScopeContinuousPaper/2.0',Referer:'https://www.eastmoney.com/'},signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('HTTP '+response.status);return url.includes('qt.gtimg.cn')?new TextDecoder('gb18030').decode(await response.arrayBuffer()):response.text();});return runtime;
}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function run(options){
 const directory=experimentDirectory(options.root||DEFAULT_ROOT,options.id),manifest=validateFrozen(directory),runtime=runtimeFromFrozen(directory),now=Date.now(),end=options.until?explicitTime(options.until):instant(Calendar.sessionOf(now)+'T16:10:00+08:00');
 if(end<=now||end-now>18*3600000)throw Error('--until must be a future bound within 18 hours');
 const claim=path.join(directory,'experiment.claim');if(options.resume&&!fs.existsSync(claim))throw Error('--resume requires the original persistent experiment claim');if(!options.resume&&fs.existsSync(claim))throw Error('Experiment was already attempted; use explicit --resume without resetting capital');if(options.resume&&JSON.parse(fs.readFileSync(claim,'utf8')).manifestHash!==Audit.hash(manifest))throw Error('Persistent claim manifest hash mismatch');
 const lease=acquireLease(directory,{resume:!!options.resume});let state,stopping=false;const stop=()=>{stopping=true;};process.once('SIGINT',stop);process.once('SIGTERM',stop);
 try{
  state=loadState(directory,manifest,runtime);if(!options.resume){fs.writeFileSync(claim,JSON.stringify({at:iso(Date.now()),manifestHash:Audit.hash(manifest)}),{flag:'wx'});atomic(path.join(directory,'state.json'),state);}
  let histories={},nextHistory=0,lastExpectedSession=null;
  while(!stopping&&Date.now()<end){
   const expectedSession=runtime.Calendar.expectedCompletedSession(Date.now());if(expectedSession!==lastExpectedSession){nextHistory=0;lastExpectedSession=expectedSession;}
   let error=null;if(Date.now()>=nextHistory){try{histories=await runtime.Market.syncHistories();}catch(e){error='history: '+e.message;}nextHistory=Date.now()+manifest.historyRefreshMs;}
   let quotes={};try{quotes=await runtime.Market.quotes();}catch(e){error=(error?error+'; ':'')+'quotes: '+e.message;}
   const responseReceivedAt=iso(Date.now());quotes=Object.fromEntries(Object.entries(quotes).map(([s,q])=>[s,{...q,receivedAt:q.receivedAt||q.fetchedAt||responseReceivedAt,receiptProvenance:q.receivedAt?'market_received_at':q.fetchedAt?'market_fetched_at':'monitor_response_received_at'}]));
   if(stopping||Date.now()>=end){atomic(path.join(directory,'unused-response-'+responseReceivedAt.replace(/[:.]/g,'-')+'.json'),{responseReceivedAt,error,quotes,reason:'bound_or_stop_reached_before_decision',noDecisionOrOrders:true});break;}
   const at=iso(Date.now()),historyStatuses=manifest.universe.map(u=>runtime.Market.historyStatus(u.symbol,{at:instant(at)})),result=advanceTick(state,{at,quotes,histories,historyStatuses,error,responseReceivedAt},runtime,manifest);persistTick(directory,result);state=result.state;
   if(stopping||Date.now()>=end)break;await pause(Math.min(manifest.intervalMs,end-Date.now()));
  }
  atomic(path.join(directory,'run-stopped-'+iso(Date.now()).replace(/[:.]/g,'-')+'.json'),{at:iso(Date.now()),reason:stopping?'signal':'bounded_until',accountId:state.session?.accountId||null,accountContinues:!!state.session,lastTickHash:state.lastTickHash,noCapitalReset:true});return {directory,accountId:state.session?.accountId||null,sequence:state.sequence,accountContinues:!!state.session};
 }finally{lease.release();process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
}
function argumentsFrom(argv){const options={};for(let i=0;i<argv.length;i++){const name=argv[i];if(['--prepare','--run','--resume'].includes(name))options[name.slice(2)]=true;else{const keys={'--root':'root','--id':'id','--entry-after':'entryAfter','--latest-entry':'latestEntry','--release-verification':'verification','--exe':'exe','--until':'until'};if(!keys[name]||!argv[i+1])throw Error('Unknown or incomplete argument '+name);options[keys[name]]=argv[++i];}}return options;}
if(require.main===module){let options;Promise.resolve().then(()=>{options=argumentsFrom(process.argv.slice(2));if(options.prepare&&(options.run||options.resume))throw Error('Prepare and run/resume are separate operations');return options.prepare?prepare(options):options.run||options.resume?run(options):Promise.reject(Error('Use --prepare or --run/--resume with --id'));}).then(result=>console.log(JSON.stringify(result))).catch(e=>{try{const directory=experimentDirectory(options?.root||DEFAULT_ROOT,options?.id);if(fs.existsSync(directory))atomic(path.join(directory,'failure-'+iso(Date.now()).replace(/[:.]/g,'-')+'-'+process.pid+'.json'),{at:iso(Date.now()),error:e.stack,strategySuccess:false,noCapitalReset:true});}catch(recordError){}console.error(e.stack);process.exitCode=1;});}
module.exports={RUNTIME_FILES,validateGate,prepare,validateFrozen,initialState,inputHealth,advanceTick,persistTick,loadState,acquireLease,accountSummary,run};
