'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Research=require('../scripts/executable-research.js');
const Paper=require('../assets/paper-engine.js'),Calendar=require('../assets/trading-calendar.js');
function fixture(){
 const universe=[{symbol:'sh588000',name:'fixture ETF',type:'etf',sector:'科技'}],dates=[];
 for(let date='2023-07-03';date<='2024-03-01';date=Calendar.nextSession(date))dates.push(date);
 const bars=dates.map((date,i)=>({date,open:1+i*.0001,close:1+i*.0001,high:1.02+i*.0001,low:.98+i*.0001,volume:1000}));
 const data={histories:{sh588000:bars},raw:{sh588000:JSON.parse(JSON.stringify(bars))}},model={version:'synthetic',horizon:20,cutoff:'2023-12-29',eligible:true,intercept:.5,means:Array(11).fill(0),scales:Array(11).fill(1),coefficients:Array(11).fill(0),residualQuantiles:[0,0]};
 const policy={start:'2024-01-02',end:'2024-02-02',trainCutoff:'2023-12-29',budget:10000,universe,feeProfile:{commissionRate:.0003,minFee:5,slippage:.001},corporateEvents:[]};
 return {data,model,policy};
}
test('opening input excludes today close high low and volume; future candle edits cannot change opening orders',()=>{
 const f=fixture(),a=Research.openInput(f.data,f.policy,f.model,'2024-01-02','ridge');
 const row=f.data.raw.sh588000.find(b=>b.date==='2024-01-02');Object.assign(row,{close:8,high:9,low:.01,volume:0});
 const b=Research.openInput(f.data,f.policy,f.model,'2024-01-02','ridge');assert.deepEqual(a,b);
 assert.equal(a.quotes.sh588000.volume,undefined);assert.equal(a.context.predictions.sh588000.signalDate,'2023-12-29');
});
test('missing previous completed bar blocks entry rather than rolling an older signal forward',()=>{
 const f=fixture();f.data.histories.sh588000=f.data.histories.sh588000.filter(b=>b.date!=='2023-12-29');
 const r=Research.openInput(f.data,f.policy,f.model,'2024-01-02','ridge');assert.equal(r.context.dataHealth.ok,false);
 const s=Research.runReplay({...f,selector:'ridge'});assert.equal(s.events[0].input.context.dataHealth.ok,false);assert.equal(s.events[0].orders.filter(o=>o.account==='model').length,0);
});
test('incremental replay and public Paper.replay preserve identical trades equity and hashes across 20 sessions',()=>{
 const f=fixture(),r=Research.runReplay({...f,selector:'ridge'}),rest=Paper.replay(r.initialSession,r.events.slice(1).map(e=>e.input));
 assert.equal(rest.integrityHash,r.session.integrityHash);assert.deepEqual(rest.orders,r.session.orders);
 assert.ok(r.session.orders.some(o=>o.account==='model'&&o.side==='sell'));assert.equal(r.summary.parityVerified,true);
 assert.equal(r.summary.evidenceKind,'historical_exploration');assert.equal(r.summary.deployed,false);
 assert.equal(r.summary.verifiedProfitProbability,null);assert.equal(r.summary.strategySuccess,false);
});
test('end of sample keeps ownership and marks at the actual close; never fabricates liquidation cash',()=>{
 const f=fixture();f.policy.end='2024-01-03';const r=Research.runReplay({...f,selector:'ridge'});
 assert.equal(r.session.account.holdings.length,1);assert.equal(r.summary.sellCount,0);
 assert.ok(r.summary.cash<100);assert.equal(r.events.at(-1).input.at,'2024-01-03T08:00:00.000Z');
 assert.equal(r.events.at(-1).orders.length,0);assert.ok(r.summary.feesPaid>=5);
});
test('research training consumes only bars through declared cutoff, including mature-label isolation',()=>{
 const f=fixture(),one=Research.trainCandidate(f.data.histories,f.policy.trainCutoff,1);
 for(const b of f.data.histories.sh588000)if(b.date>'2023-12-29')b.close*=10;
 const two=Research.trainCandidate(f.data.histories,f.policy.trainCutoff,1);assert.deepEqual(one,two);
 assert.equal(one.cutoff,'2023-12-29');
});
test('deterministic baselines use explicit selector identities and never report synthetic scores as price forecasts',()=>{
 const f=fixture(),r=Research.runReplay({...f,selector:'preselected_etf'});
 assert.equal(r.summary.selectorId,'preselected_etf');assert.equal(r.summary.signalMeaning,'deterministic_order_priority_not_return_forecast');
 assert.ok(r.summary.fingerprint.model_hash);assert.ok(r.summary.researchIdentity.rules_hash);
 assert.equal(r.summary.budget,10000);assert.equal(r.summary.engineStrategyLabel,'ridge11-tech-etf-continuous-v1');
});
