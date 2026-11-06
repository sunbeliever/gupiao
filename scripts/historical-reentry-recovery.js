'use strict';
// Explicit additional technical admission. Never substitutes for the exhausted v1 recovery grant.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),os=require('node:os'),{spawnSync,execFileSync}=require('node:child_process');
const S='D:/techno/validation/strategy-research/historical-reentry-ablation-20261102-a',R=S+'/runtime-v1',T=S+'/technical-recovery-20261106-a';
const X=require(R+'/common.cjs'),OLD='cbfdfe41ef9a8e88a647e2380a7d0bd2a508c31e8872359946689b2cab4560aa',IDS=['cooldown-1-normal','cooldown-5-normal'];
const hash=X.hash,read=X.read,write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2),{flag:'wx'}),LIMIT=18*60000;
function budget(now=new Date()){
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'}).formatToParts(now),n=k=>Number(parts.find(p=>p.type===k).value);
 const ms=((n('hour')*60+n('minute'))*60+n('second'))*1000+now.getUTCMilliseconds();
 if(ms>=560*60000&&ms<690*60000||ms>=780*60000&&ms<910*60000)return 0;
 return Math.min(LIMIT,(ms<560*60000?560*60000:ms<780*60000?780*60000:2000*60000)-ms);
}
function approve(expected){
 X.authorize(OLD);const bytes=fs.readFileSync(T+'/approval.json'),a=JSON.parse(bytes);
 if(!/^[a-f0-9]{64}$/.test(expected||'')||hash(bytes)!==expected||a.status!=='root_approved_additional_technical_attempts_once'||a.runnerSha256!==hash(fs.readFileSync(__filename))||a.protocolSha256!==X.PH||a.studySourceSha256!==X.SH||a.dataHash!==X.DH||a.runtimeManifestSha256!==X.verify()||a.childHeapMB!==192||a.initialFreeMB!==1536||a.childFreeMB!==1024||a.totalBudgetMs!==LIMIT||a.maximumAttemptsPerJob!==1||a.maximumPreflightChecks!==3||a.realOrdersAllowed!==false)throw Error('Additional technical admission missing or changed');
 if(!Array.isArray(a.jobs)||a.jobs.length!==2)throw Error('Only the two fixed incomplete paths are admitted');
 for(let i=0;i<2;i++){
  const j=a.jobs[i],id=IDS[i],prior=S+'/results/'+id+(i===0?'/attempt2':'');
  if(j.id!==id||j.attempt!==(i===0?3:2)||j.prior!==prior||j.output!==S+'/results/'+id+'/technical-recovery-20261106-a'||j.policyHash!==read(prior+'/claim.json').policyHash||j.policyHash!==X.A.hash(read(R+'/policy-normal.json')))throw Error('Technical path/policy changed');
  for(const name of ['claim','failure','progress'])if(hash(fs.readFileSync(prior+'/'+name+'.json'))!==j[name+'Sha256'])throw Error('Prior evidence changed: '+id+'/'+name);
  if(!read(prior+'/failure.json').error.startsWith('Error: Research free-memory threshold reached')||fs.existsSync(prior+'/result.json'))throw Error('Prior path is not the pinned resource-only failure');
 }
 if(hash(fs.readFileSync(S+'/partial-independent-arithmetic-20261102.json'))!==a.completedArithmeticSha256)throw Error('Completed arithmetic evidence changed');
 const completed=read(S+'/partial-independent-arithmetic-20261102.json');if(completed.completed!==4||completed.rows.length!==4)throw Error('Expected exactly four preserved completed paths');
 for(const row of completed.rows)if(hash(fs.readFileSync(S+'/results/'+row.id+'/result.json'))!==row.resultSha256)throw Error('Completed result changed: '+row.id);
 return a;
}
function environment(deadline){
 const command="$t=Get-ScheduledTask -TaskName 'Techno-Forward-Manager-Pair-v1','Techno-Autonomous-Research-v1'; if(@($t).Count -ne 2 -or @($t|Where-Object {$_.State -ne 'Disabled'}).Count){throw 'Automatic tasks must remain disabled'}; $p=Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object {$_.CommandLine -match 'paired-capital50k-20261021-pm-a|paired-lowcap-20261021-1000-b|runtime-v1[\\/](queue|worker)\\.cjs'}; if($p){throw 'Original collector or old historical worker still active'}; 'ready'";
 if(execFileSync('powershell.exe',['-NoProfile','-Command',command],{encoding:'utf8',windowsHide:true,timeout:Math.max(1,Math.min(30000,deadline-Date.now()))}).trim()!=='ready')throw Error('Original runtime not quiescent');
 if(fs.existsSync(S+'/history-queue.lock'))throw Error('Old queue lock exists; never adopt or delete it');
}
function guard(deadline,minimum){if(X.C.isTradingTime(Date.now())||budget()===0)throw Error('Continuous-market exclusion');if(Date.now()>deadline)throw Error('Shared technical budget expired');const free=os.freemem()/1048576;if(free<minimum)throw Error('Research free-memory threshold reached');return free;}
function worker(expected,id,deadline){
 const a=approve(expected),j=a.jobs.find(j=>j.id===id);if(!j||!Number.isFinite(deadline)||deadline>Date.now()+LIMIT)throw Error('Invalid child admission');
 const lease=read(T+'/recovery.lock'),attempt=read(T+'/run-attempt.json');if(lease.pid!==process.ppid||attempt.pid!==process.ppid||attempt.nonce!==lease.nonce||attempt.deadline!==deadline||attempt.approvalSha256!==expected)throw Error('Child requires its live approved parent lease');
 let minFree=guard(deadline,1536);if(fs.existsSync(j.output))throw Error('Attempt already exists; no retry');
 const inputBytes=fs.readFileSync('D:/techno/validation/strategy-research/covered-input-preparation-20261030-a/input.json');if(hash(inputBytes)!=='008859af575096cc67aba983caf4d3e20c00354142feb2d19e9a8d3f0da4c09b')throw Error('Input changed');
 const all=JSON.parse(inputBytes).data,data=Object.fromEntries(['raw','histories'].map(k=>[k,Object.fromEntries(Object.entries(all[k]).map(([s,rows])=>[s,rows.filter(r=>r.date<='2025-12-31')]))]));if(X.A.hash(data)!==X.DH)throw Error('Filtered input changed');
 const policy=read(R+'/policy-normal.json');minFree=Math.min(minFree,guard(deadline,1024));os.setPriority(0,os.constants.priority.PRIORITY_BELOW_NORMAL);fs.mkdirSync(j.output);
 write(j.output+'/claim.json',{id,attempt:j.attempt,startedAt:new Date().toISOString(),additionalTechnicalApprovalSha256:expected,protocolSha256:X.PH,sourceSha256:X.SH,dataHash:X.DH,policyHash:j.policyHash,policy,cooldownSessions:Number(id.split('-')[1]),originalAccountWrites:false});
 try{
  const run=require(R+'/source/scripts/historical-reentry-study.js').runReplay({data,policy,kind:'monitor_only',cooldownSessions:Number(id.split('-')[1]),deadlineMs:deadline,onProgress:p=>{minFree=Math.min(minFree,guard(deadline,1024));fs.writeFileSync(j.output+'/progress.json',JSON.stringify({...p,at:new Date().toISOString(),minimumObservedFreeMB:minFree}));}});
  minFree=Math.min(minFree,guard(deadline,1024));approve(expected);
  write(j.output+'/result.json',run);write(j.output+'/summary.json',run.summary);write(j.output+'/completion.json',{id,at:new Date().toISOString(),resultSha256:hash(fs.readFileSync(j.output+'/result.json')),summarySha256:hash(fs.readFileSync(j.output+'/summary.json')),parityVerified:run.parityVerified,minimumObservedFreeMB:minFree});
  console.log(JSON.stringify({id,status:'completed',net:run.summary.netPnl,dd:run.summary.maximumOpenCloseObservedDrawdown,fees:run.summary.feesPaid}));
 }catch(e){write(j.output+'/failure.json',{id,at:new Date().toISOString(),minimumObservedFreeMB:minFree,error:e.stack});throw e;}
}
function validateCompleted(dir,id,knownHash){
 const c=fs.existsSync(dir+'/completion.json')?read(dir+'/completion.json'):null,b=fs.readFileSync(dir+'/result.json'),v=JSON.parse(b),summary=read(dir+'/summary.json'),state=JSON.parse(JSON.stringify(v.session)),given=state.integrityHash;delete state.integrityHash;
 if(!knownHash&&!c)throw Error('Worker exited without completion: '+id);
 if(hash(b)!==(knownHash||c.resultSha256)||(c&&(c.id!==id||c.resultSha256!==hash(b)||c.summarySha256!==hash(fs.readFileSync(dir+'/summary.json'))||c.parityVerified!==true))||X.A.hash(state)!==given||v.parityVerified!==true||v.summary.finalStateHash!==given||X.A.hash(summary)!==X.A.hash(v.summary)||Math.abs(v.summary.netPnl-(v.session.account.equity-50000))>1e-6)throw Error('Completed path validation failed: '+id);
 return {id,resultDirectory:dir,...v.summary};
}
function comparison(a){
 const rows=[],incomplete=[],known=read(S+'/partial-independent-arithmetic-20261102.json').rows;for(const id of ['cooldown-0-normal','cooldown-1-normal','cooldown-5-normal','cooldown-0-double','cooldown-1-double','cooldown-5-double']){
  const job=a.jobs.find(j=>j.id===id),dir=job?job.output:S+'/results/'+id;
  if(job&&!fs.existsSync(dir+'/completion.json')){incomplete.push({id,dir,state:fs.existsSync(dir)?'failed_or_interrupted':'not_started'});continue;}
  rows.push(validateCompleted(dir,id,job?null:known.find(r=>r.id===id).resultSha256));
 }return {at:new Date().toISOString(),completed:rows.length,status:rows.length===6?'complete':'partial',incomplete,rows,exploratoryOnly:true,investmentReady:false,originalAccountWrites:false};
}
function parent(expected){
 const started=Date.now(),deadline=started+LIMIT,a=approve(expected);if(budget()<LIMIT)throw Error('Full 18-minute offline window required');
 if(fs.existsSync(T+'/run-attempt.json')){console.log(JSON.stringify({status:'already_attempted_no_retry',comparisonExists:fs.existsSync(T+'/comparison.json'),leaseStillPresent:fs.existsSync(T+'/recovery.lock')}));return;}
 const lock=T+'/recovery.lock',token={pid:process.pid,nonce:crypto.randomUUID()},fd=fs.openSync(lock,'wx');fs.writeFileSync(fd,JSON.stringify(token));fs.fsyncSync(fd);fs.closeSync(fd);
 const owns=()=>{const owner=read(lock);if(owner.pid!==token.pid||owner.nonce!==token.nonce)throw Error('Recovery lease changed');};
 let financialClaimed=false,preflight=0,samples=[];
 try{
  preflight=fs.readdirSync(T).filter(n=>/^preflight-\d+\.json$/.test(n)).length+1;if(preflight>a.maximumPreflightChecks)throw Error('Bounded preflight checks exhausted');
  write(T+'/preflight-'+preflight+'.json',{at:new Date().toISOString(),approvalSha256:expected,deadline,noFinancialClaim:true});
  environment(deadline);guard(deadline,1536);if(budget()<deadline-Date.now())throw Error('Offline window no longer covers fixed deadline');
  os.setPriority(0,os.constants.priority.PRIORITY_BELOW_NORMAL);
  for(let n=0;n<3;n++){samples.push({at:new Date().toISOString(),freeMB:guard(deadline,1536)});if(n<2)Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,15000);}
  write(T+'/preflight-ready-'+preflight+'.json',{deadline,samples});
  write(T+'/run-attempt.json',{at:new Date().toISOString(),approvalSha256:expected,deadline,pid:process.pid,nonce:token.nonce,minimumPreflightFreeMB:Math.min(...samples.map(s=>s.freeMB))});financialClaimed=true;
  for(const j of a.jobs){owns();environment(deadline);guard(deadline,1536);if(budget()<deadline-Date.now())throw Error('Offline window no longer covers child deadline');if(deadline-Date.now()<30000)break;if(fs.existsSync(j.output))throw Error('Job already claimed; never rerun');
   const child=spawnSync(process.execPath,['--max-old-space-size=192',__filename,'--worker',expected,j.id,String(deadline)],{cwd:T,windowsHide:true,encoding:'utf8',timeout:deadline-Date.now(),maxBuffer:1024*1024});
   fs.appendFileSync(T+'/child.log',JSON.stringify({id:j.id,at:new Date().toISOString(),exitCode:child.status,stdout:child.stdout,stderr:child.stderr,error:child.error?.message})+'\n');
   if(child.error||child.status!==0)break;
   validateCompleted(j.output,j.id,null);
  }
  owns();if(Date.now()>deadline)write(T+'/budget-expired.json',{at:new Date().toISOString(),status:'partial_budget_expired',furtherAttemptsAuthorized:false});else write(T+'/comparison.json',comparison(a));
 }catch(e){write(T+(financialClaimed?'/parent-failure.json':'/preflight-failure-'+preflight+'.json'),{at:new Date().toISOString(),financialClaimed,samples,freeMBAtFailure:os.freemem()/1048576,error:e.stack});throw e;}finally{owns();fs.unlinkSync(lock);}
}
try{if(process.argv[2]==='--probe'){X.authorize(OLD);const r=X.readiness(),b=budget();console.log(JSON.stringify({...r,ready:r.ready&&b===LIMIT,offlineBudgetMs:b,noClaims:true,additionalAdmissionChecked:false}));}else if(process.argv[2]==='--run')parent(process.argv[3]);else if(process.argv[2]==='--worker')worker(process.argv[3],process.argv[4],Number(process.argv[5]));else throw Error('Use --probe, or --run with the new separately approved SHA');}catch(e){console.error(e.stack);process.exitCode=1;}
