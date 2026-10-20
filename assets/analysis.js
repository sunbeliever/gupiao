(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Analysis = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  var FEATURES = ['ma5Gap', 'ma20Gap', 'ma60Gap', 'rsi14', 'momentum5', 'momentum20', 'momentum60', 'volatility20', 'volumeRatio', 'drawdown60', 'atr14'];
  var NAMES = ['距MA5', '距MA20', '距MA60', 'RSI14', '5日动量', '20日动量', '60日动量', '20日波动', '量比', '60日回撤', 'ATR14'];
  var MIN_SAMPLES = 40;
  var RISKS = ['技术因子无法保证收益，预测可能为负或失准。', '参考区间来自训练残差，并非经过校准的置信区间。', '固定研究池存在幸存者偏差；后复权价格不代表真实成交价格。'];
  function tradingCalendar() {
    if (root.TradingCalendar) return root.TradingCalendar;
    if (typeof require === 'function') { try { return require('./trading-calendar.js'); } catch (_) { return null; } }
    return null;
  }
  function auditIdentity() {
    if (root.AuditIdentity) return root.AuditIdentity;
    if (typeof require === 'function') { try { return require('./audit-identity.js'); } catch (_) { return null; } }
    return null;
  }
  function finite(x) { return typeof x === 'number' && Number.isFinite(x); }
  function validDate(x) {
    if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return false;
    var d = new Date(x + 'T00:00:00Z'); return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === x;
  }
  function mean(a) { return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : 0; }
  function quantile(a, q) {
    if (!a.length) return 0;
    var v = a.slice().sort(function (x, y) { return x - y; }), p = (v.length - 1) * q, i = Math.floor(p);
    return v[i] + (v[Math.min(i + 1, v.length - 1)] - v[i]) * (p - i);
  }
  function normalize(bars) {
    var byDate = {};
    (Array.isArray(bars) ? bars : []).forEach(function (b) {
      if (!b || !validDate(b.date)) return;
      if (![b.open, b.close, b.high, b.low, b.volume].every(finite) || Math.min(b.open, b.close, b.high, b.low) <= 0 || b.volume < 0) return;
      if (b.high < Math.max(b.open, b.close, b.low) || b.low > Math.min(b.open, b.close, b.high)) return;
      byDate[b.date] = { date: b.date, open: b.open, close: b.close, high: b.high, low: b.low, volume: b.volume };
    });
    return Object.keys(byDate).sort().map(function (d) { return byDate[d]; });
  }
  function summarize(bars) {
    var n = bars.length, last = bars[n - 1], result = {};
    function ma(period) { return n >= period ? mean(bars.slice(-period).map(function (b) { return b.close; })) : null; }
    function momentum(period) { return n > period ? last.close / bars[n - 1 - period].close - 1 : null; }
    result.ma5 = ma(5); result.ma20 = ma(20); result.ma60 = ma(60);
    result.momentum5 = momentum(5); result.momentum20 = momentum(20); result.momentum60 = momentum(60);
    result.rsi = null; result.volatility = null; result.drawdown = null; result.volumeRatio = null; result.atr = null;
    if (n >= 15) {
      var gain = 0, loss = 0, tr = [];
      for (var i = n - 14; i < n; i++) {
        var change = bars[i].close - bars[i - 1].close;
        gain += Math.max(0, change); loss += Math.max(0, -change);
        tr.push(Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - bars[i - 1].close), Math.abs(bars[i].low - bars[i - 1].close)));
      }
      result.rsi = gain === 0 && loss === 0 ? 50 : loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
      result.atr = mean(tr);
    }
    if (n >= 21) {
      var returns = [], volumeMean = mean(bars.slice(-21, -1).map(function (b) { return b.volume; }));
      for (var k = n - 20; k < n; k++) returns.push(Math.log(bars[k].close / bars[k - 1].close));
      var avg = mean(returns);
      result.volatility = Math.sqrt(mean(returns.map(function (x) { return (x - avg) * (x - avg); })) * 252);
      result.volumeRatio = volumeMean > 0 ? last.volume / volumeMean : null;
    }
    if (n >= 60) {
      var peak = 0, drawdown = 0;
      bars.slice(-60).forEach(function (b) { peak = Math.max(peak, b.close); drawdown = Math.max(drawdown, 1 - b.close / peak); });
      result.drawdown = drawdown;
    }
    return result;
  }
  function indicators(bars) { return summarize(normalize(bars)); }
  function vector(bars) {
    if (bars.length < 61) return null;
    var p = summarize(bars.slice(-61)), close = bars[bars.length - 1].close;
    var x = [close / p.ma5 - 1, close / p.ma20 - 1, close / p.ma60 - 1, (p.rsi - 50) / 50,
      p.momentum5, p.momentum20, p.momentum60, p.volatility, p.volumeRatio === null ? 0 : Math.log(Math.max(.01, p.volumeRatio)), p.drawdown, p.atr / close];
    return x.every(finite) ? x : null;
  }
  function features(bars) {
    var clean = normalize(bars);
    return { names: FEATURES.slice(), values: vector(clean), asOf: clean.length ? clean[clean.length - 1].date : null };
  }
  function options(opts, ctx) {
    opts = opts || {};
    var horizon = opts.horizon === undefined ? 20 : opts.horizon, alpha = opts.alpha === undefined ? .1 : opts.alpha;
    if (!Number.isInteger(horizon) || horizon < 1 || horizon > 120) throw new Error('horizon must be an integer between 1 and 120');
    if (!finite(alpha) || alpha <= 0) throw new Error('alpha must be positive');
    var cutoff = opts.cutoff === undefined ? (ctx.calendar[ctx.calendar.length - 1] || null) : opts.cutoff;
    if (cutoff !== null && !validDate(cutoff)) throw new Error('cutoff must be YYYY-MM-DD');
    return { horizon: horizon, alpha: alpha, cutoff: cutoff };
  }
  function context(histories) {
    var symbols = Object.keys(histories || {}).sort(), calendar = {}, series = {}, maps = {}, indices = {};
    symbols.forEach(function (s) {
      series[s] = normalize(histories[s]); maps[s] = {}; indices[s] = {};
      series[s].forEach(function (b, i) { calendar[b.date] = true; maps[s][b.date] = b; indices[s][b.date] = i; });
    });
    return { symbols: symbols, series: series, maps: maps, indices: indices, calendar: Object.keys(calendar).sort() };
  }
  // The horizon is defined on the shared observed trading calendar, not rows pooled across symbols.
  function records(ctx, horizon, cutoff) {
    var result = [], dates = ctx.calendar;
    for (var t = 0; t + horizon + 1 < dates.length; t++) {
      var endDate = dates[t + horizon + 1];
      if (cutoff && endDate > cutoff) break;
      ctx.symbols.forEach(function (s) {
        var index = ctx.indices[s][dates[t]], entry = ctx.maps[s][dates[t + 1]], exit = ctx.maps[s][endDate];
        if (index === undefined || index < 60 || !entry || !exit) return;
        var x = vector(ctx.series[s].slice(Math.max(0, index - 60), index + 1));
        if (!x) return;
        result.push({ symbol: s, date: dates[t], entryDate: dates[t + 1], exitDate: endDate, x: x, y: exit.open / entry.open - 1 });
      });
    }
    return result;
  }
  function solve(a, b) {
    var n = b.length, m = a.map(function (row, i) { return row.slice().concat(b[i]); });
    for (var c = 0; c < n; c++) {
      var pivot = c;
      for (var r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[pivot][c])) pivot = r;
      var swap = m[c]; m[c] = m[pivot]; m[pivot] = swap;
      if (Math.abs(m[c][c]) < 1e-14) throw new Error('singular ridge matrix');
      var scale = m[c][c]; for (var j = c; j <= n; j++) m[c][j] /= scale;
      for (var row = 0; row < n; row++) if (row !== c) {
        var factor = m[row][c]; for (var col = c; col <= n; col++) m[row][col] -= factor * m[c][col];
      }
    }
    return m.map(function (row) { return row[n]; });
  }
  function score(model, x) {
    return model.intercept + x.reduce(function (s, value, j) { return s + model.coefficients[j] * (value - model.means[j]) / model.scales[j]; }, 0);
  }
  function fit(samples, opt, symbols) {
    var model = { schemaVersion: 1, kind: 'standardized-ridge', version: 'ridge-' + opt.horizon + '-' + opt.alpha + '-' + (opt.cutoff || 'empty') + '-' + samples.length,
      horizon: opt.horizon, alpha: opt.alpha, cutoff: opt.cutoff, sampleCount: samples.length, eligible: samples.length >= MIN_SAMPLES,
      featureNames: FEATURES.slice(), means: FEATURES.map(function () { return 0; }), scales: FEATURES.map(function () { return 1; }),
      coefficients: FEATURES.map(function () { return 0; }), intercept: 0, residualQuantiles: [0, 0], residualStd: null,
      labelEndMax: null, lastSignalDate: null, symbols: symbols.slice(), trainingMae: null,
      notes: ['预测目标为信号次日开盘至20交易日后开盘的后复权收益。', '标准化仅拟合训练样本；RSI采用最近14次涨跌简单均值。', '参考区间为训练残差10%至90%分位，不代表置信保证。'] };
    if (!samples.length) return model;
    model.labelEndMax = samples.reduce(function (max, r) { return r.exitDate > max ? r.exitDate : max; }, '');
    model.lastSignalDate = samples.reduce(function (max, r) { return r.date > max ? r.date : max; }, '');
    model.intercept = mean(samples.map(function (r) { return r.y; }));
    model.means = FEATURES.map(function (_, j) { return mean(samples.map(function (r) { return r.x[j]; })); });
    model.scales = FEATURES.map(function (_, j) {
      var sd = Math.sqrt(mean(samples.map(function (r) { return Math.pow(r.x[j] - model.means[j], 2); })));
      return sd < 1e-10 ? 1 : sd;
    });
    var a = FEATURES.map(function () { return FEATURES.map(function () { return 0; }); }), b = FEATURES.map(function () { return 0; });
    samples.forEach(function (sample) {
      var z = sample.x.map(function (x, j) { return (x - model.means[j]) / model.scales[j]; });
      for (var i = 0; i < z.length; i++) {
        b[i] += z[i] * (sample.y - model.intercept);
        for (var j = 0; j < z.length; j++) a[i][j] += z[i] * z[j];
      }
    });
    for (var k = 0; k < FEATURES.length; k++) a[k][k] += opt.alpha * samples.length;
    model.coefficients = solve(a, b);
    var residuals = samples.map(function (r) { return r.y - score(model, r.x); });
    model.residualQuantiles = [Math.min(0, quantile(residuals, .1)), Math.max(0, quantile(residuals, .9))];
    model.residualStd = Math.sqrt(mean(residuals.map(function (r) { return r * r; })));
    model.trainingMae = mean(residuals.map(Math.abs));
    return model;
  }
  function train(histories, opts) {
    var ctx = context(histories), opt = options(opts, ctx);
    return fit(records(ctx, opt.horizon, opt.cutoff), opt, ctx.symbols);
  }
  function validModel(m) {
    return m && m.eligible && finite(m.intercept) && [m.means, m.scales, m.coefficients].every(function (a) { return Array.isArray(a) && a.length === FEATURES.length && a.every(finite); }) && m.scales.every(function (s) { return s > 0; });
  }
  function tradeable(bar) {
    return !!bar && bar.volume > 0 && (bar.high - bar.low) > bar.close * 1e-8;
  }
  // Completed signal-day bars may use volume/range. An opening order may not.
  function openingAssessment(bar, side) {
    var reason = null;
    if (!bar || !finite(bar.open) || bar.open <= 0) reason = 'missing_open';
    else if (bar.halted === true || bar.suspended === true || bar.tradeStatus === 'suspended') reason = 'halted';
    else if (bar.openTradable === false) reason = 'open_not_tradable';
    else if (bar.orderRejected === true || bar.openOrderRejected === true) reason = 'order_rejected';
    else if (side === 'buy' && (bar.buyLimitBlocked === true || bar.openBuyTradable === false || bar.limitUpBlocked === true || bar.tradeStatus === 'limit_up')) reason = 'buy_limit_blocked';
    else if (side === 'sell' && (bar.sellLimitBlocked === true || bar.openSellTradable === false || bar.limitDownBlocked === true || bar.tradeStatus === 'limit_down')) reason = 'sell_limit_blocked';
    return { allowed: !reason, reason: reason, assumption: reason ? 'opening_order_rejected' : 'opening_price_hypothetical', verified: false,
      priceBasis: 'daily_open', limitation: '日线开盘价假设，缺少订单簿、排队及真实成交确认。' };
  }
  function predict(model, input, metadata) {
    var bars = normalize(input), last = bars[bars.length - 1], reasons = [], x = vector(bars);
    if (!validModel(model)) reasons.push('模型成熟样本不足或模型参数无效。');
    if (!x) reasons.push('至少需要61根有效完整日线。');
    if (last && !tradeable(last)) reasons.push('最新日线成交量为零或只有单一价格，暂停研究信号。');
    if (last && model && model.cutoff && model.cutoff > last.date) reasons.push('模型训练截止日晚于该历史信号日，禁止历史前视预测。');
    var value = null, contributions = [], interval = [null, null];
    if (validModel(model) && x && !(last && model.cutoff > last.date)) {
      contributions.push({ name: '训练平均收益', value: model.intercept });
      x.forEach(function (v, j) { contributions.push({ name: NAMES[j], feature: FEATURES[j], value: model.coefficients[j] * (v - model.means[j]) / model.scales[j] }); });
      value = contributions.reduce(function (s, c) { return s + c.value; }, 0);
      var q = Array.isArray(model.residualQuantiles) ? model.residualQuantiles : [0, 0];
      interval = [value + Math.min(0, q[0] || 0), value + Math.max(0, q[1] || 0)];
    }
    var risks = RISKS.slice();
    if (x && validModel(model) && x.some(function (v, j) { return Math.abs((v - model.means[j]) / model.scales[j]) > 4; })) risks.push('当前参数远离训练分布，参考价值下降。');
    var cal = tradingCalendar(), signalDate = last ? last.date : null, horizon = model && Number.isInteger(model.horizon) ? model.horizon : 20;
    var entrySession = null, maturitySession = null;
    if (cal && signalDate) {
      try { entrySession = cal.nextSession(signalDate); maturitySession = cal.maturitySession(entrySession, horizon); }
      catch (e) { if (e.code !== 'calendar_uncovered') throw e; entrySession = null; maturitySession = null; }
    }
    metadata = metadata || {};
    return { expectedReturn: value, contributions: contributions, interval: interval, asOf: signalDate,
      signalDate: signalDate, horizon: horizon, entrySession: entrySession, maturitySession: maturitySession, referenceOpen: null,
      publishedAt: metadata.publishedAt || null, firstReceivedAt: metadata.firstReceivedAt || null,
      signalContract: { status: entrySession && maturitySession ? 'available' : 'unavailable', referenceOpenStatus: 'awaiting_entry_session_open',
        calendarVersion: cal ? cal.version : null,
        reason: entrySession && maturitySession ? null : '交易所日历未覆盖完整信号周期，不推算自然日或旧信号起点。' },
      eligible: reasons.length === 0, reasons: reasons, risks: risks, indicators: summarize(bars) };
  }
  function priorMonth(date) {
    var d = new Date(date + 'T00:00:00Z'); d.setUTCDate(0); return d.toISOString().slice(0, 10);
  }
  function metric(model, samples) {
    if (!validModel(model) || !samples.length) return { mae: null, directionAccuracy: null, sampleCount: 0 };
    return { sampleCount: samples.length, mae: mean(samples.map(function (r) { return Math.abs(score(model, r.x) - r.y); })),
      directionAccuracy: mean(samples.map(function (r) { return (score(model, r.x) >= 0) === (r.y >= 0) ? 1 : 0; })) };
  }
  function mark(ctx, symbol, date, useOpen) {
    var exact = ctx.maps[symbol][date]; if (exact) return useOpen ? exact.open : exact.close;
    var bars = ctx.series[symbol];
    for (var i = bars.length - 1; i >= 0; i--) if (bars[i].date < date) return bars[i].close;
    return null;
  }
  function evaluate(histories, year, opts) {
    var ctx = context(histories), opt = options(opts, ctx); opts = opts || {};
    var openingMaps = {}, observedDates = {};
    Object.keys(histories || {}).forEach(function (symbol) {
      openingMaps[symbol] = {};
      (Array.isArray(histories[symbol]) ? histories[symbol] : []).forEach(function (b) {
        if (b && validDate(b.date)) { openingMaps[symbol][b.date] = b; observedDates[b.date] = true; }
      });
    });
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error('year must be an integer');
    var fee = opts.feeRate === undefined ? .0015 : opts.feeRate;
    if (!finite(fee) || fee < 0 || fee > .1) throw new Error('feeRate must be between 0 and 0.1');
    var yearEnd = year + '-12-31';
    var dates = Object.keys(observedDates).sort().filter(function (d) { return d <= yearEnd && (!opt.cutoff || d <= opt.cutoff); });
    var asOf = dates.length ? dates[dates.length - 1] : null, models = {};
    var audit = auditIdentity(), signalIdentities = {};
    var legacyFees = { version: 'legacy-interval-rate-v1', ratePerSide: fee, minimumCommissionIncluded: false, stockTaxesIncluded: false, scope: 'independent_interval_research_only' };
    var researchRules = { version: 'causal-independent-interval-v2', horizon: opt.horizon, alpha: opt.alpha,
      modelSchedule: year >= 2026 ? 'mature_labels_prior_month' : 'mature_labels_prior_year_frozen',
      ranking: 'positive_prediction_top3_equal_weight', execution: 'daily_open_hypothetical',
      openingData: 'open_and_explicit_opening_controls_only', unresolvedExit: 'retain_mark_and_stop_reinvestment',
      account: 'normalized_research_index_not_cash_account' };
    function historicalInput(cutoff) {
      var data = {}, controls = ['halted', 'suspended', 'openTradable', 'orderRejected', 'openOrderRejected', 'buyLimitBlocked', 'sellLimitBlocked', 'openBuyTradable', 'openSellTradable', 'limitUpBlocked', 'limitDownBlocked', 'tradeStatus'];
      ctx.symbols.forEach(function (symbol) {
        data[symbol] = Object.keys(openingMaps[symbol]).sort().filter(function (date) { return cutoff && date <= cutoff; }).map(function (date) {
          var bar = openingMaps[symbol][date], row = { date: date };
          ['open', 'close', 'high', 'low', 'volume'].forEach(function (key) { row[key] = finite(bar[key]) ? bar[key] : null; });
          controls.forEach(function (key) { if (typeof bar[key] === 'boolean' || typeof bar[key] === 'string') row[key] = bar[key]; });
          return row;
        });
      });
      return data;
    }
    function fingerprint(model, cutoff) {
      if (!audit) return { identityStatus: 'unavailable', strategy_id: 'ridge11-independent-interval-causal-v2',
        execution_mode: 'independent_interval_research', model_hash: null, rules_hash: null, data_hash: null,
        universe_version: null, budget: null, risk_limits: { notExecutable: true }, fee_profile: legacyFees, universeBias: 'survivorship_bias' };
      var identity = audit.fingerprint({ strategyId: 'ridge11-independent-interval-causal-v2', model: model,
        universe: { symbols: ctx.symbols.slice().sort(), selection: 'caller_supplied_fixed_research_pool', survivorshipBias: true },
        rules: researchRules, data: historicalInput(cutoff), feeProfile: legacyFees, budget: null,
        riskLimits: { notExecutable: true, maxCandidates: 3, normalizedIndex: true }, executionMode: 'independent_interval_research' });
      identity.identityStatus = 'available'; identity.universeBias = 'survivorship_bias'; return identity;
    }
    function modelFor(date) {
      var cutoff = year >= 2026 ? priorMonth(date) : (year - 1) + '-12-31';
      if (!models[cutoff]) models[cutoff] = fit(records(ctx, opt.horizon, cutoff), { horizon: opt.horizon, alpha: opt.alpha, cutoff: cutoff }, ctx.symbols);
      return models[cutoff];
    }
    var evalRows = (asOf ? records(ctx, opt.horizon, asOf) : []).filter(function (r) { return Number(r.date.slice(0, 4)) === year; });
    var errors = [], directions = [], zeroErrors = [], meanErrors = [], meanDirections = [], upDirections = [], signalDates = {};
    evalRows.forEach(function (r) {
      var model = modelFor(r.date);
      if (!validModel(model)) return;
      var pred = score(model, r.x); errors.push(Math.abs(pred - r.y)); directions.push((pred >= 0) === (r.y >= 0) ? 1 : 0);
      zeroErrors.push(Math.abs(r.y)); meanErrors.push(Math.abs(model.intercept - r.y));
      meanDirections.push((model.intercept >= 0) === (r.y >= 0) ? 1 : 0); upDirections.push(r.y >= 0 ? 1 : 0); signalDates[r.date] = true;
    });
    var curve = [], trades = [], strategy = 1, benchmark = 1, openPositions = [], benchmarkOpenPositions = [], continuationStopReason = null;
    var start = dates.findIndex(function (d) { return Number(d.slice(0, 4)) === year; });
    function append(date, s, b) {
      var p = { date: date, strategy: s, benchmark: b };
      if (curve.length && curve[curve.length - 1].date === date) curve[curve.length - 1] = p; else curve.push(p);
    }
    function positions(candidates, entryDate, exitDate, model, recordTrades) {
      return candidates.map(function (c) {
        var entry = openingMaps[c.symbol][entryDate], exit = openingMaps[c.symbol][exitDate];
        var entryExecution = openingAssessment(entry, 'buy'), exitExecution = openingAssessment(exit, 'sell'), entered = entryExecution.allowed;
        var p = { symbol: c.symbol, entry: entry, entryDate: entryDate, exitDate: exitDate, entered: entered, exit: exit, exitExecution: exitExecution };
        if (recordTrades) {
          var exitPrice = entered ? mark(ctx, c.symbol, exitDate, true) : null;
          var trade = { symbol: c.symbol, signalDate: c.date, entryDate: entryDate, exitDate: exitDate, expectedReturn: c.expected,
            trainingCutoff: model.cutoff, labelEndMax: model.labelEndMax, entered: entered, exitExecutable: false,
            entryExecution: entryExecution, exitExecution: exitExecution, executionVerified: false,
            exitHypotheticallyFilled: entered && exitExecution.allowed, exitFeeCharged: entered && exitExecution.allowed,
            positionState: !entered ? 'entry_rejected' : exitExecution.allowed ? 'hypothetically_closed' : 'open_exit_blocked',
            entryPrice: entered ? entry.open : null, exitMark: exitPrice,
            netReturn: !entered ? 0 : exitExecution.allowed ? (exitPrice / entry.open) * (1 - fee) * (1 - fee) - 1 : null,
            unrealizedReturn: entered && !exitExecution.allowed ? (exitPrice / entry.open) * (1 - fee) - 1 : null,
            note: entered ? (exitExecution.allowed ? '独立20日区间开盘价假设，未验证真实成交。' : '退出被拒，继续保留持仓及估值；未收取卖出费或将市值转成可用现金。') : '开盘缺价或明确交易限制；该份额保留现金，不换成事后赢家。' };
          if (!signalIdentities[c.date]) signalIdentities[c.date] = fingerprint(model, c.date);
          Object.assign(trade, JSON.parse(JSON.stringify(signalIdentities[c.date])));
          trade.fingerprintScope = 'frozen_signal_inputs_before_entry';
          trades.push(trade); p.trade = trade;
        }
        return p;
      });
    }
    function basketValue(pos, date, isExit) {
      if (!pos.length) return 1;
      return mean(pos.map(function (p) {
        if (!p.entered) return 1;
        if (date >= p.exitDate && p.exitExecution.allowed) return (p.exit.open / p.entry.open) * (1 - fee) * (1 - fee);
        var price = mark(ctx, p.symbol, date, isExit);
        return (price / p.entry.open) * (1 - fee);
      }));
    }
    if (start >= 0) for (var t = start; t + opt.horizon + 1 < dates.length && Number(dates[t].slice(0, 4)) === year; t += opt.horizon) {
      var signalDate = dates[t], entryDate = dates[t + 1], exitDate = dates[t + opt.horizon + 1], model = modelFor(signalDate), candidates = [];
      if (!validModel(model)) continue;
      ctx.symbols.forEach(function (s) {
        var index = ctx.indices[s][signalDate]; if (index === undefined || index < 60 || !tradeable(ctx.maps[s][signalDate])) return;
        var x = vector(ctx.series[s].slice(Math.max(0, index - 60), index + 1));
        if (x) candidates.push({ symbol: s, date: signalDate, expected: score(model, x) });
      });
      candidates.sort(function (a, b) { return b.expected - a.expected || a.symbol.localeCompare(b.symbol); });
      var chosen = candidates.slice(0, Math.min(3, candidates.length)).filter(function (c) { return c.expected > 0; });
      var holdings = positions(chosen, entryDate, exitDate, model, true), base = positions(candidates, entryDate, exitDate, model, false);
      if (!curve.length) append(signalDate, strategy, benchmark);
      for (var day = t + 1; day <= t + opt.horizon + 1; day++) append(dates[day], strategy * basketValue(holdings, dates[day], day === t + opt.horizon + 1), benchmark * basketValue(base, dates[day], day === t + opt.horizon + 1));
      var blocked = holdings.filter(function (p) { return p.entered && !p.exitExecution.allowed; });
      var baseBlocked = base.filter(function (p) { return p.entered && !p.exitExecution.allowed; });
      if (blocked.length || baseBlocked.length) {
        continuationStopReason = 'unresolved_exit_no_reinvestment';
        for (var later = t + opt.horizon + 2; later < dates.length; later++) append(dates[later], strategy * basketValue(holdings, dates[later], false), benchmark * basketValue(base, dates[later], false));
        function remaining(p) {
          var lastMark = mark(ctx, p.symbol, asOf, false);
          var lastBar = ctx.series[p.symbol].filter(function (bar) { return bar.date <= asOf; }).slice(-1)[0];
          var row = { symbol: p.symbol, entryDate: p.entryDate, attemptedExitDate: p.exitDate, entryPrice: p.entry.open, mark: lastMark,
            markAsOf: lastBar ? lastBar.date : null, stale: !lastBar || lastBar.date < asOf,
            positionState: 'open_exit_blocked', reason: p.exitExecution.reason, cashProceeds: 0,
            unrealizedReturn: (lastMark / p.entry.open) * (1 - fee) - 1 };
          if (p.trade) { p.trade.unrealizedReturn = row.unrealizedReturn; p.trade.lastMark = lastMark; p.trade.markAsOf = row.markAsOf; p.trade.stale = row.stale; }
          return row;
        }
        openPositions = blocked.map(remaining); benchmarkOpenPositions = baseBlocked.map(remaining);
        strategy *= basketValue(holdings, asOf, false); benchmark *= basketValue(base, asOf, false);
        break;
      }
      strategy *= basketValue(holdings, exitDate, true); benchmark *= basketValue(base, exitDate, true);
    }
    var peak = 1, maxDrawdown = 0;
    curve.forEach(function (p) { peak = Math.max(peak, p.strategy); maxDrawdown = Math.max(maxDrawdown, 1 - p.strategy / peak); });
    var report = { year: year, asOf: asOf, executionMode: 'independent_interval_research', executableAccount: false, executionVerified: false,
      availableCash: null, accountBudget: null, openPositions: openPositions, benchmarkOpenPositions: benchmarkOpenPositions, continuationStopReason: continuationStopReason,
      fee_profile: legacyFees,
      sampleCount: errors.length, mae: errors.length ? mean(errors) : null, directionAccuracy: directions.length ? mean(directions) : null,
      signalDayCount: Object.keys(signalDates).length,
      baselines: { zeroReturn: { mae: zeroErrors.length ? mean(zeroErrors) : null },
        trainingMean: { mae: meanErrors.length ? mean(meanErrors) : null, directionAccuracy: meanDirections.length ? mean(meanDirections) : null },
        alwaysUp: { directionAccuracy: upDirections.length ? mean(upDirections) : null } },
      readiness: { status: 'unproven', forwardVerified: false, reason: '回顾性检验，固定研究池有幸存者偏差；尚无发布在先的前瞻投资表现证明。' },
      strategyReturn: strategy - 1, benchmarkReturn: benchmark - 1, maxDrawdown: maxDrawdown, curve: curve, trades: trades,
      notes: [year >= 2026 ? '按月滚动检验：模型仅使用前月截止日已成熟的20日标签。' : '冻结检验：仅使用上一年末已成熟标签训练，全年度不调参。',
        '固定研究池存在幸存者偏差；仅为后复权日线的独立区间组合模拟，非真实券商回测。',
        '前3名正预测等权；基准为同一信号日可分析研究池等权。区间内以收盘估值，区间末以开盘估值。',
        '每边费用约' + (fee * 100).toFixed(3) + '%；可修改，忽略最低佣金与品种税费差异，不代表实际收费。',
        '开盘下单仅用开盘价及明确的停牌、拒单、买卖侧限制；不得使用当天最高、最低或全天成交量。未知盘口仅为开盘价假设，非成交验证。',
        '明确退出受阻时保留持仓、持续估值并停止后续区间开仓；未实现估值不转成现金。正常区间形成研究指数，非可执行1万元持续账户。',
        '未成熟的区间不纳入统计；预测标签按日产生、重叠且相关，样本数不是独立证据。组合模拟使用独立20日区间。',
        '指标中的收益误差与方向命中为样本外预测统计；净值回撤基于日线估值，不含盘中风险。'] };
    var foldModels = Object.keys(models).sort().map(function (cutoff) { return { cutoff: cutoff, model: models[cutoff] }; });
    Object.assign(report, fingerprint({ family: 'standardized-ridge-11', folds: foldModels }, asOf));
    report.fingerprintScope = 'retrospective_report_inputs_through_asof';
    return report;
  }
  function updateChampion(histories, oldModel, opts) {
    var ctx = context(histories), opt = options(opts, ctx), all = records(ctx, opt.horizon, opt.cutoff);
    if (!validModel(oldModel)) {
      var first = fit(all, opt, ctx.symbols);
      return { model: first.eligible ? first : oldModel || first, accepted: first.eligible, reason: first.eligible ? '成熟样本满足门槛，建立初始模型。' : '成熟样本不足40，继续收集。', comparison: null };
    }
    if (oldModel.horizon !== opt.horizon) return { model: oldModel, accepted: false, reason: '预测周期不同，不能直接比较模型。', comparison: null };
    var dates = ctx.calendar.filter(function (d) { return !opt.cutoff || d <= opt.cutoff; });
    var end = dates.length - opt.horizon - 2, begin = Math.max(0, end - 59), startDate = dates[begin];
    if (begin < 1 || !startDate || !oldModel.cutoff || startDate <= oldModel.cutoff) return { model: oldModel, accepted: false, reason: '需要旧模型截止日之后至少60个已成熟信号日，当前独立比较窗口不足。', comparison: null };
    var candidateCutoff = dates[begin - 1], candidate = fit(records(ctx, opt.horizon, candidateCutoff), { horizon: opt.horizon, alpha: opt.alpha, cutoff: candidateCutoff }, ctx.symbols);
    var validation = all.filter(function (r) { return r.date >= startDate && r.date <= dates[end]; }), cm = metric(candidate, validation), om = metric(oldModel, validation);
    var comparison = { validationStart: startDate, validationEnd: dates[end], candidateTrainingCutoff: candidateCutoff,
      sampleCount: cm.sampleCount, candidateMae: cm.mae, championMae: om.mae, candidateDirectionAccuracy: cm.directionAccuracy, championDirectionAccuracy: om.directionAccuracy };
    var accepted = cm.sampleCount >= 60 && cm.mae !== null && om.mae !== null && cm.mae <= om.mae * .98 && cm.directionAccuracy >= om.directionAccuracy - .02;
    return { model: accepted ? fit(all, opt, ctx.symbols) : oldModel, accepted: accepted,
      reason: accepted ? '独立时间窗口至少60个标签，候选误差改善至少2%，方向命中未明显下降；升级后用已成熟样本重训。' : '独立窗口样本不足，或误差改善未达到2%门槛，或方向命中下降，保留现有模型。', comparison: comparison };
  }
  return { indicators: indicators, features: features, train: train, predict: predict, evaluate: evaluate, updateChampion: updateChampion };
}));
