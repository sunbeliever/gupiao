'use strict';
// A bounded after-close collection/check. It never opens an account or submits orders.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'validation','daily-research'),cache=path.join(dir,'cache');
fs.mkdirSync(cache,{recursive:true});
global.Native=require('./research-file-store.js').createFileStore(cache);
const ctx={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/seed.js'),'utf8'),ctx);const seed=ctx.window.TECH_SEED;global.TECH_SEED=seed;
const Market=require('../assets/market.js'),Analysis=require('../assets/analysis.js'),Journal=require('../assets/forecast-journal.js');
Market.setTransport(async url=>{const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 TechScopeResearch/1.3',Referer:'https://www.eastmoney.com/'},signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error('HTTP '+r.status);return url.includes('qt.gtimg.cn')?new TextDecoder('gb18030').decode(await r.arrayBuffer()):r.text();});
const save=(name,value)=>{const f=path.join(dir,name);fs.writeFileSync(f+'.pending',JSON.stringify(value,null,2));fs.renameSync(f+'.pending',f);};
async function main(){
 const now=new Date(),cn=new Date(now.getTime()+8*3600000),today=cn.toISOString().slice(0,10);
 if(cn.getUTCHours()<16||cn.getUTCDay()===0||cn.getUTCDay()===6){console.log(JSON.stringify({skipped:true,reason:'Requires a weekday after16:00 China time; no incomplete daily bars are used'}));return;}
 const lock=path.join(dir,today+'.claim');try{fs.closeSync(fs.openSync(lock,'wx'));}catch(e){if(e.code==='EEXIST'){console.log(JSON.stringify({skipped:true,reason:'Already attempted today; preserve the prior attempt'}));return;}throw e;}
 const observedAt=now.toISOString(),histories=await Market.syncHistories(),latest=Object.values(histories).map(b=>b.at(-1)?.date||'').sort().pop();
 if(!latest||Market.UNIVERSE.some(u=>{const c=Market.read('hist_'+u.symbol);return !c||c.fetchedDate!==today||c.errors?.length||histories[u.symbol]?.at(-1)?.date!==latest;}))throw new Error('Incomplete research-pool histories; no forecasts or model updates were published');
 if(latest!==today){save(today+'.json',{observedAt,skipped:true,reason:'No completed bar dated today; could be a holiday or delayed source',latest});console.log(JSON.stringify({skipped:true,latest}));return;}
 const model=seed.model,predictions=Object.fromEntries(Market.UNIVERSE.map(u=>[u.symbol,Analysis.predict(model,histories[u.symbol])])),journal=Journal.create({read:Market.read,write:Market.write},Analysis);
 const written=journal.refresh({histories,predictions,model});if(!written.saved)throw new Error('Prospective journal storage failed: '+written.error);
 const proposed=Analysis.updateChampion(histories,model,{horizon:20,alpha:model.alpha,cutoff:latest});
 // A price-error gate is research evidence only, never an automatic live recommendation.
 if(proposed.accepted)save(today+'-candidate-model.json',{deployed:false,model:proposed.model,comparison:proposed.comparison});
 const evidence=await Promise.allSettled([Market.quotes(),Market.news(),Market.sectors()]);
 const health=evidence.map((r,i)=>({source:['quotes','news','sectors'][i],ok:r.status==='fulfilled',count:r.status==='fulfilled'?(Array.isArray(r.value)?r.value.length:Object.keys(r.value).length):0,error:r.status==='rejected'?String(r.reason.message):null}));
 const result={observedAt:new Date().toISOString(),historyAsOf:latest,modelVersion:model.version,modelCutoff:model.cutoff,investmentReadiness:'unproven',languageModelTrained:false,investmentPolicy:{budget:10000,allocationMode:'full',maxPositions:3,minFee:5},journal:journal.summary(),candidateResearch:{acceptedTechnicalGate:proposed.accepted,deployed:false,reason:proposed.reason,comparison:proposed.comparison},health,note:'No paper entries are fabricated after close. This separate development research journal is not the user app portfolio, not realized profit and not proof of70% success.'};
 save(today+'.json',result);save('latest.json',result);console.log(JSON.stringify(result));
}
main().catch(e=>{save('failure-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json',{observedAt:new Date().toISOString(),error:e.stack});console.error(e.message);process.exitCode=1;});
