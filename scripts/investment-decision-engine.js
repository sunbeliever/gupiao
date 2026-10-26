'use strict';
// Research candidate only. All prices and proposed orders remain hypothetical; no I/O or execution.
const Calendar=require('../assets/trading-calendar.js'),Fee=require('../assets/fee-profile.js'),Paper=require('../assets/paper-engine.js');
const CANDIDATE_ID='trend-relative20-risk-v1',SYMBOLS=Object.freeze(['sh512720','sh512760','sh515070','sh515880','sh588000','sz159852']);
const finite=n=>typeof n==='number'&&Number.isFinite(n),positive=n=>finite(n)&&n>0;
const stamp=s=>typeof s==='string'?Date.parse(/[zZ]|[+-]\d{2}:\d{2}$/.test(s)?s:s.replace(' ','T')+'+08:00'):NaN;
const metadata=()=>({candidateId:CANDIDATE_ID,scope:[...SYMBOLS],researchOnly:true,executable:false,investmentReady:false,expectedReturn:null,profitProbability:null,netProfit:null,horizon:20});
function wait(reason){return {...metadata(),status:'wait_data',reason,rows:SYMBOLS.map(symbol=>({symbol,rank:null,action:'wait_data',intendedAction:'wait_data',desiredShares:null,buyShares:0,expectedReturn:null,profitProbability:null,indicators:null,reasons:[reason]})),totalBuyCost:0,soldProceedsUsed:0};}
function indicators(bars){const close=bars.at(-1).close,ma60=bars.slice(-60).reduce((s,b)=>s+b.close,0)/60,momentum20=close/bars.at(-21).close-1,returns=bars.slice(-20).map((b,i)=>Math.log(b.close/bars[bars.length-21+i].close)),mean=returns.reduce((s,r)=>s+r,0)/20,volatility20=Math.sqrt(returns.reduce((s,r)=>s+(r-mean)**2,0)/20*252);
 // The floor only prevents division by zero; it is not a fitted risk estimate.
 const numericalVolatility=Math.max(volatility20,1e-12);
 return {hfqClose:close,ma60,momentum20,volatility20,numericalVolatility,score:momentum20/numericalVolatility};}
