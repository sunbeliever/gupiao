'use strict';
function summarize(status,ticks){
 const symbols=status.session.account.holdings.map(h=>h.symbol).sort();let previous=null,priceChangedTicks=0,lastObservedPriceChangeAt=null;const distinct=new Set();
 for(const row of ticks){if(!row.quotes||!symbols.every(s=>Number.isFinite(row.quotes[s]?.price)))continue;
  const prices=JSON.stringify(symbols.map(s=>[s,row.quotes[s].price]));distinct.add(prices);
  if(previous!==null&&previous!==prices){priceChangedTicks++;lastObservedPriceChangeAt=row.observedAt;}previous=prices;
 }
 return {...status,cachedResponseTicks:ticks.filter(r=>r.quotes&&Object.values(r.quotes).every(q=>q.cached)).length,
  quoteResponseTicks:ticks.filter(r=>r.quotes).length,exceptionTicks:ticks.filter(r=>r.error).length,priceChangedTicks,distinctHoldingPriceSnapshots:distinct.size,lastObservedPriceChangeAt,
  netUnrealizedReturn:status.session.account.equity/status.session.budget-1,benchmarkUnrealizedReturn:status.session.benchmark.equity/status.session.budget-1};
}
module.exports={summarize};
