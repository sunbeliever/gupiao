'use strict';
// Read-only integration point for the ORIGINAL committed-snapshot validator. Never opens or resumes an account.
const Original=require('./decision-research-view.js'),Brief=require('./manager-brief-l.js'),A=require('../assets/audit-identity.js');
function aggregateLots(lots){
 if(!Array.isArray(lots))throw Error('Ledger lots required');
 return [...new Set(lots.map(l=>l.symbol))].map(symbol=>{
  const group=lots.filter(l=>l.symbol===symbol),shares=group.reduce((s,l)=>s+l.shares,0);
  if(group.some(l=>!Number.isSafeInteger(l.shares)||l.shares<=0||!Number.isFinite(l.entryPrice)||l.entryPrice<=0||!Number.isFinite(l.stopPrice)||l.stopPrice<=0))throw Error('Invalid ledger lot');
  return {symbol,shares,entryPrice:group.reduce((s,l)=>s+l.shares*l.entryPrice,0)/shares,stopPrice:Math.min(...group.map(l=>l.stopPrice)),sellableSession:group.map(l=>l.sellableSession).sort()[0],maturitySession:group.map(l=>l.maturitySession).sort()[0],pendingExit:group.find(l=>l.pendingExit)?.pendingExit||null};
 });
}
function prepare(data,view,now,evidenceOptions={}){
 const input=Original.prepare(data,view,now); // Includes tick/checkpoint/history/quote content identity and watermark checks.
 input.now=new Date(input.now).toISOString();
 const lots=input.account.holdings.map(l=>({...l,entrySession:l.entrySession||l.entryDate}));
 input.account.holdings=aggregateLots(lots);input.account.lots=lots;
 const brief=Brief.buildBrief(input,evidenceOptions);
 return {...brief,snapshotIntegrity:{committedSnapshotVerified:true,validator:'existing-decision-research-view.prepare',...input.provenance,verifiedInputHash:A.hash(input)},accountUnchanged:true,provenance:input.provenance};
}
module.exports={aggregateLots,prepare};
