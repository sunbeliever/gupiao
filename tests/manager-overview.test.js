'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const load = () => require('../scripts/manager-overview.js');

function holding(directive, symbol, extra = {}) {
  return {
    symbol, name: symbol + ' ETF', shares: 1000, sourceTime: '2026-10-26 10:00:00',
    directive, action: directive === 't_plus_one' ? '今日不可卖，最早2026-10-27再检查' : '原冻结规则说明',
    sellableDate: '2026-10-27', maturityDate: '2026-11-23', ...extra
  };
}
function view() {
  return {
    id: 'frozen-50k-account', budget: 50000, at: '2026-10-26T02:00:00.000Z',
    fresh: true, modelCutoff: '2024-12-31', modelHash: 'a'.repeat(64),
    investmentReady: false, realOrdersAllowed: false, verifiedProfitProbability: null,
    strategy: {horizon: 20, maximumExposure: .25},
    legs: {candidate: {
      equity: 49000, cash: 38000, marketValue: 11000, invested: 12000,
      holdings: [holding('hold', 'sh512720')]
    }}
  };
}

test('manager summary derives actual market exposure and preserves account identity', () => {
  assert.doesNotThrow(() => {
    const M = load(), v = view(), s = M.build(v), html = M.render(v);
    assert.equal(s.available, true);
    assert.equal(s.equity, 49000);
    assert.equal(s.cash, 38000);
    assert.equal(s.marketValue, 11000);
    assert.equal(s.exposure, 11000 / 49000);
    assert.equal(s.model.hash, v.modelHash);
    assert.equal(s.at, v.at);
    assert.equal(s.action.code, 'hold');
    assert.match(html, /49,000.00/);
    assert.match(html, /38,000.00/);
    assert.match(html, /22.45%/);
    assert.match(html, /按市值.*权益/);
    assert.match(html, /研究版投资经理/);
    assert.match(html, /北京时间/);
    assert.match(html, /投资优势未验证/);
    assert.match(html, /风险价不保证成交/);
    assert.ok(html.includes(v.modelHash));
    assert.ok(html.includes(v.id));
  }, '只读经理摘要应接受既有已核验view并显示其真实资金');
});

test('stale or paused holdings suppress all actionable summary text before other priorities', () => {
  const M = load(), v = view();
  v.fresh = false;
  v.legs.candidate.holdings = [holding('exit_pending', 'sh512720', {action: '立即执行旧提示'})];
  let s = M.build(v);
  assert.equal(s.action.code, 'wait_verification');
  assert.ok(s.holdings.every(h => h.action.code === 'wait_verification'));
  const html = M.render(v);
  assert.match(html, /等待核验/);
  assert.match(html, /历史估值/);
  assert.ok(!html.includes('立即执行旧提示'));
  v.fresh = true;
  v.legs.candidate.holdings[0].directive = 'paused';
  s = M.build(v);
  assert.equal(s.action.code, 'wait_verification');
});

test('exits then T plus one then normal holdings determine account and per holding priority', () => {
  const M = load(), v = view();
  v.legs.candidate.holdings = [
    holding('hold', 'sh512720'),
    holding('t_plus_one', 'sh512760'),
    holding('maturity', 'sh515070'),
    holding('exit_pending', 'sh515880')
  ];
  const s = M.build(v);
  assert.equal(s.action.code, 'exit_pending');
  assert.deepEqual(s.holdings.map(h => h.action.code), ['exit_pending', 'exit_pending', 't_plus_one', 'hold']);
  assert.equal(s.holdings[0].symbol, 'sh515070');
  const html = M.render(v);
  assert.match(html, /退出待执行/);
  assert.match(html, /暂不可卖/);
  assert.match(html, /按冻结规则持有研究/);
  assert.match(html, /不表示已经成交/);
});

test('explicit exit request remains pending while retaining the T plus one restriction', () => {
  const M = load(), v = view();
  v.legs.candidate.holdings = [holding('t_plus_one', 'sh512720', {exitRequested: true, action: '已触发风险退出；今日不可卖，最早2026-10-27再检查'})];
  const s = M.build(v);
  assert.equal(s.action.code, 'exit_pending');
  assert.equal(s.holdings[0].action.code, 'exit_pending');
  assert.match(M.render(v), /今日不可卖/);
  assert.match(M.render(v), /2026-10-27/);
});

