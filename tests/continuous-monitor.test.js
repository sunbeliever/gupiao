'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const Monitor=require('../scripts/continuous-paper-monitor.js'),Paper=require('../assets/paper-engine.js'),Calendar=require('../assets/trading-calendar.js'),Analysis=require('../assets/analysis.js'),Market=require('../assets/market.js');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),at='2026-10-20T01:30:00Z';
function diskFixture(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'techscope-monitor-test-')),root=path.join(dir,'root');fs.mkdirSync(path.join(root,'assets'),{recursive:true});for(const name of Monitor.RUNTIME_FILES)fs.copyFileSync(path.join(__dirname,'../assets',name),path.join(root,'assets',name));const exe=path.join(dir,'fixture.exe');fs.writeFileSync(exe,'synthetic fixture, never executed');const hashes=Object.fromEntries(Monitor.RUNTIME_FILES.map(n=>[n,sha(fs.readFileSync(path.join(root,'assets',n)))])),gate={schema:'continuous-release-gate-v1',exeSha256:sha(fs.readFileSync(exe)),runtimeFiles:hashes,tests:{passed:true,failed:0,count:31,sourceHashes:hashes},native:{passed:true,persistencePassed:true,networkPassed:true,allHistoriesCurrent:true}},verification=path.join(dir,'verification.json');fs.writeFileSync(verification,JSON.stringify(gate));return {dir,root,exe,verification,gate,id:'future-test',entryAfter:'2026-10-21T01:30:00Z',now:Date.parse(at)};}
function runtimeFixture(){
 const universe=Market.UNIVERSE,dates=[];for(let d=new Date('2026-07-01T00:00:00Z');d.toISOString().slice(0,10)<='2026-10-19';d.setUTCDate(d.getUTCDate()+1)){const date=d.toISOString().slice(0,10);if(Calendar.isSession(date))dates.push(date);}
 const histories=Object.fromEntries(universe.map(u=>[u.symbol,dates.map(date=>({date,open:1,close:1,high:1.01,low:.99,volume:1000}))]));
 const seed={model:{version:'fixture-frozen-ridge',eligible:true,horizon:20,cutoff:'2026-09-30',intercept:.5,means:Array(11).fill(0),scales:Array(11).fill(1),coefficients:Array(11).fill(0),residualQuantiles:[0,0]}};
 const manifest={schema:1,id:'fixture-account',declaredAt:'2026-10-19T08:00:00Z',entryAfter:at,latestEntry:'2026-10-20T01:35:00Z',universe,policy:{budget:10000,preset:'full_capital',allocationMode:'full',minFee:5,riskLimits:{investableLimit:10000,maxExposure:1,maxPositions:3,maxThemeWeight:1}},files:{},executionMode:'continuous_forward_node',nativeRuntimeCaveat:true};
 const runtime={Paper,Calendar,Analysis,Market,seed};return {runtime,manifest,histories};
}
function tick(f,when=at,price=1){const expected=f.runtime.Calendar.expectedCompletedSession(when);return {at:when,quotes:Object.fromEntries(f.manifest.universe.map(u=>[u.symbol,{price,open:1,sourceTime:new Date(Date.parse(when)+8*3600000).toISOString().slice(0,19).replace('T',' '),receivedAt:when}])),histories:f.histories,historyStatuses:f.manifest.universe.map(u=>({symbol:u.symbol,ok:f.histories[u.symbol].at(-1).date===expected,dataAsOf:f.histories[u.symbol].at(-1).date,expectedAsOf:expected,errors:[]}))};}

test('prepare freezes new sources release and policy only after strict native/test gates',()=>{
 const f=diskFixture();f.gate.native.allHistoriesCurrent=false;fs.writeFileSync(f.verification,JSON.stringify(f.gate));assert.throws(()=>Monitor.prepare(f),/native|Native/);assert.equal(fs.existsSync(path.join(f.root,'validation/continuous',f.id)),false);
 f.gate.native.allHistoriesCurrent=true;fs.writeFileSync(f.verification,JSON.stringify(f.gate));const prepared=Monitor.prepare(f);assert.equal(prepared.manifest.policy.budget,10000);assert.equal(prepared.manifest.universe.length,19);assert.equal(prepared.manifest.policy.preset,'full_capital');assert.ok(prepared.manifest.nativeRuntimeCaveat);assert.equal(fs.existsSync(path.join(prepared.directory,'experiment.claim')),false);assert.throws(()=>Monitor.prepare(f),/exist|Exist/);
});

