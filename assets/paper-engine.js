(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(root);else root.Paper=factory(root);})(typeof globalThis!=='undefined'?globalThis:this,function(root){
 'use strict';
 const Corporate=typeof module==='object'&&module.exports?require('./corporate-actions.js'):root.CorporateActions,corporateData=typeof module==='object'&&module.exports?require('./corporate-events.js'):root.CorporateEvents;
 const Calendar=typeof module==='object'&&module.exports?require('./trading-calendar.js'):root.TradingCalendar,Fee=typeof module==='object'&&module.exports?require('./fee-profile.js'):root.FeeProfile,Continuous=typeof module==='object'&&module.exports?require('./paper-account.js'):root.PaperAccount;
 function copy(x){return JSON.parse(JSON.stringify(x));}
 function sourceMs(q){if(!q?.sourceTime)return NaN;const value=String(q.sourceTime).replace(' ','T');return Date.parse(/[zZ]|[+-]\d{2}:\d{2}$/.test(value)?value:value+'+08:00');}
 function trading(now){try{return Calendar.isTradingTime(now);}catch(e){return false;}}
 function fresh(q,now){const t=sourceMs(q),received=q?.receivedAt?Date.parse(q.receivedAt):now;return !!(q&&Number.isFinite(q.price)&&q.price>0&&!q.cached&&Number.isFinite(t)&&Number.isFinite(received)&&received<=now&&now-t>=-30000&&now-t<=180000&&trading(t));}
 function recalc(account){account.equity=account.cash+account.holdings.reduce((n,h)=>n+h.shares*h.lastPrice,0)+(Corporate?Corporate.receivableValue(account):0);return account;}
 function costs(u,value,minFee,side,full,profile){
  return Fee.costs(u,value,side,Fee.resolve({minFee,feeProfile:profile}));
 }
 function size(u,q,allocation,minFee,full,profile){
  const fees=Fee.resolve({minFee,feeProfile:profile}),entry=Fee.executionPrice(q.price,'buy',fees),minimum=u.symbol.startsWith('sh688')?200:100;let shares=Math.floor((allocation-minFee)/entry/100)*100;
  while(shares>=minimum&&shares*entry+Fee.costs(u,shares*entry,'buy',fees).total>allocation)shares-=100;
  return {entry,minimum,shares:shares>=minimum?shares:0,fee:shares>=minimum?Fee.costs(u,shares*entry,'buy',fees).total:0};
 }
 function bindSignal(p,q,at){
  if(!p?.asOf&&!p?.signalDate)throw new Error('signal_session');
  const signalDate=p.signalDate||p.asOf,entrySession=Calendar.nextSession(signalDate),today=Calendar.sessionOf(at),horizon=p.horizon===undefined?20:p.horizon;
  if(signalDate!==p.asOf&&p.asOf||entrySession!==today||String(q?.sourceTime).slice(0,10)!==entrySession||p.entrySession&&p.entrySession!==entrySession)throw new Error('signal_session');
  if(!Number.isInteger(horizon)||horizon!==20)throw new Error('signal_horizon');
  if(p.publishedAt&&(!Number.isFinite(Date.parse(p.publishedAt))||Date.parse(p.publishedAt)>at))throw new Error('signal_unpublished');
  if(p.firstReceivedAt!==null&&p.firstReceivedAt!==undefined&&(!Number.isFinite(Date.parse(p.firstReceivedAt))||Date.parse(p.firstReceivedAt)>at))throw new Error('signal_unreceived');
  const maturitySession=Calendar.maturitySession(entrySession,horizon),referenceOpen=q?.open;
  if(!Number.isFinite(referenceOpen)||referenceOpen<=0)throw new Error('reference_open');
  if(p.referenceOpen!==null&&p.referenceOpen!==undefined&&Math.abs(p.referenceOpen-referenceOpen)>1e-8||p.maturitySession&&p.maturitySession!==maturitySession)throw new Error('signal_reference');
  return {signalDate,entrySession,referenceOpen,horizon,maturitySession,publishedAt:p.publishedAt||null,firstReceivedAt:p.firstReceivedAt||null};
 }
 function plan(input){
  if(input.allocationMode==='full'){
   const budget=input.budget===undefined?10000:input.budget,max=input.maxPositions===undefined?3:input.maxPositions;
   if(!Number.isInteger(max)||max<1||max>3)throw new Error('Invalid full-budget settings');
   let result;for(let k=max;k>=1;k--){result=plan({...input,allocationMode:undefined,positionLimit:budget,maxPositions:k});if(result.selected.length===k)break;}
   return {...result,allocationMode:'full',allocationCount:result.selected.length,maxPositions:max,positionLimit:budget};
  }
  const now=input.now===undefined?Date.now():typeof input.now==='number'?input.now:Date.parse(input.now),budget=input.budget===undefined?10000:input.budget,positionLimit=input.positionLimit===undefined?500:input.positionLimit,feeProfile=Fee.resolve(input),minFee=feeProfile.minFee,maxPositions=input.maxPositions===undefined?3:input.maxPositions;
  if(!Number.isFinite(now)||!Number.isFinite(budget)||budget<(input.remainingAllocation===true?100:1000)||budget>10000000||!Number.isFinite(positionLimit)||positionLimit<100||positionLimit>budget||!Number.isFinite(minFee)||minFee<0||minFee>100||!Number.isInteger(maxPositions)||maxPositions<1||maxPositions>3)throw new Error('Invalid small-budget settings');
  const rows=(input.universe||[]).map(u=>{
   const q=(input.quotes||{})[u.symbol],p=(input.predictions||{})[u.symbol],r={symbol:u.symbol,name:u.name,type:u.type,expectedReturn:p?.expectedReturn??null,signalDate:p?.asOf||null,sourceTime:q?.sourceTime||null,price:q?.price??null,reasonCode:null,reason:null};
   const reject=(code,reason)=>({...r,reasonCode:code,reason,selected:false});
   if(u.type==='stock'&&/^(sh688|sz30)/.test(u.symbol))return reject('permission','新手模式未启用科创板 / 创业板个股权限');
   if(!fresh(q,now))return reject('quote','缺少足够新的来源报价');
   const z=size(u,q,Math.min(positionLimit,budget/maxPositions),minFee,true,feeProfile);r.minimumShares=z.minimum;r.minimumBuyCost=z.minimum*z.entry+costs(u,z.minimum*z.entry,minFee,'buy',true,feeProfile).total;
   if(!z.shares)return reject('minimum_lot','单只额度不足以买入最小股数并支付费用');
   r.shares=z.shares;r.entryPrice=z.entry;r.entryFee=z.fee;r.buyCost=z.shares*z.entry+z.fee;
   const flatSale=z.shares*Fee.executionPrice(q.price,'sell',feeProfile);r.roundTripFrictionRate=(r.buyCost-flatSale+costs(u,flatSale,minFee,'sell',true,feeProfile).total)/r.buyCost;
   if(!p?.eligible||!Number.isFinite(p.expectedReturn)||p.expectedReturn<=0)return reject('forecast','没有可用的正收益研究预测');
   try{Object.assign(r,bindSignal(p,q,now));}catch(e){return reject(e.message,'预测起点、交易日历或到期日不匹配；拒绝平移旧预测');}
   r.referenceEntryOpen=q.open;r.referenceSignalDate=p.asOf;
   // The forecast starts at the signal-next-session open, not at the later paper entry.
   const estimatedSale=z.shares*Fee.executionPrice(r.referenceOpen*(1+p.expectedReturn),'sell',feeProfile);r.estimatedNetReturn=(estimatedSale-costs(u,estimatedSale,minFee,'sell',true,feeProfile).total-r.buyCost)/r.buyCost;
   if(r.estimatedNetReturn<=0)return reject('cost','研究收益估计不足以覆盖模拟双边佣金与滑点');
   if(Array.isArray(input.symbols)&&input.symbols.length&&!input.symbols.includes(u.symbol))return reject('not_selected','本次仅核查手动指定标的');
   return {...r,reason:'符合小额模拟条件；不代表已验证的买入建议',selected:false};
  });
  const selected=rows.filter(r=>!r.reasonCode).sort((a,b)=>b.estimatedNetReturn-a.estimatedNetReturn||a.symbol.localeCompare(b.symbol)).slice(0,maxPositions);
  for(const r of rows){r.selected=selected.includes(r);if(!r.reasonCode&&!r.selected){r.reasonCode='rank';r.reason='通过额度检查，未进入本次研究排名前三';}}
  return {schema:2,profile:'beginner',budget,positionLimit,maxPositions,minFee,feeRate:feeProfile.commissionRate,slippage:feeProfile.slippage,feeProfile,generatedAt:new Date(now).toISOString(),rows,selected,note:'Unified versioned fees include stock taxes/transfer. Minimum5 is a contract assumption, not a guaranteed broker tariff. Hypothetical price execution only.'};
 }
 function start(input){
  const now=input.now===undefined?Date.now():Date.parse(input.now),budget=input.budget===undefined?(input.profile==='beginner'?10000:100000):input.budget;
  if(!Number.isFinite(now)||!trading(now))throw new Error('Paper entries require a current trading session');
  if(!Number.isFinite(budget)||budget<1000||budget>10000000)throw new Error('Invalid paper budget');
  const quotes=input.quotes||{},pred=input.predictions||{},universe=input.universe||[];
  if(input.profile==='beginner'&&universe.some(u=>!fresh(quotes[u.symbol],now)))throw new Error('Complete fresh quotes required for small-budget entries');
  const manual=Array.isArray(input.symbols)&&input.symbols.length>0,small=input.profile==='beginner',selectionPlan=small?plan({...input,now:new Date(now).toISOString(),budget}):null;
  const chosen=small?selectionPlan.selected.map(r=>universe.find(u=>u.symbol===r.symbol)):manual?input.symbols.slice(0,3).map(s=>universe.find(u=>u.symbol===s)).filter(Boolean):universe.filter(u=>u.type==='stock'&&pred[u.symbol]?.eligible&&Number.isFinite(pred[u.symbol].expectedReturn)&&pred[u.symbol].expectedReturn>0).sort((a,b)=>pred[b.symbol].expectedReturn-pred[a.symbol].expectedReturn||a.symbol.localeCompare(b.symbol)).slice(0,3);
  if(!small&&!chosen.length)throw new Error('No positive model forecasts or valid selected symbols');
  if(!small&&!chosen.some(u=>fresh(quotes[u.symbol],now)))throw new Error('No eligible fresh quotes for paper entry');
  const benchmark=universe.find(u=>u.symbol==='sh588000');if(!benchmark||!fresh(quotes[benchmark.symbol],now))throw new Error('No fresh benchmark quote');
  const feeProfile=Fee.resolve(input),feeRate=feeProfile.commissionRate,minFee=feeProfile.minFee,slippage=feeProfile.slippage;
  function account(items,limit,rows){const a={cash:budget,holdings:[]};const allocation=limit===undefined?budget/items.length:limit;
   for(const u of items){const q=quotes[u.symbol];if(!fresh(q,now))continue;const row=rows?.find(r=>r.symbol===u.symbol),z=row?{entry:row.entryPrice,shares:row.shares,fee:row.entryFee}:size(u,q,allocation,minFee,true,feeProfile),entry=z.entry,shares=z.shares,fee=z.fee;
    if(!shares)continue;a.cash-=shares*entry+fee;
    a.holdings.push({symbol:u.symbol,name:u.name,shares,entryPrice:entry,entryFee:fee,entrySourceTime:q.sourceTime,lastPrice:q.price,lastSourceTime:q.sourceTime,predicted20DayReturn:pred[u.symbol]?.expectedReturn??null,signalDate:pred[u.symbol]?.asOf||null});
   }return recalc(a);
  }
  const a=account(chosen,small?Math.min(selectionPlan.positionLimit,budget/selectionPlan.maxPositions):undefined,small?selectionPlan.selected:undefined);if(!small&&!a.holdings.length)throw new Error('Paper cash insufficient for minimum lots');
  return {schema:1,budget,feeProfile,executionMode:'fixed_holding_research',selection:small?(manual?'beginner_manual':'beginner_model_experiment'):manual?'manual':'model_experiment',selectionPlan:selectionPlan?copy(selectionPlan):null,startedAt:new Date(now).toISOString(),observedAt:new Date(now).toISOString(),model:copy(input.model||{}),feeRate,minFee,slippage,
   account:a,benchmark:account([benchmark]),horizonAccuracy:null,realizedPnl:0,curve:[],note:'Last-price hypothetical buys with adverse slippage and entry fees; unrealized valuation only, no broker fills. A-shares are not sold in this intraday observation.'};
 }
 function mark(session,quotes,at){
  const now=at===undefined?Date.now():Date.parse(at);if(!Number.isFinite(now)||now<Date.parse(session.startedAt))throw new Error('Invalid paper observation clock');
  const s=copy(session);s.observedAt=new Date(now).toISOString();
  for(const account of [s.account,s.benchmark]){
   if(Corporate&&corporateData)Corporate.applyAccount(account,corporateData.events,new Date(now+8*3600000).toISOString().slice(0,10),(h,e)=>{const q=quotes[h.symbol],t=sourceMs(q);return q&&Number.isFinite(q.price)&&q.price>0&&Number.isFinite(t)&&t<=now+30000&&t>sourceMs({sourceTime:h.lastSourceTime})&&String(q.sourceTime).slice(0,10)>=e.exDate;});
   for(const h of account.holdings){const q=quotes[h.symbol],t=sourceMs(q);if(q&&Number.isFinite(q.price)&&q.price>0&&Number.isFinite(t)&&t<=now+30000&&t>sourceMs({sourceTime:h.lastSourceTime})){h.lastPrice=q.price;h.lastSourceTime=q.sourceTime;}}recalc(account);
  }
  s.curve.push({observedAt:s.observedAt,equity:s.account.equity,benchmarkEquity:s.benchmark.equity});s.curve=s.curve.slice(-2000);return s;
 }
 function legacyStartAuto(input){
  if(input.symbols&&input.symbols.length)throw new Error('Automatic paper mode cannot accept manual symbols');
  const now=input.now===undefined?Date.now():Date.parse(input.now),cn=new Date(now+8*3600000),minute=cn.getUTCHours()*60+cn.getUTCMinutes()+cn.getUTCSeconds()/60;
  if(!trading(now)||!((minute>=570&&minute<=660)||(minute>=780&&minute<=870)))throw new Error('Thirty minutes of continuous trading are required');
  const date=cn.toISOString().slice(0,10);
  if((input.universe||[]).some(u=>!fresh(input.quotes?.[u.symbol],now)||String(input.quotes[u.symbol].sourceTime).slice(0,10)!==date||!trading(sourceMs(input.quotes[u.symbol]))))throw new Error('Complete fresh continuous-session quotes required');
  const s=start({...input,now:new Date(now).toISOString(),profile:'beginner',includeStockTaxes:true});
  s.selection='beginner_automatic_experiment';
  s.automation={version:'auto-target-v1',mode:input.historicalReplay===true?'historical_5m':'live_30s',durationMs:1800000,plannedEndAt:new Date(now+1800000).toISOString(),done:false,windowEnded:false,elapsedMs:0,
   universe:copy(input.universe||[]),predictions:copy(input.predictions||{}),referenceOpens:Object.fromEntries((input.universe||[]).map(u=>[u.symbol,input.quotes[u.symbol].open??null])),
   settings:{budget:s.budget,positionLimit:s.selectionPlan.positionLimit,maxPositions:s.selectionPlan.maxPositions,minFee:s.minFee,allocationMode:s.selectionPlan.allocationMode||'capped'},
   lastEvaluatedAt:s.startedAt,lastQuoteTimes:Object.fromEntries((input.universe||[]).map(u=>[u.symbol,sourceMs(input.quotes[u.symbol])])),
   boughtSymbols:s.account.holdings.map(h=>h.symbol),events:[],evaluations:1,validObservations:1,dataFailureTicks:0,maxGapMs:0,lastPlan:copy(s.selectionPlan)};
  for(const h of s.account.holdings)s.automation.events.push({observedAt:s.startedAt,sourceTime:h.entrySourceTime,action:'buy',symbol:h.symbol,shares:h.shares,price:h.entryPrice,fee:h.entryFee,reason:'software_plan'});
  s.note='Automatic paper experiment, frozen model and forecasts. Recheck the same entry plan; exit signal when price reaches the frozen 20-day estimated target, subject to T+1. No forced sale at thirty minutes. Last-price hypothetical execution, not broker fills. Cash is not prediction success.';
  return s;
 }
 function legacyStepAuto(session,quotes,at){
  if(!session.automation)throw new Error('Not an automatic paper session');
  if(session.automation.windowEnded)return copy(session);
  const now=at===undefined?Date.now():Date.parse(at),previous=Date.parse(session.automation.lastEvaluatedAt);
  if(!Number.isFinite(now)||now<previous)throw new Error('Invalid automatic observation clock');
  if(now===previous)return copy(session);
  const s=copy(session),a=s.automation,date=new Date(now+8*3600000).toISOString().slice(0,10),end=Date.parse(a.plannedEndAt);
  a.maxGapMs=Math.max(a.maxGapMs,now-previous);a.lastEvaluatedAt=new Date(now).toISOString();a.elapsedMs=now-Date.parse(s.startedAt);a.evaluations++;
  // A final valuation at11:30/15:00 is valid even though new orders are closed.
  const good=(trading(now)||now>=end&&now-end<=60000)&&a.universe.every(u=>fresh(quotes[u.symbol],now)&&String(quotes[u.symbol].sourceTime).slice(0,10)===date&&sourceMs(quotes[u.symbol])>=a.lastQuoteTimes[u.symbol]);
  if(!good)a.dataFailureTicks++;
  else{
   a.validObservations++;
   const marked=mark(s,quotes,a.lastEvaluatedAt);s.account=marked.account;s.benchmark=marked.benchmark;s.curve=marked.curve;s.observedAt=marked.observedAt;
  }
  if(now>=end){
   a.windowEnded=true;const complete=good&&now-end<=60000&&a.maxGapMs<=(a.mode==='historical_5m'?300000:90000)&&a.dataFailureTicks===0;
   a.done=complete&&a.mode!=='historical_5m';a.historicalComplete=complete&&a.mode==='historical_5m';
   a.failureReason=complete?null:!good?'Final quotes invalid':a.dataFailureTicks?'Data gaps during observation':'Observation gap or late resumption';
   return s;
  }
  if(!good)return s;
  const events=[];
  for(const h of [...s.account.holdings]){
   const q=quotes[h.symbol],p=a.predictions[h.symbol],reference=a.referenceOpens[h.symbol];
   if(sourceMs(q)<=a.lastQuoteTimes[h.symbol]||!p?.eligible||!Number.isFinite(p.expectedReturn)||!Number.isFinite(reference)||reference<=0)continue;
   const target=reference*(1+p.expectedReturn);if(q.price<target)continue;
   const event={observedAt:a.lastEvaluatedAt,sourceTime:q.sourceTime,symbol:h.symbol,shares:h.shares,targetPrice:target,reason:'estimated_target_reached'};
   if(String(h.entrySourceTime).slice(0,10)>=date){events.push({...event,action:'exit_blocked',reason:'t_plus_one'});continue;}
   const u=a.universe.find(u=>u.symbol===h.symbol),price=q.price*(1-s.slippage),value=h.shares*price,c=costs(u,value,s.minFee,'sell',true),realizedPnl=value-c.total-h.shares*h.entryPrice-h.entryFee;
   s.account.cash+=value-c.total;s.account.holdings=s.account.holdings.filter(x=>x!==h);s.realizedPnl+=realizedPnl;
   events.push({...event,action:'sell',price,fee:c.total,tax:c.tax,transferFee:c.transferFee,realizedPnl});
  }
  const fixedQuotes=Object.fromEntries(a.universe.map(u=>[u.symbol,{...quotes[u.symbol],open:a.referenceOpens[u.symbol]}]));
  const full=a.settings.allocationMode==='full',slots=a.settings.maxPositions-s.account.holdings.length;
  const available=full?a.universe.filter(u=>!a.boughtSymbols.includes(u.symbol)&&sourceMs(quotes[u.symbol])>a.lastQuoteTimes[u.symbol]):a.universe;
  if(full&&(slots===0||s.account.cash<100||!available.length)){
   a.lastPlan={allocationMode:'full',budget:s.account.cash,maxPositions:slots,allocationCount:0,generatedAt:a.lastEvaluatedAt,rows:[],selected:[],note:'No remaining cash, unused slots, or new unbought quotes; existing lots are not topped up.'};
  }else{
   a.lastPlan=plan({...a.settings,...(full?{budget:s.account.cash,positionLimit:s.account.cash,maxPositions:slots,remainingAllocation:true}:{}),universe:available,quotes:fixedQuotes,predictions:a.predictions,now:a.lastEvaluatedAt,includeStockTaxes:true});
  }
  // A thirty-minute run buys each symbol at most once. Existing lots are never topped up.
  for(const r of (full?a.lastPlan.selected:a.lastPlan.rows.filter(r=>!r.reasonCode||r.reasonCode==='rank')).sort((x,y)=>y.estimatedNetReturn-x.estimatedNetReturn||x.symbol.localeCompare(y.symbol))){
   if(s.account.holdings.length>=a.settings.maxPositions)break;
   if(a.boughtSymbols.includes(r.symbol)||sourceMs(quotes[r.symbol])<=a.lastQuoteTimes[r.symbol]||r.buyCost>s.account.cash)continue;
   const q=quotes[r.symbol],p=a.predictions[r.symbol];s.account.cash-=r.buyCost;
   s.account.holdings.push({symbol:r.symbol,name:r.name,shares:r.shares,entryPrice:r.entryPrice,entryFee:r.entryFee,entrySourceTime:q.sourceTime,lastPrice:q.price,lastSourceTime:q.sourceTime,predicted20DayReturn:p.expectedReturn,signalDate:p.asOf});
   a.boughtSymbols.push(r.symbol);events.push({observedAt:a.lastEvaluatedAt,sourceTime:q.sourceTime,action:'buy',symbol:r.symbol,shares:r.shares,price:r.entryPrice,fee:r.entryFee,reason:'software_plan'});
  }
  recalc(s.account);a.events.push(...events);a.lastQuoteTimes=Object.fromEntries(a.universe.map(u=>[u.symbol,sourceMs(quotes[u.symbol])]));
  if(s.curve.length)s.curve[s.curve.length-1].equity=s.account.equity;
  return s;
 }
 const core={plan,size,sourceMs,fresh,trading,bindSignal};
 function startAuto(input){return Continuous.create(input,core);}
 function stepAuto(session,quotes,at,context){return Continuous.step(session,quotes,at,context||{},core);}
 return {start,mark,trading,sourceMs,plan,bindSignal,startAuto,stepAuto,startContinuous:startAuto,resume:Continuous.resume,observe:Continuous.observe,replay:(session,ticks)=>ticks.reduce((s,t)=>stepAuto(s,t.quotes,t.at,t.context),Continuous.resume(session)),legacyStartAuto,legacyStepAuto};
});
