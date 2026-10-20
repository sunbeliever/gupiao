'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),R=require('../scripts/historical-auto-replay.js'),Paper=require('../assets/paper-engine.js');
const universe=[{symbol:'sh588000',name:'ETF',type:'etf'}],model={cutoff:'2026-09-30',version:'fixture'},policy={seed:20261019,maxWindows:24,windowStartsChina:['09:35:00'],durationMs:1800000,budget:10000,positionLimit:500,maxPositions:3,minCommission:5};
function data(){const bars=Array.from({length:7},(_,i)=>({time:'2026-10-08 '+new Date(Date.parse('2026-10-08T09:35:00+08:00')+i*300000+8*3600000).toISOString().slice(11,19),open:1,close:1+i*.001,volume:100}));return {minutes:{sh588000:bars},histories:{sh588000:[{date:'2026-09-30',close:1}]}};}
const analysis={predict:(_m,bars)=>({eligible:true,asOf:bars.at(-1).date,expectedReturn:.06}),features:bars=>({asOf:bars.at(-1).date})};
test('historical decisions see only the daily prefix and entry snapshot, never future prices',()=>{
 const d=data(),before=R.freezeRounds({...d,universe,model,analysis,policy});d.minutes.sh588000[6].close=999;d.histories.sh588000.push({date:'2026-10-08',close:999});
 const after=R.freezeRounds({...d,universe,model,analysis,policy});assert.deepEqual(after,before);assert.equal(before[0].signalDate,'2026-09-30');assert.equal(before[0].session.automation.mode,'historical_5m');
 assert.equal(before[0].executionMode,'legacy_independent_30m_exploration');assert.equal(before[0].fullHorizonAccountEvidence,false);
});
test('missing future quotes keep the sampled window unresolved without replacing it or counting cash',()=>{
 const d=data(),round=R.freezeRounds({...d,universe,model,analysis,policy})[0];d.minutes.sh588000.pop();
 const r=R.replayRound(round,d.minutes,Paper);assert.equal(r.complete,false);assert.equal(r.netPnl,null);assert.equal(r.session.automation.windowEnded,true);assert.equal(r.liveDone,false);
});
test('five-minute replay completion is explicitly separate from a real thirty-minute observation',()=>{
 const d=data(),round=R.freezeRounds({...d,universe,model,analysis,policy})[0],r=R.replayRound(round,d.minutes,Paper);
 assert.equal(r.complete,true);assert.equal(r.liveDone,false);assert.equal(r.session.automation.validObservations,7);assert.equal(r.realizedPnl,0);assert.equal(r.sells,0);assert.equal(r.horizonAccuracy,null);
 assert.equal(r.executionMode,'legacy_independent_30m_exploration');assert.equal(r.fullHorizonAccountEvidence,false);
});

test('a common but outdated daily prefix cannot become a successful cash window',()=>{
 const d=data();d.histories.sh588000[0].date='2026-09-29';
 const round=R.freezeRounds({...d,universe,model:{...model,cutoff:'2026-09-28'},analysis,policy})[0];
 assert.equal(round.unresolved,true);assert.match(round.reason,/expected completed session/);
 const outcome=R.replayRound(round,d.minutes,Paper);assert.equal(outcome.complete,false);assert.equal(outcome.netPnl,null);
});

test('explicit new-engine fixtures use historical_replay and retain their horizon contract',()=>{
 const d=data(),round=R.freezeRounds({...d,universe,model,analysis,policy:{...policy,executionMode:'continuous_paper'}})[0];
 assert.equal(round.executionMode,'continuous_paper');assert.equal(round.session.accountType,'continuous_paper');
 assert.equal(round.session.automation.mode,'historical_replay');
 assert.equal(round.session.account.holdings[0].entrySession,'2026-10-08');
 assert.equal(round.session.account.holdings[0].maturitySession,'2026-11-05');
 const outcome=R.replayRound(round,d.minutes,Paper);assert.equal(outcome.complete,true);assert.equal(outcome.liveDone,false);assert.equal(outcome.session.automation.historicalComplete,true);assert.equal(outcome.fullHorizonAccountEvidence,false);
 d.minutes.sh588000.pop();const missing=R.replayRound(round,d.minutes,Paper);assert.equal(missing.complete,false);assert.equal(missing.netPnl,null);
});
