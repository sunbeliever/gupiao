'use strict';
// Development-only surveillance. No production publication or automatic event resolution.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const SYMBOLS=Object.freeze(['sh588000','sh512760','sh515070','sh512720','sh515880','sz159852']);
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function classify(title){return /拆分|折算|分红|收益分配|终止|清算|合并|转型|代码|份额|停牌|复牌|暂停|权益/.test(title)?'rights_suspect':'other';}
function sourceUrl(symbol,page,end){
 if(!SYMBOLS.includes(symbol)||!Number.isInteger(page)||page<1||!/^\d{4}-\d{2}-\d{2}$/.test(end))throw Error('Invalid source parameters');
 if(symbol==='sz159852')return 'https://www.jsfund.cn/servlet/json?'+new URLSearchParams({funcNo:'741015',product_id:'1779',curtpage:String(page),numperpage:'100',keyword:'',start_date:'2026-10-24',end_date:end,type:'',select_time:''});
 return 'https://query.sse.com.cn/commonQuery.do?'+new URLSearchParams({isPagination:'true','pageHelp.pageSize':'100','pageHelp.pageNo':String(page),'pageHelp.beginPage':String(page),'pageHelp.cacheSize':'1','pageHelp.endPage':String(page),type:'inParams',sqlId:'COMMON_PL_JJXX_JJGG_NEW_L',SECURITY_CODE:symbol.slice(2),START_DATE:'2026-10-24',END_DATE:end,DATE_DESC:'1'});
}
function parsePage(symbol,j,page){
 let rows,total,pages,current;
 if(symbol==='sz159852'){
  if(String(j.error_no)!=='0'||j.error_info)throw Error('JSFund business failure');
  const r=j.results?.[0];rows=r?.data;total=r?.totalRows;pages=r?.totalPages;current=r?.currentPage;
 }else{
  // SSE does not publish a success flag: require its complete documented result envelope.
  if(j.error||j.error_code||j.success===false||[j.actionErrors,j.fieldErrors].some(v=>v!=null&&(typeof v==='object'?Object.keys(v).length>0:Boolean(v))))throw Error('SSE business failure');
  const r=j.pageHelp;rows=j.result;total=r?.total;pages=r?.pageCount;current=r?.pageNo;
  if(!Array.isArray(r?.data)||JSON.stringify(r.data)!==JSON.stringify(rows))throw Error('SSE result envelope mismatch');
 }
 if(!Array.isArray(rows)||!Number.isInteger(total)||total<0||!Number.isInteger(pages)||pages<0||current!==page||pages>100||rows.length>100||pages!==Math.ceil(total/100))throw Error('Invalid pagination envelope');
 const items=rows.map(r=>{
  if(symbol==='sz159852'?String(r.product_id)!=='1779':r.SECURITY_CODE!==symbol.slice(2))throw Error('Wrong instrument identity');
  const title=r.title??r.TITLE,date=r.pub_date??r.SSEDATE,relative=r.attachment_url??r.URL;
  if(typeof title!=='string'||!title||!/^\d{4}-\d{2}-\d{2}$/.test(date)||typeof relative!=='string'||!relative)throw Error('Invalid announcement');
  const url=new URL(relative,symbol==='sz159852'?'https://www.jsfund.cn':'https://www.sse.com.cn').href;
  if(!['www.jsfund.cn','www.sse.com.cn'].includes(new URL(url).hostname))throw Error('Unexpected attachment host');
  return {symbol,title,date,url,announcementId:String(r.ad_id??url),classification:classify(title)};
 });if(new Set(items.map(i=>i.url)).size!==items.length||new Set(items.map(i=>i.announcementId)).size!==items.length)throw Error('Duplicate announcement in page');return {items,total,pages};
}
function assessment(asOfSession,coverage,priorEvents=[]){
 const failures=['Historical baseline not yet certified: cached H2 directories and registry require authoritative closure; no ready declaration permitted'];
 for(const s of SYMBOLS){const c=coverage.find(x=>x.symbol===s);if(!c?.complete)failures.push(s+': '+(c?.error||'missing official coverage'));}
 const events=[...priorEvents.filter(e=>e.status!=='resolved'),...coverage.flatMap(c=>(c.items||[]).filter(e=>e.classification==='rights_suspect').map(e=>({...e,status:'unknown',reason:'Full announcement and effective-date interpretation required'})))];
 return {schema:1,studyId:'forward-manager-paired-20261102-a',asOfSession,checkedAt:new Date().toISOString(),symbols:[...SYMBOLS],status:events.some(e=>e.status==='pending')?'pending_event':'unknown',events,evidenceHashes:coverage.flatMap(c=>(c.responses||[]).map(r=>r.bodyHash).filter(Boolean)),coverage,failures,meaning:'Only checked official evidence can establish no known pending event; future absence is never guaranteed.'};
}
async function collect(symbol,end,out,fetcher=fetch){
 const c={symbol,complete:false,from:'2026-10-24',to:end,responses:[],items:[]};let expected;const seenUrls=new Set(),seenIds=new Set();
 try{for(let page=1;page<=100;page++){
  const url=sourceUrl(symbol,page,end),r={url,page,requestStartedAt:new Date().toISOString()};c.responses.push(r);
  const response=await fetcher(url,{headers:{Referer:symbol==='sz159852'?'https://www.jsfund.cn/':'https://www.sse.com.cn/','User-Agent':'Mozilla/5.0'},signal:AbortSignal.timeout(20000),redirect:'error'});
  r.status=response.status;const body=Buffer.from(await response.arrayBuffer());r.receivedAt=new Date().toISOString();r.bodyHash=hash(body);r.file=path.join(out,symbol+'-page'+page+'.body');fs.writeFileSync(r.file,body);
  if(body.length>8*1024*1024)throw Error('Oversized source');if(!response.ok)throw Error('HTTP '+response.status);
  const p=parsePage(symbol,JSON.parse(body.toString('utf8')),page);
  if(expected!==undefined&&expected!==p.total)throw Error('Directory changed during pagination');expected=p.total;
  if(p.items.some(i=>i.date<'2026-10-24'||i.date>end))throw Error('Source ignored requested date window');
  for(const item of p.items){if(seenUrls.has(item.url)||seenIds.has(item.announcementId))throw Error('Duplicate announcement across pages');seenUrls.add(item.url);seenIds.add(item.announcementId);}c.items.push(...p.items);if(page>=p.pages){if(c.items.length!==p.total)throw Error('Incomplete pagination');c.complete=true;break;}
 }if(!c.complete)throw Error('Pagination limit');}catch(e){c.error=e.message;c.failedAt=new Date().toISOString();}return c;
}
async function run(end,out){
 const allowed=path.resolve('D:/techno/validation/daily-20261030/forward-event-watch-dev'),resolved=path.resolve(out);
 if(resolved!==allowed&&!resolved.startsWith(allowed+path.sep))throw Error('Development output only');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(end)||end<'2026-10-24'||end>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date()))throw Error('Invalid or future session');
 fs.mkdirSync(resolved,{recursive:true});const attempt=fs.mkdtempSync(path.join(resolved,'attempt-'));const coverage=[];
 for(const symbol of SYMBOLS){coverage.push(await collect(symbol,end,attempt));fs.writeFileSync(path.join(attempt,symbol+'-coverage.json'),JSON.stringify(coverage.at(-1),null,2));}
 const result=assessment(end,coverage);fs.writeFileSync(path.join(attempt,'assessment.dev.json'),JSON.stringify(result,null,2));return {attempt,status:result.status};
}
module.exports={SYMBOLS,classify,sourceUrl,parsePage,assessment,collect,run};
if(require.main===module)run(process.argv[2],process.argv[3]).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error(e.message);process.exitCode=1;});

