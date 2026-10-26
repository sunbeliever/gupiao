'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Calendar=require('../assets/trading-calendar.js'),Fee=require('../assets/fee-profile.js'),Audit=require('../assets/audit-identity.js');
const load=()=>require('../scripts/decision-account-study.js');
const SYMBOLS=['sh512720','sh512760','sh515070','sh515880','sh588000','sz159852'];
const BUY_HOLD=['sh588000','sh512760','sh515070'];
function fixture(){
 const dates=[];for(let date='2024-07-01';date<='2025-02-28';date=Calendar.nextSession(date))dates.push(date);
 const breakAt=dates.indexOf('2025-01-13'),histories={},raw={};
 for(let j=0;j<SYMBOLS.length;j++){
  const symbol=SYMBOLS[j];
  histories[symbol]=dates.map((date,i)=>{
   const trend=i<breakAt?100*Math.exp((.001+j*.0002)*i):100*Math.exp((.001+j*.0002)*(breakAt-1))-.8*(i-breakAt+1);
   const close=trend+(i%2?.05:-.05);
   return {date,open:close,high:close*1.01,low:close*.99,close,volume:10000};
  });
  raw[symbol]=dates.map(date=>({date,open:1,high:1.01,low:.99,close:1,volume:10000}));
 }
 const end='2025-02-28';
 const policy={
  id:'synthetic-decision-account-study',start:'2025-01-03',end,signalStart:'2025-01-02',signalEnd:Calendar.previousSession(end,20),
  trainCutoff:'2024-12-31',budget:50000,horizon:20,
  universe:SYMBOLS.map(symbol=>({symbol,name:symbol,type:'etf',sector:'synthetic-technology'})),
  investableLimit:12500,maxExposure:.25,maxPositions:3,maxThemeWeight:1,
  riskLimits:{investableLimit:12500,maxExposure:.25,maxPositions:3,maxThemeWeight:1},
  stopLossRate:.04,targetExitEnabled:false,minEstimatedNetReturn:.01,corporateEvents:[],
  feeProfile:Fee.resolve(),allocationMode:'full'
 };
 return {data:{histories,raw},policy};
}
function model(policy){return {kind:'registered-decision-research-v1',candidateId:'trend-relative20-risk-v1',decisionPolicyHash:Audit.hash(policy),horizon:20,cutoff:'2024-12-31'};}
function fills(result,side){return result.session.orders.filter(o=>o.account==='model'&&o.status==='hypothetical_fill'&&o.side===side);}
function plans(result){return result.decisions.map(d=>d.plan||d);}
test('same-symbol research lots aggregate shares weighted raw entry and conservative original exit conditions',()=>{
 const D=load(),lots=[
  {symbol:'sh588000',name:'ETF',shares:100,entryPrice:1,entryFee:5,entrySession:'2025-01-03',sellableSession:'2025-01-06',maturitySession:'2025-02-07',exitPlan:{stopPrice:.96,maturitySession:'2025-02-07'},pendingExit:null},
  {symbol:'sh588000',name:'ETF',shares:300,entryPrice:1.2,entryFee:5,entrySession:'2025-01-06',sellableSession:'2025-01-07',maturitySession:'2025-02-10',exitPlan:{stopPrice:1.152,maturitySession:'2025-02-10'},pendingExit:{reason:'research_exit',shares:300}},
  {symbol:'sh512760',name:'Other ETF',shares:200,entryPrice:2,entryFee:5,entrySession:'2025-01-03',sellableSession:'2025-01-06',maturitySession:'2025-02-07',exitPlan:{stopPrice:1.92,maturitySession:'2025-02-07'},pendingExit:null}
 ],before=structuredClone(lots),out=D.aggregateHoldings(lots),h=out.find(x=>x.symbol==='sh588000');
 assert.equal(out.length,2);assert.equal(h.shares,400);assert.ok(Math.abs(h.entryPrice-1.15)<1e-12);
 assert.equal(h.stopPrice,.96);assert.equal(h.maturitySession,'2025-02-07');assert.equal(h.sellableSession,'2025-01-06');assert.ok(h.pendingExit);
 assert.deepEqual(lots,before);
});
test('research opening cannot read current-day raw or HFQ high low close volume and never supplies automatic entries',()=>{
 const D=load(),f=fixture(),m=model(f.policy),date=f.policy.start,one=D.opening(f.data,f.policy,m,date);
 const before=structuredClone(one);
 assert.ok(Object.values(one.context.predictions).every(p=>p.eligible===false));
 for(const symbol of SYMBOLS){
  Object.assign(f.data.raw[symbol].find(b=>b.date===date),{high:4,low:.2,close:3,volume:9000000});
  Object.assign(f.data.histories[symbol].find(b=>b.date===date),{high:2500,low:.1,close:2000,volume:8000000});
 }
 const two=D.opening(f.data,f.policy,m,date);
 assert.deepEqual(two,before);
 for(const q of Object.values(two.quotes)){assert.equal(q.price,1);for(const key of ['high','low','close','volume'])assert.equal(q[key],undefined);}
});
test('isolated candidate replay completes an auditable buy hold sell cycle using HFQ thesis rather than raw-price trend',()=>{
 const D=load(),f=fixture(),before=structuredClone(f),r=D.runReplay({...f,kind:'decision_thesis',deadlineMs:Date.now()+60000});
 assert.equal(r.parityVerified,true);assert.equal(r.session.budget,50000);assert.equal(r.initialSession.budget,50000);
 assert.ok(fills(r,'buy').length>0,'positive completed HFQ trend should produce an explicit candidate buy');
 assert.ok(fills(r,'sell').length>0,'later completed HFQ trend failure should produce an explicit exit');
 assert.ok(plans(r).some(p=>p.rows.some(row=>row.intendedAction==='hold')),'ownership persists between entry and exit');
 assert.ok(plans(r).some(p=>p.rows.some(row=>row.intendedAction==='exit'&&row.reasons.includes('trend_invalid'))),'flat raw price must not hide HFQ thesis invalidation');
 assert.ok(r.events.some(e=>e.kind==='decision'));assert.ok(r.events.some(e=>e.kind==='step'));
 assert.ok(r.session.account.feesPaid>0);assert.equal(r.summary.feesPaid,r.session.account.feesPaid);
 assert.ok(Math.abs(r.summary.netPnl-(r.session.account.equity-50000))<1e-8);
 assert.deepEqual(f,before);
});
test('true fixed-three buy hold crosses original maturity and risk thresholds without exits or reentry',()=>{
 const D=load(),f=fixture();
 assert.ok(Calendar.nextSession(f.policy.start,20)<f.policy.end,'synthetic window must exceed twenty exchange sessions');
 const dropStart=Calendar.previousSession(f.policy.end,5);
 for(const symbol of SYMBOLS)for(const b of f.data.raw[symbol])if(b.date>=dropStart)Object.assign(b,{open:.7,high:.71,low:.69,close:.7});
 const r=D.runReplay({...f,kind:'true_buy_hold_three',deadlineMs:Date.now()+60000}),buys=fills(r,'buy');
 assert.equal(r.parityVerified,true);assert.equal(buys.length,3,'one initial buy per fixed ETF, never periodic reentry');
 assert.deepEqual(buys.map(o=>o.symbol).sort(),[...BUY_HOLD].sort());
 assert.equal(fills(r,'sell').length,0);
 assert.equal(r.session.account.feesPaid,15,'three minimum-commission buys cost 15 yuan');
 assert.ok(r.session.account.marketValue>0&&r.session.account.equity>r.session.account.cash,'ending positions remain valued separately from cash');
 assert.equal(new Set(buys.map(o=>o.decisionAt)).size,1);
 assert.equal(r.session.account.holdings.length,3);
 assert.ok(r.session.account.holdings.every(h=>h.shares>0&&h.exitPlan.riskExitEnabled===false&&h.exitPlan.maturityExitEnabled===false));
 assert.ok(r.session.account.holdings.every(h=>f.policy.end>h.maturitySession),'the actual lots remain beyond their original 20-day dates');
 assert.ok(r.session.account.equity<50000,'control losses remain visible, with no reset or forced close');
 assert.equal(r.session.budget,50000);
});

test('opening drawdown remains visible above the registered risk limit after closes recover',()=>{
 const D=load(),f=fixture();f.policy.end='2025-01-10';f.policy.signalEnd='2025-01-09';
 for(const bars of Object.values(f.data.raw))for(const b of bars)if(b.date>=f.policy.start){
  Object.assign(b,{open:b.date===f.policy.start?1:1.2,high:1.21,low:.99,close:1.2});if(b.date==='2025-01-08')b.open=1.08;
 }
 const r=D.runReplay({...f,kind:'decision_thesis',deadlineMs:Date.now()+30000});
 assert.ok(r.summary.netPnl>0,'a recovered profitable close cannot erase observed opening risk');
 assert.ok(r.summary.maxDrawdownAmount<500,'the daily-close metric alone misses the opening breach');
 assert.ok(Math.abs(r.summary.maximumOpenCloseObservedDrawdown-1241.52)<1e-6);
 assert.ok(r.summary.maximumOpenCloseObservedDrawdown>500);
 assert.ok(r.summary.maximumOpenCloseObservedDrawdownProportion>.01);
 assert.equal(r.summary.parityVerified,true);
});
