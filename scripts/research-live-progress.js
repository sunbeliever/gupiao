'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{DatabaseSync}=require('node:sqlite'),Audit=require('../assets/audit-identity.js'),Calendar=require('../assets/trading-calendar.js');
const paths=new Set(['rolling_ridge','rolling_mean','frozen_f0','fixed_three','fixed_single','cash','decision_thesis','true_buy_hold_three']);
function regular(file,limit){const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.size>limit)throw Error('Untrusted or oversized live progress file');}
function canonical(directory){const resolved=path.resolve(directory),stat=fs.lstatSync(resolved);if(!stat.isDirectory()||stat.isSymbolicLink()||path.resolve(fs.realpathSync(resolved)).toLowerCase()!==resolved.toLowerCase())throw Error('Untrusted live progress directory');return resolved;}
function progress(root,payload,now){
 const base=canonical(path.resolve(root,'../strategy-research')),directory=canonical(payload.directory);
 if(path.dirname(directory).toLowerCase()!==base.toLowerCase()||!/^[a-z0-9][a-z0-9_-]{0,100}$/.test(path.basename(directory))||!paths.has(payload.path)||!/^[a-f0-9]{64}$/.test(payload.manifestHash||''))throw Error('Unregistered progress path');
 regular(directory+'/manifest.json',65536);const m=JSON.parse(fs.readFileSync(directory+'/manifest.json'));
 regular(directory+'/'+payload.path+'.claim',4096);const c=JSON.parse(fs.readFileSync(directory+'/'+payload.path+'.claim'));
 if(Audit.hash(m)!==payload.manifestHash||c.manifestHash!==payload.manifestHash||c.path!==payload.path)throw Error('Live progress declaration mismatch');
 const file=directory+'/'+payload.path+'-progress.json';if(!fs.existsSync(file))return null;regular(file,4096);const p=JSON.parse(fs.readFileSync(file)),at=Date.parse(p.at);
 if(!Number.isFinite(at)||at>now||!Number.isSafeInteger(p.sessions)||p.sessions<1||p.sessions>10000||!Calendar.isSession(p.date))throw Error('Invalid progress time/count/date');
 const policyFile=directory+'/policy.json';regular(policyFile,65536);
 const policyBytes=fs.readFileSync(policyFile),policy=JSON.parse(policyBytes);
 if(!m.files||typeof m.files['policy.json']!=='string'||crypto.createHash('sha256').update(policyBytes).digest('hex')!==m.files['policy.json'])throw Error('Unbound live progress policy');
 if(!Calendar.isSession(policy.start)||!Calendar.isSession(policy.end)||policy.start>policy.end||p.date<policy.start||p.date>policy.end||p.date>Calendar.expectedCompletedSession(at)||p.date>Calendar.expectedCompletedSession(now))throw Error('Progress outside completed protocol interval');
 let expected=0;for(let d=policy.start;d<=p.date;d=Calendar.nextSession(d)){if(++expected>10000)throw Error('Progress interval too large');}
 if(p.sessions!==expected)throw Error('Progress session count does not match date');
 return{at:p.at,sessions:p.sessions,date:p.date,stale:now-at>5*60000};
}
function alive(pid){if(!Number.isSafeInteger(pid)||pid<=0)return'not_observed';try{process.kill(pid,0);return'active';}catch(e){return e.code==='EPERM'?'unknown':'not_observed';}}
function read(root,now=Date.now()){let db;try{
 const nowMs=Number(now);if(!Number.isFinite(nowMs))throw Error('Invalid live clock');root=canonical(root);const file=root+'/research.sqlite';regular(file,64*1024*1024);
 db=new DatabaseSync(file,{readOnly:true});db.exec('PRAGMA query_only = ON; PRAGMA busy_timeout=100');
 const rows=db.prepare("SELECT id,kind,payload,status,attempts,pid,updatedAt FROM jobs WHERE kind IN ('account_study','decision_study') ORDER BY rowid DESC LIMIT 20").all();
 const jobs=rows.map(j=>{
  if(!/^[a-z0-9][a-z0-9-]{0,100}$/.test(j.id)||!['queued','running','completed','failed','blocked'].includes(j.status)||typeof j.payload!=='string'||j.payload.length>4096||!Number.isSafeInteger(j.attempts)||j.attempts<0||!Number.isFinite(Date.parse(j.updatedAt))||Date.parse(j.updatedAt)>nowMs)throw Error('Invalid live job metadata');
  const out={id:j.id,kind:j.kind,status:j.status,attempts:j.attempts,updatedAt:j.updatedAt,reason:j.status==='queued'?'已排队，等待前置结果、调度优先级或资源条件':'',progress:null,progressUnavailable:false};
  if(j.status==='running'){out.writerStatus=alive(j.pid);out.reason=out.writerStatus==='active'?'实际写入进程仍在运行；尚未形成完整策略结论':out.writerStatus==='unknown'?'无法确认进程权限；不将进度视为已完成':'未观察到原写入进程，等待调度安全恢复';try{out.progress=progress(root,JSON.parse(j.payload),nowMs);}catch(e){out.progressUnavailable=true;out.reason+='；进度文件暂不可核验';}}
  return out;
 });return{available:true,checkedAt:new Date(nowMs).toISOString(),readOnly:true,jobs};
}catch(e){return{available:false,checkedAt:new Date(Number.isFinite(Number(now))?Number(now):Date.now()).toISOString(),message:'实时研究进度暂不可核验；下列摘要仅代表上次完成记录，不代表当前执行状态',jobs:[]};}finally{if(db)db.close();}}
module.exports={read};
