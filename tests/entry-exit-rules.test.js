'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Paper=require('../assets/paper-engine.js'),Calendar=require('../assets/trading-calendar.js');
const copy=x=>JSON.parse(JSON.stringify(x));
function fixture(extra={}){return {universe:[{symbol:'sh588000',name:'fixture ETF',type:'etf',theme:'tech'}],quotes:{sh588000:{price:1,open:1,sourceTime:'2026-10-20 09:30:00',receivedAt:'2026-10-20T01:30:00Z'}},predictions:{sh588000:{eligible:true,asOf:'2026-10-19',horizon:20,expectedReturn:.05}},model:{version:'frozen-fixture'},budget:10000,allocationMode:'full',now:'2026-10-20T01:30:00Z',corporateEvents:[],...extra};}
function tick(date,price,time='09:30:00'){const at=date+'T'+String(Number(time.slice(0,2))-8).padStart(2,'0')+time.slice(2)+'Z';return {at,quotes:price===null?{}:{sh588000:{price,open:1,sourceTime:date+' '+time,receivedAt:at}}};}
function step(s,t,context={}){return Paper.stepAuto(s,t.quotes,t.at,context);}
const sells=s=>s.orders.filter(o=>o.account==='model'&&o.side==='sell'&&o.status==='hypothetical_fill');

test('default accounts retain target exits while explicitly disabled accounts hold through target across restart',()=>{
 const legacy=Paper.startAuto(fixture()),research=Paper.startAuto(fixture({targetExitEnabled:false}));
 const rise=tick('2026-10-20',1.1,'09:31:00'),legacyPending=step(legacy,rise),held=step(research,rise);
 assert.equal(legacyPending.account.holdings[0].pendingExit.reason,'frozen_target');
 assert.equal(held.account.holdings[0].pendingExit,null);
 const next=tick('2026-10-21',1.1),restored=Paper.resume(copy(held));
 assert.equal(sells(step(legacyPending,next)).length,1);
 const stillHeld=step(restored,next,{targetExitEnabled:true,minEstimatedNetReturn:0});
 assert.equal(sells(stillHeld).length,0);assert.equal(stillHeld.rules.targetExitEnabled,false);
 assert.equal(stillHeld.account.holdings[0].exitPlan.targetExitEnabled,false);
 assert.notEqual(legacy.fingerprint.rules_hash,research.fingerprint.rules_hash);
});

test('disabling target exit retains risk intent, T+1 and rejection retry without fictional cash',()=>{
 const initial=Paper.startAuto(fixture({targetExitEnabled:false})),same=step(initial,tick('2026-10-20',.9,'09:31:00'));
 assert.equal(sells(same).length,0);assert.equal(same.account.holdings[0].pendingExit.reason,'risk_stop');
 const blocked=tick('2026-10-21',.9);blocked.quotes.sh588000.sellLimitBlocked=true;
 const refusal=step(same,blocked);assert.equal(sells(refusal).length,0);assert.equal(refusal.account.cash,initial.account.cash);
 assert.equal(refusal.account.holdings.length,1);
 const exit=step(refusal,tick('2026-10-21',.91,'09:31:00'));
 assert.equal(sells(exit).length,1);assert.equal(sells(exit)[0].reason,'risk_stop');
});

test('disabled target still expires after twenty exchange sessions; missing quote keeps position and intent',()=>{
 const initial=Paper.startAuto(fixture({targetExitEnabled:false})),maturity=initial.account.holdings[0].maturitySession;
 const held=step(initial,tick(Calendar.previousSession(maturity),1.1));assert.equal(sells(held).length,0);
 const missing=step(held,tick(maturity,null));assert.equal(missing.account.holdings.length,1);
 assert.equal(missing.account.holdings[0].pendingExit.reason,'maturity');assert.equal(missing.account.cash,held.account.cash);
 const final=step(missing,tick(maturity,1.1,'09:31:00'));assert.equal(sells(final).length,1);assert.equal(sells(final)[0].reason,'maturity');
});

test('one percent minimum uses actual lot size, both fees and adverse slippage instead of gross prediction',()=>{
 const i=fixture({minEstimatedNetReturn:.01});i.predictions.sh588000.expectedReturn=.012;
 const rejected=Paper.plan(i);assert.equal(rejected.selected.length,0);assert.equal(rejected.rows[0].reasonCode,'net_margin');
 assert.ok(rejected.rows[0].estimatedNetReturn>0&&rejected.rows[0].estimatedNetReturn<.01);
 const s=Paper.startAuto(i);assert.equal(s.account.holdings.length,0);assert.equal(s.account.cash,10000);assert.equal(s.horizonAccuracy,null);
 i.predictions.sh588000.expectedReturn=.014;const accepted=Paper.plan(i);assert.equal(accepted.selected.length,1);assert.ok(accepted.selected[0].estimatedNetReturn>=.01);
 const limited=fixture({allocationMode:'capped',positionLimit:500,maxPositions:1,minEstimatedNetReturn:.01});limited.predictions.sh588000.expectedReturn=.03;
 assert.equal(Paper.plan(limited).selected.length,0);
 assert.equal(Paper.plan({...limited,positionLimit:10000}).selected.length,1);
});

test('entry margin and target choice stay frozen for later entries and change account identity',()=>{
 const i=fixture({targetExitEnabled:false,minEstimatedNetReturn:.01});i.predictions.sh588000.expectedReturn=.012;
 const s=Paper.startAuto(i);assert.equal(s.rules.minEstimatedNetReturn,.01);assert.equal(s.account.holdings.length,0);
 const next=tick('2026-10-21',1),p={sh588000:{eligible:true,asOf:'2026-10-20',horizon:20,expectedReturn:.012}};
 const later=step(s,next,{predictions:p,minEstimatedNetReturn:0});assert.equal(later.account.holdings.length,0);
 assert.notEqual(s.fingerprint.rules_hash,Paper.startAuto(fixture({targetExitEnabled:false})).fingerprint.rules_hash);
});

test('invalid research rule inputs fail instead of silently changing risk rules',()=>{
 for(const value of [null,'false',0,1])assert.throws(()=>Paper.startAuto(fixture({targetExitEnabled:value})),/target exit/i);
 for(const value of [null,'0.01',-.01,NaN,Infinity,1.01]){assert.throws(()=>Paper.startAuto(fixture({minEstimatedNetReturn:value})),/net return/i);assert.throws(()=>Paper.plan(fixture({minEstimatedNetReturn:value})),/net return/i);}
});

test('new rules preserve incremental versus public bulk replay trades, accounting and full state hash',()=>{
 const i=fixture({targetExitEnabled:false,minEstimatedNetReturn:.01}),initial=Paper.startAuto(i),events=[tick('2026-10-20',1.1,'09:31:00'),tick('2026-10-21',1.1),tick('2026-10-22',.9)];
 let incremental=initial;for(const e of events)incremental=step(incremental,e);
 const replay=Paper.replay(initial,events);assert.equal(replay.integrityHash,incremental.integrityHash);assert.deepEqual(replay.orders,incremental.orders);
 assert.equal(replay.budget,10000);assert.ok(Math.abs(replay.account.cash+replay.account.marketValue+replay.account.receivableValue-replay.account.equity)<1e-7);
});
