'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),R=require('../scripts/cost-aware-backtest.js');
const policy={budget:10000,positionLimit:500,minFee:5,feeRate:.0003,slippage:.001,maxPositions:3,horizon:20};
test('new25-factor inputs do not change when later prices change',()=>{
 const D=require('../scripts/prepare-cost-aware-data.js'),bars=Array.from({length:130},(_,i)=>{const p=1+i*.001;return {date:new Date(Date.UTC(2022,0,1+i)).toISOString().slice(0,10),open:p,close:p,high:p+.01,low:p-.01,volume:100+i};}),h={sh588000:bars},date=bars[120].date,a=D.featuresAt(h,'sh588000',date);
 for(let i=121;i<130;i++){const p=bars[i].open*20;bars[i]={...bars[i],open:p,close:p,high:p+.01,low:p-.01};}
 assert.deepEqual(D.featuresAt(h,'sh588000',date),a);assert.equal(a.values.length,25);
});
function fixture(){const calendar=Array.from({length:50},(_,i)=>new Date(Date.UTC(2023,0,1+i)).toISOString().slice(0,10));const bars=calendar.map(date=>({date,open:1,close:1,high:1.1,low:.9,volume:100}));return {calendar,raw:{sh588000:bars},histories:{sh588000:bars},signals:calendar.map(date=>({date,symbol:'sh588000',expectedNetReturn:.1,trend:true,breadth:1})),year:2023,rule:{model:'fixture',netMargin:0,trendFilter:false},policy};}
test('cost-aware decisions do not use later outcomes and book both-side fees on full20-session trades',()=>{
 const i=fixture(),a=R.simulate(i);assert.ok(a.closedPositions>0);assert.ok(a.netReturn<0);assert.ok(a.trades.every(t=>t.exitIndex-t.entryIndex===20&&t.entryFee>=5&&t.exitFee>=5));
 i.raw.sh588000=i.raw.sh588000.map((b,index)=>index>10?{...b,open:2,close:2,high:2.1,low:1.9}:b);const b=R.simulate(i);
 assert.deepEqual(a.decisions[0],b.decisions[0]);assert.notEqual(a.netReturn,b.netReturn);
});
test('missing chosen future prices make performance unresolved without replacing the pick',()=>{
 const i=fixture();i.raw.sh588000=i.raw.sh588000.filter((_,index)=>index!==21);const a=R.simulate(i);assert.equal(a.unresolved,true);assert.equal(a.netReturn,null);assert.equal(a.decisions[0].selected[0],'sh588000');
});
test('all cash does not get profitable trades or a win rate',()=>{
 const i=fixture();i.signals=i.signals.map(r=>({...r,expectedNetReturn:-1}));const a=R.simulate(i);assert.equal(a.netReturn,0);assert.equal(a.closedPositions,0);assert.equal(a.winRate,null);assert.equal(a.profitable,false);
});
test('a split on the scheduled exit day is applied before selling, and unknown adjustments are flagged',()=>{
 const i=fixture(),ex=i.calendar[21],record=i.calendar[20];i.raw.sh588000=i.raw.sh588000.map((b,n)=>n>=21?{...b,open:.5,close:.5,high:.55,low:.45}:b);
 const old=R.simulate(i);assert.ok(old.corporateActionWarnings.length>0);
 const fixed=R.simulate({...i,policy:{...policy,corporateActions:true},events:[{id:'test-split',symbol:'sh588000',type:'split',recordDate:record,exDate:ex,ratio:2}]});
 assert.equal(fixed.trades[0].shares,old.trades[0].shares*2);assert.ok(fixed.trades[0].netPnl>old.trades[0].netPnl);assert.equal(fixed.corporateActionWarnings.length,0);
});
