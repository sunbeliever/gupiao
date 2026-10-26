'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Paper=require('../assets/paper-engine.js'),Calendar=require('../assets/trading-calendar.js'),Audit=require('../assets/audit-identity.js');
const ids=['sh512720','sh512760','sh515070','sh515880','sh588000','sz159852'],policyHash='a'.repeat(64);
function input(day){const now=day+'T02:00:00Z',date=Calendar.expectedCompletedSession(now),quotes=Object.fromEntries(ids.map(symbol=>[symbol,{price:1,open:1,sourceTime:now,receivedAt:now}])),dataHealth={ok:true,expectedAsOf:date,rows:ids.map(symbol=>({symbol,dataAsOf:date,stale:false}))};return {now,quotes,dataHealth,predictions:Object.fromEntries(ids.map(symbol=>[symbol,{eligible:false,asOf:date}]))};}
function start(extra={}){const i=input('2026-10-26');return Paper.startAuto({...i,universe:ids.map(symbol=>({symbol,name:symbol,type:'etf'})),budget:50000,allocationMode:'full',riskLimits:{investableLimit:12500,maxExposure:.25,maxPositions:3,maxThemeWeight:1},model:{kind:'registered-decision-research-v1',candidateId:'trend-relative20-risk-v1',decisionPolicyHash:policyHash,horizon:20,...extra},stopLossRate:.04,targetExitEnabled:false,historicalReplay:true,corporateEvents:[]});}
function decision(s,i,buyShares,sellShares=0,action='candidate_buy'){return {policyHash,plan:{candidateId:s.model.candidateId,asOf:s.observedAt,researchOnly:true,executable:false,investmentReady:false,accountHash:Audit.hash(s.account),quotesHash:Audit.hash(i.quotes),dataHealth:i.dataHealth,rows:[{symbol:ids[0],buyShares,sellShares,intendedAction:action}]}};}
test('registered research API buys independently sealed lots and reduces only sellable FIFO costs',()=>{assert.equal(typeof Paper.applyResearchDecision,'function');let s=start(),i=input('2026-10-26');s=Paper.applyResearchDecision(s,i.quotes,i.now,decision(s,i,200));assert.equal(s.account.holdings.length,1);i=input('2026-10-27');s=Paper.stepAuto(s,i.quotes,i.now,i);s=Paper.applyResearchDecision(s,i.quotes,i.now,decision(s,i,200,0,'add'));assert.equal(s.account.holdings.length,2);assert.equal(s.account.holdings[1].maturitySession,s.account.holdings[0].maturitySession);i=input('2026-10-28');s=Paper.stepAuto(s,i.quotes,i.now,i);s=Paper.applyResearchDecision(s,i.quotes,i.now,decision(s,i,0,100,'reduce'));assert.equal(s.account.holdings[0].shares,100);assert.equal(s.account.holdings[0].entryFee,2.5);assert.equal(s.account.holdings[1].shares,200);assert.equal(Paper.resume(s).integrityHash,s.integrityHash);});
test('same day full exit sells old lots and retains new T plus one lots pending without resetting capital',()=>{let s=start(),i=input('2026-10-26');s=Paper.applyResearchDecision(s,i.quotes,i.now,decision(s,i,200));i=input('2026-10-27');s=Paper.stepAuto(s,i.quotes,i.now,i);const added=Paper.applyResearchDecision(s,i.quotes,i.now,decision(s,i,200,0,'add'));const later={...i,now:'2026-10-27T02:01:00Z',quotes:Object.fromEntries(ids.map(symbol=>[symbol,{price:1,open:1,sourceTime:'2026-10-27T02:01:00Z',receivedAt:'2026-10-27T02:01:00Z'}]))};s=Paper.stepAuto(added,later.quotes,later.now,later);s=Paper.applyResearchDecision(s,later.quotes,later.now,decision(s,later,0,400,'exit'));assert.equal(s.account.holdings.length,1);assert.equal(s.account.holdings[0].shares,200);assert.ok(s.account.holdings[0].pendingExit);assert.equal(s.budget,50000);});
test('research API rejects live policy time and corporate mismatches and replay matches full state hash',()=>{const s=start(),i=input('2026-10-26'),ctx=decision(s,i,200);for(const change of [c=>c.policyHash='b'.repeat(64),c=>c.plan.asOf='2026-10-23T02:00:00Z',c=>c.plan.executable=true]){const c=structuredClone(ctx);change(c);assert.throws(()=>Paper.applyResearchDecision(s,i.quotes,i.now,c));}const live=structuredClone(s);live.automation.mode='live';delete live.integrityHash;live.integrityHash=Audit.hash(live);assert.throws(()=>Paper.applyResearchDecision(live,i.quotes,i.now,ctx));const applied=Paper.applyResearchDecision(s,i.quotes,i.now,ctx),replayed=Paper.replayResearch(s,[{kind:'decision',quotes:i.quotes,at:i.now,context:ctx}]);assert.equal(replayed.integrityHash,applied.integrityHash);assert.deepEqual(replayed.orders,applied.orders);assert.equal(Paper.applyResearchDecision(applied,i.quotes,i.now,ctx).integrityHash,applied.integrityHash);});

