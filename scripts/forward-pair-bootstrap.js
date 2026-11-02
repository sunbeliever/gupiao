'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process'),C=require('../assets/trading-calendar.js');
const STUDY='D:/techno/validation/strategy-research/forward-manager-paired-20261102-a';
function admitBootstrap(at,protocol,freeMB,locked){const now=typeof at==='number'?at:Date.parse(at);if(!Number.isFinite(now))return {start:false,reason:'invalid_clock'};let day;try{day=C.sessionOf(now);}catch{return {start:false,reason:'outside_known_calendar'};}const minute=(new Date(now).getUTCHours()*60+new Date(now).getUTCMinutes()+480)%1440;
 if(!protocol.knownSessions.includes(day)||minute<560||minute>=910)return {start:false,reason:'outside_registered_watch_window'};
 if(!Number.isFinite(freeMB)||freeMB<protocol.resources.minimumFreeMB)return {start:false,reason:'insufficient_free_memory'};
 if(locked)return {start:false,reason:'existing_consumer_lock_requires_owner_review'};
 return {start:true,day,until:day+'T07:10:00.000Z'};
}
function run(){const root=path.resolve(__dirname,'..'),Consumer=require('./forward-pair-consumer.js'),{protocol,activation}=Consumer.verifyRelease(root),admission=admitBootstrap(Date.now(),protocol,os.freemem()/1048576,fs.existsSync(path.join(STUDY,activation.sourceBindingHash?'consumer-source-bound.lock':'consumer.lock')));if(!admission.start)return admission;
 const log=path.join(STUDY,'consumer-stdout.log'),err=path.join(STUDY,'consumer-stderr.log'),stdout=fs.openSync(log,'a'),stderr=fs.openSync(err,'a');let child;
 try{child=spawn(process.execPath,['--max-old-space-size='+protocol.resources.maxHeapMB,path.join(__dirname,'forward-pair-consumer.js'),'--watch',admission.until],{cwd:root,detached:true,windowsHide:true,stdio:['ignore',stdout,stderr]});}finally{fs.closeSync(stdout);fs.closeSync(stderr);}
 if(!Number.isSafeInteger(child.pid))throw Error('Consumer child did not start');try{os.setPriority(child.pid,os.constants.priority.PRIORITY_BELOW_NORMAL);}catch(error){child.kill();throw Error('Unable to enforce registered process priority: '+error.message);}child.unref();return {start:true,pid:child.pid,until:admission.until,realOrdersAllowed:false};
}
module.exports={admitBootstrap,run};
if(require.main===module){try{console.log(JSON.stringify(run()));}catch(error){console.error(error.message);process.exitCode=1;}}
