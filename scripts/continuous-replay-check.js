'use strict';
// Deterministic artificial account fixtures. No market observations, returns test,
// model optimisation, broker connection or production account mutation occurs here.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Paper = require('../assets/paper-engine.js');
const Calendar = require('../assets/trading-calendar.js');
const Audit = require('../assets/audit-identity.js');
const clone = value => JSON.parse(JSON.stringify(value));
const instant = (date,time='09:30:00') => new Date(date+'T'+time+'+08:00').toISOString();
const sourceTime = at => new Date(Date.parse(at)+8*3600000).toISOString().slice(0,19).replace('T',' ');
const SYMBOLS = ['sh588000','sh512760'];

function quotes(at, prices=[1,1], overrides={}) {
  const result={};
  for (let i=0;i<SYMBOLS.length;i++) if (prices[i]!==null) result[SYMBOLS[i]]={price:prices[i],open:1,sourceTime:sourceTime(at),receivedAt:at,...(overrides[SYMBOLS[i]]||{})};
  return result;
}
function input(date='2026-10-20', options={}) {
  const now=instant(date), signal=Calendar.previousSession(date);
  return {
    accountId:'synthetic-lifecycle-'+date, now, budget:10000, allocationMode:'full', historicalReplay:true,
    executionMode:'synthetic_offline_replay', minFee:5, corporateEvents:[],
    universe:SYMBOLS.map((symbol,i)=>({symbol,name:'Synthetic ETF '+i,type:'etf',theme:i?'semiconductor':'broad-tech'})),
    quotes:quotes(now), predictions:Object.fromEntries(SYMBOLS.map(symbol=>[symbol,{eligible:true,asOf:signal,signalDate:signal,entrySession:date,horizon:20,maturitySession:Calendar.maturitySession(date,20),referenceOpen:null,expectedReturn:.5}])),
    model:{version:'synthetic-frozen-ridge-contract',kind:'fixture-no-trained-return-claim',coefficients:[0]},
    dataHealth:{ok:true,expectedAsOf:signal,dataAsOf:signal}, ...clone(options)
  };
}
function tick(date,time='09:30:00',prices=[1,1],overrides={},context={}) {
  const at=instant(date,time); return {at,quotes:quotes(at,prices,overrides),context};
}
function corporateEvents() {
  return [
    {id:'synthetic-split-20261021',symbol:SYMBOLS[0],type:'split',recordDate:'2026-10-20',exDate:'2026-10-21',ratio:2,publishedAt:'2026-10-19T08:00:00Z',firstReceivedAt:'2026-10-19T08:01:00Z',source:'synthetic fixture; no issuer event claim'},
    {id:'synthetic-dividend-20261022',symbol:SYMBOLS[0],type:'dividend',recordDate:'2026-10-21',exDate:'2026-10-22',payDate:'2026-10-26',cashPerShare:.02,publishedAt:'2026-10-19T08:00:00Z',firstReceivedAt:'2026-10-19T08:01:00Z',source:'synthetic fixture; no issuer event claim'}
  ];
}
function scenarios() {
  const maturity=Calendar.maturitySession('2026-10-20',20);
  const split=corporateEvents();
  return [
    {name:'same_day_t1_then_next_session_exit',input:input(),ticks:[tick('2026-10-20','09:31:00',[1.6,1]),tick('2026-10-21','09:30:00',[1.55,1])]},
    {name:'holiday_t1_defers_to_next_exchange_session',input:input('2026-09-30'),ticks:[tick('2026-09-30','09:31:00',[1.6,1]),tick('2026-10-01','09:30:00',[null,null]),tick('2026-10-08','09:30:00',[1.55,1])]},
    {name:'twenty_session_maturity',input:input(),ticks:[tick(Calendar.previousSession(maturity),'09:30:00',[1.02,1.02]),tick(maturity,'09:30:00',[1.02,1.02])]},
    {name:'limit_down_unfilled_then_retry',input:input(),ticks:[tick('2026-10-21','09:30:00',[.85,1],{sh588000:{tradeStatus:'limit_down'}}),tick('2026-10-21','09:31:00',[.84,1])]},
    {name:'partial_outage_keeps_valid_holding_mark',input:input(),ticks:[tick('2026-10-20','09:31:00',[1.05,null]),tick('2026-10-20','09:32:00',[1.04,1.02])]},
    {name:'split_dividend_receivable_payment_and_duplicate_events',input:input('2026-10-20',{corporateEvents:[...split,clone(split[0]),clone(split[1])]}),ticks:[tick('2026-10-21','09:30:00',[.5,1]),tick('2026-10-22','09:30:00',[.48,1]),tick('2026-10-22','09:30:30',[.48,1]),tick('2026-10-26','09:30:00',[.48,1])]},
    {name:'dividend_remains_due_after_sale',input:input('2026-10-20',{corporateEvents:split}),ticks:[tick('2026-10-21','09:30:00',[.5,1]),tick('2026-10-22','09:30:00',[.48,1]),tick('2026-10-23','09:30:00',[.4,1]),tick('2026-10-26','09:30:00',[.4,1])]},
    {name:'exposure_theme_and_investable_constraints',input:input('2026-10-20',{riskLimits:{investableLimit:4000,maxExposure:.3,maxPositions:2,maxThemeWeight:.2},universe:SYMBOLS.map(symbol=>({symbol,name:'Synthetic shared-theme ETF',type:'etf',theme:'same-tech-theme'}))}),ticks:[tick('2026-10-20','09:31:00',[1,1])]}
  ].map(spec=>({...spec,input:{...spec.input,accountId:'synthetic-lifecycle:'+spec.name}}));
}
function samePaths(spec) {
  const initial=Paper.startAuto(clone(spec.input));
  let incremental=Paper.resume(clone(initial));
  const checkpoints=[];
  for (const t of spec.ticks) { incremental=Paper.stepAuto(incremental,clone(t.quotes),t.at,clone(t.context||{})); checkpoints.push(clone(incremental)); }
  const replay=Paper.replay(clone(initial),clone(spec.ticks));
  for (const key of ['orders','ledger','account','comparisons','closedPositions','integrityHash']) assert.deepEqual(replay[key],incremental[key],spec.name+': '+key+' differs');
  assert.deepEqual(replay,incremental,spec.name+': full snapshots differ');
  return {name:spec.name,input:clone(spec.input),ticks:clone(spec.ticks),inputHash:Audit.hash({input:spec.input,ticks:spec.ticks}),initial,checkpoints,final:incremental,incrementalEqualsReplay:true,finalHash:incremental.integrityHash};
}
function createReport() {
  const results=scenarios().map(samePaths), sources={};
  for (const name of ['paper-engine.js','paper-account.js','trading-calendar.js','fee-profile.js','audit-identity.js','corporate-actions.js']) sources[name]=crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../assets',name))).digest('hex');
  return {schema:1,purpose:'synthetic offline account lifecycle and shared-rule parity; not investment performance',marketData:false,forwardObservation:false,realOrders:false,capital:10000,capitalResetDuringScenario:false,calendarVersion:Calendar.version,sourceHashes:sources,results,allEquivalent:results.every(r=>r.incrementalEqualsReplay),reportHash:Audit.hash(results.map(r=>({name:r.name,inputHash:r.inputHash,finalHash:r.finalHash})))};
}
if(require.main===module){
  const report=createReport(),dir=path.join(__dirname,'../validation/audit-repair');fs.mkdirSync(dir,{recursive:true});
  const output=path.join(dir,'offline-replay-ledger.json');
  if(fs.existsSync(output)){
    const old=fs.readFileSync(output),oldHash=crypto.createHash('sha256').update(old).digest('hex');
    if(!fs.existsSync(path.join(dir,'offline-replay-ledger.previous-'+oldHash.slice(0,16)+'.json')))fs.writeFileSync(path.join(dir,'offline-replay-ledger.previous-'+oldHash.slice(0,16)+'.json'),old);
  }
  fs.writeFileSync(output,JSON.stringify(report,null,2));
  process.stdout.write(JSON.stringify({output,synthetic:true,investmentPerformance:false,scenarios:report.results.length,allEquivalent:report.allEquivalent,reportHash:report.reportHash})+'\n');
}
module.exports={input,quotes,tick,instant,corporateEvents,scenarios,samePaths,createReport};
