'use strict';
const Paper=require('../assets/paper-engine.js'),C=require('../assets/trading-calendar.js'),A=require('../assets/audit-identity.js'),Fee=require('../assets/fee-profile.js'),Base=require('./investment-decision-engine.js'),R=require('./executable-research.js');
const clone=x=>JSON.parse(JSON.stringify(x));
const Cost=require('./cost-aware-decision.js'),Quality=require('./historical-data-quality.js'),E=Base;
// Independent offline studies only. Never calls old --run/--resume or their queue.
const Regime=require('./regime-decision-l.js');
const KINDS=['monitor_only'],FIXED=['sh588000','sh512760','sh515070'];
function opening(data,policy,model,date){
 const v=R.openInput(data,policy,model,date,'equal_three'),prior=C.previousSession(date);
 v.context.predictions=Object.fromEntries(policy.universe.map(u=>[u.symbol,{eligible:false,asOf:prior,signalDate:prior,horizon:20,reason:'explicit_research_decision_only'}]));
 return v;
}
function aggregateHoldings(lots){
 return [...new Set(lots.map(h=>h.symbol))].map(symbol=>{const hs=lots.filter(h=>h.symbol===symbol),shares=hs.reduce((n,h)=>n+h.shares,0);return{symbol,shares,entryPrice:hs.reduce((n,h)=>n+h.entryPrice*h.shares,0)/shares,stopPrice:Math.min(...hs.map(h=>h.exitPlan.stopPrice)),sellableSession:hs.map(h=>h.sellableSession).sort()[0],maturitySession:hs.map(h=>h.maturitySession).sort()[0],pendingExit:hs.find(h=>h.pendingExit)?.pendingExit||null};});
}
function metrics(daily,session,budget){
 let peak=budget,dd=0,ddp=0;for(const d of daily){peak=Math.max(peak,d.equity);dd=Math.max(dd,peak-d.equity);ddp=Math.max(ddp,1-d.equity/peak);}
 const changes=daily.map((d,i)=>d.equity/(i?daily[i-1].equity:budget)-1),mean=changes.reduce((n,r)=>n+r,0)/daily.length,sd=Math.sqrt(changes.reduce((n,r)=>n+(r-mean)**2,0)/Math.max(1,daily.length-1)),a=session.account,annualized=(a.equity/budget)**(252/daily.length)-1,filled=session.orders.filter(o=>o.account==='model'&&o.status==='hypothetical_fill'),closed=session.closedPositions.filter(h=>h.account==='model'),annual=[];
 let base=budget;for(const year of [...new Set(daily.map(d=>d.date.slice(0,4)))]){const d=daily.filter(d=>d.date.startsWith(year)).at(-1);annual.push({year,startEquity:base,endEquity:d.equity,netReturn:d.equity/base-1,annualized:false});base=d.equity;}
 const wins=closed.filter(h=>h.realizedPnl>0),losses=closed.filter(h=>h.realizedPnl<0),grossLoss=-losses.reduce((n,h)=>n+h.realizedPnl,0);
 return{budget,equity:a.equity,netPnl:a.equity-budget,netReturn:a.equity/budget-1,feesPaid:a.feesPaid,cash:a.cash,realizedPnl:a.realizedPnl,unrealizedPnl:a.unrealizedPnl,maxDrawdownAmount:dd,maxDrawdownProportion:ddp,annualizedReturn:annualized,sharpe:sd>0?mean/sd*Math.sqrt(252):null,calmar:ddp>0?annualized/ddp:null,grossTurnover:filled.reduce((n,o)=>n+o.notional,0)/budget,buyCount:filled.filter(o=>o.side==='buy').length,sellCount:filled.filter(o=>o.side==='sell').length,closedTradeCount:closed.length,closedTradeWinFraction:closed.length?wins.length/closed.length:null,profitFactor:grossLoss>0?wins.reduce((n,h)=>n+h.realizedPnl,0)/grossLoss:null,meanExposure:daily.reduce((n,d)=>n+d.marketValue/d.equity,0)/daily.length,openPositions:clone(a.holdings),annual,minimumObservedDailyEquity:Math.min(budget,...daily.map(d=>d.equity)),daysBelowInitialCapital:daily.filter(d=>d.equity<budget-1e-8).length};
}
function buyHoldPlan(session,input,policy,bought){
 const a=session.account,limit=Math.min(12500,a.equity*.25),rows=policy.universe.map(u=>{let shares=0;if(!bought&&FIXED.includes(u.symbol)){const price=Fee.executionPrice(input.quotes[u.symbol].price,'buy',session.feeProfile),allocation=limit/3;shares=Math.floor(allocation/price/100)*100;while(shares&&shares*price+Fee.costs(u,shares*price,'buy',session.feeProfile).total>allocation)shares-=100;}return{symbol:u.symbol,buyShares:shares,sellShares:0,intendedAction:shares?'candidate_buy':'observe'};});
 return{candidateId:E.CANDIDATE_ID,researchOnly:true,executable:false,investmentReady:false,asOf:input.at,signalAsOf:C.previousSession(C.sessionOf(input.at)),rows,dataHealth:input.context.dataHealth};
}

