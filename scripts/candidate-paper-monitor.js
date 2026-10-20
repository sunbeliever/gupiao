'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'validation','candidate-live');fs.mkdirSync(path.join(dir,'cache'),{recursive:true});
const scoreText=fs.readFileSync(path.join(root,'validation/ml-research/current-scores.json'),'utf8'),scores=JSON.parse(scoreText);
const selected=scores.scores.filter(r=>r.researchProbability>=.7).slice(0,3);
if(!selected.length)throw new Error('No frozen research candidates reached the prespecified threshold');
global.Native={read:key=>{const f=path.join(dir,'cache',key+'.json');return fs.existsSync(f)?fs.readFileSync(f,'utf8'):'';},write:(key,value)=>{if(!/^[A-Za-z0-9_.-]+$/.test(key))return false;fs.writeFileSync(path.join(dir,'cache',key+'.json'),value);return true;}};
const Market=require('../assets/market.js'),Paper=require('../assets/paper-engine.js');
Market.setTransport(async url=>{const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 TechScopeResearch/1.2',Referer:'https://gu.qq.com/'},signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error('HTTP '+r.status);return url.includes('qt.gtimg.cn')?new TextDecoder('gb18030').decode(await r.arrayBuffer()):r.text();});
const save=(name,value)=>{const f=path.join(dir,name);fs.writeFileSync(f+'.pending',JSON.stringify(value,null,2));fs.renameSync(f+'.pending',f);};
const scheduledAt='2026-10-19T13:01:00+08:00',declaration={schema:1,declaredAt:new Date().toISOString(),scheduledAt,scoreObservedAt:scores.observedAt,scoreAsOf:selected[0].asOf,scoreFileSha256:crypto.createHash('sha256').update(scoreText).digest('hex'),selected,maxPositionWeight:.2,budget:500000,durationMs:3600000,budgetAmendment:'Virtual budget increased before entry because100-share minimum lots in the two frozen high-price names exceed a20% position of100,000. No future returns were observed. This is not a request to invest500,000 real yuan.',
 note:'Frozen offline nonlinear research scores, not verified success probabilities. Each stock has at most20% of original cash, remainder stays cash. Independent second time window, not a directly comparable controlled performance improvement versus the morning period. No real orders, no intraday sell.'};
function claimExperiment(location){
 const reject=()=>{const e=new Error('An existing queued or started candidate experiment must not be overwritten or restarted');e.code='EXPERIMENT_EXISTS';throw e;};
 if(fs.existsSync(path.join(location,'status.json')))reject();
 try{fs.closeSync(fs.openSync(path.join(location,'experiment.claim'),'wx'));}catch(e){if(e.code==='EEXIST')reject();throw e;}
}
function createSession(quotes,now){
 const model={version:'hgb-research-2026-frozen',cutoff:'2024-12-31',calibrationCutoff:'2025-12-31',horizon:20,kind:'offline-profit-price-classifier',deployed:false};
 const base=Paper.start({universe:Market.UNIVERSE,quotes,model,now,budget:declaration.budget,symbols:selected.map(r=>r.symbol),predictions:{}});
 const account={cash:declaration.budget,holdings:[]},pieceBudget=declaration.budget*declaration.maxPositionWeight;
 for(const pick of selected){const piece=Paper.start({universe:Market.UNIVERSE,quotes,model,now,budget:pieceBudget,symbols:[pick.symbol],predictions:{}}).account;
  account.cash-=pieceBudget-piece.cash;account.holdings.push(...piece.holdings.map(h=>({...h,researchScore:pick.researchProbability})));
 }
 account.equity=account.cash+account.holdings.reduce((n,h)=>n+h.shares*h.lastPrice,0);
 base.account=account;base.selection='nonlinear_research_with_cash';base.researchDeclaration=declaration;return base;
}
async function main(){
 claimExperiment(dir);
 if(fs.existsSync(path.join(dir,'declaration-frozen.json'))&&!fs.existsSync(path.join(dir,'declaration-before-lot-correction.json')))fs.copyFileSync(path.join(dir,'declaration-frozen.json'),path.join(dir,'declaration-before-lot-correction.json'));
 save('declaration-frozen.json',declaration);save('status.json',{queued:true,done:false,scheduledAt,selected,budget:declaration.budget,maxPositionWeight:declaration.maxPositionWeight,declaredAt:declaration.declaredAt,pid:process.pid});
 console.log(JSON.stringify({queued:true,pid:process.pid,scheduledAt,selected:selected.map(x=>({name:x.name,symbol:x.symbol,score:x.researchProbability}))}));
 while(Date.now()<Date.parse(scheduledAt)){if(fs.existsSync(path.join(dir,'cancelled')))throw new Error('Candidate experiment cancelled');await new Promise(resolve=>setTimeout(resolve,Math.min(30000,Date.parse(scheduledAt)-Date.now())));}
 if(Date.now()>Date.parse('2026-10-19T13:03:00+08:00'))throw new Error('Scheduled entry missed; no historical entry will be fabricated');
 let quotes;for(let attempt=0;attempt<4;attempt++){quotes=await Market.quotes();if(selected.every(p=>quotes[p.symbol]&&!Market.isStale(quotes[p.symbol])&&!quotes[p.symbol].cached))break;if(attempt===3)throw new Error('No fresh candidate quotes at actual entry');await new Promise(resolve=>setTimeout(resolve,10000));}
 let session=createSession(quotes),ticks=0,errors=0;const start=Date.parse(session.startedAt),end=start+3600000,sourceTimes=new Set();
 save('manifest.json',{...declaration,startedAt:session.startedAt,plannedEndAt:new Date(end).toISOString(),session});fs.writeFileSync(path.join(dir,'ticks.jsonl'),'');
 while(true){if(fs.existsSync(path.join(dir,'cancelled')))throw new Error('Candidate experiment cancelled');const at=new Date().toISOString();
  try{if(ticks)quotes=await Market.quotes();session=Paper.mark(session,quotes,at);const source=Object.values(quotes).map(q=>q.sourceTime||'').sort().pop();if(source)sourceTimes.add(source);fs.appendFileSync(path.join(dir,'ticks.jsonl'),JSON.stringify({observedAt:at,sourceTime:source,quotes,equity:session.account.equity,benchmarkEquity:session.benchmark.equity})+'\n');}
  catch(e){errors++;fs.appendFileSync(path.join(dir,'ticks.jsonl'),JSON.stringify({observedAt:at,error:e.message})+'\n');}
  ticks++;const done=Date.now()>=end;save('status.json',{queued:false,done,startedAt:new Date(start).toISOString(),plannedEndAt:new Date(end).toISOString(),observedAt:session.observedAt,elapsedMs:Date.now()-start,ticks,errors,distinctSourceTimes:sourceTimes.size,lastSourceTime:[...sourceTimes].sort().pop(),session,pid:process.pid});
  if(ticks===1||ticks%10===0||done)console.log(JSON.stringify({done,ticks,errors,equity:session.account.equity,benchmark:session.benchmark.equity}));
  if(done)break;await new Promise(resolve=>setTimeout(resolve,Math.min(30000,Math.max(1,end-Date.now()))));
 }
 console.log('Second fixed-candidate paper observation completed');
}
if(require.main===module)main().catch(e=>{if(e.code!=='EXPERIMENT_EXISTS')save('failure.json',{at:new Date().toISOString(),error:e.stack});console.error(e.message);process.exitCode=1;});
module.exports={createSession,declaration,claimExperiment};
