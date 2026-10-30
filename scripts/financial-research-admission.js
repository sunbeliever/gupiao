'use strict';
const A=require('../assets/audit-identity.js'),C=require('../assets/trading-calendar.js'),P=require('./covered-research-input.js');
const ID='covered-financial-20261030-a';
// Only independently reviewed protocol digests may be installed here in a reviewed source change.
// No real financial protocol has been approved yet. Requests cannot extend this registry.
const APPROVED_PROTOCOL_HASHES=Object.freeze({});
function validateDeclaration(x){
 const {protocol:p,qualification:q,policy,data,kind,expectedProtocolHash}=x||{};
 if(!p||p.schema!==1||p.id!==ID||p.stage!=='approved_historical_exploration'||!['decision_thesis','true_buy_hold_three'].includes(kind)||p.kind!==kind||p.candidateId!=='trend-relative20-risk-v1'||p.independentFuture!==false||!/^[a-f0-9]{64}$/.test(expectedProtocolHash||'')||A.hash(p)!==expectedProtocolHash)throw Error('Invalid registered financial declaration');
 if(A.hash(policy)!==p.policyHash||A.hash(data)!==p.dataHash||A.hash(q)!==p.qualificationHash)throw Error('Registered financial input binding mismatch');
 if(data?.provenance?.kind==='synthetic-contract')throw Error('Synthetic input cannot use the financial entry');
 if(!q||['cashCoverageComplete','splitEventSequenceComplete','otherEntitlementsAbsent','lotRightsVerified','financialExecutionAuthorized'].some(k=>q[k]!==true)||q.historicalFirstAvailabilityVerified!==false||q.executionModel!=='raw_daily_open_hypothesis'||!Array.isArray(q.evidenceHashes)||!q.evidenceHashes.length||q.evidenceHashes.some(h=>!/^[a-f0-9]{64}$/.test(h)))throw Error('Financial evidence qualification incomplete');
 if(q.scope?.start!==policy.start||q.scope?.end!==policy.end||!C.isSession(policy.start)||!C.isSession(policy.end))throw Error('Financial qualification scope mismatch');
 return {protocolId:p.id,protocolHash:expectedProtocolHash,qualificationHash:p.qualificationHash,historicalFirstAvailabilityVerified:false};
}
function admit(x){const approved=APPROVED_PROTOCOL_HASHES[x?.protocol?.id];if(!approved||approved!==x?.expectedProtocolHash)throw Error('No independently approved financial protocol installed');const declaration=validateDeclaration(x),prepared=P.slice(x.data,{start:x.policy.start,end:x.policy.end});if(A.hash(prepared.data)!==A.hash({raw:x.data.raw,histories:x.data.histories}))throw Error('Financial data contains rows outside the sealed covered slice');return declaration;}
module.exports={validateDeclaration,admit};