function reviewTwoResearchLots(){let s=start(),i=input('2026-10-26');s=Paper.applyResearchDecision(s,i.quotes,i.now,decision(s,i,200));i=input('2026-10-27');s=Paper.stepAuto(s,i.quotes,i.now,i);return Paper.applyResearchDecision(s,i.quotes,i.now,decision(s,i,200,0,'add'));}

test('all research lots exit on one fresh observation for risk maturity and existing pending intents',()=>{
 for(const reason of ['risk_stop','maturity','pending']){
  let s=reviewTwoResearchLots(),i=input(reason==='maturity'?s.account.holdings[0].maturitySession:'2026-10-28');
  if(reason==='risk_stop')for(const q of Object.values(i.quotes)){q.price=.95;q.open=.95;}
  if(reason==='pending'){
   for(const q of Object.values(i.quotes))q.sellLimitBlocked=true;
   s=Paper.stepAuto(s,i.quotes,i.now,i);s=Paper.applyResearchDecision(s,i.quotes,i.now,decision(s,i,0,400,'exit'));
   assert.equal(s.account.holdings.length,2);assert.ok(s.account.holdings.every(h=>h.pendingExit));i=input('2026-10-29');
  }
  const before=s.orders.length;s=Paper.stepAuto(s,i.quotes,i.now,i);
  const sells=s.orders.slice(before).filter(o=>o.account==='model'&&o.side==='sell'&&o.status==='hypothetical_fill');
  assert.equal(sells.length,2,reason+' must not deduplicate another lot');assert.equal(sells.reduce((n,o)=>n+o.shares,0),400);assert.equal(s.account.holdings.length,0);
  const count=s.orders.length;s=Paper.stepAuto(s,i.quotes,i.now,i);assert.equal(s.orders.length,count,'same source observation cannot sell twice');assert.equal(Paper.resume(s).integrityHash,s.integrityHash);
 }
});

test('one declared symbol sale across two lots pays one minimum commission and allocates its full realized loss',()=>{
 let s=reviewTwoResearchLots(),i=input('2026-10-28');s=Paper.stepAuto(s,i.quotes,i.now,i);const before=s.orders.length,ctx=decision(s,i,0,400,'exit');
 s=Paper.applyResearchDecision(s,i.quotes,i.now,ctx);const sells=s.orders.slice(before).filter(o=>o.account==='model'&&o.side==='sell'),closed=s.closedPositions.filter(p=>p.account==='model');
 assert.equal(sells.length,1);assert.equal(sells[0].shares,400);assert.equal(sells[0].fees.total,5);assert.equal(s.account.feesPaid,15);assert.equal(closed.length,2);
 assert.ok(closed.every(p=>p.entryFee===5&&p.allocatedExitFee===2.5));assert.ok(Math.abs(sells[0].realizedPnl-(-15.8))<1e-8);assert.ok(Math.abs(closed.reduce((n,p)=>n+p.realizedPnl,0)-(-15.8))<1e-8);assert.ok(Math.abs(s.account.equity-(50000-15.8))<1e-8);
 assert.equal(Paper.applyResearchDecision(s,i.quotes,i.now,ctx).integrityHash,s.integrityHash);assert.throws(()=>Paper.applyResearchDecision(s,i.quotes,i.now,decision(s,i,100)),/one frozen research decision/i);
});