test('prepare rejects past starts mismatched hashes and path-like IDs',()=>{const f=diskFixture();assert.throws(()=>Monitor.prepare({...f,id:'../old-account'}),/id|ID/);assert.throws(()=>Monitor.prepare({...f,entryAfter:at}),/future/);f.gate.tests.sourceHashes={...f.gate.runtimeFiles,'paper-engine.js':'0'.repeat(64)};fs.writeFileSync(f.verification,JSON.stringify(f.gate));assert.throws(()=>Monitor.prepare(f),/hash|Hash/);});

function nativeDiskFixture(){
 const f=diskFixture(),windows=path.join(f.root,'windows');fs.mkdirSync(windows);
 for(const name of ['DesktopServices.cs','MarketTransport.cs'])fs.writeFileSync(path.join(windows,name),'// synthetic '+name+'; never compiled');
 f.nativeTransport=path.join(f.dir,'native-helper.exe');fs.writeFileSync(f.nativeTransport,'synthetic native helper; never executed');
 const sourceHashes=Object.fromEntries(['DesktopServices.cs','MarketTransport.cs'].map(n=>[n,sha(fs.readFileSync(path.join(windows,n)))]));
 f.gate.nativeTransport={kind:'dotnet-desktop-http-v1',exeSha256:sha(fs.readFileSync(f.nativeTransport)),sourceHashes};
 f.gate.native.nativeServicesSourceSha256=sourceHashes['DesktopServices.cs'];
 fs.writeFileSync(f.verification,JSON.stringify(f.gate));return f;
}

test('native transport prepare binds the helper to the verified desktop service and freezes both C# sources',()=>{
 const f=nativeDiskFixture(),r=Monitor.prepare(f);
 assert.deepEqual(r.manifest.nativeTransport,f.gate.nativeTransport);
 assert.equal(sha(fs.readFileSync(path.join(r.directory,'market-transport.exe'))),f.gate.nativeTransport.exeSha256);
 for(const [n,h] of Object.entries(f.gate.nativeTransport.sourceHashes))assert.equal(sha(fs.readFileSync(path.join(r.directory,'sources',n))),h);
 assert.equal(Monitor.validateFrozen(r.directory).nativeTransport.kind,'dotnet-desktop-http-v1');
});

test('native transport prepare rejects helper source and desktop verification binding mismatches before declaring an experiment',()=>{
 for(const which of ['helper','source','nativeGate','kind']){
  const f=nativeDiskFixture();if(which==='helper')fs.appendFileSync(f.nativeTransport,'changed');
  if(which==='source')fs.appendFileSync(path.join(f.root,'windows/MarketTransport.cs'),'changed');
  if(which==='nativeGate')f.gate.native.nativeServicesSourceSha256='0'.repeat(64);
  if(which==='kind')f.gate.nativeTransport.kind='unknown';
  fs.writeFileSync(f.verification,JSON.stringify(f.gate));assert.throws(()=>Monitor.prepare(f),/native|Native|hash|Hash|transport/);
  assert.equal(fs.existsSync(path.join(f.root,'validation/continuous',f.id)),false);
 }
});

test('frozen native helper and source tampering fail validation and cannot run',()=>{
 for(const relative of ['market-transport.exe','sources/DesktopServices.cs','sources/MarketTransport.cs']){
  const f=nativeDiskFixture(),r=Monitor.prepare(f);fs.appendFileSync(path.join(r.directory,relative),'changed');
  assert.throws(()=>Monitor.validateFrozen(r.directory),/native|Native|hash|Hash|integrity/);
 }
});

test('native transport executes the frozen helper as a single URL argument without a shell',async()=>{
 const url='https://qt.gtimg.cn/q=sh588000',helper='C:/frozen/native helper.exe',calls=[];
 const transport=Monitor.makeNativeTransport(helper,(exe,args,options,cb)=>{calls.push({exe,args,options});cb(null,JSON.stringify({url,body:'synthetic body',receivedAt:'2026-10-20T02:00:00Z',transport:'dotnet-desktop-http-v1'}),'');});
 assert.equal(await transport(url),'synthetic body');assert.equal(calls.length,1);assert.equal(calls[0].exe,helper);assert.deepEqual(calls[0].args,[url]);
 assert.equal(calls[0].options.encoding,'utf8');assert.equal(calls[0].options.timeout,25000);assert.equal(calls[0].options.maxBuffer,16*1024*1024);assert.equal(calls[0].options.shell,false);assert.equal(calls[0].options.windowsHide,true);
});

