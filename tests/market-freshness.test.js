const {test}=require('node:test');
const assert=require('node:assert/strict');
const Market=require('../assets/market.js');
const bar=date=>({date,open:1,close:1,high:1,low:1,volume:100});
function useFixture(at){const RealDate=global.Date,store=global.localStorage,seed=global.TECH_SEED;let moment=at;const db=new Map();global.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[moment]));}static now(){return RealDate.parse(moment);}};global.localStorage={getItem:k=>db.get(k)||null,setItem:(k,v)=>db.set(k,v)};global.TECH_SEED={histories:{sh512760:[bar('2026-10-16')]}};return{db,setAt:x=>moment=x,restore(){global.Date=RealDate;global.localStorage=store;global.TECH_SEED=seed;Market.setTransport(null);}};}
test('stale primary plus failed fallback preserves diagnostics and never claims a current synchronization',async()=>{
 const f=useFixture('2026-10-20T01:28:00Z');let count=0;
 Market.setTransport(async url=>{count++;if(!url.includes('gtimg'))throw Error('fallback unavailable');return JSON.stringify({data:{sh512760:{hfqday:[['2026-10-16',1,1,1,1,100]]}}});});
 try{await Market.history('sh512760');const saved=JSON.parse(f.db.get('techscope_hist_sh512760'));assert.equal(saved.fetchedDate,null);assert.equal(saved.stale,true);assert.equal(saved.dataAsOf,'2026-10-16');assert.equal(saved.expectedAsOf,'2026-10-19');assert.equal(saved.sourceTime,null);assert.ok(saved.errors.some(x=>x.includes('fallback unavailable')));assert.equal(saved.fetchedAt,'2026-10-20T01:28:00.000Z');assert.equal(count,2);assert.equal(Market.historyStatus('sh512760',{at:'2026-10-20T09:28:00+08:00'}).ok,false);}finally{f.restore();}
});
test('all instruments sharing the same old date still fail the full-pool date gate',()=>{
 assert.equal(typeof Market.validateHistoryPool,'function');
 const same={sh512760:[bar('2026-10-16')],sh588000:[bar('2026-10-16')]};
 const a=Market.validateHistoryPool(same,{at:'2026-10-20T09:30:00+08:00',symbols:['sh512760','sh588000']});assert.equal(a.ok,false);assert.equal(a.expectedAsOf,'2026-10-19');assert.equal(a.rows.length,2);assert.ok(a.rows.every(x=>x.stale));
 const mixed={...same,sh588000:[bar('2026-10-19')]};assert.equal(Market.validateHistoryPool(mixed,{at:Date.parse('2026-10-20T09:30:00+08:00'),symbols:Object.keys(mixed)}).ok,false);
 assert.equal(Market.validateHistoryPool({sh512760:[bar('2026-10-19')]},{at:'2026-10-20T09:30:00+08:00'}).ok,false,'default gate requires all nineteen, not whatever arrived');
 assert.equal(Market.validateHistoryPool({sh512760:[bar('2026-10-19')],sh588000:[bar('2026-10-19')]},{at:'2026-10-20T09:30:00+08:00',symbols:['sh512760','sh588000']}).ok,true);
});
test('holiday mornings use the previous actual session and cache source and data clocks stay distinct',async()=>{
 const f=useFixture('2026-10-08T02:00:00Z');global.TECH_SEED.histories.sh512760=[bar('2026-09-30')];let calls=0;
 Market.setTransport(async()=>{calls++;f.setAt('2026-10-08T02:00:03Z');return JSON.stringify({data:{sh512760:{hfqday:[['2026-09-30',1,1,1,1,100],['2026-10-08',1,1,1,1,100]]}}});});
 try{const rows=await Market.history('sh512760');assert.equal(rows.at(-1).date,'2026-09-30');const state=Market.historyStatus('sh512760',{at:'2026-10-08T10:00:03+08:00'});assert.equal(state.ok,true);assert.equal(state.expectedAsOf,'2026-09-30');assert.equal(state.dataAsOf,'2026-09-30');assert.equal(state.fetchedAt,'2026-10-08T02:00:03.000Z');assert.equal(state.sourceTime,null);assert.equal(calls,1);}finally{f.restore();}
});
test('a quote records response reception separately from the source clock',async()=>{
 const f=useFixture('2026-10-20T01:30:00Z');const a=Array(60).fill('');a[1]='芯片ETF';a[3]='1';a[30]='20261020093000';const b=[...a];b[1]='科创50ETF';
 Market.setTransport(async()=>{f.setAt('2026-10-20T01:30:02Z');return 'v_sh512760="1~'+a.slice(1).join('~')+'";v_sh588000="1~'+b.slice(1).join('~')+'";';});
 try{const q=(await Market.quotes()).sh512760;assert.equal(q.sourceTime,'2026-10-20 09:30:00');assert.equal(q.receivedAt,'2026-10-20T01:30:02.000Z');assert.equal(q.fetchedAt,q.receivedAt);}finally{f.restore();}
});
test('calendar-uncovered synchronization fails closed before requesting data',async()=>{
 const f=useFixture('2027-01-04T02:00:00Z');let calls=0;Market.setTransport(async()=>{calls++;throw Error('should not fetch');});
 try{await assert.rejects(Market.history('sh512760'),/calendar_uncovered/);assert.equal(calls,0);const v=Market.validateHistoryPool({sh512760:[bar('2026-12-31')]},{at:'2027-01-04T10:00:00+08:00',symbols:['sh512760']});assert.equal(v.ok,false);assert.match(v.reason,/calendar_uncovered/);}finally{f.restore();}
});
