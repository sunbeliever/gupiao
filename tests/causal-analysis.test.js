'use strict';
// Reconstructed A06 fixtures; these are not the missing independent review's scripts.
const test = require('node:test');
const assert = require('node:assert/strict');
const Analysis = require('../assets/analysis.js');
const Audit = require('../assets/audit-identity.js');

function fixture() {
  const rows = [], day = new Date('2023-01-02T00:00:00Z');
  while (rows.length < 900) {
    if (day.getUTCDay() !== 0 && day.getUTCDay() !== 6) {
      const open = 100 * Math.pow(1.001, rows.length);
      rows.push({date:day.toISOString().slice(0,10),open,close:open,high:open*1.01,low:open*.99,volume:100});
    }
    day.setUTCDate(day.getUTCDate()+1);
  }
  return {A:rows, B:rows.map(b=>({...b}))};
}
function mutateSession(data, symbol, date, change) {
  const b = data[symbol].find(b=>b.date===date); Object.assign(b,change(b));
}

test('A06: entry opening is invariant to later intraday range and total-day volume',()=>{
  const data=fixture(), before=Analysis.evaluate(data,2025), first=before.trades[0];
  mutateSession(data,first.symbol,first.entryDate,b=>({high:b.open,low:b.open,close:b.open,volume:0}));
  const after=Analysis.evaluate(data,2025), changed=after.trades.find(t=>t.symbol===first.symbol&&t.entryDate===first.entryDate);
  assert.equal(first.entered,true); assert.equal(changed.entered,true);
  assert.equal(changed.entryPrice,first.entryPrice);
  assert.equal(changed.entryExecution.assumption,'opening_price_hypothetical');
  assert.equal(changed.entryExecution.verified,false);
});

test('A06: missing end-of-day range/volume cannot move a valid opening order to a later date',()=>{
  const data=fixture(), first=Analysis.evaluate(data,2025).trades[0];
  for (const symbol of Object.keys(data)) mutateSession(data,symbol,first.entryDate,()=>({high:null,low:null,volume:null}));
  const after=Analysis.evaluate(data,2025), changed=after.trades.find(t=>t.symbol===first.symbol&&t.entryDate===first.entryDate);
  assert.ok(changed); assert.equal(changed.entered,true); assert.equal(changed.entryPrice,first.entryPrice);
});

for (const [name, change, code] of [
  ['explicit halt',()=>({halted:true}),'halted'],
  ['explicit opening rejection',()=>({openTradable:false}),'open_not_tradable'],
  ['explicit opening order rejection',()=>({openOrderRejected:true}),'order_rejected'],
  ['explicit upper-limit buy block',()=>({buyLimitBlocked:true}),'buy_limit_blocked'],
  ['explicit opening upper-limit status',()=>({tradeStatus:'limit_up'}),'buy_limit_blocked'],
  ['missing opening price',()=>({open:null}),'missing_open']
]) test('A06: '+name+' rejects the opening order without replacement',()=>{
  const data=fixture(), first=Analysis.evaluate(data,2025).trades[0];
  mutateSession(data,first.symbol,first.entryDate,change);
  const trade=Analysis.evaluate(data,2025).trades.find(t=>t.symbol===first.symbol&&t.entryDate===first.entryDate);
  assert.equal(trade.entered,false); assert.equal(trade.entryExecution.reason,code);
  assert.equal(trade.entryPrice,null); assert.equal(trade.netReturn,0);
});

test('A06: rejected exit stays open, is marked later and cannot finance another interval',()=>{
  const data=fixture(), first=Analysis.evaluate(data,2025).trades[0];
  mutateSession(data,first.symbol,first.exitDate,()=>({sellLimitBlocked:true}));
  const r=Analysis.evaluate(data,2025), t=r.trades.find(t=>t.symbol===first.symbol&&t.entryDate===first.entryDate);
  assert.equal(r.executionMode,'independent_interval_research');
  assert.equal(r.executableAccount,false); assert.equal(r.availableCash,null);
  assert.equal(t.positionState,'open_exit_blocked'); assert.equal(t.netReturn,null);
  assert.equal(t.exitFeeCharged,false); assert.ok(Number.isFinite(t.unrealizedReturn));
  assert.ok(r.openPositions.some(p=>p.symbol===first.symbol&&p.entryDate===first.entryDate));
  assert.equal(r.trades.filter(x=>x.entryDate>first.exitDate).length,0);
  assert.equal(r.curve.at(-1).date,r.asOf);
});

test('prediction states exact timing contract without inventing its reference open',()=>{
  const data=fixture().A.slice(0,520), model=Analysis.train({A:data},{cutoff:data.at(-1).date});
  const p=Analysis.predict(model,data);
  assert.equal(p.signalDate,p.asOf); assert.equal(p.horizon,20); assert.equal(p.referenceOpen,null);
  assert.ok(Object.hasOwn(p,'entrySession')); assert.ok(Object.hasOwn(p,'maturitySession'));
  assert.ok(['available','unavailable'].includes(p.signalContract.status));
  const source={publishedAt:'2024-12-27T08:05:00.000Z',firstReceivedAt:'2024-12-27T08:06:00.000Z'};
  const received=Analysis.predict(model,data,source);
  assert.equal(received.publishedAt,source.publishedAt); assert.equal(received.firstReceivedAt,source.firstReceivedAt);
});

test('prediction calendar overflow is unavailable instead of fabricating dates or throwing',()=>{
  const data=fixture().A.slice(0,520).map(b=>({...b,date:'2027'+b.date.slice(4)}));
  const p=Analysis.predict(Analysis.train({A:data},{cutoff:data.at(-1).date}),data);
  assert.equal(p.entrySession,null); assert.equal(p.maturitySession,null); assert.equal(p.signalContract.status,'unavailable');
});

test('independent research report and each trade bind their own model, rules and historical inputs',()=>{
  const data=fixture(), r=Analysis.evaluate(data,2025), first=r.trades[0];
  assert.equal(r.strategy_id,'ridge11-independent-interval-causal-v2');
  assert.equal(first.strategy_id,r.strategy_id);
  assert.equal(r.execution_mode,'independent_interval_research');
  assert.equal(first.execution_mode,r.execution_mode);
  for (const x of [r,first]) {
    for (const key of ['model_hash','rules_hash','data_hash']) assert.match(x[key],/^[a-f0-9]{64}$/);
    assert.match(x.universe_version,/^sha256:/);
    assert.equal(x.fee_profile.version,'legacy-interval-rate-v1');
    assert.equal(x.budget,null); assert.equal(x.risk_limits.notExecutable,true);
    assert.equal(x.universeBias,'survivorship_bias');
  }
  const frozen=Analysis.train(data,{cutoff:'2024-12-31'});
  assert.equal(first.model_hash,Audit.hash(frozen));
  const changed=JSON.parse(JSON.stringify(data));
  mutateSession(changed,first.symbol,first.entryDate,b=>({open:b.open*1.001,high:b.high*1.001}));
  const later=Analysis.evaluate(changed,2025);
  assert.notEqual(later.data_hash,r.data_hash);
  assert.equal(later.trades[0].data_hash,first.data_hash,'entry outcomes cannot rewrite frozen signal input identity');
  assert.equal(later.rules_hash,r.rules_hash); assert.equal(later.model_hash,r.model_hash);
});
