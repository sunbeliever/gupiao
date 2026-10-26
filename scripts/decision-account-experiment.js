'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),A=require('../assets/audit-identity.js'),P=require('../assets/paper-engine.js'),D=require('./decision-account-study.js'),F=require('./multi-horizon-forecast.js'),X=require('./rolling-account-research.js');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function verify(directory,expected){if(!/^[a-f0-9]{64}$/.test(expected||''))throw Error('Decision manifest identity required');const m=F.verifyDirectory(directory,expected),p=JSON.parse(fs.readFileSync(directory+'/protocol.json')),c=JSON.parse(fs.readFileSync(directory+'/protocol.claim'));if(A.hash(p)!==c.policyHash||m.protocolHash!==c.policyHash||A.hash(m.paths)!==A.hash(D.KINDS))throw Error('Decision protocol binding mismatch');return m;}
function declare(directory,protocolDirectory){
 if(fs.existsSync(directory))throw Error('Decision study already declared');
 const protocol=JSON.parse(fs.readFileSync(protocolDirectory+'/policy.json')),claim=JSON.parse(fs.readFileSync(protocolDirectory+'/protocol.claim'));
 if(A.hash(protocol)!==claim.policyHash||A.hash(protocol.paths)!==A.hash(D.KINDS)||protocol.candidateId!=='trend-relative20-risk-v1'||protocol.riskScreen.promotionAllowed!==false)throw Error('Unregistered decision protocol');
 const base=protocol.baselineStudy;X.verify(base.directory,base.manifestHash);const bp=JSON.parse(fs.readFileSync(base.directory+'/policy.json'));
 if(A.hash(protocol.policy)!==A.hash(bp))throw Error('Decision baseline policy mismatch');
 fs.mkdirSync(directory,{recursive:true});
 const sources=['assets/paper-engine.js','assets/paper-account.js','assets/trading-calendar.js','assets/fee-profile.js','assets/audit-identity.js','assets/corporate-actions.js','assets/corporate-events.js','assets/analysis.js','assets/market.js','assets/news-facts.js','scripts/executable-research.js','scripts/investment-decision-engine.js','scripts/decision-account-study.js','scripts/decision-account-experiment.js','scripts/rolling-account-research.js','scripts/research-dataset.js','scripts/multi-horizon-forecast.js'],sourceHashes={};
 for(const f of sources){const b=fs.readFileSync(path.join(__dirname,'..',f));fs.mkdirSync(path.dirname(directory+'/source/'+f),{recursive:true});fs.writeFileSync(directory+'/source/'+f,b,{flag:'wx'});sourceHashes[f]=sha(b);}
 fs.copyFileSync(base.directory+'/data.json',directory+'/data.json',fs.constants.COPYFILE_EXCL);fs.copyFileSync(protocolDirectory+'/protocol.claim',directory+'/protocol.claim',fs.constants.COPYFILE_EXCL);
 fs.writeFileSync(directory+'/protocol.json',JSON.stringify(protocol),{flag:'wx'});fs.writeFileSync(directory+'/policy.json',JSON.stringify(protocol.policy),{flag:'wx'});
 const files=Object.fromEntries(['data.json','protocol.json','policy.json','protocol.claim'].map(f=>[f,sha(fs.readFileSync(directory+'/'+f))])),manifest={schema:1,id:path.basename(directory),at:new Date().toISOString(),protocolHash:claim.policyHash,paths:D.KINDS,files,sourceHashes,baselineStudy:base,promotionAllowed:false};F.publish(directory+'/manifest.json',manifest);return manifest;
}
function baselineComparison(directory,expected){
 const m=verify(directory,expected),b=m.baselineStudy,file=b.directory+'/comparison.json';
 if(!fs.existsSync(file))throw Error('Original six-path comparison must complete first');
 const saved=JSON.parse(fs.readFileSync(file)),rebuilt=X.comparePaths(b.directory,b.manifestHash),normalize=x=>({...x,at:null});
 if(A.hash(normalize(saved))!==A.hash(normalize(rebuilt)))throw Error('Original fee-account comparison changed');return saved;
}
function loadPath(directory,expected,kind){
 if(!D.KINDS.includes(kind))throw Error('Unknown decision path');verify(directory,expected);
 const claim=JSON.parse(fs.readFileSync(directory+'/'+kind+'.claim')),o=JSON.parse(fs.readFileSync(directory+'/'+kind+'.json'));
 if(claim.manifestHash!==expected||claim.path!==kind||o.manifestHash!==expected||o.path!==kind||o.resultHash!==A.hash(o.result))throw Error('Decision result/claim hash mismatch');
 const r=o.result,s=P.resume(r.session),summary=r.summary,metrics=D.metrics(r.daily,s,s.budget);
 if(r.initialSession?.curve?.length!==1||s.curve.length!==r.events.length+1||s.curve.some((v,i)=>!Number.isFinite(v.equity)||v.equity<=0||v.observedAt!==(i?r.events[i-1].at:r.initialSession.curve[0].observedAt)))throw Error('Incomplete full observed risk curve');let peak=s.budget,fullDD=0,fullDDp=0;for(const v of s.curve){peak=Math.max(peak,v.equity);fullDD=Math.max(fullDD,peak-v.equity);fullDDp=Math.max(fullDDp,1-v.equity/peak);}if(summary.maximumOpenCloseObservedDrawdown!==fullDD||summary.maximumOpenCloseObservedDrawdownProportion!==fullDDp)throw Error('Full observed risk summary mismatch');
 if(summary.path!==kind||summary.finalStateHash!==s.integrityHash||r.parityVerified!==true||summary.parityVerified!==true||A.hash(r.daily.at(-1).equity)!==A.hash(s.account.equity)||Object.keys(metrics).some(k=>A.hash(summary[k])!==A.hash(metrics[k])))throw Error('Decision financial result binding mismatch');
 return o;
}
function run(directory,expected,kind,resume=false){
 verify(directory,expected);const now=new Date(),min=(now.getUTCHours()*60+now.getUTCMinutes()+480)%1440;
 if(min>=540&&min<=980)throw Error('Heavy decision replay deferred during market hours');
 if(path.resolve(__filename)!==path.resolve(directory,'source/scripts/decision-account-experiment.js')||!D.KINDS.includes(kind))throw Error('Only frozen registered decision path may run');
 if(fs.existsSync(directory+'/'+kind+'.json'))throw Error('Completed decision result immutable');
 baselineComparison(directory,expected);
 if(!resume)fs.writeFileSync(directory+'/'+kind+'.claim',JSON.stringify({at:new Date().toISOString(),manifestHash:expected,path:kind}),{flag:'wx'});else{const c=JSON.parse(fs.readFileSync(directory+'/'+kind+'.claim'));if(c.manifestHash!==expected||c.path!==kind)throw Error('Decision resume claim mismatch');}
 const lease=F.acquireLease(directory,resume);try{const data=JSON.parse(fs.readFileSync(directory+'/data.json')),policy=JSON.parse(fs.readFileSync(directory+'/policy.json')),result=D.runReplay({data,policy,kind,deadlineMs:Date.now()+20*60000,onProgress:v=>{const file=directory+'/'+kind+'-progress.json',tmp=file+'.'+process.pid+'.pending';fs.writeFileSync(tmp,JSON.stringify({at:new Date().toISOString(),...v}));fs.renameSync(tmp,file);}}),o={manifestHash:expected,path:kind,resultHash:A.hash(result),result};F.publish(directory+'/'+kind+'.json',o);return o;}catch(e){fs.writeFileSync(directory+'/'+kind+'-failure-'+Date.now()+'.json',JSON.stringify({at:new Date().toISOString(),error:e.stack}),{flag:'wx'});throw e;}finally{F.releaseLease(directory,lease);}
}
function compare(directory,expected){
 const base=baselineComparison(directory,expected),candidate=D.KINDS.map(k=>loadPath(directory,expected,k)),results=candidate.map(o=>({path:o.path,resultHash:o.resultHash,...o.result.summary})),f0=base.results.find(r=>r.path==='frozen_f0'),decision=results.find(r=>r.path==='decision_thesis'),controls=[...base.results.filter(r=>['frozen_f0','fixed_three','fixed_single','cash'].includes(r.path)),results.find(r=>r.path==='true_buy_hold_three')],p=JSON.parse(fs.readFileSync(directory+'/protocol.json')),reasons=[];
 if(!Number.isFinite(decision.maximumOpenCloseObservedDrawdown)||!Number.isFinite(decision.maximumOpenCloseObservedDrawdownProportion))throw Error('Missing full observed risk metrics');if(decision.maximumOpenCloseObservedDrawdown>p.riskScreen.maxDrawdownAmount)reasons.push('drawdown_amount_over_limit');if(decision.maximumOpenCloseObservedDrawdownProportion>p.riskScreen.maxDrawdownProportion)reasons.push('drawdown_proportion_over_limit');
 if(decision.netPnl<=0||!decision.buyCount)reasons.push('no_positive_executed_net_return');if(decision.annual.some(y=>y.netReturn<0))reasons.push('negative_annual_change');
 for(const r of controls)if(decision.netPnl<=r.netPnl)reasons.push('no_positive_excess_vs_'+r.path);
 if(decision.sharpe===null||f0.sharpe===null||decision.sharpe<f0.sharpe)reasons.push('no_risk_adjusted_improvement_vs_f0');
 if(decision.warnings.length)reasons.push('unreconciled_raw_adjusted_events');
 return{schema:1,id:path.basename(directory),at:new Date().toISOString(),kind:'historical_decision_fee_account_comparison',manifestHash:expected,baselineManifestHash:base.manifestHash,results,baselineResults:base.results,differencesVsF0:results.map(r=>({path:r.path,netPnl:r.netPnl-f0.netPnl,maxDrawdownAmount:r.maxDrawdownAmount-f0.maxDrawdownAmount,feesPaid:r.feesPaid-f0.feesPaid,grossTurnover:r.grossTurnover-f0.grossTurnover})),decision:{historicalScreenPassed:reasons.length===0,reasons,promoted:false},independentOutOfSample:false,investmentReady:false,promoted:false,verifiedProfitProbability:null};
}
if(require.main===module){const [mode,directory,expected,kind]=process.argv.slice(2);try{if(!['--run','--resume'].includes(mode))throw Error('Explicit run/resume required');try{require('os').setPriority(process.pid,require('os').constants.priority.PRIORITY_BELOW_NORMAL);}catch(e){}const o=run(directory,expected,kind,mode==='--resume');console.log(JSON.stringify({path:kind,resultHash:o.resultHash,netPnl:o.result.summary.netPnl}));}catch(e){console.error(e.stack);process.exitCode=1;}}
module.exports={declare,verify,baselineComparison,loadPath,run,compare};

