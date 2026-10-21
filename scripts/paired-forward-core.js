'use strict';
// Preparation core only: no scheduler, network collector, live declaration or order connection.
const fs=require('node:fs'),path=require('node:path');
const Audit=require('../assets/audit-identity.js'),Calendar=require('../assets/trading-calendar.js'),Fee=require('../assets/fee-profile.js');
const Monitor=require('./continuous-paper-monitor.js');
const copy=value=>JSON.parse(JSON.stringify(value));
const IDS=['candidate','control'],SYMBOLS=['sh588000','sh512760','sh515070','sh512720','sh515880','sz159852'],FIXED=SYMBOLS.slice(0,3);
function explicit(value){if(typeof value!=='string'||!/(Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value)))throw Error('Explicit timezone required');return Date.parse(value);}
function defineProtocol({id,declaredAt,entryAfter,latestEntry,universe,model,sourceModelHash,corporateEvents=[],capitalProfile}){
 if(typeof id!=='string'||!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(id))throw Error('Invalid protocol id');
 const declared=explicit(declaredAt),start=explicit(entryAfter),end=explicit(latestEntry);
 if(start<=declared)throw Error('Entry window must be future to declaration');
 if(end<start||end-start>300000||!Calendar.isTradingTime(start)||!Calendar.isTradingTime(end)||Calendar.sessionOf(start)!==Calendar.sessionOf(end))throw Error('Invalid trading entry window');
 if(!Array.isArray(universe)||universe.length!==6||new Set(universe.map(u=>u.symbol)).size!==6||universe.some(u=>u.type!=='etf'||!SYMBOLS.includes(u.symbol)))throw Error('Exactly the fixed six ETF pool is required');
 if(!model||Audit.hash(model)!==sourceModelHash||model.cutoff!=='2024-12-31'||model.horizon!==20)throw Error('Frozen historical model hash or training cutoff mismatch');
 if(capitalProfile!==undefined&&capitalProfile!=='capital50k-risk500-v1')throw Error('Unknown capital profile');
 const enlarged=capitalProfile==='capital50k-risk500-v1';
 const policy={budget:enlarged?50000:10000,preset:'full_capital',allocationMode:'full',feeProfile:Fee.resolve({}),corporateEvents:copy(corporateEvents),stopLossRate:enlarged?.04:.08,targetExitEnabled:false,riskLimits:{investableLimit:enlarged?12500:1250,maxExposure:enlarged?.25:.125,maxPositions:3,maxThemeWeight:1}};
 return {schema:'paired-forward-preparation-v1',...(capitalProfile?{capitalProfile}:{}),id,declaredAt,entryAfter,latestEntry,universe:copy(universe),model:copy(model),sourceModelHash,executionMode:'paired_forward_research',requiresNativeCollectorAndFrozenReleaseGate:true,legs:{candidate:{selector:'ridge',policy:{...copy(policy),minEstimatedNetReturn:.01}},control:{selector:'equal_three',signalMeaning:'deterministic_order_priority_not_return_forecast',policy:{...copy(policy),minEstimatedNetReturn:0}}}};
}
function validateProtocol(protocol){
 const canonical=defineProtocol({...protocol,corporateEvents:protocol.legs?.candidate?.policy?.corporateEvents||[]});
 if(Audit.hash(canonical)!==Audit.hash(protocol))throw Error('Protocol fields or fixed rules changed');
}
function seal(state){const body=copy(state);delete body.stateHash;delete body.lastTickHash;state.stateHash=Audit.hash(body);return state;}
function initialState(protocol){validateProtocol(protocol);return seal({schema:'paired-forward-state-v1',protocolHash:Audit.hash(protocol),experimentId:protocol.id,sequence:0,lastTickHash:null,lastDecisionAt:null,startedAt:null,entryClosed:false,historyHash:null,collectionFailures:0,...(protocol.capitalProfile?{riskPeaks:{candidate:50000,control:50000}}:{}),legs:{candidate:{session:null,predictions:null},control:{session:null,predictions:null}},cashBenchmark:{initialCapital:protocol.legs.candidate.policy.budget,equity:protocol.legs.candidate.policy.budget,netPnl:0,countsAsSuccess:false},strategySuccess:false,verifiedProfitProbability:null});}
function validateState(state,protocol,runtime){
 validateProtocol(protocol);
 if(state.schema!=='paired-forward-state-v1'||state.protocolHash!==Audit.hash(protocol)||state.experimentId!==protocol.id||seal(copy(state)).stateHash!==state.stateHash)throw Error('Paired state integrity or protocol mismatch');
 if(!Number.isInteger(state.sequence)||state.sequence<0||IDS.some(id=>!state.legs[id]))throw Error('Invalid paired state');
 if(protocol.capitalProfile&&IDS.some(id=>!Number.isFinite(state.riskPeaks?.[id])||state.riskPeaks[id]<50000))throw Error('Invalid lifetime risk peak');
 const sessions=IDS.map(id=>state.legs[id].session);
 if(sessions.some(Boolean)!==sessions.every(Boolean)||!!state.startedAt!==sessions.every(Boolean))throw Error('Accounts must share one start');
 for(const id of IDS){const session=state.legs[id].session;if(session){runtime.Paper.resume(session);if(session.accountId!==protocol.id+'-'+id)throw Error('Wrong leg account identity');}}
 return state;
}
function accountModel(protocol,id){return {...copy(protocol.model),researchSelector:protocol.legs[id].selector};}
function predictions(protocol,id,histories,at,runtime){
 const model=accountModel(protocol,id);
 return Object.fromEntries(protocol.universe.map(u=>{
  const h=histories[u.symbol]||[],asOf=h.at(-1)?.date||null;
  const p=id==='candidate'?runtime.Analysis.predict(model,h,{publishedAt:at,firstReceivedAt:at}):{expectedReturn:FIXED.includes(u.symbol)?1000000:-1,eligible:true,asOf,signalDate:asOf,horizon:20,referenceOpen:null,publishedAt:at,firstReceivedAt:at,signalMeaning:'deterministic_order_priority_not_return_forecast'};
  return [u.symbol,p];
 }));
}
function advance(value,input,protocol,runtime){
 validateState(value,protocol,runtime);const now=explicit(input.at);
 if(now<explicit(protocol.declaredAt))throw Error('Sample predates protocol declaration');
 if(value.lastDecisionAt&&now<=explicit(value.lastDecisionAt))throw Error('Decision clock must strictly advance');
 if(input.responseReceivedAt&&explicit(input.responseReceivedAt)>now)throw Error('Response received after decision');
 const state=copy(value),sample=copy(input),health=Monitor.inputHealth(sample,runtime,protocol),inputHash=Audit.hash(sample);
 if(health.historyOk){const hash=Audit.hash(sample.histories);if(hash!==state.historyHash){for(const id of IDS)state.legs[id].predictions=predictions(protocol,id,sample.histories,sample.at,runtime);state.historyHash=hash;}}
 let reason=health.reason||null;const events={},orders={},summaries={};
 const mayStart=!state.startedAt&&!state.entryClosed&&now>=explicit(protocol.entryAfter)&&now<=explicit(protocol.latestEntry)&&health.ok&&runtime.Calendar.isTradingTime(now);
 if(!state.startedAt&&now>explicit(protocol.latestEntry)){state.entryClosed=true;reason='entry_deadline_missed_no_backfill';}
 else if(!state.startedAt&&now<explicit(protocol.entryAfter))reason='before_declared_entry';
 for(const id of IDS){
  const leg=state.legs[id],context={predictions:leg.predictions||{},model:accountModel(protocol,id),dataHealth:copy(health)};
  events[id]={at:sample.at,quotes:copy(sample.quotes||{}),context};const orderCount=leg.session?.orders.length||0;
  if(leg.session)leg.session=runtime.Paper.stepAuto(leg.session,events[id].quotes,sample.at,context);
  else if(mayStart)leg.session=runtime.Paper.startAuto({...copy(protocol.legs[id].policy),accountId:protocol.id+'-'+id,executionMode:protocol.executionMode,universe:protocol.universe,quotes:events[id].quotes,predictions:context.predictions,historyHash:state.historyHash,dataHealth:health,model:context.model,now:sample.at});
  summaries[id]=leg.session?Monitor.accountSummary(leg.session):null;
  if(summaries[id]&&!summaries[id].accountingBalanced)throw Error('Paired account reconciliation failed');
  orders[id]=leg.session?copy(leg.session.orders.slice(orderCount)):[];
 }
 if(protocol.capitalProfile)for(const id of IDS)state.riskPeaks[id]=Math.max(state.riskPeaks[id],summaries[id]?.equity??50000);
 if(mayStart)state.startedAt=sample.at;
 state.sequence++;state.lastDecisionAt=sample.at;if(!health.collectionOk)state.collectionFailures++;
 seal(state);
 const tick={schema:'paired-forward-tick-v1',experimentId:protocol.id,protocolHash:state.protocolHash,sequence:state.sequence,previousHash:value.lastTickHash,decisionAt:sample.at,inputHash,input:sample,dataHealth:health,reason,accountCreated:mayStart,events,orders,summaries,strategySuccess:false,checkpointDigest:state.stateHash};
 if(protocol.capitalProfile==='capital50k-risk500-v1')tick.riskMonitoring=Object.fromEntries(IDS.map(id=>{const session=state.legs[id].session,summary=summaries[id],equity=summary?.equity??50000,peak=state.riskPeaks[id],loss=Math.max(0,50000-equity),drawdown=Math.max(0,peak-equity);return [id,{initialCapital:50000,plannedMinimumInvested:10000,maximumNewInvestment:12500,currentMarketExposure:summary?.marketValue??0,minimumAllocationMet:(summary?.marketValue??0)>=10000,initialCapitalLoss:loss,observedDrawdown:drawdown,lossWarningAmount:500,lossWarningTriggered:loss>=500||drawdown>=500,guaranteedLossCap:false,valuationComplete:summary?.valuationComplete??false,countsAsSuccess:false}];}));
 tick.tickHash=Audit.hash(tick);state.lastTickHash=tick.tickHash;tick.state=copy(state);
 return {state,tick};
}
function replay(inputs,protocol,runtime){return inputs.reduce((state,input)=>advance(state,input,protocol,runtime).state,initialState(protocol));}
function claim(directory,protocol,metadata={}){
 validateProtocol(protocol);fs.mkdirSync(directory,{recursive:true});
 if(fs.existsSync(path.join(directory,'ticks.jsonl'))||fs.existsSync(path.join(directory,'state.json')))throw Error('Existing ledger or state forbids a new claim');
 const record={schema:'paired-preparation-claim-v1',id:protocol.id,protocolHash:Audit.hash(protocol),claimedAt:new Date().toISOString(),...(metadata.collectorManifestHash?{collectorManifestHash:metadata.collectorManifestHash}:{})};
 fs.writeFileSync(path.join(directory,'experiment.claim'),JSON.stringify(record),{flag:'wx'});return record;
}
function checkClaim(directory,protocol){const c=JSON.parse(fs.readFileSync(path.join(directory,'experiment.claim'),'utf8'));if(c.protocolHash!==Audit.hash(protocol)||c.id!==protocol.id)throw Error('Claim protocol mismatch');}
function inflateTick(record,directory,cache=new Map()){
 if(record.inputHistorySnapshot){const hash=record.inputHistorySnapshot.sha256;if(typeof hash!=='string'||!/^[a-f0-9]{64}$/.test(hash)||record.input.histories!==undefined)throw Error('Invalid history snapshot reference');
  if(!cache.has(hash)){const h=JSON.parse(fs.readFileSync(path.join(directory,'histories',hash+'.json'),'utf8'));if(Audit.hash(h)!==hash)throw Error('History snapshot hash mismatch');cache.set(hash,h);}record.input.histories=cache.get(hash);delete record.inputHistorySnapshot;
 }return record;
}
function* storedTicks(directory,{inflateHistories=true}={}){
 const file=path.join(directory,'ticks.jsonl');if(!fs.existsSync(file))return;const fd=fs.openSync(file,'r'),cache=new Map(),buffer=Buffer.alloc(65536);let pending=Buffer.alloc(0),offset=0;
 try{let length;while((length=fs.readSync(fd,buffer,0,buffer.length,offset))>0){offset+=length;const data=Buffer.concat([pending,buffer.subarray(0,length)]);let start=0,split;while((split=data.indexOf(10,start))>=0){const line=data.subarray(start,split).toString('utf8');if(!line.trim())throw Error('Empty tick inside append-only ledger');const record=JSON.parse(line);yield inflateHistories?inflateTick(record,directory,cache):record;start=split+1;}pending=Buffer.from(data.subarray(start));}if(pending.length)throw Error('Incomplete tick tail; preserved for explicit recovery');}
 finally{fs.closeSync(fd);}
}
function lastTick(directory){
 const file=path.join(directory,'ticks.jsonl');if(!fs.existsSync(file))return null;const fd=fs.openSync(file,'r');try{const size=fs.fstatSync(fd).size;if(!size)return null;const end=Buffer.alloc(1);fs.readSync(fd,end,0,1,size-1);if(end[0]!==10)throw Error('Incomplete tick tail; never overwrite it');let pos=size-1,parts=[];
  while(pos>0){const start=Math.max(0,pos-65536),part=Buffer.alloc(pos-start);fs.readSync(fd,part,0,part.length,start);const split=part.lastIndexOf(10);if(split>=0){parts.unshift(part.subarray(split+1));return inflateTick(JSON.parse(Buffer.concat(parts).toString('utf8')),directory);}parts.unshift(part);pos=start;}
  return inflateTick(JSON.parse(Buffer.concat(parts).toString('utf8')),directory);
 }finally{fs.closeSync(fd);}
}
function checkTick(tick){const body=copy(tick);delete body.state;delete body.tickHash;if(Audit.hash(body)!==tick.tickHash||Audit.hash(tick.input)!==tick.inputHash||tick.state.lastTickHash!==tick.tickHash||tick.state.stateHash!==tick.checkpointDigest||seal(copy(tick.state)).stateHash!==tick.checkpointDigest)throw Error('Tick hash or checkpoint integrity mismatch');}
function persist(directory,result,protocol,owner){
 checkClaim(directory,protocol);const lease=JSON.parse(fs.readFileSync(path.join(directory,'monitor.lease'),'utf8'));
 if(!owner?.lease||owner.lease.token!==lease.token||owner.lease.pid!==lease.pid)throw Error('Current writer lease is required');
 checkTick(result.tick);if(Audit.hash(result.state)!==Audit.hash(result.tick.state)||result.state.protocolHash!==Audit.hash(protocol))throw Error('Checkpoint protocol mismatch');
 const previous=lastTick(directory);if(previous)checkTick(previous);if(result.tick.sequence!==(previous?.sequence||0)+1||result.tick.previousHash!==(previous?.tickHash||null))throw Error('Append-only sequence or predecessor mismatch');
 const disk=copy(result.tick),historyHash=Audit.hash(disk.input.histories||{}),historyDir=path.join(directory,'histories'),historyFile=path.join(historyDir,historyHash+'.json');fs.mkdirSync(historyDir,{recursive:true});if(fs.existsSync(historyFile)){if(Audit.hash(JSON.parse(fs.readFileSync(historyFile,'utf8')))!==historyHash)throw Error('History snapshot hash mismatch');}else fs.writeFileSync(historyFile,JSON.stringify(disk.input.histories||{}),{flag:'wx'});delete disk.input.histories;disk.inputHistorySnapshot={sha256:historyHash};
 const fd=fs.openSync(path.join(directory,'ticks.jsonl'),'a');try{fs.writeSync(fd,JSON.stringify(disk)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 const destination=path.join(directory,'state.json'),temporary=destination+'.'+process.pid+'.tmp';fs.writeFileSync(temporary,JSON.stringify(result.state));fs.renameSync(temporary,destination);
}
function recover(directory,protocol,runtime){
 checkClaim(directory,protocol);const checkpoint=path.join(directory,'state.json'),saved=fs.existsSync(checkpoint)?JSON.parse(fs.readFileSync(checkpoint,'utf8')):null;
 if(saved)validateState(saved,protocol,runtime);let state=initialState(protocol),savedMatches=!saved||(saved.sequence===0&&Audit.hash(saved)===Audit.hash(state));
 for(const tick of storedTicks(directory)){checkTick(tick);if(tick.sequence!==state.sequence+1||tick.previousHash!==state.lastTickHash)throw Error('Tick sequence or chain mismatch');const rebuilt=advance(state,tick.input,protocol,runtime);if(Audit.hash(rebuilt.tick)!==Audit.hash(tick))throw Error('Paired replay integrity mismatch');state=rebuilt.state;if(saved?.sequence===state.sequence)savedMatches=Audit.hash(saved)===Audit.hash(state);}
 if(!state.sequence)throw Error('Permanent claim has no committed paired ledger; never reset accounts');
 if(!savedMatches)throw Error('Checkpoint ahead of or inconsistent with committed ledger');return state;
}
module.exports={defineProtocol,initialState,advance,replay,claim,persist,recover,storedTicks,acquireLease:Monitor.acquireLease};
