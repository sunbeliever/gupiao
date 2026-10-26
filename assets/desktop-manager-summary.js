(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else{root.DesktopManagerSummary=factory();if(root.document&&root.Native&&typeof root.Native.readManagerSummary==='function')root.document.addEventListener('DOMContentLoaded',function(){root.DesktopManagerSummary.mount(root.document,root.Native,root);});}})(typeof window==='undefined'?globalThis:window,function(){
'use strict';
const ACCOUNT='paired-capital50k-20261021-pm-a',MODEL='f0b16e0c0922e3ae051015c3f73a66135c2a0b4ed478b5c0a3bfe6471ad0b0dd';
const codes=['wait_verification','exit_pending','t_plus_one','hold','observe'];
const number=n=>typeof n==='number'&&Number.isFinite(n),text=s=>typeof s==='string'&&s.length<=1200;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function validate(p,now=Date.now()){
 if(!p||p.schema!==1||p.accountId!==ACCOUNT||p.modelHash!==MODEL||p.budget!==50000)return false;
 const at=Date.parse(p.at),out=Date.parse(p.exportedAt),s=p.summary;
 if(!Number.isFinite(at)||!Number.isFinite(out)||now-at<0||now-at>90000||now-out<0||now-out>90000||out<at||!s||s.available!==true||typeof s.fresh!=='boolean'||s.id!==ACCOUNT||s.budget!==50000||s.at!==p.at||s.model?.hash!==MODEL||!Number.isSafeInteger(s.model.horizon)||s.model.horizon<=0||!text(s.model.cutoff)||s.investmentReady!==false||s.realOrdersAllowed!==false||s.verifiedProfitProbability!==null)return false;
 if(![s.equity,s.cash,s.marketValue].every(n=>number(n)&&n>=0)||s.cash+s.marketValue>s.equity+.005||(s.equity===0?s.exposure!==null:!number(s.exposure)||Math.abs(s.exposure-s.marketValue/s.equity)>1e-9))return false;
 if(!s.action||!codes.includes(s.action.code)||!text(s.action.label)||!text(s.action.reason)||(!s.fresh&&s.action.code!=='wait_verification'))return false;
 if(!Array.isArray(s.holdings)||s.holdings.length>20||s.holdings.some(h=>!h||!text(h.name)||!text(h.symbol)||!h.action||!codes.includes(h.action.code)||!text(h.action.label)||!text(h.action.detail)||(!s.fresh&&h.action.code!=='wait_verification')))return false;
 return s.risk===null||(!!s.risk&&number(s.risk.netPnl)&&number(s.risk.drawdown)&&s.risk.drawdown>=0&&typeof s.risk.warning==='boolean'&&s.risk.warningAmount===500);
}
function render(p,now=Date.now()){
 const lead='<h2>AI经理研究摘要</h2><p>独立5万元模拟账户 · 投资优势未验证 · 不是全市场选股或盈利承诺</p>';
 if(!validate(p,now))return lead+'<h3>等待核验</h3><p>指定账户摘要缺失、过期或身份未核对，暂停行动提示。下方原1万元工具与本账户独立，资金和收益不合并。</p>';
 const s=p.summary,m=n=>n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
 return lead+'<h3>'+esc(s.action.label)+'</h3><p>'+esc(s.action.reason)+'</p><div class="research-counts"><span>权益 <b>'+m(s.equity)+'</b></span><span>现金 <b>'+m(s.cash)+'</b></span><span>市值 <b>'+m(s.marketValue)+'</b></span><span>实际暴露 <b>'+(s.exposure===null?'不可计算':(s.exposure*100).toFixed(2)+'%')+'</b></span></div>'+
 (s.risk?'<p>净盈亏 '+m(s.risk.netPnl)+'元；当前峰谷 '+m(s.risk.drawdown)+'元；500元警戒：'+(s.risk.warning?'当前达到':'当前未达到')+'。当前未达到不代表历史从未超限。</p>':'<p>风险暂不可核对。</p>')+
 '<p>账户快照 '+esc(new Date(p.at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}))+'（北京时间）'+(s.fresh?'':' · 行情未通过，等待核验')+'</p><p>'+s.model.horizon+'交易日模型 · 截止 '+esc(s.model.cutoff)+'</p><details><summary>账户与模型身份</summary><p>'+esc(ACCOUNT)+'</p><p>'+esc(MODEL)+'</p></details>'+
 '<ul>'+s.holdings.map(h=>'<li><b>'+esc(h.name)+' · '+esc(h.action.label)+'</b><p>'+esc(h.action.detail)+'</p></li>').join('')+'</ul><p>下方原1万元工具与本5万元账户独立，资金和收益不合并。本面板只读，不下单、不切换模型。风险价不保证成交。</p>';
}
function mount(document,native,host){
 const main=document.querySelector('main');if(!main)return null;
 let panel=document.getElementById('desktop-manager-summary');if(!panel){panel=document.createElement('section');panel.id='desktop-manager-summary';panel.className='research-card';main.insertBefore(panel,main.firstChild);}
 const refresh=()=>{let p;try{p=JSON.parse(native.readManagerSummary());}catch(_){}panel.innerHTML=render(p);};
 refresh();const timer=host.setInterval(refresh,15000);host.addEventListener('beforeunload',()=>host.clearInterval(timer),{once:true});return panel;
}
return {validate,render,mount};
});
