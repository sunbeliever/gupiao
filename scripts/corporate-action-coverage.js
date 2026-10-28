'use strict';
const fs=require('node:fs'),crypto=require('node:crypto');
const SYMBOLS=['512720','512760','515070','515880','588000','159852'];
const DAY=86400000;
function date(s){
  if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))throw Error('Invalid coverage date');
  const n=Date.parse(s+'T00:00:00Z');
  if(!Number.isFinite(n)||new Date(n).toISOString().slice(0,10)!==s)throw Error('Invalid coverage date');
  return n;
}
const iso=n=>new Date(n).toISOString().slice(0,10);
function range(r){const start=date(r.start),end=date(r.end);if(start>end)throw Error('Inverted coverage date range');return [start,end];}
function merge(ranges){
  const out=[];
  for(const r of ranges.sort((a,b)=>a[0]-b[0])){
    const last=out.at(-1);
    if(last&&r[0]<=last[1]+DAY)last[1]=Math.max(last[1],r[1]);else out.push([...r]);
  }
  return out;
}
function assess(proof,request){
  if(!proof||proof.schema!==1||!Array.isArray(proof.periods)||proof.periods.length>1000||!Array.isArray(proof.unknownIntervals)||proof.unknownIntervals.length>1000)throw Error('Invalid cash coverage evidence');
  if(!Array.isArray(request?.symbols)||request.symbols.length!==6||new Set(request.symbols).size!==6||request.symbols.some(s=>!SYMBOLS.includes(s)))throw Error('Expected six registered ETF symbols');
  const [start,end]=range(request),periods=[];
  for(const r of proof.periods){
    if(!SYMBOLS.includes(r?.symbol)||r.status!=='official_period_report_no_distribution'||!/^[a-f0-9]{64}$/.test(r.sha256||'')||!Array.isArray(r.evidence)||r.evidence.length===0||r.evidence.some(e=>!Number.isSafeInteger(e?.page)||e.page<1||typeof e.excerpt!=='string'||!e.excerpt.length||e.excerpt.length>2000))throw Error('Unsupported or missing cash distribution evidence');
    periods.push({symbol:r.symbol,range:range(r)});
  }
  const unknown=proof.unknownIntervals.map(r=>{if(!SYMBOLS.includes(r?.symbol)||r.status!=='not_verified')throw Error('Invalid unknown cash evidence');return {symbol:r.symbol,range:range(r)};});
  const gaps=[];
  for(const symbol of request.symbols){
    let cursor=start;const missing=[];
    for(const [a,b]of merge(periods.filter(r=>r.symbol===symbol).map(r=>r.range))){
      if(b<cursor||a>end)continue;
      if(a>cursor)missing.push([cursor,Math.min(end,a-DAY)]);
      cursor=Math.max(cursor,b+DAY);
      if(cursor>end)break;
    }
    if(cursor<=end)missing.push([cursor,end]);
    for(const r of unknown.filter(r=>r.symbol===symbol)){const a=Math.max(start,r.range[0]),b=Math.min(end,r.range[1]);if(a<=b)missing.push([a,b]);}
    for(const [a,b]of merge(missing))gaps.push({symbol,start:iso(a),end:iso(b)});
  }
  return {schema:1,scope:'cash-distribution coverage diagnostic only',period:{start:request.start,end:request.end},cashCoverageComplete:gaps.length===0,gaps,financialRankingReady:false,investmentReady:false,accountWrites:false,historicalFirstAvailabilityVerified:false,limitations:['Uses previously reviewed report assertions; source semantics are not re-certified by this interval checker.','Cash coverage alone does not establish complete corporate actions, lot entitlements, execution times or strategy validity.','No financial replay or candidate promotion is authorized by this result.']};
}
function readPinned(file,expectedSha256,request){
  if(!/^[a-f0-9]{64}$/.test(expectedSha256||'')||fs.statSync(file).size>65536)throw Error('Invalid pinned cash evidence hash or size');
  const bytes=fs.readFileSync(file);
  if(bytes.length>65536||crypto.createHash('sha256').update(bytes).digest('hex')!==expectedSha256)throw Error('Pinned cash evidence hash mismatch');
  return {...assess(JSON.parse(bytes.toString('utf8')),request),sourceProofSha256:expectedSha256};
}
module.exports={assess,readPinned};