function createCooldown(n){
 if(![0,1,5].includes(n))throw Error('Only preregistered 0/1/5-session arms allowed');
 const seen=new Set(),until={},stats={riskStopFills:0,suppressedBuyOrders:0,suppressedBuyShares:0};
 function observe(orders){for(const o of orders){if(seen.has(o.id))continue;seen.add(o.id);if(o.account!=='model'||o.status!=='hypothetical_fill'||o.side!=='sell'||o.reason!=='risk_stop')continue;stats.riskStopFills++;let d=C.sessionOf(Date.parse(o.fillAt));for(let i=0;i<n;i++)d=C.nextSession(d);until[o.symbol]=!until[o.symbol]||d>until[o.symbol]?d:until[o.symbol];}}
 function blocked(symbol,date){return n>0&&!!until[symbol]&&date<until[symbol];}
 function filter(plan,date){for(const r of plan.rows){if(!r.buyShares||!blocked(r.symbol,date))continue;stats.suppressedBuyOrders++;stats.suppressedBuyShares+=r.buyShares;r.buyShares=0;r.buyCost=0;if(r.desiredShares>r.currentShares)r.desiredShares=r.currentShares;r.intendedAction=r.currentShares?'hold':'observe';r.action=r.intendedAction;r.reasons=[...(r.reasons||[]),'preregistered_risk_stop_cooldown'];}plan.totalBuyCost=plan.rows.reduce((sum,r)=>sum+(r.buyCost||0),0);return plan;}
 return {observe,blocked,filter,diagnostics:()=>({...stats,until:{...until}})};
}

