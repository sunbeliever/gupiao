'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {buildPanel}=require('../scripts/ranking-research-data.js');
function fixture(){const h={};for(const [s,g]of[['sh588000',.001],['sh600703',.002],['sh512760',.003]]){h[s]=Array.from({length:130},(_,i)=>{const d=new Date(Date.UTC(2022,0,1+i)),p=10*Math.exp(g*i);return{date:d.toISOString().slice(0,10),open:p,close:p*1.001,high:p*1.01,low:p*.99,volume:1000+i};});}return h;}
test('market-relative ranking inputs use only completed signal-date history',()=>{
 const h=fixture(),before=JSON.stringify(h),a=buildPanel(h),date=h.sh588000[80].date;
 const changed=structuredClone(h);for(const b of changed.sh588000)if(b.date>=h.sh588000[101].date){for(const k of['open','close','high','low'])b[k]*=2;}
 const c=buildPanel(changed),x=a.rows.find(r=>r.symbol==='sh600703'&&r.date===date),z=c.rows.find(r=>r.symbol==='sh600703'&&r.date===date);
 assert.deepEqual(x.x,z.x);assert.notEqual(x.excessReturn,z.excessReturn);assert.equal(JSON.stringify(h),before);
 assert.equal(x.entryDate,h.sh588000[81].date);assert.equal(x.exitDate,h.sh588000[101].date);
 assert.ok(Math.abs(x.excessReturn-(x.actualReturn-x.benchmarkReturn))<1e-12);
 assert.equal(a.featureNames.length,18);assert.ok(a.featureNames.includes('relative_momentum20'));
});
test('ranking labels never shift entry or exit across missing bars',()=>{
 const h=fixture(),signal=h.sh588000[80].date,entry=h.sh588000[81].date;
 h.sh600703=h.sh600703.filter(b=>b.date!==entry);const p=buildPanel(h);
 assert.equal(p.rows.some(r=>r.symbol==='sh600703'&&r.date===signal),false);
 assert.equal(p.signalCoverage[signal].featureEligible,3);assert.equal(p.signalCoverage[signal].labeled,2);
});
