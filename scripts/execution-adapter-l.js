'use strict';
// Read-only presentation/feasibility guard. Does not change the frozen L study's targets or ledger.
const Regime=require('./regime-decision-l.js'),C=require('../assets/trading-calendar.js'),Paper=require('../assets/paper-engine.js');
function lotAvailability(input,holding,today){
 if(!holding)return {shares:0,status:'no_position'};
 if(input.account.lots!==undefined&&!Array.isArray(input.account.lots))return {shares:null,status:'invalid_lot_reconciliation'};
 const supplied=input.account.lots===undefined?holding.lots:input.account.lots.filter(l=>l.symbol===holding.symbol);
 if(supplied!==undefined){
  if(!Array.isArray(supplied)||!supplied.length||supplied.some(l=>!l||!Number.isSafeInteger(l.shares)||l.shares<=0||!C.isSession(l.entrySession)||!C.isSession(l.sellableSession)||l.sellableSession<=l.entrySession)||supplied.reduce((s,l)=>s+l.shares,0)!==holding.shares)return {shares:null,status:'invalid_lot_reconciliation'};
  return {shares:supplied.filter(l=>l.sellableSession<=today).reduce((s,l)=>s+l.shares,0),status:'verified_supplied_lots'};
 }
 // Base aggregate's sellableSession is the earliest lot date. A future earliest date proves none can be sold;
 // a past earliest date does NOT prove that all lots can be sold. Never invent missing lot history.
 if(today<holding.sellableSession)return {shares:0,status:'all_lots_t1_blocked_by_earliest_date'};
 return {shares:null,status:'missing_lot_reconciliation'};
}
function guard(input,rawPlan){
 const p=structuredClone(rawPlan);p.presentationGuardVersion='lot-feasibility-l1';p.executable=false;
 if(p.status!=='candidate_ready')return p;
 const today=C.sessionOf(Date.parse(input.now));
 const inspection=Paper.inspectExecution({universe:input.universe,quotes:input.quotes,now:Date.parse(input.now),dataHealth:p.dataHealth});
 p.pendingOrdersVerified=Array.isArray(input.account.pendingOrders)&&input.account.pendingOrders.length===0;
 for(const row of p.rows){
  row.proposedSellShares=row.sellShares||0;row.proposedBuyShares=row.buyShares||0;
  const h=input.account.holdings.find(h=>h.symbol===row.symbol),availability=lotAvailability(input,h,today);
  row.lotAvailability=availability;row.verifiedSellableShares=availability.shares;
  row.hypotheticallyFeasibleSellShares=0;row.orderPermission=false;
  if(!row.proposedSellShares)continue;
  const q=inspection.rows.find(r=>r.symbol===row.symbol);
  const block=!q||!q.valid||q.sellBlock?'wait_sell_blocked':availability.shares===null?'wait_lot_verification':availability.shares===0?'wait_t1':availability.shares<row.proposedSellShares?'partial_sellable_review':null;
  row.executionBlockedBy=block;row.action=block||row.intendedAction;
  row.hypotheticallyFeasibleSellShares=!q||!q.valid||q.sellBlock||availability.shares===null?0:Math.min(row.proposedSellShares,availability.shares);
  if(block)row.reasons.push(block);
 }
 p.limitations.push('Displayed targets are proposals. Sellable lots require reconciliation; pending orders and broker execution are not connected.');
 return p;
}
function evaluate(input,options){return guard(input,Regime.evaluate(input,options));}
module.exports={lotAvailability,guard,evaluate};
