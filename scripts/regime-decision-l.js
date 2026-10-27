'use strict';
// New, isolated research candidates. This module never writes an account or executes an order.
const Base = require('./investment-decision-engine.js');
const Cost = require('./cost-aware-decision.js');
const Calendar = require('../assets/trading-calendar.js');
const Fee = require('../assets/fee-profile.js');
const PARAMETERS = Object.freeze({warningAmount:500, maxAnnualVolatility:0.30,
  resizeBand:0.20, rebalanceSessions:5, minimumNotional:1000, maxFeeFraction:0.005});
const IDS = Object.freeze({monitor_only:'monitor-only-weekly-l1',regime_band:'breadth-volatility-band-l1'});
const clone=x=>JSON.parse(JSON.stringify(x));
function zeroTrade(row, input, profile, reason) {
  const u=input.universe.find(u=>u.symbol===row.symbol);
  row.desiredShares=row.currentShares; row.buyShares=0; row.sellShares=0; row.buyCost=0;
  row.desiredMarketValue=row.currentShares*input.quotes[row.symbol].price;
  row.intendedAction=row.currentShares?'hold':'observe'; row.action=row.intendedAction;
  row.executionBlockedBy=null; row.fees={buy:Fee.costs(u,0,'buy',profile),hypotheticalSell:Fee.costs(u,0,'sell',profile)};
  row.riskScenarios.fourPercentStop=null;row.reasons.push(reason);
}
function evaluate(input,{kind='monitor_only',anchor='2025-01-03'}={}) {
  if(!IDS[kind])throw Error('Unregistered strategy kind');
  const checked=Base.evaluate(input); // Validate original account first; never normalize an invalid input into acceptance.
  if(checked.status!=='candidate_ready')return {...checked,candidateId:IDS[kind]};
  const x=clone(input); x.account.drawdown=0;
  const plan=Cost.evaluate(x,{anchor}); plan.candidateId=IDS[kind];
  const eligible=plan.rows.filter(r=>r.eligible).length;
  const averageVolatility=plan.rows.reduce((s,r)=>s+r.indicators.volatility20,0)/plan.rows.length;
  const budgetFraction=kind==='regime_band'?eligible/6*Math.min(1,PARAMETERS.maxAnnualVolatility/Math.max(averageVolatility,1e-12)):1;
  plan.drawdownWarning=input.account.drawdown>=PARAMETERS.warningAmount;
  plan.guardIncreaseBlocked=false;
  plan.riskPolicy={id:IDS[kind],warningSemantics:'monitor_only_not_permanent_cash_lock',
    globalObservedDrawdown:input.account.drawdown,globalEquityPeakNotReset:true,
    riskContractChangedFromK:true,budgetFraction,effectiveEntryBudget:plan.cap*budgetFraction,
    maximumExposureCeiling:0.25,globalLossCapGuaranteed:false};
  plan.marketRegime={signalAsOf:plan.signalAsOf,eligibleCount:eligible,universeCount:6,
    breadth:eligible/6,averageAnnualizedVolatility:averageVolatility,
    label:eligible>=4?'broad_positive':eligible<=2?'weak_breadth':'mixed',
    source:'completed_price_history_only',notFuturePrediction:true};
  plan.stage='isolated_historical_research_unpromoted';
  plan.limitations.push('500 CNY remains a visible warning, not a permanent entry ban. This changes the K risk contract and can increase losses.');
  if(kind==='regime_band'&&plan.turnoverControl.rebalance){
    let cash=input.account.cash,room=Math.max(0,plan.cap*budgetFraction-plan.occupiedCapital);
    for(const row of plan.rows){
      // Original stop, maturity, invalid-trend and exclusion exits bypass resizing filters.
      if(row.intendedAction==='exit')continue;
      const u=input.universe.find(u=>u.symbol===row.symbol),q=input.quotes[row.symbol],bp=row.buyExecutionPrice;
      let target=Math.floor(row.allocation*budgetFraction/bp/100)*100;
      while(target&&target*bp+Fee.costs(u,target*bp,'buy',plan.feeProfile).total>row.allocation*budgetFraction+1e-8)target-=100;
      let buy=Math.max(0,target-row.currentShares),sell=Math.max(0,row.currentShares-target);
      // Keep original quote, occupied-slot and unfilled-cash admission gates. Never use proposed sale proceeds.
      buy=Math.min(buy,row.buyShares,Math.floor(Math.min(cash,room)/bp/100)*100);
      while(buy&&buy*bp+Fee.costs(u,buy*bp,'buy',plan.feeProfile).total>Math.min(cash,room)+1e-8)buy-=100;
      if(!row.selected){buy=0;sell=0;}
      const side=buy?'buy':'sell',n=buy||sell,px=Fee.executionPrice(q.price,side,plan.feeProfile);
      const fee=Fee.costs(u,n*px,side,plan.feeProfile).total;
      const hurdle=Math.max(PARAMETERS.minimumNotional,row.currentShares*q.price*PARAMETERS.resizeBand);
      if(!n||n*px<hurdle||fee/(n*px)>PARAMETERS.maxFeeFraction){zeroTrade(row,input,plan.feeProfile,'regime_no_trade_band_or_fee_hurdle');continue;}
      row.buyShares=buy;row.sellShares=sell;row.desiredShares=row.currentShares+buy-sell;
      row.desiredMarketValue=row.desiredShares*q.price;
      row.fees={buy:Fee.costs(u,buy*bp,'buy',plan.feeProfile),hypotheticalSell:Fee.costs(u,sell*Fee.executionPrice(q.price,'sell',plan.feeProfile),'sell',plan.feeProfile)};
      row.buyCost=buy*bp+row.fees.buy.total;
      row.intendedAction=buy?(row.currentShares?'add':'candidate_buy'):sell?'reduce':row.currentShares?'hold':'observe';
      row.action=sell&&row.executionBlockedBy?row.executionBlockedBy:row.intendedAction;
      row.reasons.push('fixed_breadth_volatility_budget_and_resize_band');
      const stop=bp*.96,sp=Fee.executionPrice(stop,'sell',plan.feeProfile);
      row.riskScenarios.fourPercentStop=buy?{triggerPrice:stop,hypotheticalExecutionPrice:sp,netPnl:buy*sp-Fee.costs(u,buy*sp,'sell',plan.feeProfile).total-row.buyCost,guaranteed:false,tPlusOneCanDelay:true}:null;
      cash-=row.buyCost;room-=row.buyCost;
    }
  }
  plan.totalBuyCost=plan.rows.reduce((s,r)=>s+r.buyCost,0);
  plan.remainingCashBeforeAnySales=input.account.cash-plan.totalBuyCost;
  plan.remainingPositionSlots=Math.max(0,3-input.account.holdings.length-plan.rows.filter(r=>!r.currentShares&&r.buyShares).length);
  plan.soldProceedsUsed=0;
  plan.riskContractEquivalentToOriginal=false;
  return plan;
}
module.exports={IDS,PARAMETERS,evaluate};
