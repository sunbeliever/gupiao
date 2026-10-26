'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),{promisify}=require('node:util');
const Calendar=require('../assets/trading-calendar.js'),Audit=require('../assets/audit-identity.js');
const BASE='D:/techno/validation/forward-comparison',OPS='D:/techno/validation/operations/guardian';
const TARGETS=Object.freeze(['paired-capital50k-20261021-pm-a','paired-lowcap-20261021-1000-b'].map(id=>Object.freeze({id,root:BASE+'/'+id,script:BASE+'/'+id+'/source/scripts/paired-forward-monitor.js'})));
const canonical=s=>String(s).replace(/\\/g,'/').replace(/\/$/,'').toLowerCase();
function matches(row,target){if(!Number.isSafeInteger(row?.pid)||row.pid<=0||typeof row.commandLine!=='string')return false;const tokens=(row.commandLine.match(/"[^"]*"|[^\s"]+/g)||[]).map(s=>s.replace(/^"|"$/g,''));const at=tokens.indexOf('--directory');return tokens.some(s=>canonical(s)===canonical(target.script))&&at>=0&&canonical(tokens[at+1])===canonical(target.root);}
async function processes(){const command="Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress";const {stdout}=await promisify(cp.execFile)('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,timeout:20000,maxBuffer:1024*1024});if(!stdout.trim())throw Error('Empty CIM response');const parsed=JSON.parse(stdout),rows=(Array.isArray(parsed)?parsed:[parsed]).map(p=>({pid:p.ProcessId,commandLine:p.CommandLine}));if(rows.some(p=>!Number.isSafeInteger(p.pid)||p.pid<=0||typeof p.commandLine!=='string')||!rows.some(p=>p.pid===process.pid))throw Error('Incomplete CIM process snapshot');return rows;}
function windowAt(now){const local=new Date(now+8*3600000).toISOString(),day=local.slice(0,10),minute=Number(local.slice(11,13))*60+Number(local.slice(14,16));return Calendar.isSession(day)&&minute>=560&&minute<970?{day,until:day+'T16:10:00+08:00'}:null;}
function defaultStore(io=fs){io.mkdirSync(OPS,{recursive:true});const lockFile=path.join(OPS,'guardian.lock'),stateFile=path.join(OPS,'guardian-state.json');let fd;return{
 async lock(context){try{fd=io.openSync(lockFile,'wx');}catch(e){if(e.code==='EEXIST')return false;throw e;}io.writeSync(fd,JSON.stringify({pid:process.pid,at:new Date(context.now).toISOString()}));return true;},
 unlock(){if(fd!==undefined){io.closeSync(fd);fd=undefined;io.rmSync(lockFile,{force:true});}},
 read(){if(!io.existsSync(stateFile))return {launches:{}};const state=JSON.parse(io.readFileSync(stateFile,'utf8'));if(!state||typeof state.launches!=='object'||Array.isArray(state.launches))throw Error('Guardian state invalid');return state;},
 write(state){const tmp=stateFile+'.'+process.pid+'.tmp';io.writeFileSync(tmp,JSON.stringify(state,null,2));io.renameSync(tmp,stateFile);},
 logs(id){const stamp=new Date().toISOString().replace(/[:.]/g,'-'),out=io.openSync(path.join(OPS,id+'-'+stamp+'.stdout.log'),'a'),err=io.openSync(path.join(OPS,id+'-'+stamp+'.stderr.log'),'a');return{out,err,close(){io.closeSync(out);io.closeSync(err);}};},
 event(e){io.appendFileSync(path.join(OPS,'guardian-events.jsonl'),JSON.stringify(e)+'\n');}
};}
async function validate(target){const Driver=require(target.script),manifest=Driver.validateFrozen(target.root),claim=JSON.parse(fs.readFileSync(path.join(target.root,'experiment.claim'),'utf8')),hash=Audit.hash(manifest);if(manifest.id!==target.id||claim.id!==target.id||claim.collectorManifestHash!==hash||claim.protocolHash!==Audit.hash(manifest.protocol))throw Error('Original claim/manifest mismatch');return{manifestHash:hash};}
async function guardInternal(deps={}){
 const clock=deps.clock||Date.now,query=deps.processes||processes,memory=deps.memory||(()=>os.freemem()/1048576),check=deps.validate||validate,spawn=deps.spawn||cp.spawn,store=deps.store||defaultStore(),now=clock(),window=windowAt(now);
 if(!window)return {status:'outside_window',accounts:[]};
 let rows;const get=async()=>{const found=await query();if(!Array.isArray(found)||found.some(p=>!Number.isSafeInteger(p?.pid)||typeof p.commandLine!=='string'))throw Error('Invalid process query');return found;};
 try{rows=await get();}catch(e){return{status:'query_failed',accounts:[],reason:e.message};}
 let locked=false;try{locked=await store.lock({now,rows,confirm:get});if(!locked)return{status:'guardian_busy',accounts:[],reason:'Existing guardian lock retained; a possible orphan requires inspection, never automatic deletion'};const state=store.read(),results=[];let reserved=0;
 for(const target of TARGETS){
  const active=rows.filter(p=>matches(p,target));if(active.length){results.push({id:target.id,status:'reused',pids:active.map(p=>p.pid)});continue;}
  const recent=state.launches[target.id];if(recent&&Number.isFinite(Date.parse(recent.at))&&now-Date.parse(recent.at)<600000){results.push({id:target.id,status:'startup_grace',pid:recent.pid||null});continue;}
  const free=memory();if(!Number.isFinite(free)||free-reserved<1280){results.push({id:target.id,status:'memory_blocked',freeMB:Number.isFinite(free)?free:null});continue;}
  let frozen;try{frozen=await check(target);}catch(e){results.push({id:target.id,status:'validation_failed',reason:e.message});continue;}
  try{rows=await get();}catch(e){return{status:'query_failed',accounts:results,reason:e.message};}
  if(rows.some(p=>matches(p,target))){results.push({id:target.id,status:'reused'});continue;}
  const spawnFree=memory();if(!Number.isFinite(spawnFree)||spawnFree-reserved<1280){results.push({id:target.id,status:'memory_blocked',freeMB:Number.isFinite(spawnFree)?spawnFree:null});continue;}const freshWindow=windowAt(clock());if(!freshWindow||freshWindow.day!==window.day){results.push({id:target.id,status:'outside_window'});continue;}
  const args=['--max-old-space-size=512',target.script,'--resume','--directory',target.root,'--until',window.until],metadata={at:new Date(clock()).toISOString(),status:'launch_pending',script:target.script,root:target.root,args,manifestHash:frozen.manifestHash};
  state.launches[target.id]=metadata;store.write(state);const logs=store.logs(target.id);let child;
  try{child=spawn(process.execPath,args,{detached:true,windowsHide:true,cwd:target.root,stdio:['ignore',logs.out,logs.err]});if(typeof child.on==='function')child.on('error',e=>{try{store.event({id:target.id,status:'spawn_error',at:new Date().toISOString(),reason:e.message});}catch{}});if(!Number.isSafeInteger(child.pid)||child.pid<=0)throw Error('Resume spawn returned no PID');metadata.pid=child.pid;metadata.status='spawned';child.unref();reserved+=512;store.write(state);results.push({id:target.id,status:'spawned',pid:child.pid});}catch(e){metadata.status='spawn_failed';metadata.reason=e.message;store.write(state);results.push({id:target.id,status:'spawn_failed',reason:e.message});}finally{logs.close();}
 }
 const result={status:'checked',at:new Date(now).toISOString(),accounts:results};store.event(result);return result;
 }catch(e){return{status:'guardian_failed',accounts:[],reason:e.message};}finally{if(locked)store.unlock();}
}
async function guard(deps={}){try{return await guardInternal(deps);}catch(e){return{status:'guardian_failed',accounts:[],reason:e.message};}}
if(require.main===module)guard().then(r=>process.stdout.write(JSON.stringify(r)+'\n')).catch(e=>{process.stderr.write(e.message+'\n');process.exitCode=1;});
module.exports={TARGETS,matches,windowAt,guard,createStore:defaultStore};
