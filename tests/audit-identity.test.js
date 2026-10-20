'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),vm=require('node:vm'),fs=require('node:fs');
const Audit=require('../assets/audit-identity.js');

test('canonical SHA256 equals Node crypto for unicode and long data in browser and Node',()=>{
 const sandbox={};vm.runInNewContext(fs.readFileSync(require.resolve('../assets/audit-identity.js'),'utf8'),sandbox);
 for(const value of ['',null,{},[],{b:1,a:'科技😀'},'x'.repeat(10000),{nested:[1,true,null,{z:2,a:1}]}]){
  const expected=crypto.createHash('sha256').update(Audit.canonical(value),'utf8').digest('hex');
  assert.equal(Audit.hash(value),expected);assert.equal(sandbox.AuditIdentity.hash(value),expected);
 }
 assert.equal(Audit.hash({b:2,a:1}),Audit.hash({a:1,b:2}));assert.notEqual(Audit.hash([1,2]),Audit.hash([2,1]));
});

test('fingerprint binds strategy model universe rules data costs and risk budget without inventing an upgrade',()=>{
 const input={strategyId:'ridge-20-1-2026-09-30-28766',model:{weights:[1,2]},universe:[{symbol:'sh588000'}],rules:{horizon:20},data:{asOf:'2026-10-19'},feeProfile:{version:'cn-paper-fees-v1',minFee:5},budget:10000,riskLimits:{maxPositions:3},executionMode:'paper-live'};
 const x=Audit.fingerprint(input);assert.equal(x.strategy_id,input.strategyId);assert.equal(x.model_hash,Audit.hash(input.model));assert.equal(x.data_hash,Audit.hash(input.data));assert.equal(x.rules_hash,Audit.hash(input.rules));assert.equal(x.universe_version,'sha256:'+Audit.hash(input.universe));assert.deepEqual(x.risk_limits,input.riskLimits);assert.equal(x.execution_mode,'paper-live');
 x.fee_profile.minFee=0;assert.equal(input.feeProfile.minFee,5);
 assert.notEqual(Audit.fingerprint({...input,data:{asOf:'2026-10-20'}}).data_hash,x.data_hash);
});

test('ambiguous canonical inputs are rejected rather than silently sharing a fingerprint',()=>{
 for(const value of [undefined,NaN,Infinity,()=>1,{x:undefined},new Date('2026-10-20')])assert.throws(()=>Audit.canonical(value),/Unsupported|Non-finite/);
 const cyclic={};cyclic.self=cyclic;assert.throws(()=>Audit.hash(cyclic),/Cyclic/);
});