test('native transport fails on execFile errors or mismatched malformed payloads and never retries through another transport',async()=>{
 const url='https://qt.gtimg.cn/q=sh588000',valid={url,body:'body',receivedAt:'2026-10-20T02:00:00Z',transport:'dotnet-desktop-http-v1'};
 const failed=Monitor.makeNativeTransport('frozen.exe',(exe,args,opts,cb)=>cb(new Error('synthetic timeout'),'',''));
 await assert.rejects(()=>failed(url),/native|Native|timeout/);
 for(const stdout of ['not JSON',JSON.stringify({...valid,url:'https://wrong.invalid/'}),JSON.stringify({...valid,body:4}),JSON.stringify({...valid,transport:'other'}),JSON.stringify({...valid,receivedAt:'invalid'})]){
  let calls=0;const transport=Monitor.makeNativeTransport('frozen.exe',(exe,args,opts,cb)=>{calls++;cb(null,stdout,'');});
  await assert.rejects(()=>transport(url),/native|Native|payload|JSON/);assert.equal(calls,1);
 }
});

test('missing daily status prevents entry and is collection failure rather than successful cash',()=>{const f=runtimeFixture(),t=tick(f);t.historyStatuses[0].ok=false;const result=Monitor.advanceTick(Monitor.initialState(f.manifest),t,f.runtime,f.manifest);assert.equal(result.state.session,null);assert.equal(result.tick.accountCreated,false);assert.equal(result.tick.strategySuccess,false);assert.equal(result.tick.dataHealth.ok,false);});

test('a first valid tick uses the frozen model ETF execution and all-10000 named capital profile',()=>{const f=runtimeFixture(),result=Monitor.advanceTick(Monitor.initialState(f.manifest),tick(f),f.runtime,f.manifest);assert.equal(result.state.session.budget,10000);assert.ok(result.state.session.account.holdings.length>0);assert.ok(result.state.session.account.holdings.every(h=>h.type==='etf'));assert.deepEqual(result.state.session.model,f.runtime.seed.model);assert.ok(result.tick.orders.every(o=>o.fingerprint));assert.equal(result.tick.strategySuccess,false);});

test('late first entry is permanently closed and cannot be backfilled on another day',()=>{const f=runtimeFixture(),late='2026-10-20T01:36:00Z',first=Monitor.advanceTick(Monitor.initialState(f.manifest),tick(f,late),f.runtime,f.manifest);assert.equal(first.state.session,null);assert.equal(first.state.entryClosed,true);assert.match(first.tick.collectionReason,/deadline/);const next=Monitor.advanceTick(first.state,tick(f,'2026-10-21T01:30:00Z'),f.runtime,f.manifest);assert.equal(next.state.session,null);});

test('after the engineering window and during unrelated outage the same account keeps marking without resetting losses',()=>{const f=runtimeFixture();let result=Monitor.advanceTick(Monitor.initialState(f.manifest),tick(f),f.runtime,f.manifest);for(let n=1;n<=60;n++){const when=new Date(Date.parse(at)+n*30000).toISOString();result=Monitor.advanceTick(result.state,tick(f,when,.98),f.runtime,f.manifest);}assert.equal(result.state.session.automation.windowEnded,true);const initialId=result.state.session.accountId,when='2026-10-20T02:01:00Z',t=tick(f,when,1.01);delete t.quotes.sz002230;const next=Monitor.advanceTick(result.state,t,f.runtime,f.manifest);assert.equal(next.state.session.accountId,initialId);assert.equal(next.state.session.budget,10000);assert.ok(next.state.session.account.holdings.every(h=>h.lastPrice===1.01));assert.equal(next.tick.dataHealth.quotePoolComplete,false);assert.ok(next.tick.summary.accountingBalanced);});

test('append-only checkpoint recovery resumes the identical account and detects tick tampering',()=>{const f=runtimeFixture(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'techscope-monitor-ledger-')),first=Monitor.advanceTick(Monitor.initialState(f.manifest),tick(f),f.runtime,f.manifest);Monitor.persistTick(dir,first);const restored=Monitor.loadState(dir,f.manifest,f.runtime);assert.equal(restored.session.integrityHash,first.state.session.integrityHash);const next=Monitor.advanceTick(restored,tick(f,'2026-10-20T01:30:30Z',.98),f.runtime,f.manifest);Monitor.persistTick(dir,next);assert.equal(fs.readFileSync(path.join(dir,'ticks.jsonl'),'utf8').trim().split('\n').length,2);assert.equal(Monitor.loadState(dir,f.manifest,f.runtime).session.accountId,restored.session.accountId);const file=path.join(dir,'ticks.jsonl');fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('fixture-account','tampered-account'));assert.throws(()=>Monitor.loadState(dir,f.manifest,f.runtime),/hash|Hash|integrity/);});

