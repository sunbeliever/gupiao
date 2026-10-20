const {test}=require('node:test');
const assert=require('node:assert/strict');
let Market={}; try {Market=require('../assets/market.js');}catch(e){}
test('after-close stale primary daily data tries the fallback without inventing a missing bar',async()=>{
 const RealDate=global.Date,oldStore=global.localStorage,oldSeed=global.TECH_SEED;let moment;
 global.Date=class extends RealDate{constructor(...a){super(...(a.length?a:[moment]));}};
 try{for(const time of ['2026-10-19T08:00:00Z','2026-10-20T01:28:00Z']){moment=time;for(const available of [true,false]){const data=new Map(),calls=[];global.localStorage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};global.TECH_SEED={histories:{sh512760:[{date:'2026-10-16',open:1,close:1,high:1,low:1,volume:100}]}};
  Market.setTransport(async url=>{calls.push(url);if(url.includes('gtimg'))return JSON.stringify({data:{sh512760:{hfqday:[['2026-10-16','1','1','1','1','100']]}}});if(!available)throw Error('fallback unavailable');return JSON.stringify({data:{klines:['2026-10-19,1,1.1,1.2,.9,100,10000']}});});
  const bars=await Market.history('sh512760');assert.equal(calls.length,2);assert.equal(bars.at(-1).date,available?'2026-10-19':'2026-10-16');
 }}}finally{global.Date=RealDate;global.localStorage=oldStore;global.TECH_SEED=oldSeed;Market.setTransport(null);}
});
test('announcements keep only the selected company and construct safe source links',()=>{
 const r=Market.parseAnnouncements({data:{list:[{art_code:'AN202610190001',title:'<em>关于业绩预告的公告</em>',notice_date:'2026-10-19',codes:[{stock_code:'300308'}],columns:[{column_name:'业绩预告'}]},{art_code:'../../evil',title:'bad',codes:[{stock_code:'300308'}]},{art_code:'AN123',title:'other',codes:[{stock_code:'002230'}]}]}},'sz300308');
 assert.equal(r.length,1);assert.equal(r[0].title,'关于业绩预告的公告');assert.equal(r[0].url,'https://data.eastmoney.com/notices/detail/300308/AN202610190001.html');assert.equal(r[0].category,'业绩预告');
});
test('company announcements preserve observation times and mark offline fallback',async()=>{
 const old=global.localStorage,db=new Map();global.localStorage={getItem:k=>db.get(k),setItem:(k,v)=>db.set(k,v)};
 let calls=0;Market.setTransport(async url=>{calls++;assert.ok(url.startsWith('https://np-anotice-stock.eastmoney.com/api/security/ann?'));assert.ok(url.includes('stock_list=300308'));return JSON.stringify({data:{list:[{art_code:'AN123',title:'公告',notice_date:'2026-10-19',codes:[{stock_code:'300308'}]}]}});});
 try{const a=await Market.announcements('sz300308',true);const b=await Market.announcements('sz300308');assert.equal(calls,1);assert.equal(a.items[0].firstSeenAt,b.items[0].firstSeenAt);Market.setTransport(async()=>{throw new Error('offline');});const c=await Market.announcements('sz300308',true);assert.equal(c.cached,true);assert.equal(c.fetchedAt,a.fetchedAt);assert.equal(c.items[0].firstSeenAt,a.items[0].firstSeenAt);await assert.rejects(Market.announcements('sh588000'),/stock/);}finally{global.localStorage=old;Market.setTransport(null);}
});
test('announcement observation time is assigned after receipt rather than before the request',async()=>{
 const RealDate=global.Date,old=global.localStorage;let moment='2026-10-19T03:10:00Z';
 global.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[moment]));}static now(){return RealDate.parse(moment);}};
 const db=new Map();global.localStorage={getItem:k=>db.get(k),setItem:(k,v)=>db.set(k,v)};
 Market.setTransport(async()=>{moment='2026-10-19T03:10:05Z';return JSON.stringify({data:{list:[{art_code:'AN123',title:'公告',codes:[{stock_code:'300308'}]}]}});});
 try{const r=await Market.announcements('sz300308',true);assert.equal(r.items[0].firstSeenAt,'2026-10-19T03:10:05.000Z');assert.equal(r.fetchedAt,'2026-10-19T03:10:05.000Z');}finally{global.Date=RealDate;global.localStorage=old;Market.setTransport(null);}
});
test('quotes convert hands to shares and ETF fundamentals remain absent',()=>{
  const a=Array(60).fill(''); a[1]='芯片ETF';a[2]='512760';a[3]='1.23';a[4]='1.20';a[6]='12';a[30]='20261008103000';a[32]='2.5';a[33]='1.25';a[34]='1.18';a[38]='1.7';a[46]='0';a[57]='14.76';
  const q=Market.parseQuotes('v_sh512760="1~'+a.slice(1).join('~')+'";')['sh512760'];
  assert.equal(q.volume,1200);assert.equal(q.amount,147600);assert.equal(q.pe,null);assert.equal(q.pb,null);assert.equal(q.sourceTime,'2026-10-08 10:30:00');
});
test('history rejects invalid OHLC, sorts and deduplicates',()=>{
 const x={data:{sz300308:{hfqday:[['2025-01-03','12','11','13','10','100'],['2025-01-02','10','12','13','9','80'],['2025-01-02','10','12','13','9','80'],['2025-01-04','0','2','3','1','5']]}}};
 const r=Market.parseHistory(JSON.stringify(x),'sz300308','hfq');assert.equal(r.length,2);assert.equal(r[0].date,'2025-01-02');assert.equal(r[1].volume,10000);
});
test('news does not execute markup or invent a missing date',()=>{
 const x={result:{cmsArticleWebOld:[{title:'<em>芯片</em>增长',url:'http://finance.eastmoney.com/a/abc.html',date:'2026-10-08 10:00:00',mediaName:'东方财富'},{title:'坏链接',url:'javascript:alert(1)',date:''}]}};
 const r=Market.parseNews('cb('+JSON.stringify(x)+');','半导体'); assert.equal(r.length,1);assert.equal(r[0].title,'芯片增长');assert.ok(r[0].url.startsWith('https://'));assert.equal(r[0].publishedAt,'2026-10-08 10:00:00');
});
test('stale quotes and invalid timestamps are recognized',()=>{
 assert.equal(Market.isStale({sourceTime:'2026-10-08 09:30:00'},new Date('2026-10-08T10:30:00+08:00')),true);
 assert.equal(Market.isStale({sourceTime:'invalid'},new Date()),true);
});
test('adjusted training history cannot silently accept raw prices',()=>{
 const text=JSON.stringify({data:{sz300308:{day:[['2025-01-02','10','12','13','9','80']]}}});
 assert.throws(()=>Market.parseHistory(text,'sz300308','hfq'),/复权|字段/);
});
test('a morning cache is refreshed after close to collect the completed bar',async()=>{
 const RealDate=global.Date,oldStore=global.localStorage,oldSeed=global.TECH_SEED;
 let moment='2026-10-08T02:00:00Z',calls=0;const saved=new Map();
 global.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[moment]));}};
 global.localStorage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)};
 global.TECH_SEED={histories:{sz300308:[{date:'2026-01-02',open:10,close:10,high:11,low:9,volume:100}]}};
 Market.setTransport(async url=>{if(!url.includes('gtimg'))throw Error('holiday fallback has no new completed bar');calls++;return JSON.stringify({data:{sz300308:{hfqday:[['2026-09-30','10','12','13','9','80'],['2026-10-08','12','13','14','11','80']]}}});});
 try{const before=await Market.history('sz300308');assert.equal(before.at(-1).date,'2026-09-30');moment='2026-10-08T09:00:00Z';const after=await Market.history('sz300308');assert.equal(after.at(-1).date,'2026-10-08');assert.equal(calls,2);}finally{global.Date=RealDate;global.localStorage=oldStore;global.TECH_SEED=oldSeed;Market.setTransport(null);}
});
test('Tencent STAR quotes and daily volume already use shares',()=>{
 const a=Array(60).fill('');a[1]='中芯国际';a[2]='688981';a[3]='107.08';a[6]='48153938';a[30]='20261008150000';a[57]='523411.5684';
 const q=Market.parseQuotes('v_sh688981="1~'+a.slice(1).join('~')+'";').sh688981;assert.equal(q.volume,48153938);
 const rows=Market.parseHistory(JSON.stringify({data:{sh688981:{hfqday:[['2026-09-30','100','101','102','99','42874573']]}}}),'sh688981','hfq');assert.equal(rows[0].volume,42874573);
});
test('cache fallback keeps the newer quote and original collection time',async()=>{
 const oldNative=global.Native;const fg={sh588000:{sourceTime:'2026-10-08 15:00:00',price:1.2,fetchedAt:'2026-10-08T07:01:00Z'}};
 const a=Array(60).fill('');a[1]='科创50ETF';a[3]='1.1';a[30]='20261008103000';
 global.Native={read:k=>JSON.stringify(k==='quotes'?fg:k==='background_quotes'?{text:'v_sh588000="1~'+a.slice(1).join('~')+'";',fetchedAt:Date.parse('2026-10-08T02:31:00Z')}:null)};
 Market.setTransport(async()=>{throw new Error('offline');});
 try{const r=await Market.quotes();assert.equal(r.sh588000.price,1.2);assert.equal(r.sh588000.fetchedAt,'2026-10-08T07:01:00Z');assert.equal(r.sh588000.cached,true);}finally{global.Native=oldNative;Market.setTransport(null);}
});
test('failed native storage writes are reported to the caller',()=>{
 const oldNative=global.Native;global.Native={write:()=>false};try{assert.equal(Market.write('settings',{enabled:true}),false);}finally{global.Native=oldNative;}
});
test('news accumulation keeps first observed time for later analysis',()=>{
 const oldStore=global.localStorage;const data=new Map();global.localStorage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};
 try{Market.archiveNews([{title:'芯片增长',url:'https://finance.eastmoney.com/a/1.html',publishedAt:'2026-10-08 09:00:00'}],'2026-10-08T03:00:00Z');const r=Market.archiveNews([{title:'芯片增长',url:'https://finance.eastmoney.com/a/1.html',publishedAt:'2026-10-08 09:00:00'},{title:'AI创新',url:'https://finance.eastmoney.com/a/2.html'}],'2026-10-09T03:00:00Z');assert.equal(r.length,2);assert.equal(r.find(x=>x.url.endsWith('/1.html')).firstSeenAt,'2026-10-08T03:00:00Z');}finally{global.localStorage=oldStore;}
});
test('restart restores updated adjusted and raw bars from private cache',()=>{
 const oldStore=global.localStorage;const bar=date=>({date,open:10,close:11,high:12,low:9,volume:100});const data=new Map([['techscope_hist_sz002230',JSON.stringify({bars:[bar('2026-09-30'),bar('2026-10-08')]})],['techscope_raw_sz002230',JSON.stringify({bars:[bar('2026-10-08')]})]]);global.localStorage={getItem:k=>data.get(k)||null};
 try{const r=Market.restoreHistories({histories:{sz002230:[bar('2026-09-30')]},rawHistories:{sz002230:[bar('2026-09-30')]}});assert.equal(r.histories.sz002230.at(-1).date,'2026-10-08');assert.equal(r.rawHistories.sz002230.at(-1).date,'2026-10-08');assert.equal(r.histories.sz002230.length,2);}finally{global.localStorage=oldStore;}
});
test('resuming in a new year fills the missed final months of the previous year',async()=>{
 const RealDate=global.Date,oldStore=global.localStorage,oldSeed=global.TECH_SEED;const years=[];const data=new Map();global.Date=class extends RealDate{constructor(...a){super(...(a.length?a:['2027-01-15T10:00:00Z']));}};global.localStorage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};global.TECH_SEED={histories:{sz002230:[{date:'2026-09-30',open:10,close:11,high:12,low:9,volume:100}]}};
 Market.setTransport(async url=>{const y=Number(url.match(/,day,(\d{4})/)[1]);years.push(y);return JSON.stringify({data:{sz002230:{hfqday:[[y===2026?'2026-12-31':'2027-01-14','10','11','12','9','100']]}}});});
 try{const r=await Market.history('sz002230');assert.deepEqual(years,[2026,2027]);assert.equal(r.some(x=>x.date==='2026-12-31'),true);}finally{global.Date=RealDate;global.localStorage=oldStore;global.TECH_SEED=oldSeed;Market.setTransport(null);}
});
