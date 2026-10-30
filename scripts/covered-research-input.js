'use strict';
const C=require('../assets/trading-calendar.js');
const SYMBOLS=Object.freeze(['sh588000','sh512760','sh515070','sh512720','sh515880','sz159852']);
function validDate(d){return typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d&&C.isSession(d);}
function sessions(start,end){const out=[];for(let t=Date.parse(start+'T00:00:00Z');t<=Date.parse(end+'T00:00:00Z');t+=86400000){const d=new Date(t).toISOString().slice(0,10);if(C.isSession(d))out.push(d);}return out;}
function slice(input,request){
 const {start,end}=request||{};if(!validDate(start)||!validDate(end)||start>end||start<'2025-01-01'||end>'2026-06-30')throw Error('Only the declared cash-covered 2025/2026H1 sessions are supported');
 const reference=input?.histories?.[SYMBOLS[0]];if(!Array.isArray(reference))throw Error('Six paired raw/hfq inputs required');
 const before=reference.filter(b=>b.date<start);if(before.length<61)throw Error('61 completed prior sessions required');
 const warmupStart=before.at(-61).date,expected=sessions(warmupStart,end),data={raw:{},histories:{}};
 for(const symbol of SYMBOLS)for(const kind of ['raw','histories']){
  const source=input?.[kind]?.[symbol];if(!Array.isArray(source))throw Error('Missing registered instrument/adjustment');let previous='';
  for(const b of source){if(!validDate(b.date)||b.date<=previous)throw Error('Invalid or duplicate source session');previous=b.date;}
  const rows=source.filter(b=>b.date>=warmupStart&&b.date<=end);
  if(JSON.stringify(rows.map(b=>b.date))!==JSON.stringify(expected))throw Error('Missing or mismatched raw/hfq sessions');
  for(const b of rows){if(![b.open,b.close,b.high,b.low,b.volume].every(Number.isFinite)||b.low<=0||b.volume<0||b.high<Math.max(b.open,b.close,b.low)||b.low>Math.min(b.open,b.close))throw Error('Invalid research OHLC/volume');}
  data[kind][symbol]=JSON.parse(JSON.stringify(rows));
 }
 if(data.histories[SYMBOLS[0]].filter(b=>b.date<start).length!==61)throw Error('Prior-session warmup mismatch');
 return{schema:1,start,end,warmupStart,warmupSessions:61,evaluationSessions:sessions(start,end),data,financialExecutionAuthorized:false,financialRankingReady:false,investmentReady:false,limitations:['Input preparation only; complete corporate actions and separately sealed financial protocol remain required.','These historical observations were already seen; this is not a blind holdout.','Daily opening executions remain hypothetical; no PIT or actual fill certification.']};
}
module.exports={SYMBOLS,slice};
