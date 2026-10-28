'use strict';
// Offline actual-CLI boundary probe. Virtual policy input; no production writes,
// account module reads, network, child execution, or queue access.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const base=require('node:path').resolve(__dirname,'../..').replace(/\\/g,'/');
const P=require(base+'/scripts/research-data-schedule.js'),C=require(base+'/assets/trading-calendar.js');
const source=fs.readFileSync(base+'/scripts/research-dataset.js','utf8');
function probe(when,mutate=()=>{}){
 const policy=P.plan('D:/techno/validation/autonomous-research',Date.parse('2026-10-29T01:00:00Z'));mutate(policy);
 let errors=[],accountBoundary=0,childCalls=0;const m={exports:{}};
 const req=id=>{
  if(id==='node:fs')return{readFileSync:f=>{assert.equal(f,'virtual-policy.json');return JSON.stringify(policy);},existsSync:()=>false};
  if(id==='../assets/trading-calendar.js')return C;
  if(id==='./research-data-schedule.js')return P;
  if(id==='node:child_process')return{execFileSync:()=>{childCalls++;throw Error('Forbidden child');}};
  if(id.startsWith('D:/')){accountBoundary++;throw Error('OFFLINE_ACCOUNT_BOUNDARY');}
  return require(id);
 };req.main=m;
 const now=Date.parse(when),NativeDate=Date;
 class FakeDate extends NativeDate{constructor(...a){super(...(a.length?a:[now]));}static now(){return now;}}
 const proc={argv:['node',base+'/scripts/research-dataset.js','virtual-policy.json'],exitCode:0};
 vm.runInNewContext(source,{require:req,module:m,exports:m.exports,process:proc,console:{log:()=>{},error:e=>errors.push(String(e))},Date:FakeDate,JSON,Buffer,__filename:base+'/scripts/research-dataset.js',__dirname:base+'/scripts'},{filename:base+'/scripts/research-dataset.js'});
 assert.equal(childCalls,0);
 return{when,exitCode:proc.exitCode,errors:errors.map(e=>e.split('\n')[0]),accountBoundary,childCalls};
}
if(require.main===module){console.log(JSON.stringify(['2026-10-29T08:21:00Z','2026-10-30T02:00:00Z'].map(t=>probe(t)),null,2));}
module.exports={probe};
