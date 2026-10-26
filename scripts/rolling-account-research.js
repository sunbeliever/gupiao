'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),A=require('../assets/audit-identity.js'),Analysis=require('../assets/analysis.js'),C=require('../assets/trading-calendar.js'),R=require('./executable-research.js');
const clone=x=>JSON.parse(JSON.stringify(x));
const PATHS=['rolling_ridge','rolling_mean','frozen_f0','fixed_three','fixed_single','cash'];
function validateFolds(folds){if(!Array.isArray(folds)||!folds.length)throw Error('Missing fold schedule');let end='';for(const f of folds){if(f.modelHash!==A.hash(f.model)||f.cutoff!==f.model.cutoff||f.model.horizon!==20||f.model.eligible!==true||f.model.labelEndMax>f.cutoff||f.firstSignal<=f.cutoff||f.lastSignal<f.firstSignal||f.firstSignal<=end)throw Error('Invalid causal fold schedule');end=f.lastSignal;}}
function opening({data,policy,bundle},kind,date,accountModel){
 if(!PATHS.includes(kind))throw Error('Unregistered rolling account path');validateFolds(bundle.folds);
 const prior=C.previousSession(date),fold=bundle.folds.find(f=>f.firstSignal<=prior&&f.lastSignal>=prior),within=prior>=policy.signalStart&&prior<=policy.signalEnd;
 const selector=kind==='fixed_three'?'equal_three':kind==='fixed_single'?'preselected_etf':'ridge';
 const active=kind==='frozen_f0'?bundle.champion:fold?.model||bundle.champion,m=clone(active);
 if(kind==='rolling_mean')m.coefficients=m.coefficients.map(()=>0);
 if(kind==='cash')m.intercept=-1,m.coefficients=m.coefficients.map(()=>0);
 const input=R.openInput(data,policy,m,date,selector);input.context.model=accountModel;
 for(const pred of Object.values(input.context.predictions)){
  pred.researchFoldHash=kind==='frozen_f0'?A.hash(bundle.champion):fold?.modelHash||null;
  pred.researchForecastManifestHash=bundle.forecastManifestHash;
  pred.researchPredictionKind=kind;
  if(kind==='rolling_mean'){pred.interval=null;pred.contributions=[];}
  if(!within||(['rolling_ridge','rolling_mean'].includes(kind)&&!fold)){pred.eligible=false;pred.reason='no_causally_available_common_forecast';}
 }
 return input;
}
function runPath({data,policy,bundle,kind,deadlineMs,onProgress}){
 validateFolds(bundle.folds);const selector=kind==='fixed_three'?'equal_three':kind==='fixed_single'?'preselected_etf':'ridge';
 const model={...clone(bundle.champion),version:'preregistered-rolling-h20-'+kind,declaredPredictionProvider:kind,forecastStudyManifestHash:bundle.forecastManifestHash,foldSchedule:bundle.folds.map(f=>({cutoff:f.cutoff,firstSignal:f.firstSignal,lastSignal:f.lastSignal,modelHash:f.modelHash}))};
 const out=R.runReplay({data,policy,model,selector,deadlineMs,onProgress,openingProvider:(date,frozen)=>opening({data,policy,bundle},kind,date,frozen)});
 out.summary.path=kind;out.summary.engineIdentityBaseCutoff=model.cutoff;if(['rolling_ridge','rolling_mean'].includes(kind)){out.summary.trainingCutoff=null;out.summary.rollingTrainingCutoffs=bundle.folds.map(f=>({modelHash:f.modelHash,cutoff:f.cutoff,labelEndMax:f.model.labelEndMax,firstSignal:f.firstSignal,lastSignal:f.lastSignal}));}out.summary.rollingPredictionProviderFrozen=true;out.summary.independentOutOfSample=false;out.summary.investmentReady=false;out.summary.forecastCommonSignalPeriod=[policy.signalStart,policy.signalEnd];
 return out;
}

