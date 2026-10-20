'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function harness(state,refreshResult,options={}){
 const elements={},buttons={};let starts=0,refreshes=0,lastInput;
 const page={querySelector:()=>({insertAdjacentElement:(_,node)=>{elements[node.id]=node;}}),prepend:node=>{elements[node.id]=node;}};
 elements['page-model']=page;
 const doc={getElementById:id=>elements[id],createElement:()=>({remove(){delete elements[this.id];},querySelector:selector=>buttons[selector]||(buttons[selector]={}),querySelectorAll:()=>[]})};
 const Market={UNIVERSE:options.universe||[],read:()=>null,write:()=>true,quotes:async()=>options.quotes||{},isStale:q=>!q||!!q.stale,setBackground(){}};
 const context={document:doc,Date,console,Market,Analysis:{},ForecastJournal:{create:()=>({refresh:()=>({saved:true}),summary:()=>({total:0,pending:0,scored:0,excluded:0}),records:()=>[]})},Paper:{plan:()=>({rows:[],selected:[]}),start:input=>{starts++;lastInput=input;return{account:{holdings:[]}};}},window:{TechScopeUI:{switchTab(){},refresh:async()=>{refreshes++;return refreshResult;}}}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../assets/assurance-ui.js'),'utf8'),context);context.window.ResearchUI.render(state);
 return {click:async()=>{buttons['#start-paper'].onclick();await new Promise(resolve=>setImmediate(resolve));},clickAuto:async()=>{buttons['#start-auto-paper'].onclick();await new Promise(resolve=>setImmediate(resolve));},counts:()=>({starts,refreshes}),input:()=>lastInput};
}
const state=extra=>({initialized:true,tab:'model',reports:{},predictions:{},histories:{},quotes:{},model:{},busy:false,training:false,evaluating:false,...extra});
test('paper actions cannot bypass an existing sync, training or backtest',async()=>{for(const key of ['busy','training','evaluating']){const h=harness(state({[key]:true}),true);await h.click();assert.equal(h.counts().starts,0);assert.equal(h.counts().refreshes,0);}});
test('unsuccessful refresh does not create a paper portfolio from stale predictions',async()=>{const h=harness(state(),false);await h.click();assert.equal(h.counts().refreshes,1);assert.equal(h.counts().starts,0);});

test('the default UI simulation uses the whole ten-thousand capital as the user clarified',async()=>{const h=harness(state(),true);await h.click();const i=h.input();assert.equal(i.budget,10000);assert.equal(i.profile,'beginner');assert.equal(i.positionLimit,10000);assert.equal(i.allocationMode,'full');assert.equal(i.minFee,5);});

test('missing research-pool quotes cannot be recorded as a successful cash choice',async()=>{const h=harness(state(),true,{universe:[{symbol:'sh588000'},{symbol:'sh512760'}],quotes:{sh588000:{price:1.4}}});await h.click();assert.equal(h.counts().refreshes,1);assert.equal(h.counts().starts,0);});
