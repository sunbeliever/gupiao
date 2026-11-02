'use strict';
// The pure binder assumes readCommitted has verified the native evidence. Production capture uses only the fixed feed.
const fs=require('node:fs'),A=require('../assets/audit-identity.js'),C=require('../assets/trading-calendar.js'),Binding=require('./forward-source-binding.js'),Events=require('./forward-pair-source.js');
const ASSESSMENT='D:/techno/validation/strategy-research/forward-manager-paired-20261102-a/event-status.json',clone=x=>JSON.parse(JSON.stringify(x));
function packetFromValidatedFeed(input,eventAssessment,now=Date.now()){
 const b=Binding.approved(),actual=Date.now(),at=typeof now==='number'?now:Date.parse(now),observed=Date.parse(input?.now??input?.at),p=input?.provenance;
 if(!Number.isFinite(at)||at>actual||actual-at>90000||!C.isTradingTime(at)||!Number.isFinite(observed)||observed>at||at-observed>90000||!p||p.accountId!==b.feedId||p.sourceManifestHash!==b.feedManifestHash||!Number.isSafeInteger(p.sequence)||p.sequence<1||!/^[a-f0-9]{64}$/.test(p.committedTickHash||'')||p.quotesHash!==A.hash(input.quotes)||p.preparedHistoriesHash!==A.hash(input.histories))throw Error('Independent feed not fresh or bound to committed evidence');
 Events.assertEventAssessment(eventAssessment,at);
 const packet={now:new Date(observed).toISOString(),universe:clone(input.universe),histories:clone(input.histories),quotes:clone(input.quotes),corporateActionStatus:eventAssessment.status,corporateEvents:[],eventAssessmentHash:A.hash(eventAssessment),eventEvidenceHashes:[...eventAssessment.evidenceHashes],provenance:{...clone(p),sourceBindingHash:b.amendmentSha256}};packet.packetHash=A.hash(packet);return packet;
}
function capture(now=Date.now()){
 try{const b=Binding.approved(),at=typeof now==='number'?now:Date.parse(now),stat=fs.lstatSync(ASSESSMENT);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>65536)throw Error('Unsafe event assessment');const bytes=fs.readFileSync(ASSESSMENT);if(bytes.length>65536)throw Error('Event assessment grew beyond bound');const assessment=JSON.parse(bytes),source=require('./independent-market-feed.js').readCommitted(at);if(!source.available)throw Error(source.reason||'Independent feed unavailable');if(source.feedId!==undefined&&source.feedId!==b.feedId||source.manifestHash!==undefined&&source.manifestHash!==b.feedManifestHash)throw Error('Independent feed root identity mismatch');return {available:true,packet:packetFromValidatedFeed(source.input,assessment,at),sourceBindingHash:b.amendmentSha256,originalAccountUnchanged:true};
 }catch(error){return {available:false,reason:error.message,packet:null,originalAccountUnchanged:true};}
}
module.exports={capture,packetFromValidatedFeed};
