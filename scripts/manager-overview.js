'use strict';

// Consumes only the already verified research-account-view object. No I/O or trading calls.
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));
const ACTIONS = {
  wait_verification: {rank: 0, label: '等待核验', reason: '报价未通过完整合法性核验，暂停买卖提示；原持仓和冻结条件保留。'},
  exit_pending: {rank: 1, label: '退出待执行', reason: '已有退出请求或到期条件；须等待合法报价及可卖时点，不表示已经成交。'},
  t_plus_one: {rank: 2, label: '暂不可卖', reason: '持仓受T+1限制，最早可卖日期见逐只行动；不假定今天已经卖出。'},
  hold: {rank: 3, label: '按冻结规则持有研究', reason: '继续核对原持仓；触发风险或到期条件时按原规则处理，不新增预测。'},
  observe: {rank: 4, label: '观望', reason: '当前空仓，等待符合原冻结条件的模拟机会，不强行买入。'}
};
const text = (value, max = 400) => typeof value === 'string' && value.length > 0 && value.length <= max;
const amount = value => Number.isFinite(value) && value >= 0;
const action = code => ({code, label: ACTIONS[code].label, reason: ACTIONS[code].reason});
function unavailable() {
  return {available: false, risk: null, action: action('wait_verification'), holdings: [], investmentReady: false, verifiedProfitProbability: null, realOrdersAllowed: false};
}
function build(view) {
  const account = view?.legs?.candidate;
  if (!account || !text(view.id, 200) || !Number.isFinite(view.budget) || view.budget <= 0 ||
      !text(view.at, 80) || !Number.isFinite(Date.parse(view.at)) || typeof view.fresh !== 'boolean' ||
      !/^[a-f0-9]{64}$/i.test(view.modelHash || '') ||
      !/^\d{4}-\d{2}-\d{2}$/.test(view.modelCutoff || '') ||
      !Number.isSafeInteger(view.strategy?.horizon) || view.strategy.horizon <= 0 ||
      view.investmentReady !== false || view.verifiedProfitProbability !== null || view.realOrdersAllowed !== false ||
      ![account.equity, account.cash, account.marketValue].every(amount) ||
      account.cash + account.marketValue > account.equity + .005 ||
      !Array.isArray(account.holdings) || account.holdings.length > 20 ||
      account.holdings.some(h => !h || !text(h.symbol, 30) || !text(h.name, 200) ||
        !Number.isSafeInteger(h.shares) || h.shares <= 0 ||
        !['paused', 'exit_pending', 'maturity', 't_plus_one', 'hold'].includes(h.directive) ||
        !text(h.action, 1200) || !text(h.sourceTime, 100) ||
        (h.exitRequested !== undefined && typeof h.exitRequested !== 'boolean'))) return unavailable();

  const fresh = view.fresh && account.holdings.every(h => h.directive !== 'paused');
  const holdings = account.holdings.map((h, index) => {
    const code = !fresh ? 'wait_verification' :
      h.exitRequested === true || h.directive === 'exit_pending' || h.directive === 'maturity' ? 'exit_pending' :
      h.directive === 't_plus_one' ? 't_plus_one' : 'hold';
    return {
      symbol: h.symbol, name: h.name, shares: h.shares, sourceTime: h.sourceTime,
      sellableDate: typeof h.sellableDate === 'string' ? h.sellableDate : null,
      maturityDate: typeof h.maturityDate === 'string' ? h.maturityDate : null,
      action: {...action(code), detail: fresh ? h.action : ACTIONS.wait_verification.reason},
      index
    };
  }).sort((a, b) => ACTIONS[a.action.code].rank - ACTIONS[b.action.code].rank || a.index - b.index)
    .map(({index, ...h}) => h);
  const code = !fresh ? 'wait_verification' : holdings.length ? holdings[0].action.code : 'observe';
  const risk = Number.isFinite(account.netPnl) && Number.isFinite(account.drawdown) &&
    account.drawdown >= 0 && typeof account.warning === 'boolean' ?
    {netPnl: account.netPnl, drawdown: account.drawdown, warning: account.warning, warningAmount: 500} : null;

  return {
    available: true, id: view.id, budget: view.budget, at: view.at, fresh,
    equity: account.equity, cash: account.cash, marketValue: account.marketValue,
    exposure: account.equity > 0 ? account.marketValue / account.equity : null, risk,
    model: {hash: view.modelHash, cutoff: view.modelCutoff, horizon: view.strategy.horizon},
    action: action(code), holdings,
    investmentReady: false, verifiedProfitProbability: null, realOrdersAllowed: false
  };
}
function render(view) {
  const summary = build(view), e = escapeHtml;
  if (!summary.available) return '<section id="manager-overview" aria-labelledby="manager-overview-heading"><h2 id="manager-overview-heading">研究版投资经理</h2><p>投资优势未验证 · 只读模拟</p><h3>等待核验</h3><p>经理摘要暂不可核验，暂停显示资金与行动结论；原账户记录保留。</p></section>';
  const snapshotTime = new Date(summary.at).toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai', hour12: false});
  const money = value => value.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  const metric = (label, value) => '<div><span>' + e(label) + '</span><strong>' + e(value) + '</strong></div>';
  const riskHtml = summary.risk ?
    '<div class="numbers manager-overview-risk">' +
    metric('账面净盈亏', (summary.risk.netPnl > 0 ? '+' : '') + money(summary.risk.netPnl) + '元') +
    metric('当前峰谷回撤', money(summary.risk.drawdown) + '元') + '</div>' +
    '<p><strong>500元警戒：' + (summary.risk.warning ? '当前达到' : '当前未达到') + '</strong></p>' +
    '<p class="note">这里只判断当前快照；当前未达到不代表历史从未超限。历史事件保留在原记录中。净盈亏已计发生费用，尚未扣未来卖出费。</p>' :
    '<p class="note">风险暂不可核对；当前净盈亏、峰谷回撤或警戒字段缺失，不补造数字。</p>';

  const rows = summary.holdings.map(h => '<li><h4>' + e(h.name) + ' · ' + e(h.shares) + '份</h4><p><strong>' + e(h.action.label) + '</strong> · ' + e(h.action.detail) + '</p><small>' +
    e(h.symbol) + ' · 行情源时间 ' + e(h.sourceTime) +
    (h.sellableDate ? ' · 最早可卖 ' + e(h.sellableDate) : '') +
    (h.maturityDate ? ' · 到期 ' + e(h.maturityDate) : '') + '</small></li>').join('');
  return '<section id="manager-overview" aria-labelledby="manager-overview-heading"><h2 id="manager-overview-heading">研究版投资经理</h2>' +
    '<p>只读模拟 · 投资优势未验证 · 未达到实投参考标准</p><h3>' + e(summary.action.label) + '</h3><p>' + e(summary.action.reason) + '</p>' +
    '<div class="numbers manager-overview-numbers">' +
    metric('账户权益', money(summary.equity) + '元') + metric('剩余现金', money(summary.cash) + '元') +
    metric('持仓市值', money(summary.marketValue) + '元') +
    metric('实际风险暴露', summary.exposure === null ? '权益为零，无法计算' : (summary.exposure * 100).toFixed(2) + '%') +
    '</div><p><small>实际风险暴露按市值除以账户权益计算；它是当前持仓比例，不是政策上限或买入建议。</small></p>' +
    riskHtml + '<p>账户快照时间 <time datetime="' + e(summary.at) + '">' + e(snapshotTime) + '（北京时间）</time>' +
    (summary.fresh ? ' · 本次行情已通过既有账户核验。' : ' · 历史估值，等待新的合法行情，暂停买卖提示。') +
    '</p><p>当前模型：' + e(summary.model.horizon) + '交易日模型；训练截止 ' + e(summary.model.cutoff) + '。</p>' +
    '<details><summary>账户与模型身份</summary><p>账户 ' + e(summary.id) + '</p><p>模型SHA256 ' + e(summary.model.hash) + '</p></details>' +
    '<h3>逐只行动优先级</h3>' + (rows ? '<ul class="directive-list manager-overview-actions">' + rows + '</ul>' : '<p>当前空仓，暂无逐只持仓行动。</p>') +
    '<p class="note">以上仅归纳现有账户的冻结条件，不新增买卖预测或改变规则。风险价不保证成交；T+1、跳空、停牌或涨跌停可能延迟退出。500元警戒不是保本或最大亏损保证。</p></section>';
}
module.exports = {build, render};