test('FIFO partial sale apportions entry and exit fees and later holding marks preserve the remaining contract',()=>{
 let s=reviewTwoResearchLots(),i=input('2026-10-28');s=Paper.stepAuto(s,i.quotes,i.now,i);const original=structuredClone(s.account.holdings[1]),before=s.orders.length;s=Paper.applyResearchDecision(s,i.quotes,i.now,decision(s,i,0,300,'reduce'));
 const sells=s.orders.slice(before).filter(o=>o.account==='model'&&o.side==='sell'),closed=s.closedPositions.filter(p=>p.account==='model');
 assert.equal(sells.length,1);assert.equal(sells[0].fees.total,5);assert.deepEqual(closed.map(p=>p.shares),[200,100]);assert.deepEqual(closed.map(p=>p.entryFee),[5,2.5]);assert.ok(Math.abs(closed[0].allocatedExitFee-10/3)<1e-10);assert.ok(Math.abs(closed[1].allocatedExitFee-5/3)<1e-10);assert.ok(Math.abs(sells[0].realizedPnl-(-13.1))<1e-8);
 assert.equal(s.account.holdings.length,1);let h=s.account.holdings[0];assert.equal(h.researchLotId,original.researchLotId);assert.equal(h.shares,100);assert.equal(h.entryFee,2.5);assert.equal(h.entryCosts.total,2.5);assert.deepEqual(h.exitPlan,original.exitPlan);assert.equal(h.sellableSession,original.sellableSession);
 i=input('2026-10-29');s=Paper.stepAuto(s,i.quotes,i.now,i);h=s.account.holdings[0];assert.equal(h.shares,100);assert.deepEqual(h.exitPlan,original.exitPlan);assert.ok(Number.isFinite(s.account.equity));assert.ok(!s.ledger.some(e=>e.type==='corporate_split'));assert.equal(Paper.resume(s).integrityHash,s.integrityHash);
});

test('same-session FIFO follows lot creation order when textual order IDs cross a decimal boundary',()=>{
 let s=start();for(let n=0;n<6;n++){
  const i=input('2026-10-26');i.now='2026-10-26T02:0'+n+':00Z';
  for(const q of Object.values(i.quotes)){q.price=1+n*.1;q.open=q.price;q.sourceTime=i.now;q.receivedAt=i.now;}
  if(n)s=Paper.stepAuto(s,i.quotes,i.now,i);s=Paper.applyResearchDecision(s,i.quotes,i.now,decision(s,i,100,0,n?'add':'candidate_buy'));
 }
 const lots=structuredClone(s.account.holdings),numbers=lots.map(h=>Number(h.researchLotId.split(':').at(-1)));
 assert.ok(Math.min(...numbers)<10&&Math.max(...numbers)>=10,'fixture must cross the one/two-digit order boundary');
 const i=input('2026-10-27');for(const q of Object.values(i.quotes)){q.price=2;q.open=2;}s=Paper.stepAuto(s,i.quotes,i.now,i);s=Paper.applyResearchDecision(s,i.quotes,i.now,decision(s,i,0,100,'reduce'));
 const first=s.closedPositions.find(h=>h.account==='model');assert.equal(first.researchLotId,lots[0].researchLotId);assert.equal(first.entrySourceTime,'2026-10-26T02:00:00Z');assert.equal(first.entryPrice,1.001);assert.ok(!s.account.holdings.some(h=>h.researchLotId===lots[0].researchLotId));
});
