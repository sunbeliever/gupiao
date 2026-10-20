'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm'),{execFile}=require('node:child_process');
const root=path.resolve(__dirname,'..'),stable='D:/techno/validation/today-guidance',id='after-close-'+new Date().toISOString().replace(/[:.]/g,'-'),dir=path.join(stable,id);
fs.mkdirSync(stable,{recursive:true});fs.mkdirSync(dir);fs.mkdirSync(path.join(dir,'sources'));fs.mkdirSync(path.join(dir,'responses'));fs.mkdirSync(path.join(dir,'cache'));
const old='C:/Users/lqp07/.codex/worktrees/audit-account-repair/techno/validation/continuous/continuous-etf-audit-20261020-1100',oldManifest=JSON.parse(fs.readFileSync(path.join(old,'manifest.json'))),hash=x=>crypto.createHash('sha256').update(x).digest('hex'),fileHash=p=>hash(fs.readFileSync(p));
const helper=path.join(dir,'market-transport.exe');fs.copyFileSync(path.join(old,'market-transport.exe'),helper);if(fileHash(helper)!==oldManifest.nativeTransport.exeSha256)throw Error('Native helper fingerprint mismatch');
const names=['seed.js','analysis.js','market.js','news-facts.js','trading-calendar.js','fee-profile.js','audit-identity.js','corporate-actions.js','corporate-events.js','paper-account.js','paper-engine.js','trade-guidance.js'];
const sources={};for(const n of names){const target=path.join(dir,'sources',n);fs.copyFileSync(path.join(root,'assets',n),target);sources[n]=fileHash(target);}
fs.copyFileSync(__filename,path.join(dir,'collector.cjs'));
const manifest={id,startedAt:new Date().toISOString(),kind:'actual_after_close_guidance_observation',expectedSamples:12,intervalMs:30000,ordersAllowed:false,profitScoring:false,seedModel:'original_19_pool_deployed_model',sources,helperHash:fileHash(helper),collectorHash:fileHash(__filename)};
fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2));
let responseCount=0;
global.Native={read:k=>{const p=path.join(dir,'cache',k+'.json');return fs.existsSync(p)?fs.readFileSync(p,'utf8'):null;},write:(k,v)=>{if(!/^[A-Za-z0-9_.-]+$/.test(k))return false;fs.writeFileSync(path.join(dir,'cache',k+'.json'),v);return true;}};
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(path.join(dir,'sources/seed.js'),'utf8'),sandbox);global.TECH_SEED=sandbox.window.TECH_SEED;
const Market=require(path.join(dir,'sources/market.js')),Analysis=require(path.join(dir,'sources/analysis.js')),Paper=require(path.join(dir,'sources/paper-engine.js')),Guidance=require(path.join(dir,'sources/trade-guidance.js'));
Market.setTransport(url=>new Promise((resolve,reject)=>execFile(helper,[url],{encoding:'utf8',timeout:25000,maxBuffer:16*1024*1024,windowsHide:true,shell:false},(error,stdout)=>{const at=new Date().toISOString(),n=++responseCount;let payload;try{if(error)throw error;payload=JSON.parse(String(stdout).replace(/^\uFEFF/,''));if(payload.url!==url||payload.transport!=='dotnet-desktop-http-v1'||typeof payload.body!=='string')throw Error('Invalid native payload');fs.writeFileSync(path.join(dir,'responses',n+'.json'),JSON.stringify({requestedUrl:url,observedAt:at,payload}));resolve(payload.body);}catch(e){fs.writeFileSync(path.join(dir,'responses',n+'.json'),JSON.stringify({requestedUrl:url,observedAt:at,error:e.message}));reject(e);}})));
const report={...manifest,samples:0,quoteRows:0,actionCounts:{},unexpectedEntries:0,accountCreationRejected:0,orders:0,netProfit:null,errors:[]};
const save=()=>fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));
let previousHash=hash(JSON.stringify(manifest));
async function run(){
 console.log(JSON.stringify({directory:dir,startedAt:manifest.startedAt}));save();
 let histories;try{histories=await Market.syncHistories();}catch(e){report.errors.push('history:'+e.message);histories=global.TECH_SEED.histories;}
 report.historyHealth=Market.validateHistoryPool(histories,{at:new Date().toISOString()});
 const publishedAt=new Date().toISOString(),predictions=Object.fromEntries(Market.UNIVERSE.map(u=>[u.symbol,Analysis.predict(global.TECH_SEED.model,histories[u.symbol]||[],{publishedAt,firstReceivedAt:publishedAt})]));
 fs.writeFileSync(path.join(dir,'history-input.json'),JSON.stringify({histories,predictions,model:global.TECH_SEED.model,health:report.historyHealth}));
 const notices=await Promise.allSettled(['sh603019','sz002415','sz300502'].map(symbol=>Market.announcements(symbol)));
 fs.writeFileSync(path.join(dir,'announcements.json'),JSON.stringify(notices));
 for(let i=0;i<manifest.expectedSamples;i++){
  let quotes={};try{quotes=await Market.quotes();}catch(e){report.errors.push('quote:'+e.message);}
  const at=new Date().toISOString(),guidance=Guidance.build({now:at,universe:Market.UNIVERSE,quotes,predictions,dataHealth:report.historyHealth});
  if(guidance.entries.length)report.unexpectedEntries+=guidance.entries.length;
  let rejection=null;try{Paper.startContinuous({now:at,universe:Market.UNIVERSE,quotes,predictions,model:global.TECH_SEED.model,dataHealth:report.historyHealth,budget:10000,allocationMode:'full',riskLimits:{investableLimit:1250,maxExposure:.125,maxThemeWeight:.125,maxPositions:3}});rejection='UNEXPECTED_ACCOUNT_CREATION';report.errors.push(rejection);}catch(e){rejection=e.message;if(/current trading session/.test(rejection))report.accountCreationRejected++;}
  const event={sequence:i+1,at,quotes,guidance,accountCreationRejection:rejection,previousHash},eventHash=hash(JSON.stringify(event));event.eventHash=eventHash;previousHash=eventHash;
  fs.appendFileSync(path.join(dir,'ticks.jsonl'),JSON.stringify(event)+'\n');report.samples++;report.quoteRows+=Object.keys(quotes).length;report.actionCounts[guidance.action]=(report.actionCounts[guidance.action]||0)+1;report.lastHash=eventHash;save();
  if(i+1<manifest.expectedSamples)await new Promise(r=>setTimeout(r,manifest.intervalMs));
 }
 report.finishedAt=new Date().toISOString();report.responses=responseCount;report.sourceIntegrity=names.every(n=>fileHash(path.join(dir,'sources',n))===sources[n]);report.status=report.unexpectedEntries===0&&report.accountCreationRejected===report.samples&&report.sourceIntegrity?'completed':'failed';save();console.log(JSON.stringify({directory:dir,status:report.status,samples:report.samples,orders:report.orders}));
}
run().catch(e=>{report.status='failed';report.errors.push(e.stack);report.finishedAt=new Date().toISOString();save();console.error(e.stack);process.exitCode=1;});
