'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm'),{createRequire}=require('node:module');
const A=require('../assets/audit-identity.js'),Calendar=require('../assets/trading-calendar.js'),Fee=require('../assets/fee-profile.js'),Study=require('../scripts/decision-account-study.js'),Experiment=require('../scripts/decision-account-experiment.js'),Rolling=require('../scripts/rolling-account-research.js');
const TEST_ROOT='D:/techno/validation/decision-account-experiment-tests',SYMBOLS=['sh512720','sh512760','sh515070','sh515880','sh588000','sz159852'],KIND='decision_thesis';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const write=(file,value)=>fs.writeFileSync(file,JSON.stringify(value));
function fixture(){
 const dates=[];for(let date='2024-09-02';date<='2025-01-06';date=Calendar.nextSession(date))dates.push(date);
 const histories={},raw={};
 SYMBOLS.forEach((symbol,j)=>{
  histories[symbol]=dates.map((date,i)=>{const close=100+(j+1)*.03*i+(i%2?.01:-.01);return{date,open:close,high:close*1.01,low:close*.99,close,volume:10000};});
  raw[symbol]=dates.map(date=>({date,open:1,high:1.01,low:.99,close:1,volume:10000}));
 });
 return {data:{histories,raw},policy:{id:'synthetic-decision-experiment',start:'2025-01-03',end:'2025-01-06',signalStart:'2025-01-02',signalEnd:'2025-01-03',trainCutoff:'2024-12-31',budget:50000,horizon:20,allocationMode:'full',universe:SYMBOLS.map(symbol=>({symbol,name:symbol,type:'etf',sector:'synthetic-technology'})),investableLimit:12500,maxExposure:.25,maxPositions:3,maxThemeWeight:1,riskLimits:{investableLimit:12500,maxExposure:.25,maxPositions:3,maxThemeWeight:1},stopLossRate:.04,targetExitEnabled:false,minEstimatedNetReturn:.01,corporateEvents:[],feeProfile:Fee.resolve()}};
}
function workspace(t){
 fs.mkdirSync(TEST_ROOT,{recursive:true});
 const root=fs.realpathSync(TEST_ROOT),directory=fs.mkdtempSync(path.join(root,'case-')),state={directory,passed:false};
 t.after(()=>{
  if(!state.passed){t.diagnostic('Failed synthetic fixture retained: '+directory);return;}
  const resolved=fs.realpathSync(directory),boundary=root.toLowerCase()+path.sep;
  assert.ok(resolved.toLowerCase().startsWith(boundary),'cleanup must remain inside the explicit synthetic test root');
  assert.equal(path.dirname(resolved).toLowerCase(),root.toLowerCase(),'cleanup target must be an immediate synthetic child');
  fs.rmSync(resolved,{recursive:true,force:false});
 });
 return state;
}
function declared(t){
 const state=workspace(t),f=fixture(),base=path.join(state.directory,'synthetic-baseline-declared-only'),protocolDirectory=path.join(state.directory,'synthetic-protocol'),directory=path.join(state.directory,'decision');
 fs.mkdirSync(base);fs.mkdirSync(protocolDirectory);write(base+'/policy.json',f.policy);write(base+'/data.json',f.data);
 const baseline={schema:1,id:'synthetic-baseline-no-six-path-results',paths:Rolling.PATHS,sourceHashes:{},files:Object.fromEntries(['policy.json','data.json'].map(name=>[name,sha(fs.readFileSync(base+'/'+name))]))};
 write(base+'/manifest.json',baseline);
 const protocol={schema:1,id:'synthetic-decision-protocol',candidateId:'trend-relative20-risk-v1',paths:Study.KINDS,policy:f.policy,baselineStudy:{directory:base,manifestHash:A.hash(baseline)},riskScreen:{promotionAllowed:false,maxDrawdownAmount:500,maxDrawdownProportion:.01}};
 write(protocolDirectory+'/policy.json',protocol);write(protocolDirectory+'/protocol.claim',{policyHash:A.hash(protocol)});
 const manifest=Experiment.declare(directory,protocolDirectory);
 return {...f,state,directory,base,protocolDirectory,manifest,expected:A.hash(manifest)};
}
let cachedResult;
function resultFor(f){
 if(!cachedResult)cachedResult=Study.runReplay({data:f.data,policy:f.policy,kind:KIND,deadlineMs:Date.now()+30000});
 return structuredClone(cachedResult);
}
function saveResult(f,result=resultFor(f)){
 const claim={path:KIND,manifestHash:f.expected,at:'2026-10-26T07:00:00.000Z'},out={path:KIND,manifestHash:f.expected,resultHash:A.hash(result),result};
 write(f.directory+'/'+KIND+'.claim',claim);write(f.directory+'/'+KIND+'.json',out);return out;
}
function frozenModuleAfterHours(file){
 const RealDate=Date;
 class AfterHoursDate extends RealDate{constructor(...args){super(...(args.length?args:['2026-10-26T13:00:00.000Z']));}static now(){return RealDate.parse('2026-10-26T13:00:00.000Z');}}
 const box={module:{exports:{}},require:createRequire(file),__filename:file,__dirname:path.dirname(file),Date:AfterHoursDate,process,console,Buffer,setTimeout,clearTimeout};
 vm.runInNewContext(fs.readFileSync(file,'utf8'),box,{filename:file});
 return box.module.exports;
}
test('decision declaration binds manifest and protocol claim and refuses redeclaration',t=>{
 const f=declared(t);
 assert.equal(Experiment.verify(f.directory,f.expected).id,path.basename(f.directory));
 assert.equal(f.manifest.promotionAllowed,false);
 assert.throws(()=>Experiment.declare(f.directory,f.protocolDirectory),/already declared/);
 assert.throws(()=>Experiment.verify(f.directory,'b'.repeat(64)),/manifest|identity|changed/i);
 write(f.directory+'/protocol.claim',{policyHash:'b'.repeat(64)});
 assert.throws(()=>Experiment.verify(f.directory,f.expected),/changed|binding|protocol/i);
 f.state.passed=true;
});
test('decision result rejects summary tampering even after an attacker recomputes resultHash',t=>{
 const f=declared(t),out=saveResult(f);
 assert.equal(Experiment.loadPath(f.directory,f.expected,KIND).result.session.integrityHash,out.result.session.integrityHash);
 out.result.summary.netPnl+=100;out.resultHash=A.hash(out.result);write(f.directory+'/'+KIND+'.json',out);
 assert.throws(()=>Experiment.loadPath(f.directory,f.expected,KIND),/financial result binding mismatch/);
 f.state.passed=true;
});
test('decision result and claim remain bound to the exact path and declared manifest',t=>{
 const f=declared(t),out=saveResult(f);
 write(f.directory+'/'+KIND+'.claim',{path:KIND,manifestHash:'b'.repeat(64)});
 assert.throws(()=>Experiment.loadPath(f.directory,f.expected,KIND),/claim hash mismatch/);
 write(f.directory+'/'+KIND+'.claim',{path:KIND,manifestHash:f.expected});
 out.manifestHash='b'.repeat(64);write(f.directory+'/'+KIND+'.json',out);
 assert.throws(()=>Experiment.loadPath(f.directory,f.expected,KIND),/claim hash mismatch/);
 assert.throws(()=>Experiment.loadPath(f.directory,f.expected,'unknown-path'),/Unknown decision path/);
 f.state.passed=true;
});
test('unfinished original six-path comparison blocks both baseline access and new strategy comparison',t=>{
 const f=declared(t);
 assert.equal(fs.existsSync(f.base+'/comparison.json'),false);
 assert.throws(()=>Experiment.baselineComparison(f.directory,f.expected),/Original six-path comparison must complete first/);
 assert.throws(()=>Experiment.compare(f.directory,f.expected),/Original six-path comparison must complete first/);
 assert.equal(fs.existsSync(f.directory+'/comparison.json'),false);
 f.state.passed=true;
});
test('completed frozen decision run is immutable before baseline replay and cannot acquire a new lease',t=>{
 const f=declared(t);saveResult(f);
 const runner=frozenModuleAfterHours(path.join(f.directory,'source/scripts/decision-account-experiment.js'));
 const before=fs.readFileSync(f.directory+'/'+KIND+'.json');
 assert.throws(()=>runner.run(f.directory,f.expected,KIND,false),/Completed decision result immutable/);
 assert.throws(()=>runner.run(f.directory,f.expected,KIND,true),/Completed decision result immutable/);
 assert.deepEqual(fs.readFileSync(f.directory+'/'+KIND+'.json'),before);
 assert.ok(!fs.readdirSync(f.directory).some(name=>/lease/i.test(name)));
 assert.equal(fs.existsSync(f.base+'/comparison.json'),false);
 f.state.passed=true;
});

test('full observed risk metrics cannot be reduced by changing the summary and recomputing outer resultHash',t=>{
 const f=declared(t),out=saveResult(f);
 assert.ok(out.result.summary.maximumOpenCloseObservedDrawdown>0,'fixture must contain real observed trading costs');
 assert.equal(Experiment.loadPath(f.directory,f.expected,KIND).resultHash,out.resultHash);
 out.result.summary.maximumOpenCloseObservedDrawdown=0;out.result.summary.maximumOpenCloseObservedDrawdownProportion=0;
 out.resultHash=A.hash(out.result);write(f.directory+'/'+KIND+'.json',out);
 assert.throws(()=>Experiment.loadPath(f.directory,f.expected,KIND),/risk|financial|observation|drawdown/i);
 f.state.passed=true;
});
