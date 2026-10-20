'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'validation','live-paper');fs.mkdirSync(dir,{recursive:true});
const ctx={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/seed.js'),'utf8'),ctx);const seed=ctx.window.TECH_SEED;
global.TECH_SEED=seed;
global.Native={read:key=>{const f=path.join(dir,'cache',key+'.json');return fs.existsSync(f)?fs.readFileSync(f,'utf8'):'';},write:(key,value)=>{if(!/^[A-Za-z0-9_.-]+$/.test(key))return false;fs.mkdirSync(path.join(dir,'cache'),{recursive:true});fs.writeFileSync(path.join(dir,'cache',key+'.json'),value);return true;}};
const Market=require('../assets/market.js'),Analysis=require('../assets/analysis.js'),Paper=require('../assets/paper-engine.js');
Market.setTransport(async url=>{const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 TechScopeResearch/1.2',Referer:'https://www.eastmoney.com/'},signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error('HTTP '+r.status);return url.includes('qt.gtimg.cn')?new TextDecoder('gb18030').decode(await r.arrayBuffer()):r.text();});
const save=(name,value)=>{const f=path.join(dir,name);fs.writeFileSync(f+'.pending',JSON.stringify(value,null,2));fs.renameSync(f+'.pending',f);};
async function main(){
 console.log('Synchronizing completed histories before freezing live paper selections');
 const histories=await Market.syncHistories();const cutoff=Object.values(histories).map(b=>b.at(-1)?.date).filter(Boolean).sort().pop();
 // Preserve the deployed model. A separate freshly trained challenger is not silently substituted.
 const model=seed.model,predictions=Object.fromEntries(Market.UNIVERSE.map(u=>[u.symbol,Analysis.predict(model,histories[u.symbol]||[])]));
 const quotes=await Market.quotes(),session=Paper.start({universe:Market.UNIVERSE,quotes,predictions,model,budget:100000});
 const start=Date.parse(session.startedAt),end=start+3600000;let current=session,tick=0,errors=0,distinct=new Set(),lastSource='';
 const manifest={startedAt:session.startedAt,plannedEndAt:new Date(end).toISOString(),durationMs:3600000,modelCutoff:model.cutoff,historyCutoff:cutoff,session,disclaimer:'Frozen experimental model choices, not investment recommendations; a one-hour valuation cannot score a 20-day forecast. Midday closure is expected; no intraday sell or real broker orders.'};
 save('manifest.json',manifest);fs.writeFileSync(path.join(dir,'ticks.jsonl'),'');
 console.log(JSON.stringify({startedAt:manifest.startedAt,plannedEndAt:manifest.plannedEndAt,holdings:session.account.holdings.map(h=>({symbol:h.symbol,name:h.name,shares:h.shares,entryPrice:h.entryPrice,predicted20DayReturn:h.predicted20DayReturn})),cash:session.account.cash}));
 while(true){const at=new Date().toISOString();try{const q=tick===0?quotes:await Market.quotes();current=Paper.mark(current,q,at);const source=Object.values(q).map(x=>x.sourceTime||'').sort().pop();if(source)distinct.add(source);lastSource=source;const row={observedAt:at,sourceTime:source,quotes:q,equity:current.account.equity,benchmarkEquity:current.benchmark.equity};fs.appendFileSync(path.join(dir,'ticks.jsonl'),JSON.stringify(row)+'\n');}catch(e){errors++;fs.appendFileSync(path.join(dir,'ticks.jsonl'),JSON.stringify({observedAt:at,error:e.message})+'\n');}
  tick++;const done=Date.now()>=end;save('status.json',{done,startedAt:manifest.startedAt,plannedEndAt:manifest.plannedEndAt,observedAt:current.observedAt,ticks:tick,errors,distinctSourceTimes:distinct.size,lastSourceTime:lastSource,elapsedMs:Date.now()-start,session:current});
  if(tick===1||tick%10===0||done)console.log(JSON.stringify({done,ticks:tick,errors,source:lastSource,equity:current.account.equity,benchmarkEquity:current.benchmark.equity,elapsedSeconds:Math.round((Date.now()-start)/1000)}));
  if(done)break;await new Promise(resolve=>setTimeout(resolve,Math.min(30000,Math.max(1,end-Date.now()))));
 }
 console.log('Completed one-hour observation; see validation/live-paper/status.json');
}
main().catch(e=>{save('failure.json',{at:new Date().toISOString(),error:e.stack});console.error(e.message);process.exitCode=1;});
