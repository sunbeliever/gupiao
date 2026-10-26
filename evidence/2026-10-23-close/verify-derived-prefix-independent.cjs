'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path');
const base=__dirname,sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const output=path.join(base,'independent-prefix-verification.json');
const report={startedAt:new Date().toISOString(),mode:'read_only_hash_chain_and_derived_statistics',paperReplay:false,accountWrites:false,legs:[],limitations:['No Paper.step, Paper.replay or Core.recover invoked. This verifies archived prefix integrity and independently derives observed statistics; it does not repeat financial execution.']};
try{
 const derived=JSON.parse(fs.readFileSync(path.join(base,'daily-close-reference-raw.json')));
 for(const [label,id,budget] of [['capital50k','paired-capital50k-20261021-pm-a',50000],['lowcap','paired-lowcap-20261021-1000-b',10000]]){
  const root='D:/techno/validation/forward-comparison/'+id,A=require(root+'/source/assets/audit-identity.js'),C=require(root+'/source/scripts/paired-forward-core.js');
  const auditBytes=fs.readFileSync(path.join(base,label+'-full-audit.json')),audit=JSON.parse(auditBytes),state=JSON.parse(fs.readFileSync(path.join(base,label+'-closing-state.json'))),manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))),claim=JSON.parse(fs.readFileSync(path.join(root,'experiment.claim')));
  const digest=s=>{const b={...s};delete b.stateHash;delete b.lastTickHash;return A.hash(b);};
  if(!audit.completeReplayAndHashesVerified||audit.manifestHash!==A.hash(manifest)||audit.claimHash!==A.hash(claim)||audit.stateHash!==digest(state)||state.stateHash!==audit.stateHash||state.sequence!==audit.verifiedTicks||state.lastDecisionAt!==audit.lastDecisionAt||sha(auditBytes)!==derived.stats[label].auditSha256)throw Error(label+' archive binding mismatch');
  const stats={};for(const leg of ['candidate','control'])stats[leg]={observations:0,peak:budget,minimumEquity:budget,maxDrawdown:0,maxDrawdownRate:0,maxLossFromInitial:0,maxExposure:0,warningSnapshots:0,todayWarningSnapshots:0,stale:0};
  let count=0,previous=null,last,maxSample=null;
  for(const t of C.storedTicks(root)){
   if(t.sequence>audit.verifiedTicks)break;
   if(t.sequence!==count+1||t.previousHash!==previous)throw Error(label+' sequence/predecessor mismatch at '+t.sequence);
   const body={...t};delete body.state;delete body.tickHash;
   if(A.hash(body)!==t.tickHash||A.hash(t.input)!==t.inputHash||t.state.lastTickHash!==t.tickHash||t.state.stateHash!==t.checkpointDigest||digest(t.state)!==t.checkpointDigest)throw Error(label+' tick/input/checkpoint/state hash mismatch at '+t.sequence);
   count++;previous=t.tickHash;last=t;
   for(const leg of ['candidate','control']){
    const v=t.summaries?.[leg];if(!v)continue;if(!Number.isFinite(v.equity)||v.accountingBalanced!==true)throw Error('Invalid observed equity');
    const s=stats[leg];s.observations++;s.peak=Math.max(s.peak,v.equity);s.minimumEquity=Math.min(s.minimumEquity,v.equity);const dd=s.peak-v.equity;
    if(label==='capital50k'&&leg==='candidate'&&dd>s.maxDrawdown)maxSample={sequence:t.sequence,decisionAt:t.decisionAt,tickHash:t.tickHash,health:{ok:t.dataHealth.ok,reason:t.dataHealth.reason,historyOk:t.dataHealth.historyOk},equity:v.equity,stalePositions:v.stalePositions,accountingBalanced:v.accountingBalanced};
    s.maxDrawdown=Math.max(s.maxDrawdown,dd);s.maxDrawdownRate=Math.max(s.maxDrawdownRate,dd/s.peak);s.maxLossFromInitial=Math.max(s.maxLossFromInitial,budget-v.equity);s.maxExposure=Math.max(s.maxExposure,v.exposure||0);if(v.stalePositions?.length)s.stale++;
    if(label==='capital50k'&&Math.max(budget-v.equity,dd)>=500){s.warningSnapshots++;if(t.decisionAt.startsWith('2026-10-23'))s.todayWarningSnapshots++;}
   }
  }
  if(count!==audit.verifiedTicks||last.state.stateHash!==state.stateHash||last.tickHash!==state.lastTickHash||last.tickHash!==derived.stats[label].lastTickHash||last.decisionAt!==state.lastDecisionAt)throw Error(label+' terminal prefix mismatch');
  for(const leg of ['candidate','control'])for(const [k,v] of Object.entries(stats[leg]))if(Math.abs(v-derived.stats[label][leg][k])>1e-7)throw Error(label+' derived '+leg+'.'+k+' mismatch');
  if(maxSample){const expected=JSON.parse(fs.readFileSync(path.join(base,'maximum-risk-sample.json')));if(maxSample.sequence!==expected.sequence||maxSample.tickHash!==expected.tickHash||maxSample.equity!==expected.summary.equity||maxSample.health.ok!==true||maxSample.stalePositions.length)throw Error('Maximum risk sample mismatch');}
  report.legs.push({id,label,verifiedTicks:count,manifestHash:audit.manifestHash,claimHash:audit.claimHash,auditSha256:sha(auditBytes),stateHash:state.stateHash,lastTickHash:last.tickHash,lastDecisionAt:last.decisionAt,statistics:stats,maximumRiskSample:maxSample});
 }
 report.accepted=true;
}catch(e){report.accepted=false;report.error=e.stack;process.exitCode=1;}
report.finishedAt=new Date().toISOString();report.verifierSha256=sha(fs.readFileSync(__filename));fs.writeFileSync(output,JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify({accepted:report.accepted,error:report.error,finishedAt:report.finishedAt,legs:report.legs.map(l=>({label:l.label,verifiedTicks:l.verifiedTicks,stateHash:l.stateHash})),output}));
