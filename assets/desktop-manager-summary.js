(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./manager-research-evidence.js'));else{root.DesktopManagerSummary=factory(root.ManagerResearchEvidence);if(root.document&&root.Native&&typeof root.Native.readManagerSummary==='function')root.document.addEventListener('DOMContentLoaded',function(){root.DesktopManagerSummary.mount(root.document,root.Native,root);});}})(typeof window==='undefined'?globalThis:window,function(Evidence){
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
function renderActual(p,now=Date.now()){
 const lead='<h2>AI经理研究摘要</h2><p>独立5万元模拟账户 · 投资优势未验证 · 不是全市场选股或盈利承诺</p>';
 if(!validate(p,now))return lead+'<h3>等待核验</h3><p>指定账户摘要缺失、过期或身份未核对，暂停行动提示。下方原1万元工具与本账户独立，资金和收益不合并。</p>';
 const s=p.summary,m=n=>n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
 return lead+'<h3>'+esc(s.action.label)+'</h3><p>'+esc(s.action.reason)+'</p><div class="research-counts"><span>权益 <b>'+m(s.equity)+'</b></span><span>现金 <b>'+m(s.cash)+'</b></span><span>市值 <b>'+m(s.marketValue)+'</b></span><span>实际暴露 <b>'+(s.exposure===null?'不可计算':(s.exposure*100).toFixed(2)+'%')+'</b></span></div>'+
 (s.risk?'<p>净盈亏 '+m(s.risk.netPnl)+'元；当前峰谷 '+m(s.risk.drawdown)+'元；500元警戒：'+(s.risk.warning?'当前达到':'当前未达到')+'。当前未达到不代表历史从未超限。</p>':'<p>风险暂不可核对。</p>')+
 '<p>账户快照 '+esc(new Date(p.at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}))+'（北京时间）'+(s.fresh?'':' · 行情未通过，等待核验')+'</p><p>'+s.model.horizon+'交易日模型 · 截止 '+esc(s.model.cutoff)+'</p><details><summary>账户与模型身份</summary><p>'+esc(ACCOUNT)+'</p><p>'+esc(MODEL)+'</p></details>'+
 '<ul>'+s.holdings.map(h=>'<li><b>'+esc(h.name)+' · '+esc(h.action.label)+'</b><p>'+esc(h.action.detail)+'</p></li>').join('')+'</ul><p>下方原1万元工具与本5万元账户独立，资金和收益不合并。本面板只读，不下单、不切换模型。风险价不保证成交。</p>';
}
const symbols=['sh512720','sh512760','sh515070','sh515880','sh588000','sz159852'];
const actions={hold:'持有研究',add:'候选加仓',reduce:'候选减仓',exit:'候选退出',observe:'观望',candidate_buy:'候选买入',wait_t1:'T+1暂不可卖',wait_sell_blocked:'等待合法卖出报价',wait_lot_verification:'等待批次核验',partial_sellable_review:'部分批次可卖，待复核',review_lot_risk:'逐批风险待复核',wait_data:'等待数据',wait_verification:'等待核验'};
const boundedList=v=>Array.isArray(v)&&v.length<=12&&v.every(s=>typeof s==='string'&&s.length<=600);
const shares=v=>Number.isSafeInteger(v)&&v>=0;
function validateResearch(p,now=Date.now()){
 if(!validate(p,now)||!p.summary.fresh)return false;
 const r=p.research,c=r?.candidate;
 if(!r||r.schema!==1||r.accountId!==ACCOUNT||r.modelHash!==MODEL||r.at!==p.at||!shares(r.sequence)||!c||c.available!==true||c.policyId!=='monitor-only-weekly-l1'||c.investmentReady!==false||c.executable!==false||c.committedSnapshotVerified!==true||c.inputAsOf!==p.at||!Array.isArray(c.rows)||c.rows.length!==6)return false;
 return new Set(c.rows.map(x=>x?.symbol)).size===6&&c.rows.every(x=>x&&symbols.includes(x.symbol)&&typeof x.name==='string'&&x.name.length<=120&&Object.prototype.hasOwnProperty.call(actions,x.action)&&shares(x.currentShares)&&shares(x.targetShares)&&number(x.targetWeight)&&x.targetWeight>=0&&x.targetWeight<=1&&boundedList(x.reasons)&&boundedList(x.exitConditions)&&(x.sellableShares===null||shares(x.sellableShares)&&x.sellableShares<=x.currentShares));
}
function renderCandidate(p,now){
 const head='<section id="manager-live-candidate" aria-labelledby="manager-candidate-title"><h3 id="manager-candidate-title">L monitor_only研究候选</h3><p>未晋级 · 不执行 · 与原冻结账户指示独立。500元只作监测警戒，风险合同不同；没有经过验证的未来收益或赚钱概率。</p>';
 if(!validateResearch(p,now))return head+'<p role="status">候选等待核验：需要同一份新鲜、已提交的完整行情和持仓。缺失、陈旧或异常时暂停候选提示；静态历史仍可查看。</p></section>';
 const c=p.research.candidate;
 return head+'<p>输入时刻 '+esc(c.inputAsOf)+'；快照序号 '+p.research.sequence+'。以下均为研究目标，未成交卖款不能作为可用现金。</p><div class="research-table-wrap"><table class="research-table"><thead><tr><th scope="col">ETF / 研究行动</th><th scope="col">现有 / 目标份额</th><th scope="col">目标权重</th><th scope="col">可卖份额</th><th scope="col">依据与失效条件</th></tr></thead><tbody>'+c.rows.map(x=>'<tr><th scope="row">'+esc(x.name)+' <small>'+esc(x.symbol)+' · '+esc(actions[x.action])+'</small></th><td>'+x.currentShares+' / '+x.targetShares+'</td><td>'+(x.targetWeight*100).toFixed(2)+'%</td><td>'+(x.sellableShares===null?'待核验':x.sellableShares)+'</td><td>'+x.reasons.map(esc).join('；')+'<small>失效条件：'+(x.exitConditions.length?x.exitConditions.map(esc).join('；'):'尚无可核对条件')+'</small></td></tr>').join('')+'</tbody></table></div><p>期限20个交易日；止损触价不保证成交，T+1、限卖及逐批风险仍需核验。本区不会发送订单。</p></section>';
}
function render(p,now=Date.now()){
 const history=Evidence&&typeof Evidence.render==='function'?Evidence.render():'<section id="manager-historical-evidence"><h3>已核L历史表现</h3><p>静态历史证据暂不可核验，不填0。</p></section>';
 return '<section id="manager-actual-account">'+renderActual(p,now)+'</section>'+renderCandidate(p,now)+history;
}
function mount(document,native,host){
 const main=document.querySelector('main');if(!main)return null;
 let panel=document.getElementById('desktop-manager-summary');if(!panel){panel=document.createElement('section');panel.id='desktop-manager-summary';panel.className='research-card';main.insertBefore(panel,main.firstChild);}
 const refresh=()=>{let p;try{p=JSON.parse((()=>{const raw=native.readManagerSummary();if(typeof raw!=='string'||raw.length>65536)throw Error('Oversized summary');return raw;})());}catch(_){}panel.innerHTML=render(p);};
 refresh();const timer=host.setInterval(refresh,15000);host.addEventListener('beforeunload',()=>host.clearInterval(timer),{once:true});return panel;
}
return {validate,validateResearch,render,renderCandidate,mount};
});
