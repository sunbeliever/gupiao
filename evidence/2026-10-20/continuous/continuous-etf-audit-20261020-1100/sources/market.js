(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.Market=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
 'use strict';
 const Calendar=typeof module==='object'&&module.exports?require('./trading-calendar.js'):root.TradingCalendar;
 const NewsFacts=typeof module==='object'&&module.exports?require('./news-facts.js'):root.NewsFacts;
 const UNIVERSE=[
 ['sz002230','科大讯飞','人工智能','stock'],['sz300308','中际旭创','光通信','stock'],['sz300502','新易盛','光通信','stock'],['sh688981','中芯国际','半导体','stock'],['sh603019','中科曙光','算力','stock'],['sz000977','浪潮信息','算力','stock'],['sz002415','海康威视','人工智能','stock'],['sh688256','寒武纪','AI芯片','stock'],['sh600406','国电南瑞','工业软件','stock'],['sz002371','北方华创','半导体设备','stock'],['sh600703','三安光电','半导体','stock'],['sh688111','金山办公','软件','stock'],['sh600570','恒生电子','软件','stock'],
 ['sh588000','科创50ETF','科创','etf'],['sh512760','芯片ETF','半导体','etf'],['sh515070','人工智能ETF','人工智能','etf'],['sh512720','计算机ETF','软件','etf'],['sh515880','通信ETF','通信','etf'],['sz159852','软件ETF','软件','etf']].map(a=>({symbol:a[0],name:a[1],sector:a[2],type:a[3]}));
 const MEMBERS=new Map(UNIVERSE.map(x=>[x.symbol,x]));const pending=new Map();let requestId=0,customTransport=null;
 const today=()=>Calendar.sessionOf(new Date().getTime());
 function read(key){try{const raw=root.Native?root.Native.read(key):root.localStorage?root.localStorage.getItem('techscope_'+key):null;return raw?JSON.parse(raw):null;}catch(e){return null;}}
 function readState(key){
  let raw;try{raw=root.Native?root.Native.read(key):root.localStorage?root.localStorage.getItem('techscope_'+key):null;}catch(e){return{status:'read_failure',value:null,error:String(e.message||e)};}
  if(raw===null||raw===undefined)return{status:'missing',value:null};
  try{const value=JSON.parse(raw);if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Account snapshot must be an object');return{status:'valid',value};}catch(e){return{status:'corrupt',value:null,error:String(e.message||e)};}
 }
 function write(key,value){const text=JSON.stringify(value);try{if(root.Native)return root.Native.write(key,text)!==false;else if(root.localStorage)root.localStorage.setItem('techscope_'+key,text);else return false;}catch(e){return false;}return true;}
 root.nativeResult=function(id,payload,error){const x=pending.get(String(id));if(!x)return;pending.delete(String(id));clearTimeout(x.timer);if(error)x.reject(new Error(error));else x.resolve(payload);};
 async function request(url){if(customTransport)return customTransport(url);if(root.Native){return new Promise((resolve,reject)=>{const id=String(++requestId);const timer=setTimeout(()=>{pending.delete(id);reject(new Error('数据请求超时'));},25000);pending.set(id,{resolve,reject,timer});root.Native.request(id,url);});}const r=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error('HTTP '+r.status);if(url.includes('qt.gtimg.cn'))return new TextDecoder('gb18030').decode(await r.arrayBuffer());return r.text();}
 function n(v){if(v===''||v==null||v==='-'||v==='--')return null;const r=Number(v);return Number.isFinite(r)?r:null;}
 function strip(v){return String(v||'').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>');}
 function sourceTime(v){return /^\d{14}$/.test(v||'')?v.slice(0,4)+'-'+v.slice(4,6)+'-'+v.slice(6,8)+' '+v.slice(8,10)+':'+v.slice(10,12)+':'+v.slice(12,14):null;}
 function qqVolumeMultiplier(symbol){return symbol.startsWith('sh688')?1:100;}
 function parseQuotes(text,fetchedAt=new Date().toISOString()){const out={};const re=/v_(sh\d{6}|sz\d{6})="([^"]*)"/g;let m;while((m=re.exec(text))){const a=m[2].split('~');const meta=MEMBERS.get(m[1]);const price=n(a[3]);if(!meta||price==null||price<=0)continue;const vol=n(a[6]);const amount=n(a[57])??n(a[37]);out[m[1]]={symbol:m[1],name:strip(a[1])||meta.name,price,previousClose:n(a[4]),open:n(a[5]),high:n(a[33]),low:n(a[34]),change:n(a[31]),changePct:n(a[32]),volume:vol==null?null:vol*qqVolumeMultiplier(m[1]),amount:amount==null?null:amount*10000,turnover:n(a[38]),pe:meta.type==='etf'?null:n(a[39]),pb:meta.type==='etf'?null:n(a[46]),sourceTime:sourceTime(a[30]),fetchedAt,receivedAt:fetchedAt,source:'腾讯公开行情'};}return out;}
 function validBar(b){return /^\d{4}-\d{2}-\d{2}$/.test(b.date)&&[b.open,b.close,b.high,b.low,b.volume].every(Number.isFinite)&&b.low>0&&b.high>=Math.max(b.open,b.close,b.low)&&b.low<=Math.min(b.open,b.close)&&b.volume>=0;}
 function cleanBars(bars){const map=new Map();for(const b of bars)if(validBar(b))map.set(b.date,b);return [...map.values()].sort((a,b)=>a.date.localeCompare(b.date));}
 function parseHistory(text,symbol,adjust){const j=typeof text==='string'?JSON.parse(text):text;const d=j.data?.[symbol];if(!d)throw new Error('腾讯日线无返回数据');const arr=d[(adjust||'')+'day'];if(!Array.isArray(arr))throw new Error(adjust?'复权日线字段缺失':'日线字段缺失');return cleanBars(arr.map(a=>({date:String(a[0]),open:Number(a[1]),close:Number(a[2]),high:Number(a[3]),low:Number(a[4]),volume:Number(a[5])*qqVolumeMultiplier(symbol)})));}
 function parseEastHistory(text){const j=typeof text==='string'?JSON.parse(text):text;const rows=j.data?.klines;if(!Array.isArray(rows))throw new Error('东方财富日线无返回数据');return cleanBars(rows.map(line=>{const a=line.split(',');return{date:a[0],open:Number(a[1]),close:Number(a[2]),high:Number(a[3]),low:Number(a[4]),volume:Number(a[5])*100,amount:n(a[6])};}));}
 function isStale(q,now=new Date()){if(!q?.sourceTime)return true;const t=Date.parse(q.sourceTime.replace(' ','T')+'+08:00');return !Number.isFinite(t)||now.getTime()-t>180000||t-now.getTime()>60000;}
 async function quotes(){try{const raw=await request('https://qt.gtimg.cn/q='+UNIVERSE.map(x=>x.symbol).join(','));const q=parseQuotes(raw);if(Object.keys(q).length<2)throw new Error('行情解析失败');write('quotes',q);return q;}catch(e){const background=read('background_quotes');let bg={};if(background?.text){const d=new Date(background.fetchedAt);bg=parseQuotes(background.text,Number.isFinite(d.getTime())?d.toISOString():null);}const cache={};for(const group of [read('quotes')||{},bg])for(const [symbol,q] of Object.entries(group)){const prior=cache[symbol];if(!prior||(q.sourceTime||'')>(prior.sourceTime||''))cache[symbol]=q;}if(Object.keys(cache).length){for(const q of Object.values(cache)){q.cached=true;q.error=e.message;}return cache;}throw e;}}
 async function fetchYear(symbol,year,adjust,expected){
  let primary;const errors=[],needsCurrent=year===Number(expected.slice(0,4));
  const last=rows=>(rows||[]).filter(b=>b.date<=expected).at(-1)?.date||null;
  try{const url='https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param='+symbol+',day,'+year+'-01-01,'+year+'-12-31,320,'+adjust;
   primary=parseHistory(await request(url),symbol,adjust).filter(x=>x.date.startsWith(String(year)));
   if(!needsCurrent||last(primary)===expected)return{bars:primary,errors,source:'腾讯公开日线',sourceTime:null};
   errors.push(symbol+' '+year+' primary_stale: '+last(primary)+' expected '+expected);
  }catch(e){errors.push(symbol+' '+year+' 腾讯日线失败: '+e.message);}
  try{const secid=(symbol.startsWith('sh')?'1.':'0.')+symbol.slice(2),fqt=adjust==='hfq'?2:0;
   const url='https://push2his.eastmoney.com/api/qt/stock/kline/get?secid='+secid+'&klt=101&fqt='+fqt+'&beg='+year+'0101&end='+year+'1231&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61';
   const fallback=parseEastHistory(await request(url)).filter(x=>x.date.startsWith(String(year)));
   if(needsCurrent&&last(fallback)!==expected)errors.push(symbol+' '+year+' fallback_stale: '+last(fallback)+' expected '+expected);
   const keepPrimary=primary?.length&&(last(primary)||'')>(last(fallback)||'');
   return{bars:keepPrimary?primary:fallback,errors,source:keepPrimary?'腾讯公开日线':'东方财富公开日线',sourceTime:null};
  }catch(e){errors.push(symbol+' '+year+' 东方财富日线失败: '+e.message);if(primary?.length)return{bars:primary,errors,source:'腾讯公开日线',sourceTime:null};throw new Error(errors.join('; '));}
 }
 function merge(a,b){return cleanBars((a||[]).concat(b||[]));}
 function historyStatus(symbol,{at=new Date().getTime(),adjust='hfq'}={}){const saved=read((adjust?'hist_':'raw_')+symbol)||{};const bars=cleanBars(saved.bars||[]);const dataAsOf=bars.at(-1)?.date||null;let expectedAsOf=null,reason=null;try{expectedAsOf=Calendar.expectedCompletedSession(at);if(dataAsOf!==expectedAsOf)reason='daily_stale';}catch(e){reason=e.message;}return{symbol,ok:!reason,stale:!!reason,dataAsOf,expectedAsOf,fetchedAt:saved.fetchedAt||null,sourceTime:saved.sourceTime||null,source:saved.source||null,errors:saved.errors||[],reason,calendarVersion:Calendar.version};}
 function validateHistoryPool(histories,{at=new Date().getTime(),symbols=UNIVERSE.map(x=>x.symbol)}={}){let expectedAsOf;try{expectedAsOf=Calendar.expectedCompletedSession(at);}catch(e){return{ok:false,expectedAsOf:null,rows:[],reason:e.message};}const rows=symbols.map(symbol=>{const bars=cleanBars(histories?.[symbol]||[]),dataAsOf=bars.at(-1)?.date||null;return{symbol,dataAsOf,expectedAsOf,stale:dataAsOf!==expectedAsOf,reason:!dataAsOf?'history_missing':dataAsOf!==expectedAsOf?'daily_stale':null};});const ok=rows.length>0&&rows.every(x=>!x.stale);return{ok,expectedAsOf,rows,reason:ok?null:'history_pool_incomplete',calendarVersion:Calendar.version};}
 async function history(symbol,adjust='hfq'){
  if(!MEMBERS.has(symbol))throw new Error('不在研究池');
  const at=new Date().getTime(),day=Calendar.sessionOf(at),expectedAsOf=Calendar.expectedCompletedSession(at),year=Number(day.slice(0,4));
  const key=(adjust?'hist_':'raw_')+symbol,cached=read(key),seed=(adjust?root.TECH_SEED?.histories:root.TECH_SEED?.rawHistories)?.[symbol]||[];
  let bars=cleanBars(cached?.bars?.length?cached.bars:seed).filter(b=>b.date<=expectedAsOf);
  const session=day===expectedAsOf?'closed':'intraday',age=cached?.fetchedAt?at-Date.parse(cached.fetchedAt):Infinity;
  if(cached?.sourcePolicy==='exchange-daily-v4'&&cached.expectedAsOf===expectedAsOf&&cached.dataAsOf===expectedAsOf&&!cached.stale&&age>=0&&age<30*60000)return bars;
  const start=bars.length?Math.min(year,Number(bars.at(-1).date.slice(0,4))):adjust?2020:year-1;const errors=[];let source=cached?.source||null;
  for(let y=start;y<=year;y++){try{const fresh=await fetchYear(symbol,y,adjust,expectedAsOf);bars=merge(bars,fresh.bars.filter(b=>b.date<=expectedAsOf));errors.push(...fresh.errors);if(fresh.bars.length)source=fresh.source;}catch(e){errors.push(e.message);}}
  const fetchedAt=new Date().toISOString(),dataAsOf=bars.at(-1)?.date||null,stale=dataAsOf!==expectedAsOf;
  if(stale)errors.push(symbol+' daily_stale: '+dataAsOf+' expected '+expectedAsOf);
  write(key,{bars,sourcePolicy:'exchange-daily-v4',fetchedDate:stale?null:day,session,fetchedAt,sourceTime:null,dataAsOf,expectedAsOf,stale,source,errors,calendarVersion:Calendar.version});
  if(!bars.length)throw new Error(errors.join('; ')||'没有历史数据');return bars;
 }
 async function syncHistories(progress){const histories={},warnings=[];let cursor=0,count=0;const worker=async()=>{while(cursor<UNIVERSE.length){const item=UNIVERSE[cursor++];try{histories[item.symbol]=await history(item.symbol);}catch(e){const old=root.TECH_SEED?.histories?.[item.symbol];if(old?.length)histories[item.symbol]=old;warnings.push(e.message);}count++;if(progress)progress(count,UNIVERSE.length,item.name);}};await Promise.all([worker(),worker(),worker()]);const validation=validateHistoryPool(histories);for(const row of validation.rows)if(row.stale)warnings.push(row.symbol+' '+row.reason+': '+row.dataAsOf+' expected '+row.expectedAsOf);write('sync_meta',{updatedAt:new Date().toISOString(),warnings,validation});return histories;}
 function parseNews(text,sector){const j=typeof text==='string'?JSON.parse(text.replace(/^\s*\w+\(/,'').replace(/\);?\s*$/,'')):text;const rows=j.result?.cmsArticleWebOld||[];return rows.map(x=>{const title=strip(x.title);let url=String(x.url||'').replace(/^http:/,'https:');if(!/^https:\/\/[a-z0-9.-]+\.eastmoney\.com\//i.test(url)||!title)return null;return{title,url,publishedAt:x.date||null,source:strip(x.mediaName)||'东方财富检索',sector,sentiment:NewsFacts?NewsFacts.sentiment(title):'中性'};}).filter(Boolean);}
 function newsUrl(keyword){return 'https://search-api-web.eastmoney.com/search/jsonp?cb=cb&param='+encodeURIComponent(JSON.stringify({uid:'',keyword,type:['cmsArticleWebOld'],client:'web',clientType:'web',clientVersion:'curr',param:{cmsArticleWebOld:{searchScope:'default',sort:'default',pageIndex:1,pageSize:10,preTag:'',postTag:''}}}));}
 function parseAnnouncements(text,symbol){
  const company=MEMBERS.get(symbol);if(!company||company.type!=='stock')throw new Error('Only research-pool stock announcements are supported');
  const code=symbol.slice(2),j=typeof text==='string'?JSON.parse(text):text;
  if(!Array.isArray(j?.data?.list))throw new Error('公告来源未返回有效列表');
  return j.data.list.filter(x=>/^[A-Za-z0-9]+$/.test(String(x.art_code||''))&&Array.isArray(x.codes)&&x.codes.some(c=>String(c.stock_code)===code)).map(x=>({
   title:strip(x.title),url:'https://data.eastmoney.com/notices/detail/'+code+'/'+x.art_code+'.html',
   publishedAt:x.display_time||x.notice_date||null,category:strip(x.columns?.[0]?.column_name)||'公司公告',source:'东方财富公告检索',symbol
  })).filter(x=>x.title).slice(0,20);
 }
 async function announcements(symbol,force=false){
  const company=MEMBERS.get(symbol);if(!company||company.type!=='stock')throw new Error('Only research-pool stock announcements are supported');
  const key='ann_'+symbol,old=read(key);if(!force&&old?.fetchedAt&&Date.now()-Date.parse(old.fetchedAt)<30*60000)return {...old,reused:true};
  try{const items=parseAnnouncements(await request('https://np-anotice-stock.eastmoney.com/api/security/ann?sr=-1&page_size=10&page_index=1&ann_type=A&client_source=web&stock_list='+symbol.slice(2)),symbol);const observedAt=new Date().toISOString();
   const archive=new Map((old?.archive||old?.items||[]).map(x=>[x.url,x]));
   const current=items.map(x=>({...x,firstSeenAt:archive.get(x.url)?.firstSeenAt||observedAt,firstConfirmedSeenAt:archive.get(x.url)?.firstConfirmedSeenAt||observedAt,lastSeenAt:observedAt}));current.forEach(x=>archive.set(x.url,x));
   const result={items:current,archive:[...archive.values()].sort((a,b)=>(b.lastSeenAt||'').localeCompare(a.lastSeenAt||'')).slice(0,200),fetchedAt:observedAt,cached:false};
   if(!write(key,result))result.storageError=true;return result;
  }catch(e){if(old&&Array.isArray(old.items))return {...old,cached:true,error:String(e.message).slice(0,100)};throw e;}
 }
 function archiveNews(items,observedAt=new Date().toISOString()){const old=read('news_archive')||[];const byUrl=new Map(old.map(x=>[x.url,x]));for(const item of items){if(!item.url||!/^https:\/\//.test(item.url))continue;const prior=byUrl.get(item.url);byUrl.set(item.url,{...item,firstSeenAt:prior?.firstSeenAt||observedAt,lastSeenAt:observedAt});}const cutoff=Date.parse(observedAt)-90*86400000;const archive=[...byUrl.values()].filter(x=>Date.parse(x.lastSeenAt||x.firstSeenAt)>=cutoff).sort((a,b)=>(b.lastSeenAt||'').localeCompare(a.lastSeenAt||'')).slice(0,2500);write('news_archive',archive);return archive;}
 async function news(){const back=read('background_news');if(back?.text){const seen=new Date(back.fetchedAt);archiveNews(parseNews(back.text,'科技'),Number.isFinite(seen.getTime())?seen.toISOString():new Date().toISOString());}const keywords=['半导体','人工智能','算力','软件','通信'];const results=await Promise.allSettled(keywords.map(async k=>parseNews(await request(newsUrl(k)),k)));const map=new Map();for(const r of results)if(r.status==='fulfilled')for(const x of r.value)map.set(x.url,x);const items=[...map.values()].sort((a,b)=>(b.publishedAt||'').localeCompare(a.publishedAt||'')).slice(0,40);if(items.length){write('news',{items,fetchedAt:new Date().toISOString()});archiveNews(items);return items;}const cached=read('news');if(cached?.items?.length)return cached.items.map(x=>({...x,cached:true}));if(back?.text)return parseNews(back.text,'科技').map(x=>({...x,cached:true}));throw new Error('新闻连接失败，请稍后刷新');}
 const BOARDS=[['BK1036','半导体'],['BK1037','消费电子'],['BK0737','软件开发'],['BK1039','电子化学品Ⅱ']];
 async function sectors(){const result=await Promise.allSettled(BOARDS.map(async([code,name])=>{const raw=JSON.parse(await request('https://push2.eastmoney.com/api/qt/stock/get?secid=90.'+code+'&fltt=2&fields=f43,f44,f45,f46,f57,f58,f60,f169,f170'));const d=raw.data;if(!d||!d.f58)throw new Error('板块无数据');const cached=read('sector_'+code);let bars=cached?.history||[];if(cached?.fetchedDate!==today()){try{bars=parseEastHistory(await request('https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=90.'+code+'&klt=101&fqt=0&beg='+today().slice(0,4)+'0101&end=20501231&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61'));}catch(e){}}const item={code,name:strip(d.f58),price:n(d.f43),changePct:n(d.f170),history:bars,fetchedAt:new Date().toISOString(),fetchedDate:today(),source:'东方财富行业指数'};write('sector_'+code,item);return item;}));const good=result.filter(x=>x.status==='fulfilled').map(x=>x.value);if(good.length)return good;return BOARDS.map(x=>read('sector_'+x[0])).filter(Boolean).map(x=>({...x,cached:true}));}
 function restoreHistories(seed){const histories={...(seed.histories||{})},rawHistories={...(seed.rawHistories||{})};for(const item of UNIVERSE){for(const [prefix,target] of [['hist_',histories],['raw_',rawHistories]]){const cached=read(prefix+item.symbol);if(!Array.isArray(cached?.bars))continue;const bars=cleanBars(cached.bars);if(bars.length&&(!target[item.symbol]?.length||bars.at(-1).date>=target[item.symbol].at(-1).date))target[item.symbol]=merge(target[item.symbol],bars);}}return{histories,rawHistories};}
 async function loadSeed(){return root.TECH_SEED||{histories:{},rawHistories:{},model:null,reports:{},generatedAt:null};}
 function openUrl(url){if(!/^https:\/\//.test(url))return;if(root.Native)root.Native.openUrl(url);else root.open(url,'_blank','noopener');}
 function setBackground(enabled){if(root.Native&&root.Native.setBackground)root.Native.setBackground(!!enabled);write('background_enabled',!!enabled);}
 return {UNIVERSE,read,readState,write,quotes,history,historyStatus,validateHistoryPool,rawHistory:symbol=>history(symbol,''),syncHistories,news,sectors,loadSeed,restoreHistories,openUrl,isStale,setBackground,parseQuotes,parseHistory,parseEastHistory,parseNews,cleanBars,newsUrl,archiveNews,parseAnnouncements,announcements,setTransport:fn=>{customTransport=fn;}};
});
