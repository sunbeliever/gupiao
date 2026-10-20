'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Paper=require('../assets/paper-engine.js'),Calendar=require('../assets/trading-calendar.js'),Audit=require('../assets/audit-identity.js');
const {input,quotes,tick,instant,corporateEvents,scenarios,samePaths}=require('../scripts/continuous-replay-check.js');
const copy=x=>JSON.parse(JSON.stringify(x));
const near=(a,b,eps=1e-7)=>assert.ok(Math.abs(a-b)<=eps,a+' != '+b);
const modelFills=(s,side)=>s.orders.filter(o=>o.account==='model'&&o.side===side&&o.status==='hypothetical_fill');
function accounting(s){
  for(const a of [s.account,...Object.values(s.comparisons)]){near(a.cash+a.holdings.reduce((v,h)=>v+h.shares*h.lastPrice,0)+a.receivables.reduce((v,r)=>v+r.amount,0),a.equity);near(a.realizedPnl+a.unrealizedPnl,a.equity-10000);assert.ok(a.cash>=-1e-8);}
  for(let j=0;j<s.ledger.length;j++){const event=copy(s.ledger[j]),eventHash=event.eventHash;delete event.eventHash;assert.equal(eventHash,Audit.hash(event));assert.equal(event.previousHash,j?s.ledger[j-1].eventHash:null);assert.equal(event.sequence,j+1);}
}

test('authoritative incremental API and Paper.replay produce identical orders, ledger and equity for every fixed input',()=>{
  const cases=scenarios();assert.equal(new Set(cases.map(spec=>spec.input.accountId)).size,cases.length,'independent fixtures must have distinct account IDs');
  for(const spec of cases){const r=samePaths(spec);assert.equal(r.incrementalEqualsReplay,true);assert.equal(r.finalHash,r.final.integrityHash);for(const s of [r.initial,...r.checkpoints])accounting(s);}
});

test('same-day target exit is T+1 blocked; next session completes exit without resetting capital',()=>{
  const i=input(),initial=Paper.startAuto(i),bought=initial.account.holdings.find(h=>h.symbol==='sh588000');
  const t=tick('2026-10-20','09:31:00',[1.6,1]);const sameDay=Paper.stepAuto(initial,t.quotes,t.at);
  assert.equal(modelFills(sameDay,'sell').length,0);assert.equal(sameDay.account.holdings[0].shares,bought.shares);
  assert.ok(sameDay.ledger.some(e=>e.type==='exit_blocked'&&e.reason==='t_plus_one'));
  const n=tick('2026-10-21','09:30:00',[1.55,1]),next=Paper.stepAuto(sameDay,n.quotes,n.at);
  assert.equal(modelFills(next,'sell').length,1);assert.equal(next.budget,10000);
  assert.ok(!next.account.holdings.some(h=>h.symbol===bought.symbol));
  assert.equal(next.accountId,initial.accountId);assert.equal(next.ledger.filter(e=>e.type==='account_created').length,1);accounting(next);
});

test('holiday is not a T+1 sell session and cannot fill orders; legal resumption remains October 8',()=>{
  const spec=scenarios().find(s=>s.name.startsWith('holiday')),r=samePaths(spec);
  assert.equal(r.initial.account.holdings[0].sellableSession,'2026-10-08');
  assert.equal(modelFills(r.checkpoints[1],'sell').length,0);
  assert.equal(modelFills(r.final,'sell')[0].decisionAt,instant('2026-10-08'));
  assert.equal(Paper.trading(Date.parse(instant('2026-10-01'))),false);
});

test('frozen twenty-session maturity retains position before expiry and exits on the actual maturity session',()=>{
  const spec=scenarios().find(s=>s.name==='twenty_session_maturity'),r=samePaths(spec);
  const maturity=Calendar.maturitySession('2026-10-20',20);
  assert.equal(r.initial.account.holdings[0].exitPlan.maturitySession,maturity);
  assert.equal(modelFills(r.checkpoints[0],'sell').length,0);
  assert.equal(modelFills(r.final,'sell').length,2);
  assert.ok(modelFills(r.final,'sell').every(o=>o.reason==='maturity'&&o.decisionAt===instant(maturity)));
});

