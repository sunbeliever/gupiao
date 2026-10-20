'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createSession,declaration,claimExperiment}=require('../scripts/candidate-paper-monitor.js');

test('queued and concurrent candidate workers cannot replace an existing experiment',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'techscope-candidate-'));
 try{
  fs.writeFileSync(path.join(dir,'status.json'),JSON.stringify({queued:true,pid:123}));
  assert.throws(()=>claimExperiment(dir),{code:'EXPERIMENT_EXISTS'});
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'status.json'),'utf8')),{queued:true,pid:123});
  fs.unlinkSync(path.join(dir,'status.json'));claimExperiment(dir);
  assert.throws(()=>claimExperiment(dir),{code:'EXPERIMENT_EXISTS'});
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('the second experiment uses fixed names and respects capital caps after minimum-lot costs',()=>{
 const quotes={sh588000:{price:1.4,sourceTime:'2026-10-19 13:01:00'}};
 for(const p of declaration.selected)quotes[p.symbol]={price:p.symbol==='sz300308'?660:306,sourceTime:'2026-10-19 13:01:00'};
 const s=createSession(quotes,'2026-10-19T05:01:00Z');assert.equal(s.budget,500000);assert.equal(s.account.holdings.length,declaration.selected.length);
 for(const h of s.account.holdings){assert.ok(h.shares*h.entryPrice+h.entryFee<=s.budget*.2+1e-7);assert.equal(h.shares%100,0);assert.equal(h.predicted20DayReturn,null);}
 assert.ok(s.account.cash>=s.budget*.4);assert.equal(s.selection,'nonlinear_research_with_cash');assert.equal(s.horizonAccuracy,null);assert.equal(s.model.deployed,false);
});
