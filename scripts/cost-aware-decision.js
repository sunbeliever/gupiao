'use strict';
// A fixed research-only challenger. No data access, orders, parameter search or live mutation.
const Base = require('./investment-decision-engine.js');
const Calendar = require('../assets/trading-calendar.js');
const Fee = require('../assets/fee-profile.js');
const ID = 'trend-cost-aware-weekly-v1';
const PARAMETERS = Object.freeze({rebalanceSessions: 5, minimumResizeNotional: 1000,
  maximumResizeFeeFraction: 0.005, anchor: '2025-01-03'});
function sessionDistance(a, b) {
  if (!Calendar.isSession(a) || !Calendar.isSession(b) || a > b) throw Error('Invalid cadence anchor');
  let n = 0; for (let d = a; d < b; d = Calendar.nextSession(d)) n++;
  return n;
}
function suppress(row, reason, profile, universe) {
  const u = universe.find(x => x.symbol === row.symbol);
  row.desiredShares = row.currentShares; row.buyShares = 0; row.sellShares = 0;
  row.buyCost = 0; row.desiredMarketValue = row.currentShares * row.occupiedCapital / Math.max(1, row.currentShares);
  row.intendedAction = row.currentShares ? 'hold' : 'observe'; row.action = row.intendedAction;
  row.executionBlockedBy = null; row.reasons.push(reason);
  row.fees.buy = Fee.costs(u, 0, 'buy', profile); row.fees.hypotheticalSell = Fee.costs(u, 0, 'sell', profile);
  row.riskScenarios.fourPercentStop = null;
}
function evaluate(input, {anchor = PARAMETERS.anchor} = {}) {
  const plan = Base.evaluate(input); plan.candidateId = ID;
  if (plan.status !== 'candidate_ready') return plan;
  const today = Calendar.sessionOf(input.now);
  const day = sessionDistance(anchor, today), rebalance = day % PARAMETERS.rebalanceSessions === 0;
  let suppressedOrders = 0;
  for (const row of plan.rows) {
    // All existing exit intentions bypass the turnover filter. A risk/thesis exit is never delayed.
    if (row.intendedAction === 'exit' || !row.buyShares && !row.sellShares) continue;
    const q = input.quotes[row.symbol], u = input.universe.find(x => x.symbol === row.symbol);
    const side = row.buyShares ? 'buy' : 'sell', shares = row.buyShares || row.sellShares;
    const notional = shares * Fee.executionPrice(q.price, side, plan.feeProfile);
    const fees = Fee.costs(u, notional, side, plan.feeProfile).total;
    let reason = null;
    if (!rebalance) reason = 'cost_guard_wait_scheduled_rebalance';
    // Initial entries are also subject to the fee hurdle; no tiny orders paying disproportionate minimum fees.
    else if (notional < PARAMETERS.minimumResizeNotional || fees / notional > PARAMETERS.maximumResizeFeeFraction)
      reason = 'cost_guard_minimum_trade_or_fee_hurdle';
    if (reason) { suppress(row, reason, plan.feeProfile, input.universe); suppressedOrders++; }
  }
  plan.totalBuyCost = plan.rows.reduce((v, r) => v + r.buyCost, 0);
  plan.remainingCashBeforeAnySales = input.account.cash - plan.totalBuyCost;
  plan.remainingPositionSlots = Math.max(0, plan.positionLimit - input.account.holdings.length -
    plan.rows.filter(r => !r.currentShares && r.buyShares).length);
  plan.soldProceedsUsed = 0;
  plan.turnoverControl = {...PARAMETERS, anchor, day, rebalance, suppressedOrders};
  plan.stage = 'offline_cost_candidate_unpromoted';
  plan.limitations.push('Weekly additions/resizing and a fixed fee hurdle can miss opportunities; exits remain daily.',
    'The original 500-yuan drawdown increase block is intentionally unchanged, including possible cash lockout.');
  return plan;
}
module.exports = {ID, PARAMETERS, evaluate, sessionDistance};