const Data=require('./research-dataset.js'),F=require('./multi-horizon-forecast.js');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function declare(directory,dataset,forecast,protocol){
 if(fs.existsSync(directory))throw Error('Rolling study already declared');
 const p=JSON.parse(fs.readFileSync(protocol)),claim=JSON.parse(fs.readFileSync(path.join(path.dirname(protocol),'protocol.claim'))),m=Data.verify(dataset),c=F.loadResult(forecast);
 if(claim.policyHash!==A.hash(p)||p.forecastManifestHash!==c.manifestHash||p.datasetManifestHash!==m.manifestHash||A.hash(p.paths)!==A.hash(PATHS)||p.horizon!==20)throw Error('Rolling protocol binding mismatch');
 const out=JSON.parse(fs.readFileSync(forecast+'/h20.json')),bundle={folds:out.result.folds,champion:JSON.parse(fs.readFileSync(forecast+'/champion.json')),forecastManifestHash:c.manifestHash};F.verifyChampion(bundle.champion);validateFolds(bundle.folds);
 const data={histories:{},raw:{}};for(const s of m.series)data[s.adjustment==='hfq'?'histories':'raw'][s.symbol]=JSON.parse(fs.readFileSync(dataset+'/'+s.file)).bars;
 const policy={...p.policy,signalStart:p.signalStart,signalEnd:p.signalEnd};fs.mkdirSync(directory,{recursive:true});
 const sources=['assets/paper-engine.js','assets/paper-account.js','assets/trading-calendar.js','assets/fee-profile.js','assets/audit-identity.js','assets/corporate-actions.js','assets/corporate-events.js','assets/analysis.js','assets/market.js','assets/news-facts.js','scripts/executable-research.js','scripts/research-dataset.js','scripts/multi-horizon-forecast.js','scripts/rolling-account-research.js'];
 const sourceHashes={};for(const file of [...new Set(sources)]){const b=fs.readFileSync(path.join(__dirname,'..',file));fs.mkdirSync(path.dirname(directory+'/source/'+file),{recursive:true});fs.writeFileSync(directory+'/source/'+file,b,{flag:'wx'});sourceHashes[file]=sha(b);}
 for(const [file,value]of Object.entries({'data.json':data,'bundle.json':bundle,'policy.json':policy,'protocol.json':p}))fs.writeFileSync(directory+'/'+file,JSON.stringify(value),{flag:'wx'});
 const files=Object.fromEntries(['data.json','bundle.json','policy.json','protocol.json'].map(f=>[f,sha(fs.readFileSync(directory+'/'+f))])),manifest={schema:1,id:path.basename(directory),declaredAt:new Date().toISOString(),sourceHashes,files,protocolHash:A.hash(p),forecastManifestHash:c.manifestHash,datasetManifestHash:m.manifestHash,paths:PATHS,promotionAllowed:false};
 F.publish(directory+'/manifest.json',manifest);return manifest;
}
function verify(directory,expected){
 if(typeof expected!=='string'||!/^[a-f0-9]{64}$/.test(expected))throw Error('Rolling manifest identity required');return F.verifyDirectory(directory,expected);
}
function loadPath(directory,expected,kind){
 if(!PATHS.includes(kind))throw Error('Unregistered path');const m=verify(directory,expected),out=JSON.parse(fs.readFileSync(directory+'/'+kind+'.json')),claim=JSON.parse(fs.readFileSync(directory+'/'+kind+'.claim'));
 if(!PATHS.includes(kind)||claim.manifestHash!==expected||claim.path!==kind||out.manifestHash!==expected||out.path!==kind||out.resultHash!==A.hash(out.result)||out.result.summary.path!==kind||out.result.summary.parityVerified!==true)throw Error('Rolling path result mismatch');const state=clone(out.result.session),given=state.integrityHash;delete state.integrityHash;const s=out.result.summary,a=state.account;if(given!==A.hash(state)||given!==s.finalStateHash||s.equity!==a.equity||s.feesPaid!==a.feesPaid||Math.abs(s.netPnl-(a.equity-state.budget))>1e-6)throw Error('Rolling account summary mismatch');
 return out;
}
function run(directory,expected,kind,resume){
 const m=verify(directory,expected);const now=new Date(),minutes=(now.getUTCHours()*60+now.getUTCMinutes()+480)%1440;if(minutes>=540&&minutes<=980)throw Error('Heavy account replay deferred during market hours');if(!PATHS.includes(kind))throw Error('Unregistered path');
 if(path.resolve(__filename)!==path.resolve(directory,'source/scripts/rolling-account-research.js'))throw Error('Only frozen rolling source may execute');
 if(fs.existsSync(directory+'/'+kind+'.json'))throw Error('Completed rolling path immutable');
 const claim=directory+'/'+kind+'.claim';if(!resume)fs.writeFileSync(claim,JSON.stringify({manifestHash:expected,path:kind,at:new Date().toISOString()}),{flag:'wx'});else {const c=JSON.parse(fs.readFileSync(claim));if(c.manifestHash!==expected||c.path!==kind)throw Error('Rolling path claim mismatch');}
 const lease=F.acquireLease(directory,resume);try{
 const data=JSON.parse(fs.readFileSync(directory+'/data.json')),bundle=JSON.parse(fs.readFileSync(directory+'/bundle.json')),policy=JSON.parse(fs.readFileSync(directory+'/policy.json'));F.verifyChampion(bundle.champion);
 const result=runPath({data,bundle,policy,kind,deadlineMs:Date.now()+20*60000,onProgress:p=>{const file=directory+'/'+kind+'-progress.json',tmp=file+'.'+process.pid+'.pending';fs.writeFileSync(tmp,JSON.stringify({at:new Date().toISOString(),...p}));fs.renameSync(tmp,file);}});
 const out={manifestHash:expected,path:kind,resultHash:A.hash(result),result};F.publish(directory+'/'+kind+'.json',out);return out;
 }catch(e){fs.writeFileSync(directory+'/'+kind+'-failure-'+Date.now()+'.json',JSON.stringify({at:new Date().toISOString(),error:e.stack}),{flag:'wx'});throw e;}finally{F.releaseLease(directory,lease);}
}
function comparePaths(directory,expected){
 const m=verify(directory,expected),results=PATHS.map(kind=>{const out=loadPath(directory,expected,kind);const s=out.result.summary,d=out.result.daily;let peak=s.budget,dd=0;for(const x of d){peak=Math.max(peak,x.equity);dd=Math.max(dd,peak-x.equity);}const changes=d.map((x,i)=>x.equity/(i?d[i-1].equity:s.budget)-1),mean=changes.reduce((a,b)=>a+b,0)/changes.length,sd=Math.sqrt(changes.reduce((a,b)=>a+(b-mean)**2,0)/Math.max(1,changes.length-1)),annualized=(s.equity/s.budget)**(252/d.length)-1;const closed=out.result.session.closedPositions.filter(x=>x.account==='model'),profits=closed.map(x=>x.realizedPnl+(x.dividendIncome||0)),grossProfit=profits.filter(x=>x>0).reduce((a,b)=>a+b,0),grossLoss=-profits.filter(x=>x<0).reduce((a,b)=>a+b,0);return{path:out.path,resultHash:out.resultHash,profitFactor:grossLoss>0?grossProfit/grossLoss:null,netPnl:s.netPnl,netReturn:s.netReturn,feesPaid:s.feesPaid,realizedPnl:s.realizedPnl,unrealizedPnl:s.unrealizedPnl,buyCount:s.buyCount,sellCount:s.sellCount,maxDrawdownAmount:dd,maxDrawdownProportion:s.observedDailyMaxDrawdown,sharpe:sd>0?mean/sd*Math.sqrt(252):null,calmar:s.observedDailyMaxDrawdown>0?annualized/s.observedDailyMaxDrawdown:null,annualizedReturn:annualized,annual:s.annual,grossTurnover:s.grossTurnover,closedTradeCount:s.closedTradeCount,closedTradeWinFraction:s.closedTradeWinFraction,meanExposure:s.dailyMeanExposure,openPositions:s.openPositions.map(h=>({symbol:h.symbol,shares:h.shares,lastPrice:h.lastPrice,maturitySession:h.maturitySession})),unresolvedPriceEvents:s.warnings.length,parityVerified:true};});
 const risk=JSON.parse(fs.readFileSync(directory+'/protocol.json')).riskScreen;const decisions=results.filter(x=>['rolling_ridge','rolling_mean'].includes(x.path)).map(x=>{const reasons=[];if(x.maxDrawdownAmount>risk.maxDrawdownAmount)reasons.push('drawdown_amount_over_limit');if(x.maxDrawdownProportion>risk.maxDrawdownProportion)reasons.push('drawdown_proportion_over_limit');if(x.netPnl<=0||!x.buyCount)reasons.push('no_executed_positive_net_return');if(x.annual.some(y=>y.netReturn<0))reasons.push('negative_annual_change');for(const key of ['frozen_f0','fixed_three','fixed_single'])if(x.netPnl<=results.find(r=>r.path===key).netPnl)reasons.push('no_positive_excess_vs_'+key);if(x.unresolvedPriceEvents)reasons.push('unreconciled_raw_adjusted_events');return{path:x.path,historicalRiskAndPerformanceScreenPassed:reasons.length===0,reasons,executionReadiness:'unknown_corporate_action_and_tradability_coverage',promoted:false};});
 return{id:m.id,at:new Date().toISOString(),kind:'historical_rolling_fee_account_comparison',manifestHash:expected,results,decisions,independentOutOfSample:false,investmentReady:false,promoted:false,verifiedProfitProbability:null,note:'Daily raw open/close hypotheses; explored history; corporate actions/first availability unknown; no forward profitability evidence.'};
}
module.exports={PATHS,validateFolds,opening,runPath,declare,verify,loadPath,run,comparePaths};
if(require.main===module){try{const [, ,mode,directory,expected,kind]=process.argv;if(!['--run','--resume'].includes(mode))throw Error('Explicit run/resume required');try{require('os').setPriority(process.pid,require('os').constants.priority.PRIORITY_BELOW_NORMAL);}catch(e){}run(directory,expected,kind,mode==='--resume');console.log(JSON.stringify({id:path.basename(directory),path:kind,completed:true}));}catch(e){console.error(e.stack);process.exitCode=1;}}

