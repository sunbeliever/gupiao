(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./trading-calendar.js'):root.TradingCalendar,typeof module==='object'&&module.exports?require('./fee-profile.js'):root.FeeProfile,typeof module==='object'&&module.exports?require('./audit-identity.js'):root.AuditIdentity,typeof module==='object'&&module.exports?require('./corporate-actions.js'):root.CorporateActions,typeof module==='object'&&module.exports?require('./corporate-events.js'):root.CorporateEvents);if(typeof module==='object'&&module.exports)module.exports=api;else root.PaperAccount=api;})(typeof globalThis!=='undefined'?globalThis:this,function(Calendar,Fee,Audit,Corporate,Events){
 'use strict';
 const clone=x=>JSON.parse(JSON.stringify(x)),ms=x=>typeof x==='number'?x:Date.parse(x),iso=x=>new Date(x).toISOString();
 function seal(s){delete s.integrityHash;s.integrityHash=Audit.hash(s);return s;}
 function resume(value){const s=clone(value),given=s.integrityHash;delete s.integrityHash;if(s.schema!==2||s.accountType!=='continuous_paper'||given!==Audit.hash(s))throw Error('Invalid continuous account snapshot; preserve the original record');s.integrityHash=given;return s;}
 function record(s,event){const item={sequence:s.ledger.length+1,previousHash:s.ledger.at(-1)?.eventHash||null,decisionAt:s.observedAt,...event};item.eventHash=Audit.hash(item);s.ledger.push(item);return item;}
 function noteOnce(s,key,event){if(s.recordedDecisions[key])return;s.recordedDecisions[key]=true;record(s,event);}
 function recalc(a,budget){a.marketValue=a.holdings.reduce((n,h)=>n+h.shares*h.lastPrice,0);a.receivableValue=Corporate.receivableValue(a);a.equity=a.cash+a.marketValue+a.receivableValue;a.frozenFunds=0;a.availableCash=a.cash;a.realizedPnl=(a.closedPnl||0)+(a.paidDividends||0);a.unrealizedPnl=a.equity-budget-a.realizedPnl;return a;}
 function empty(budget){return recalc({cash:budget,holdings:[],receivables:[],feesPaid:0,slippageCost:0,closedPnl:0,paidDividends:0},budget);}
 function blocked(q,side){if(q?.halted||q?.suspended||q?.tradeStatus==='suspended')return 'suspended';if(side==='buy'&&(q?.buyLimitBlocked||q?.openBuyTradable===false||q?.tradeStatus==='limit_up'))return 'buy_limit_or_rejection';if(side==='sell'&&(q?.sellLimitBlocked||q?.openSellTradable===false||q?.tradeStatus==='limit_down'))return 'sell_limit_or_rejection';return null;}
 function observedQuote(q,now,core){const t=core.sourceMs(q),received=q?.receivedAt?ms(q.receivedAt):now;return !!(q&&Number.isFinite(q.price)&&q.price>0&&!q.cached&&Number.isFinite(t)&&Number.isFinite(received)&&received<=now&&now-t>=-30000&&now-t<=180000&&Calendar.sessionOf(t)===Calendar.sessionOf(now));}
 function fresh(q,now,core){return observedQuote(q,now,core)&&Calendar.isTradingTime(core.sourceMs(q));}
 function holdingMark(s,a,quotes,now,core,label){
  const date=Calendar.sessionOf(now),beforeCash=a.cash,priorShares=Object.fromEntries(a.holdings.map(h=>[h.symbol,h.shares])),priorDividends=Object.fromEntries(a.holdings.map(h=>[h.symbol,h.dividendIncome||0]));
  Corporate.applyAccount(a,s.corporateEvents,date,(h,e)=>{const q=quotes[h.symbol],t=core.sourceMs(q);return Number.isFinite(q?.price)&&q.price>0&&Number.isFinite(t)&&t<=now+30000&&t>core.sourceMs({sourceTime:h.lastSourceTime})&&(!q.receivedAt||ms(q.receivedAt)<=now)&&Calendar.sessionOf(t)>=e.exDate;});
  const paid=a.cash-beforeCash;a.paidDividends=(a.paidDividends||0)+paid;
  if(paid)record(s,{type:'dividend_paid',account:label,amount:paid});
  for(const h of a.holdings){
   if(priorShares[h.symbol]!==h.shares){const ratio=h.shares/priorShares[h.symbol];h.exitPlan.targetPrice/=ratio;h.exitPlan.stopPrice/=ratio;if(h.pendingExit)h.pendingExit.shares=h.shares;record(s,{type:'corporate_split',account:label,symbol:h.symbol,ratio,shares:h.shares,originalEntryPrice:h.originalEntryPrice});}
   const income=(h.dividendIncome||0)-priorDividends[h.symbol];if(income){const perShare=income/h.shares;h.exitPlan.targetPrice=Math.max(0,h.exitPlan.targetPrice-perShare);h.exitPlan.stopPrice=Math.max(0,h.exitPlan.stopPrice-perShare);record(s,{type:'dividend_entitlement',account:label,symbol:h.symbol,amount:income,perShare,corporateActions:clone(h.appliedCorporateActions||[]),totalReturnThresholdAdjustment:true});}
   const q=quotes[h.symbol],t=core.sourceMs(q),last=core.sourceMs({sourceTime:h.lastSourceTime});
   const usable=Number.isFinite(q?.price)&&q.price>0&&Number.isFinite(t)&&t<=now+30000&&t>=last&&(!q.receivedAt||ms(q.receivedAt)<=now);
   if(usable&&t>last){h.lastPrice=q.price;h.lastSourceTime=q.sourceTime;h.lastReceivedAt=q.receivedAt||iso(now);}
   let current=false;try{current=usable&&(fresh(q,now,core)||!Calendar.isTradingTime(now)&&Calendar.sessionOf(t)===Calendar.expectedCompletedSession(now)&&String(q.sourceTime).slice(11,16)>='14:57'&&!q.cached);}catch(e){}
   h.stale=!current;h.staleReason=current?null:!q?'missing_quote':!usable?'invalid_or_reversed_quote':q.cached?'cached_quote':'expired_quote';h.valuationAgeMs=Math.max(0,now-core.sourceMs({sourceTime:h.lastSourceTime}));
  }
  a.valuationComplete=a.holdings.every(h=>!h.stale);a.complete=a.entryComplete!==false&&a.valuationComplete;
  recalc(a,s.budget);
 }
 function poolHealth(s,quotes,now,context,core){
  let expectedAsOf=null;try{expectedAsOf=Calendar.expectedCompletedSession(now);}catch(e){return {ok:false,reason:e.message,expectedAsOf,rows:[]};}
  const rows=s.universe.map(u=>{const forward=core.sourceMs(quotes[u.symbol])>=(s.quoteWatermarks[u.symbol]||0);return {symbol:u.symbol,ok:observedQuote(quotes[u.symbol],now,core)&&forward,entryOk:fresh(quotes[u.symbol],now,core)&&forward};});
  const supplied=context.dataHealth,signals=context.predictions||s.signals;
  const historyOk=supplied?supplied.ok===true&&supplied.expectedAsOf===expectedAsOf&&(!supplied.dataAsOf||supplied.dataAsOf===expectedAsOf)&&(!supplied.rows||supplied.rows.length===s.universe.length&&s.universe.every(u=>supplied.rows.some(r=>r.symbol===u.symbol&&r.dataAsOf===expectedAsOf&&!r.stale))):s.universe.every(u=>(signals[u.symbol]?.signalDate||signals[u.symbol]?.asOf)===expectedAsOf);
  const sameModel=!context.model||Audit.hash(context.model)===Audit.hash(s.model);
  return {ok:rows.every(r=>r.entryOk)&&historyOk&&sameModel,quotePoolComplete:rows.every(r=>r.ok),historyOk,sameModel,expectedAsOf,dataCoverage:supplied?'explicit_history_pool':'caller_signal_contract',reason:!sameModel?'frozen_model_mismatch':!historyOk?'history_incomplete_or_stale':rows.some(r=>!r.ok)?'research_pool_quote_failure':null,rows};
 }
 function order(s,a,u,q,side,shares,reason,now,core,extra={}){
  const item={id:s.accountId+':'+(s.orders.length+1),account:extra.account||'model',symbol:u.symbol,side,shares,reason,sourceTime:q?.sourceTime||null,receivedAt:q?.receivedAt||iso(now),decisionAt:iso(now),orderAt:iso(now),fillAssumption:'last_price_adverse_slippage_unverified',status:'submitted',...extra};
  const reference=a.fingerprint||s.fingerprint;
  item.fingerprint=Audit.fingerprint({strategyId:reference.strategy_id,model:item.account==='model'?s.model:{modelFree:true,strategy:reference.strategy_id},universe:a.strategyUniverse||s.universe,rules:a.strategyRules||s.rules,data:{quote:q||null,side,shares,reason,signalSnapshotHash:s.lastSignalSnapshotHash||null,sourceWatermark:s.quoteWatermarks[u.symbol]||null,corporateEvents:s.corporateEvents},feeProfile:s.feeProfile,budget:s.budget,riskLimits:reference.risk_limits,executionMode:s.fingerprint.execution_mode});
  const unavailable=core.sourceMs(q)<(s.quoteWatermarks[u.symbol]||0)?'reverse_source':!fresh(q,now,core)?'quote_unavailable':!Calendar.isTradingTime(now)?'not_continuous_session':blocked(q,side);
  if(unavailable){item.status='rejected';item.rejectionReason=unavailable;s.orders.push(item);record(s,{type:'order_rejected',account:item.account,symbol:item.symbol,order:clone(item)});return item;}
  const price=Fee.executionPrice(q.price,side,s.feeProfile),notional=shares*price,fees=Fee.costs(u,notional,side,s.feeProfile);
  if(side==='buy'&&notional+fees.total>a.cash+1e-8){item.status='rejected';item.rejectionReason='cash_limit';s.orders.push(item);record(s,{type:'order_rejected',account:item.account,symbol:item.symbol,order:clone(item)});return item;}
  Object.assign(item,{status:'hypothetical_fill',fillAt:iso(now),price,notional,fees,executionVerified:false});
  a.cash+=(side==='buy'?-notional-fees.total:notional-fees.total);a.feesPaid+=fees.total;a.slippageCost+=Math.abs(price-q.price)*shares;s.orders.push(item);record(s,{type:'hypothetical_fill',account:item.account,symbol:item.symbol,order:clone(item)});return item;
 }
 function buy(s,a,u,q,row,now,core,label){
  const o=order(s,a,u,q,'buy',row.shares,'frozen_software_selection',now,core,{account:label});if(o.status!=='hypothetical_fill')return false;
  const entrySession=Calendar.sessionOf(now),maturitySession=row.maturitySession||Calendar.maturitySession(entrySession,20);
  a.holdings.push({symbol:u.symbol,name:u.name,type:u.type,theme:u.theme||u.sector||'technology',shares:row.shares,entryPrice:o.price,entryFee:o.fees.total,entryCosts:o.fees,entrySourceTime:q.sourceTime,entryDate:entrySession,lastPrice:q.price,lastSourceTime:q.sourceTime,lastReceivedAt:q.receivedAt||iso(now),stale:false,signalDate:row.signalDate||null,entrySession,referenceOpen:row.referenceOpen??q.open??null,horizon:20,maturitySession,sellableSession:Calendar.nextSession(entrySession),predicted20DayReturn:row.expectedReturn??null,exitPlan:{version:'expiry-risk-target-v1',maturitySession,stopLossRate:label==='model'?s.rules.stopLossRate:0,stopPrice:label==='model'?o.price*(1-s.rules.stopLossRate):0,targetPrice:label==='model'?row.referenceOpen*(1+row.expectedReturn):Number.MAX_VALUE,...(label==='model'&&s.rules.targetExitEnabled!==undefined?{targetExitEnabled:s.rules.targetExitEnabled}:{}),ruleFrozenAt:s.startedAt,dividendPolicy:'total_return_threshold_adjustment',unfilledPolicy:'retain_position_and_retry_on_next_legal_fresh_quote'},pendingExit:null});
  return true;
 }
 function exitPositions(s,a,quotes,now,core,label){
  const date=Calendar.sessionOf(now);
  for(const h of [...a.holdings]){
   const q=quotes[h.symbol],valid=fresh(q,now,core)&&core.sourceMs(q)>=(s.quoteWatermarks[h.symbol]||0);
   const reason=h.pendingExit?.reason||(date>=h.exitPlan.maturitySession?'maturity':valid&&q.price<=h.exitPlan.stopPrice?'risk_stop':valid&&h.exitPlan.targetExitEnabled!==false&&q.price>=h.exitPlan.targetPrice?'frozen_target':null);if(!reason)continue;
   if(!h.pendingExit){h.pendingExit={reason,requestedAt:iso(now),shares:h.shares};record(s,{type:'exit_intent',account:label,symbol:h.symbol,reason,sourceTime:q?.sourceTime||null,receivedAt:q?.receivedAt||null,sellableSession:h.sellableSession});}
   if(date<h.sellableSession){noteOnce(s,label+':t1:'+h.symbol+':'+date,{type:'exit_blocked',account:label,symbol:h.symbol,reason:'t_plus_one',sellableSession:h.sellableSession});continue;}
   if(!Calendar.isTradingTime(now))continue;
   const attemptKey=label+':exit:'+h.symbol+':'+date+':'+(q?.sourceTime||'missing')+':'+(blocked(q,'sell')||'available');if(s.recordedDecisions[attemptKey])continue;s.recordedDecisions[attemptKey]=true;
   const u=s.universe.find(u=>u.symbol===h.symbol),o=order(s,a,u,q,'sell',h.shares,reason,now,core,{account:label});
   if(o.status==='hypothetical_fill'){const pnl=o.notional-o.fees.total-h.shares*h.entryPrice-h.entryFee;a.closedPnl+=pnl;o.realizedPnl=pnl;a.holdings=a.holdings.filter(x=>x!==h);s.closedPositions.push({...clone(h),account:label,exitOrderId:o.id,exitPrice:o.price,exitAt:iso(now),realizedPnl:pnl});record(s,{type:'position_closed',account:label,symbol:h.symbol,exitOrderId:o.id,realizedPnl:pnl});}
  }
  recalc(a,s.budget);
 }
 function entries(s,quotes,now,context,core){
  s.entryHealth=poolHealth(s,quotes,now,context,core);const date=Calendar.sessionOf(now);
  if(!s.entryHealth.ok||!Calendar.isTradingTime(now)){s.investmentStatus='entry_paused';noteOnce(s,'entry:'+date+':'+(s.entryHealth.reason||'session_closed'),{type:'entry_paused',reason:s.entryHealth.reason||'not_continuous_session',expectedAsOf:s.entryHealth.expectedAsOf});return;}
  const a=s.account,slots=s.riskLimits.maxPositions-a.holdings.length,invested=a.marketValue,limit=Math.min(a.cash,s.riskLimits.investableLimit-invested,s.riskLimits.maxExposure*a.equity-invested);
  if(slots<=0||limit<100){s.investmentStatus=a.holdings.length?'holding':'waiting';return;}
  const predictions=context.predictions||s.signals,universe=s.universe.filter(u=>u.type==='etf'&&!a.holdings.some(h=>h.symbol===u.symbol)&&!s.boughtSignalKeys.includes(u.symbol+':'+(predictions[u.symbol]?.signalDate||predictions[u.symbol]?.asOf)));
  if(!universe.length)return;
  const input={universe,quotes,predictions,now:iso(now),budget:limit,remainingAllocation:true,positionLimit:Math.min(s.settings.positionLimit,limit),maxPositions:slots,minFee:s.minFee,feeProfile:s.feeProfile,allocationMode:s.settings.allocationMode,...(s.rules.minEstimatedNetReturn!==undefined?{minEstimatedNetReturn:s.rules.minEstimatedNetReturn}:{})};
  s.automation.lastPlan=core.plan(input);s.selectionPlan=s.selectionPlan||clone(s.automation.lastPlan);
  const signalKey='signal:'+date+':'+Audit.hash(predictions);if(!s.recordedDecisions[signalKey]){s.recordedDecisions[signalKey]=true;s.lastSignalSnapshotHash=record(s,{type:'signal_snapshot',expectedAsOf:s.entryHealth.expectedAsOf,predictions:clone(predictions),fingerprint:Audit.fingerprint({strategyId:s.fingerprint.strategy_id,model:s.model,universe:s.universe,rules:s.rules,data:{predictions,quotes,corporateEvents:s.corporateEvents},feeProfile:s.feeProfile,budget:s.budget,riskLimits:s.riskLimits,executionMode:s.fingerprint.execution_mode})}).eventHash;}
  for(const row of s.automation.lastPlan.selected){
   const u=universe.find(u=>u.symbol===row.symbol),theme=u.theme||u.sector||'technology',themeValue=a.holdings.filter(h=>h.theme===theme).reduce((n,h)=>n+h.shares*h.lastPrice,0);
   if(themeValue+row.buyCost>s.riskLimits.maxThemeWeight*a.equity+1e-8){noteOnce(s,'theme:'+date+':'+u.symbol,{type:'order_rejected',symbol:u.symbol,reason:'theme_limit',limit:s.riskLimits.maxThemeWeight});continue;}
   if(buy(s,a,u,quotes[u.symbol],row,now,core,'model'))s.boughtSignalKeys.push(u.symbol+':'+row.signalDate);
  }
  recalc(a,s.budget);s.investmentStatus=a.holdings.length?'holding':'waiting_for_valid_signal';
 }
 function comparisonEntries(s,quotes,now,core){
  const etfs=s.universe.filter(u=>u.type==='etf'),choices={hold_etf:etfs.filter(u=>u.symbol===s.rules.benchmarkSymbol),equal_weight:etfs};
  for(const [label,items]of Object.entries(choices)){
   const a=s.comparisons[label];a.strategyUniverse=clone(items);a.strategyRules={...s.rules,stopLossRate:0,targetExit:false,allocationMode:label==='hold_etf'?'preselected_single':'equal_weight',executionSymbols:items.map(u=>u.symbol)};a.fingerprint=Audit.fingerprint({strategyId:'technology-'+label+'-hold20-v1',model:{modelFree:true,strategy:label},universe:items,rules:a.strategyRules,data:{quotes,corporateEvents:s.corporateEvents},feeProfile:s.feeProfile,budget:s.budget,riskLimits:{investableLimit:s.budget,maxExposure:1,maxThemeWeight:1,maxPositions:items.length},executionMode:s.fingerprint.execution_mode});a.entryComplete=items.length>0&&items.every(u=>fresh(quotes[u.symbol],now,core));a.valuationComplete=a.entryComplete;a.complete=a.entryComplete;if(!a.complete){record(s,{type:'benchmark_incomplete',account:label});continue;}
   for(const u of items){const z=core.size(u,quotes[u.symbol],s.budget/items.length,s.minFee,true,s.feeProfile);if(z.shares)buy(s,a,u,quotes[u.symbol],{shares:z.shares,expectedReturn:null},now,core,label);}
   recalc(a,s.budget);
  }
 }
 function create(input,core){
  const now=input.now===undefined?Date.now():ms(input.now);if(!Number.isFinite(now)||!Calendar.isTradingTime(now))throw Error('Paper entries require a current trading session');
  if(input.symbols?.length)throw Error('Continuous automatic account cannot accept manual symbols');
  const budget=input.budget===undefined?10000:input.budget;if(!Number.isFinite(budget)||budget<1000||budget>10000000)throw Error('Invalid paper budget');
  const full=input.allocationMode==='full'||input.preset==='full_capital',feeProfile=Fee.resolve(input),riskLimits={investableLimit:full?budget:Math.min(1500,budget),maxExposure:1,maxPositions:3,maxThemeWeight:1,...clone(input.riskLimits||{})};
  if(!Number.isFinite(riskLimits.investableLimit)||riskLimits.investableLimit<0||riskLimits.investableLimit>budget||!(riskLimits.maxExposure>0&&riskLimits.maxExposure<=1)||!(riskLimits.maxThemeWeight>0&&riskLimits.maxThemeWeight<=1)||!Number.isInteger(riskLimits.maxPositions)||riskLimits.maxPositions<1||riskLimits.maxPositions>3)throw Error('Invalid frozen risk limits');
  const rules={version:'continuous-etf-v1',horizon:20,stopLossRate:input.stopLossRate===undefined?.08:input.stopLossRate,benchmarkSymbol:'sh588000',reinvestedCapitalLimit:riskLimits.investableLimit,signalPolicy:'next_exchange_session_only',fillAssumption:'last_price_adverse_slippage_unverified',calendarVersion:Calendar.version};
  if(input.targetExitEnabled!==undefined){if(typeof input.targetExitEnabled!=='boolean')throw Error('Invalid target exit rule');rules.targetExitEnabled=input.targetExitEnabled;}
  if(input.minEstimatedNetReturn!==undefined){const margin=input.minEstimatedNetReturn;if(typeof margin!=='number'||!Number.isFinite(margin)||margin<0||margin>1)throw Error('Invalid minimum estimated net return');rules.minEstimatedNetReturn=margin;}
  if(!Number.isFinite(rules.stopLossRate)||rules.stopLossRate<=0||rules.stopLossRate>=1)throw Error('Invalid risk exit');
  rules.positionLimit=full?budget:Math.min(input.positionLimit===undefined?500:input.positionLimit,budget);rules.allocationMode=full?'full':'capped';rules.executionSymbols=(input.universe||[]).filter(u=>u.type==='etf').map(u=>u.symbol).sort();rules.themeDefinition='declared-sector-not-look-through';if(!Number.isFinite(rules.positionLimit)||rules.positionLimit<100)throw Error('Invalid frozen position limit');
  const universe=clone(input.universe||[]),startedAt=iso(now),model=clone(input.model||{}),fingerprint=Audit.fingerprint({strategyId:'ridge11-tech-etf-continuous-v1',model,universe,rules,data:{predictions:input.predictions||{},quotes:input.quotes||{},historyHash:input.historyHash||null,corporateEvents:input.corporateEvents||Events.events,dataHealth:input.dataHealth||null},feeProfile,budget,riskLimits,executionMode:input.executionMode||'continuous_paper'});
  const s={schema:2,accountType:'continuous_paper',accountId:input.accountId||'paper-'+Audit.hash({startedAt,fingerprint}).slice(0,20),budget,preset:full?'full_capital':'learning_capped',startedAt,observedAt:startedAt,model,feeProfile,minFee:feeProfile.minFee,feeRate:feeProfile.commissionRate,slippage:feeProfile.slippage,fingerprint,riskLimits,rules,settings:{budget,positionLimit:rules.positionLimit,allocationMode:full?'full':'capped'},universe,signals:clone(input.predictions||{}),corporateEvents:clone(input.corporateEvents||Events.events),account:empty(budget),comparisons:{cash:empty(budget),hold_etf:empty(budget),equal_weight:empty(budget)},ledger:[],orders:[],recordedDecisions:{},boughtSignalKeys:[],closedPositions:[],curve:[],dailyEquity:{},realizedPnl:0,selection:'continuous_etf_model_simulation',horizonAccuracy:null,note:'Persistent simulated account. An observation can end without ending ownership. No real orders or verified order-book execution. Model and rules remain frozen.',automation:{version:'engineering-window-v2',mode:input.historicalReplay?'historical_replay':'live',durationMs:1800000,plannedEndAt:iso(now+1800000),windowEnded:false,done:false,historicalComplete:false,elapsedMs:0,validObservations:0,dataFailureTicks:0,maxGapMs:0,observationStartedAt:startedAt,lastEvaluatedAt:startedAt,events:[],settings:{budget,allocationMode:full?'full':'capped',positionLimit:full?budget:500,maxPositions:riskLimits.maxPositions},lastPlan:{rows:[],selected:[]}}};
  s.quoteWatermarks={};s.comparisons.cash.entryComplete=true;s.comparisons.cash.valuationComplete=true;
  s.comparisons.cash.fingerprint=Audit.fingerprint({strategyId:'cash-hold-v1',model:{modelFree:true},universe:[],rules:{orders:false},data:{initialCapital:budget},feeProfile,budget,riskLimits:{investableLimit:0,maxExposure:0},executionMode:fingerprint.execution_mode});
  record(s,{type:'account_created',initialCapital:budget,preset:s.preset,fingerprint,riskLimits:clone(riskLimits),rules:clone(rules)});
  entries(s,input.quotes||{},now,{dataHealth:input.dataHealth,model:input.model},core);comparisonEntries(s,input.quotes||{},now,core);
  s.automation.validObservations=s.entryHealth.quotePoolComplete?1:0;s.automation.dataFailureTicks=s.entryHealth.quotePoolComplete?0:1;
  watermarks(s,input.quotes||{},now,core);sync(s,now);return seal(s);
 }
 function watermarks(s,quotes,now,core){for(const u of s.universe){const q=quotes[u.symbol],t=core.sourceMs(q);if(Number.isFinite(q?.price)&&q.price>0&&Number.isFinite(t)&&t<=now+30000&&(!q.receivedAt||ms(q.receivedAt)<=now)&&t>(s.quoteWatermarks[u.symbol]||0))s.quoteWatermarks[u.symbol]=t;}}
 function sync(s,now){
  for(const a of [s.account,...Object.values(s.comparisons)])recalc(a,s.budget);s.realizedPnl=s.account.realizedPnl;s.benchmark=s.comparisons.hold_etf;
  s.automation.events=s.orders.filter(o=>o.account==='model').map(o=>({observedAt:o.decisionAt,sourceTime:o.sourceTime,action:o.status==='hypothetical_fill'?o.side:'order_rejected',symbol:o.symbol,shares:o.shares,price:o.price??null,fee:o.fees?.total??null,reason:o.rejectionReason||o.reason})).concat(s.ledger.filter(e=>e.type==='exit_blocked'&&e.account==='model').map(e=>({observedAt:e.decisionAt,sourceTime:null,action:'exit_blocked',symbol:e.symbol,shares:0,reason:e.reason})));
  s.curve.push({observedAt:iso(now),equity:s.account.equity,benchmarkEquity:s.benchmark.equity});s.curve=s.curve.slice(-2000);
  s.dailyEquity[Calendar.sessionOf(now)]={observedAt:iso(now),equity:s.account.equity,cash:s.account.cash,marketValue:s.account.marketValue,receivableValue:s.account.receivableValue,feesPaid:s.account.feesPaid,stalePositions:s.account.holdings.filter(h=>h.stale).map(h=>h.symbol)};
 }
 function step(value,quotes,at,context,core){
  const s=resume(value),now=at===undefined?Date.now():ms(at),previous=ms(s.observedAt);if(!Number.isFinite(now)||now<previous)throw Error('Invalid automatic observation clock');if(now===previous)return s;
  s.observedAt=iso(now);const health=poolHealth(s,quotes,now,context,core),a=s.automation;
  if(!a.windowEnded){a.elapsedMs=now-ms(a.observationStartedAt||s.startedAt);a.maxGapMs=Math.max(a.maxGapMs,now-ms(a.lastEvaluatedAt));a.lastEvaluatedAt=iso(now);if(health.quotePoolComplete)a.validObservations++;else a.dataFailureTicks++;
   if(now>=ms(a.plannedEndAt)){a.windowEnded=true;const good=health.quotePoolComplete&&now-ms(a.plannedEndAt)<=60000&&a.maxGapMs<=(a.mode==='historical_replay'?300000:90000)&&a.dataFailureTicks===0;a.done=good&&a.mode!=='historical_replay';a.historicalComplete=good&&a.mode==='historical_replay';a.failureReason=good?null:'Incomplete engineering observation; investment account continues';record(s,{type:'observation_ended',complete:good,elapsedMs:a.elapsedMs});}}
  holdingMark(s,s.account,quotes,now,core,'model');for(const [name,account]of Object.entries(s.comparisons))holdingMark(s,account,quotes,now,core,name);
  exitPositions(s,s.account,quotes,now,core,'model');for(const [name,account]of Object.entries(s.comparisons))exitPositions(s,account,quotes,now,core,name);
  entries(s,quotes,now,context,core);watermarks(s,quotes,now,core);sync(s,now);return seal(s);
 }
 function observe(value,input={}){const s=resume(value),now=input.now===undefined?Date.now():ms(input.now);if(now<ms(s.observedAt))throw Error('Observation cannot move backward');s.observedAt=iso(now);s.observationHistory=s.observationHistory||[];s.observationHistory.push(clone(s.automation));s.automation={...s.automation,windowEnded:false,done:false,historicalComplete:false,observationStartedAt:iso(now),elapsedMs:0,validObservations:0,dataFailureTicks:0,maxGapMs:0,lastEvaluatedAt:iso(now),plannedEndAt:iso(now+1800000)};record(s,{type:'observation_started',equity:s.account.equity,cash:s.account.cash,noCapitalReset:true});return seal(s);}
 return {create,step,resume,observe};
});
