'use strict';
// Independent paired virtual research collector. No broker connection or live orders.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),{execFile}=require('node:child_process');
const Core=require('./paired-forward-core.js'),Monitor=require('./continuous-paper-monitor.js'),Audit=require('../assets/audit-identity.js'),Calendar=require('../assets/trading-calendar.js');
const ROOT=path.resolve(__dirname,'..'),MODEL_HASH='f0b16e0c0922e3ae051015c3f73a66135c2a0b4ed478b5c0a3bfe6471ad0b0dd';
const SOURCE_FILES=Object.freeze([...Monitor.RUNTIME_FILES.map(n=>'assets/'+n),'scripts/paired-forward-core.js','scripts/continuous-paper-monitor.js','scripts/paired-forward-monitor.js','tests/paired-forward.test.js','tests/paired-forward-monitor.test.js','tests/fixtures/lowcap-frozen-model.json']);
const copy=x=>JSON.parse(JSON.stringify(x)),iso=n=>new Date(n).toISOString(),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const fileHash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const sourceHashes=root=>Object.fromEntries(SOURCE_FILES.map(n=>[n,fileHash(path.join(root,n))]));
function explicit(s){if(typeof s!=='string'||!/(Z|[+-]\d{2}:\d{2})$/.test(s)||!Number.isFinite(Date.parse(s)))throw Error('Explicit timezone required');return Date.parse(s);}
function atomic(file,value){const temp=file+'.'+process.pid+'.tmp';fs.writeFileSync(temp,JSON.stringify(value));fs.renameSync(temp,file);}
function loadModel(file){const a=JSON.parse(fs.readFileSync(file,'utf8')),model=a.events?.[0]?.input?.context?.model;if(Audit.hash(model||{})!==MODEL_HASH||a.summary?.researchIdentity?.model_hash!==MODEL_HASH||a.candidate?.id!=='net1-risk12_5')throw Error('Saved model source hash or registered candidate mismatch');return {model,universe:a.initialSession.universe,corporateEvents:a.initialSession.corporateEvents||[]};}
function validateNative(helper,root,descriptor,verifiedServices){
 if(descriptor?.kind!=='dotnet-desktop-http-v1'||fileHash(helper)!==descriptor.exeSha256)throw Error('Native helper hash mismatch');
 for(const n of ['DesktopServices.cs','MarketTransport.cs'])if(fileHash(path.join(root,n))!==descriptor.sourceHashes?.[n])throw Error('Native C# source hash mismatch');
 if(verifiedServices!==descriptor.sourceHashes['DesktopServices.cs'])throw Error('Native service proof hash mismatch');
}
function health(input,universe){return Monitor.inputHealth(input,{Market:require('../assets/market.js'),Paper:require('../assets/paper-engine.js'),Calendar},{universe});}
function verifyResponses(directory,input,folder='responses'){
 for(const r of input.responses||[]){if(typeof r.file!=='string'||!/^\d+-[a-f0-9]{12}\.json$/.test(r.file)||!/^[a-f0-9]{64}$/.test(r.sha256||''))throw Error('Invalid response path/hash reference');const file=path.join(directory,folder,r.file);if(!fs.existsSync(file)||fileHash(file)!==r.sha256)throw Error('Native response missing or hash mismatch');}
 return true;
}
function verifyCommittedResponses(directory){const cache=new Set();for(const tick of Core.storedTicks(directory,{inflateHistories:false})){for(const r of tick.input?.responses||[]){const key=r.file+':'+r.sha256;if(cache.has(key))continue;verifyResponses(directory,{responses:[r]});cache.add(key);}}}
function prepare(options){
 const root=path.resolve(options.root||ROOT),now=options.now?explicit(options.now):Date.now(),entry=explicit(options.entryAfter),end=explicit(options.latestEntry);
 if(entry<=now)throw Error('Entry must remain strictly future; no backfill');
 if(!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(options.id||''))throw Error('Invalid experiment id');
 const saved=loadModel(options.modelArtifact),gate=JSON.parse(fs.readFileSync(options.gateFile,'utf8')),hashes=sourceHashes(root);
 if(gate.schema!=='paired-forward-release-gate-v1'||Audit.hash(gate.sourceHashes)!==Audit.hash(hashes))throw Error('Source hash or test-source set mismatch');
 if(Audit.hash(gate.tests?.sourceHashes||{})!==Audit.hash(hashes))throw Error('Formal test source hashes mismatch');
 if(gate.tests?.passed!==true||gate.tests.failed!==0||!Number.isInteger(gate.tests.count)||gate.tests.count<1)throw Error('Formal test gate failed');
 if(gate.proofHash!==Audit.hash(gate.proof))throw Error('Native proof hash mismatch');
 verifyResponses(path.dirname(options.gateFile),gate.proof);const proofTime=explicit(gate.proof.at);if(now<proofTime||now-proofTime>180000)throw Error('Native proof is stale or future');
 const checked=health(gate.proof,saved.universe);if(!checked.ok||!Calendar.isTradingTime(proofTime))throw Error('Native trading quote/history input proof incomplete');
 validateNative(options.helper,path.join(path.dirname(options.gateFile),'native-sources'),gate.nativeTransport,gate.nativeServicesSourceSha256);
 const protocol=Core.defineProtocol({id:options.id,declaredAt:iso(now),entryAfter:iso(entry),latestEntry:iso(end),...saved,sourceModelHash:MODEL_HASH});
 const stable=path.resolve(options.stableRoot||'D:/techno/validation/forward-comparison'),directory=path.join(stable,options.id);if(fs.existsSync(directory))throw Error('Experiment directory already exists; retain failures');
 const manifest={schema:'paired-native-forward-v1',id:options.id,declaredAt:iso(now),protocol,sourceHashes:hashes,nativeTransport:gate.nativeTransport,gateHash:fileHash(options.gateFile),modelArtifactHash:fileHash(options.modelArtifact),intervalMs:30000,historyRefreshMs:300000,investmentReady:false,verifiedProfitProbability:null,notes:['Virtual paired research accounts, independent of deployed EXE and original 1100.','Same actual received inputs; no offline trade backfill, added capital or model training.','Entry cap may drift with appreciation; no guarantee of zero loss or maximum loss.']};
 fs.mkdirSync(stable,{recursive:true});fs.mkdirSync(directory);for(const n of ['source','cache','responses'])fs.mkdirSync(path.join(directory,n));
 try{for(const n of SOURCE_FILES){const dst=path.join(directory,'source',n);fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(path.join(root,n),dst,fs.constants.COPYFILE_EXCL);}fs.mkdirSync(path.join(directory,'native-sources'));for(const n of ['DesktopServices.cs','MarketTransport.cs'])fs.copyFileSync(path.join(path.dirname(options.gateFile),'native-sources',n),path.join(directory,'native-sources',n),fs.constants.COPYFILE_EXCL);fs.copyFileSync(options.helper,path.join(directory,'market-transport.exe'),fs.constants.COPYFILE_EXCL);fs.copyFileSync(options.modelArtifact,path.join(directory,'model-artifact.json'),fs.constants.COPYFILE_EXCL);fs.copyFileSync(options.gateFile,path.join(directory,'gate.json'),fs.constants.COPYFILE_EXCL);fs.mkdirSync(path.join(directory,'proof-responses'));for(const r of gate.proof.responses||[])fs.copyFileSync(path.join(path.dirname(options.gateFile),'responses',r.file),path.join(directory,'proof-responses',r.file),fs.constants.COPYFILE_EXCL);fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx'});validateFrozen(directory);}catch(e){atomic(path.join(directory,'prepare-failure.json'),{at:iso(Date.now()),error:e.message});throw e;}
 return {directory,manifest};
}
function validateFrozen(directory){
 const m=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'));if(m.schema!=='paired-native-forward-v1'||m.id!==m.protocol.id||m.protocol.sourceModelHash!==MODEL_HASH)throw Error('Frozen manifest/model mismatch');
 if(m.intervalMs!==30000||m.historyRefreshMs!==300000||m.declaredAt!==m.protocol.declaredAt||m.investmentReady!==false||m.verifiedProfitProbability!==null)throw Error('Frozen interval or manifest metadata changed');Core.initialState(m.protocol);if(Audit.hash(sourceHashes(ROOT))!==Audit.hash(m.sourceHashes))throw Error('Executing driver or dependency source hash mismatch');if(Audit.hash(m.sourceHashes)!==Audit.hash(sourceHashes(path.join(directory,'source'))))throw Error('Frozen source hash mismatch');
 if(fileHash(path.join(directory,'gate.json'))!==m.gateHash||fileHash(path.join(directory,'model-artifact.json'))!==m.modelArtifactHash)throw Error('Frozen gate or model artifact hash mismatch');
 const gate=JSON.parse(fs.readFileSync(path.join(directory,'gate.json'),'utf8'));if(Audit.hash(gate.nativeTransport)!==Audit.hash(m.nativeTransport))throw Error('Frozen native provenance differs from gate');verifyResponses(directory,gate.proof,'proof-responses');const saved=loadModel(path.join(directory,'model-artifact.json'));if(Audit.hash(saved.model)!==Audit.hash(m.protocol.model)||Audit.hash(saved.universe)!==Audit.hash(m.protocol.universe)||Audit.hash(saved.corporateEvents)!==Audit.hash(m.protocol.legs.candidate.policy.corporateEvents))throw Error('Frozen model/source binding mismatch');
 validateNative(path.join(directory,'market-transport.exe'),path.join(directory,'native-sources'),m.nativeTransport,m.nativeTransport.sourceHashes['DesktopServices.cs']);return m;
}
function createRuntime(directory,manifest){
 const source=path.join(directory,'source'),seedContext={window:{}};vm.runInNewContext(fs.readFileSync(path.join(source,'assets/seed.js'),'utf8'),seedContext);
 global.TECH_SEED={...seedContext.window.TECH_SEED,model:manifest.protocol.model};
 global.Native={read(key){if(!/^[\w.-]+$/.test(key))return '';const f=path.join(directory,'cache',key+'.json');return fs.existsSync(f)?fs.readFileSync(f,'utf8'):'';},write(key,value){if(!/^[\w.-]+$/.test(key))return false;atomic(path.join(directory,'cache',key+'.json'),JSON.parse(value));return true;}};
 const runtime={Calendar:require(path.join(source,'assets/trading-calendar.js')),Paper:require(path.join(source,'assets/paper-engine.js')),Market:require(path.join(source,'assets/market.js')),Analysis:require(path.join(source,'assets/analysis.js'))};let responses=[];
 runtime.Market.setTransport(url=>new Promise((resolve,reject)=>{const startedAt=iso(Date.now());execFile(path.join(directory,'market-transport.exe'),[url],{encoding:'utf8',timeout:25000,maxBuffer:16*1024*1024,windowsHide:true,shell:false},(error,stdout)=>{const receivedAt=iso(Date.now()),name=Date.now()+'-'+crypto.randomBytes(6).toString('hex')+'.json';let record={requestedUrl:url,startedAt,receivedAt};try{if(error)throw error;const p=JSON.parse(String(stdout).replace(/^\uFEFF/,''));if(p.url!==url||p.transport!=='dotnet-desktop-http-v1'||typeof p.body!=='string')throw Error('Malformed native transport response');record.payload=p;fs.writeFileSync(path.join(directory,'responses',name),JSON.stringify(record),{flag:'wx'});responses.push({file:name,sha256:fileHash(path.join(directory,'responses',name))});resolve(p.body);}catch(e){record.error=e.message;fs.writeFileSync(path.join(directory,'responses',name),JSON.stringify(record),{flag:'wx'});responses.push({file:name,sha256:fileHash(path.join(directory,'responses',name))});reject(e);}});}));
 runtime.takeResponses=()=>{const current=responses;responses=[];return current;};return runtime;
}
function createCollector(runtime,universe,{now=Date.now,historyRefreshMs=300000}={}){
 let histories={},nextHistory=0,lastExpected=null,historyErrors=[];
 return async()=>{
  const expected=runtime.Calendar.expectedCompletedSession(now());if(expected!==lastExpected){nextHistory=0;lastExpected=expected;}
  if(now()>=nextHistory){historyErrors=[];const results=await Promise.allSettled(universe.map(u=>runtime.Market.history(u.symbol)));for(let i=0;i<results.length;i++){const r=results[i];if(r.status==='fulfilled')histories[universe[i].symbol]=r.value;else historyErrors.push(universe[i].symbol+': '+r.reason.message);}nextHistory=now()+historyRefreshMs;}
  let quotes={},quoteError=null;try{quotes=await runtime.Market.quotes();}catch(e){quoteError=e.message;}
  const responseReceivedAt=iso(now()),at=iso(now());quotes=Object.fromEntries(universe.filter(u=>quotes[u.symbol]).map(u=>[u.symbol,copy(quotes[u.symbol])]));
  return {at,responseReceivedAt,quotes,histories:copy(histories),historyStatuses:universe.map(u=>runtime.Market.historyStatus(u.symbol,{at:now()})),error:[...historyErrors,quoteError].filter(Boolean).join('; ')||null,responses:runtime.takeResponses?runtime.takeResponses():[]};
 };
}
async function run(options,deps={}){
 const directory=path.resolve(options.directory),manifest=validateFrozen(directory),now=deps.now||Date.now,end=explicit(options.until);if(end<=now()||end-now()>18*3600000)throw Error('Future --until within 18 hours required');
 const claimFile=path.join(directory,'experiment.claim');if(options.resume&&!fs.existsSync(claimFile))throw Error('Explicit resume requires original claim');if(!options.resume&&fs.existsSync(claimFile))throw Error('Already attempted; explicit resume required');
 if(options.resume&&JSON.parse(fs.readFileSync(claimFile,'utf8')).collectorManifestHash!==Audit.hash(manifest))throw Error('Collector manifest claim hash mismatch');verifyCommittedResponses(directory);const owner=Core.acquireLease(directory,{resume:!!options.resume});let stopped=false,state;const stop=()=>{stopped=true;};process.once('SIGINT',stop);process.once('SIGTERM',stop);
 try{
  const runtime=createRuntime(directory,manifest);state=options.resume?Core.recover(directory,manifest.protocol,runtime):Core.initialState(manifest.protocol);if(!options.resume)Core.claim(directory,manifest.protocol,{collectorManifestHash:Audit.hash(manifest)});
  const collect=deps.collect||createCollector(runtime,manifest.protocol.universe,{now,historyRefreshMs:manifest.historyRefreshMs});
  while(!stopped&&now()<end){const input=await collect();if(stopped||now()>=end){atomic(path.join(directory,'unused-response-'+iso(now()).replace(/[:.]/g,'-')+'.json'),{input,noDecisionOrOrders:true});break;}
   if(explicit(input.at)>now()||now()-explicit(input.at)>30000)throw Error('Collected decision time is stale or future');
   verifyResponses(directory,input);const result=Core.advance(state,input,manifest.protocol,runtime);Core.persist(directory,result,manifest.protocol,owner);state=result.state;
   atomic(path.join(directory,'status.json'),{at:input.at,sequence:state.sequence,startedAt:state.startedAt,entryClosed:state.entryClosed,summaries:result.tick.summaries,reason:result.tick.reason,dataHealth:result.tick.dataHealth,strategySuccess:false,verifiedProfitProbability:null});
   await (deps.sleep||pause)(Math.max(0,Math.min(manifest.intervalMs,end-now())));
  }
  const result={at:iso(now()),sequence:state.sequence,startedAt:state.startedAt,accountIds:Object.values(state.legs).filter(l=>l.session).map(l=>l.session.accountId),lastTickHash:state.lastTickHash,noCapitalReset:true};atomic(path.join(directory,'run-stopped-'+iso(now()).replace(/[:.]/g,'-')+'.json'),result);return result;
 }finally{owner.release();process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
}
function testGate(logFile,verificationFile,root){
 const text=fs.readFileSync(logFile,'utf8'),count=Number(text.match(/tests\s+(\d+)/)?.[1]),failed=Number(text.match(/fail\s+(\d+)/)?.[1]),passed=Number(text.match(/pass\s+(\d+)/)?.[1]);if(!(count>0)||failed!==0||passed!==count)throw Error('Formal test log did not pass');
 const evidence=JSON.parse(fs.readFileSync(verificationFile,'utf8')),hashes=sourceHashes(root);if(evidence.logSha256!==fileHash(logFile)||evidence.count!==count||evidence.failed!==0||Audit.hash(evidence.sourceHashes)!==Audit.hash(hashes))throw Error('Formal test log/source verification mismatch');
 return {passed:true,failed:0,count,logSha256:fileHash(logFile),sourceHashes:hashes};
}
async function preflight(options){
 const root=path.resolve(options.root||ROOT),saved=loadModel(options.modelArtifact),original=JSON.parse(fs.readFileSync(options.nativeDescriptor,'utf8')),descriptor=original.nativeTransport||original;
 validateNative(options.helper,path.resolve(options.nativeSources),descriptor,descriptor.sourceHashes['DesktopServices.cs']);const directory=path.resolve(options.output);if(fs.existsSync(directory))throw Error('Preflight output already exists');fs.mkdirSync(directory,{recursive:true});for(const n of ['source','cache','responses'])fs.mkdirSync(path.join(directory,n));
 for(const n of SOURCE_FILES){const f=path.join(directory,'source',n);fs.mkdirSync(path.dirname(f),{recursive:true});fs.copyFileSync(path.join(root,n),f);}fs.mkdirSync(path.join(directory,'native-sources'));for(const n of ['DesktopServices.cs','MarketTransport.cs'])fs.copyFileSync(path.join(options.nativeSources,n),path.join(directory,'native-sources',n));fs.copyFileSync(options.helper,path.join(directory,'market-transport.exe'));fs.copyFileSync(options.modelArtifact,path.join(directory,'model-artifact.json'));
 const runtime=createRuntime(directory,{protocol:{model:saved.model}}),proof=await createCollector(runtime,saved.universe)(),checked=health(proof,saved.universe);
 const gate={schema:'paired-forward-release-gate-v1',observedAt:iso(Date.now()),sourceHashes:sourceHashes(root),tests:testGate(options.testLog,options.testVerification,root),nativeTransport:descriptor,nativeServicesSourceSha256:descriptor.sourceHashes['DesktopServices.cs'],proof,proofHash:Audit.hash(proof),health:checked,nativeEntryReady:checked.ok,investmentReady:false,verifiedProfitProbability:null};
 fs.copyFileSync(options.testLog,path.join(directory,'formal-tests.log'));fs.writeFileSync(path.join(directory,'gate.json'),JSON.stringify(gate));return {directory,gateFile:path.join(directory,'gate.json'),observedAt:gate.observedAt,nativeEntryReady:checked.ok,expectedAsOf:checked.expectedAsOf,historyOk:checked.historyOk,entryQuoteComplete:checked.entryQuoteComplete,reason:checked.reason};
}
async function cli(args){const o={};let command;const flags={'--root':'root','--stable-root':'stableRoot','--id':'id','--entry-after':'entryAfter','--latest-entry':'latestEntry','--model-artifact':'modelArtifact','--helper':'helper','--native-descriptor':'nativeDescriptor','--native-sources':'nativeSources','--gate-file':'gateFile','--output':'output','--test-log':'testLog','--test-verification':'testVerification','--directory':'directory','--until':'until'};for(let i=0;i<args.length;i++){const a=args[i];if(['--preflight','--declare','--run','--resume'].includes(a)){if(command)throw Error('One command required');command=a;}else if(flags[a]&&args[i+1])o[flags[a]]=args[++i];else throw Error('Unknown or incomplete option: '+a);}if(command==='--preflight')return preflight(o);if(command==='--declare')return prepare(o);if(command==='--run'||command==='--resume')return run({...o,resume:command==='--resume'});throw Error('Use --preflight, --declare, --run or --resume');}
module.exports={MODEL_HASH,SOURCE_FILES,fileHash,sourceHashes,prepare,validateFrozen,createRuntime,createCollector,verifyResponses,run,preflight,cli};
if(require.main===module)cli(process.argv.slice(2)).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.stack);process.exitCode=1;});
