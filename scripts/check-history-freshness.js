'use strict';
// Health-only repair verification. Does not retry the daily journal or alter a trade.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const dir=path.resolve(__dirname,'../validation/history-freshness-repair');fs.mkdirSync(path.join(dir,'cache'),{recursive:true});
global.Native=require('./research-file-store.js').createFileStore(path.join(dir,'cache'));
const ctx={window:{}};vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../assets/seed.js'),'utf8'),ctx);global.TECH_SEED=ctx.window.TECH_SEED;
const Market=require('../assets/market.js');
Market.setTransport(async url=>{const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0',Referer:'https://www.eastmoney.com/'},signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('HTTP '+r.status);return r.text();});
(async()=>{const histories=await Market.syncHistories(),today=new Date(Date.now()+8*3600000).toISOString().slice(0,10),rows=Market.UNIVERSE.map(u=>({symbol:u.symbol,asOf:histories[u.symbol]?.at(-1)?.date,errors:Market.read('hist_'+u.symbol)?.errors})),report={checkedAt:new Date().toISOString(),today,complete:rows.every(r=>r.asOf===today&&!r.errors?.length),rows,healthOnly:true,journalReattempted:false,previousDailyFailurePreserved:true};fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(!report.complete)process.exitCode=1;})().catch(e=>{console.error(e);process.exitCode=1;});
