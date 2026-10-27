'use strict';
// Read-only evidence classification, never a trade signal or automatic promotion.
// "No large discontinuity detected" is NOT the same as fully verified returns.
const finite = x => typeof x === 'number' && Number.isFinite(x);
function validDate(value) {
 if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
 const date = new Date(value + 'T00:00:00Z');
 return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value;
}
function evidenceProblems(summary, label) {
 const reasons=[];
 if (!summary || typeof summary !== 'object') return [label+'结果无效'];
 if (summary.parityVerified!==true) reasons.push(label+'原账务完整回放一致性未通过');
 const q=summary.dataQuality;
 if (!q || q.priceDiscontinuityGatePassed!==true || !Array.isArray(q.events) || q.events.length)
  reasons.push(label+'原价/复权价异常尚未对账，不接受该区间经济排名');
 if (!['netPnl','maximumOpenCloseObservedDrawdown','meanExposure','feesPaid'].every(k=>finite(summary[k])) ||
     summary.maximumOpenCloseObservedDrawdown<0 || summary.feesPaid<0 || summary.meanExposure<0 || summary.meanExposure>1+1e-8)
  reasons.push(label+'必要绩效指标缺失、无效或超出无杠杆账户范围');
 if (!finite(summary.budget) || summary.budget<=0 || !Array.isArray(summary.period) || summary.period.length!==2 ||
     !summary.period.every(validDate) || summary.period[0]>summary.period[1])
  reasons.push(label+'初始资金或比较区间无效');
 return reasons;
}
function assess(summary, baseline, {warningAmount=500}={}) {
 const no={investmentReady:false,promoted:false,automaticDeploymentAllowed:false};
 if(!summary)return {...no,status:'missing_results',reasons:['尚无完整收益结果，不能用0代替']};
 const reasons=evidenceProblems(summary,'候选：');
 if(baseline!==undefined && baseline!==null) reasons.push(...evidenceProblems(baseline,'基线：'));
 if(!finite(warningAmount) || warningAmount<=0) reasons.push('风险警戒必须是有限正数');
 if(reasons.length)return {...no,status:'blocked_evidence',reasons};
 const concerns=['已观察历史仅用于探索，不是新盲测','没有完成独立未来验证'];
 if(!summary.dataQuality.corporateActionCoverageVerified)concerns.push('公司行动覆盖未独立确认');
 if(!summary.dataQuality.firstAvailabilityVerified)concerns.push('原始数据首次可得时间未独立确认');
 if(summary.maximumOpenCloseObservedDrawdown>warningAmount)concerns.push('观察回撤超过'+warningAmount+'元警戒，警戒不保证限损');
 if(baseline){
  if(JSON.stringify(summary.period)!==JSON.stringify(baseline.period)||summary.budget!==baseline.budget)
   return {...no,status:'incomparable',reasons:['时间区间或初始资金不同，不能直接判优']};
  if(summary.path==='true_buy_hold_three')return {...no,status:'reference_only',reasons:['买入持有不采用相同退出规则；必须披露风险暴露差异'],concerns};
  if(summary.netPnl<=baseline.netPnl)reasons.push('扣费收益未超过原候选');
  if(summary.maximumOpenCloseObservedDrawdown>baseline.maximumOpenCloseObservedDrawdown)reasons.push('观察回撤大于原候选');
 }
 if(summary.netPnl<=0)reasons.push('扣费收益非正');
 return {...no,status:reasons.length?'candidate_rejected':'exploratory_result_only',reasons,concerns,
  riskWarningPassed:summary.maximumOpenCloseObservedDrawdown<=warningAmount,
  returnOptimized:baseline?summary.netPnl>baseline.netPnl:null};
}
function diagnoseCashLock(result){
 if(!result||!Array.isArray(result.daily)||!Array.isArray(result.decisions))throw Error('Complete decision result required');
 const warnings=result.decisions.filter(d=>d.plan?.drawdownWarning),eligible=warnings.filter(d=>d.plan.rows.some(r=>r.eligible));
 let consecutive=0;for(const d of [...result.daily].reverse()){if(d.marketValue>1e-7)break;consecutive++;}
 return {firstWarningDate:warnings[0]?.date||null,drawdownBlockedDays:warnings.length,
  blockedDaysWithEligibleETF:eligible.length,finalConsecutiveCashSessions:consecutive,
  possibleCashLockout:consecutive>0&&eligible.length>0&&warnings.at(-1)?.date===result.daily.at(-1)?.date,
  suggestedAction:'检查500元是提醒还是禁止新增风险的硬规则。保持冻结账户不变；任何恢复条件必须独立预登记并做风险对照，不可为了回测收益直接放宽。'};
}
module.exports={assess,diagnoseCashLock};
