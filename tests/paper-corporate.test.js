'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Paper=require('../assets/paper-engine.js');
function session(){return {startedAt:'2026-07-02T01:30:00Z',account:{cash:900,holdings:[{symbol:'sh515880',shares:100,entryPrice:1,entryFee:5,entrySourceTime:'2026-07-02 09:30:00',lastPrice:1,lastSourceTime:'2026-07-03 15:00:00'}]},benchmark:{cash:1000,holdings:[]},curve:[],realizedPnl:0};}
test('desktop paper marking applies known splits once, preserves original buy price and does not mark stale prices',()=>{
 const s=session(),fixed=Paper.mark(s,{sh515880:{price:.5,sourceTime:'2026-07-06 09:31:00'}},'2026-07-06T01:31:00Z');
 assert.equal(fixed.account.equity,1000);assert.equal(fixed.account.holdings[0].shares,200);assert.equal(fixed.account.holdings[0].originalEntryPrice,1);assert.equal(fixed.account.holdings[0].entryPrice,.5);assert.equal(s.account.holdings[0].shares,100);
 const again=Paper.mark(fixed,{sh515880:{price:.5,sourceTime:'2026-07-06 09:32:00'}},'2026-07-06T01:32:00Z');assert.equal(again.account.holdings[0].shares,200);
 const stale=Paper.mark(s,{sh515880:{price:1,sourceTime:'2026-07-03 15:00:00'}},'2026-07-06T01:31:00Z');assert.equal(stale.account.holdings[0].shares,100);
});
