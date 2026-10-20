'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('technical MAE acceptance stores research only and cannot replace the approved prediction model',async()=>{
 const source=fs.readFileSync(require.resolve('../assets/ui.js'),'utf8'),start=source.indexOf('  async function trainModel('),end=source.indexOf('  async function runBacktest(',start),writes=[];
 const original={version:'approved',alpha:1},candidate={version:'unproven-candidate'},state={model:original,histories:{fixture:[{date:'2026-10-19'}]},training:false,busy:false,evaluating:false,backtestAlpha:1};
 const ctx={state,Analysis:{updateChampion:()=>({accepted:true,model:candidate,reason:'MAE lower'})},Market:{validateHistoryPool:()=>({ok:true})},Date,Promise,setTimeout:fn=>fn(),finite:Number.isFinite,latestDate:()=> '2026-10-19',today:()=> '2026-10-20',renderActive(){},recomputePredictions(){},showToast(){},safeError:e=>e.message,safeStorageWrite:(key,value)=>writes.push({key,value})};
 vm.runInNewContext(source.slice(start,end)+';this.trainCandidate=trainModel;',ctx);await ctx.trainCandidate(true);
 assert.equal(state.model,original);assert.equal(state.upgrade.deployed,false);assert.ok(writes.some(w=>w.key==='model.researchCandidate'&&w.value.version==='unproven-candidate'));assert.equal(writes.some(w=>w.key==='model.current'),false);
});
