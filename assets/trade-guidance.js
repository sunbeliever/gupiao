(function(root,factory){
 const api=typeof module==='object'&&module.exports?factory(require('./paper-engine.js'),require('./fee-profile.js'),require('./trading-calendar.js')):factory(root.Paper,root.FeeProfile,root.TradingCalendar);
 if(typeof module==='object'&&module.exports)module.exports=api;else root.TradeGuidance=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Paper,Fee,Calendar){
 'use strict';
 const DEFAULTS=Object.freeze({budget:10000,positionLimit:10000,investableLimit:1250,maxExposure:.125,maxThemeWeight:.125,minFee:5,commissionRate:.0003,slippage:.001,allocationMode:'full'});
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const price=(x,type,ceil=false)=>Number.isFinite(x)?(ceil?Math.ceil((x-1e-10)*(type==='etf'?1000:100))/(type==='etf'?1000:100):x).toFixed(type==='etf'?3:2):'—';
 const money=x=>Number.isFinite(x)?x.toFixed(2):'—',pc=x=>Number.isFinite(x)?(x*100).toFixed(2)+'%':'—';
 function breakEven(u,shares,buyCost,profile){
  let lo=0,hi=Math.max(1,buyCost/shares*2);
  const net=price=>{const v=shares*Fee.executionPrice(price,'sell',profile);return v-Fee.costs(u,v,'sell',profile).total;};
  while(net(hi)<buyCost)hi*=2;
  for(let i=0;i<64;i++){const mid=(lo+hi)/2;if(net(mid)<buyCost)lo=mid;else hi=mid;}return hi;
 }
 function economics(u,q,cap,profile,planned){
  if(!q||!Number.isFinite(q.price)||q.price<=0)return null;
  const entry=Fee.executionPrice(q.price,'buy',profile),lot=/^sh688/.test(u.symbol)?200:100;
  const minimumCost=lot*entry+Fee.costs(u,lot*entry,'buy',profile).total;
  let shares=planned?.shares||Math.floor(cap/(entry*100))*100;
  while(shares>0&&shares*entry+Fee.costs(u,shares*entry,'buy',profile).total>cap+1e-8)shares-=100;
  if(shares<lot)return {minimumCost,shares:0,buyCost:null,breakEvenPrice:null,stopScenarioLoss:null};
  const entryPrice=planned?.entryPrice||entry,buyCost=planned?.buyCost||shares*entryPrice+Fee.costs(u,shares*entryPrice,'buy',profile).total;
  const stopPrice=entryPrice*.92,sale=shares*Fee.executionPrice(stopPrice,'sell',profile);
  return {minimumCost,shares,entryPrice,buyCost,breakEvenPrice:breakEven(u,shares,buyCost,profile),stopPrice,stopScenarioLoss:buyCost-sale+Fee.costs(u,sale,'sell',profile).total};
 }
 function holdingPlans(session,quotes,now,inspection){
  const date=Calendar.sessionOf(now),open=Calendar.isTradingTime(now);
  return session.account.holdings.map(h=>{
   const q=quotes[h.symbol],checked=inspection.rows.find(r=>r.symbol===h.symbol),valid=checked?.valid===true;
   const p=h.exitPlan||{},exitReason=h.pendingExit?.reason||(date>=p.maturitySession?'maturity':valid&&q.price<=p.stopPrice?'risk_stop':valid&&p.targetExitEnabled!==false&&q.price>=p.targetPrice?'frozen_target':null);
   const blockedBy=date<h.sellableSession?'t_plus_one':!open?'session_closed':!valid?'quote_unavailable':checked.sellBlock||null;
   return {symbol:h.symbol,name:h.name,type:h.type||session.universe?.find(u=>u.symbol===h.symbol)?.type||'etf',shares:h.shares,entryPrice:h.entryPrice,sellableSession:h.sellableSession,maturitySession:p.maturitySession||h.maturitySession,stopPrice:p.stopPrice,targetPrice:p.targetPrice,targetExitEnabled:p.targetExitEnabled!==false,exitReason,blockedBy,lastPrice:h.lastPrice,lastSourceTime:h.lastSourceTime};
  });
 }
 function build(input){
  const now=input.now||new Date().toISOString(),session=input.session,profile=Fee.resolve(session?{feeProfile:session.feeProfile}:{minFee:DEFAULTS.minFee});
  const base={generatedAt:now,profile:DEFAULTS,feeProfile:profile,investmentReady:false,verifiedProfitProbability:null,entries:[],holdings:[],observations:[],errors:[],historyHealth:input.dataHealth||null,action:'wait_signal',cap:1250,context:'current_deployed_19_pool_model_not_six_etf_research'};
  if(input.accountReadError)return {...base,action:'account_blocked'};
  if(session){const inspection=Paper.inspectExecution({universe:session.universe||input.universe,quotes:input.quotes,now,quoteWatermarks:session.quoteWatermarks,model:session.model,predictions:session.signals});base.holdings=holdingPlans(session,input.quotes||{},now,inspection);return {...base,action:base.holdings.length?'manage_holdings':'existing_account',accountId:session.accountId,cap:session.riskLimits.investableLimit};}
  const open=Calendar.isTradingTime(now),inspection=Paper.inspectExecution({universe:input.universe,quotes:input.quotes,now,predictions:input.predictions,dataHealth:input.dataHealth}),health=input.dataHealth?.ok===true&&inspection.health.ok;
  let plan={rows:[],selected:[]};
  if(open&&health)try{plan=Paper.plan({universe:(input.universe||[]).filter(u=>u.type==='etf'),quotes:input.quotes||{},predictions:input.predictions||{},now,budget:1250,positionLimit:1250,allocationMode:'full',maxPositions:3,minFee:profile.minFee,feeProfile:profile});}catch(e){base.errors.push(e.message);}
  plan.selected=plan.selected.filter(row=>{const checked=inspection.rows.find(r=>r.symbol===row.symbol);return checked?.valid&&!checked.buyBlock;});
  base.observations=(input.universe||[]).map(u=>{
   const q=input.quotes?.[u.symbol],p=input.predictions?.[u.symbol],row=plan.rows.find(r=>r.symbol===u.symbol),selected=plan.selected.find(r=>r.symbol===u.symbol),scenario=economics(u,q,1250,profile,selected);
   const buyBlock=inspection.rows.find(r=>r.symbol===u.symbol)?.buyBlock;
   let reason=u.type!=='etf'?(/^(sh688|sz30)/.test(u.symbol)?'未确认科创板 / 创业板权限，个股仅观察':'个股仅观察，持续模拟当前只执行ETF'):buyBlock?'交易受阻：'+buyBlock:row?.reason||(!open?'非交易时段，等待开盘重新核验':!health?'完整日线尚未核验':'没有通过费用和信号检查');
   if(scenario&&scenario.shares===0)reason+='；最小一手含费用约'+money(scenario.minimumCost)+'元，超过1250元预案额度';
   return {symbol:u.symbol,name:u.name,type:u.type,price:q?.price??null,sourceTime:q?.sourceTime||null,expectedReturn:p?.expectedReturn??null,signalDate:p?.asOf||null,scenario,reason,selected:!!selected};
  }).sort((a,b)=>(b.expectedReturn??-Infinity)-(a.expectedReturn??-Infinity)||a.symbol.localeCompare(b.symbol));
  base.action=!open?'wait_session':!health?'wait_data':plan.selected.length?'simulation_candidate':'wait_signal';
  base.entries=plan.selected.map(row=>{
   const u=input.universe.find(u=>u.symbol===row.symbol),scenario=economics(u,input.quotes[row.symbol],1250,profile,row);
   return {...row,...scenario,targetExitEnabled:true,targetPrice:row.referenceOpen*(1+row.expectedReturn),maturitySession:row.maturitySession};
  });
  return base;
 }
 const ACTIONS={wait_session:'现在等待：休市，不开新仓',wait_data:'现在等待：完整日线核验未通过',wait_signal:'现在等待：没有合格模拟入场信号',simulation_candidate:'已找到符合条件的模拟买入候选',account_blocked:'暂停：已有账户读取异常，先恢复记录',manage_holdings:'已有持仓：按冻结规则管理退出',existing_account:'已有持续账户：在原账户内继续核验'};
 function render(r){
  let html='<div class="research-eyebrow">今日买卖计划 · '+esc(new Date(r.generatedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})+' 北京时间')+'</div><h2>'+esc(ACTIONS[r.action]||'等待核验')+'</h2><p>按你的偏好：1万元本金，最多接受500元回撤、最好不亏。新模拟预案最多投入1250元，其余现金；这个仓位也不能保证本金不亏或回撤不超过500元。</p>';
  html+='<div class="research-counts"><span><b>¥'+money(r.cap)+'</b>预案投资上限</span><span><b>未验证</b>70%赚钱概率</span><span><b>20交易日</b>新预案持有期限</span></div><p>当前使用原19标的部署模型；低仓位历史研究的六ETF模型尚未部署。以下为模拟计划，尚无通过风险与前瞻验证的实盘买入推荐。</p>';
  if(r.historyHealth){var health=r.historyHealth,healthy=(health.rows||[]).filter(x=>!x.stale&&x.dataAsOf===health.expectedAsOf).length;html+='<p>完整日线应截至 '+esc(health.expectedAsOf||'未知')+'；'+(health.ok?'研究池核验通过':'尚未全部更新，暂停新仓')+(health.rows?'（'+healthy+'/'+health.rows.length+'）':'')+'。信号日期与报价日期分别显示，不用旧日线冒充今日信号。</p>';}
  if(r.action==='account_blocked')return html+'<p class="research-warning">保留原始账户，禁止重建本金；本页不另开替代账户。</p>';
  if(r.holdings.length)html+='<h3>持仓下一步</h3>'+r.holdings.map(h=>'<article><strong>'+esc(h.name)+' '+esc(h.symbol.slice(2))+' · '+h.shares+'份</strong><p>最早可卖 '+esc(h.sellableSession)+'；到期请求退出 '+esc(h.maturitySession)+'；风险触发价 '+price(h.stopPrice,h.type)+'；'+(h.targetExitEnabled?'冻结目标价 '+price(h.targetPrice,h.type,true):'本仓位未启用预测价止盈')+'。</p><p>退出意图：'+esc(({risk_stop:'已触发风险退出',maturity:'到期退出',frozen_target:'达到冻结目标'})[h.exitReason]||'继续观察')+'；执行限制：'+esc(({t_plus_one:'当天买入尚不可卖',session_closed:'休市，等待下一合法交易时段',quote_unavailable:'等待有效报价',suspended:'停牌，无法成交',sell_limit_or_rejection:'跌停或卖单受限，无法假定成交'})[h.blockedBy]||'未发现已建模阻碍；实际成交仍待券商确认')+'。</p></article>').join('');
  if(r.entries.length)html+='<h3>模拟候选（未实际下单）</h3>'+r.entries.map(e=>'<article><strong>'+esc(e.name)+' '+esc(e.symbol.slice(2))+'</strong><p>数量 '+e.shares+'份；假设入场价 '+price(e.entryPrice,e.type)+'；含买费 '+money(e.buyCost)+'元；扣费保本报价约 '+price(e.breakEvenPrice,e.type,true)+'；估计净空间 '+pc(e.estimatedNetReturn)+'。</p><p>冻结目标价 '+price(e.targetPrice,e.type,true)+'；8%风险触发价 '+price(e.stopPrice,e.type)+'；在该价假设卖出的亏损约 '+money(e.stopScenarioLoss)+'元。到期 '+esc(e.maturitySession)+'；T+1可卖日、退出意图在模拟成交后冻结。</p></article>').join('');
  if(!r.holdings.length){const etfs=r.observations.filter(o=>o.type==='etf').slice(0,3);html+='<h3>优先核验的ETF观察预案</h3><p>按当前模型估计排序，休市期间仅看情景。交易前须重取当日开盘价、报价和共同完整日线，不能照抄下列价格下单。</p>'+etfs.map(o=>'<article><strong>'+esc(o.name)+' '+esc(o.symbol.slice(2))+'</strong><p>来源快照 '+esc(o.sourceTime||'缺失')+'；信号日 '+esc(o.signalDate||'缺失')+'；20日研究估计 '+pc(o.expectedReturn)+'。</p><p>'+(o.scenario?.shares?'按该快照单独测算 '+o.scenario.shares+'份、含买费约 '+money(o.scenario.buyCost)+'元；扣费保本报价至少 '+price(o.scenario.breakEvenPrice,o.type,true)+'；8%风险价情景约 '+price(o.scenario.stopPrice,o.type)+'，假设在此退出亏约 '+money(o.scenario.stopScenarioLoss)+'元。':'额度或报价不足，无法测算。')+'</p><p>'+esc(o.reason)+'</p></article>').join('');}
  if(!r.holdings.length)html+='<details><summary>个股与ETF研究排序及排除原因</summary><p>排名为预测排序，不是可买名单。下面每行的数量与资金是单独情景，不能把各行相加使用。</p><div class="research-table-wrap"><table class="research-table"><thead><tr><th>候选 / 信号日</th><th>20日研究估计</th><th>1250元单独情景</th><th>当前结论</th></tr></thead><tbody>'+r.observations.slice(0,8).map(o=>'<tr><td>'+esc(o.name)+'<small>'+esc(o.symbol.slice(2))+' · '+esc(o.signalDate||'未提供')+'</small></td><td>'+pc(o.expectedReturn)+'</td><td>'+(o.scenario?.shares?o.scenario.shares+'份 / ¥'+money(o.scenario.buyCost)+'<small>扣费保本价 '+price(o.scenario.breakEvenPrice,o.type,true)+'</small>':'无法按额度买入')+'</td><td>'+esc(o.reason)+'</td></tr>').join('')+ '</tbody></table></div></details>';
  html+='<details><summary>怎么买、什么时候卖：逐步核对</summary><ol><li>开盘后重新获取有效报价和完整日线；过期信号不能沿用。当前页面不提供明天的固定买价。</li><li>只有通过权限、整手、费用、资金及信号检查，才列为模拟候选；不满足条件就等待。</li><li>进入持续模拟后，入场价、数量、费用、最早可卖日、目标和到期日保存在同一账户。后续按持仓计划管理，不用新的排名替换旧退出规则。</li><li>默认模拟按8%单仓风险阈值、冻结目标价或20交易日到期请求退出。跳空、停牌、跌停和T+1可能使亏损扩大；触发价并非保证成交价。</li><li>双边费用和滑点已参与情景；最低佣金为假设，实际按券商合同核对。预测区间未经校准，不能解释为70%盈利概率。</li></ol></details>';
  html+='<details><summary>今日网络核对与来源</summary><p>核对日期2026-10-20。普通A股 / ETF通常按100股（份）整手买入，科创板有不同最小数量及权限；创业板新开权限也有资产和经验要求。此处是规则核对，没有把新新闻擅自加入历史预测。</p><p><a href="https://www.sse.com.cn/lawandrules/sselawsrules2025/fund/trading/c/c_20260424_10817739.shtml" target="_blank" rel="noopener">上交所2026交易规则</a> · <a href="https://investor.szse.cn/knowledge/t20200513_577026.html" target="_blank" rel="noopener">深交所创业板权限说明</a> · <a href="https://www.csrc.gov.cn/shenzhen/c105614/c7645981/content.shtml" target="_blank" rel="noopener">证监局AI选股风险案例</a></p></details>';
  return html;
 }
 return {DEFAULTS,build,render,breakEven};
});
