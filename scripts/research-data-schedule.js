'use strict';
const path=require('node:path'),Calendar=require('../assets/trading-calendar.js');
const PROTOCOL='stable-daily-data-protocol-20261028-a';
const PROTOCOL_SHA256='bca81aacb248f9092876a14c51ab7493f276147cecc4f6e98373b72f55f000dc';
function plan(directory,now=Date.now()){
 const ms=Number(now);if(!Number.isFinite(ms))return null;
 const captureSession=new Date(ms+8*3600000).toISOString().slice(0,10),minutes=(new Date(ms).getUTCHours()*60+new Date(ms).getUTCMinutes()+480)%1440;
 if(captureSession<'2026-10-29'||captureSession>'2026-12-31'||minutes<540||!Calendar.isSession(captureSession))return null;
 const expectedAsOf=Calendar.previousSession(captureSession);
 return {id:'stable-daily-data-'+captureSession,expectedAsOf,years:[Number(expectedAsOf.slice(0,4))],root:path.join(directory,'datasets'),sourceAccount:'D:/techno/validation/forward-comparison/paired-capital50k-20261021-pm-a',minBars:60,sourceBinding:{kind:'next-session-complete-v1',protocolId:PROTOCOL,protocolSha256:PROTOCOL_SHA256,captureSession}};
}
function matches(policy,now=Date.now()){
 try{
  const capture=policy?.sourceBinding?.captureSession,ms=Number(now);
  if(typeof capture!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(capture)||typeof policy.root!=='string'||!Number.isFinite(ms))return false;
  const plannedAt=Date.parse(capture+'T01:00:00Z');
  if(!Number.isFinite(plannedAt)||ms<plannedAt)return false;
  const expected=plan(path.dirname(policy.root),plannedAt);
  return expected!==null&&require('node:util').isDeepStrictEqual(policy,expected);
 }catch{return false;}
}
function admit(policy,now=Date.now(),accepted=false){
 const stable=policy?.sourceBinding?.kind==='next-session-complete-v1';
 if(stable&&!matches(policy,now))throw Error('Invalid stable data declaration or capture time');
 const latest=Calendar.expectedCompletedSession(Number(now));
 if(policy.expectedAsOf>latest||(!accepted&&policy.expectedAsOf!==latest&&!stable))throw Error('Only completed-session dataset may be collected');
 return stable?{...policy.sourceBinding}:null;
}
module.exports={plan,matches,admit};