test('lease blocks concurrent processes and only explicit resume may reclaim a dead lease',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'techscope-monitor-lease-')),first=Monitor.acquireLease(dir,{pid:101,isAlive:()=>false});assert.throws(()=>Monitor.acquireLease(dir,{pid:102,isAlive:()=>true}),/active|Active/);assert.throws(()=>Monitor.acquireLease(dir,{pid:102,isAlive:()=>false}),/resume/);const resumed=Monitor.acquireLease(dir,{pid:102,isAlive:()=>false,resume:true});first.release();assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'monitor.lease'),'utf8')).pid,102);resumed.release();assert.equal(fs.existsSync(path.join(dir,'monitor.lease')),false);});

test('a persistent claim without state or ticks fails instead of recreating the initial capital',()=>{const f=runtimeFixture(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'techscope-monitor-missing-state-'));fs.writeFileSync(path.join(dir,'experiment.claim'),'{}');assert.throws(()=>Monitor.loadState(dir,f.manifest,f.runtime),/never recreate|reset/);});

test('a crash after append but before checkpoint recovers the latest loss from the unchanged tick ledger',()=>{const f=runtimeFixture(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'techscope-monitor-recovery-')),first=Monitor.advanceTick(Monitor.initialState(f.manifest),tick(f),f.runtime,f.manifest);Monitor.persistTick(dir,first);const next=Monitor.advanceTick(first.state,tick(f,'2026-10-20T01:30:30Z',.98),f.runtime,f.manifest);Monitor.persistTick(dir,next);fs.writeFileSync(path.join(dir,'state.json'),JSON.stringify(first.state));const restored=Monitor.loadState(dir,f.manifest,f.runtime);assert.equal(restored.sequence,2);assert.equal(restored.session.account.equity,next.state.session.account.equity);assert.ok(restored.session.account.equity<first.state.session.account.equity);});

test('closed quotes are valid valuations without entry or collection failure and the 16:00 daily boundary pauses stale history',()=>{
 const f=runtimeFixture();let result=Monitor.advanceTick(Monitor.initialState(f.manifest),tick(f),f.runtime,f.manifest);const accountId=result.state.session.accountId;
 function closeTick(when){const t=tick(f,when,1.01);for(const q of Object.values(t.quotes))q.sourceTime='2026-10-20 15:00:00';return t;}
 result=Monitor.advanceTick(result.state,closeTick('2026-10-20T07:59:00Z'),f.runtime,f.manifest);
 assert.equal(result.tick.dataHealth.expectedAsOf,'2026-10-19');assert.equal(result.tick.dataHealth.entryQuoteComplete,false);assert.equal(result.tick.dataHealth.valuationQuoteComplete,true);assert.equal(result.state.collectionFailures,0);assert.equal(result.tick.orders.length,0);
 result=Monitor.advanceTick(result.state,closeTick('2026-10-20T08:00:00Z'),f.runtime,f.manifest);
 assert.equal(result.tick.dataHealth.expectedAsOf,'2026-10-20');assert.equal(result.tick.dataHealth.historyOk,false);assert.equal(result.tick.dataHealth.valuationQuoteComplete,true);assert.equal(result.state.collectionFailures,1);
 for(const bars of Object.values(f.histories))bars.push({date:'2026-10-20',open:1,close:1.01,high:1.02,low:.99,volume:1000});
 result=Monitor.advanceTick(result.state,closeTick('2026-10-20T08:00:30Z'),f.runtime,f.manifest);
 assert.equal(result.tick.dataHealth.historyOk,true);assert.equal(result.state.collectionFailures,1);assert.equal(result.state.research.firstReceivedAt,'2026-10-20T08:00:30.000Z');assert.equal(result.state.research.predictions.sh588000.firstReceivedAt,'2026-10-20T08:00:30.000Z');
 const next=Monitor.advanceTick(result.state,tick(f,'2026-10-21T01:30:00Z',1.02),f.runtime,f.manifest);
 assert.equal(next.state.session.accountId,accountId);assert.equal(next.state.session.budget,10000);assert.equal(next.tick.dataHealth.expectedAsOf,'2026-10-20');assert.equal(next.tick.dataHealth.entryQuoteComplete,true);assert.equal(next.state.research.firstReceivedAt,result.state.research.firstReceivedAt);assert.equal(next.tick.firstPredictionReceivedAt,result.state.research.firstReceivedAt);assert.equal(next.state.collectionFailures,1);
});