test('T plus one alone is untradeable and a fresh empty account observes without inventing entries', () => {
  const M = load(), v = view();
  v.legs.candidate.holdings = [holding('t_plus_one', 'sh512720')];
  assert.equal(M.build(v).action.code, 't_plus_one');
  v.legs.candidate = {equity: 50000, cash: 50000, marketValue: 0, invested: 0, holdings: []};
  assert.equal(M.build(v).action.code, 'observe');
  assert.equal(M.build(v).exposure, 0);
  const html = M.render(v);
  assert.match(html, /观望/);
  assert.match(html, /当前空仓/);
  assert.doesNotMatch(html, /建议买入|加仓推荐/);
});

test('snapshot and quote times are distinct and untrusted strings are escaped', () => {
  const M = load(), v = view();
  v.id = '<img src=x>';
  v.legs.candidate.holdings[0].name = '<script>alert(1)</script>';
  v.legs.candidate.holdings[0].action = '<img src=x>原冻结理由';
  const html = M.render(v);
  assert.match(html, /账户快照时间/);
  assert.match(html, /行情源时间/);
  assert.ok(html.includes('2026-10-26 10:00:00'));
  assert.ok(html.includes(v.at));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('&lt;img'));
  assert.doesNotMatch(html, /<script|<img|<form|type="submit"/);
});

test('invalid view data fails closed without throwing or displaying invented money', () => {
  const M = load();
  for (const change of [
    v => {v.legs.candidate.equity = NaN;},
    v => {v.legs.candidate.cash = Infinity;},
    v => {v.legs.candidate.marketValue = -1;},
    v => {v.legs.candidate.cash = 60000;},
    v => {v.modelHash = 'wrong';},
    v => {v.at = 'invalid';},
    v => {v.legs.candidate.holdings[0].directive = 'buy_now';},
    v => {v.legs.candidate.holdings[0].shares = 1.5;},
    v => {v.realOrdersAllowed = true;}
  ]) {
    const v = view(); change(v);
    const s = M.build(v);
    assert.equal(s.available, false);
    assert.equal(s.action.code, 'wait_verification');
    const html = M.render(v);
    assert.match(html, /等待核验/);
    assert.doesNotMatch(html, /NaN|Infinity|49,000.00/);
  }
  assert.doesNotThrow(() => M.render(null));
});

test('zero equity does not divide by zero and the module never mutates its source view', () => {
  const M = load(), v = view();
  v.legs.candidate = {equity: 0, cash: 0, marketValue: 0, invested: 0, holdings: []};
  const before = structuredClone(v);
  const freeze = x => {if (x && typeof x === 'object') {Object.values(x).forEach(freeze);Object.freeze(x);}};
  freeze(v);
  const s = M.build(v), html = M.render(v);
  assert.equal(s.exposure, null);
  assert.doesNotMatch(html, /NaN|Infinity/);
  assert.deepEqual(v, before);
  assert.equal(s.investmentReady, false);
  assert.equal(s.verifiedProfitProbability, null);
  assert.equal(s.realOrdersAllowed, false);
});


