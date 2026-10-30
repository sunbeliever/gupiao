'use strict';
const fs=require('node:fs'),path=require('node:path'),A=require('../assets/audit-identity.js'),C=require('../assets/trading-calendar.js'),Core=require('./paired-forward-core.js'),View=require('./research-account-view.js'),Decision=require('./decision-research-view.js');
const ROOT='D:/techno/validation/forward-comparison/paired-capital50k-20261021-pm-a',MANIFEST='29935f3137b05610a10e6d00337329fe0434f19203ae6f7fbd0b1704f7246f8e',STUDY='forward-manager-paired-20261102-a',ASSESSMENT='D:/techno/validation/strategy-research/'+STUDY+'/event-status.json';
const SYMBOLS=Object.freeze(['sh588000','sh512760','sh515070','sh512720','sh515880','sz159852']);
const clone=x=>JSON.parse(JSON.stringify(x));
function json(file,max){const stat=fs.lstatSync(file);if(stat.isSymbolicLink()||!stat.isFile()||stat.size>max)throw Error('Unsafe or oversized forward source file');const b=fs.readFileSync(file);if(b.length>max)throw Error('Forward source file grew beyond limit');return JSON.parse(b.toString('utf8'));}
function packetFromValidatedInput(input,eventAssessment,now=Date.now()){
 const actual=Date.now(),at=typeof now==='number'?now:Date.parse(now),observed=typeof input?.now==='number'?input.now:Date.parse(input?.now),p=input?.provenance,e=eventAssessment;
 if(!Number.isFinite(at)||at>actual||actual-at>90000||!Number.isFinite(observed)||observed>at||at-observed>90000||p?.accountId!=='paired-capital50k-20261021-pm-a'||p.sourceManifestHash!==MANIFEST)throw Error('Unpinned or stale forward source input');
 const checked=Date.parse(e?.checkedAt),date=C.sessionOf(at);
 if(!e||e.schema!==1||e.studyId!==STUDY||e.asOfSession!==date||e.status!=='no_known_pending_event'||!Array.isArray(e.symbols)||e.symbols.length!==6||new Set(e.symbols).size!==6||SYMBOLS.some(symbol=>!e.symbols.includes(symbol))||!Array.isArray(e.events)||e.events.length||!Number.isFinite(checked)||checked>at||at-checked>1800000||!Array.isArray(e.evidenceHashes)||!e.evidenceHashes.length||e.evidenceHashes.some(h=>!/^[a-f0-9]{64}$/.test(h)))throw Error('Forward event surveillance missing, unknown or stale');
 const packet={now:new Date(observed).toISOString(),universe:clone(input.universe),histories:clone(input.histories),quotes:clone(input.quotes),corporateActionStatus:e.status,corporateEvents:[],eventAssessmentHash:A.hash(e),eventEvidenceHashes:[...e.evidenceHashes],provenance:{...clone(p),quotesHash:A.hash(input.quotes),preparedHistoriesHash:A.hash(input.histories)}};
 packet.packetHash=A.hash(packet);return packet;
}
function capture(now=Date.now()){
 try{const at=typeof now==='number'?now:Date.parse(now);if(!C.isTradingTime(at))throw Error('Not a continuous trading session');const assessment=json(ASSESSMENT,65536),data=Object.fromEntries(['manifest','claim','state','status'].map(k=>[k,json(path.join(ROOT,k==='claim'?'experiment.claim':k+'.json'),32*1024*1024)]));if(A.hash(data.manifest)!==MANIFEST)throw Error('Original forward source manifest changed');data.tick=Core.lastTick(ROOT,{maxBytes:16*1024*1024});if(!data.tick)throw Error('No committed source tick');data.histories=data.tick.input.histories;data.quotes=data.tick.input.quotes;const input=Decision.prepare(data,View.build(data,new Date(at).toISOString()),at);input.provenance.sourceManifestHash=MANIFEST;return {available:true,packet:packetFromValidatedInput(input,assessment,at),originalAccountUnchanged:true};
 }catch(e){return {available:false,reason:e.message,packet:null,originalAccountUnchanged:true};}
}
// Pure binding helper assumes Decision.prepare already verified source coherence; it does not authenticate facts.
module.exports={capture,packetFromValidatedInput};
