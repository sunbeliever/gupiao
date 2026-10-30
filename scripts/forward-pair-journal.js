'use strict';
// Persistence only: never invokes the live forward engine or changes its clock.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const A=require('../assets/audit-identity.js');
const PROTOCOL_HASH='f264ee8a14164a6d9ad3e768e9fd90535d398cf1b6875e5a38bb783657b0917d';
const ID='forward-manager-paired-20261102-a';
const copy=x=>JSON.parse(A.canonical(x));
function stateHash(s){if(!s||typeof s!=='object'||Array.isArray(s))throw Error('real state required');if(s.id!==ID||s.protocolHash!==PROTOCOL_HASH)throw Error('state identity mismatch');const c=copy(s);delete c.integrityHash;const h=A.hash(c);if(h!==s.integrityHash)throw Error('state integrity mismatch');return h;}
function createJournal(directory,{failpoint=()=>{}}={}){
 const root=path.resolve(directory),file=n=>path.join(root,n),read=n=>JSON.parse(fs.readFileSync(file(n),'utf8'));
 const exists=n=>fs.existsSync(file(n));
 function sealed(v){return {...v,journalHash:A.hash(v)};}
 function verify(v){const c=copy(v);delete c.journalHash;if(A.hash(c)!==v.journalHash)throw Error('journal digest mismatch');return v;}
 function durable(n,v){const fd=fs.openSync(file(n),'wx');try{fs.writeFileSync(fd,A.canonical(v)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
 function immutable(n,v){if(exists(n)){if(A.canonical(read(n))!==A.canonical(v))throw Error('immutable conflict: '+n);return;}durable(n,v);}
 function checkClaim(){const c=verify(read('claim.json'));if(c.id!==ID||c.protocolHash!==PROTOCOL_HASH)throw Error('study claim mismatch');return c;}
 function owner(token){checkClaim();if(!token||token.pid!==process.pid||!exists('writer.lock'))throw Error('writer owner mismatch');const lock=read('writer.lock');if(lock.pid!==process.pid||lock.nonce!==token.nonce)throw Error('writer owner mismatch');}
 function acquire(){fs.mkdirSync(root,{recursive:true});for(const d of ['events','packets','histories'])fs.mkdirSync(file(d),{recursive:true});
  // An existing lock is never stolen, including when its process is dead.
  if(exists('writer.lock'))throw Error('blocked: existing writer lock requires explicit owner review');
  if(!exists('claim.json')){if(fs.readdirSync(root).some(n=>!['events','packets','histories'].includes(n))||['events','packets','histories'].some(d=>fs.readdirSync(file(d)).length))throw Error('blocked: missing permanent claim');immutable('claim.json',sealed({schema:1,id:ID,protocolHash:PROTOCOL_HASH,nonce:crypto.randomUUID()}));}
  checkClaim();const token={nonce:crypto.randomUUID(),pid:process.pid};try{durable('writer.lock',token);}catch(e){if(e.code==='EEXIST')throw Error('blocked: writer already exists');throw e;}return copy(token);
 }
 function release(token){owner(token);if(exists('pending.json'))throw Error('pending transaction requires recovery');fs.unlinkSync(file('writer.lock'));}
 function packetValue(ref){if(!/^[a-f0-9]{64}$/.test(ref))throw Error('invalid packet reference');const p=verify(read('packets/'+ref+'.json'));if(!/^[a-f0-9]{64}$/.test(p.historiesRef))throw Error('invalid histories reference');const histories=read('histories/'+p.historiesRef+'.json');if(A.hash(histories)!==p.historiesRef)throw Error('histories digest mismatch');const full={...p.packet,histories};const h=full.packetHash;delete full.packetHash;if(A.hash(full)!==h||h!==ref)throw Error('packet digest mismatch');return {...full,packetHash:h};}
 function audit(){checkClaim();let prev=null,eventHash=null,count=0,sequence=0;const names=fs.readdirSync(file('events')).sort();
  for(const n of names){if(!/^\d{12}\.json$/.test(n)||Number(n.slice(0,12))!==count+1)throw Error('event chain gap');const e=verify(read('events/'+n));const p=packetValue(e.packetRef);if(e.index!==count+1||e.previousEventHash!==eventHash||e.event.previousStateHash!==prev||e.event.packetHash!==p.packetHash||e.event.sourceSequence!==p.provenance.sequence||!Number.isSafeInteger(e.event.sourceSequence)||e.event.sourceSequence<=sequence)throw Error('event chain mismatch');prev=e.event.resultStateHash;eventHash=e.journalHash;sequence=e.event.sourceSequence;count++;}
  const cp=exists('checkpoint.json')?verify(read('checkpoint.json')):null;
  if(cp&&(cp.index>count||stateHash(cp.state)!==cp.stateHash))throw Error('checkpoint integrity mismatch');
  if(cp){const at=verify(read('events/'+String(cp.index).padStart(12,'0')+'.json'));if(at.journalHash!==cp.eventHash||at.event.resultStateHash!==cp.stateHash)throw Error('checkpoint event mismatch');}
  if((!cp&&count)||cp&&cp.index!==count){if(!exists('pending.json'))throw Error('checkpoint behind without prepared transaction');}
  return {events:count,eventHash,stateHash:prev,sequence,checkpoint:cp,paperReplay:false,accountingReplay:false};
 }
 function checkpoint(token,p){owner(token);if(stateHash(p.nextState)!==p.entry.event.resultStateHash)throw Error('checkpoint state mismatch');const next=sealed({schema:1,index:p.entry.index,eventHash:p.entry.journalHash,stateHash:p.entry.event.resultStateHash,state:p.nextState});
  if(exists('checkpoint.json')&&A.canonical(read('checkpoint.json'))===A.canonical(next))return;
  const temp='checkpoint.tmp-'+crypto.randomUUID()+'.json';durable(temp,next);failpoint('before_checkpoint_rename');owner(token);fs.renameSync(file(temp),file('checkpoint.json'));failpoint('checkpoint');
 }
 function validatePending(p){verify(p);if(p.claimHash!==checkClaim().journalHash)throw Error('pending claim mismatch');verify(p.entry);if(stateHash(p.nextState)!==p.entry.event.resultStateHash||p.packetRef!==p.entry.packetRef)throw Error('pending state mismatch');const packet=packetValue(p.packetRef);if(packet.packetHash!==p.entry.event.packetHash||packet.provenance.sequence!==p.entry.event.sourceSequence)throw Error('pending packet mismatch');}
 function complete(token,p){owner(token);validatePending(p);if(p.owner!==token.nonce)throw Error('pending owner mismatch');const chain=audit(),i=p.entry.index;
  if(chain.events===i-1){if(chain.eventHash!==p.entry.previousEventHash||chain.stateHash!==p.entry.event.previousStateHash||p.entry.event.sourceSequence<=chain.sequence)throw Error('prepared CAS mismatch');}
  else if(chain.events===i){if(chain.eventHash!==p.entry.journalHash||chain.stateHash!==p.entry.event.resultStateHash)throw Error('prepared event conflict');}
  else throw Error('prepared chain position mismatch');
  if(chain.checkpoint&&chain.checkpoint.index!==i-1&&chain.checkpoint.index!==i)throw Error('prepared checkpoint CAS mismatch');
  immutable('events/'+String(i).padStart(12,'0')+'.json',p.entry);failpoint('event');checkpoint(token,p);
  owner(token);if(A.canonical(read('pending.json'))!==A.canonical(p))throw Error('pending changed before cleanup');fs.unlinkSync(file('pending.json'));return {status:'committed',stateHash:p.entry.event.resultStateHash};
 }
 function append(token,input){owner(token);if(exists('pending.json'))throw Error('pending transaction requires recovery');const {packet,result}=copy(input);if(result.status!=='advanced'||!result.event)throw Error('advanced result required');if(!Number.isSafeInteger(packet.provenance?.sequence)||packet.provenance.sequence<=0||!Number.isSafeInteger(result.event.sourceSequence)||result.event.sourceSequence<=0)throw Error('invalid source sequence');const plain=copy(packet);delete plain.packetHash;if(A.hash(plain)!==packet.packetHash||result.event.packetHash!==packet.packetHash)throw Error('packet binding mismatch');if(stateHash(result.state)!==result.event.resultStateHash)throw Error('state result mismatch');const chain=audit();
  if(chain.events){const last=read('events/'+String(chain.events).padStart(12,'0')+'.json');if(last.packetRef===packet.packetHash){if(A.canonical(last.event)!==A.canonical(result.event)||chain.stateHash!==result.state.integrityHash)throw Error('duplicate changed');return {status:'duplicate',stateHash:chain.stateHash};}}
  if(result.event.previousStateHash!==chain.stateHash||packet.provenance.sequence<=chain.sequence||result.event.sourceSequence!==packet.provenance.sequence)throw Error('CAS mismatch');
  const historiesRef=A.hash(packet.histories),compact=copy(packet);delete compact.histories;immutable('histories/'+historiesRef+'.json',packet.histories);immutable('packets/'+packet.packetHash+'.json',sealed({historiesRef,packet:compact}));
  const entry=sealed({schema:1,index:chain.events+1,previousEventHash:chain.eventHash,packetRef:packet.packetHash,event:result.event});
  const pending=sealed({schema:1,owner:token.nonce,claimHash:checkClaim().journalHash,packetRef:packet.packetHash,entry,nextState:result.state});owner(token);durable('pending.json',pending);failpoint('pending');return complete(token,pending);
 }
 function recover(token){try{owner(token);if(!exists('pending.json')){audit();return {status:'nothing_pending',paperReplay:false};}complete(token,read('pending.json'));return {status:'recovered',paperReplay:false};}catch(e){return {status:'manual_review_required',reason:e.message,paperReplay:false};}}
 return {acquire,release,append,recover,audit};
}
module.exports={createJournal};