function runReplay({data,policy,kind,deadlineMs,onProgress,cooldownSessions=0}){
 const cooldown=createCooldown(cooldownSessions);const E={CANDIDATE_ID:Regime.IDS.monitor_only,SYMBOLS:Base.SYMBOLS,evaluate:x=>Regime.evaluate(x,{kind:'monitor_only',anchor:policy.start})};
 const dataQuality=Quality.auditDataset(data,{start:policy.start,end:policy.end});if(!dataQuality.priceDiscontinuityGatePassed||policy.start!=='2025-01-03'||policy.end!=='2025-12-31')throw Error('Study restricted to fixed screened 2025 interval');
 if(!KINDS.includes(kind)||policy.budget!==50000||policy.stopLossRate!==.04||policy.targetExitEnabled!==false||policy.universe.length!==6||E.SYMBOLS.some(s=>!policy.universe.some(u=>u.symbol===s&&u.type==='etf'))||policy.corporateEvents?.length||!C.isSession(policy.start)||!C.isSession(policy.end)||policy.start>policy.end||policy.trainCutoff>=policy.start||!C.isSession(policy.signalStart)||!C.isSession(policy.signalEnd))throw Error('Invalid fixed decision-account policy');
 if(!policy.riskLimits||policy.riskLimits.investableLimit!==12500||policy.riskLimits.maxExposure!==.25||policy.riskLimits.maxPositions!==3||policy.riskLimits.maxThemeWeight!==1)throw Error('Invalid decision-account risk identity');
 const policyHash=A.hash({kind,policy,candidateId:E.CANDIDATE_ID,offlineVersion:'2026.11.02-reentry-a',cooldownSessions,regimeParameters:Regime.IDS[kind]?Regime.PARAMETERS:null,costParameters:kind==='cost_aware_weekly'?Cost.PARAMETERS:null}),model={kind:'registered-decision-research-v1',candidateId:E.CANDIDATE_ID,version:'offline-l-decision-account-v1',decisionPolicyHash:policyHash,cutoff:policy.trainCutoff,horizon:20,...(kind==='true_buy_hold_three'?{researchExitMode:'buy_hold'}:{})},events=[],daily=[],decisions=[],warnings=[];
 let session,initialSession,peak=policy.budget,observedMaxDrawdown=0,observedMaxDrawdownProportion=0,bought=false;const diagnostics={cashDays:0,noSignalDays:0,cashPositiveBasketDays:0,rankChanges:0,targetChanges:0,states:{},decisionUnavailableDays:0,drawdownBlocksIncreaseDays:0,costSuppressedOrders:0},check=()=>{if(deadlineMs!==undefined&&Date.now()>deadlineMs)throw Error('Decision research budget reached');},markPeak=()=>{peak=Math.max(peak,session.account.equity);observedMaxDrawdown=Math.max(observedMaxDrawdown,peak-session.account.equity);observedMaxDrawdownProportion=Math.max(observedMaxDrawdownProportion,1-session.account.equity/peak);};
 function step(input){check();session=Paper.stepAuto(session,input.quotes,input.at,input.context);events.push({kind:'step',quotes:input.quotes,at:input.at,context:input.context});markPeak();}
 let previousRanking=null,previousTargets=null;
 for(let date=policy.start;date<=policy.end;date=C.nextSession(date)){
  check();const input=opening(data,policy,model,date),prior=C.previousSession(date),histories=Object.fromEntries(policy.universe.map(u=>[u.symbol,(data.histories[u.symbol]||[]).filter(b=>b.date<=prior).slice(-61)]));
  for(const u of policy.universe){const h=data.histories[u.symbol]?.find(b=>b.date===date),hp=data.histories[u.symbol]?.find(b=>b.date===prior),r=data.raw[u.symbol]?.find(b=>b.date===date),rp=data.raw[u.symbol]?.find(b=>b.date===prior);if(h&&hp&&r&&rp&&Math.abs(r.open/rp.close-h.open/hp.close)>.025)warnings.push({date,symbol:u.symbol,reason:'unreconciled_raw_adjusted_overnight_ratio'});}
  if(!session){session=Paper.startAuto({...policy,historicalReplay:true,allocationMode:'full',accountId:'historical-reentry-a-'+kind+'-'+cooldownSessions+'-'+policyHash.slice(0,12),model,now:input.at,quotes:input.quotes,predictions:input.context.predictions,dataHealth:input.context.dataHealth,historyHash:A.hash(histories)});initialSession=clone(session);markPeak();}else step(input);
  cooldown.observe(session.orders);let plan;
  if(kind!=='true_buy_hold_three')plan=E.evaluate({now:input.at,universe:policy.universe,histories,quotes:input.quotes,feeProfile:policy.feeProfile,account:{budget:policy.budget,equity:session.account.equity,cash:session.account.cash,drawdown:peak-session.account.equity,holdings:aggregateHoldings(session.account.holdings)}});
  else plan=buyHoldPlan(session,input,policy,bought);
  let state='unknown';
  if(kind!=='true_buy_hold_three'&&plan.status==='candidate_ready'){
   if(plan.guardIncreaseBlocked===undefined?plan.drawdownWarning:plan.guardIncreaseBlocked)diagnostics.drawdownBlocksIncreaseDays++;diagnostics.costSuppressedOrders+=plan.turnoverControl?.suppressedOrders||0;
   const eligible=plan.rows.filter(r=>r.eligible).length,vol=plan.rows.reduce((n,r)=>n+r.indicators.volatility20,0)/6;state=(eligible>=4?'up':eligible<=2?'down':'mixed')+(vol>=.30?'_high_vol':'_normal_vol');
   if(!eligible)diagnostics.noSignalDays++;
   const ranks=A.hash(plan.ranking),targets=A.hash(plan.rows.map(r=>[r.symbol,r.desiredShares]));if(previousRanking&&previousRanking!==ranks)diagnostics.rankChanges++;if(previousTargets&&previousTargets!==targets)diagnostics.targetChanges++;previousRanking=ranks;previousTargets=targets;
  }
  if((kind!=='true_buy_hold_three'&&plan.status==='candidate_ready')||kind==='true_buy_hold_three'){
   const within=prior>=policy.signalStart&&prior<=policy.signalEnd;
   if(!within){plan.totalBuyCost=0;for(const row of plan.rows){row.buyShares=0;row.buyCost=0;if(row.desiredShares>row.currentShares){row.desiredShares=row.currentShares;row.intendedAction=row.currentShares?'hold':'observe';row.action=row.intendedAction;row.reasons?.push('common_entry_window_closed');}}}
   cooldown.filter(plan,date);const bound={...plan,accountHash:A.hash(session.account),quotesHash:A.hash(input.quotes)};
   session=Paper.applyResearchDecision(session,input.quotes,input.at,{plan:bound,policyHash});events.push({kind:'decision',quotes:input.quotes,at:input.at,context:{plan:bound,policyHash}});markPeak();
   decisions.push({date,signalAsOf:prior,inputHistoryHash:A.hash(histories),plan:bound,state,accountStateHash:session.integrityHash});if(kind==='true_buy_hold_three'&&within)bought=true;
  }else diagnostics.decisionUnavailableDays++;
  const openExposure=session.account.marketValue;
  step(R.closingInput(data,policy,model,date));cooldown.observe(session.orders);
  const a=session.account,rec=a.cash+a.holdings.reduce((n,h)=>n+h.shares*h.lastPrice,0)+a.receivableValue;
  if(Math.abs(rec-a.equity)>1e-6||a.cash<-.000001)throw Error('Decision account reconciliation failure');
  const basket=policy.universe.map(u=>{const b=data.raw[u.symbol]?.find(b=>b.date===date);return b?b.close/b.open-1:null;});if(basket.some(x=>x===null))throw Error('Incomplete raw basket');
  if(openExposure===0){diagnostics.cashDays++;if(basket.reduce((n,x)=>n+x,0)>0)diagnostics.cashPositiveBasketDays++;}
  const netChange=a.equity-(daily.at(-1)?.equity||policy.budget),byState=diagnostics.states[state]||(diagnostics.states[state]={days:0,netChange:0,fees:0,positiveDays:0});byState.days++;byState.netChange+=netChange;byState.fees+=a.feesPaid-(daily.at(-1)?.feesPaid||0);if(netChange>0)byState.positiveDays++;
  daily.push({date,equity:a.equity,cash:a.cash,marketValue:a.marketValue,feesPaid:a.feesPaid,stale:a.holdings.filter(h=>h.stale).map(h=>h.symbol),state,openMarketValue:openExposure});
  if(onProgress&&daily.length%25===0)onProgress({kind,date,sessions:daily.length});
 }
 const replay=Paper.replayResearch(initialSession,events,{deadlineMs});check();if(replay.integrityHash!==session.integrityHash||A.hash(replay.orders)!==A.hash(session.orders))throw Error('Historical decision replay parity mismatch');
 const summary={cooldownSessions,cooldownDiagnostics:cooldown.diagnostics(),dataQuality,economicMetricsTrusted:false,largeDiscontinuityGatePassed:dataQuality.priceDiscontinuityGatePassed,offlineAuditOnly:true,...metrics(daily,session,policy.budget),path:kind,period:[policy.start,policy.end],policyHash,candidateId:E.CANDIDATE_ID,parityVerified:true,finalStateHash:session.integrityHash,maximumOpenCloseObservedDrawdown:observedMaxDrawdown,maximumOpenCloseObservedDrawdownProportion:observedMaxDrawdownProportion,diagnostics,warnings,expectedReturn:null,verifiedProfitProbability:null,independentOutOfSample:false,investmentReady:false,promoted:false,sameInitialBudgetFeesAndExecution:true,riskControlEquivalentToOriginal:false,riskDifferences:Regime.IDS[kind]?['500 warning monitor only, no global entry lock',...(kind==='regime_band'?['breadth and volatility budget, no-trade band']:[])]:kind==='recovery_cost'?['K finite-cooldown half-budget recovery']:kind!=='true_buy_hold_three'?['500 observed-drawdown warning blocks increases','daily thesis and target changes']:['No risk or expiry exit; no reentry'],limitations:['Already inspected history, unknown first availability and corporate actions; no blind or forward performance claim','Raw opening hypothetical fills; daily close is valuation only; no intraday risk coverage','Unsold end positions remain invested; no future sell fees charged','Cash and missed positive basket days are descriptive, not reliable profit or tradable counterfactual returns','Buy hold intentionally disables risk/expiry/reentry; compare actual exposure and risk, not identical risk control']};
 return{summary,session,initialSession,events,daily,decisions,parityVerified:true};
}
module.exports={KINDS,opening,aggregateHoldings,metrics,runReplay,createCooldown};

