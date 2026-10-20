'use strict';
const Calendar=require('../assets/trading-calendar.js');
const HORIZON=20;
function summarizeBlocks({daily,budget}){
 if(!Array.isArray(daily)||!Number.isFinite(budget)||budget<=0)throw Error('Invalid account evidence');
 const byDate=new Map();let prior=null;
 for(const row of daily){if(!row||!Calendar.isSession(row.date)||prior&&row.date<=prior||!Number.isFinite(row.equity)||row.equity<=0||!Number.isFinite(row.marketValue)||row.marketValue<0||!Number.isFinite(row.feesPaid)||row.feesPaid<0)throw Error('Invalid daily account evidence');byDate.set(row.date,row);prior=row.date;}
 const sessions=[];if(daily.length){let date=daily[0].date;while(true){sessions.push(date);if(date===daily.at(-1).date)break;date=Calendar.nextSession(date);}}
 const blocks=[];let startEquity=budget,startFees=0;
 for(let offset=0;offset+HORIZON<=sessions.length;offset+=HORIZON){
  const dates=sessions.slice(offset,offset+HORIZON),rows=dates.map(date=>byDate.get(date)),last=rows.at(-1),complete=rows.every(row=>row&&Array.isArray(row.stale)&&row.stale.length===0)&&startEquity!==null;
  const netReturn=complete?last.equity/startEquity-1:null,exposed=rows.some(row=>row&&row.marketValue>0),cashOnly=complete&&rows.every(row=>row.marketValue===0);
  const outcome=!complete?'unscorable':netReturn>1e-12&&exposed?'positive':netReturn< -1e-12?'negative':'zero';
  blocks.push({index:blocks.length+1,startDate:dates[0],endDate:dates.at(-1),sessions:HORIZON,startEquity,endEquity:last?.equity??null,netReturn,feesPaid:last&&startFees!==null?last.feesPaid-startFees:null,exposed,cashOnly,outcome,missingDates:dates.filter((date,i)=>!rows[i]),staleDates:rows.filter(row=>row?.stale?.length).map(row=>row.date)});
  const boundaryValid=last&&Array.isArray(last.stale)&&last.stale.length===0;startEquity=boundaryValid?last.equity:null;startFees=boundaryValid?last.feesPaid:null;
 }
 const positive=blocks.filter(b=>b.outcome==='positive').length,unscorable=blocks.filter(b=>b.outcome==='unscorable').length,fraction=blocks.length?positive/blocks.length:null;
 return {schema:'nonoverlapping-account-block-evidence-v1',horizonSessions:HORIZON,completeBlockCount:blocks.length,incompleteTailSessions:sessions.length%HORIZON,positiveBlockCount:positive,negativeBlockCount:blocks.filter(b=>b.outcome==='negative').length,zeroReturnBlockCount:blocks.filter(b=>b.outcome==='zero').length,cashOnlyBlockCount:blocks.filter(b=>b.cashOnly).length,unscorableBlockCount:unscorable,observedPositiveFraction:fraction,target70PercentObserved:!blocks.length||unscorable?null:fraction>=.7,verifiedProfitProbability:null,investmentReady:false,independentSamplesAssumed:false,blocks,note:'Fixed calendar blocks in one continuous account; costs already included in equity. Missing/stale blocks stay in the denominator and invalidate target scoring. Cash zero returns never win. This descriptive frequency is not a calibrated probability or proof of investment suitability; serial dependence and limited samples remain.'};
}
module.exports={summarizeBlocks};
