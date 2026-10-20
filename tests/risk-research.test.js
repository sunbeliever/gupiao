'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Research=require('../scripts/risk-policy-research.js');
test('risk allocations use only prefix indicators and enforce exposure caps',()=>{
 const universe=Array.from({length:4},(_,i)=>({symbol:'S'+i,type:'stock'})),pred=Object.fromEntries(universe.map((u,i)=>[u.symbol,{eligible:true,expectedReturn:.1-i*.01}]));
 const ind=Object.fromEntries(universe.map(u=>[u.symbol,{ma20:11,ma60:10,rsi:60,drawdown:.1,volatility:.3,momentum20:.1,momentum60:.2}]));
 const allocation=Research.allocate('stock-risk',universe,pred,ind);assert.equal(allocation.length,3);assert.ok(allocation.every(p=>p.weight<=.2));assert.ok(allocation.reduce((s,p)=>s+p.weight,0)<=.600000001);
 for(const i of Object.values(ind))i.ma20=9;assert.deepEqual(Research.allocate('stock-risk',universe,pred,ind),[]);
});
test('ETF policy is a separate trend rule and does not pretend to be a learned probability',()=>{
 const u=[{symbol:'E1',type:'etf'},{symbol:'E2',type:'etf'},{symbol:'E3',type:'etf'}],ind=Object.fromEntries(u.map(x=>[x.symbol,{ma20:11,ma60:10,rsi:60,drawdown:.1,volatility:.3,momentum20:.1,momentum60:.2}]));
 const a=Research.allocate('etf-risk',u,{},ind);assert.equal(a.length,2);assert.equal(a.reduce((s,p)=>s+p.weight,0),.5);assert.ok(a.every(p=>p.probability===undefined));
});
