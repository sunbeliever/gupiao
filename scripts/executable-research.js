'use strict';
// Offline, already-seen historical exploration. All orders and balances use the
// published Paper account engine; this module never changes a deployed model.
const fs=require('node:fs'),path=require('node:path');
const Paper=require('../assets/paper-engine.js'),Calendar=require('../assets/trading-calendar.js');
const Analysis=require('../assets/analysis.js'),Audit=require('../assets/audit-identity.js');
const Fee=require('../assets/fee-profile.js'),Market=require('../assets/market.js');
const copy=x=>JSON.parse(JSON.stringify(x)),at=(date,time)=>new Date(date+'T'+time+'+08:00').toISOString();
const SELECTORS=['ridge','preselected_etf','equal_three'];
function prefix(histories,date){return Object.fromEntries(Object.entries(histories).map(([s,b])=>[s,b.filter(x=>x.date<=date)]));}
function trainCandidate(histories,cutoff,alpha){
 // Truncate before fitting, not after constructing targets from future bars.
 return Analysis.train(prefix(histories,cutoff),{cutoff,horizon:20,alpha});
}
function openInput(data,policy,model,date,selector){
 if(!SELECTORS.includes(selector))throw Error('Undeclared selector');
 const now=at(date,'09:30:00'),expected=Calendar.expectedCompletedSession(now),histories=prefix(data.histories,expected);
 const rows=policy.universe.map(u=>({symbol:u.symbol,dataAsOf:histories[u.symbol]?.at(-1)?.date||null,stale:histories[u.symbol]?.at(-1)?.date!==expected}));
 const quotes={},predictions={},publishedAt=at(expected,'16:00:00');
 const chosen=selector==='preselected_etf'?['sh588000']:['sh588000','sh512760','sh515070'];
 for(const u of policy.universe){
  const bar=data.raw[u.symbol]?.find(b=>b.date===date),previous=data.raw[u.symbol]?.find(b=>b.date===expected);
  // Today's completed H/L/C/V are deliberately absent from the opening input.
  if(bar&&Number.isFinite(bar.open)&&bar.open>0){quotes[u.symbol]={symbol:u.symbol,price:bar.open,open:bar.open,previousClose:previous?.close??null,sourceTime:date+' 09:30:00',receivedAt:now,source:'historical_daily_open_hypothesis'};
   for(const key of ['openBuyTradable','openSellTradable','halted','suspended','tradeStatus','buyLimitBlocked','sellLimitBlocked'])if(bar[key]!==undefined)quotes[u.symbol][key]=bar[key];}
  if(selector==='ridge')predictions[u.symbol]=Analysis.predict(model,histories[u.symbol]||[],{publishedAt,firstReceivedAt:publishedAt});
  else predictions[u.symbol]={expectedReturn:chosen.includes(u.symbol)?1000000:-1,eligible:true,asOf:histories[u.symbol]?.at(-1)?.date||null,signalDate:histories[u.symbol]?.at(-1)?.date||null,horizon:20,referenceOpen:null,publishedAt,firstReceivedAt:publishedAt,signalMeaning:'deterministic_order_priority_not_return_forecast'};
 }
 const dataHealth={ok:rows.every(r=>!r.stale),expectedAsOf:expected,rows};
 return {at:now,quotes,context:{predictions,model,dataHealth}};
}
function closingInput(data,policy,model,date){
 // Close becomes available after the continuous session: mark only, no trades.
 const now=at(date,'16:00:00'),quotes={};
 for(const u of policy.universe){const bar=data.raw[u.symbol]?.find(b=>b.date===date);if(bar&&Number.isFinite(bar.close)&&bar.close>0)quotes[u.symbol]={symbol:u.symbol,price:bar.close,open:bar.open,sourceTime:date+' 15:00:00',receivedAt:now,source:'historical_daily_close_valuation'};}
 return {at:now,quotes,context:{model,dataHealth:{ok:false,expectedAsOf:date,reason:'closed_session_valuation_only'}}};
}
function validatePolicy(policy){
 if(!Calendar.isSession(policy.start)||!Calendar.isSession(policy.end)||policy.start>policy.end||policy.trainCutoff>=policy.start)throw Error('Invalid frozen research dates');
 if(policy.maxDrawdownLimit!==undefined&&(!Number.isFinite(policy.maxDrawdownLimit)||policy.maxDrawdownLimit<=0||policy.maxDrawdownLimit>1))throw Error('Invalid declared drawdown limit');
 const six=['sh588000','sh512760','sh515070','sh512720','sh515880','sz159852'];
 if(policy.capitalProfile==='capital50k-risk500-v1'){const r=policy.riskLimits;if(policy.budget!==50000||policy.stopLossRate!==.04||policy.targetExitEnabled!==false||![0,.01].includes(policy.minEstimatedNetReturn)||!r||r.investableLimit!==12500||r.maxExposure!==.25||r.maxPositions!==3||r.maxThemeWeight!==1||policy.universe.length!==6||six.some(x=>!policy.universe.some(u=>u.symbol===x&&u.type==='etf')))throw Error('Invalid explicit 50k research profile');}
 else if(policy.budget!==10000||policy.capitalProfile!==undefined)throw Error('Research requires legacy 10000 or explicit 50000 profile');
 if(!policy.universe.length||policy.universe.some(u=>u.type!=='etf'))throw Error('ETF universe required');
}
function runReplay({data,policy,model,selector,onProgress,deadlineMs,openingProvider}){
 validatePolicy(policy);if(!SELECTORS.includes(selector))throw Error('Undeclared selector');
 if(model.cutoff>policy.trainCutoff)throw Error('Model cutoff exceeds declared training boundary');
 const accountModel={...copy(model),researchSelector:selector},riskLimits={investableLimit:policy.budget,maxExposure:1,maxPositions:3,maxThemeWeight:1,...copy(policy.riskLimits||{})};
 const researchIdentity=Audit.fingerprint({strategyId:'historical-'+selector+'-shared-account-v1',model:accountModel,universe:policy.universe,rules:{...policy,selector,observation:'daily_open_then_close',baselinePriorityNotForecast:selector!=='ridge'},data:{pricesHash:Audit.hash(data)},feeProfile:Fee.resolve(policy),budget:policy.budget,riskLimits,executionMode:'historical_daily_shared_account'});
 let session,initialSession;const events=[],daily=[],warnings=[];
 for(let date=policy.start;date<=policy.end;date=Calendar.nextSession(date)){if(deadlineMs!==undefined&&Date.now()>deadlineMs)throw Error('Research execution budget reached');
  const opening=openingProvider?openingProvider(date,accountModel):openInput(data,policy,accountModel,date,selector);
  if(opening.at!==at(date,'09:30:00')||Audit.hash(opening.context.model)!==Audit.hash(accountModel))throw Error('Historical provider identity/time mismatch');
  // Compare raw and adjusted overnight ratios before any ex-date sale. Unknown
  // adjustment evidence invalidates readiness, never changes historic prices.
  const prior=Calendar.previousSession(date);
  for(const u of policy.universe){const a=data.histories[u.symbol]?.find(b=>b.date===date),ap=data.histories[u.symbol]?.find(b=>b.date===prior),r=data.raw[u.symbol]?.find(b=>b.date===date),rp=data.raw[u.symbol]?.find(b=>b.date===prior);if(a&&ap&&r&&rp&&Math.abs(r.open/rp.close-a.open/ap.close)>.025&&!(policy.corporateEvents||[]).some(e=>e.symbol===u.symbol&&e.exDate===date))warnings.push({date,symbol:u.symbol,reason:'unreconciled_raw_adjusted_overnight_ratio'});}
  for(const input of [opening,closingInput(data,policy,accountModel,date)]){
   const priorOrders=session?.orders.length||0;
   if(!session){session=Paper.startAuto({...policy,riskLimits,allocationMode:'full',preset:'full_capital',accountId:'historical-'+selector+'-'+Audit.hash(researchIdentity).slice(0,12),executionMode:'historical_daily_shared_account',historicalReplay:true,now:input.at,quotes:input.quotes,predictions:input.context.predictions,model:accountModel,dataHealth:input.context.dataHealth,historyHash:Audit.hash(prefix(data.histories,Calendar.previousSession(date)))});initialSession=copy(session);}
   else session=Paper.stepAuto(session,input.quotes,input.at,input.context);
   const a=session.account,marketValue=a.holdings.reduce((sum,h)=>sum+h.shares*h.lastPrice,0),receivables=(a.receivables||[]).reduce((sum,x)=>sum+x.amount,0);
   if(Math.abs(a.cash+marketValue+receivables-a.equity)>1e-6||a.cash<-.000001)throw Error('Account reconciliation failed');
   events.push({input:copy(input),orders:copy(session.orders.slice(priorOrders)),stateHash:session.integrityHash,equity:a.equity,cash:a.cash,marketValue,receivables,stalePositions:a.holdings.filter(h=>h.stale).map(h=>h.symbol),inputHash:Audit.hash(input)});
  }
  daily.push({date,equity:session.account.equity,cash:session.account.cash,marketValue:session.account.marketValue,feesPaid:session.account.feesPaid,stale:session.account.holdings.filter(h=>h.stale).map(h=>h.symbol)});
  if(onProgress&&daily.length%50===0)onProgress({selector,sessions:daily.length,date});
 }
 // Same fixed event inputs, independent execution via the public bulk replay.
 const replay=Paper.replay(initialSession,events.slice(1).map(e=>e.input),{deadlineMs});
 if(replay.integrityHash!==session.integrityHash||Audit.hash(replay.orders)!==Audit.hash(session.orders))throw Error('Public replay diverged from incremental account');
 const a=session.account,filled=session.orders.filter(o=>o.account==='model'&&o.status==='hypothetical_fill'),closed=session.closedPositions.filter(p=>p.account==='model');
 let peak=policy.budget,drawdown=0,exposure=0;for(const d of daily){peak=Math.max(peak,d.equity);drawdown=Math.max(drawdown,1-d.equity/peak);exposure+=d.equity>0?d.marketValue/d.equity:0;}
 const annual=[],yearEnds=new Map();for(const d of daily)yearEnds.set(d.date.slice(0,4),d);let base=policy.budget;for(const [year,d]of yearEnds){annual.push({year,asOf:d.date,startEquity:base,endEquity:d.equity,netReturn:d.equity/base-1,annualized:false});base=d.equity;}
 const minimumObservedEquity=Math.min(policy.budget,...daily.map(d=>d.equity)),daysBelowInitialCapital=daily.filter(d=>d.equity<policy.budget-1e-8).length,maxObservedDailyExposure=Math.max(0,...daily.map(d=>d.equity>0?d.marketValue/d.equity:0)),riskReasons=[];
 const riskLimit=policy.maxDrawdownLimit??null;if(riskLimit===null)riskReasons.push('risk_limit_not_declared');else if(drawdown>riskLimit+1e-12)riskReasons.push('drawdown_exceeds_declared_limit');if(a.equity<=policy.budget)riskReasons.push('no_positive_net_return');if(annual.some(r=>r.netReturn<0))riskReasons.push('negative_annual_account_change');if(!filled.some(o=>o.side==='buy'))riskReasons.push('no_executed_model_trades');
 const riskScreen={maxDrawdownLimit:riskLimit,historicalRiskScreenPassed:riskLimit===null?null:riskReasons.length===0,zeroLossObserved:minimumObservedEquity>=policy.budget-1e-8,investmentReady:false,verifiedProfitProbability:null,reasons:riskReasons,note:'Observed daily historical screen only. Entry exposure caps do not rebalance appreciated holdings. No intraday zero-loss or future capital guarantee.'};
 const summary={minimumObservedEquity,maxLossFromInitialCapital:Math.max(0,policy.budget-minimumObservedEquity),daysBelowInitialCapital,maxObservedDailyExposure,riskScreen,schema:'executable-historical-research-v1',evidenceKind:'historical_exploration',deployed:false,strategySuccess:false,verifiedProfitProbability:null,selectorId:selector,signalMeaning:selector==='ridge'?'uncalibrated_expected_return':'deterministic_order_priority_not_return_forecast',engineStrategyLabel:session.fingerprint.strategy_id,researchIdentity,fingerprint:copy(session.fingerprint),budget:policy.budget,period:[policy.start,policy.end],trainingCutoff:model.cutoff,modelVersion:model.version,equity:a.equity,netPnl:a.equity-policy.budget,netReturn:a.equity/policy.budget-1,cash:a.cash,feesPaid:a.feesPaid,realizedPnl:a.realizedPnl,unrealizedPnl:a.unrealizedPnl,observedDailyMaxDrawdown:drawdown,dailyMeanExposure:exposure/daily.length,grossTurnover:filled.reduce((n,o)=>n+o.notional,0)/policy.budget,buyCount:filled.filter(o=>o.side==='buy').length,sellCount:filled.filter(o=>o.side==='sell').length,closedTradeCount:closed.length,closedTradeWinFraction:closed.length?closed.filter(p=>p.realizedPnl+(p.dividendIncome||0)>0).length/closed.length:null,winFractionMeaning:'realized round trips including known dividends, not 20-session forecast accuracy; trades overlap and are not independent',openPositions:copy(a.holdings),receivables:copy(a.receivables),annual,parityVerified:true,finalStateHash:session.integrityHash,warnings,limitations:['Already inspected history and a survivor-selected six-ETF pool; not blind or forward evidence.','Raw open hypothetical fills lack historical order-book and suspension verification; daily open/close observations miss intraday risk exits.','The 16:00 close is valuation only, never a 14:56 executable fill. End holdings are never forced into cash.','Deterministic baselines share the 20-session expiry and declared '+(policy.stopLossRate*100)+'% risk exit, and rebuy with remaining cash; these are not perpetual buy-and-hold.','Core strategy_id is the unchanged engine family label; researchIdentity binds the actual selector, model, policy and data to this result and every outer event. It is not the deployed 19-stock model.','Unknown corporate actions, stale prices and transaction refusals remain visible. No automatic promotion or promise of 70% profitability.']};
 return {summary,session,initialSession,events,daily};
}
function cli(args,root=path.resolve(__dirname,'..')){
 let mode,id,prices,entryExit=false,capitalPreservation=false;
 for(let i=0;i<args.length;i++){if(args[i]==='--capital-preservation'&&!capitalPreservation){capitalPreservation=true;continue;}if(args[i]==='--entry-exit'&&!entryExit){entryExit=true;continue;}if(['--declare','--run'].includes(args[i])&&!mode)mode=args[i];else if(args[i]==='--id')id=args[++i];else if(args[i]==='--prices')prices=args[++i];else throw Error('Use --declare --id ID --prices FILE, then --run --id ID');}
 if(!mode||!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id||''))throw Error('Require mode and safe research ID');
 if(entryExit&&capitalPreservation)throw Error('Choose one research family per declaration');
 if((entryExit||capitalPreservation)&&mode!=='--declare')throw Error('--entry-exit only selects candidates at declaration; run the frozen manifest without new options');
 const dir=path.join(root,'validation/executable-research',id);
 if(mode==='--declare'){
  if(fs.existsSync(dir))throw Error('Preserve prior declaration; do not replace or tune a completed experiment');
  const bytes=fs.readFileSync(path.resolve(prices)),data=JSON.parse(bytes),universe=Market.UNIVERSE.filter(u=>u.type==='etf');
  if(universe.length!==6||universe.some(u=>!data.raw[u.symbol]||!data.histories[u.symbol]))throw Error('Six-ETF data required');
  const policy={start:'2025-01-02',end:'2026-09-30',trainCutoff:'2024-12-31',budget:10000,universe,feeProfile:Fee.resolve({minFee:5}),corporateEvents:require('../assets/corporate-events.js').events,stopLossRate:.08};
  if(capitalPreservation)policy.maxDrawdownLimit=.05;
  const capitalCandidates=[{fraction:.25,label:'25'},{fraction:.125,label:'12_5'}].flatMap(({fraction,label})=>{const riskLimits={investableLimit:10000*fraction,maxExposure:fraction,maxPositions:3,maxThemeWeight:1};return [{id:'net1-risk'+label,selector:'ridge',alpha:1,ruleOverrides:{targetExitEnabled:false,minEstimatedNetReturn:.01,riskLimits}},{id:'equal-three-risk'+label,selector:'equal_three',alpha:1,ruleOverrides:{targetExitEnabled:false,minEstimatedNetReturn:0,riskLimits}}];});
  const sources=Object.fromEntries(['executable-research.js'].map(n=>['scripts/'+n,Audit.hash(fs.readFileSync(path.join(__dirname,n),'utf8'))]));
  for(const name of ['paper-engine.js','paper-account.js','analysis.js','trading-calendar.js','fee-profile.js','audit-identity.js','corporate-actions.js','corporate-events.js'])sources['assets/'+name]=Audit.hash(fs.readFileSync(path.join(root,'assets',name),'utf8'));
  const manifest={schema:'executable-research-declaration-v1',id,declaredAt:new Date().toISOString(),evidenceKind:'already_seen_historical_exploration',dataHash:Audit.hash(data),sources,policy,candidates:capitalPreservation?capitalCandidates:entryExit?[{id:'no-target-exit',selector:'ridge',alpha:1,ruleOverrides:{targetExitEnabled:false,minEstimatedNetReturn:0}},{id:'no-target-net1pct',selector:'ridge',alpha:1,ruleOverrides:{targetExitEnabled:false,minEstimatedNetReturn:.01}}]:[{id:'ridge-alpha1',selector:'ridge',alpha:1},{id:'ridge-alpha10',selector:'ridge',alpha:10},{id:'preselected-etf',selector:'preselected_etf',alpha:1},{id:'equal-three',selector:'equal_three',alpha:1}],selectionRule:'Diagnostic fixed comparison only. No winning candidate is deployed. Retain all declared outcomes and failed attempts. No parameter search or stopping at a profit.',trainingRule:'Only bars and complete 20-session label intervals ending on or before 2024-12-31; fixed weights thereafter. A research refit of the six-ETF family, not the deployed 19-name model.'};
  fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx'});fs.writeFileSync(path.join(dir,'prices.json'),bytes,{flag:'wx'});
  console.log(JSON.stringify({declared:true,id,manifestHash:Audit.hash(manifest),dir}));return;
 }
 const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8')),data=JSON.parse(fs.readFileSync(path.join(dir,'prices.json'),'utf8'));
 if(manifest.id!==id||manifest.dataHash!==Audit.hash(data))throw Error('Declaration or data mismatch');
 for(const [file,hash]of Object.entries(manifest.sources))if(Audit.hash(fs.readFileSync(path.join(root,file),'utf8'))!==hash)throw Error('Declared source changed: '+file);
 fs.writeFileSync(path.join(dir,'experiment.claim'),JSON.stringify({startedAt:new Date().toISOString(),manifestHash:Audit.hash(manifest)}),{flag:'wx'});
 const results=[];try{for(const candidate of manifest.candidates){const model=trainCandidate(data.histories,manifest.policy.trainCutoff,candidate.alpha),result=runReplay({data,policy:{...manifest.policy,...candidate.ruleOverrides},model,selector:candidate.selector,onProgress:x=>console.log(JSON.stringify({candidate:candidate.id,...x}))});const artifact={candidate,manifestHash:Audit.hash(manifest),...result};fs.writeFileSync(path.join(dir,candidate.id+'.json'),JSON.stringify(artifact),{flag:'wx'});results.push({candidate:candidate.id,...result.summary});console.log(JSON.stringify({candidate:candidate.id,netReturn:result.summary.netReturn,drawdown:result.summary.observedDailyMaxDrawdown,closed:result.summary.closedTradeCount}));}fs.writeFileSync(path.join(dir,'comparison.json'),JSON.stringify({manifestHash:Audit.hash(manifest),completedAt:new Date().toISOString(),results,automaticDeployment:false},null,2),{flag:'wx'});}catch(e){fs.writeFileSync(path.join(dir,'failure.json'),JSON.stringify({at:new Date().toISOString(),error:e.message,completedCandidates:results.map(r=>r.candidate)}),{flag:'wx'});throw e;}
}
if(require.main===module)try{cli(process.argv.slice(2));}catch(e){console.error(e.message);process.exitCode=1;}
module.exports={cli,trainCandidate,openInput,closingInput,runReplay};
