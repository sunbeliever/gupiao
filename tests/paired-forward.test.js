'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const Pair=require('../scripts/paired-forward-core.js'),Audit=require('../assets/audit-identity.js');
const Paper=require('../assets/paper-engine.js'),Calendar=require('../assets/trading-calendar.js'),Analysis=require('../assets/analysis.js'),Market=require('../assets/market.js');
const runtime={Paper,Calendar,Analysis,Market};
function fixture(){
 const universe=Market.UNIVERSE.filter(u=>u.type==='etf');
 const model={version:'synthetic-pair-not-market-evidence',eligible:true,horizon:20,cutoff:'2024-12-31',intercept:.5,means:Array(11).fill(0),scales:Array(11).fill(1),coefficients:Array(11).fill(0),residualQuantiles:[0,0]};
 const args={id:'synthetic-pair',declaredAt:'2026-10-19T08:00:00Z',entryAfter:'2026-10-20T01:30:00Z',latestEntry:'2026-10-20T01:35:00Z',universe,model,sourceModelHash:Audit.hash(model),corporateEvents:[]};
 const protocol=Pair.defineProtocol(args),histories={};
 for(const u of universe){histories[u.symbol]=[];for(let d='2026-07-01';d<='2026-10-19';d=Calendar.nextSession(d))histories[u.symbol].push({date:d,open:1,close:1,high:1.01,low:.99,volume:1000});}
 const input=(at='2026-10-20T01:30:00Z',price=1)=>({at,responseReceivedAt:at,histories,historyStatuses:universe.map(u=>({symbol:u.symbol,ok:true,dataAsOf:'2026-10-19',expectedAsOf:Calendar.expectedCompletedSession(at)})),quotes:Object.fromEntries(universe.map(u=>[u.symbol,{symbol:u.symbol,price,open:1,sourceTime:new Date(Date.parse(at)+28800000).toISOString().slice(0,19).replace('T',' '),receivedAt:at}]))});
 return {args,protocol,input};
}
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'techscope-pair-'));
test('fixed protocol rejects past windows wrong model and pool, and binds the two low-capital rules',()=>{
 const f=fixture();assert.throws(()=>Pair.defineProtocol({...f.args,entryAfter:f.args.declaredAt}),/future/);assert.throws(()=>Pair.defineProtocol({...f.args,sourceModelHash:'wrong'}),/model/i);assert.throws(()=>Pair.defineProtocol({...f.args,universe:f.args.universe.slice(1)}),/six|pool/i);
 assert.equal(f.protocol.legs.candidate.policy.minEstimatedNetReturn,.01);assert.equal(f.protocol.legs.control.policy.minEstimatedNetReturn,0);
 for(const l of Object.values(f.protocol.legs)){assert.equal(l.policy.riskLimits.investableLimit,1250);assert.equal(l.policy.riskLimits.maxExposure,.125);assert.equal(l.policy.targetExitEnabled,false);assert.equal(l.policy.stopLossRate,.08);}
});
test('one immutable market sample starts both accounts together with fees and explicit fixed-selector identity',()=>{
 const f=fixture(),input=f.input(),before=Audit.hash(input),initial=Pair.initialState(f.protocol),r=Pair.advance(initial,input,f.protocol,runtime);
 assert.equal(Audit.hash(input),before);assert.equal(initial.sequence,0);assert.equal(r.state.startedAt,input.at);assert.equal(r.tick.inputHash,before);assert.equal(r.state.cashBenchmark.equity,10000);assert.equal(r.state.verifiedProfitProbability,null);
 for(const leg of Object.values(r.state.legs)){assert.ok(leg.session.account.feesPaid>0);assert.ok(leg.session.account.marketValue<=1250);assert.equal(leg.session.startedAt,r.state.legs.candidate.session.startedAt);assert.equal(leg.session.fingerprint.execution_mode,'paired_forward_research');}
 const selected=r.state.legs.control.session.account.holdings.map(h=>h.symbol);assert.ok(selected.every(s=>['sh588000','sh512760','sh515070'].includes(s)));assert.ok(selected.length>0);
 assert.equal(r.tick.events.control.context.predictions.sh588000.signalMeaning,'deterministic_order_priority_not_return_forecast');
});
test('missing shared quote postpones BOTH account starts; late window never backfills',()=>{
 const f=fixture(),bad=f.input();delete bad.quotes[f.args.universe[0].symbol];const a=Pair.advance(Pair.initialState(f.protocol),bad,f.protocol,runtime);assert.equal(a.state.startedAt,null);assert.ok(Object.values(a.state.legs).every(l=>!l.session));
 const b=Pair.advance(a.state,f.input('2026-10-20T01:36:00Z'),f.protocol,runtime);assert.equal(b.state.entryClosed,true);assert.equal(b.state.startedAt,null);
 const c=Pair.advance(b.state,f.input('2026-10-20T01:37:00Z'),f.protocol,runtime);assert.equal(c.state.startedAt,null);
});
test('a valid common start with no candidate signal remains a cash account, never a later chosen statistical start',()=>{
 const f=fixture();f.args.model.intercept=-.5;f.args.sourceModelHash=Audit.hash(f.args.model);f.protocol=Pair.defineProtocol(f.args);
 const r=Pair.advance(Pair.initialState(f.protocol),f.input(),f.protocol,runtime);assert.equal(r.state.startedAt,f.input().at);assert.equal(r.state.legs.candidate.session.account.holdings.length,0);assert.ok(r.state.legs.control.session.account.holdings.length>0);assert.equal(r.state.strategySuccess,false);
});
test('T+1 pending loss exit survives a missing quote and an unavailable next-day sell, without restoring capital',()=>{
 const f=fixture(),a=Pair.advance(Pair.initialState(f.protocol),f.input(),f.protocol,runtime),b=Pair.advance(a.state,f.input('2026-10-20T02:00:00Z',.8),f.protocol,runtime);
 assert.ok(b.state.legs.candidate.session.account.equity<10000);assert.ok(b.state.legs.candidate.session.account.holdings.some(h=>h.pendingExit));
 const bad=f.input('2026-10-20T02:01:00Z',.8);delete bad.quotes[b.state.legs.candidate.session.account.holdings[0].symbol];const c=Pair.advance(b.state,bad,f.protocol,runtime);assert.ok(c.state.legs.candidate.session.account.holdings.some(h=>h.stale));
 const halted=f.input('2026-10-21T01:30:00Z',.8);for(const q of Object.values(halted.quotes))q.sellLimitBlocked=true;const d=Pair.advance(c.state,halted,f.protocol,runtime);assert.equal(d.state.legs.candidate.session.account.holdings.length,b.state.legs.candidate.session.account.holdings.length);assert.ok(d.state.legs.candidate.session.account.equity<10000);
 const e=Pair.advance(d.state,f.input('2026-10-21T01:31:00Z',.8),f.protocol,runtime);assert.equal(e.state.legs.candidate.session.account.holdings.length,0);assert.ok(e.state.legs.candidate.session.account.realizedPnl<0);
});
test('independent public replay agrees per leg on all orders and final account, including no fill after close',()=>{
 const f=fixture(),inputs=[f.input(),f.input('2026-10-20T02:00:00Z',.8),f.input('2026-10-21T01:30:00Z',.8),f.input('2026-10-21T08:00:00Z',1.1)];
 let state=Pair.initialState(f.protocol);const ticks=[];for(const input of inputs){const r=Pair.advance(state,input,f.protocol,runtime);ticks.push(r.tick);state=r.state;}
 for(const id of ['candidate','control']){const start=ticks[0].state.legs[id].session,replay=Paper.replay(start,ticks.slice(1).map(t=>t.events[id]));assert.equal(replay.integrityHash,state.legs[id].session.integrityHash);assert.deepEqual(replay.orders,state.legs[id].session.orders);}
 assert.deepEqual(Pair.replay(inputs,f.protocol,runtime),state);assert.equal(ticks.at(-1).orders.candidate.length,0);
});
test('append then crash before checkpoint recovers both exact losing accounts and rejects duplicate append',()=>{
 const f=fixture(),dir=temp(),a=Pair.advance(Pair.initialState(f.protocol),f.input(),f.protocol,runtime);Pair.claim(dir,f.protocol);const owner=Pair.acquireLease(dir);Pair.persist(dir,a,f.protocol,owner);const b=Pair.advance(a.state,f.input('2026-10-20T02:00:00Z',.8),f.protocol,runtime);fs.appendFileSync(path.join(dir,'ticks.jsonl'),JSON.stringify(b.tick)+'\n');
 const recovered=Pair.recover(dir,f.protocol,runtime);assert.deepEqual(recovered,b.state);assert.ok(recovered.legs.candidate.session.account.equity<10000);assert.throws(()=>Pair.persist(dir,b,f.protocol,owner),/sequence|predecessor/);assert.throws(()=>Pair.claim(dir,f.protocol),/exist/i);
});
test('claim alone truncated ledger corrupt checkpoint or modified shared input are never reset',()=>{
 const f=fixture(),dir=temp();Pair.claim(dir,f.protocol);assert.throws(()=>Pair.recover(dir,f.protocol,runtime),/claim|state|ledger/);
 const a=Pair.advance(Pair.initialState(f.protocol),f.input(),f.protocol,runtime);const owner=Pair.acquireLease(dir);Pair.persist(dir,a,f.protocol,owner);const original=fs.readFileSync(path.join(dir,'ticks.jsonl'),'utf8');fs.appendFileSync(path.join(dir,'ticks.jsonl'),'{');assert.throws(()=>Pair.recover(dir,f.protocol,runtime),/tail|truncat/i);assert.ok(fs.readFileSync(path.join(dir,'ticks.jsonl'),'utf8').endsWith('{'));
 fs.writeFileSync(path.join(dir,'ticks.jsonl'),original);fs.writeFileSync(path.join(dir,'state.json'),'invalid');assert.throws(()=>Pair.recover(dir,f.protocol,runtime),/JSON|Unexpected/);
 fs.writeFileSync(path.join(dir,'state.json'),JSON.stringify(a.state));const t=JSON.parse(original);t.input.quotes.sh588000.price=2;fs.writeFileSync(path.join(dir,'ticks.jsonl'),JSON.stringify(t)+'\n');assert.throws(()=>Pair.recover(dir,f.protocol,runtime),/hash|replay|integrity/i);
});
test('single writer lease blocks alive owner and dead lease needs explicit resume',()=>{
 const dir=temp(),first=Pair.acquireLease(dir,{pid:123,isAlive:()=>false});assert.throws(()=>Pair.acquireLease(dir,{pid:456,resume:true,isAlive:()=>true}),/Active/);assert.throws(()=>Pair.acquireLease(dir,{pid:456,isAlive:()=>false}),/resume/);const second=Pair.acquireLease(dir,{pid:456,resume:true,isAlive:()=>false});first.release();assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'monitor.lease'))).pid,456);second.release();
});
test('clock regression and changed model protocol cannot consume another sample',()=>{
 const f=fixture(),a=Pair.advance(Pair.initialState(f.protocol),f.input(),f.protocol,runtime);assert.throws(()=>Pair.advance(a.state,f.input(),f.protocol,runtime),/clock|advance/);const changed=structuredClone(f.protocol);changed.model.intercept=.9;assert.throws(()=>Pair.advance(a.state,f.input('2026-10-20T02:00:00Z'),changed,runtime),/protocol|model|manifest/);
});
test('a stale or missing writer lease cannot append and a forged earlier checkpoint is rejected',()=>{
 const f=fixture(),dir=temp();Pair.claim(dir,f.protocol);const owner=Pair.acquireLease(dir),a=Pair.advance(Pair.initialState(f.protocol),f.input(),f.protocol,runtime);
 assert.throws(()=>Pair.persist(dir,a,f.protocol),/lease/);Pair.persist(dir,a,f.protocol,owner);
 const b=Pair.advance(a.state,f.input('2026-10-20T02:00:00Z',.8),f.protocol,runtime);Pair.persist(dir,b,f.protocol,owner);
 const other=Pair.advance(Pair.initialState(f.protocol),f.input('2026-10-20T01:31:00Z',.9),f.protocol,runtime);fs.writeFileSync(path.join(dir,'state.json'),JSON.stringify(other.state));
 assert.throws(()=>Pair.recover(dir,f.protocol,runtime),/checkpoint/i);
 owner.release();assert.throws(()=>Pair.persist(dir,b,f.protocol,owner),/ENOENT|lease/);
});
test('samples before the declared observation or received after decision are rejected',()=>{
 const f=fixture(),state=Pair.initialState(f.protocol);assert.throws(()=>Pair.advance(state,f.input('2026-10-19T07:00:00Z'),f.protocol,runtime),/declar/);
 const input=f.input();input.responseReceivedAt='2026-10-20T01:31:00Z';assert.throws(()=>Pair.advance(state,input,f.protocol,runtime),/received/);
});
test('shared histories are stored once by hash and modified history snapshots cannot be replayed',()=>{
 const f=fixture(),dir=temp();Pair.claim(dir,f.protocol);const owner=Pair.acquireLease(dir),a=Pair.advance(Pair.initialState(f.protocol),f.input(),f.protocol,runtime);Pair.persist(dir,a,f.protocol,owner);const b=Pair.advance(a.state,f.input('2026-10-20T02:00:00Z',.8),f.protocol,runtime);Pair.persist(dir,b,f.protocol,owner);
 const records=fs.readFileSync(path.join(dir,'ticks.jsonl'),'utf8').trim().split('\n').map(JSON.parse);assert.ok(records[0].input.histories===undefined);assert.deepEqual(records[0].inputHistorySnapshot,records[1].inputHistorySnapshot);assert.equal(fs.readdirSync(path.join(dir,'histories')).length,1);assert.deepEqual(Pair.recover(dir,f.protocol,runtime),b.state);
 const file=path.join(dir,'histories',records[0].inputHistorySnapshot.sha256+'.json');fs.writeFileSync(file,'{}');assert.throws(()=>Pair.recover(dir,f.protocol,runtime),/history|snapshot|hash/i);
});
test('recovery streams the append-only ledger rather than reading its full contents into memory',()=>{
 const f=fixture(),dir=temp();Pair.claim(dir,f.protocol);const owner=Pair.acquireLease(dir),a=Pair.advance(Pair.initialState(f.protocol),f.input(),f.protocol,runtime);Pair.persist(dir,a,f.protocol,owner);const originalRead=fs.readFileSync;
 try{fs.readFileSync=function(file,...args){if(path.basename(String(file))==='ticks.jsonl')throw Error('Full ledger reads forbidden by memory regression');return originalRead.call(this,file,...args);};assert.deepEqual(Pair.recover(dir,f.protocol,runtime),a.state);}finally{fs.readFileSync=originalRead;owner.release();}
});