test('limit-down exit refusal retains units and risk without fictional sale cash, then retries lawfully',()=>{
  const spec=scenarios().find(s=>s.name==='limit_down_unfilled_then_retry'),r=samePaths(spec),blocked=r.checkpoints[0];
  assert.equal(blocked.account.cash,r.initial.account.cash);assert.equal(modelFills(blocked,'sell').length,0);
  assert.equal(blocked.account.holdings.find(h=>h.symbol==='sh588000').shares,r.initial.account.holdings[0].shares);
  assert.ok(blocked.orders.some(o=>o.account==='model'&&o.side==='sell'&&o.status==='rejected'&&o.rejectionReason==='sell_limit_or_rejection'));
  assert.equal(modelFills(r.final,'sell').length,1);assert.ok(r.final.account.cash>blocked.account.cash);accounting(blocked);accounting(r.final);
});

test('partial research outage pauses new entries but valid holdings mark and missing holdings retain stale last price',()=>{
  const spec=scenarios().find(s=>s.name.startsWith('partial_outage')),r=samePaths(spec),bad=r.checkpoints[0];
  assert.equal(bad.entryHealth.ok,false);assert.equal(bad.account.holdings.find(h=>h.symbol==='sh588000').lastPrice,1.05);
  const stale=bad.account.holdings.find(h=>h.symbol==='sh512760');assert.equal(stale.lastPrice,1);assert.equal(stale.stale,true);
  assert.equal(modelFills(bad,'buy').length,modelFills(r.initial,'buy').length);accounting(bad);
});

test('restart and repeated observation preserve losses, hash chain, capital and no duplicate fills',()=>{
  const i=input(),initial=Paper.startAuto(i),t=tick('2026-10-20','09:31:00',[.98,.98]),loss=Paper.stepAuto(initial,t.quotes,t.at);
  assert.ok(loss.account.equity<10000);const restored=Paper.resume(copy(loss)),again=Paper.stepAuto(restored,t.quotes,t.at);
  assert.equal(again.integrityHash,loss.integrityHash);assert.deepEqual(again.orders,loss.orders);assert.deepEqual(again.ledger,loss.ledger);
  const newObservation=Paper.observe(again,{now:instant('2026-10-20','10:01:00')});
  assert.equal(newObservation.account.equity,loss.account.equity);assert.equal(newObservation.account.cash,loss.account.cash);
  assert.equal(newObservation.accountId,initial.accountId);assert.equal(newObservation.budget,10000);accounting(newObservation);
});

test('split and dividend events are applied once, preserve original entry and transfer receivable only on payment',()=>{
  const spec=scenarios().find(s=>s.name.startsWith('split_dividend')),r=samePaths(spec),old=r.initial.account.holdings.find(h=>h.symbol==='sh588000'),split=r.checkpoints[0],ex=r.checkpoints[1];
  const h=split.account.holdings.find(h=>h.symbol==='sh588000');
  assert.equal(h.shares,old.shares*2);near(h.entryPrice,old.entryPrice/2);assert.equal(h.originalEntryPrice,old.entryPrice);
  near(h.exitPlan.targetPrice,old.exitPlan.targetPrice/2);
  near(split.account.equity,r.initial.account.equity);near(ex.account.equity,split.account.equity);
  const due=old.shares*2*.02;near(ex.account.receivableValue,due);near(ex.account.cash,r.initial.account.cash);
  assert.equal(ex.account.receivables.length,1);near(r.checkpoints[2].account.receivableValue,due);
  near(r.final.account.receivableValue,0);near(r.final.account.cash,r.initial.account.cash+due);
  assert.equal(r.final.account.holdings.find(h=>h.symbol==='sh588000').appliedCorporateActions.length,2);
  assert.equal(r.final.ledger.filter(e=>e.type==='corporate_split'&&e.account==='model').length,1);accounting(r.final);
});

test('dividend receivable survives sale and pays exactly once into the same account',()=>{
  const spec=scenarios().find(s=>s.name==='dividend_remains_due_after_sale'),r=samePaths(spec),sold=r.checkpoints[2],final=r.final,due=r.initial.account.holdings[0].shares*2*.02;
  assert.ok(!sold.account.holdings.some(h=>h.symbol==='sh588000'));near(sold.account.receivableValue,due);
  near(final.account.cash,sold.account.cash+due);near(final.account.receivableValue,0);
  assert.equal(final.ledger.filter(e=>e.type==='dividend_paid'&&e.account==='model').length,1);accounting(final);
});

