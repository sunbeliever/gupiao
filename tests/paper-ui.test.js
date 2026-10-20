'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function harness(state,refreshResult,options={}){
 const elements={},buttons={};let starts=0,refreshes=0,predictCalls=0,lastInput,lastContext;
 const page={querySelector:()=>({insertAdjacentElement:(_,node)=>{elements[node.id]=node;}}),prepend:node=>{elements[node.id]=node;}};
 elements['page-model']=page;
 const doc={getElementById:id=>elements[id],createElement:()=>({remove(){delete elements[this.id];},querySelector:selector=>buttons[selector]||(buttons[selector]={}),querySelectorAll:()=>[]})};
 const Market={UNIVERSE:options.universe||[],readState:()=>options.readState||{status:options.savedSession?'valid':'missing',value:options.savedSession||null},read:key=>key==='paper.continuous.current'?options.savedSession||null:null,write:()=>true,quotes:async()=>options.quotes||{},validateHistoryPool:()=>options.dataHealth||{ok:true,expectedAsOf:'2026-10-19',rows:[]},isStale:q=>!q||!!q.stale,setBackground(){}};
 const make=input=>{starts++;lastInput=input;return{account:{holdings:[]}};};
 const context={document:doc,Date,console,Market,Analysis:{predict:(_,bars,options)=>{predictCalls++;return {asOf:bars.at(-1)?.date||null,...options};}},AuditIdentity:require('../assets/audit-identity.js'),ForecastJournal:{create:()=>({refresh:()=>({saved:true}),summary:()=>({total:0,pending:0,scored:0,excluded:0}),records:()=>[]})},Paper:{plan:()=>({rows:[],selected:[]}),start:make,startContinuous:make,resume:x=>x,stepAuto:(x,q,now,ctx)=>{lastContext=ctx;return x;},observe:x=>x},window:{TechScopeUI:{switchTab(){},refresh:async()=>{refreshes++;return refreshResult;}}}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../assets/assurance-ui.js'),'utf8'),context);context.window.ResearchUI.render(state);
 return {setPreset:value=>buttons['#paper-preset'].onchange.call({value}),render:()=>context.window.ResearchUI.render(state),lastContext:()=>lastContext,click:async()=>{buttons['#start-paper'].onclick();await new Promise(resolve=>setImmediate(resolve));},clickAuto:async()=>{buttons['#start-auto-paper'].onclick();await new Promise(resolve=>setImmediate(resolve));},counts:()=>({starts,refreshes,predictCalls}),input:()=>lastInput};
}
const state=extra=>({initialized:true,tab:'model',reports:{},predictions:{},histories:{},quotes:{},model:{},busy:false,training:false,evaluating:false,...extra});
test('paper actions cannot bypass an existing sync, training or backtest',async()=>{for(const key of ['busy','training','evaluating']){const h=harness(state({[key]:true}),true);await h.click();assert.equal(h.counts().starts,0);assert.equal(h.counts().refreshes,0);}});
test('unsuccessful refresh does not create a paper portfolio from stale predictions',async()=>{const h=harness(state(),false);await h.click();assert.equal(h.counts().refreshes,1);assert.equal(h.counts().starts,0);});

test('new UI simulation keeps ten-thousand account capital while limiting investment separately',async()=>{const h=harness(state(),true);await h.click();const i=h.input();assert.equal(i.budget,10000);assert.equal(i.profile,'beginner');assert.equal(i.positionLimit,10000);assert.equal(i.allocationMode,'full');assert.equal(i.minFee,5);});

test('missing research-pool quotes cannot be recorded as a successful cash choice',async()=>{const h=harness(state(),true,{universe:[{symbol:'sh588000'},{symbol:'sh512760'}],quotes:{sh588000:{price:1.4}}});await h.click();assert.equal(h.counts().refreshes,1);assert.equal(h.counts().starts,0);});

test('a jointly stale historical pool is rejected before any new simulated account is created',async()=>{const h=harness(state(),true,{dataHealth:{ok:false,expectedAsOf:'2026-10-19',rows:[{dataAsOf:'2026-10-16'}],reason:'history_pool_incomplete'}});await h.click();assert.equal(h.counts().starts,0);});
test('corrupt or unreadable persisted account blocks capital recreation before refresh or writes',async()=>{for(const status of ['corrupt','read_failure']){const h=harness(state(),true,{readState:{status,value:null,error:'retained corrupt bytes'}});await h.click();assert.equal(h.counts().starts,0);assert.equal(h.counts().refreshes,0);}});
test('opening a new engineering observation reuses the persisted account instead of minting fresh capital',async()=>{const Paper=require('../assets/paper-engine.js'),universe=[{symbol:'sh588000',name:'fixture ETF',type:'etf'}],quotes={sh588000:{price:1,open:1,sourceTime:'2026-10-20 09:30:00'}},saved=Paper.startAuto({universe,quotes,predictions:{sh588000:{asOf:'2026-10-19',eligible:true,expectedReturn:.1}},model:{version:'fixture'},budget:10000,allocationMode:'full',now:'2026-10-20T01:30:00Z'}),h=harness(state(),true,{savedSession:saved,universe,quotes});await h.click();assert.equal(h.counts().starts,0);});
test('quote-only refreshes reuse the first prediction publication until model or closed history changes',()=>{const Paper=require('../assets/paper-engine.js'),universe=[{symbol:'sh588000',name:'fixture ETF',type:'etf'}],quotes={sh588000:{price:1,open:1,sourceTime:'2026-10-20 09:30:00'}},saved=Paper.startAuto({universe,quotes,predictions:{sh588000:{asOf:'2026-10-19',eligible:true,expectedReturn:.1}},model:{version:'fixture'},budget:10000,allocationMode:'full',now:'2026-10-20T01:30:00Z'}),s=state({histories:{sh588000:[{date:'2026-10-19'}]}}),h=harness(s,true,{savedSession:saved,universe,quotes});const first=h.lastContext().predictions;for(let n=0;n<20;n++){s.quotes={...s.quotes};h.render();}assert.equal(h.counts().predictCalls,1);assert.equal(h.lastContext().predictions,first);s.histories=JSON.parse(JSON.stringify(s.histories));s.quotes={};h.render();assert.equal(h.counts().predictCalls,1);s.histories={sh588000:[{date:'2026-10-20'}]};s.quotes={};h.render();assert.equal(h.counts().predictCalls,2);});

test('new UI accounts start with the user capital preservation limits instead of full exposure',async()=>{
 const h=harness(state(),true);await h.click();const i=h.input();
 assert.equal(i.riskLimits.investableLimit,1250);assert.equal(i.riskLimits.maxExposure,.125);assert.equal(i.riskLimits.maxThemeWeight,.125);
});

test('explicit full-risk selection can return to the conservative preset without retaining full exposure',async()=>{
 const h=harness(state(),true);h.setPreset('full');h.setPreset('conservative');await h.click();const i=h.input();
 assert.equal(i.riskLimits.investableLimit,1250);assert.equal(i.riskLimits.maxExposure,.125);assert.equal(i.allocationMode,'full');
});
