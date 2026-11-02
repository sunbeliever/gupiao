'use strict';
// Only root-reviewed, release-pinned bounded knowledge is accepted. This is not all-history absence certification.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),W=require('./forward-event-watch.js');
const STUDY='forward-manager-paired-20261102-a',PROOF_SHA='b1962977245b1254f8a2f37929c5758021c69d3a5ce8129e0e1c6b318ebc8eca',SYMBOLS=W.SYMBOLS;
const digest=b=>crypto.createHash('sha256').update(b).digest('hex'),approved=new WeakMap(),produced=new WeakMap();
const session=at=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date(at));
function loadBaseline(file,expectedReviewSha256,at=new Date().toISOString()){
 if(!/^[a-f0-9]{64}$/.test(expectedReviewSha256||''))throw Error('Externally pinned baseline review digest required');
 const bytes=fs.readFileSync(file);if(bytes.length>128*1024||digest(bytes)!==expectedReviewSha256)throw Error('Baseline review digest mismatch');
 const b=JSON.parse(bytes),now=Date.parse(at),reviewed=Date.parse(b.reviewedAt);
 if(b.reviewStatus!=='root_approved_for_release'||b.approvedBy!=='root_independent_mapping_and_effective_date_review'||b.schema!==1||b.studyId!==STUDY||b.version!=='bounded-known-pending-baseline-v1'||b.proofSha256!==PROOF_SHA||!Number.isFinite(now)||!Number.isFinite(reviewed)||reviewed>now||b.publicationScope?.from!=='2026-07-01'||b.publicationScope?.through!=='2026-10-30'||b.acceptKnownPendingClosure!==true||!Array.isArray(b.unresolvedKnownEvents)||b.unresolvedKnownEvents.length||!Array.isArray(b.limitations)||b.limitations.length<2||b.omissionPolicy!=='pause_and_invalidate_affected_results')throw Error('Invalid reviewed baseline declaration');
 if(!Array.isArray(b.reviewedItems)||b.reviewedItems.length<6||b.reviewedItems.length>1000||new Set(b.reviewedItems.map(x=>x.symbol)).size!==6||SYMBOLS.some(s=>!b.reviewedItems.some(x=>x.symbol===s)))throw Error('Reviewed six announcement identities required');
 if(new Set(b.reviewedItems.map(x=>x.symbol+'|'+x.url)).size!==b.reviewedItems.length)throw Error('Duplicate reviewed announcement mapping');
 for(const x of b.reviewedItems)if(!SYMBOLS.includes(x.symbol)||typeof x.title!=='string'||!x.title||!/^\d{4}-\d{2}-\d{2}$/.test(x.date)||!Number.isFinite(Date.parse(x.date+'T00:00:00Z'))||new Date(x.date+'T00:00:00Z').toISOString().slice(0,10)!==x.date||x.date<'2026-10-24'||x.date>session(at)||!/^https:\/\/(www\.sse\.com\.cn|www\.jsfund\.cn)\//.test(x.url)||!/^[a-f0-9]{64}$/.test(x.documentSha256||'')||!['no_future_effective_directive','no_holder_entitlement_change'].includes(x.disposition))throw Error('Invalid reviewed announcement mapping');
 b.reviewSha256=expectedReviewSha256;approved.set(b,digest(Buffer.from(JSON.stringify(b))));return b;
}
function assess(b,coverage,at=new Date().toISOString()){
 const now=Date.parse(at),asOfSession=session(at),failures=[],events=[];
 if(!approved.has(b)||approved.get(b)!==digest(Buffer.from(JSON.stringify(b))))failures.push('Baseline not loaded using externally frozen review digest or changed after load');
 if(!Array.isArray(coverage)||coverage.length!==6||new Set(coverage.map(c=>c.symbol)).size!==6||SYMBOLS.some(s=>!coverage.some(c=>c.symbol===s)))failures.push('Incomplete or duplicate six-source coverage');
 for(const c of coverage||[]){
  if(!c.complete||c.error||c.from!=='2026-10-24'||c.to!==asOfSession||!Array.isArray(c.responses)||!c.responses.length||!Array.isArray(c.items))failures.push(c.symbol+': failed or incomplete directory');
  for(const r of c.responses||[]){const received=Date.parse(r.receivedAt);if(!Number.isFinite(received)||received>now||now-received>1800000||!/^[a-f0-9]{64}$/.test(r.bodyHash||''))failures.push(c.symbol+': stale/future/missing source evidence');}
  for(const item of c.items||[]){if(!b?.reviewedItems?.some(x=>x.symbol===c.symbol&&x.url===item.url&&x.title===item.title&&x.date===item.date)){events.push({...item,status:'unknown',reason:'New or changed announcement requires full body and effective-date review'});}}
 }
 if(events.length)failures.push('Unreviewed announcement text');
 const status=failures.length?'unknown':'no_known_pending_event';
 const result={schema:1,studyId:STUDY,asOfSession,checkedAt:new Date(now).toISOString(),symbols:[...SYMBOLS],status,events,failures,evidenceHashes:[b?.proofSha256,b?.reviewSha256,...(coverage||[]).flatMap(c=>(c.responses||[]).map(r=>r.bodyHash))].filter(x=>/^[a-f0-9]{64}$/.test(x||'')),baselineScope:b?.publicationScope||null,baselineLimitations:b?.limitations||[],omissionPolicy:'pause_and_invalidate_affected_results',meaning:'No known pending holder event within explicitly reviewed evidence and fresh official directories; future absence and exhaustive pre-July coverage are not guaranteed.',investmentReady:false,realOrdersAllowed:false};
 return result;
}
async function refresh({baselineFile,expectedReviewSha256,out}){
 const begun=new Date().toISOString(),date=session(begun),resolved=path.resolve(out);fs.mkdirSync(resolved,{recursive:true});const attempt=fs.mkdtempSync(path.join(resolved,'capture-')),coverage=[];
 let b=null,baselineFailure=null;try{b=loadBaseline(baselineFile,expectedReviewSha256,begun);}catch(e){baselineFailure=e.message;}
 for(const symbol of SYMBOLS){const c=await W.collect(symbol,date,attempt);coverage.push(c);fs.writeFileSync(path.join(attempt,symbol+'-coverage.json'),JSON.stringify(c,null,2));}
 const result=assess(b,coverage,new Date().toISOString());if(baselineFailure)result.failures.push(baselineFailure);produced.set(result,digest(Buffer.from(JSON.stringify(result))));
 fs.writeFileSync(path.join(attempt,'assessment.json'),JSON.stringify(result,null,2));return {attempt,assessment:result};
}
function publish(destination,assessment){
 if(!produced.has(assessment)||produced.get(assessment)!==digest(Buffer.from(JSON.stringify(assessment)))||assessment.schema!==1||assessment.studyId!==STUDY||Date.now()-Date.parse(assessment.checkedAt)>1800000||Date.parse(assessment.checkedAt)>Date.now()||assessment.asOfSession!==session(Date.now()))throw Error('Only a current producer assessment may be published');
 const bytes=Buffer.from(JSON.stringify(assessment));if(bytes.length>64*1024)throw Error('Event assessment exceeds 64KB');fs.mkdirSync(path.dirname(destination),{recursive:true});const temp=destination+'.tmp-'+crypto.randomUUID(),fd=fs.openSync(temp,'wx');try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temp,destination);return {path:destination,sha256:digest(bytes),status:assessment.status};
}
module.exports={STUDY,PROOF_SHA,SYMBOLS,loadBaseline,assess,refresh,publish};
