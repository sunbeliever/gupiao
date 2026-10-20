'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Paper=require('../assets/paper-engine.js');
const startAt='2026-10-20T01:30:00Z';
function fixture(count=1,extra={}){
 const universe=[{symbol:'sh588000',name:'fixture broad ETF',type:'etf',sector:'broad'},{symbol:'sh512760',name:'fixture chip ETF',type:'etf',sector:'chips'}].slice(0,count);
 return {universe,quotes:quotes(universe,startAt),predictions:Object.fromEntries(universe.map(u=>[u.symbol,{eligible:true,asOf:'2026-10-19',horizon:20,expectedReturn:.5,publishedAt:'2026-10-20T01:29:00Z'}])),model:{version:'frozen-fixture'},budget:10000,allocationMode:'full',now:startAt,corporateEvents:[],...extra};
}
function quotes(universe,at,price=1,sourceAt=at){return Object.fromEntries(universe.map(u=>[u.symbol,{price,open:1,sourceTime:new Date(Date.parse(sourceAt)+8*3600000).toISOString().slice(0,19).replace('T',' '),receivedAt:at}]));}
function closeEnough(a,b){assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);}

test('cash ex-dividend changes price thresholds without creating an economic risk-stop or duplicate entitlement',()=>{
 const event={id:'fixture-cash-dividend',symbol:'sh588000',type:'cash',recordDate:'2026-10-20',exDate:'2026-10-21',payDate:'2026-10-22',cashPerShare:.1,source:'artificial regression fixture'};
 const i=fixture(1,{corporateEvents:[event]}),initial=Paper.startAuto(i),at='2026-10-21T01:30:00Z',ex=Paper.stepAuto(initial,quotes(i.universe,at,.9),at);
 assert.equal(ex.account.holdings.length,1,'an offsetting cash dividend is not an 8% economic loss');
 assert.equal(ex.orders.filter(o=>o.account==='model'&&o.side==='sell').length,0);
 closeEnough(ex.account.equity,initial.account.equity);closeEnough(ex.account.receivableValue,initial.account.holdings[0].shares*.1);
 const againAt='2026-10-21T01:30:30Z',again=Paper.stepAuto(Paper.resume(JSON.parse(JSON.stringify(ex))),quotes(i.universe,againAt,.9),againAt);
 assert.equal(again.account.receivables.length,1);closeEnough(again.account.receivableValue,ex.account.receivableValue);
 const paidAt='2026-10-22T01:30:00Z',paid=Paper.stepAuto(again,quotes(i.universe,paidAt,.9),paidAt);
 closeEnough(paid.account.cash,initial.account.cash+initial.account.holdings[0].shares*.1);assert.equal(paid.account.receivables.length,0);closeEnough(paid.account.equity,initial.account.equity);
});

test('maturity with no quote records an unfilled exit, retains risk and later closes once after restart',()=>{
 const i=fixture(),initial=Paper.startAuto(i),date=initial.account.holdings[0].maturitySession,at=date+'T01:30:00Z',expired=Paper.stepAuto(initial,{},at);
 assert.equal(expired.account.holdings.length,1);assert.equal(expired.account.holdings[0].pendingExit?.reason,'maturity');
 assert.ok(expired.ledger.some(e=>e.type==='exit_intent'&&e.account==='model'&&e.reason==='maturity'));
 assert.ok(expired.ledger.some(e=>e.account==='model'&&(e.type==='exit_blocked'&&e.reason==='quote_unavailable'||e.type==='order_rejected'&&e.order?.rejectionReason==='quote_unavailable')),'missing quotes must explain the unfilled planned exit');
 closeEnough(expired.account.cash,initial.account.cash);
 const restored=Paper.resume(JSON.parse(JSON.stringify(expired))),nextAt=date+'T01:31:00Z',closed=Paper.stepAuto(restored,quotes(i.universe,nextAt),nextAt);
 assert.equal(closed.account.holdings.length,0);assert.equal(closed.closedPositions.filter(x=>x.account==='model').length,1);
 const laterAt=date+'T01:31:30Z',duplicate=Paper.stepAuto(closed,quotes(i.universe,laterAt),laterAt);
 assert.equal(duplicate.orders.filter(o=>o.account==='model'&&o.side==='sell'&&o.status==='hypothetical_fill').length,1);closeEnough(duplicate.account.cash,closed.account.cash);
});

test('reversed quote source cannot trigger a risk exit or sell despite a fresh receipt timestamp',()=>{
 const i=fixture(),initial=Paper.startAuto(i),firstAt='2026-10-21T01:31:00Z',marked=Paper.stepAuto(initial,quotes(i.universe,firstAt,1.02),firstAt),nextAt='2026-10-21T01:31:30Z';
 const reversed=Paper.stepAuto(marked,quotes(i.universe,nextAt,.9,'2026-10-21T01:30:30Z'),nextAt);
 assert.equal(reversed.account.holdings.length,1);assert.equal(reversed.account.holdings[0].lastSourceTime,'2026-10-21 09:31:00');closeEnough(reversed.account.holdings[0].lastPrice,1.02);
 assert.equal(reversed.orders.filter(o=>o.account==='model'&&o.side==='sell'&&o.status==='hypothetical_fill').length,0);
 assert.equal(reversed.account.holdings[0].pendingExit,null,'an older rejected observation must not generate a new risk signal');
});

test('benchmark entry completeness stays frozen while present valuation completeness reports missing holdings separately',()=>{
 const i=fixture(2),initial=Paper.startAuto(i);
 assert.equal(initial.comparisons.hold_etf.entryComplete,true);assert.equal(initial.comparisons.hold_etf.valuationComplete,true);
 const at='2026-10-20T01:30:30Z',q=quotes(i.universe,at,1.05);delete q.sh588000;const next=Paper.stepAuto(initial,q,at);
 assert.equal(next.comparisons.hold_etf.entryComplete,true);assert.equal(next.comparisons.hold_etf.valuationComplete,false);
 assert.equal(next.comparisons.equal_weight.entryComplete,true);assert.equal(next.comparisons.equal_weight.valuationComplete,false);
 assert.equal(next.comparisons.cash.valuationComplete,true);assert.equal(next.comparisons.hold_etf.holdings[0].stale,true);
});

test('a signal published after decision time is rejected without relabeling it as available',()=>{
 const i=fixture();i.predictions.sh588000.publishedAt='2026-10-20T01:31:00Z';const p=Paper.plan(i);
 assert.equal(p.selected.length,0);assert.ok(p.rows[0].reasonCode);
});

test('an explicit frozen reference open cannot be replaced by a different current-session open',()=>{
 const i=fixture();i.predictions.sh588000.referenceOpen=1.1;const p=Paper.plan(i);
 assert.equal(p.selected.length,0);assert.equal(p.rows[0].reasonCode,'signal_reference');
});
