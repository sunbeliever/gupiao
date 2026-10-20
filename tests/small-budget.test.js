'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Paper=require('../assets/paper-engine.js');
const now='2026-10-19T05:50:00Z';
const universe=[{symbol:'sz300502',name:'Restricted',type:'stock'},{symbol:'sh600703',name:'Stock',type:'stock'},{symbol:'sh588000',name:'ETF',type:'etf'},{symbol:'sh512760',name:'ETF2',type:'etf'}];
const quotes=Object.fromEntries(universe.map(u=>{const price=u.type==='etf'?1.4:u.symbol==='sh600703'?9.7:300;return[u.symbol,{price,open:price,sourceTime:'2026-10-19 13:50:00'}];}));
const predictions=Object.fromEntries(universe.map(u=>[u.symbol,{eligible:true,expectedReturn:.06,asOf:'2026-10-16'}]));
const input=extra=>({universe,quotes,predictions,now,budget:10000,positionLimit:500,profile:'beginner',model:{version:'frozen-test'},...extra});
test('small cash policy selects affordable model forecasts and preserves unused cash',()=>{
 const p=Paper.plan(input());assert.deepEqual(p.selected.map(x=>x.symbol),['sh512760','sh588000']);
 assert.equal(p.rows.find(x=>x.symbol==='sh600703').reasonCode,'minimum_lot');
 assert.equal(p.rows.find(x=>x.symbol==='sz300502').reasonCode,'permission');
 const s=Paper.start(input());assert.equal(s.selection,'beginner_model_experiment');assert.equal(s.budget,10000);
 assert.ok(s.account.cash>=9000);assert.equal(s.account.holdings.length,2);
 for(const h of s.account.holdings)assert.ok(h.shares*h.entryPrice+h.entryFee<=500);
 assert.deepEqual(s.selectionPlan.selected.map(x=>x.symbol),s.account.holdings.map(x=>x.symbol));
 assert.equal(s.model.version,'frozen-test');
});
test('costly or negative forecasts leave the entire small account in cash',()=>{
 const low=Object.fromEntries(universe.map(u=>[u.symbol,{eligible:true,expectedReturn:.01,asOf:'2026-10-16'}]));
 const s=Paper.start(input({predictions:low}));assert.equal(s.account.cash,10000);assert.equal(s.account.equity,10000);assert.equal(s.account.holdings.length,0);
 assert.equal(s.selectionPlan.rows.find(x=>x.symbol==='sh588000').reasonCode,'cost');
 assert.equal(s.horizonAccuracy,null);
});
test('small policy uses the entered commission assumption and rejects invalid settings',()=>{
 const low=Object.fromEntries(universe.map(u=>[u.symbol,{eligible:true,expectedReturn:.01,asOf:'2026-10-16'}]));
 assert.equal(Paper.plan(input({predictions:low,minFee:0})).selected.length,2);
 for(const bad of [{positionLimit:Infinity},{positionLimit:20000},{minFee:-1},{maxPositions:4}])assert.throws(()=>Paper.plan(input(bad)),/Invalid/);
 const stale=structuredClone(quotes);stale.sh588000.sourceTime='2026-10-16 15:00:00';
 assert.equal(Paper.plan(input({quotes:stale})).rows.find(x=>x.symbol==='sh588000').reasonCode,'quote');
});
test('a beginner caller without an explicit capital uses the same ten-thousand budget as its plan',()=>{
 const i=input();delete i.budget;assert.equal(Paper.plan(i).budget,10000);assert.equal(Paper.start(i).budget,10000);
});
test('beginner entry rejects incomplete quotes instead of freezing a data-failure cash account',()=>{
 const missing=structuredClone(quotes);delete missing.sh512760;assert.throws(()=>Paper.start(input({quotes:missing})),/fresh/);
});
test('cost comparison translates the signal-next-open estimate to the actual intraday entry price',()=>{
 const rising=structuredClone(quotes);rising.sh588000.price=1.7;
 const p=Paper.plan(input({quotes:rising,minFee:0}));
 const r=p.rows.find(r=>r.symbol==='sh588000');assert.equal(r.reasonCode,'cost');
 assert.equal(r.referenceEntryOpen,1.4);assert.ok(r.estimatedNetReturn<0);
 const missing=structuredClone(quotes);delete missing.sh588000.open;
 assert.equal(Paper.plan(input({quotes:missing})).rows.find(r=>r.symbol==='sh588000').reasonCode,'reference_open');
 const future=structuredClone(predictions);future.sh588000.asOf='2026-10-19';
 assert.equal(Paper.plan(input({predictions:future})).rows.find(r=>r.symbol==='sh588000').reasonCode,'forecast_date');
});
