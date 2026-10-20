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

test('entry-exit declaration fixes exactly the two registered candidates and refuses replacement',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),root=fs.mkdtempSync(path.join(os.tmpdir(),'techscope-entry-exit-'));
 try{
  const Market=require('../assets/market.js'),prices={raw:{},histories:{}};for(const u of Market.UNIVERSE.filter(u=>u.type==='etf')){prices.raw[u.symbol]=[];prices.histories[u.symbol]=[];}
  fs.mkdirSync(path.join(root,'assets'));fs.mkdirSync(path.join(root,'scripts'));
  for(const name of ['paper-engine.js','paper-account.js','analysis.js','trading-calendar.js','fee-profile.js','audit-identity.js','corporate-actions.js','corporate-events.js'])fs.copyFileSync(path.join(__dirname,'../assets',name),path.join(root,'assets',name));
  fs.copyFileSync(path.join(__dirname,'../scripts/executable-research.js'),path.join(root,'scripts/executable-research.js'));
  const file=path.join(root,'prices.json');fs.writeFileSync(file,JSON.stringify(prices));
  const args=['--declare','--entry-exit','--id','fixture-entry-exit','--prices',file];Research.cli(args,root);
  const manifestFile=path.join(root,'validation/executable-research/fixture-entry-exit/manifest.json'),bytes=fs.readFileSync(manifestFile),m=JSON.parse(bytes);
  assert.deepEqual(m.candidates.map(c=>[c.id,c.alpha,c.selector,c.ruleOverrides]),[
   ['no-target-exit',1,'ridge',{targetExitEnabled:false,minEstimatedNetReturn:0}],
   ['no-target-net1pct',1,'ridge',{targetExitEnabled:false,minEstimatedNetReturn:.01}]
  ]);
  assert.equal(m.policy.budget,10000);assert.equal(m.policy.trainCutoff,'2024-12-31');assert.equal(m.evidenceKind,'already_seen_historical_exploration');
  assert.throws(()=>Research.cli(args,root),/prior declaration/);assert.deepEqual(fs.readFileSync(manifestFile),bytes);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('research replay passes the frozen net margin and exit switch to the actual account',()=>{
 const f=fixture();f.policy={...f.policy,targetExitEnabled:false,minEstimatedNetReturn:.01};f.model.intercept=.012;
 const r=Research.runReplay({...f,selector:'ridge'});assert.equal(r.summary.buyCount,0);assert.equal(r.summary.netReturn,0);
 assert.equal(r.session.rules.targetExitEnabled,false);assert.equal(r.session.rules.minEstimatedNetReturn,.01);assert.equal(r.summary.strategySuccess,false);assert.equal(r.summary.parityVerified,true);
});

test('cash-buffer research binds actual risk limits to identity and preserves most principal as cash',()=>{
 const f=fixture();f.policy={...f.policy,targetExitEnabled:false,minEstimatedNetReturn:.01,maxDrawdownLimit:.05,riskLimits:{investableLimit:2500,maxExposure:.25,maxPositions:3,maxThemeWeight:1}};
 const r=Research.runReplay({...f,selector:'ridge'});
 assert.deepEqual(r.summary.researchIdentity.risk_limits,r.session.fingerprint.risk_limits);
 assert.equal(r.summary.researchIdentity.risk_limits.investableLimit,2500);assert.equal(r.summary.researchIdentity.risk_limits.maxExposure,.25);
 assert.ok(r.initialSession.account.cash>=7500);assert.ok(r.summary.dailyMeanExposure<.26);
 assert.ok(r.summary.minimumObservedEquity<=10000);assert.ok(r.summary.maxLossFromInitialCapital>0);assert.ok(r.summary.daysBelowInitialCapital>0);
 assert.equal(r.summary.riskScreen.zeroLossObserved,false);assert.equal(r.summary.riskScreen.investmentReady,false);assert.equal(r.summary.riskScreen.verifiedProfitProbability,null);
});

test('untraded cash cannot pass the historical capital-preservation screen',()=>{
 const f=fixture();f.policy={...f.policy,targetExitEnabled:false,minEstimatedNetReturn:.01,maxDrawdownLimit:.05,riskLimits:{investableLimit:1250,maxExposure:.125,maxPositions:3,maxThemeWeight:1}};f.model.intercept=.012;
 const r=Research.runReplay({...f,selector:'ridge'});assert.equal(r.summary.buyCount,0);assert.equal(r.summary.netReturn,0);
 assert.equal(r.summary.riskScreen.zeroLossObserved,true);assert.equal(r.summary.riskScreen.historicalRiskScreenPassed,false);
 assert.ok(r.summary.riskScreen.reasons.includes('no_executed_model_trades'));assert.equal(r.summary.riskScreen.investmentReady,false);
});

test('capital-preservation declaration fixes two cash buffers and two matched baseline controls before results',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),root=fs.mkdtempSync(path.join(os.tmpdir(),'techscope-capital-'));
 try{
  const Market=require('../assets/market.js'),prices={raw:{},histories:{}};for(const u of Market.UNIVERSE.filter(u=>u.type==='etf')){prices.raw[u.symbol]=[];prices.histories[u.symbol]=[];}
  fs.mkdirSync(path.join(root,'assets'));fs.mkdirSync(path.join(root,'scripts'));
  for(const name of ['paper-engine.js','paper-account.js','analysis.js','trading-calendar.js','fee-profile.js','audit-identity.js','corporate-actions.js','corporate-events.js'])fs.copyFileSync(path.join(__dirname,'../assets',name),path.join(root,'assets',name));
  fs.copyFileSync(path.join(__dirname,'../scripts/executable-research.js'),path.join(root,'scripts/executable-research.js'));
  const file=path.join(root,'prices.json');fs.writeFileSync(file,JSON.stringify(prices));
  Research.cli(['--declare','--capital-preservation','--id','fixture-capital','--prices',file],root);
  const m=JSON.parse(fs.readFileSync(path.join(root,'validation/executable-research/fixture-capital/manifest.json')));
  assert.equal(m.policy.maxDrawdownLimit,.05);assert.equal(m.candidates.length,4);
  assert.deepEqual(m.candidates.filter(c=>c.selector==='ridge').map(c=>[c.alpha,c.ruleOverrides.riskLimits.maxExposure,c.ruleOverrides.riskLimits.investableLimit,c.ruleOverrides.minEstimatedNetReturn]),[[1,.25,2500,.01],[1,.125,1250,.01]]);
  assert.deepEqual(m.candidates.filter(c=>c.selector==='equal_three').map(c=>[c.ruleOverrides.riskLimits.maxExposure,c.ruleOverrides.riskLimits.investableLimit,c.ruleOverrides.minEstimatedNetReturn]),[[.25,2500,0],[.125,1250,0]]);
  assert.ok(m.candidates.every(c=>c.ruleOverrides.targetExitEnabled===false));
  assert.throws(()=>Research.cli(['--declare','--entry-exit','--capital-preservation','--id','ambiguous','--prices',file],root),/one research family/);
 }finally{assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith('techscope-capital-'));fs.rmSync(root,{recursive:true,force:true});}
});

