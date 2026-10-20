'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Analysis = require('../assets/analysis.js');
function bars(n, start = '2023-01-02', phase = 0) {
  const result = [], day = new Date(start + 'T00:00:00Z');
  while (result.length < n) {
    if (day.getUTCDay() !== 0 && day.getUTCDay() !== 6) {
      const i = result.length, open = 100 * Math.exp(i * .0003 + .03 * Math.sin(i / 15 + phase));
      const close = open * (1 + .002 * Math.sin(i / 4 + phase));
      result.push({ date: day.toISOString().slice(0, 10), open, close, high: Math.max(open, close) * 1.01, low: Math.min(open, close) * .99, volume: 10000 + i * 10 + 2000 * Math.sin(i / 8) });
    }
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return result;
}
function histories(n = 1000) { return { A: bars(n), B: bars(n, '2023-01-02', 1), C: bars(n, '2023-01-02', 2), D: bars(n, '2023-01-02', 3) }; }
function near(actual, expected, epsilon = 1e-10) { assert.ok(Math.abs(actual - expected) < epsilon, actual + ' != ' + expected); }
test('UMD exposes the same public contracts in a browser', () => {
  const sandbox = {}; vm.runInNewContext(fs.readFileSync(require.resolve('../assets/analysis.js'), 'utf8'), sandbox);
  for (const name of ['indicators', 'train', 'predict', 'evaluate', 'updateChampion']) assert.equal(typeof sandbox.Analysis[name], 'function');
});
test('flat prices have neutral RSI, zero momentum, volatility and drawdown', () => {
  const data = bars(70).map(b => ({ ...b, open: 100, close: 100, high: 100, low: 100, volume: 100 }));
  const p = Analysis.indicators(data);
  assert.equal(p.rsi, 50); assert.equal(p.ma60, 100); assert.equal(p.momentum20, 0); assert.equal(p.volatility, 0); assert.equal(p.drawdown, 0); assert.equal(p.volumeRatio, 1); assert.equal(p.atr, 0);
});

test('same-fold baselines expose that a predictable positive trend is not investment proof',()=>{
  const data=bars(900).map((b,i)=>{const p=100*Math.pow(1.01,i);return {...b,open:p,close:p,high:p*1.001,low:p*.999,volume:100};});
  const r=Analysis.evaluate({A:data},2025,{alpha:1});
  near(r.baselines.zeroReturn.mae,0.220190039947967,1e-10);
  near(r.baselines.alwaysUp.directionAccuracy,1);near(r.baselines.trainingMean.mae,0,1e-10);
  assert.equal(r.readiness.status,'unproven');assert.equal(r.readiness.forwardVerified,false);
});

test('public feature snapshot reconstructs the prediction without later data',()=>{
  const data=bars(240),model=Analysis.train({A:data},{cutoff:data.at(-1).date});
  const x=Analysis.features(data);assert.equal(x.values.length,model.coefficients.length);
  const reconstructed=model.intercept+x.values.reduce((s,v,j)=>s+model.coefficients[j]*(v-model.means[j])/model.scales[j],0);
  near(reconstructed,Analysis.predict(model,data).expectedReturn);assert.equal(x.asOf,data.at(-1).date);
});
test('moving averages, momentum, RSI and ATR match a hand-calculated rising series', () => {
  const data = bars(70).map((b, i) => ({ ...b, open: 100 + i, close: 100 + i, high: 101 + i, low: 99 + i, volume: 100 }));
  const p = Analysis.indicators(data);
  near(p.ma5, 167); near(p.ma20, 159.5); near(p.ma60, 139.5); near(p.momentum5, 169 / 164 - 1); near(p.momentum60, 169 / 109 - 1); near(p.rsi, 100); near(p.atr, 2);
});
test('training uses next open to open 20 sessions later and only matured labels', () => {
  const data = bars(180); const model = Analysis.train({ A: data }, { cutoff: data.at(-1).date });
  assert.equal(model.sampleCount, 99); assert.equal(model.labelEndMax, data.at(-1).date); assert.equal(model.horizon, 20);
  near(model.intercept, Array.from({ length: 99 }, (_, j) => data[j + 81].open / data[j + 61].open - 1).reduce((a, b) => a + b, 0) / 99);
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(model)));
});
test('future prices cannot alter a cutoff model or a historical prediction', () => {
  const data = bars(240), cutoff = data[179].date;
  const changed = data.map((b, i) => i > 179 ? { ...b, open: b.open * 3, close: b.close * 3, high: b.high * 3, low: b.low * 3 } : { ...b });
  const original = Analysis.train({ A: data }, { cutoff });
  assert.deepEqual(Analysis.train({ A: changed }, { cutoff }), original);
  assert.deepEqual(Analysis.train({ A: data.slice(0, 180) }, { cutoff }), original);
  assert.ok(original.labelEndMax <= cutoff); assert.ok(original.lastSignalDate < cutoff);
});
test('prediction contributions add exactly to the predicted return', () => {
  const data = bars(240); const model = Analysis.train({ A: data }, { cutoff: data.at(-1).date });
  const prediction = Analysis.predict(model, data);
  assert.equal(prediction.eligible, true); near(prediction.contributions.reduce((s, x) => s + x.value, 0), prediction.expectedReturn);
  assert.ok(prediction.interval[0] <= prediction.expectedReturn && prediction.interval[1] >= prediction.expectedReturn);
  assert.equal(prediction.asOf, data.at(-1).date); assert.ok(prediction.risks.length > 0);
});
test('short or invalid history is ineligible instead of fabricating a prediction', () => {
  const m = Analysis.train({ A: bars(180) }, {});
  assert.equal(Analysis.predict(m, bars(30)).eligible, false);
  assert.equal(Analysis.predict(m, [{ date: 'bad', open: -1, close: NaN }]).eligible, false);
  assert.equal(Analysis.train({}, {}).eligible, false);
  assert.equal(Analysis.predict(m, bars(70).map(b => ({ ...b, volume: 0 }))).eligible, false);
});
test('2025 is frozen and 2026 monthly training ends before each signal', () => {
  const data = histories(); const frozen = Analysis.evaluate(data, 2025);
  assert.ok(frozen.sampleCount > 0); assert.ok(frozen.trades.length > 0); assert.ok(frozen.asOf <= '2025-12-31'); assert.ok(frozen.curve.every(p => p.date <= '2025-12-31'));
  for (const t of frozen.trades) { assert.ok(t.trainingCutoff <= '2024-12-31'); assert.ok(t.signalDate < t.entryDate && t.entryDate < t.exitDate); }
  const live = Analysis.evaluate(data, 2026, { cutoff: '2026-06-30' });
  assert.equal(live.asOf, '2026-06-30'); assert.ok(live.sampleCount > 0); assert.ok(live.notes.some(s => s.includes('滚动')));
  for (const t of live.trades) { assert.ok(t.trainingCutoff < t.signalDate); assert.ok(t.labelEndMax <= t.trainingCutoff); assert.ok(t.exitDate <= live.asOf); }
  assert.ok(live.curve.every(p => p.date <= live.asOf));
});
test('fees reduce interval performance and benchmarks use the same instrument pool', () => {
  const data = histories(); const free = Analysis.evaluate(data, 2025, { feeRate: 0 }); const paid = Analysis.evaluate(data, 2025, { feeRate: .0015 });
  assert.ok(paid.strategyReturn < free.strategyReturn); assert.ok(paid.benchmarkReturn < free.benchmarkReturn);
  assert.ok(paid.notes.some(s => s.includes('幸存者'))); assert.ok(paid.notes.some(s => s.includes('每边'))); assert.ok(Number.isFinite(paid.maxDrawdown));
});
test('explicit opening halt remains cash and is not replaced using future outcomes', () => {
  const data = histories(); const base = Analysis.evaluate(data, 2025);
  const entryDate = base.trades[0].entryDate;
  for (const b of Object.values(data).flat()) if (b.date === entryDate) b.halted = true;
  const blocked = Analysis.evaluate(data, 2025);
  assert.ok(blocked.trades.some(t => t.entryDate === entryDate && !t.entered));
});
test('champion updates require a temporal comparison and enough unseen observations', () => {
  const data = histories(); const old = Analysis.train(data, { cutoff: '2025-12-31' });
  const short = Analysis.updateChampion(data, old, { cutoff: '2026-01-15' });
  assert.equal(short.accepted, false); assert.deepEqual(short.model, old); assert.ok(short.reason);
  const update = Analysis.updateChampion(data, old, { cutoff: '2026-06-30' });
  assert.ok(update.comparison); assert.ok(update.comparison.validationStart > old.cutoff);
  assert.ok(update.comparison.candidateTrainingCutoff < update.comparison.validationStart);
  if (update.accepted) assert.ok(update.comparison.candidateMae <= update.comparison.championMae * .98);
});
test('invalid parameters are rejected and caller data remains untouched', () => {
  const data = histories(180), copy = JSON.stringify(data);
  Analysis.train(data, {}); Analysis.evaluate(data, 2025);
  assert.equal(JSON.stringify(data), copy);
  assert.throws(() => Analysis.train(data, { horizon: 0 }), /horizon/);
  assert.throws(() => Analysis.evaluate(data, 2025, { feeRate: -1 }), /feeRate/);
});

test('reports before the data start contain no future samples or prices', () => {
  const report = Analysis.evaluate(histories(), 2025, { cutoff: '2022-12-31' });
  assert.equal(report.asOf, null); assert.equal(report.sampleCount, 0); assert.deepEqual(report.curve, []); assert.deepEqual(report.trades, []);
});
test('2025 results and partial 2026 results cannot change when later prices change', () => {
  const data = histories(), changed = JSON.parse(JSON.stringify(data));
  for (const b of Object.values(changed).flat()) if (b.date > '2026-06-30') { b.open *= 3; b.close *= 3; b.high *= 3; b.low *= 3; }
  assert.deepEqual(Analysis.evaluate(changed, 2026, { cutoff: '2026-06-30' }), Analysis.evaluate(data, 2026, { cutoff: '2026-06-30' }));
  for (const b of Object.values(changed).flat()) if (b.date > '2025-12-31') { b.open *= 3; b.close *= 3; b.high *= 3; b.low *= 3; }
  assert.deepEqual(Analysis.evaluate(changed, 2025), Analysis.evaluate(data, 2025));
});
