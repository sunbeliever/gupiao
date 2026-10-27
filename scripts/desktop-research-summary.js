'use strict';
// Bounded read-only projection. No account writes, trading, training or network calls.
const fs=require('node:fs'),path=require('node:path'),Core=require('./paired-forward-core.js'),Bridge=require('./committed-manager-view-l.js');
const ACCOUNT='paired-capital50k-20261021-pm-a',MODEL='f0b16e0c0922e3ae051015c3f73a66135c2a0b4ed478b5c0a3bfe6471ad0b0dd';
const SYMBOLS=require('./investment-decision-engine.js').SYMBOLS;
const POLICY='monitor-only-weekly-l1';
const ACTIONS=new Set(['observe','hold','candidate_buy','add','reduce','exit','wait_t1','wait_sell_blocked','wait_lot_verification','partial_sellable_review','review_lot_risk']);
const REASONS={positive_momentum20:'20日历史动量为正',hfq_above_ma60:'已完成日线位于60日均线上方',trend_invalid:'趋势条件已失效',rank_excluded:'相对强弱未进入候选前三',risk_stop:'持仓风险价已触及',pending_exit:'已有待退出请求',maturity:'已到研究持有期限',off_cadence_no_resize:'不在固定调仓时点，继续核对退出条件',wait_t1:'受T+1限制',wait_sell_blocked:'当前卖出受限',wait_lot_verification:'持仓批次待核验',partial_sellable_review:'仅部分批次可卖',cash_cap_or_lot_unavailable:'现金、投入限额或整手条件不足'};
const integer=n=>Number.isSafeInteger(n)&&n>=0,finite=n=>typeof n==='number'&&Number.isFinite(n);
function identity(view){return view&&view.id===ACCOUNT&&view.modelHash===MODEL&&view.budget===50000&&Number.isFinite(Date.parse(view.at))&&integer(view.sequence);}
function envelope(view,candidate){return {schema:1,accountId:ACCOUNT,modelHash:MODEL,at:view?.at||null,sequence:view?.sequence??null,candidate};}
function unavailable(view){return envelope(view,{available:false,policyId:POLICY,executable:false,investmentReady:false,message:'候选等待同一份新鲜、已提交的完整行情；原账户及历史表现不受影响。'});}
function compact(brief,view){
 if(!identity(view)||brief?.executable!==false||brief.investmentReady!==false||brief.scope!=='six_etf_only'||brief.snapshotIntegrity?.committedSnapshotVerified!==true||brief.provenance?.accountId!==ACCOUNT||brief.provenance.sequence!==view.sequence||brief.provenance.asOf!==view.at||brief.plan?.candidateId!==POLICY||brief.plan.status!=='candidate_ready'||!Array.isArray(brief.rows)||brief.rows.length!==6||new Set(brief.rows.map(r=>r.symbol)).size!==6)throw Error('Unverified desktop proposal identity');
 const equity=view.legs?.candidate?.equity;if(!finite(equity)||equity<=0)throw Error('Invalid current equity');
 const rows=brief.rows.map(row=>{
  if(!SYMBOLS.includes(row.symbol)||typeof row.name!=='string'||row.name.length>200||!ACTIONS.has(row.action)||!integer(row.currentShares)||!integer(row.desiredShares)||!finite(row.desiredMarketValue)||row.desiredMarketValue<0||row.desiredMarketValue>equity||!Array.isArray(row.reasons)||row.reasons.length>40)throw Error('Invalid compact proposal');
  const sellable=row.verifiedSellableShares;
  if(sellable!==null&&(!integer(sellable)||sellable>row.currentShares))throw Error('Invalid sellable quantity');
  const stop=row.riskScenarios?.existingStopPrice;
  return {symbol:row.symbol,name:row.name,action:row.action,currentShares:row.currentShares,targetShares:row.desiredShares,targetWeight:row.desiredMarketValue/equity,sellableShares:sellable,
   reasons:row.reasons.slice(0,8).map(code=>REASONS[code]||'固定研究规则及成本约束仍需核验'),
   exitConditions:['趋势失效、排名落选、到期或风险条件触发时核对退出；仍受T+1与合法报价约束',...(finite(stop)&&stop>0?['原持仓风险参考价 '+stop.toFixed(6)+'，不保证成交']:[])],expectedHoldingPeriod:'20个交易日研究期限；不是收益承诺'};
 });
 return envelope(view,{available:true,policyId:POLICY,investmentReady:false,executable:false,committedSnapshotVerified:true,inputAsOf:view.at,rows,forecastProbability:null,expectedReturn:null,newsConnected:false,
  riskContract:'500元仅监测，候选不因该警戒永久停止新增；与原冻结账户风险合同不同，未晋级。'});
}
function json(file){const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.size>32*1024*1024)throw Error('Unsafe snapshot file');return JSON.parse(fs.readFileSync(file,'utf8'));}
function read(directory,view,now=Date.now()){
 if(!identity(view)||!view.fresh||!finite(now)||now-Date.parse(view.at)<0||now-Date.parse(view.at)>90000)return unavailable(view);
 try{
  const data=Object.fromEntries(['manifest','claim','state','status'].map(k=>[k,json(path.join(directory,k==='claim'?'experiment.claim':k+'.json'))]));
  data.tick=Core.lastTick(directory,{maxBytes:16*1024*1024});if(!data.tick)throw Error('No committed input');data.histories=data.tick.input.histories;data.quotes=data.tick.input.quotes;
  return compact(Bridge.prepare(data,view,new Date(now).toISOString(),{kind:'monitor_only',anchor:'2025-01-03',documents:[],analystClaims:[],trustedHosts:[]}),view);
 }catch(_){return unavailable(view);}
}
module.exports={compact,read};
