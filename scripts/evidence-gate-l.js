'use strict';
// Point-in-time document admission. It does NOT verify a publisher's truth or let a document set its own trust.
const crypto=require('node:crypto');
const hashText=s=>crypto.createHash('sha256').update(s,'utf8').digest('hex');
function time(s){
 if(typeof s!=='string')return NaN;
 const m=s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|([+-])(\d{2}):(\d{2}))$/);
 if(!m)return NaN;
 const [year,month,day,hour,minute,second]=m.slice(1,7).map(Number);
 const offHour=Number(m[9]||0),offMinute=Number(m[10]||0);
 if(year<1900||month<1||month>12||day<1||day>new Date(Date.UTC(year,month,0)).getUTCDate()||hour>23||minute>59||second>59||offHour>14||offMinute>59||offHour===14&&offMinute!==0)return NaN;
 const t=Date.parse(s);return Number.isFinite(t)?t:NaN;
}
function webUrl(s){try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password?u:null;}catch{return null;}}
const suspicious=/(ignore\s+(?:all\s+)?(?:previous|prior|system)\s+instructions|reveal.{0,30}(?:api.?key|system.?prompt)|忽略.{0,10}(?:指令|规则)|泄露.{0,10}(?:密钥|提示词)|execute\s+(?:shell|command)|调用.{0,10}下单接口)/i;
function gateDocument(doc,options={}){
 const fail=(reason)=>({accepted:false,reason,id:doc?.id||null,usedInPrediction:false});
 const decision=time(options.decisionAt),observed=time(options.observedAt||options.decisionAt);
 if(!Number.isFinite(decision)||!Number.isFinite(observed)||decision>observed)return fail('invalid_decision_or_observation_time');
 if(!doc||typeof doc!=='object'||!['news','filing','fundamental','corporate_action'].includes(doc.kind)||typeof doc.id!=='string'||!doc.id||typeof doc.text!=='string'||doc.text.length<1||doc.text.length>100000)return fail('invalid_document_schema');
 if(doc.title!==undefined&&(typeof doc.title!=='string'||doc.title.length>2000))return fail('invalid_document_title');
 const url=webUrl(doc.url);if(!url)return fail('invalid_source_url');
 // Host trust is supplied by trusted application configuration, never by a document or LLM response.
 if(!Array.isArray(options.trustedHosts)||!options.trustedHosts.includes(url.hostname))return fail('untrusted_source_host');
 if(!Array.isArray(doc.symbols)||!doc.symbols.length||doc.symbols.some(s=>typeof s!=='string')||!doc.symbols.some(s=>(options.symbols||[]).includes(s)))return fail('no_matching_instrument');
 const published=time(doc.publishedAt),firstSeen=time(doc.firstSeenAt);
 if(!Number.isFinite(published)||!Number.isFinite(firstSeen)||doc.timePrecision!=='second')return fail('missing_precise_published_or_first_seen_time');
 if(firstSeen<published||firstSeen>observed)return fail('inconsistent_first_seen_time');
 const contentHash=hashText(doc.text);if(doc.contentSha256!==contentHash)return fail('document_content_hash_mismatch');
 if(suspicious.test(doc.text)||typeof doc.title==='string'&&suspicious.test(doc.title))return fail('instruction_like_untrusted_text_quarantined');
 let available=Math.max(published,firstSeen),availabilityBasis='observed_snapshot';
 const archive=(options.trustedArchives||[]).find(a=>a.contentSha256===contentHash&&a.sourceUrl===doc.url);
 if(archive){
  const archived=time(archive.availableAt);
  if(!Number.isFinite(archived)||archived<published||!webUrl(archive.proofUrl)||typeof archive.verifiedBy!=='string'||!archive.verifiedBy)return fail('invalid_trusted_archive_record');
  available=archived;availabilityBasis='externally_verified_archive_supplied_by_operator';
 }
 if(published>decision||available>decision)return fail('not_available_at_decision');
 const maxAgeDays=options.maxAgeDays===undefined?30:options.maxAgeDays;
 if(!Number.isFinite(maxAgeDays)||maxAgeDays<=0)return fail('invalid_age_policy');
 if((decision-published)/86400000>maxAgeDays)return fail('stale_document');
 return {accepted:true,id:doc.id,kind:doc.kind,url:doc.url,title:'',unverifiedTitle:typeof doc.title==='string'?doc.title:'',titleEvidenceVerified:false,
  symbols:doc.symbols.filter(s=>options.symbols.includes(s)),text:doc.text,contentSha256:contentHash,
  publishedAt:doc.publishedAt,firstSeenAt:doc.firstSeenAt,availableAt:new Date(available).toISOString(),availabilityBasis,
  usedInPrediction:false,sourceTruthVerified:false,sourceAttributionOnly:true};
}
function admitDocuments(documents,options){
 if(!Array.isArray(documents)||documents.length>1000)throw Error('Bounded documents array required');
 const seen=new Map(),seenIds=new Set(),accepted=[],rejected=[];
 for(const doc of documents){const out=gateDocument(doc,options);if(!out.accepted){rejected.push(out);continue;}
  if(seenIds.has(out.id)){rejected.push({accepted:false,id:out.id,reason:'duplicate_evidence_id',usedInPrediction:false});continue;}
  const covered=seen.get(out.contentSha256)||new Set();
  const newSymbols=[...new Set(out.symbols)].filter(symbol=>!covered.has(symbol));
  if(!newSymbols.length){rejected.push({accepted:false,id:out.id,reason:'duplicate_content',usedInPrediction:false});continue;}
  out.symbols=newSymbols;for(const symbol of newSymbols)covered.add(symbol);
  seen.set(out.contentSha256,covered);seenIds.add(out.id);accepted.push(out);
 }
 return {accepted,rejected,acceptedCount:accepted.length,uniqueContentCount:seen.size,rejectedCount:rejected.length,usedInPrediction:false};
}
function validateClaims(claims,admission){
 const valid=[],rejected=[];if(!Array.isArray(claims)||claims.length>100)throw Error('Bounded structured claims required');
 const allowed=new Set(['role','evidenceId','quote','interpretation','symbol','modelId']);
 for(const claim of claims){
  const bad=reason=>rejected.push({reason,claim});
  if(!claim||Object.keys(claim).some(k=>!allowed.has(k))||!['news','fundamental','bull','bear'].includes(claim.role)){bad('invalid_role_or_unexpected_action_fields');continue;}
  const e=admission.accepted.find(e=>e.id===claim.evidenceId);
  if(!e||!e.symbols.includes(claim.symbol)){bad('uncited_or_wrong_symbol');continue;}
  if(typeof claim.quote!=='string'||claim.quote.length<4||claim.quote.length>1000||!e.text.includes(claim.quote)){bad('quote_not_in_source');continue;}
  if(typeof claim.interpretation!=='string'||claim.interpretation.length>3000||suspicious.test(claim.interpretation)){bad('unsafe_or_invalid_interpretation');continue;}
  valid.push({...claim,sourceUrl:e.url,sourceHash:e.contentSha256,semanticEntailmentVerified:false,usedInPrediction:false,tradeAuthority:false});
 }
 return {valid,rejected,note:'Literal citation checking is not semantic truth verification. Claims cannot alter shares or trigger trades.'};
}
// Historical stock-pool metadata gate. No actual all-A-share pool is fabricated by this module.
function historicalUniverse(records,decisionAt){
 const t=time(decisionAt);if(!Number.isFinite(t)||!Array.isArray(records))throw Error('Invalid universe query');
 for(const r of records){if(!r||typeof r.symbol!=='string'||!r.symbol||!Number.isFinite(time(r.knownAt))||!Number.isFinite(time(r.validFrom))||(r.validTo&&(!Number.isFinite(time(r.validTo))||time(r.validTo)<=time(r.validFrom))))throw Error('Malformed historical membership');}
 const rows=records.filter(r=>r&&typeof r.symbol==='string'&&Number.isFinite(time(r.knownAt))&&time(r.knownAt)<=t&&Number.isFinite(time(r.validFrom))&&time(r.validFrom)<=t&&(!r.validTo||Number.isFinite(time(r.validTo))&&t<time(r.validTo)));
 const symbols=rows.map(r=>r.symbol);if(new Set(symbols).size!==symbols.length)throw Error('Overlapping as-of universe memberships');
 return rows.map(r=>({...r,provenanceValidated:false}));
}
module.exports={time,hashText,gateDocument,admitDocuments,validateClaims,historicalUniverse};
