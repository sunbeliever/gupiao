
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Analysis=require('../assets/analysis.js'),Audit=require('../assets/audit-identity.js'),Data=require('./research-dataset.js');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function aligned(histories){
 const symbols=Object.keys(histories).sort();if(!symbols.length)throw Error('Insufficient histories');
 const dates=histories[symbols[0]].map(b=>b.date);
 for(const symbol of symbols){const bars=histories[symbol];if(bars.length!==dates.length||bars.some((b,i)=>b.date!==dates[i]||(i&&b.date<=dates[i-1])||!['open','high','low','close','volume'].every(k=>Number.isFinite(b[k]))||b.open<=0||b.close<=0))throw Error('Unaligned or invalid histories');}
 return {symbols,dates};
}
function records(histories,horizon){
 if(![5,20,60].includes(horizon))throw Error('Unregistered horizon');
 const {symbols,dates}=aligned(histories),rows=[];
 for(let i=60;i+horizon+1<dates.length;i++)for(const symbol of symbols){
  const bars=histories[symbol],f=Analysis.features(bars.slice(i-60,i+1));
  if(!f.values||f.asOf!==dates[i])throw Error('Authoritative feature vector unavailable');
  rows.push({symbol,date:dates[i],entryDate:dates[i+1],exitDate:dates[i+horizon+1],x:f.values,actual:bars[i+horizon+1].open/bars[i+1].open-1});
 }
 return rows;
}
function fitAt(histories,horizon,cutoff){
 const prefix=Object.fromEntries(Object.entries(histories).map(([s,b])=>[s,b.filter(x=>x.date<=cutoff)]));
 const m=Analysis.train(prefix,{horizon,alpha:1,cutoff});
 m.notes=m.notes.map(n=>n.replace('20交易日',horizon+'交易日'));
 if(m.labelEndMax&&m.labelEndMax>cutoff)throw Error('Training label leakage');
 return m;
}
function score(model,x){return model.intercept+x.reduce((v,a,i)=>v+model.coefficients[i]*(a-model.means[i])/model.scales[i],0);}
function metrics(rows,key){if(!rows.length)return{sampleCount:0,mae:null,directionAccuracy:null};return{sampleCount:rows.length,mae:rows.reduce((s,r)=>s+Math.abs(r[key]-r.actual),0)/rows.length,directionAccuracy:rows.reduce((s,r)=>s+((r[key]>=0)===(r.actual>=0)?1:0),0)/rows.length};}
function compare(histories,opt){
 const {dates,symbols}=aligned(histories),h=opt.horizon;
 if(opt.alpha!==1||opt.minimumTrainingSignalSessions!==252||opt.testBlockSessions!==63)throw Error('Unregistered parameters');
 const all=records(histories,h),folds=[],rows=[],first=60+252+h+1;
 if(first>=dates.length-h-1)throw Error('Insufficient chronological test history');
 for(let start=first;start<dates.length-h-1;start+=63){
  if(opt.deadlineMs&&Date.now()>opt.deadlineMs)throw Error('Forecast study round deadline');
  const cutoff=dates[start-1],model=fitAt(histories,h,cutoff),modelHash=Audit.hash(model),last=Math.min(start+62,dates.length-h-2);
  if(!model.eligible||model.sampleCount<252*symbols.length)throw Error('Insufficient mature training rows');
  const foldRows=all.filter(r=>r.date>=dates[start]&&r.date<=dates[last]).map(r=>({...r,ridge:score(model,r.x),mean:model.intercept,modelHash}));
  if(!foldRows.length)throw Error('Empty fold');rows.push(...foldRows);
  folds.push({cutoff,firstSignal:dates[start],lastSignal:dates[last],labelEndMax:model.labelEndMax,lastTrainingSignal:model.lastSignalDate,trainingSamples:model.sampleCount,modelHash,model,testSamples:foldRows.length,ridge:metrics(foldRows,'ridge'),mean:metrics(foldRows,'mean')});
 }
 const ridge=metrics(rows,'ridge'),mean=metrics(rows,'mean');
 return{horizon:h,folds,rows,ridge,mean,relativeMaeImprovement:mean.mae>0?1-ridge.mae/mean.mae:null,forecastAdvantage:ridge.mae<mean.mae,independentOutOfSample:false,comparisonKind:'historical_chronological_out_of_fold_prediction_only',overlappingLabels:true,profitabilityVerified:false,netAccountReturn:null,maxAccountDrawdown:null,promoted:false,verifiedProfitProbability:null};
}
const SOURCES=['assets/analysis.js','assets/audit-identity.js','assets/trading-calendar.js','assets/fee-profile.js','assets/paper-engine.js','assets/paper-account.js','assets/market.js','scripts/research-dataset.js','scripts/multi-horizon-forecast.js'];
const CHAMPION_HASH='f0b16e0c0922e3ae051015c3f73a66135c2a0b4ed478b5c0a3bfe6471ad0b0dd';
function verifyChampion(m){if(!m||Audit.hash(m)!==CHAMPION_HASH||m.horizon!==20||m.cutoff!=='2024-12-31')throw Error('Champion identity mismatch');return m;}
function resultSummary(out){const r=out.result;return{horizon:r.horizon,foldCount:r.folds.length,ridge:r.ridge,mean:r.mean,relativeMaeImprovement:r.relativeMaeImprovement,forecastAdvantage:r.forecastAdvantage,championCommonPeriod:r.championCommonPeriod||null,resultHash:out.resultHash,modelHashes:r.folds.map(f=>f.modelHash)};}
function declare(directory,dataset,protocol,champion){
 verifyChampion(champion);
 if(fs.existsSync(directory))throw Error('Study directory already exists');const m=Data.verify(dataset),p=JSON.parse(fs.readFileSync(protocol)),claim=JSON.parse(fs.readFileSync(path.join(path.dirname(protocol),'protocol.claim')));
 if(claim.policySha256!==sha(fs.readFileSync(protocol))||p.data.manifestHash!==m.manifestHash)throw Error('Preregistered protocol/data binding mismatch');
 fs.mkdirSync(directory,{recursive:true});const sourceHashes={};for(const file of SOURCES){const b=fs.readFileSync(path.join(__dirname,'..',file)),out=directory+'/source/'+file;fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,b,{flag:'wx'});sourceHashes[file]=sha(b);}
 const histories=Object.fromEntries(m.series.filter(s=>s.adjustment==='hfq').map(s=>[s.symbol,JSON.parse(fs.readFileSync(dataset+'/'+s.file)).bars]));
 fs.writeFileSync(directory+'/histories.json',JSON.stringify(histories),{flag:'wx'});fs.writeFileSync(directory+'/protocol.json',JSON.stringify(p),{flag:'wx'});fs.writeFileSync(directory+'/champion.json',JSON.stringify(champion),{flag:'wx'});
 const files=Object.fromEntries(['histories.json','protocol.json','champion.json'].map(f=>[f,sha(fs.readFileSync(directory+'/'+f))]));
 const manifest={schema:1,id:path.basename(directory),declaredAt:new Date().toISOString(),datasetId:m.id,datasetManifestHash:m.manifestHash,sourceHashes,files,protocolSha256:claim.policySha256,promotionAllowed:false,stage:'forecast_only_account_validation_pending'};
 fs.writeFileSync(directory+'/manifest.json',JSON.stringify(manifest,null,2),{flag:'wx'});return manifest;
}