test('a gap through the stop rejects the five-percent screen rather than claiming entry caps guarantee drawdown',()=>{
 const f=fixture();f.policy={...f.policy,targetExitEnabled:false,minEstimatedNetReturn:.01,maxDrawdownLimit:.05,riskLimits:{investableLimit:2500,maxExposure:.25,maxPositions:3,maxThemeWeight:1}};
 for(const list of [f.data.histories.sh588000,f.data.raw.sh588000])for(const b of list)if(b.date>='2024-01-03')Object.assign(b,{open:.2,close:.2,high:.21,low:.19});
 const r=Research.runReplay({...f,selector:'ridge'});assert.ok(r.summary.observedDailyMaxDrawdown>.05);assert.equal(r.summary.riskScreen.historicalRiskScreenPassed,false);
 assert.ok(r.summary.riskScreen.reasons.includes('drawdown_exceeds_declared_limit'));assert.ok(r.summary.riskScreen.reasons.includes('negative_annual_account_change'));
 assert.equal(r.summary.riskScreen.investmentReady,false);
});

test('retained appreciated positions disclose exposure beyond an entry cap without pretending to rebalance',()=>{
 const f=fixture();f.policy={...f.policy,targetExitEnabled:false,minEstimatedNetReturn:.01,maxDrawdownLimit:.05,riskLimits:{investableLimit:2500,maxExposure:.25,maxPositions:3,maxThemeWeight:1}};
 for(const list of [f.data.histories.sh588000,f.data.raw.sh588000])for(const b of list)if(b.date>='2024-01-03')Object.assign(b,{open:2,close:2,high:2.01,low:1.99});
 const r=Research.runReplay({...f,selector:'ridge'});assert.ok(r.summary.maxObservedDailyExposure>.25);assert.equal(r.summary.riskScreen.investmentReady,false);
 assert.match(r.summary.riskScreen.note,/do not rebalance/);
});
