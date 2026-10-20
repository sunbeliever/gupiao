'use strict';
// Reconstructed checks against the unchanged EXE extraction. The review's original scripts were not supplied.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),out=path.join(root,'validation/audit-repair/baseline'),embedded=path.join(out,'embedded/assets');
const Paper=require(path.join(embedded,'paper-engine.js')),Analysis=require(path.join(embedded,'analysis.js'));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const cnTime=iso=>new Date(Date.parse(iso)+8*3600000).toISOString().slice(0,19).replace('T',' ');
const universe=[{symbol:'sh588000',name:'fixture benchmark',type:'etf'},{symbol:'sh512760',name:'fixture ETF',type:'etf'},{symbol:'sh600703',name:'fixture stock',type:'stock'}];
function quotes(iso='2026-10-20T01:30:00Z',prices={}){return Object.fromEntries(universe.map(u=>[u.symbol,{price:prices[u.symbol]??(u.type==='stock'?9:1),open:u.type==='stock'?9:1,sourceTime:cnTime(iso)}]));}
function input(extra={}){return {now:'2026-10-20T01:30:00Z',universe,quotes:quotes(),predictions:Object.fromEntries(universe.map(u=>[u.symbol,{eligible:true,expectedReturn:.06,asOf:'2026-10-19'}])),model:{version:'fixture-not-a-trained-model'},budget:10000,positionLimit:500,minFee:5,maxPositions:3,...extra};}
function marketFixture(iso='2026-10-20T01:31:00Z'){
 const BaseDate=Date,fixed=Date.parse(iso),cache=new Map();class FixedDate extends BaseDate{constructor(...args){super(...(args.length?args:[fixed]));}static now(){return fixed;}}
 const ctx={Date:FixedDate,setTimeout,clearTimeout,console,localStorage:{getItem:k=>cache.get(k)||null,setItem:(k,v)=>cache.set(k,v)}};ctx.window=ctx;
 vm.runInNewContext(fs.readFileSync(path.join(embedded,'market.js'),'utf8'),ctx,{filename:'old-embedded-market.js'});return {ctx,market:ctx.Market};
}
const checks=[];
async function check(id,title,fixture,run){try{const result=await run();checks.push({id,title,fixture,triggered:result.triggered,...result});}catch(e){checks.push({id,title,fixture,triggered:false,error:e.stack});}}
function generatedBars(n=800){const result=[],d=new Date('2023-01-02T00:00:00Z');while(result.length<n){if(d.getUTCDay()>0&&d.getUTCDay()<6){const p=100*Math.pow(1.01,result.length);result.push({date:d.toISOString().slice(0,10),open:p,close:p,high:p*1.001,low:p*.999,volume:100});}d.setUTCDate(d.getUTCDate()+1);}return result;}
async function main(){
 await check('A01','30-minute observation freezes later valuation and exits',{initialAt:'2026-10-20 09:30:00',durationMs:1800000,nextAt:'2026-10-21 09:31:00',nextFixturePrice:2},()=>{
  let s=Paper.startAuto(input());for(let t=30;t<=1800;t+=30){const at=new Date(Date.parse(s.startedAt)+t*1000).toISOString();s=Paper.stepAuto(s,quotes(at),at);}
  const later=Paper.stepAuto(s,quotes('2026-10-21T01:31:00Z',{sh588000:2,sh512760:2}),'2026-10-21T01:31:00Z');
  return {triggered:s.automation.windowEnded&&JSON.stringify(later)===JSON.stringify(s),windowEnded:s.automation.windowEnded,engineeringDone:s.automation.done,priorObservedAt:s.observedAt,laterObservedAt:later.observedAt,priorEquity:s.account.equity,laterEquity:later.account.equity,sellCount:later.automation.events.filter(e=>e.action==='sell').length};
 });
 await check('A02','Unrelated research quote failure prevents valid held mark',{missingSymbol:'sh600703',heldSymbol:'sh588000',newFixturePrice:1.2},()=>{
  const s=Paper.startAuto(input()),at='2026-10-20T01:31:00Z',q=quotes(at,{sh588000:1.2});delete q.sh600703;
  const next=Paper.stepAuto(s,q,at),direct=Paper.mark(s,q,at),held=next.account.holdings.find(h=>h.symbol==='sh588000');
  return {triggered:held.lastPrice===1&&direct.account.holdings.find(h=>h.symbol==='sh588000').lastPrice===1.2,observedLastPrice:held.lastPrice,validDirectMarkPrice:direct.account.holdings.find(h=>h.symbol==='sh588000').lastPrice,dataFailureTicks:next.automation.dataFailureTicks};
 });
 await check('A03','Stale successful primary and failed fallback record today with empty errors',{fakeNow:'2026-10-20 09:31:00',expectedCompletedDate:'2026-10-19',primaryLastDate:'2026-10-16',fallback:'throw synthetic offline'},async()=>{
  const {ctx,market}=marketFixture(),symbol='sh588000',bar={date:'2026-10-16',open:1,close:1,high:1.01,low:.99,volume:100};ctx.TECH_SEED={histories:{[symbol]:[bar]}};
  const requests=[];market.setTransport(async url=>{requests.push(url);if(url.includes('eastmoney.com'))throw new Error('synthetic fallback offline');return JSON.stringify({data:{[symbol]:{hfqday:[[bar.date,1,1,1.01,.99,100]]}}});});
  const bars=await market.history(symbol),saved=market.read('hist_'+symbol);
  return {triggered:bars.at(-1).date==='2026-10-16'&&saved.fetchedDate==='2026-10-20'&&saved.errors.length===0,dataAsOf:bars.at(-1).date,fetchedDate:saved.fetchedDate,fetchedAt:saved.fetchedAt,errors:saved.errors,fallbackAttempted:requests.some(x=>x.includes('eastmoney.com'))};
 });
 await check('A04','Identical stock is selected only when stock taxes omitted',{stock:'sh600703',price:1,referenceOpen:1,forecastReturn:.0032,budget:10000,positionLimit:10000,minFee:5,maxPositions:1},()=>{
  const u={symbol:'sh600703',name:'synthetic stock',type:'stock'},i=input({universe:[u],quotes:{sh600703:{price:1,open:1,sourceTime:'2026-10-20 09:30:00'}},predictions:{sh600703:{eligible:true,expectedReturn:.0032,asOf:'2026-10-19'}},positionLimit:10000,maxPositions:1});
  const normal=Paper.plan(i),autoCost=Paper.plan({...i,includeStockTaxes:true});return {triggered:normal.selected.length===1&&autoCost.selected.length===0,normalRow:normal.rows[0],autoCostRow:autoCost.rows[0]};
 });
 await check('A05','National Day is accepted by weekday-only trading check',{at:'2026-10-01 09:31:00',exchangeHoliday:true},()=>({triggered:Paper.trading(Date.parse('2026-10-01T01:31:00Z')),oldTrading:Paper.trading(Date.parse('2026-10-01T01:31:00Z'))}));
 await check('A06','Later entry-day full-session H/L/V decide opening eligibility',{history:'one synthetic geometrically growing instrument, 800 weekdays from 2023-01-02',onlyChange:'first 2025 entry date high=low=open=close; separately daily volume=0',sameEntryOpen:true,modelAndSignalPrefixUnchanged:true},()=>{
  const bars=generatedBars(),normal=Analysis.evaluate({A:bars},2025,{horizon:20,alpha:1,feeRate:.0015}),first=normal.trades[0];if(!first)throw new Error('Synthetic positive series produced no trade');
  const single=bars.map(b=>b.date===first.entryDate?{...b,high:b.open,low:b.open}:b),zero=bars.map(b=>b.date===first.entryDate?{...b,volume:0}:b);
  const changed=Analysis.evaluate({A:single},2025,{horizon:20,alpha:1,feeRate:.0015}).trades[0],changedVolume=Analysis.evaluate({A:zero},2025,{horizon:20,alpha:1,feeRate:.0015}).trades[0];
  return {triggered:first.entered===true&&changed.entered===false&&changedVolume.entered===false,originalFirstTrade:first,flatRangeFirstTrade:changed,zeroVolumeFirstTrade:changedVolume};
 });
 await check('A07','Old forecast is translated to a later current open',{signalDate:'2025-01-02',quoteDate:'2026-10-20',currentOpen:1,forecastReturn:.06,horizon:20},()=>{
  const u=universe[0],i=input({universe:[u],quotes:{[u.symbol]:{price:1,open:1,sourceTime:'2026-10-20 09:30:00'}},predictions:{[u.symbol]:{eligible:true,expectedReturn:.06,asOf:'2025-01-02'}},positionLimit:10000,maxPositions:1});const p=Paper.plan(i);
  return {triggered:p.selected.length===1,row:p.rows[0],signalContractMissingFields:['entrySession','horizon','maturitySession']};
 });
 await check('A08','Literal negative expectation title is labeled positive',{title:'业绩增长不及预期',contentProvided:false},()=>{
  const {market}=marketFixture(),row=market.parseNews({result:{cmsArticleWebOld:[{title:'业绩增长不及预期',url:'https://finance.eastmoney.com/a/fixture.html',date:'2026-10-19',mediaName:'fixture'}]}},'synthetic')[0];return {triggered:row.sentiment==='偏积极',parsed:row};
 });
 const metadata={generatedAt:new Date().toISOString(),scope:'Reconstructed artificial offline behavior checks, NOT original review scripts, original 88 tests, market performance or forward evidence',originalReviewScriptsProvided:false,exeSha256:'e68ee81a8a42b8c26baad12bf7ce1b6640d6e0742ed3a1284631ba7cf9fcb4c2',frozenModules:Object.fromEntries(['paper-engine.js','analysis.js','market.js','seed.js'].map(x=>[x,sha(path.join(embedded,x))]))};
 fs.writeFileSync(path.join(out,'behavior-reproduction.json'),JSON.stringify({...metadata,triggered:checks.filter(x=>x.triggered).length,total:checks.length,checks},null,2));
 const sandbox={};sandbox.window=sandbox;vm.runInNewContext(fs.readFileSync(path.join(embedded,'seed.js'),'utf8'),sandbox,{filename:'old-embedded-seed.js'});const seed=sandbox.TECH_SEED,years=[];
 const metrics=['asOf','sampleCount','mae','directionAccuracy','signalDayCount','strategyReturn','benchmarkReturn','maxDrawdown'];
 for(const year of [2025,2026]){const computed=Analysis.evaluate(seed.histories,year,{horizon:20,alpha:seed.model.alpha,feeRate:.0015}),expected=seed.reports[String(year)],comparisons=Object.fromEntries(metrics.map(k=>[k,{embedded:expected[k],computed:computed[k],equal:typeof computed[k]==='number'&&typeof expected[k]==='number'?Math.abs(computed[k]-expected[k])<1e-12:computed[k]===expected[k]}]));
  const curveEqual=JSON.stringify(computed.curve)===JSON.stringify(expected.curve),tradesEqual=JSON.stringify(computed.trades)===JSON.stringify(expected.trades);years.push({year,allMetricsMatch:Object.values(comparisons).every(x=>x.equal),curveExactMatch:curveEqual,tradesExactMatch:tradesEqual,comparisons,recomputed:computed});
 }
 const reportsMatch=years.every(x=>x.allMetricsMatch&&x.curveExactMatch&&x.tradesExactMatch);
 fs.writeFileSync(path.join(out,'embedded-report-reproduction.json'),JSON.stringify({...metadata,scope:'Only unchanged embedded histories and unchanged embedded Analysis.evaluate; no live data/news, no new-model training or strategy promotion. Old evaluate internally refits its declared folds.',modelVersion:seed.model.version,alpha:seed.model.alpha,allMatch:reportsMatch,years},null,2));
 console.log(JSON.stringify({checks:checks.map(x=>({id:x.id,triggered:x.triggered,error:x.error||null})),triggered:checks.filter(x=>x.triggered).length,embeddedReports:years.map(x=>({year:x.year,allMetricsMatch:x.allMetricsMatch,curveExactMatch:x.curveExactMatch,tradesExactMatch:x.tradesExactMatch})),allMatch:reportsMatch,outputDirectory:out}));
 process.exitCode=checks.every(x=>x.triggered)&&reportsMatch?0:1;
}
main().catch(e=>{fs.writeFileSync(path.join(out,'reproduction-fatal-error.json'),JSON.stringify({at:new Date().toISOString(),error:e.stack},null,2));console.error(e.stack);process.exitCode=1;});
