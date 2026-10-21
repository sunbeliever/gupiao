'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const Driver=require('../scripts/paired-forward-monitor.js'),Core=require('../scripts/paired-forward-core.js'),Audit=require('../assets/audit-identity.js'),Market=require('../assets/market.js'),Calendar=require('../assets/trading-calendar.js'),Fee=require('../assets/fee-profile.js');
const root=path.resolve(__dirname,'..'),model=require('./fixtures/lowcap-frozen-model.json'),universe=Market.UNIVERSE.filter(u=>u.type==='etf');
function fixture(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'paired-driver-')),source=path.join(dir,'source');for(const name of Driver.SOURCE_FILES){const dst=path.join(source,name);fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(path.join(root,name),dst);}
 const nativeSources=path.join(dir,'native-sources');fs.mkdirSync(nativeSources);for(const n of ['DesktopServices.cs','MarketTransport.cs'])fs.writeFileSync(path.join(nativeSources,n),'// synthetic non-executed native fixture '+n);const helper=path.join(dir,'helper.exe');fs.writeFileSync(helper,'synthetic helper bytes; never executed');
 const sourceHashes=Driver.sourceHashes(source),descriptor={kind:'dotnet-desktop-http-v1',exeSha256:Driver.fileHash(helper),sourceHashes:Object.fromEntries(['DesktopServices.cs','MarketTransport.cs'].map(n=>[n,Driver.fileHash(path.join(nativeSources,n))]))};
 const artifact={candidate:{id:'net1-risk12_5'},summary:{researchIdentity:{model_hash:Audit.hash(model)}},initialSession:{universe,corporateEvents:[]},events:[{input:{context:{model}}}]},modelArtifact=path.join(dir,'model-artifact.json');fs.writeFileSync(modelArtifact,JSON.stringify(artifact));
 const now='2026-10-21T01:30:00Z',proof={at:now,responseReceivedAt:now,quotes:Object.fromEntries(universe.map(u=>[u.symbol,{price:1,open:1,sourceTime:'2026-10-21 09:30:00',receivedAt:now}])),historyStatuses:universe.map(u=>({symbol:u.symbol,ok:true,expectedAsOf:'2026-10-20',dataAsOf:'2026-10-20'})),histories:{}};
 for(const u of universe){proof.histories[u.symbol]=[];for(let d='2026-07-01';d<='2026-10-20';d=Calendar.nextSession(d))proof.histories[u.symbol].push({date:d,open:1,close:1,high:1.01,low:.99,volume:1000});}
 const gate={schema:'paired-forward-release-gate-v1',sourceHashes,tests:{passed:true,failed:0,count:245,sourceHashes},nativeTransport:descriptor,proof,proofHash:Audit.hash(proof),nativeServicesSourceSha256:descriptor.sourceHashes['DesktopServices.cs']},gateFile=path.join(dir,'gate.json');fs.writeFileSync(gateFile,JSON.stringify(gate));
 return {dir,root:source,stableRoot:path.join(dir,'stable'),id:'fixture-paired-driver',entryAfter:'2026-10-21T01:31:00Z',latestEntry:'2026-10-21T01:35:00Z',now,helper,nativeSources,modelArtifact,gateFile,gate,proof};
}
function saveGate(f){fs.writeFileSync(f.gateFile,JSON.stringify(f.gate));}
test('preparation authenticates the saved model and rejects past windows or incomplete native proof',()=>{
 const f=fixture();assert.throws(()=>Driver.prepare({...f,entryAfter:f.now}),/future/);f.gate.proof.quotes.sh588000.cached=true;f.gate.proofHash=Audit.hash(f.gate.proof);saveGate(f);assert.throws(()=>Driver.prepare(f),/native|quote|input/i);assert.equal(fs.existsSync(f.stableRoot),false);
 const x=JSON.parse(fs.readFileSync(f.modelArtifact));x.events[0].input.context.model.intercept=1;fs.writeFileSync(f.modelArtifact,JSON.stringify(x));assert.throws(()=>Driver.prepare(f),/model/i);
});
test('source test helper and proof hashes cannot drift between validation and declaration',()=>{
 for(const target of ['source','test','helper','proof']){const f=fixture();if(target==='source')fs.appendFileSync(path.join(f.root,'scripts/paired-forward-core.js'),'// changed');if(target==='test')f.gate.tests.failed=1;if(target==='helper')fs.appendFileSync(f.helper,'changed');if(target==='proof')f.gate.proof.quotes.sh588000.price=2;saveGate(f);assert.throws(()=>Driver.prepare(f),/hash|source|test|helper|proof/i);}
});
test('closed-session or stale proof is rejected even when quotes claim they are fresh',()=>{
 const f=fixture();f.gate.proof.at='2026-10-21T00:50:00Z';f.gate.proof.responseReceivedAt=f.gate.proof.at;f.gate.proofHash=Audit.hash(f.gate.proof);saveGate(f);assert.throws(()=>Driver.prepare(f),/native|trading|proof/i);
 const g=fixture();assert.throws(()=>Driver.prepare({...g,now:'2026-10-21T01:34:00Z',entryAfter:'2026-10-21T01:35:00Z',latestEntry:'2026-10-21T01:36:00Z'}),/proof|stale/i);
});
test('complete preparation freezes actual bytes in a stable directory and rejects reuse and tampering',()=>{
 const f=fixture(),p=Driver.prepare(f);assert.equal(p.manifest.protocol.sourceModelHash,Driver.MODEL_HASH);assert.equal(fs.existsSync(path.join(p.directory,'experiment.claim')),false);assert.ok(Driver.validateFrozen(p.directory));assert.throws(()=>Driver.prepare(f),/exist/i);
 fs.appendFileSync(path.join(p.directory,'source/scripts/paired-forward-core.js'),'// modified');assert.throws(()=>Driver.validateFrozen(p.directory),/hash/i);
});
test('collector fetches shared quotes once and six histories once, preserving source and receipt times',async()=>{
 let histories=0,quotes=0;const clock={at:Date.parse('2026-10-21T01:30:00Z')};const r={Calendar,Market:{history:async s=>{histories++;return [{date:'2026-10-20',close:1}];},historyStatus:s=>({symbol:s,ok:true,dataAsOf:'2026-10-20',expectedAsOf:'2026-10-20'}),quotes:async()=>{quotes++;return Object.fromEntries(universe.map(u=>[u.symbol,{price:1,sourceTime:'2026-10-21 09:30:00',receivedAt:'2026-10-21T01:30:00Z'}]));}}};
 const collect=Driver.createCollector(r,universe,{now:()=>clock.at});const a=await collect();clock.at+=30000;const b=await collect();assert.equal(histories,6);assert.equal(quotes,2);assert.equal(b.quotes.sh588000.receivedAt,a.quotes.sh588000.receivedAt);assert.equal(b.histories.sh588000.at(-1).date,'2026-10-20');assert.deepEqual(Object.keys(a.quotes).sort(),universe.map(u=>u.symbol).sort());
});
test('collector records a transport error and does not replace cached quote flags or fake timestamps',async()=>{
 const runtime={Calendar,Market:{history:async()=>{throw Error('offline');},historyStatus:s=>({symbol:s,ok:false}),quotes:async()=>({sh588000:{price:1,cached:true,error:'offline',sourceTime:'2026-10-20 15:00:00',receivedAt:'2026-10-20T07:00:00Z'}})}};
 const sample=await Driver.createCollector(runtime,universe,{now:()=>Date.parse('2026-10-21T01:30:00Z')})();assert.ok(sample.error.includes('offline'));assert.equal(sample.quotes.sh588000.cached,true);assert.equal(sample.quotes.sh588000.receivedAt,'2026-10-20T07:00:00Z');assert.equal(sample.histories.sh588000,undefined);
});
test('a bounded runner uses the frozen engine and recovery, rejects duplicate claims and keeps a valid common start',async()=>{
 const f=fixture(),p=Driver.prepare(f);let n=0;const clock={at:Date.parse('2026-10-21T01:31:00Z')};const input=structuredClone(f.proof);input.at='2026-10-21T01:31:00Z';input.responseReceivedAt=input.at;for(const q of Object.values(input.quotes)){q.sourceTime='2026-10-21 09:31:00';q.receivedAt=input.at;}
 const result=await Driver.run({directory:p.directory,until:'2026-10-21T01:32:00Z'},{now:()=>clock.at,collect:async()=>{n++;clock.at+=1000;return input;},sleep:async()=>{clock.at=Date.parse('2026-10-21T01:32:00Z');}});assert.equal(n,1);assert.equal(result.sequence,1);assert.equal(result.startedAt,input.at);assert.equal(result.accountIds.length,2);assert.throws(()=>Core.claim(p.directory,p.manifest.protocol),/exist/i);
 await assert.rejects(Driver.run({directory:p.directory,until:'2026-10-21T01:33:00Z'},{now:()=>clock.at}),/resume/);
});
test('a response completing after the run bound is retained without creating an account or a backfilled tick',async()=>{
 const f=fixture(),p=Driver.prepare(f),clock={at:Date.parse('2026-10-21T01:31:00Z')};const result=await Driver.run({directory:p.directory,until:'2026-10-21T01:32:00Z'},{now:()=>clock.at,collect:async()=>{clock.at+=120000;return f.proof;},sleep:async()=>{}});assert.equal(result.sequence,0);assert.equal(result.startedAt,null);assert.equal(fs.existsSync(path.join(p.directory,'ticks.jsonl')),false);assert.ok(fs.readdirSync(p.directory).some(n=>n.startsWith('unused-response-')));
});
test('resume reconstructs the same paired accounts from frozen ticks rather than creating new capital',async()=>{
 const f=fixture(),p=Driver.prepare(f),clock={at:Date.parse('2026-10-21T01:31:00Z')};
 const sample=at=>{const input=structuredClone(f.proof);input.at=at;input.responseReceivedAt=at;for(const q of Object.values(input.quotes)){q.sourceTime=new Date(Date.parse(at)+28800000).toISOString().slice(0,19).replace('T',' ');q.receivedAt=at;}return input;};
 const first=await Driver.run({directory:p.directory,until:'2026-10-21T01:32:00Z'},{now:()=>clock.at,collect:async()=>sample('2026-10-21T01:31:00Z'),sleep:async()=>{clock.at=Date.parse('2026-10-21T01:32:00Z');}});
 const second=await Driver.run({directory:p.directory,resume:true,until:'2026-10-21T01:33:00Z'},{now:()=>clock.at,collect:async()=>sample('2026-10-21T01:32:00Z'),sleep:async()=>{clock.at=Date.parse('2026-10-21T01:33:00Z');}});
 assert.equal(second.sequence,2);assert.equal(second.startedAt,first.startedAt);assert.deepEqual(second.accountIds,first.accountIds);assert.equal(fs.existsSync(path.join(p.directory,'monitor.lease')),false);const manifestFile=path.join(p.directory,'manifest.json'),altered=JSON.parse(fs.readFileSync(manifestFile));altered.notes.push('metadata changed after initial claim');fs.writeFileSync(manifestFile,JSON.stringify(altered));await assert.rejects(Driver.run({directory:p.directory,resume:true,until:'2026-10-21T01:34:00Z'},{now:()=>clock.at}),/claim hash/);
});
test('frozen collection intervals and helper provenance cannot be changed after declaration',()=>{
 for(const key of ['intervalMs','historyRefreshMs','nativeTransport']){const f=fixture(),p=Driver.prepare(f),file=path.join(p.directory,'manifest.json'),m=JSON.parse(fs.readFileSync(file));if(key==='nativeTransport'){fs.appendFileSync(path.join(p.directory,'market-transport.exe'),'replacement');m.nativeTransport.exeSha256=Driver.fileHash(path.join(p.directory,'market-transport.exe'));}else m[key]=1;fs.writeFileSync(file,JSON.stringify(m));assert.throws(()=>Driver.validateFrozen(p.directory),/interval|frozen|gate|provenance|manifest/i);}
});
test('raw network response references require the preserved matching bytes',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'paired-raw-'));fs.mkdirSync(path.join(dir,'responses'));const file='1700000000000-aabbccddeeff.json',location=path.join(dir,'responses',file);fs.writeFileSync(location,'{"actual":"native response"}');const input={responses:[{file,sha256:Driver.fileHash(location)}]};assert.doesNotThrow(()=>Driver.verifyResponses(dir,input));fs.writeFileSync(location,'{}');assert.throws(()=>Driver.verifyResponses(dir,input),/response|hash/i);assert.throws(()=>Driver.verifyResponses(dir,{responses:[{file:'../elsewhere',sha256:'x'}]}),/response|path/i);
});
