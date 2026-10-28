'use strict';
const fs=require('node:fs'),path=require('node:path');
const LIMIT=65536;
// Only the mutable display snapshot is projected. Immutable job results and
// the dedicated comparison sections keep their original values and hashes.
function encode(summary){
  if(!summary||summary.schema!==1||!Array.isArray(summary.jobs))throw Error('Invalid research summary');
  const jobs=summary.jobs.map(job=>{
    if(!job?.result||Buffer.byteLength(JSON.stringify(job.result),'utf8')<=2048)return job;
    const source=job.result,result={};
    for(const key of ['id','path','kind','resultHash','netPnl','feesPaid','parityVerified','investmentReady','promoted','actualNetPnl','conditionalNetPnl'])if(Object.hasOwn(source,key))result[key]=source[key];
    if(typeof source.error==='string')result.error=source.error.slice(0,1200);
    if(Array.isArray(source.series))result.series=source.series.map(r=>({symbol:r.symbol,adjustment:r.adjustment,count:r.count,start:r.start,end:r.end}));
    return {...job,result,resultStoredSeparately:true};
  });
  const bytes=JSON.stringify({...summary,jobs});
  if(Buffer.byteLength(bytes,'utf8')>LIMIT)throw Error('Research display summary exceeds 64KB; previous snapshot preserved');
  return bytes;
}
function publish(file,summary){
  const bytes=encode(summary);
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const tmp=file+'.'+process.pid+'.pending',fd=fs.openSync(tmp,'w');
  try{fs.writeFileSync(fd,bytes,'utf8');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  fs.renameSync(tmp,file);
  return {bytes:Buffer.byteLength(bytes,'utf8')};
}
module.exports={encode,publish};
