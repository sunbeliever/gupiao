'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),R=require('../scripts/historical-auto-replay.js'),Paper=require('../assets/paper-engine.js');
const universe=[{symbol:'sh588000',name:'ETF',type:'etf'}],model={cutoff:'2026-09-30',version:'fixture'},policy={seed:20261019,maxWindows:24,windowStartsChina:['09:35:00'],durationMs:1800000,budget:10000,positionLimit:500,maxPositions:3,minCommission:5};
function data(){const bars=Array.from({length:7},(_,i)=>({time:'2026-10-08 '+new Date(Date.parse('2026-10-08T09:35:00+08:00')+i*300000+8*3600000).toISOString().slice(11,19),open:1,close:1+i*.001,volume:100}));return {minutes:{sh588000:bars},histories:{sh588000:[{date:'2026-09-30',close:1}]}};}
const analysis={predict:(_m,bars)=>({eligible:true,asOf:bars.at(-1).date,expectedReturn:.06}),features:bars=>({asOf:bars.at(-1).date})};
test('historical decisions see only the daily prefix and entry snapshot, never future prices',()=>{
 const d=data(),before=R.freezeRounds({...d,universe,model,analysis,policy});d.minutes.sh588000[6].close=999;d.histories.sh588000.push({date:'2026-10-08',close:999});
 const after=R.freezeRounds({...d,universe,model,analysis,policy});assert.deepEqual(after,before);assert.equal(before[0].signalDate,'2026-09-30');assert.equal(before[0].session.automation.mode,'historical_5m');
});
test('missing future quotes keep the sampled window unresolved without replacing it or counting cash',()=>{
 const d=data(),round=R.freezeRounds({...d,universe,model,analysis,policy})[0];d.minutes.sh588000.pop();
 const r=R.replayRound(round,d.minutes,Paper);assert.equal(r.complete,false);assert.equal(r.netPnl,null);assert.equal(r.session.automation.windowEnded,true);assert.equal(r.liveDone,false);
});
test('five-minute replay completion is explicitly separate from a real thirty-minute observation',()=>{
 const d=data(),round=R.freezeRounds({...d,universe,model,analysis,policy})[0],r=R.replayRound(round,d.minutes,Paper);
 assert.equal(r.complete,true);assert.equal(r.liveDone,false);assert.equal(r.session.automation.validObservations,7);assert.equal(r.realizedPnl,0);assert.equal(r.sells,0);assert.equal(r.horizonAccuracy,null);
});