test('cash, predefined ETF hold and equal weight start at the same 10000 and retain different exposure explicitly',()=>{
  const s=Paper.startAuto(input());assert.equal(s.budget,10000);assert.equal(s.comparisons.cash.cash,10000);
  assert.equal(s.comparisons.cash.equity,10000);assert.equal(s.comparisons.hold_etf.holdings.length,1);assert.equal(s.comparisons.equal_weight.holdings.length,2);
  for(const [name,a] of Object.entries(s.comparisons)){assert.ok(a.marketValue/10000>=0&&a.marketValue/10000<=1);assert.equal(a.cash+a.marketValue+a.slippageCost+a.feesPaid,10000,name);}
  for(const o of s.orders.filter(o=>o.status==='hypothetical_fill'))assert.equal(o.fees.commission,Math.max(o.notional*s.feeProfile.commissionRate,5));
  assert.equal(s.fingerprint.fee_profile.minFee,5);accounting(s);
});

test('investable capital, equity exposure, position count and theme cap remain separate frozen limits',()=>{
  const spec=scenarios().find(s=>s.name==='exposure_theme_and_investable_constraints'),r=samePaths(spec),s=r.final;
  assert.equal(s.budget,10000);assert.equal(s.riskLimits.investableLimit,4000);
  assert.ok(s.account.marketValue<=s.riskLimits.investableLimit);assert.ok(s.account.marketValue<=s.riskLimits.maxExposure*s.account.equity+1e-8);
  assert.ok(s.account.holdings.length<=2);assert.ok(s.account.marketValue<=s.riskLimits.maxThemeWeight*s.account.equity+1e-8);
  assert.ok(s.ledger.some(e=>e.type==='order_rejected'&&e.reason==='theme_limit'));
  assert.throws(()=>Paper.startAuto(input('2026-10-20',{riskLimits:{investableLimit:10001}})),/risk limits/);accounting(s);
});

test('new engineering observation measures its own clock while preserving the same funded account',()=>{
  const initial=Paper.startAuto(input()),lossTick=tick('2026-10-20','10:00:00',[.98,.98]);
  const held=Paper.stepAuto(initial,lossTick.quotes,lossTick.at),opened=Paper.observe(held,{now:instant('2026-10-20','10:01:00')});
  const t=tick('2026-10-20','10:01:30',[.98,.98]),next=Paper.stepAuto(opened,t.quotes,t.at);
  assert.equal(next.automation.elapsedMs,30000);assert.equal(next.accountId,held.accountId);
  assert.equal(next.account.equity,held.account.equity);assert.equal(next.startedAt,initial.startedAt);
});

test('a quote received after the decision is unavailable and cannot replace a valid holding mark',()=>{
  const initial=Paper.startAuto(input()),t=tick('2026-10-20','09:31:00',[1.2,1],{sh588000:{receivedAt:instant('2026-10-20','09:32:00')}});
  const next=Paper.stepAuto(initial,t.quotes,t.at),h=next.account.holdings.find(h=>h.symbol==='sh588000');
  assert.equal(h.lastPrice,1);assert.equal(h.stale,true);assert.equal(next.entryHealth.ok,false);
});

test('explicit history health cannot label a common stale dataAsOf as the expected completed session',()=>{
  const s=Paper.startAuto(input('2026-10-20',{dataHealth:{ok:true,expectedAsOf:'2026-10-19',dataAsOf:'2026-10-16'}}));
  assert.equal(s.entryHealth.ok,false);assert.equal(modelFills(s,'buy').length,0);
});

test('the frozen input fingerprint binds the explicit corporate-action ledger that changes future accounting',()=>{
  const plain=Paper.startAuto(input()),withActions=Paper.startAuto(input('2026-10-20',{corporateEvents:corporateEvents()}));
  assert.notEqual(plain.fingerprint.data_hash,withActions.fingerprint.data_hash);
  assert.equal(plain.fingerprint.model_hash,withActions.fingerprint.model_hash);
});