function evaluate(input){try{
 if(!input||!Array.isArray(input.universe)||input.universe.length!==6||new Set(input.universe.map(u=>u?.symbol)).size!==6||input.universe.some(u=>!u||!SYMBOLS.includes(u.symbol)||u.type!=='etf'))return wait('invalid_fixed_universe');
 const now=typeof input.now==='number'?input.now:Date.parse(input.now),a=input.account;
 if(!finite(now)||!Calendar.isTradingTime(now)||!a||a.budget!==50000||!finite(a.equity)||a.equity<0||!finite(a.cash)||a.cash<0||a.cash>a.equity+.005||!finite(a.drawdown)||a.drawdown<0||!Array.isArray(a.holdings)||a.holdings.length>6||new Set(a.holdings.map(h=>h?.symbol)).size!==a.holdings.length)return wait('invalid_account_or_time');
 const today=Calendar.sessionOf(now),expectedAsOf=Calendar.expectedCompletedSession(now),profile=Fee.resolve(),holdings=new Map();
 for(const h of a.holdings){if(!h||!SYMBOLS.includes(h.symbol)||!Number.isSafeInteger(h.shares)||h.shares<=0||!positive(h.entryPrice)||!positive(h.stopPrice)||!Calendar.isSession(h.sellableSession)||!Calendar.isSession(h.maturitySession)||h.maturitySession<h.sellableSession||(h.pendingExit!==undefined&&h.pendingExit!==null&&typeof h.pendingExit!=='boolean'&&(typeof h.pendingExit!=='object'||Array.isArray(h.pendingExit))))return wait('invalid_holding');holdings.set(h.symbol,h);}
 if(input.baselinePredictions!==undefined&&(!input.baselinePredictions||typeof input.baselinePredictions!=='object'||Array.isArray(input.baselinePredictions)))return wait('invalid_baseline_reference');
 const rows=[];
 for(const symbol of SYMBOLS){
  const bars=input.histories?.[symbol],q=input.quotes?.[symbol];
  if(!Array.isArray(bars)||bars.length<61||bars.length>10000||!q||!positive(q.price)||!positive(q.open)||!finite(stamp(q.sourceTime))||!finite(stamp(q.receivedAt))||stamp(q.sourceTime)>now||stamp(q.receivedAt)>now)return wait('missing_or_future_input');
  for(let i=0;i<bars.length;i++){const b=bars[i];if(!b||!Calendar.isSession(b.date)||b.date>expectedAsOf||![b.open,b.close,b.high,b.low].every(positive)||!finite(b.volume)||b.volume<0||b.low>Math.min(b.open,b.close)||b.high<Math.max(b.open,b.close)||(i&&b.date<=bars[i-1].date))return wait('invalid_or_future_hfq_bar');}
  const recent=bars.slice(-61);if(recent.at(-1).date!==expectedAsOf||recent.some((b,i)=>i&&Calendar.previousSession(b.date)!==recent[i-1].date))return wait('history_incomplete_or_stale');
  const metric=indicators(recent);if(!Object.values(metric).every(finite))return wait('invalid_indicators');
  const eligible=metric.momentum20>0&&metric.hfqClose>metric.ma60;
  rows.push({symbol,name:input.universe.find(u=>u.symbol===symbol).name||symbol,indicators:metric,eligible,reasons:eligible?['positive_momentum20','hfq_above_ma60']:['trend_invalid'],expectedReturn:null,profitProbability:null});
 }
 const health={ok:true,expectedAsOf,rows:SYMBOLS.map(symbol=>({symbol,dataAsOf:expectedAsOf,stale:false}))};
 const inspection=Paper.inspectExecution({universe:input.universe,quotes:input.quotes,now,dataHealth:health});
 if(!inspection.health.ok||inspection.rows.length!==6||inspection.rows.some(r=>!r.valid))return wait('quote_or_history_pool_not_executable');
 rows.sort((x,y)=>Number(y.eligible)-Number(x.eligible)||y.indicators.score-x.indicators.score||x.symbol.localeCompare(y.symbol));
 rows.forEach((r,i)=>{r.rank=i+1;});
 const selected=rows.filter(r=>r.eligible).slice(0,3),inverseSum=selected.reduce((s,r)=>s+1/r.indicators.numericalVolatility,0),cap=Math.max(0,Math.min(12500,a.equity*.25,500/.04)),occupied=a.holdings.reduce((s,h)=>s+h.shares*input.quotes[h.symbol].price,0);
 let cash=a.cash,capRoom=Math.max(0,cap-occupied),totalBuyCost=0,availableSlots=Math.max(0,3-a.holdings.length);
 function buyCost(u,shares,price){const notional=shares*price,fees=Fee.costs(u,notional,'buy',profile);return {notional,fees,total:notional+fees.total};}
 function lots(u,budget,price){let shares=Math.max(0,Math.floor(budget/price/100)*100);while(shares&&buyCost(u,shares,price).total>budget+1e-8)shares-=100;return shares;}
 for(const row of rows){
  const u=input.universe.find(x=>x.symbol===row.symbol),q=input.quotes[row.symbol],h=holdings.get(row.symbol),current=h?.shares||0,checks=inspection.rows.find(x=>x.symbol===row.symbol),picked=selected.includes(row),allocation=picked?cap*(1/row.indicators.numericalVolatility)/inverseSum:0,buyPrice=Fee.executionPrice(q.price,'buy',profile);
  let desired=picked?lots(u,allocation,buyPrice):0,exitReason=null;
  if(h){if(h.pendingExit)exitReason='pending_exit';else if(q.price<=h.stopPrice)exitReason='risk_stop';else if(today>=h.maturitySession)exitReason='maturity';else if(!row.eligible)exitReason='trend_invalid';else if(!picked)exitReason='rank_excluded';}
  if(exitReason){desired=0;row.reasons.unshift(exitReason);}
  let buyShares=0,buy={notional:0,fees:Fee.costs(u,0,'buy',profile),total:0};
  if(desired>current){
   if(a.drawdown>=500){desired=current;row.reasons.push('drawdown_warning_blocks_increases');}
   else if(checks.buyBlock){desired=current;row.reasons.push(checks.buyBlock);}
   else if(current===0&&availableSlots===0){desired=0;row.reasons.push('unfilled_positions_occupy_all_slots');}
   else{buyShares=Math.min(Math.floor((desired-current)/100)*100,lots(u,Math.min(cash,capRoom),buyPrice));buy=buyCost(u,buyShares,buyPrice);desired=current+buyShares;cash-=buy.total;capRoom-=buy.total;totalBuyCost+=buy.total;if(buyShares>0&&current===0)availableSlots--;if(!buyShares)row.reasons.push('cash_cap_or_lot_unavailable');}
  }
  let intendedAction=exitReason?'exit':desired>current?(current?'add':'candidate_buy'):desired<current?'reduce':current?'hold':'observe',action=intendedAction,sellShares=Math.max(0,current-desired),sellBlock=null;
  if(sellShares){sellBlock=today<h.sellableSession?'wait_t1':checks.sellBlock?'wait_sell_blocked':null;if(sellBlock)action=sellBlock;}
  const sellPrice=Fee.executionPrice(q.price,'sell',profile),sellFees=Fee.costs(u,sellShares*sellPrice,'sell',profile),newStop=buyPrice*.96,stopSellPrice=Fee.executionPrice(newStop,'sell',profile),stopSellFees=Fee.costs(u,buyShares*stopSellPrice,'sell',profile);
  Object.assign(row,{selected:picked,allocation,priceBasis:'hfq_completed_daily_indicators_and_raw_quote_execution',signalAsOf:expectedAsOf,currentShares:current,desiredShares:desired,buyShares,sellShares,intendedAction,action,executionBlockedBy:sellBlock,retainedShares:current,occupiedCapital:current*q.price,desiredMarketValue:desired*q.price,buyCost:buy.total,fees:{buy:buy.fees,hypotheticalSell:sellFees},buyExecutionPrice:buyPrice,holdReason:current&&row.eligible&&picked?'HFQ趋势与相对强弱仍满足固定候选条件；回撤本身不等于逻辑失效':current?'原持仓需要按所列失效或退出意图继续研究':'暂无持仓',invalidationConditions:['momentum20<=0','HFQ close<=MA60','跌出前三','原风险价或原到期条件触发'],sellableSession:h?.sellableSession||Calendar.nextSession(today),maturitySession:h?.maturitySession||Calendar.maturitySession(today,20),riskScenarios:{fourPercentStop:buyShares?{triggerPrice:newStop,hypotheticalExecutionPrice:stopSellPrice,netPnl:buyShares*stopSellPrice-stopSellFees.total-buy.total,guaranteed:false,tPlusOneCanDelay:true}:null,existingStopPrice:h?.stopPrice||null,gapLoss:null,maxLossGuaranteed:false},expectedNetProfit:null});
 }
 return {...metadata(),status:'candidate_ready',asOf:new Date(now).toISOString(),signalAsOf:expectedAsOf,rows,ranking:rows.map(r=>r.symbol),selected:selected.map(r=>r.symbol),cap,occupiedCapital:occupied,positionLimit:3,occupiedPositionCount:a.holdings.length,remainingPositionSlots:availableSlots,totalBuyCost,remainingCashBeforeAnySales:cash,soldProceedsUsed:0,drawdownWarning:a.drawdown>=500,feeProfile:profile,dataHealth:health,baselineReferenceUsed:false,stage:'synthetic_candidate_only_cost_account_validation_pending',limitations:['仅六ETF固定研究候选，未登记为费后优胜策略或部署模型','动量是历史排序指标，不是未来收益预测','500元仅监测与预算约束，费用、跳空与T+1可能使亏损超过警戒','调用方必须保证历史为同口径后复权；本模块不能凭数值验证复权来源','所有计划卖出均未计作已成交，不增加现金或新买额度']};
}catch(e){return wait('invalid_input: '+e.message);}}
module.exports={CANDIDATE_ID,SYMBOLS,evaluate};
