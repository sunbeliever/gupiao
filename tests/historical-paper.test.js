'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Replay=require('../scripts/historical-paper-replay.js');
test('missing future exit remains unresolved instead of becoming cash after a valid entry',()=>{
 const bars=Array.from({length:30},(_,i)=>({date:'2023-01-'+String(i+1).padStart(2,'0'),open:100+i,close:100+i,high:101+i,low:99+i,volume:1000}));
 const frozen={rounds:[{signalDate:bars[0].date,model:{cutoff:bars[0].date,labelEndMax:bars[0].date},predictions:[{symbol:'A',expectedReturn:.1}],chosen:[{symbol:'A',expectedReturn:.1}]}],limitations:[]};
 const complete=Replay.score(frozen,{A:bars,B:bars});assert.ok(complete.rounds[0].modelReturn>0);
 const missing=Replay.score(frozen,{A:bars.filter((_,i)=>i!==21),B:bars});assert.equal(missing.rounds[0].modelReturn,null);assert.equal(missing.summary.unresolvedRounds,1);assert.equal(missing.summary.modelCompoundReturn,null);
});
test('2023 sampled decisions use prefix data and never the later validation alpha',()=>{const c={window:{}};vm.runInNewContext(fs.readFileSync(require.resolve('../assets/seed.js'),'utf8'),c);const histories=c.window.TECH_SEED.histories;const frozen=Replay.freeze(histories);assert.equal(frozen.rounds.length,8);for(const r of frozen.rounds){assert.equal(r.model.alpha,.1);assert.ok(r.model.labelEndMax<=r.signalDate);assert.equal(r.model.cutoff,r.signalDate);for(const p of r.chosen)assert.ok(p.features.asOf<=r.signalDate);}
 const cutoff=frozen.rounds[0].signalDate,changed=Object.fromEntries(Object.entries(histories).map(([s,bars])=>[s,bars.map(b=>b.date>cutoff?{...b,open:b.open*10,close:b.close*10,high:b.high*10,low:b.low*10}:b)]));assert.deepEqual(Replay.freeze(changed).rounds[0],frozen.rounds[0]);
 const report=Replay.score(frozen,histories);for(let i=1;i<report.rounds.length;i++)assert.ok(report.rounds[i].signalDate>report.rounds[i-1].exitDate);assert.equal(report.summary.rounds,8);assert.ok(Number.isFinite(report.summary.mae));
});
