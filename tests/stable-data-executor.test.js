'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const R=require('../scripts/autonomous-research.js'),Schedule=require('../scripts/research-data-schedule.js');
function executeAt(when,mutate=()=>{}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'stable-executor-')),policy=Schedule.plan(dir,Date.parse('2026-10-29T01:00:00Z'));mutate(policy);
 const file=path.join(dir,'policy.json'),bytes=JSON.stringify(policy);fs.writeFileSync(file,bytes);
 const payload={file,sha256:R.hash(bytes)},job={kind:'data_collect',payload:JSON.stringify(payload),policyHash:R.hash({kind:'data_collect',payload})};
 const cp=require('node:child_process'),Dataset=require('../scripts/research-dataset.js'),oldExec=cp.execFileSync,oldVerify=Dataset.verify,oldNow=Date.now;let childCalls=0;
 try{
  Date.now=()=>Date.parse(when);
  cp.execFileSync=(exe,args)=>{childCalls++;assert.equal(args.at(-1),file);return JSON.stringify({id:policy.id,manifestHash:'a'.repeat(64),datasetHash:'b'.repeat(64),series:[]});};
  Dataset.verify=()=>({manifestHash:'a'.repeat(64)});
  const result=R.execute(job);assert.equal(fs.readFileSync(file,'utf8'),bytes);return {result,childCalls};
 }finally{Date.now=oldNow;cp.execFileSync=oldExec;Dataset.verify=oldVerify;assert.equal(path.dirname(dir),fs.realpathSync(os.tmpdir()));assert.ok(path.basename(dir).startsWith('stable-executor-'));fs.rmSync(dir,{recursive:true,force:true});}
}
test('declared stable prior-session policy reaches child after 16:00 without changing cutoff',()=>{const x=executeAt('2026-10-29T08:21:00Z');assert.equal(x.childCalls,1);assert.equal(x.result.accepted,true);});
test('legacy ordinary collection still refuses an old cutoff after 16:00',()=>{assert.throws(()=>executeAt('2026-10-29T08:21:00Z',p=>{delete p.sourceBinding;p.id='ordinary-data-2026-10-29';}),/completed-session/);});
test('bad binding cannot use stable exception even while prior cutoff happens to equal latest',()=>{assert.throws(()=>executeAt('2026-10-29T02:00:00Z',p=>{p.sourceBinding.protocolSha256='0'.repeat(64);}),/stable/i);});
test('stable capture is refused before its scheduled 09:00 and before its capture day',()=>{assert.throws(()=>executeAt('2026-10-29T00:59:59Z'),/stable/i);assert.throws(()=>executeAt('2026-10-28T09:00:00Z'),/stable/i);});
test('deferred valid job keeps its original planned capture cutoff on the following session',()=>{assert.equal(executeAt('2026-10-30T02:00:00Z').childCalls,1);});
