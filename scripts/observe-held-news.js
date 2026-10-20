'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'validation','live-paper-news');fs.mkdirSync(path.join(dir,'cache'),{recursive:true});
const manifest=JSON.parse(fs.readFileSync(path.join(root,'validation/live-paper/manifest.json'),'utf8'));
global.Native={read:key=>{const f=path.join(dir,'cache',key+'.json');return fs.existsSync(f)?fs.readFileSync(f,'utf8'):'';},write:(key,value)=>{if(!/^[A-Za-z0-9_.-]+$/.test(key))return false;fs.writeFileSync(path.join(dir,'cache',key+'.json'),value);return true;}};
const Market=require('../assets/market.js');
async function request(url){const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 TechScopeResearch/1.2',Referer:'https://www.eastmoney.com/'},signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error('HTTP '+r.status);return r.text();}
Market.setTransport(request);
async function observe(){const requestStartedAt=new Date().toISOString();const results=await Promise.all(manifest.session.account.holdings.map(async h=>{
 const out={symbol:h.symbol,name:h.name,news:[],announcements:[],errors:[]};
 const result=await Promise.allSettled([request(Market.newsUrl(h.name)),Market.announcements(h.symbol,true)]);
 if(result[0].status==='fulfilled'){out.news=Market.parseNews(result[0].value,h.name).filter(x=>x.title.includes(h.name));const receivedAt=new Date().toISOString();const archive=Market.archiveNews(out.news,receivedAt);const byUrl=new Map(archive.map(x=>[x.url,x]));out.news=out.news.map(x=>({...byUrl.get(x.url),confirmedObservedAt:receivedAt}));}else out.errors.push(result[0].reason.message);
 if(result[1].status==='fulfilled'){out.announcements=result[1].value.items;out.announcementCached=result[1].value.cached;}else out.errors.push(result[1].reason.message);
 return out;
}));const observedAt=new Date().toISOString(),record={schema:2,requestStartedAt,observedAt,results,note:'Limited public title search only; not a complete or guaranteed real-time news archive, no model retraining from future outcomes. Legacy schema1 timestamps were request-start approximations; use confirmed post-receipt timestamps for future features.'};
fs.appendFileSync(path.join(dir,'observations.jsonl'),JSON.stringify(record)+'\n');fs.writeFileSync(path.join(dir,'latest.json'),JSON.stringify(record,null,2));console.log(JSON.stringify({observedAt,companies:results.map(r=>({name:r.name,news:r.news.length,announcements:r.announcements.length,errors:r.errors.length}))}));}
async function main(){const end=Date.parse(manifest.plannedEndAt);let count=0;while(Date.now()<end){await observe();count++;if(process.argv.includes('--once'))break;await new Promise(resolve=>setTimeout(resolve,Math.min(300000,Math.max(1,end-Date.now()))));}console.log(JSON.stringify({done:true,snapshots:count,endedAt:new Date().toISOString()}));}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