test('missing cached malformed and transport-error inputs count real collection failures independently of market phase',()=>{
 const f=runtimeFixture();let result=Monitor.advanceTick(Monitor.initialState(f.manifest),tick(f),f.runtime,f.manifest);
 for(let i=0;i<4;i++){const when=new Date(Date.parse(at)+(i+1)*30000).toISOString(),t=tick(f,when);if(i===0)delete t.quotes.sh588000;if(i===1)t.quotes.sh588000.cached=true;if(i===2)t.quotes.sh588000.price=NaN;if(i===3)t.error='synthetic transport failure';result=Monitor.advanceTick(result.state,t,f.runtime,f.manifest);assert.equal(result.state.collectionFailures,i+1);assert.equal(result.tick.dataHealth.collectionOk,false);}
});

test('lunch retains the latest morning valuation without treating the scheduled pause as a quote outage',()=>{
 const f=runtimeFixture(),first=Monitor.advanceTick(Monitor.initialState(f.manifest),tick(f),f.runtime,f.manifest),t=tick(f,'2026-10-20T04:30:00Z',1.01);for(const q of Object.values(t.quotes))q.sourceTime='2026-10-20 11:30:00';
 const result=Monitor.advanceTick(first.state,t,f.runtime,f.manifest);assert.equal(result.tick.dataHealth.entryQuoteComplete,false);assert.equal(result.tick.dataHealth.valuationQuoteComplete,true);assert.equal(result.state.collectionFailures,0);assert.equal(result.tick.orders.length,0);
});

test('provider clock advancing inside lunch is not a legal trade or verified 11:30 closing quote',()=>{
 const f=runtimeFixture(),first=Monitor.advanceTick(Monitor.initialState(f.manifest),tick(f),f.runtime,f.manifest);
 const t=tick(f,'2026-10-20T03:45:00Z',1.01),result=Monitor.advanceTick(first.state,t,f.runtime,f.manifest);
 assert.equal(result.tick.dataHealth.entryQuoteComplete,false);assert.equal(result.tick.dataHealth.valuationQuoteComplete,false);
 assert.equal(result.tick.orders.length,0);assert.equal(result.state.collectionFailures,1);
 assert.ok(result.state.session.account.holdings.every(h=>h.stale));assert.equal(result.tick.strategySuccess,false);
});

test('a transport failure pauses later new purchases while valid existing holdings keep their valuations',()=>{
 const f=runtimeFixture(),initialTick=tick(f);for(const u of f.manifest.universe)if(u.type==='etf'){initialTick.quotes[u.symbol].price=100;initialTick.quotes[u.symbol].open=100;}
 const first=Monitor.advanceTick(Monitor.initialState(f.manifest),initialTick,f.runtime,f.manifest);assert.equal(first.state.session.account.holdings.length,0);
 const failed=tick(f,'2026-10-20T01:30:30Z');failed.error='synthetic transport error';for(const u of f.manifest.universe)if(u.type==='etf'){failed.quotes[u.symbol].price=90;failed.quotes[u.symbol].open=100;}
 const paused=Monitor.advanceTick(first.state,failed,f.runtime,f.manifest);assert.equal(paused.tick.dataHealth.ok,false);assert.equal(paused.state.session.account.holdings.length,0);assert.equal(paused.tick.orders.filter(o=>o.account==='model'&&o.side==='buy').length,0);
 const good=tick(f,'2026-10-20T01:31:00Z');for(const u of f.manifest.universe)if(u.type==='etf'){good.quotes[u.symbol].price=90;good.quotes[u.symbol].open=100;}const entered=Monitor.advanceTick(paused.state,good,f.runtime,f.manifest);assert.equal(entered.state.session.account.holdings.length,1);
 const mark=tick(f,'2026-10-20T01:31:30Z');mark.error='synthetic unrelated failure';for(const u of f.manifest.universe)if(u.type==='etf'){mark.quotes[u.symbol].price=91;mark.quotes[u.symbol].open=100;}const updated=Monitor.advanceTick(entered.state,mark,f.runtime,f.manifest);assert.equal(updated.state.session.account.holdings[0].lastPrice,91);assert.equal(updated.state.session.accountId,entered.state.session.accountId);
});
