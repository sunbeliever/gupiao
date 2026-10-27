'use strict';
// Deterministic multi-role brief. This is NOT a claim that external LLMs or live news are connected.
const Regime=require('./execution-adapter-l.js'),Gate=require('./evidence-gate-l.js'),News=require('../assets/news-facts.js'),A=require('../assets/audit-identity.js');
function buildBrief(input,{kind='regime_band',anchor,documents=[],analystClaims=[],trustedHosts=[],trustedArchives=[],observedAt=input?.now}={}){
 if(!input||typeof input!=='object'||!Array.isArray(input.universe)||typeof input.now!=='string')throw Error('Explicit manager input with timestamp and universe required');
 const plan=Regime.evaluate(input,{kind,anchor});
 const evidence=Gate.admitDocuments(documents,{decisionAt:input.now,observedAt,symbols:input.universe.map(u=>u.symbol),trustedHosts,trustedArchives,maxAgeDays:30});
 const claimChecks=Gate.validateClaims(analystClaims,evidence);
 const rows=plan.rows.map(row=>{
  const docs=evidence.accepted.filter(d=>d.symbols.includes(row.symbol)),facts=docs.map(d=>({id:d.id,url:d.url,availableAt:d.availableAt,facts:News.analyze({title:d.title,content:d.text,publishedAt:d.publishedAt,firstSeenAt:d.firstSeenAt,url:d.url})}));
  const fundamentals=docs.filter(d=>d.kind==='fundamental'||d.kind==='filing');
  const claims=claimChecks.valid.filter(c=>c.symbol===row.symbol);
  return {...row,
   technicalAnalyst:{status:row.indicators?'computed':'unavailable',method:'fixed_price_rules_not_LLM',signalAsOf:row.signalAsOf||null,indicators:row.indicators||null},
   newsAnalyst:{status:docs.length?'evidence_only_not_alpha':'no_admissible_news',sources:facts,usedInForecast:false},
   fundamentalAnalyst:{status:fundamentals.length?'unquantified_evidence':'missing_point_in_time_fundamentals',sourceIds:fundamentals.map(d=>d.id),estimatedValue:null},
   bullCase:row.eligible?['已完成行情满足固定趋势条件；这不是未来收益预测']:[],
   bearCase:[...(row.reasons||[]),...(row.eligible?['历史趋势可能反转，持仓仍可能亏损']:[]),...(docs.length?['新闻仅作证据，增量收益未验证']:['没有符合时点约束的新闻证据'])],
   externallySuppliedInterpretations:claims,
   riskReviewer:{allowedForRealTrading:false,sourceDataComplete:plan.status==='candidate_ready',warningOnly:plan.drawdownWarning===true,proposedSalesAreNotCash:true},
   expectedReturn:null,profitProbability:null,decisionEvidenceStatus:'price_only_candidate_unpromoted'};
 });
 return {version:'2026.10.27-l',asOf:input.now,historyAsOf:plan.signalAsOf||null,inputHash:A.hash(input),planHash:A.hash(plan),
   snapshotIntegrity:{committedSnapshotVerified:false,reason:'standalone input is hashed but not a verified collector commit; use committed-manager-view-l for the verified bridge'},
   researchOnly:true,executable:false,investmentReady:false,liveFeedConnected:false,llmInvoked:false,liveNewsConnected:false,
   scope:'six_etf_only',plan,rows,evidence,claimChecks,
   roles:['technical','news','fundamentals','bull_and_bear_review','deterministic_risk'],
   limits:['Role separation is implemented; paid LLM providers are not connected or called.',
    'Evidence admission and literal quotes do not establish news alpha or fundamental fair value.',
    'No recommendations for real orders; no automated broker connectivity.',
    'Company actions remain unreconciled; price signals are research-only.']};
}
module.exports={buildBrief};