test('overview accepts a view produced by the real frozen-account builder using isolated synthetic inputs', () => {
  const M = load(), C = require('../scripts/paired-forward-core.js');
  const Audit = require('../assets/audit-identity.js'), Market = require('../assets/market.js');
  const Calendar = require('../assets/trading-calendar.js'), Paper = require('../assets/paper-engine.js');
  const Analysis = require('../assets/analysis.js'), View = require('../scripts/research-account-view.js');
  const universe = Market.UNIVERSE.filter(u => u.type === 'etf');
  const model = {eligible:true,horizon:20,cutoff:'2024-12-31',intercept:.5,means:Array(11).fill(0),scales:Array(11).fill(1),coefficients:Array(11).fill(0),residualQuantiles:[0,0]};
  const protocol = C.defineProtocol({
    id:'synthetic-manager-overview',declaredAt:'2026-10-20T08:00:00Z',
    entryAfter:'2026-10-21T01:30:00Z',latestEntry:'2026-10-21T01:35:00Z',
    universe,model,sourceModelHash:Audit.hash(model),capitalProfile:'capital50k-risk500-v1'
  });
  const histories = {};
  for(const u of universe){
    histories[u.symbol] = [];
    for(let d='2026-07-01';d<='2026-10-20';d=Calendar.nextSession(d))
      histories[u.symbol].push({date:d,open:1,close:1,high:1.01,low:.99,volume:1000});
  }
  const at='2026-10-21T01:30:00Z';
  const input={at,responseReceivedAt:at,histories,
    historyStatuses:universe.map(u=>({symbol:u.symbol,ok:true,dataAsOf:'2026-10-20',expectedAsOf:'2026-10-20'})),
    quotes:Object.fromEntries(universe.map(u=>[u.symbol,{price:1,open:1,sourceTime:'2026-10-21 09:30:00',receivedAt:at}]))
  };
  const advanced=C.advance(C.initialState(protocol),input,protocol,{Market,Calendar,Paper,Analysis});
  const manifest={schema:'paired-native-forward-v1',id:protocol.id,protocol};
  const claim={id:protocol.id,protocolHash:Audit.hash(protocol),collectorManifestHash:Audit.hash(manifest)};
  const producerView=View.build({manifest,claim,state:advanced.state,status:{at:advanced.state.lastDecisionAt,sequence:advanced.state.sequence,dataHealth:{ok:true}}},'2026-10-21T01:30:05Z');
  const before=structuredClone(producerView), summary=M.build(producerView);
  assert.equal(summary.available,true);
  assert.equal(summary.action.code,'t_plus_one');
  assert.equal(summary.cash,producerView.legs.candidate.cash);
  assert.equal(summary.exposure,producerView.legs.candidate.marketValue/producerView.legs.candidate.equity);
  assert.equal(summary.model.hash,protocol.sourceModelHash);
  assert.match(M.render(producerView),/2026-10-21 09:30:00/);
  assert.deepEqual(producerView,before);
});


test('manager displays source net profit drawdown and current 500 warning without recalculating or merging accounts', () => {
  const M=load(),v=view();
  v.legs.candidate.netPnl=-987.65;
  v.legs.candidate.drawdown=654.32;
  v.legs.candidate.warning=true;
  v.legs.control={netPnl:999999,drawdown:999999,warning:false};
  const before=structuredClone(v),s=M.build(v),html=M.render(v);
  assert.deepEqual(s.risk,{netPnl:-987.65,drawdown:654.32,warning:true,warningAmount:500});
  assert.ok(html.includes('-987.65元'));
  assert.ok(html.includes('654.32元'));
  assert.ok(html.includes('500元警戒：当前达到'));
  assert.ok(html.includes('当前峰谷回撤'));
  assert.ok(!html.includes('999,999'));
  assert.deepEqual(v,before);
});

test('manager current warning below threshold never erases historical breaches', () => {
  const M=load(),v=view();
  Object.assign(v.legs.candidate,{netPnl:12.34,drawdown:100.12,warning:false});
  const html=M.render(v);
  assert.ok(html.includes('+12.34元'));
  assert.ok(html.includes('500元警戒：当前未达到'));
  assert.ok(html.includes('当前未达到不代表历史从未超限'));
  assert.ok(!html.includes('历史从未超限，风险安全'));
});

test('manager missing or invalid risk fields remain unverified without losing verified equity', () => {
  const M=load(),base=view();
  assert.equal(M.build(base).risk,null);
  assert.match(M.render(base),/风险暂不可核对/);
  for(const fields of [
    {netPnl:-100,drawdown:NaN,warning:false},
    {netPnl:Infinity,drawdown:100,warning:true},
    {netPnl:-100,drawdown:-1,warning:false},
    {netPnl:-100,drawdown:100,warning:'false'}
  ]){
    const v=view();Object.assign(v.legs.candidate,fields);
    const summary=M.build(v);
    assert.equal(summary.available,true);
    assert.equal(summary.risk,null);
    assert.equal(summary.equity,49000);
    assert.match(M.render(v),/风险暂不可核对/);
  }
});
