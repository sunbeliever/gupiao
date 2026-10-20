'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Paper=require('../assets/paper-engine.js');
const universe=[{symbol:'sh588000',name:'科创ETF',type:'etf'},{symbol:'sh512760',name:'芯片ETF',type:'etf'},{symbol:'sh600703',name:'股票',type:'stock'}];
const at='2026-10-20T01:30:00Z';
function quotes(time='09:30:00',prices={}){return Object.fromEntries(universe.map(u=>[u.symbol,{price:prices[u.symbol]??(u.type==='stock'?9:1),open:u.type==='stock'?9:1,sourceTime:'2026-10-20 '+time}]));}
function input(extra={}){return {universe,quotes:quotes(),predictions:Object.fromEntries(universe.map(u=>[u.symbol,{eligible:true,expectedReturn:.06,asOf:'2026-10-19'}])),model:{version:'frozen'},budget:10000,positionLimit:500,minFee:5,maxPositions:3,now:at,...extra};}
test('automatic paper decisions use the same small selector and freeze their input/model',()=>{
 const i=input(),s=Paper.startAuto(i);assert.equal(s.automation.durationMs,1800000);assert.equal(s.automation.done,false);
 assert.deepEqual(s.account.holdings.map(h=>h.symbol),Paper.plan({...i,includeStockTaxes:true}).selected.map(r=>r.symbol));
 assert.equal(s.automation.events.filter(e=>e.action==='buy').length,2);
 i.predictions.sh588000.expectedReturn=999;assert.equal(s.automation.predictions.sh588000.expectedReturn,.06);
 assert.throws(()=>Paper.startAuto(input({symbols:['sh588000']})),/manual/);
 assert.throws(()=>Paper.startAuto(input({now:'2026-10-20T03:15:00Z',quotes:quotes('11:15:00')})),/continuous/);
});
test('later software buys use fresh prices and frozen forecasts without increasing the position cap',()=>{
 const predictions=Object.fromEntries(universe.map(u=>[u.symbol,{eligible:true,expectedReturn:.01,asOf:'2026-10-19'}]));
 const s=Paper.startAuto(input({predictions}));assert.equal(s.account.holdings.length,0);
 const q=quotes('09:31:00',{sh588000:.95,sh512760:.95});
 const next=Paper.stepAuto(s,q,'2026-10-20T01:31:00Z');assert.equal(next.account.holdings.length,2);
 assert.ok(next.account.holdings.every(h=>h.shares*h.entryPrice+h.entryFee<=500));assert.ok(next.account.cash>=8500);
 const twice=Paper.stepAuto(next,q,'2026-10-20T01:31:30Z');assert.equal(twice.automation.events.filter(e=>e.action==='buy').length,2);
 assert.equal(s.account.holdings.length,0);
});
test('software exit signals are recorded but same-day shares cannot be sold',()=>{
 const s=Paper.startAuto(input()),next=Paper.stepAuto(s,quotes('09:31:00',{sh588000:1.08}),'2026-10-20T01:31:00Z');
 assert.equal(next.account.holdings.length,2);assert.equal(next.realizedPnl,0);
 assert.ok(next.automation.events.some(e=>e.symbol==='sh588000'&&e.action==='exit_blocked'&&e.reason==='t_plus_one'));
 assert.equal(next.account.cash,s.account.cash);
});
test('a permitted exit books adverse execution, all declared fees and realized profit exactly once',()=>{
 const s=Paper.startAuto(input());s.account.holdings[0].entrySourceTime='2026-10-19 14:00:00';
 const symbol=s.account.holdings[0].symbol,q=quotes('09:31:00',{[symbol]:1.08});
 const next=Paper.stepAuto(s,q,'2026-10-20T01:31:00Z'),sale=next.automation.events.find(e=>e.action==='sell');
 assert.equal(sale.symbol,symbol);assert.equal(next.account.holdings.length,1);assert.ok(sale.price<q[symbol].price);assert.ok(sale.fee>=5);
 assert.ok(Math.abs(next.realizedPnl-sale.realizedPnl)<1e-8);
 const twice=Paper.stepAuto(next,quotes('09:32:00',{[symbol]:.9}),'2026-10-20T01:32:00Z');
 assert.equal(twice.account.holdings.some(h=>h.symbol===symbol),false);assert.equal(twice.automation.events.filter(e=>e.action==='sell').length,1);
});
test('missing, cached and reversed-time quotes never create trades or a successful cash observation',()=>{
 const predictions=Object.fromEntries(universe.map(u=>[u.symbol,{eligible:true,expectedReturn:.01,asOf:'2026-10-19'}]));
 const s=Paper.startAuto(input({predictions})),q=quotes('09:31:00',{sh588000:.9});q.sh512760.cached=true;
 const next=Paper.stepAuto(s,q,'2026-10-20T01:31:00Z');assert.equal(next.account.holdings.length,0);assert.equal(next.automation.dataFailureTicks,1);
 assert.throws(()=>Paper.stepAuto(next,quotes(),'2026-10-20T01:30:30Z'),/clock/);
});
test('after thirty minutes no new orders or forced sales are invented and late resumption is incomplete',()=>{
 const s=Paper.startAuto(input());let end=s;for(let t=30;t<=1800;t+=30){const iso=new Date(Date.parse(at)+t*1000).toISOString(),cn=new Date(Date.parse(iso)+8*3600000).toISOString().slice(11,19);end=Paper.stepAuto(end,quotes(cn),iso);}
 assert.equal(end.automation.done,true);assert.equal(end.automation.elapsedMs,1800000);assert.equal(end.horizonAccuracy,null);assert.equal(end.realizedPnl,0);
 assert.equal(end.automation.events.filter(e=>e.action==='sell').length,0);
 const later=Paper.stepAuto(end,quotes('10:01:00',{sh588000:5}),'2026-10-20T02:01:00Z');assert.deepEqual(later,end);
 const late=Paper.stepAuto(s,quotes('10:10:00'),'2026-10-20T02:10:00Z');assert.equal(late.automation.done,false);assert.equal(late.automation.windowEnded,true);
 assert.ok(late.automation.failureReason.includes('gap'));
});
test('stock taxes apply only to the new declared full-cost policy, never rewrite old observations',()=>{
 const i=input({positionLimit:2000}),legacy=Paper.start({...i,profile:'beginner'}),auto=Paper.startAuto(i);
 const h=auto.account.holdings.find(h=>h.symbol==='sh600703'),old=legacy.account.holdings.find(h=>h.symbol==='sh600703');
 assert.ok(h.entryFee>old.entryFee);h.entrySourceTime='2026-10-19 14:00:00';
 const sale=Paper.stepAuto(auto,quotes('09:31:00',{sh600703:10}),'2026-10-20T01:31:00Z').automation.events.find(e=>e.symbol==='sh600703'&&e.action==='sell');
 assert.ok(sale.tax>0);assert.ok(sale.transferFee>0);
});
test('a half-hour run ending at lunch or market close permits final valuation but no new order',()=>{
 for(const hour of ['11:00:00','14:30:00']){
  const start='2026-10-20T'+hour+'+08:00';let s=Paper.startAuto(input({now:start,quotes:quotes(hour)}));
  for(let t=30;t<=1800;t+=30){const ms=Date.parse(start)+t*1000,iso=new Date(ms).toISOString(),cn=new Date(ms+8*3600000).toISOString().slice(11,19);s=Paper.stepAuto(s,quotes(cn),iso);}
  assert.equal(s.automation.done,true);assert.equal(s.automation.dataFailureTicks,0);
 }
});
