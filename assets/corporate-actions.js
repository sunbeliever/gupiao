(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CorporateActions=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function entryDate(h){return String(h.entryDate||h.entrySourceTime||'').slice(0,10);}
 function entitled(event,symbol,entry,exit){return event.symbol===symbol&&entry<=event.recordDate&&exit>event.recordDate&&event.exDate<=exit;}
 function entitlement(events,symbol,entry,exit,shares){
  let units=shares,income=0,availableAt=exit;const applied=[];
  for(const e of events.slice().sort((a,b)=>a.exDate.localeCompare(b.exDate)))if(entitled(e,symbol,entry,exit)){
   if(e.type==='split')units*=e.ratio;else{income+=units*e.cashPerShare;availableAt=availableAt>e.payDate?availableAt:e.payDate;}applied.push(e.id);
  }
  return {shares:units,dividendIncome:income,labelAvailableAt:availableAt,applied};
 }
 function applyAccount(account,events,date,allowed){
  for(const h of account.holdings){h.appliedCorporateActions=h.appliedCorporateActions||[];
   for(const e of events.slice().sort((a,b)=>a.exDate.localeCompare(b.exDate))){
    if(h.appliedCorporateActions.includes(e.id)||!entitled(e,h.symbol,entryDate(h),date)||allowed&&!allowed(h,e))continue;
    if(e.type==='split'){if(h.originalEntryPrice===undefined){h.originalEntryPrice=h.entryPrice;h.originalEntryShares=h.shares;}h.shares*=e.ratio;h.entryPrice/=e.ratio;}
    else{const amount=h.shares*e.cashPerShare;h.dividendIncome=(h.dividendIncome||0)+amount;account.receivables=account.receivables||[];account.receivables.push({id:e.id+':'+entryDate(h),symbol:h.symbol,amount,payDate:e.payDate,source:e.source});}
    h.appliedCorporateActions.push(e.id);
   }
  }
  account.receivables=account.receivables||[];
  const due=account.receivables.filter(r=>r.payDate<=date);account.cash+=due.reduce((s,r)=>s+r.amount,0);account.receivables=account.receivables.filter(r=>r.payDate>date);
  return account;
 }
 function receivableValue(account){return (account.receivables||[]).reduce((s,r)=>s+r.amount,0);}
 return {entitlement,applyAccount,receivableValue};
});