function publish(file,value){
 if(fs.existsSync(file))throw Error('Immutable result already exists');
 const temp=file+'.'+process.pid+'-'+Date.now()+'.pending',fd=fs.openSync(temp,'wx');
 try{fs.writeFileSync(fd,JSON.stringify(value));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 if(Audit.hash(JSON.parse(fs.readFileSync(temp)))!==Audit.hash(value))throw Error('Result readback mismatch');
 fs.renameSync(temp,file);
}
function acquireLease(directory,resume){
 const lock=directory+'/recovery.lock',file=directory+'/writer.lease';let fd;try{fd=fs.openSync(lock,'wx');fs.writeFileSync(fd,JSON.stringify({pid:process.pid,token:crypto.randomUUID(),at:new Date().toISOString()}));fs.fsyncSync(fd);}catch(e){if(e.code==='EEXIST')throw Error('Manual recovery required: retain and inspect orphan lock '+lock+'; do not steal a live lock');throw e;}
 try{if(fs.existsSync(file)){const old=JSON.parse(fs.readFileSync(file));try{process.kill(old.pid,0);throw Error('Existing study writer alive');}catch(e){if(e.code!=='ESRCH')throw e;}if(!resume)throw Error('Explicit resume required');fs.renameSync(file,file+'.dead-'+Date.now());}
 const lease={pid:process.pid,token:crypto.randomUUID(),at:new Date().toISOString()};fs.writeFileSync(file,JSON.stringify(lease),{flag:'wx'});return lease;
 }finally{fs.closeSync(fd);fs.unlinkSync(lock);}
}
function releaseLease(directory,lease){const file=directory+'/writer.lease',owner=JSON.parse(fs.readFileSync(file));if(owner.token!==lease.token)throw Error('Study lease ownership mismatch');fs.renameSync(file,file+'.finished-'+Date.now());}
function verifyDirectory(directory,expected){
 const m=JSON.parse(fs.readFileSync(directory+'/manifest.json'));if(expected&&Audit.hash(m)!==expected)throw Error('Declared manifest changed');
 for(const [f,h]of Object.entries(m.sourceHashes))if(sha(fs.readFileSync(directory+'/source/'+f))!==h)throw Error('Frozen source changed');
 for(const [f,h]of Object.entries(m.files))if(sha(fs.readFileSync(directory+'/'+f))!==h)throw Error('Frozen input changed');return m;
}
function loadResult(directory,expected){
 const m=verifyDirectory(directory,expected),identity=Audit.hash(m);if(JSON.parse(fs.readFileSync(directory+'/experiment.claim')).manifestHash!==identity)throw Error('Study claim mismatch');const c=JSON.parse(fs.readFileSync(directory+'/comparison.json'));
 if(c.id!==m.id||c.stage!=='forecast_comparison_complete_account_backtest_pending'||c.independentOutOfSample!==false||c.netAccountReturn!==null||c.maxAccountDrawdown!==null||c.verifiedProfitProbability!==null||c.manifestHash!==identity||c.promoted!==false||c.investmentReady!==false||c.results.length!==3)throw Error('Study comparison identity invalid');
 for(const h of [5,20,60]){const o=JSON.parse(fs.readFileSync(directory+'/h'+h+'.json'));if(o.manifestHash!==identity||o.resultHash!==Audit.hash(o.result)||o.result.horizon!==h||c.results.find(r=>r.horizon===h)?.resultHash!==o.resultHash)throw Error('Study result changed');if(Audit.hash(c.results.find(r=>r.horizon===h))!==Audit.hash(resultSummary(o)))throw Error('Study summary changed');}
 return c;
}

function atomic(file,value){const temp=file+'.'+process.pid+'.pending';fs.writeFileSync(temp,JSON.stringify(value),{flag:'wx'});fs.renameSync(temp,file);}
function run(directory,resume=false){
 if(path.resolve(__filename)!==path.resolve(directory,'source/scripts/multi-horizon-forecast.js'))throw Error('Run only frozen declared source');
 if(fs.existsSync(directory+'/comparison.json'))throw Error('Completed study is immutable');
 const manifest=JSON.parse(fs.readFileSync(directory+'/manifest.json'));for(const [f,h]of Object.entries(manifest.sourceHashes))if(sha(fs.readFileSync(directory+'/source/'+f))!==h)throw Error('Frozen source changed');for(const [f,h]of Object.entries(manifest.files))if(sha(fs.readFileSync(directory+'/'+f))!==h)throw Error('Input changed');
 const identity=Audit.hash(manifest),claim=directory+'/experiment.claim';
 if(!resume)fs.writeFileSync(claim,JSON.stringify({at:new Date().toISOString(),manifestHash:identity}),{flag:'wx'});else if(JSON.parse(fs.readFileSync(claim)).manifestHash!==identity)throw Error('Study claim mismatch');
 const lease=acquireLease(directory,resume);
 try{
  const histories=JSON.parse(fs.readFileSync(directory+'/histories.json')),p=JSON.parse(fs.readFileSync(directory+'/protocol.json')),champion=JSON.parse(fs.readFileSync(directory+'/champion.json')),results=[],deadlineMs=Date.now()+20*60000;verifyChampion(champion);
  for(const family of p.families){const file=directory+'/h'+family.horizonSessions+'.json';let out;
   if(fs.existsSync(file)){out=JSON.parse(fs.readFileSync(file));if(out.manifestHash!==identity||out.resultHash!==Audit.hash(out.result)||out.result.horizon!==family.horizonSessions)throw Error('Result checkpoint mismatch');}
   else{const result=compare(histories,{horizon:family.horizonSessions,alpha:1,minimumTrainingSignalSessions:family.minimumTrainingSignalSessions,testBlockSessions:family.testBlockSessions,deadlineMs});
    if(result.horizon===20){const common=result.rows.filter(r=>r.date>champion.cutoff).map(r=>({...r,champion:score(champion,r.x)}));if(!common.length)throw Error('Empty champion comparison');result.championCommonPeriod={sampleCount:common.length,ridge:metrics(common,'ridge'),mean:metrics(common,'mean'),champion:metrics(common,'champion'),modelHash:Audit.hash(champion)};}
    out={manifestHash:identity,resultHash:Audit.hash(result),result};publish(file,out);}
   results.push(resultSummary(out));
   atomic(directory+'/progress.json',{at:new Date().toISOString(),completedHorizons:results.map(r=>r.horizon)});
  }
  const comparison={id:manifest.id,at:new Date().toISOString(),manifestHash:identity,datasetManifestHash:manifest.datasetManifestHash,results,stage:'forecast_comparison_complete_account_backtest_pending',independentOutOfSample:false,netAccountReturn:null,maxAccountDrawdown:null,promoted:false,investmentReady:false,verifiedProfitProbability:null,note:'Mature overlapping historical labels, not independent profit probability. Costs and portfolio outcomes not evaluated here.'};publish(directory+'/comparison.json',comparison);return comparison;
 }catch(e){fs.writeFileSync(directory+'/failure-'+Date.now()+'.json',JSON.stringify({at:new Date().toISOString(),error:e.stack}),{flag:'wx'});throw e;}
 finally{releaseLease(directory,lease);}
}
module.exports={verifyChampion,resultSummary,records,fitAt,score,compare,declare,run,publish,acquireLease,releaseLease,verifyDirectory,loadResult};
if(require.main===module){const mode=process.argv[2],dir=process.argv[3];try{if(!['--run','--resume'].includes(mode))throw Error('Explicit run/resume required');try{require('os').setPriority(process.pid,require('os').constants.priority.PRIORITY_BELOW_NORMAL);}catch(e){}const r=run(dir,mode==='--resume');console.log(JSON.stringify({id:r.id,completed:true}));}catch(e){console.error(e.stack);process.exitCode=1;}}
