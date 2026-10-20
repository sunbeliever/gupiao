(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ForecastJournal = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function copy(x) { return JSON.parse(JSON.stringify(x)); }
  function finite(x) { return typeof x === 'number' && Number.isFinite(x); }
  function time(date, clock) { return Date.parse(date + 'T' + clock + '+08:00'); }
  function dateValid(d) { return /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(time(d, '15:00:00')); }
  function mean(a) { return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : null; }
  function create(store, analysis) {
    var index = store.read('forecast.index'), months = Array.isArray(index) ? index.filter(function (m) { return /^\d{6}$/.test(m); }).sort().slice(-24) : [];
    var docs = {}, lastError = '';
    months.forEach(function (m) { var d = store.read('forecast.' + m); if (d && d.schema === 1 && Array.isArray(d.records) && Array.isArray(d.models)) docs[m] = d; });
    function records() {
      var out = [];
      Object.keys(docs).sort().forEach(function (m) { out = out.concat(docs[m].records); });
      return copy(out.sort(function (a, b) { return a.publishedAt.localeCompare(b.publishedAt) || a.symbol.localeCompare(b.symbol); }));
    }
    function refresh(input) {
      lastError = '';
      var now = input.now === undefined ? Date.now() : Date.parse(input.now);
      if (!Number.isFinite(now)) return { saved: false, error: 'invalid_clock' };
      var publishedAt = new Date(now).toISOString(), month = new Date(now + 8 * 3600000).toISOString().slice(0, 7).replace('-', '');
      var dates = {}, maps = {}, histories = input.histories || {};
      Object.keys(histories).forEach(function (s) {
        maps[s] = {};
        (histories[s] || []).forEach(function (b) {
          if (b && dateValid(b.date) && time(b.date, '15:00:00') <= now && finite(b.open) && finite(b.close) && b.open > 0 && b.close > 0) { maps[s][b.date] = b; dates[b.date] = true; }
        });
      });
      var calendar = Object.keys(dates).sort(), knownThrough = calendar[calendar.length - 1] || '', working = copy(docs), changed = {};
      // Only subsequently observed sessions determine entry/exit. Missing symbol bars never shift dates.
      Object.keys(working).forEach(function (m) {
        working[m].records.forEach(function (r) {
          if (r.status !== 'pending') return;
          var t = calendar.indexOf(r.asOf), entryDate = calendar[t + 1], exitDate = calendar[t + r.horizon + 1];
          if (t < 0 || !entryDate) return;
          if (Date.parse(r.publishedAt) >= time(entryDate, '09:30:00') || entryDate <= r.knownThrough) {
            r.status = 'excluded'; r.reason = 'published_after_entry'; r.resolvedAt = publishedAt; changed[m] = true; return;
          }
          if (!exitDate || time(exitDate, '15:00:00') > now) return;
          var entry = maps[r.symbol] && maps[r.symbol][entryDate], exit = maps[r.symbol] && maps[r.symbol][exitDate];
          if (!entry || !exit) return;
          var actual = exit.open / entry.open - 1;
          r.status = 'scored'; r.resolvedAt = publishedAt;
          r.outcome = { entryDate: entryDate, exitDate: exitDate, entryOpen: entry.open, exitOpen: exit.open, actualReturn: actual,
            absoluteError: Math.abs(r.expectedReturn - actual), zeroError: Math.abs(actual), meanError: Math.abs(r.baselineMean - actual),
            directionCorrect: (r.expectedReturn >= 0) === (actual >= 0), alwaysUpCorrect: actual >= 0 };
          changed[m] = true;
        });
      });
      var existing = {};
      Object.keys(working).forEach(function (m) { working[m].records.forEach(function (r) { existing[r.id] = true; }); });
      var model = input.model, horizon = model && model.horizon;
      if (model && model.eligible !== false && finite(model.intercept) && dateValid(model.cutoff) && Number.isInteger(horizon) && horizon > 0 && horizon <= 120) {
        Object.keys(input.predictions || {}).sort().forEach(function (s) {
          var p = input.predictions[s], bars = histories[s] || [], asOf = p && p.asOf, id = s + '|' + asOf + '|' + horizon;
          if (!p || !p.eligible || !finite(p.expectedReturn) || !dateValid(asOf) || existing[id] || model.cutoff > asOf || time(asOf, '15:00:00') > now) return;
          var snapshot = analysis.features(bars);
          if (snapshot.asOf !== asOf || !snapshot.values || !snapshot.values.every(finite)) return;
          var doc = working[month] || (working[month] = { schema: 1, models: [], records: [] });
          var modelJSON = JSON.stringify(model), modelRef = doc.models.findIndex(function (m) { return JSON.stringify(m) === modelJSON; });
          if (modelRef < 0) { modelRef = doc.models.length; doc.models.push(copy(model)); }
          doc.records.push({ id: id, symbol: s, asOf: asOf, publishedAt: publishedAt, horizon: horizon, modelRef: modelRef,
            modelVersion: model.version || '', modelCutoff: model.cutoff, features: snapshot, expectedReturn: p.expectedReturn,
            baselineMean: model.intercept, knownThrough: knownThrough, status: 'pending' });
          existing[id] = true; changed[month] = true;
        });
      }
      var saved = true;
      Object.keys(changed).sort().forEach(function (m) {
        try {
          if (months.indexOf(m) < 0) {
            var next = months.concat(m).sort().slice(-24);
            if (!store.write('forecast.index', next)) throw new Error('index_write_failed');
            months = next;
          }
          if (!store.write('forecast.' + m, working[m])) throw new Error('journal_write_failed');
          docs[m] = working[m];
        } catch (e) { saved = false; lastError = e.message || 'journal_write_failed'; }
      });
      Object.keys(docs).forEach(function (m) { if (months.indexOf(m) < 0) delete docs[m]; });
      return { saved: saved, error: lastError, count: records().length };
    }
    function summary() {
      var all = records(), scored = all.filter(function (r) { return r.status === 'scored'; }), days = {};
      scored.forEach(function (r) { days[r.asOf] = true; });
      return { total: all.length, scored: scored.length, signalDayCount: Object.keys(days).length,
        pending: all.filter(function (r) { return r.status === 'pending'; }).length, excluded: all.filter(function (r) { return r.status === 'excluded'; }).length,
        mae: mean(scored.map(function (r) { return r.outcome.absoluteError; })), zeroMae: mean(scored.map(function (r) { return r.outcome.zeroError; })),
        trainingMeanMae: mean(scored.map(function (r) { return r.outcome.meanError; })), directionAccuracy: mean(scored.map(function (r) { return +r.outcome.directionCorrect; })),
        alwaysUpAccuracy: mean(scored.map(function (r) { return +r.outcome.alwaysUpCorrect; })), forwardVerified: false, error: lastError };
    }
    return { refresh: refresh, records: records, summary: summary };
  }
  return { create: create };
}));
