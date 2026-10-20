'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{lot}=require('./prepare-cost-aware-data.js');
const C=require('../assets/corporate-actions.js'),E=require('../assets/corporate-events.js');
const root=path.resolve(__dirname,'..'),OUT=path.join(root,'validation',process.argv.includes('--full-capital')?'full-capital-optimization':process.argv.includes('--corrected')?'cost-aware-v2':'cost-aware-optimization');
function simulate({calendar,raw,histories,signals,year,rule,policy,events=[]}){
 const maps=Object.fromEntries(Object.entries(raw).map(([s,b])=>[s,Object.fromEntries(b.map(x=>[x.date,x]))])),adjusted=Object.fromEntries(Object.entries(histories).map(([s,b])=>[s,Object.fromEntries(b.map(x=>[x.date,x]))])),byDate={};for(const s of signals)(byDate[s.date]||=[]).push(s);
 const indices=calendar.map((d,i)=>d.startsWith(year+'-')?i:-1).filter(i=>i>=0),last=indices.at(-1),holdings=[],trades=[],decisions=[],curve=[],corporateActionWarnings=[],account={cash:policy.budget,holdings,receivables:[]};let cash=policy.budget,peak=cash,maxDrawdown=0,unresolved=false,failure=null,exposureSum=0;
 const fail=(date,symbol,stage)=>{unresolved=true;failure={date,symbol,stage};};
 for(const i of indices){const date=calendar[i],signalDate=calendar[i-1];
  // Detect unknown adjustments before any ex-date exit removes a holding.
  for(const h of holdings){const q=maps[h.symbol]?.[date],a=adjusted[h.symbol]?.[date],prev=maps[h.symbol]?.[signalDate],ap=adjusted[h.symbol]?.[signalDate];if(!q||!a)continue;
   const changed=policy.corporateActions?prev&&ap&&Math.abs(q.open/prev.close-a.open/ap.close)>.025&&!events.some(e=>e.symbol===h.symbol&&e.exDate===date):Number.isFinite(h.initialAdjustment)&&Math.abs((a.close/q.close)/h.initialAdjustment-1)>.005;
   if(changed&&!corporateActionWarnings.some(w=>w.symbol===h.symbol&&w.entryDate===h.entryDate))corporateActionWarnings.push({symbol:h.symbol,entryDate:h.entryDate,date,reason:'Unreconciled raw/adjusted price change; no automatic deployment.'});
  }
  account.cash=cash;if(policy.corporateActions)C.applyAccount(account,events,date);cash=account.cash;
  for(const h of [...holdings])if(i>=h.exitIndex){const q=maps[h.symbol]?.[date];if(!q){fail(date,h.symbol,'missing_exit');break;}const price=q.open*(1-policy.slippage),value=h.shares*price,fee=Math.max(policy.minFee,value*policy.feeRate),netPnl=value-fee-h.entryPrice*h.shares-h.entryFee+(h.dividendIncome||0);
   cash+=value-fee;holdings.splice(holdings.indexOf(h),1);trades.push({...h,exitDate:date,exitIndex:i,exitPrice:price,exitFee:fee,netPnl,netReturn:netPnl/(h.entryPrice*h.shares+h.entryFee)});
  }
  if(unresolved)break;
  if(signalDate&&i+policy.horizon<=last&&holdings.length<policy.maxPositions&&(policy.allocationMode!=='full'||holdings.length===0)){
   const eligible=(byDate[signalDate]||[]).filter(r=>Number.isFinite(r.expectedNetReturn)&&r.expectedNetReturn>rule.netMargin&&(!rule.trendFilter||r.trend&&r.breadth>=.5)&&!holdings.some(h=>h.symbol===r.symbol)).sort((a,b)=>b.expectedNetReturn-a.expectedNetReturn||a.symbol.localeCompare(b.symbol));
   const selected=eligible.slice(0,policy.maxPositions-holdings.length),decision={signalDate,entryDate:date,selected:selected.map(r=>r.symbol),scores:selected.map(r=>({symbol:r.symbol,expectedNetReturn:r.expectedNetReturn})),model:rule.model};decisions.push(decision);
   const allocation=policy.allocationMode==='full'&&selected.length?cash/selected.length:policy.positionLimit;
   for(const r of selected){const q=maps[r.symbol]?.[date];if(!q){fail(date,r.symbol,'missing_entry');break;}const z=lot(q.open,{...policy,positionLimit:allocation});if(!z.shares||z.shares*z.price+z.fee>cash)continue;
    cash-=z.shares*z.price+z.fee;holdings.push({symbol:r.symbol,signalDate,entryDate:date,entryIndex:i,exitIndex:i+policy.horizon,shares:z.shares,entryPrice:z.price,entryFee:z.fee,expectedNetReturn:r.expectedNetReturn,initialAdjustment:adjusted[r.symbol]?.[date]?.close/q.close});
   }
  }
  if(unresolved)break;
  let value=0;for(const h of holdings){const q=maps[h.symbol]?.[date];if(!q){fail(date,h.symbol,'missing_mark');break;}value+=h.shares*q.close;
  }
  if(unresolved)break;
  const equity=cash+value+C.receivableValue(account);peak=Math.max(peak,equity);maxDrawdown=Math.max(maxDrawdown,1-equity/peak);exposureSum+=value/equity;curve.push({date,equity,cash,receivables:C.receivableValue(account),exposure:value/equity});
 }
 const equity=unresolved?null:curve.at(-1)?.equity??policy.budget,gains=trades.reduce((s,t)=>s+Math.max(0,t.netPnl),0),losses=-trades.reduce((s,t)=>s+Math.min(0,t.netPnl),0),closedPnl=trades.reduce((s,t)=>s+t.netPnl,0);
 return {year,rule,unresolved,failure,budget:policy.budget,endEquity:equity,netReturn:equity===null?null:equity/policy.budget-1,maxDrawdown,averageExposure:curve.length?exposureSum/curve.length:0,closedPositions:trades.length,closedPnl,profitablePositions:trades.filter(t=>t.netPnl>0).length,winRate:trades.length?trades.filter(t=>t.netPnl>0).length/trades.length:null,profitFactor:losses?gains/losses:null,noLossTrades:trades.length>0&&losses===0,profitable:!unresolved&&trades.length>0&&closedPnl>0&&equity>policy.budget,openPositions:holdings.length,corporateActionWarnings,priceOnly:!policy.corporateActions,trades,decisions,curve};
}
function calculate(year,rule){const data=JSON.parse(fs.readFileSync(path.join(OUT,'dataset.json'),'utf8')),prices=JSON.parse(fs.readFileSync(path.join(OUT,'daily-prices.json'),'utf8')),manifest=JSON.parse(fs.readFileSync(path.join(OUT,'manifest-frozen.json'),'utf8')),p=manifest.policy,scores=JSON.parse(fs.readFileSync(path.join(OUT,'predictions-'+year+'.json'),'utf8'));if(p.corporateActions&&!manifest.corporateEvents?.events)throw new Error('Frozen corporate event ledger missing');return simulate({calendar:data.calendar,...prices,signals:scores.predictions[rule.model],year,rule,policy:p,events:p.corporateActions?manifest.corporateEvents.events:[]});}
function candidates(){const p=JSON.parse(fs.readFileSync(path.join(OUT,'manifest-frozen.json'),'utf8')).policy;return ['robust25-huber','net25-histogram-tree'].flatMap(model=>p.candidatePolicies.netMargins.flatMap(netMargin=>p.candidatePolicies.trendFilters.map(trendFilter=>({model,netMargin,trendFilter}))));}
const compact=r=>Object.fromEntries(Object.entries(r).filter(([k])=>!['trades','decisions','curve'].includes(k)));
function select(){
 const target=path.join(OUT,'selection-frozen.json');if(fs.existsSync(target))throw new Error('Policy selection already frozen; do not retune');
 const p=JSON.parse(fs.readFileSync(path.join(OUT,'manifest-frozen.json'),'utf8')).policy,extra=p.selectionIncludesBaselines?[{model:'original11-ridge',netMargin:0,trendFilter:false},{model:'trend-baseline',netMargin:0,trendFilter:true}]:[];
 const validation=candidates().concat(extra).map(r=>calculate(2023,r)),valid=validation.filter(r=>r.profitable&&r.closedPositions>=9&&(r.profitFactor>1||r.noLossTrades)&&!r.unresolved);
 valid.sort((a,b)=>(b.netReturn-1.5*b.maxDrawdown)-(a.netReturn-1.5*a.maxDrawdown)||JSON.stringify(a.rule).localeCompare(JSON.stringify(b.rule)));
 const choice=valid[0]?.rule||null,baselines=[{model:'original11-ridge',netMargin:0,trendFilter:false},{model:'trend-baseline',netMargin:0,trendFilter:true}].map(r=>calculate(2023,r));
 const result={selectedAt:new Date().toISOString(),selected:choice,selectionYear:2023,criterion:'Positive net and closed PnL, >=9 closed positions, profitFactor>1; maximize netReturn-1.5*drawdown. All-cash never qualifies.',validation,baselines,deployed:false};
 fs.writeFileSync(target,JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify({selected:choice,validation:validation.map(compact),baselines:baselines.map(compact)}));
}
function evaluate(){
 const target=path.join(OUT,'report.json');if(fs.existsSync(target))throw new Error('Final test report already exists; do not replace its results');
 const frozenText=fs.readFileSync(path.join(OUT,'selection-frozen.json')),selection=JSON.parse(frozenText),base=[{model:'original11-ridge',netMargin:0,trendFilter:false},{model:'trend-baseline',netMargin:0,trendFilter:true}];
 // Rejected candidates remain rejected; show all already-declared challengers for transparency only.
 const rules=[...new Map((selection.selected?[...base,selection.selected]:[...base,...candidates()]).map(r=>[JSON.stringify(r),r])).values()],reports=[2024,2025,2026].flatMap(year=>rules.map(r=>calculate(year,r))),report={scoredAt:new Date().toISOString(),selectionSha256:crypto.createHash('sha256').update(frozenText).digest('hex'),selected:selection.selected,validation:selection,sourceAsOf:'2026-09-30',reports,deployed:false,investmentReadiness:'unproven',note:'2024-2026 are reused retrospective development years, not a fresh blind holdout. Annual windows stop opening new20-session positions during their final20 observed sessions, allowing all positions to exit inside the fixed evaluation window. Missing data never causes replacement of a chosen position. Price-only PnL excludes distributions; all corporate-action flags are retained. No paid services or real orders.'};
 if(process.argv.includes('--corrected')||process.argv.includes('--full-capital')){report.corporateActionsApplied=true;report.baselineDescription='The11-feature standardized ridge is refitted on the same six ETFs and corrected gross-return labels; it is a model-family control, not the unchanged original19-asset deployed weights.';report.note='Corrected historical development: verified split units applied before ex-date exits, dividends accrued as receivables and paid on published pay-date. Same predeclared models/grid and2023 selection. Prior flawed price-only reports retained separately.2024-2026 have already been examined, so this is not a new blind holdout. No automatic deployment. Annual windows stop new entries in their last20 sessions and all positions close; missing prices remain unresolved.';}
 fs.writeFileSync(target,JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify({selected:report.selected,deployed:false,rows:reports.map(compact)}));
}
if(require.main===module)try{if(process.argv.includes('--select'))select();else if(process.argv.includes('--evaluate'))evaluate();else throw new Error('Use --select or --evaluate');}catch(e){console.error(e.stack);process.exitCode=1;}
module.exports={simulate,calculate,candidates};
