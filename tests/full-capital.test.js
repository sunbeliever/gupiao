'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Paper=require('../assets/paper-engine.js');
function input(n=3){const universe=Array.from({length:n},(_,i)=>({symbol:i===0?'sh588000':'sh51276'+i,name:'ETF'+i,type:'etf'})),quotes=Object.fromEntries(universe.map(u=>[u.symbol,{price:1,open:1,sourceTime:'2026-10-20 09:30:00'}])),predictions=Object.fromEntries(universe.map(u=>[u.symbol,{eligible:true,expectedReturn:.03,asOf:'2026-10-19'}]));return {universe,quotes,predictions,now:'2026-10-20T01:30:00Z',profile:'beginner',budget:10000,positionLimit:10000,minFee:5,maxPositions:3,allocationMode:'full'};}
test('a full ten-thousand budget is divided among1,2or3 actual selections, with only lot/fee remainder',()=>{for(const n of [1,2,3]){const s=Paper.start(input(n));assert.equal(s.account.holdings.length,n);assert.ok(s.account.cash<n*101+20);assert.ok(s.account.holdings.reduce((v,h)=>v+h.shares*h.entryPrice,0)>9600);assert.equal(s.selectionPlan.allocationCount,n);}});
test('full mode still leaves cash when no forecast covers fees instead of forcing a trade',()=>{const i=input();for(const p of Object.values(i.predictions))p.expectedReturn=-.1;const s=Paper.start(i);assert.equal(s.account.cash,10000);assert.equal(s.account.holdings.length,0);});
test('automatic later entries retain full-allocation mode and the capital setting is frozen',()=>{const i=input(),s=Paper.startAuto(i);assert.equal(s.automation.settings.allocationMode,'full');assert.ok(s.account.cash<400);i.budget=50000;assert.equal(s.budget,10000);});

test('later full-capital entries divide only remaining cash across the unused slots',()=>{
 const i=input(3),stock=i.universe[2];stock.type='stock';stock.symbol='sh600000';
 i.quotes=Object.fromEntries(i.universe.map(u=>[u.symbol,{price:u===stock?60:1,open:u===stock?60:1,sourceTime:'2026-10-20 09:30:00'}]));
 i.predictions=Object.fromEntries(i.universe.map(u=>[u.symbol,{eligible:true,expectedReturn:u===stock?.03:.001,asOf:'2026-10-19'}]));
 const s=Paper.startAuto(i);assert.equal(s.account.holdings.length,1);assert.ok(s.account.cash>3900);
 const q=Object.fromEntries(i.universe.map(u=>[u.symbol,{...i.quotes[u.symbol],price:u===stock?60:.95,sourceTime:'2026-10-20 09:31:00'}]));
 const next=Paper.stepAuto(s,q,'2026-10-20T01:31:00Z');
 assert.equal(next.account.holdings.length,3);assert.ok(next.account.cash>=0&&next.account.cash<200);
 assert.equal(next.account.holdings.find(h=>h.symbol===stock.symbol).shares,100);assert.equal(next.automation.settings.budget,10000);
 assert.equal(next.automation.lastPlan.budget,s.account.cash);
});

test('residual allocation can use less than1000 without allowing a smaller initial account',()=>{
 const i=input(2);i.quotes.sh588000.price=93;i.quotes.sh588000.open=93;
 i.predictions[i.universe[1].symbol].expectedReturn=-.1;
 const s=Paper.startAuto(i);assert.ok(s.account.cash>600&&s.account.cash<1000);
 const symbol=i.universe[1].symbol;s.automation.predictions[symbol].expectedReturn=.001;
 const q=Object.fromEntries(i.universe.map(u=>[u.symbol,{...i.quotes[u.symbol],price:u.symbol===symbol?.95:93,sourceTime:'2026-10-20 09:31:00'}]));
 const next=Paper.stepAuto(s,q,'2026-10-20T01:31:00Z');assert.equal(next.account.holdings.length,2);assert.ok(next.account.cash>=0&&next.account.cash<101);
 assert.throws(()=>Paper.start({...input(1),budget:700}),/Invalid paper budget/);
});
