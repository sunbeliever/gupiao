'use strict';
// The production watch has fixed inputs. Dependency injection below is for the small orchestration kernel only.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const STUDY='D:/techno/validation/strategy-research/forward-manager-paired-20261102-a';
const SHA='f264ee8a14164a6d9ad3e768e9fd90535d398cf1b6875e5a38bb783657b0917d';
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
function createPump({protocol,capture,advance,journalFactory,checkAccount,initialState=null}){
 let state=initialState,journal=null,token=null,busy=false;
 function tick(){if(busy)throw Error('Concurrent consumer tick rejected');busy=true;try{
  const source=capture();if(!source.available)return {status:'waiting_source',reason:source.reason,accountStarted:!!state};
  const result=advance(state,source.packet,protocol);if(result.status!=='advanced')return {status:result.status,accountStarted:!!state};
  for(const candidate of protocol.candidates)checkAccount(result.state.candidates[candidate.key].session,source.packet.quotes);
  if(!journal){journal=journalFactory();token=journal.acquire();const audited=journal.audit();if(audited.stateHash!==(state?.integrityHash??null))throw Error('Consumer checkpoint changed before lease');}
  const committed=journal.append(token,{packet:source.packet,result});if(!['committed','duplicate'].includes(committed.status))throw Error('Journal failed to commit result');
  state=result.state;return {status:committed.status,accountStarted:true,observedAt:state.observedAt,stateHash:state.integrityHash,decisionApplied:result.event.decisionApplied===true};
 }finally{busy=false;}}
 function close(){if(journal&&token){journal.release(token);token=null;}}
 return {tick,close,state:()=>state};
}
function readSafe(file,max=1024*1024){const st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||st.size>max)throw Error('Unsafe consumer file');const b=fs.readFileSync(file);if(b.length>max)throw Error('Consumer file grew beyond bound');return b;}
function verifyRelease(root){
 const manifestBytes=readSafe(path.join(root,'source-manifest.json')),manifest=JSON.parse(manifestBytes),activation=JSON.parse(readSafe(path.join(root,'activation.json')));
 if(activation.schema!==1||activation.studyId!=='forward-manager-paired-20261102-a'||activation.protocolHash!==SHA||activation.sourceManifestSha256!==digest(manifestBytes)||activation.status!=='approved_simulation_only'||activation.realOrdersAllowed!==false||activation.automaticPromotion!==false||!Array.isArray(activation.reviewEvidenceHashes)||!activation.reviewEvidenceHashes.length||activation.reviewEvidenceHashes.some(x=>!/^[a-f0-9]{64}$/.test(x)))throw Error('Consumer activation not approved for frozen source');
 if(manifest.schema!==1||manifest.protocolHash!==SHA||!manifest.sourceHashes||typeof manifest.sourceHashes!=='object'||Array.isArray(manifest.sourceHashes))throw Error('Invalid consumer source manifest');
 for(const required of ['scripts/forward-pair-consumer.js','scripts/forward-manager-pair.js','scripts/forward-pair-source.js','scripts/forward-pair-journal.js','scripts/forward-accounting-audit.js','scripts/forward-event-publisher.js','scripts/forward-pair-bootstrap.js','assets/trading-calendar.js'])if(!manifest.sourceHashes[required])throw Error('Required consumer source missing from freeze');
 for(const [name,hash]of Object.entries(manifest.sourceHashes)){if(!/^(?:assets|scripts|evidence)\/[a-zA-Z0-9_./-]+$/.test(name)||name.split('/').some(p=>p==='..'||p==='.')||!/^[a-f0-9]{64}$/.test(hash)||digest(readSafe(path.join(root,name),16*1024*1024))!==hash)throw Error('Consumer frozen source mismatch: '+name);}
 if(!/^[a-f0-9]{64}$/.test(activation.baselineReviewSha256||'')||digest(readSafe(path.join(root,'baseline-review.json')))!==activation.baselineReviewSha256)throw Error('Consumer approved baseline changed');
 for(const name of Object.keys(manifest.sourceHashes).filter(n=>n.endsWith('.js'))){const source=readSafe(path.join(root,name),16*1024*1024).toString('utf8');for(const match of source.matchAll(/require\(\s*['"](\.[^'"]+)['"]\s*\)/g)){let dependency=path.posix.normalize(path.posix.join(path.posix.dirname(name),match[1]));if(!path.posix.extname(dependency))dependency+='.js';if(!manifest.sourceHashes[dependency])throw Error('Consumer runtime dependency absent from freeze: '+dependency);}}
 const protocol=JSON.parse(readSafe(path.join(STUDY,'protocol.json')));if(digest(JSON.stringify(protocol))!==SHA)throw Error('Registered forward protocol changed');return {protocol,activation,sourceManifestSha256:digest(manifestBytes)};
}
function writeStatus(value){const target=path.join(STUDY,'consumer-status.json'),temp=target+'.'+process.pid+'.tmp';const b=JSON.stringify({schema:1,studyId:'forward-manager-paired-20261102-a',at:new Date().toISOString(),...value,realOrdersAllowed:false,investmentReady:false});if(Buffer.byteLength(b)>32768)throw Error('Consumer status overflow');fs.writeFileSync(temp,b,{flag:'wx'});fs.renameSync(temp,target);}
async function watch(until){
 const root=path.resolve(__dirname,'..'),{protocol,activation,sourceManifestSha256}=verifyRelease(root),C=require('../assets/trading-calendar.js');
 const end=Date.parse(until),now=Date.now(),day=C.sessionOf(now),endDay=C.sessionOf(end);if(!protocol.knownSessions.includes(day)||endDay!==day||!Number.isFinite(end)||end<=now||end>Date.parse(day+'T07:10:00Z'))throw Error('Watch requires registered same-day end no later than 15:10 China');
 const guard=path.join(STUDY,'consumer.lock'),owner={pid:process.pid,nonce:crypto.randomUUID(),startedAt:new Date().toISOString(),sourceManifestSha256};
 const fd=fs.openSync(guard,'wx');try{fs.writeFileSync(fd,JSON.stringify(owner));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 let pump=null,stopping=false,failure=null,lastEventRefresh=0;const stop=()=>{stopping=true;};process.on('SIGTERM',stop);process.on('SIGINT',stop);
 try{
  const EventPublisher=require('./forward-event-publisher.js'),Source=require('./forward-pair-source.js'),F=require('./forward-manager-pair.js'),J=require('./forward-pair-journal.js'),Accounting=require('./forward-accounting-audit.js'),ledger=path.join(STUDY,'journal');
  let initialState=null;if(fs.existsSync(path.join(ledger,'claim.json'))){const checked=J.createJournal(ledger).audit();initialState=checked.checkpoint?.state??null;}
  pump=createPump({protocol,capture:()=>Source.capture(),advance:F.advance,journalFactory:()=>J.createJournal(ledger),checkAccount:Accounting.auditSession,initialState});
  while(!stopping&&Date.now()<end){
   const current=JSON.parse(readSafe(guard));if(current.pid!==owner.pid||current.nonce!==owner.nonce)throw Error('Consumer owner lock changed');
   if(Date.now()-lastEventRefresh>=900000){const refreshed=await EventPublisher.refresh({baselineFile:path.join(root,'baseline-review.json'),expectedReviewSha256:activation.baselineReviewSha256,out:path.join(STUDY,'surveillance-evidence')});EventPublisher.publish(path.join(STUDY,'event-status.json'),refreshed.assessment);lastEventRefresh=Date.now();}
   if(os.freemem()/1048576<protocol.resources.minimumFreeMB)writeStatus({status:'paused_resources',accountStarted:!!pump.state(),sourceManifestSha256});
   else{const result=pump.tick();writeStatus({...result,sourceManifestSha256});}
   await new Promise(resolve=>setTimeout(resolve,Math.min(protocol.observation.pollMs,Math.max(0,end-Date.now()))));
  }
 }catch(error){failure=error;writeStatus({status:'failed_closed',reason:error.message,accountStarted:!!pump?.state(),sourceManifestSha256});}
 finally{try{pump?.close();}catch(error){failure=failure||error;writeStatus({status:'failed_closed',reason:error.message,accountStarted:!!pump?.state(),sourceManifestSha256});}const current=JSON.parse(readSafe(guard));if(current.pid!==owner.pid||current.nonce!==owner.nonce)throw Error('Consumer owner lock changed during close');fs.unlinkSync(guard);process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);}
 if(failure)throw failure;writeStatus({status:'stopped_at_registered_end',accountStarted:!!pump?.state(),sourceManifestSha256});
}
module.exports={createPump,verifyRelease,watch};
if(require.main===module){if(process.argv[2]!=='--watch'||process.argv.length!==4)throw Error('Use --watch with same-day ISO end');watch(process.argv[3]).catch(error=>{console.error(error.message);process.exitCode=1;});}
