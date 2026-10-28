'use strict';
const fs=require('node:fs');
const evidence=require('../assets/profit-results-evidence.json');
const L=require('../assets/manager-research-evidence.js');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>(n>0?'+':'')+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const time=s=>new Date(s).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false});
const names={rolling_ridge:'滚动岭模型',rolling_mean:'滚动均值基线',frozen_f0:'原冻结f0模型',fixed_three:'固定三ETF（退出再入场）',fixed_single:'固定单ETF（退出再入场）',cash:'现金基准',decision_thesis:'趋势决策候选',true_buy_hold_three:'真正三ETF买入持有'};
const states={queued:'排队，尚未执行',running:'执行中，收益待完成',completed:'已完成',failed:'失败，结果保留',blocked:'受阻，尚不可执行'};
function readProgress(file,view,now=Date.now()){
  try{
    if(!file||fs.statSync(file).size>65536)throw Error('summary size');
    const s=JSON.parse(fs.readFileSync(file,'utf8')),at=Date.parse(s.updatedAt);
    if(s.schema!==1||s.accountId!==view.id||s.sourceModelHash!==view.modelHash||!Number.isFinite(at)||at>now||!Array.isArray(s.jobs)||s.jobs.length>12)throw Error('summary identity');
    const jobs=s.jobs.map(j=>{if(!j||typeof j.id!=='string'||j.id.length>200||typeof j.kind!=='string'||!Object.hasOwn(states,j.status))throw Error('job');return {id:j.id,kind:j.kind,status:j.status};});
    return {available:true,updatedAt:s.updatedAt,stale:now-at>15*60000,jobs};
  }catch{return {available:false,jobs:[]};}
}
function validCurrent(v,now){
  const c=v?.legs?.candidate;
  return v?.id===evidence.accountId&&v.modelHash===evidence.modelHash&&v.budget===50000&&
    Number.isFinite(Date.parse(v.at))&&Date.parse(v.at)<=now&&typeof v.fresh==='boolean'&&c&&
    [c.equity,c.cash,c.marketValue,c.netPnl,c.fees,c.drawdown].every(Number.isFinite)&&
    c.equity>=0&&c.cash>=0&&c.marketValue>=0&&c.fees>=0&&c.drawdown>=0&&
    Math.abs(c.equity-50000-c.netPnl)<.005&&Math.abs(c.cash+c.marketValue-c.equity)<.005;
}
function render(view,now=Date.now()){
  let current='<p>当前账户金额暂不可核验，等待下一次完整快照，不补造盈亏。</p>';
  if(validCurrent(view,now)){
    const c=view.legs.candidate,b=evidence.previousClose,comparison=Number.isFinite(b?.equity)&&Number.isFinite(Date.parse(b.at))&&Date.parse(b.at)<Date.parse(view.at);
    const control=view.legs.control,controlValid=control&&Number.isFinite(control.equity)&&Number.isFinite(control.netPnl)&&Math.abs(control.equity-50000-control.netPnl)<.005;
    const label=c.netPnl<0?'当前模拟累计亏损':c.netPnl>0?'当前模拟累计盈利':'当前模拟累计持平';
    current='<h3>'+label+'</h3><p class="profit-main" style="font-size:32px;font-weight:800;color:'+(c.netPnl<0?'#a52020':'#126447')+'">'+money(c.netPnl)+'元 <small style="font-size:16px">'+money(c.netPnl/500)+'%</small></p>'+
      '<div class="numbers"><div><span>已发生费用</span><strong>'+money(c.fees)+'元</strong></div><div><span>当前峰谷回撤</span><strong>'+money(c.drawdown)+'元</strong></div></div>'+
      '<p>较上次核验收盘：'+(comparison?money(c.equity-b.equity)+'元（'+esc(time(b.at))+'）':'暂不可比较')+'</p>'+
      (controlValid?'<p>独立对照累计：'+money(control.netPnl)+'元；本账户比对照'+(c.netPnl-control.netPnl>=0?'多赚 ':'少赚 / 多亏 ')+money(Math.abs(c.netPnl-control.netPnl))+'元。两账户不相加。</p>':'')+
      '<p>快照 '+esc(time(view.at))+'（北京时间） · '+(view.fresh?'行情已通过当前核验':'历史估值，报价过期或不完整，暂停买卖提示')+'。每15秒刷新。</p><p class="note">累计盈亏已扣发生费用，未扣尚未发生的卖出费；当前回撤不是全期最大回撤。这里只显示虚拟资金。</p>';
  }
  const rows=evidence.rows.filter(r=>typeof r.path==='string'&&[r.netPnl,r.drawdown,r.fees,r.trades,r.exposure].every(Number.isFinite));
  const table=rows.map(r=>'<tr><th>'+esc(names[r.path]||r.path)+'</th><td>'+money(r.netPnl)+'元</td><td>'+money(r.drawdown)+'元 <small>'+esc(r.drawdownBasis==='daily_close'?'日线收盘':'开盘与收盘')+'</small></td><td>'+money(r.fees)+'元</td><td>'+r.trades+'</td><td>'+(r.exposure*100).toFixed(2)+'%</td><td>已完成 · 未晋级'+(r.path==='cash'?'；零收益不算成功':'')+'</td></tr>').join('');
  const p=view?.resultProgress;
  const progress=p?.available&&Number.isFinite(Date.parse(p.updatedAt))&&Date.parse(p.updatedAt)<=now&&Array.isArray(p.jobs)&&p.jobs.length<=12&&p.jobs.every(j=>typeof j?.id==='string'&&Object.hasOwn(states,j.status))?'<p>调度摘要 '+esc(time(p.updatedAt))+(p.stale?' · 过期，仅为最后记录':'')+'</p><ul>'+p.jobs.map(j=>'<li>'+esc(j.id)+'：'+esc(states[j.status]||'状态不可核验')+'</li>').join('')+'</ul>':'<p>任务进度暂不可核验；以下已完成历史结果仍保留，不将未知收益填成0。</p>';
  return '<section id="profit-results-panel" aria-labelledby="profit-results-heading"><h2 id="profit-results-heading">现在赚了还是亏了</h2>'+current+
    '<h3>历史研究：扣费后到底赚亏多少</h3><p><strong>这些不是当前账户收益，不能相加。</strong> 各路径独立5万元，区间2025-01-03至2026-10-23；2026公司行动尚未完整进入这些旧账务，可靠收益排名受阻，所有候选未晋级。买持与主动策略风险规则及实际暴露不同。</p>'+
    '<div class="scroll"><table><thead><tr><th>策略</th><th>累计净盈亏</th><th>最大观察回撤</th><th>费用</th><th>买卖笔数</th><th>平均暴露</th><th>结论</th></tr></thead><tbody>'+table+'</tbody></table></div><p class="note">历史假设成交，非独立未来盈利证明；以上回撤均不覆盖日内极值，不同采样口径不能直接作同覆盖风险比较。期末持仓未强平，未扣未来卖费。</p>'+
    '<details><summary>查看2024 / 2025跨年度研究，包括成本压力和失败路径</summary>'+L.render()+'</details>'+
    '<details open><summary>自动研究最新任务状态</summary>'+progress+'</details></section>';
}
module.exports={render,readProgress};
