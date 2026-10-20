'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {summarize}=require('../scripts/paper-observation-summary.js');
test('lunch snapshot heartbeats do not become observed price changes',()=>{
 const status={session:{budget:100000,account:{equity:99000,holdings:[{symbol:'A'}]},benchmark:{equity:99500}}};
 const ticks=[{observedAt:'11:29',quotes:{A:{price:10,sourceTime:'11:29'}}},{observedAt:'11:30',quotes:{A:{price:11,sourceTime:'11:30'}}},{observedAt:'11:31',quotes:{A:{price:11,sourceTime:'11:31'}}},{observedAt:'11:32',quotes:{A:{price:11,sourceTime:'11:32',cached:true}}},{observedAt:'11:33',error:'offline'}];
 const r=summarize(status,ticks);assert.equal(r.priceChangedTicks,1);assert.equal(r.lastObservedPriceChangeAt,'11:30');assert.equal(r.quoteResponseTicks,4);assert.equal(r.cachedResponseTicks,1);assert.equal(r.exceptionTicks,1);assert.equal(r.distinctHoldingPriceSnapshots,2);
});
