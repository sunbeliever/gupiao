'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Guidance=require('../assets/trade-guidance.js'),Fee=require('../assets/fee-profile.js');
const now='2026-10-20T02:00:00Z',u={symbol:'sh588000',name:'科创50ETF',type:'etf'};
const q={price:1.4,open:1.4,sourceTime:'2026-10-20 10:00:00',receivedAt:now};
const input=extra=>({now,universe:[u],quotes:{[u.symbol]:q},predictions:{[u.symbol]:{asOf:'2026-10-19',eligible:true,expectedReturn:.1}},dataHealth:{ok:true,expectedAsOf:'2026-10-19'},...extra});
test('after-close snapshots produce observation only and never executable entries',()=>{
 const r=Guidance.build(input({now:'2026-10-20T08:05:00Z'}));assert.equal(r.action,'wait_session');assert.equal(r.entries.length,0);assert.equal(r.investmentReady,false);assert.equal(r.verifiedProfitProbability,null);
});
test('fresh data produces a costed ETF simulation plan within the shared capital cap',()=>{
 const r=Guidance.build(input());assert.equal(r.action,'simulation_candidate');assert.ok(r.entries.length>0);
 const row=r.entries[0];assert.ok(row.buyCost<=1250);assert.equal(row.shares%100,0);assert.ok(row.breakEvenPrice>q.price);
 const fee=Fee.resolve({}),sale=row.shares*Fee.executionPrice(row.breakEvenPrice,'sell',fee);
 assert.ok(Math.abs(sale-Fee.costs(u,sale,'sell',fee).total-row.buyCost)<.001);assert.ok(row.stopScenarioLoss>0);assert.equal(row.targetExitEnabled,true);
});
test('missing or failed history health blocks otherwise fresh entries',()=>{
 for(const dataHealth of [undefined,{ok:false,reason:'stale'}]){const r=Guidance.build(input({dataHealth}));assert.equal(r.action,'wait_data');assert.equal(r.entries.length,0);}
});
test('persisted unreadable account forbids creating alternative fresh capital guidance',()=>{
 const r=Guidance.build(input({accountReadError:true}));assert.equal(r.action,'account_blocked');assert.equal(r.entries.length,0);
});
test('individual stock ranks remain observations, not ETF execution or verified recommendations',()=>{
 const stock={symbol:'sz300502',name:'新易盛',type:'stock'};
 const r=Guidance.build(input({universe:[stock],quotes:{[stock.symbol]:{...q,price:298}},predictions:{[stock.symbol]:{asOf:'2026-10-19',eligible:true,expectedReturn:.2}}}));
 assert.equal(r.entries.length,0);assert.match(r.observations[0].reason,/权限/);assert.equal(r.investmentReady,false);
});
test('existing holding uses frozen exit rules and preserves pending exit / T+1 blocks without mutation',()=>{
 const session={accountId:'original',budget:10000,feeProfile:Fee.resolve({}),riskLimits:{investableLimit:10000,maxExposure:1},rules:{},account:{equity:9900,cash:8600,holdings:[{symbol:u.symbol,name:u.name,shares:1000,entryPrice:1.4,entryFee:5,lastPrice:1.2,sellableSession:'2026-10-21',maturitySession:'2026-11-17',exitPlan:{stopPrice:1.288,targetPrice:1.54,targetExitEnabled:false,maturitySession:'2026-11-17'},pendingExit:{reason:'risk_stop'}}]}};
 const before=JSON.stringify(session),r=Guidance.build(input({session}));assert.equal(r.entries.length,0);assert.equal(r.holdings[0].exitReason,'risk_stop');assert.equal(r.holdings[0].blockedBy,'t_plus_one');assert.equal(r.holdings[0].targetExitEnabled,false);assert.equal(JSON.stringify(session),before);
});
test('zero/invalid prices do not produce numeric sizing or a buy recommendation',()=>{
 for(const price of [0,NaN]){const r=Guidance.build(input({quotes:{[u.symbol]:{...q,price}}}));assert.equal(r.entries.length,0);assert.equal(r.observations[0].scenario,null);}
});
test('old signal cannot be rolled forward into a current actionable entry',()=>{
 const r=Guidance.build(input({predictions:{[u.symbol]:{asOf:'2026-10-16',eligible:true,expectedReturn:.1}}}));assert.equal(r.entries.length,0);assert.equal(r.action,'wait_signal');
});

test('guidance rejects the same halted/limit-up buys as the actual order engine',()=>{
 for(const flag of [{halted:true},{buyLimitBlocked:true},{openBuyTradable:false},{tradeStatus:'limit_up'}]){
  const r=Guidance.build(input({quotes:{[u.symbol]:{...q,...flag}}}));assert.equal(r.entries.length,0);
 }
});
test('missing quote elsewhere in the declared pool blocks a new simulated entry',()=>{
 const other={symbol:'sh512760',name:'芯片ETF',type:'etf'},r=Guidance.build(input({universe:[u,other]}));assert.equal(r.entries.length,0);assert.equal(r.action,'wait_data');
});
test('holding guidance surfaces shared engine sell blockers, cached quotes, future receipt and watermarks',()=>{
 const h={symbol:u.symbol,name:u.name,shares:100,entryPrice:1.4,lastPrice:1.2,sellableSession:'2026-10-19',exitPlan:{stopPrice:1.288,targetPrice:1.54,maturitySession:'2026-11-17'},pendingExit:{reason:'risk_stop'}};
 for(const flags of [{halted:true},{sellLimitBlocked:true},{openSellTradable:false},{tradeStatus:'limit_down'},{cached:true},{receivedAt:'2026-10-20T02:01:00Z'}]){
  const session={accountId:'frozen',feeProfile:Fee.resolve({}),riskLimits:{investableLimit:1250},account:{holdings:[h]}};
  const r=Guidance.build(input({session,quotes:{[u.symbol]:{...q,...flags}}}));assert.ok(r.holdings[0].blockedBy,JSON.stringify(flags));
 }
 const session={accountId:'frozen',feeProfile:Fee.resolve({}),riskLimits:{investableLimit:1250},quoteWatermarks:{[u.symbol]:Date.parse(now)+1000},account:{holdings:[h]}};
 assert.ok(Guidance.build(input({session})).holdings[0].blockedBy);
});

test('rendered ETF break-even is rounded up to a tradable tick and labels individual scenarios',()=>{
 const r=Guidance.build(input()),h=Guidance.render(r),v=r.entries[0].breakEvenPrice,shown=(Math.ceil((v-1e-10)*1000)/1000).toFixed(3);
 assert.ok(h.includes(shown));assert.match(h,/不能把各行相加/);assert.match(h,/尚无通过风险与前瞻验证/);
});

test('normal live holdings without pending exit evaluate frozen price triggers without crashing',()=>{
 const session={accountId:'normal',feeProfile:Fee.resolve({}),riskLimits:{investableLimit:1250},account:{holdings:[{symbol:u.symbol,name:u.name,shares:100,entryPrice:1.4,lastPrice:1.4,sellableSession:'2026-10-19',exitPlan:{stopPrice:1.288,targetPrice:1.54,maturitySession:'2026-11-17'}}]}};
 const r=Guidance.build(input({session}));assert.equal(r.holdings[0].exitReason,null);
 const stop=Guidance.build(input({session,quotes:{[u.symbol]:{...q,price:1.2}}}));assert.equal(stop.holdings[0].exitReason,'risk_stop');
 const target=Guidance.build(input({session,quotes:{[u.symbol]:{...q,price:1.6}}}));assert.equal(target.holdings[0].exitReason,'frozen_target');
});
