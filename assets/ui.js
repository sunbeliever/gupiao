(function () {
  'use strict';
  var state = {
    tab: 'observe', type: 'all', sort: 'prediction', search: '', sector: '',
    selected: '', chartDays: 60, newsFilter: 'all', year: 2026,
    histories: {}, rawHistories: {}, quotes: {}, predictions: {}, news: [], sectors: [],
    model: null, reports: {}, generatedAt: '', autoSync: true, backtestAlpha: 0.1,
    busy: false, training: false, evaluating: false, progress: 0, progressLabel: '',
    connection: 'seed', lastFetch: '', lastSync: '', upgrade: null, errors: [], initialized: false
  };
  var universe = [], toastTimer, quoteTimer, lastNewsFetch = 0, lastAutomaticSyncAt = 0, rawPending = {};
  var $ = function (id) { return document.getElementById(id); };
  var finite = function (x) { return x !== null && x !== undefined && x !== '' && Number.isFinite(Number(x)); };
  var number = function (x) { return finite(x) ? Number(x) : null; };
  var escapeHtml = function (x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var fmt = function (x, digits) { return finite(x) ? Number(x).toLocaleString('zh-CN', { minimumFractionDigits: digits == null ? 2 : digits, maximumFractionDigits: digits == null ? 2 : digits }) : '—'; };
  var pct = function (x, digits) { return finite(x) ? (Number(x) > 0 ? '+' : '') + fmt(Number(x) * 100, digits == null ? 2 : digits) + '%' : '—'; };
  var quotePct = function (x) { return finite(x) ? (Number(x) > 0 ? '+' : '') + fmt(x, 2) + '%' : '—'; };
  var tone = function (x) { return !finite(x) || Number(x) === 0 ? 'neutral' : Number(x) > 0 ? 'up' : 'down'; };
  var shortDate = function (x) { return String(x || '').slice(0, 10); };
  var chinaClock = function (value) {
    var time = value == null ? Date.now() : new Date(value).getTime();
    if (!Number.isFinite(time)) return null;
    var d = new Date(time + 8 * 60 * 60 * 1000);
    return { day: d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0'), hour: d.getUTCHours() };
  };
  var today = function () { return chinaClock().day; };
  var readableTime = function (x) {
    var s = String(x || '');
    if (/^\d{14}$/.test(s)) return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8) + ' ' + s.slice(8, 10) + ':' + s.slice(10, 12) + ':' + s.slice(12, 14);
    if (!s) return '时间未提供';
    var d = new Date(s);
    return Number.isFinite(d.getTime()) ? d.toLocaleString('zh-CN', { hour12: false }) : s.slice(0, 25);
  };
  var compact = function (x, unit) {
    var n = number(x); if (n === null) return '—';
    if (Math.abs(n) >= 1e8) return fmt(n / 1e8, 2) + '亿' + (unit || '');
    if (Math.abs(n) >= 1e4) return fmt(n / 1e4, 2) + '万' + (unit || '');
    return fmt(n, 0) + (unit || '');
  };
  var firstValue = function (obj, names) { for (var i = 0; i < names.length; i++) if (obj && obj[names[i]] !== undefined && obj[names[i]] !== null) return obj[names[i]]; return null; };
  var info = function (symbol) { return universe.find(function (u) { return u.symbol === symbol; }) || { symbol: symbol, name: symbol, sector: '', type: 'stock' }; };
  var modelCutoff = function () { return firstValue(state.model, ['cutoff', 'trainedThrough', 'trainingCutoff', 'asOf', 'trainEnd']) || '—'; };
  var modelVersion = function () { var v = firstValue(state.model, ['version', 'id']); return v == null ? '尚未训练' : String(v); };
  var horizon = function () { return state.model && state.model.horizon || 20; };
  var prediction = function (symbol) { return state.predictions[symbol] || null; };
  var barsFor = function (symbol) { return state.histories[symbol] || []; };
  var rawBarsFor = function (symbol) { return state.rawHistories[symbol] || []; };
  var validBars = function (bars) { return Array.isArray(bars) ? bars.filter(function (b) { return b && b.date && finite(b.close) && Number(b.close) > 0; }) : []; };
  var latestDate = function () { var dates = Object.keys(state.histories).map(function (k) { var b = barsFor(k); return b.length ? b[b.length - 1].date : ''; }); return dates.sort().pop() || ''; };
  var safeStorageRead = function (key) { try { return Market.read(key); } catch (_) { return null; } };
  var safeStorageWrite = function (key, value) { try { return Market.write(key, value); } catch (_) { return null; } };
  function showToast(message) {
    var box = $('toast'); if (!box) return;
    box.textContent = message; box.hidden = false; clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { box.hidden = true; }, 5200);
  }
  function safeError(error) { return error && error.message ? String(error.message).slice(0, 140) : '数据请求未完成'; }
  function setConnection() {
    var el = $('connection-status');
    var mode = state.busy || state.training || state.evaluating ? 'busy' : state.connection;
    var labels = { busy: state.progressLabel || (state.training ? '正在比较候选模型' : state.evaluating ? '正在运行历史检验' : '正在同步数据'), online: '已连接行情来源', offline: '部分数据未更新，可查看缓存', seed: '内置真实样本，可离线查看' };
    var phaseDate = new Date(Date.now() + 8 * 3600000), minutes = phaseDate.getUTCHours() * 60 + phaseDate.getUTCMinutes();
    var phase = minutes >= 690 && minutes < 780 ? ' · 午间休市时段' : minutes >= 900 || minutes < 570 || phaseDate.getUTCDay() === 0 || phaseDate.getUTCDay() === 6 ? ' · 常规非交易时段' : '';
    el.innerHTML = '<i class="status-dot ' + (mode === 'seed' ? 'offline' : mode) + '"></i>' + escapeHtml((labels[mode] || labels.seed) + (mode === 'online' ? phase : ''));
    $('asof-label').textContent = state.lastFetch ? '刷新 ' + readableTime(state.lastFetch).split(' ').pop() : state.generatedAt ? shortDate(state.generatedAt) + '样本' : '—';
    $('refresh-button').disabled = state.busy || state.training;
  }
  function recomputePredictions() {
    state.predictions = {};
    if (!state.model || !window.Analysis) return;
    universe.forEach(function (u) {
      try { state.predictions[u.symbol] = Analysis.predict(state.model, barsFor(u.symbol)); }
      catch (_) { state.predictions[u.symbol] = { eligible: false, reasons: ['历史样本不足'], risks: [] }; }
    });
  }
  function renderActive() {
    setConnection();
    if (state.tab === 'observe') renderObserve();
    else if (state.tab === 'detail') renderDetail();
    else if (state.tab === 'news') renderNews();
    else if (state.tab === 'backtest') renderBacktest();
    else if (state.tab === 'model') renderModel();
  }
  function enhance() { if (window.ResearchUI && state.initialized) { try { ResearchUI.render(state); } catch (e) { showToast('验证记录未完成，请重新打开应用。' + safeError(e)); } } }
  function switchTab(tab) {
    if (['observe', 'detail', 'news', 'backtest', 'model'].indexOf(tab) < 0) return;
    state.tab = tab;
    document.querySelectorAll('.page').forEach(function (p) { p.hidden = p.id !== 'page-' + tab; p.classList.toggle('active', !p.hidden); });
    document.querySelectorAll('.bottom-nav button').forEach(function (b) { var active = b.dataset.tab === tab; b.classList.toggle('active', active); if (active) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    renderActive(); window.scrollTo(0, 0);
  }
  function selectInstrument(symbol) {
    if (!universe.some(function (u) { return u.symbol === symbol; })) return;
    state.selected = symbol; safeStorageWrite('ui.selected', symbol); switchTab('detail');
    var requestedSymbol = symbol;
    if (Market.rawHistory && !rawPending[requestedSymbol]) {
      rawPending[requestedSymbol] = true;
      Promise.resolve(Market.rawHistory(requestedSymbol)).then(function (bars) {
        var valid = validBars(bars);
        if (valid.length) state.rawHistories[requestedSymbol] = valid;
        if (state.tab === 'detail' && state.selected === requestedSymbol) renderDetail();
      }).catch(function () { if (state.tab === 'detail' && state.selected === requestedSymbol) showToast('原始价格未能更新，保留已有K线数据'); }).finally(function () { delete rawPending[requestedSymbol]; });
    }
  }
  function sparkline(values, color) {
    var list = values.filter(finite).map(Number); if (list.length < 2) return '';
    var low = Math.min.apply(null, list), high = Math.max.apply(null, list), span = high - low || 1;
    var points = list.map(function (v, i) { return fmt(i / (list.length - 1) * 108, 1).replace(/,/g, '') + ',' + fmt(25 - (v - low) / span * 22, 1).replace(/,/g, ''); }).join(' ');
    return '<svg class="sector-spark" viewBox="0 0 110 28" preserveAspectRatio="none" aria-hidden="true"><polyline points="' + points + '" style="stroke:' + color + ';stroke-width:1.4"/></svg>';
  }
  function customSectors() {
    var groups = {};
    universe.forEach(function (u) { var q = state.quotes[u.symbol]; if (q && finite(q.changePct)) { if (!groups[u.sector]) groups[u.sector] = []; groups[u.sector].push(Number(q.changePct)); } });
    return Object.keys(groups).map(function (name) { var a = groups[name]; return { code: 'pool:' + name, name: name, changePct: a.reduce(function (s, v) { return s + v; }, 0) / a.length, pool: true, sampleCount: a.length }; });
  }
  function renderSectors() {
    var sectors = state.sectors.length ? state.sectors : customSectors();
    if (!sectors.length) return '<div class="empty-state">行情连接后显示板块观察</div>';
    return '<div class="sector-scroller">' + sectors.map(function (s) {
      var hist = validBars(s.history || []), values = hist.slice(-20).map(function (b) { return b.close; });
      var sectorName = s.name || s.code, mapped = universe.some(function (u) { return u.sector === sectorName; });
      var caption = s.pool || String(s.code).indexOf('pool:') === 0 ? '研究池均值 · ' + (s.sampleCount || '部分') + '只' : '东财行业指数';
      if (s.cached) caption += ' / 缓存';
      return '<button class="sector-tile ' + (state.sector === sectorName ? 'selected' : '') + '" data-sector="' + escapeHtml(mapped ? sectorName : '') + '" aria-label="' + escapeHtml(sectorName) + ' ' + quotePct(s.changePct) + '"><b>' + escapeHtml(sectorName) + '</b><span class="sector-change number ' + tone(s.changePct) + '">' + quotePct(s.changePct) + '</span>' + sparkline(values, Number(s.changePct) >= 0 ? '#c83d4d' : '#128466') + '<small>' + escapeHtml(caption) + '</small></button>';
    }).join('') + '</div>';
  }
  function renderObserve() {
    var query = state.search.trim().toLowerCase();
    var list = universe.filter(function (u) { return (state.type === 'all' || u.type === state.type) && (!state.sector || u.sector === state.sector) && (!query || (u.name + ' ' + u.symbol + ' ' + u.sector).toLowerCase().indexOf(query) >= 0); });
    list.sort(function (a, b) {
      var av, bv;
      if (state.sort === 'prediction') { av = prediction(a.symbol); bv = prediction(b.symbol); av = av && av.eligible !== false ? number(av.expectedReturn) : null; bv = bv && bv.eligible !== false ? number(bv.expectedReturn) : null; }
      else { av = number(state.quotes[a.symbol] && state.quotes[a.symbol][state.sort]); bv = number(state.quotes[b.symbol] && state.quotes[b.symbol][state.sort]); }
      return (bv == null ? -Infinity : bv) - (av == null ? -Infinity : av) || a.name.localeCompare(b.name, 'zh-CN');
    });
    $('page-observe').innerHTML = '<div class="page-lead"><div><h1 id="observe-heading">在科技中，读懂信号。</h1><p>价格、趋势与模型依据，放在同一张观察表。</p></div><div class="mini-stat"><b class="number">' + universe.length + '</b>研究标的</div></div>' +
      '<div class="signal-note"><strong>' + horizon() + '个交易日收益估计</strong><small>基于完整日线；区间来自训练残差，未经可靠性校准。排名仅供研究，模型截止 ' + escapeHtml(shortDate(modelCutoff())) + '。</small></div>' +
      '<div class="section-heading"><h2>板块温度</h2><span class="muted">当日涨跌</span></div>' + renderSectors() +
      '<div class="filters"><div class="segmented" aria-label="标的类型">' + [['all', '全部'], ['stock', 'A股'], ['etf', 'ETF']].map(function (f) { return '<button data-type="' + f[0] + '" class="' + (state.type === f[0] ? 'active' : '') + '" aria-pressed="' + (state.type === f[0]) + '">' + f[1] + '</button>'; }).join('') + '</div><select id="sort-select" class="sort-select" aria-label="排序方式"><option value="prediction"' + (state.sort === 'prediction' ? ' selected' : '') + '>按20日估计</option><option value="changePct"' + (state.sort === 'changePct' ? ' selected' : '') + '>按当日涨幅</option><option value="amount"' + (state.sort === 'amount' ? ' selected' : '') + '>按成交金额</option></select></div>' +
      '<label class="search-box"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M16 16l5 5"/></svg><input id="instrument-search" type="search" placeholder="搜索名称、代码或板块" value="' + escapeHtml(state.search) + '" aria-label="搜索标的" autocomplete="off"></label>' +
      (state.sector ? '<div class="active-filter"><span>正在查看 ' + escapeHtml(state.sector) + '</span><button id="clear-sector">查看全部</button></div>' : '') +
      '<div class="list-head"><span>标的 / 代码</span><span>最新价 / 涨跌</span><span>20日估计 / 区间</span></div><div class="instrument-list">' +
      (list.length ? list.map(function (u) {
        var q = state.quotes[u.symbol] || {}, p = prediction(u.symbol), eligible = p && p.eligible !== false && finite(p.expectedReturn), interval = eligible && Array.isArray(p.interval) ? p.interval : null;
        return '<button class="instrument-row" data-symbol="' + escapeHtml(u.symbol) + '" aria-label="查看' + escapeHtml(u.name) + '详情"><span><span class="instrument-name">' + escapeHtml(q.name || u.name) + '</span><span class="instrument-code">' + escapeHtml(u.symbol.replace(/^(sh|sz|bj)/, '')) + '<span class="type-label">' + (u.type === 'etf' ? 'ETF' : 'A股') + '</span></span></span><span class="instrument-price"><b class="number">' + fmt(q.price, u.type === 'etf' ? 3 : 2) + '</b><small class="number ' + tone(q.changePct) + '">' + quotePct(q.changePct) + '</small></span><span class="instrument-prediction"><b class="number ' + (eligible ? tone(p.expectedReturn) : 'muted') + '">' + (eligible ? pct(p.expectedReturn) : '样本不足') + '</b><small class="number muted">' + (interval && interval.length >= 2 ? pct(interval[0], 1) + ' ～ ' + pct(interval[1], 1) : '完整样本后生成') + '</small></span></button>';
      }).join('') : '<div class="empty-state"><strong>没有匹配的标的</strong>试试股票代码，或清除板块筛选。</div>') + '</div>' +
      '<p class="footnote">报价来自腾讯公开行情，点击标的查看源时间。缓存与过期报价会在详情标记。当前研究池包含幸存者偏差；估计收益不代表实际成交或未来盈利。</p>';
    var search = $('instrument-search');
    search.addEventListener('input', function () { var cursor = search.selectionStart; state.search = search.value; renderObserve(); var next = $('instrument-search'); next.focus(); try { next.setSelectionRange(cursor, cursor); } catch (_) {} });
    $('sort-select').addEventListener('change', function (e) { state.sort = e.target.value; renderObserve(); });
    $('page-observe').querySelectorAll('[data-type]').forEach(function (b) { b.onclick = function () { state.type = b.dataset.type; renderObserve(); }; });
    $('page-observe').querySelectorAll('[data-symbol]').forEach(function (b) { b.onclick = function () { selectInstrument(b.dataset.symbol); }; });
    $('page-observe').querySelectorAll('[data-sector]').forEach(function (b) { b.onclick = function () { if (b.dataset.sector) { state.sector = state.sector === b.dataset.sector ? '' : b.dataset.sector; renderObserve(); } else showToast('这是来源行业指数；研究池按独立主题分类'); }; });
    if ($('clear-sector')) $('clear-sector').onclick = function () { state.sector = ''; renderObserve(); };
    enhance();
  }
  function param(label, value, className) { return '<div class="parameter"><dt>' + escapeHtml(label) + '</dt><dd class="number ' + (className || '') + '">' + escapeHtml(value) + '</dd></div>'; }
  function indicatorRows(ind) {
    var fields = [
      ['MA5', ['ma5'], 'price'], ['MA20', ['ma20'], 'price'], ['MA60', ['ma60'], 'price'],
      ['RSI14', ['rsi', 'rsi14'], 'number'], ['5日动量', ['momentum5', 'return5', 'ret5'], 'return'], ['20日动量', ['momentum20', 'return20', 'ret20'], 'return'],
      ['60日动量', ['momentum60', 'return60', 'ret60'], 'return'], ['年化波动', ['volatility', 'volatility20', 'vol20'], 'percent'], ['60日最大回撤', ['drawdown', 'drawdown60', 'maxDrawdown'], 'percent'],
      ['成交量比', ['volumeRatio'], 'number'], ['ATR14 / 波幅', ['atr'], 'price']
    ];
    return fields.map(function (f) { var v = firstValue(ind, f[1]); return param(f[0], f[2] === 'return' ? pct(v) : f[2] === 'percent' ? finite(v) ? fmt(Number(v) * 100, 2) + '%' : '—' : fmt(v, f[2] === 'price' ? 3 : 1), f[2] === 'return' ? tone(v) : ''); }).join('');
  }
  function renderContributions(p) {
    var contributions = p && Array.isArray(p.contributions) ? p.contributions : [];
    if (!contributions.length) return '<div class="empty-state">完成训练后显示各参数贡献。</div>';
    var max = Math.max.apply(null, contributions.map(function (c) { return Math.abs(number(c.value) || 0); })) || 1;
    return '<div class="contribution-list">' + contributions.map(function (c) {
      var v = number(c.value) || 0, width = Math.abs(v) / max * 48;
      return '<div class="contribution-row"><span>' + escapeHtml(c.name || c.feature || '参数') + '</span><span class="contribution-track"><i class="contribution-bar ' + (v < 0 ? 'negative' : '') + '" style="width:' + width.toFixed(2) + '%;left:' + (v < 0 ? 50 - width : 50).toFixed(2) + '%"></i></span><span class="number ' + tone(v) + '">' + pct(v, 2) + '</span></div>';
    }).join('') + '</div><p class="footnote">参数贡献相加得到估计收益，包含模型基准项；这表示统计关系，不代表因果。</p>';
  }
  function renderDetail() {
    if (!state.selected && universe.length) state.selected = universe[0].symbol;
    var u = info(state.selected), q = state.quotes[u.symbol] || {}, hist = barsFor(u.symbol), raw = rawBarsFor(u.symbol), displayBars = raw.length ? raw : hist;
    var p = prediction(u.symbol), ind = p && p.indicators;
    if (!ind) { try { ind = window.Analysis && Analysis.indicators(hist) || {}; } catch (_) { ind = {}; } }
    var eligible = p && p.eligible !== false && finite(p.expectedReturn), last = displayBars.length ? displayBars[displayBars.length - 1] : null;
    var price = finite(q.price) ? q.price : last && last.close;
    var stale = false; try { stale = q && Market.isStale && Market.isStale(q); } catch (_) {}
    var sourceLabel = q.cached ? '缓存报价' : stale ? '源时间较旧' : finite(q.price) ? '腾讯行情' : raw.length ? '历史收盘价' : '后复权历史收盘';
    var interval = eligible && Array.isArray(p.interval) && p.interval.length >= 2 ? p.interval : null;
    var risks = [].concat(p && p.reasons || [], p && p.risks || []).filter(function (r) { return typeof r === 'string'; });
    $('page-detail').innerHTML = '<div class="page-lead"><div><h1 id="detail-heading">参数明细</h1><p>从走势到估计，逐项查看依据。</p></div><span class="tag">' + escapeHtml(u.sector) + '</span></div>' +
      '<select id="detail-select" class="detail-select" aria-label="选择研究标的">' + universe.map(function (v) { return '<option value="' + escapeHtml(v.symbol) + '"' + (v.symbol === u.symbol ? ' selected' : '') + '>' + escapeHtml(v.name + '  ' + v.symbol.replace(/^(sh|sz|bj)/, '') + (v.type === 'etf' ? '  ETF' : '')) + '</option>'; }).join('') + '</select>' +
      '<div class="detail-columns"><div class="detail-main"><div class="quote-summary"><div><div class="quote-price number ' + tone(q.changePct) + '">' + fmt(price, u.type === 'etf' ? 3 : 2) + '</div><div class="quote-change number ' + tone(q.changePct) + '">' + quotePct(q.changePct) + ' <span class="muted">当日</span></div></div><div class="quote-side"><strong>' + escapeHtml(sourceLabel) + '</strong>' + (u.type === 'etf' ? '场内基金交易价格' : 'A股交易价格') + '</div></div>' +
      '<p class="quote-caption">来源快照时间 ' + escapeHtml(q.sourceTime ? readableTime(q.sourceTime) : last ? last.date + '收盘' : '未提供') + '，不代表最近成交时刻；开休市以交易所为准。</p>' +
      '<dl class="parameters">' + param('今开', fmt(q.open, u.type === 'etf' ? 3 : 2)) + param('最高', fmt(q.high, u.type === 'etf' ? 3 : 2)) + param('最低', fmt(q.low, u.type === 'etf' ? 3 : 2)) + param('成交量', compact(q.volume, '股')) + param('成交金额', compact(q.amount, '元')) + param('换手率', finite(q.turnover) ? fmt(q.turnover, 2) + '%' : '—') + param('前收', fmt(q.previousClose, u.type === 'etf' ? 3 : 2)) + param('市盈率 PE（源口径）', u.type === 'etf' ? '不适用' : fmt(q.pe, 2)) + param('PB', u.type === 'etf' ? '不适用' : fmt(q.pb, 2)) + '</dl>' +
      '<div class="chart-toolbar"><h2>' + (raw.length ? '原始价格走势' : '后复权走势') + '</h2><div class="segmented" aria-label="图表范围">' + [60, 120, 250].map(function (n) { return '<button data-days="' + n + '" class="' + (state.chartDays === n ? 'active' : '') + '">' + n + '日</button>'; }).join('') + '</div></div>' +
      '<div class="chart-legend"><span class="legend-item"><i style="background:#be8b34"></i>MA5</span><span class="legend-item"><i style="background:#255bca"></i>MA20</span><span class="legend-item"><i style="background:#142747"></i>MA60</span><span class="muted">红涨绿跌</span></div><canvas id="price-chart" class="chart-canvas" role="img" aria-label="' + escapeHtml(u.name) + 'K线和移动平均线"></canvas><p class="chart-caption">' + (raw.length ? '图表使用未复权真实价格，成交量单位为股。分析参数使用后复权日线，与图中MA数值可能不同。' : '原始价格暂未载入；当前为后复权价格，不能与交易报价直接比较。') + ' 截至 ' + escapeHtml(last && last.date || '—') + '。</p></div>' +
      '<div class="detail-analysis"><div class="prediction-block"><div class="prediction-top"><div><h2>' + horizon() + '日预测收益 / 绝对收益</h2><div class="prediction-value number">' + (eligible ? pct(p.expectedReturn) : '暂不生成') + '</div></div><div class="prediction-interval">训练残差参考区间<b class="number">' + (interval ? pct(interval[0], 1) + ' ～ ' + pct(interval[1], 1) : '样本不足') + '</b></div></div><p>信号日 ' + escapeHtml(p && p.asOf || hist.length && hist[hist.length - 1].date || '—') + '；区间未经可靠性校准，不是置信或盈利保证。盘中报价不进入日线模型。</p></div>' +
      '<div class="section-heading"><h2>模型参数</h2><span class="muted">后复权日线</span></div><dl class="parameters">' + indicatorRows(ind) + '</dl>' +
      '<div class="section-heading"><h2>收益估计来自哪里</h2><span class="muted">贡献百分点</span></div>' + renderContributions(p) +
      '<div class="notice"><p>' + escapeHtml(risks.length ? risks.join('；') : '预测只反映样本中的统计关系，市场变化会使模型失效。') + '</p><p>PE/PB使用当前行情源口径，未自行按财报重算，也不标作已核实的TTM。负PE不能按低估值理解，ETF不适用。当前财务指标和新闻情绪未纳入历史预测。</p></div></div></div>';
    $('detail-select').onchange = function (e) { selectInstrument(e.target.value); };
    $('page-detail').querySelectorAll('[data-days]').forEach(function (b) { b.onclick = function () { state.chartDays = Number(b.dataset.days); renderDetail(); }; });
    requestAnimationFrame(function () { if (state.tab === 'detail') drawCandles($('price-chart'), displayBars, state.chartDays); });
    enhance();
  }
  function sentimentInfo(item) {
    var s = item.sentiment, raw = s && typeof s === 'object' ? firstValue(s, ['label', 'score', 'value']) : s;
    var text = String(raw == null ? '' : raw).toLowerCase();
    if (/positive|积极|利好|偏多/.test(text) || finite(raw) && Number(raw) > 0) return { label: '关键词偏积极', tone: 'up' };
    if (/negative|消极|利空|偏空|谨慎/.test(text) || finite(raw) && Number(raw) < 0) return { label: '关键词偏谨慎', tone: 'down' };
    return { label: raw == null ? '情绪未评估' : '关键词中性', tone: 'neutral' };
  }
  function renderNews() {
    var list = state.news.slice().sort(function (a, b) { return String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')); });
    if (state.newsFilter === 'positive') list = list.filter(function (n) { return sentimentInfo(n).tone === 'up'; });
    if (state.newsFilter === 'negative') list = list.filter(function (n) { return sentimentInfo(n).tone === 'down'; });
    $('page-news').innerHTML = '<div class="page-lead"><div><h1 id="news-heading">关注科技的变化。</h1><p>最新公开资讯，保留来源与发布时间。</p></div><button id="news-refresh" class="text-button">刷新资讯</button></div>' +
      '<div class="signal-note"><strong>情绪来自标题关键词</strong><small>它只观察措辞，未经历史验证，不参与回测或训练。点击标题可核对原文。</small></div>' +
      '<div class="news-filters"><div class="segmented" aria-label="资讯情绪筛选">' + [['all', '全部'], ['positive', '偏积极'], ['negative', '偏谨慎']].map(function (f) { return '<button data-news-filter="' + f[0] + '" class="' + (state.newsFilter === f[0] ? 'active' : '') + '">' + f[1] + '</button>'; }).join('') + '</div><span class="muted toolbar-status">' + list.length + '条</span></div>' +
      '<div class="news-list">' + (list.length ? list.map(function (n, index) {
        var s = sentimentInfo(n), words = n.sentiment && typeof n.sentiment === 'object' && (n.sentiment.keywords || n.sentiment.matched || n.sentiment.matches);
        return '<article class="news-item"><div class="news-meta"><span>' + escapeHtml(n.source || '来源未提供') + '</span><time>' + escapeHtml(n.publishedAt ? readableTime(n.publishedAt) : '发布时间未提供') + '</time>' + (n.cached ? '<span>缓存</span>' : '') + '</div><button class="news-title" data-news-index="' + index + '">' + escapeHtml(n.title || '无标题资讯') + '</button><div class="news-footer"><span class="tag ' + s.tone + '">' + s.label + '</span>' + (n.sector ? '<span class="tag">' + escapeHtml(n.sector) + '</span>' : '') + '<button class="text-button" data-news-index="' + index + '">阅读原文 ↗</button></div><details><summary>情绪说明</summary><p>' + (Array.isArray(words) && words.length ? '命中的标题词：' + escapeHtml(words.join('、')) + '。' : '') + '积极词：增长、突破、增持、上涨、利好、创新、盈利；谨慎词：下跌、亏损、风险、减持、下滑、走弱、下降。按标题匹配次数比较，不能理解事实真伪、否定语境或价格影响。当前结果不构成完整历史新闻样本。</p></details></article>';
      }).join('') : '<div class="empty-state"><strong>' + (state.news.length ? '暂无此类资讯' : '尚无可用资讯') + '</strong>' + (state.news.length ? '查看全部资讯，或刷新获取最新标题。' : '联网后点击刷新。已有行情和回测可继续离线查看。') + '</div>') + '</div><p class="footnote">标题来自公开资讯检索，只展示少量结果；原文版权归来源所有。关键词筛选可能遗漏相关信息。</p>';
    $('news-refresh').onclick = function () { refreshNews(true); };
    $('page-news').querySelectorAll('[data-news-filter]').forEach(function (b) { b.onclick = function () { state.newsFilter = b.dataset.newsFilter; renderNews(); }; });
    $('page-news').querySelectorAll('[data-news-index]').forEach(function (b) { b.onclick = function () { var n = list[Number(b.dataset.newsIndex)]; if (n && n.url) { try { Market.openUrl(n.url); } catch (_) { showToast('无法打开原文链接'); } } else showToast('此条资讯未提供原文链接'); }; });
  }
  function reportFor(year) { return state.reports[year] || state.reports[String(year)] || null; }
  function metric(label, value, sub, className) { return '<div class="report-metric"><small>' + escapeHtml(label) + '</small><b class="number ' + (className || '') + '">' + escapeHtml(value) + '</b>' + (sub ? '<span>' + escapeHtml(sub) + '</span>' : '') + '</div>'; }
  function renderBacktest() {
    var report = reportFor(state.year), notes = report && Array.isArray(report.notes) ? report.notes : [], curve = report && Array.isArray(report.curve) ? report.curve : [];
    $('page-backtest').innerHTML = '<div class="page-lead"><div><h1 id="backtest-heading">让历史检验模型。</h1><p>看误差、方向与回撤，不只看收益。</p></div></div>' +
      '<div class="year-switch segmented" aria-label="回测年度"><button data-year="2025" class="' + (state.year === 2025 ? 'active' : '') + '">2025 冻结检验</button><button data-year="2026" class="' + (state.year === 2026 ? 'active' : '') + '">2026 滚动检验</button></div>' +
      '<div class="signal-note"><strong>' + (state.year === 2025 ? '2025：测试期间冻结模型' : '2026：仅使用当时已实现的标签') + '</strong><small>' + (report ? '检验截至 ' + escapeHtml(report.asOf || '—') + '；' + (report.sampleCount || 0) + '个预测样本。' : '运行检验后显示真实样本结果。') + ' 当前年度仅展示已有完整交易日。</small></div>' +
      (report ? '<div class="report-summary">' + metric('平均绝对误差', finite(report.mae) ? fmt(Number(report.mae) * 100, 2) : '—', '个百分点 · 20日预测误差') + metric('方向命中率', finite(report.directionAccuracy) ? fmt(Number(report.directionAccuracy) * 100, 1) + '%' : '—', '涨跌方向，非盈利概率') + metric('模拟组合收益', pct(report.strategyReturn), '计入模拟交易费用', tone(report.strategyReturn)) + metric('最大回撤', finite(report.maxDrawdown) ? fmt(Math.abs(Number(report.maxDrawdown)) * 100, 2) + '%' : '—', '模拟净值最大跌幅', 'down') + '</div>' : '<div class="empty-state"><strong>此年度尚未生成检验</strong>使用已有真实日线运行，或先同步补齐样本。</div>') +
      '<div class="report-action"><button id="run-backtest" class="primary-button"' + (state.evaluating || state.training || state.busy ? ' disabled' : '') + '>' + (state.evaluating ? '正在检验…' : '重新运行' + state.year + '检验') + '</button><span>' + (state.year === 2025 ? '固定训练与独立测试区间' : '滚动训练，标签到期后才可使用') + '</span></div>' +
      '<div class="section-heading"><h2>模拟净值</h2><span class="muted">起点 = 1</span></div><div class="chart-legend"><span class="legend-item"><i style="background:#255bca"></i>模型组合</span><span class="legend-item"><i style="background:#8594ac"></i>同池基准</span></div><canvas id="backtest-chart" class="chart-canvas report-chart" role="img" aria-label="模型组合与同池基准净值曲线"></canvas>' +
      '<p class="chart-caption">基准收益 ' + pct(report && report.benchmarkReturn) + '。按次日开盘模拟，涨跌停、停牌与成交限制可能使实盘表现不同。</p>' +
      '<div class="notice"><p>当前研究池有幸存者偏差。有限样本的回测不能证明模型可靠，也不能保证未来盈利。</p>' + notes.map(function (n) { return '<p>' + escapeHtml(n) + '</p>'; }).join('') + '<p>新闻情绪、当前PE/PB与盘中报价未混入历史检验。</p></div>';
    $('page-backtest').querySelectorAll('[data-year]').forEach(function (b) { b.onclick = function () { state.year = Number(b.dataset.year); renderBacktest(); }; });
    $('run-backtest').onclick = function () { runBacktest(state.year); };
    requestAnimationFrame(function () { if (state.tab === 'backtest') drawReturns($('backtest-chart'), curve); });
    enhance();
  }
  function renderModel() {
    var m = state.model || {}, validation = m.validation || m.metrics || {}, count = firstValue(m, ['sampleCount', 'samples', 'trainingSamples', 'nSamples']);
    var alpha = firstValue(m, ['alpha', 'regularization']), validationMae = firstValue(validation, ['mae', 'validationMae', 'candidateMae']);
    var comparison = state.upgrade && state.upgrade.comparison;
    $('page-model').innerHTML = '<div class="page-lead"><div><h1 id="model-heading">持续模拟与模型研究</h1><p>当前模型保持冻结；历史研究与前瞻账本分别记录，投资效果尚未验证。</p></div></div>' +
      '<div class="model-stamp"><div><div class="version number">' + escapeHtml(modelVersion()) + '</div><p>标准化岭回归 · ' + horizon() + '个交易日收益估计</p></div><div class="stamp-symbol"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l5-4 5 4v10l-5 4-5-4zM3 9h4M17 9h4M3 15h4M17 15h4M10 9h4v6h-4z"/></svg></div></div>' +
      '<dl class="definition-list"><div><dt>训练截止日</dt><dd>' + escapeHtml(shortDate(modelCutoff())) + '</dd></div><div><dt>训练样本</dt><dd class="number">' + (finite(count) ? fmt(count, 0) + '条' : '—') + '</dd></div><div><dt>正则参数 α</dt><dd class="number">' + fmt(alpha, 4) + '</dd></div><div><dt>验证平均绝对误差</dt><dd class="number">' + (finite(validationMae) ? fmt(Number(validationMae) * 100, 2) + '个百分点' : '见模型升级比较') + '</dd></div><div><dt>历史覆盖至</dt><dd>' + escapeHtml(latestDate() || '—') + '</dd></div></dl>' +
      '<div class="setting-row"><div><strong>自动同步与验证</strong><small>前台定时更新行情与持仓估值；候选训练需手动启动且不会自动部署。</small></div><label class="toggle"><input id="auto-sync-toggle" type="checkbox"' + (state.autoSync ? ' checked' : '') + ' aria-label="自动同步与验证"><i></i></label></div>' +
      '<div class="model-actions"><button id="train-model" class="primary-button"' + (state.training || state.busy || state.evaluating ? ' disabled' : '') + '>' + (state.training ? '正在验证候选…' : '训练研究候选（不自动部署）') + '</button><button id="sync-model-data" class="secondary-button"' + (state.training || state.busy ? ' disabled' : '') + '>同步完整日线</button></div>' +
      (state.busy || state.training ? '<div class="progress"><div style="width:' + Math.min(100, Math.max(0, state.progress)).toFixed(1) + '%"></div></div><p class="progress-label">' + escapeHtml(state.progressLabel || '正在处理') + '</p>' : '') +
      (state.upgrade ? '<div class="upgrade-result"><strong>' + (state.upgrade.deployed ? '经独立批准部署' : '研究比较，部署模型不变') + '</strong>' + escapeHtml(state.upgrade.reason || '已完成同窗口比较') + (comparison ? '<p>验证期 ' + escapeHtml(comparison.validationStart || '—') + ' 至 ' + escapeHtml(comparison.validationEnd || '—') + '，' + escapeHtml(comparison.sampleCount || 0) + '个标签。当前误差 ' + (finite(comparison.championMae) ? fmt(Number(comparison.championMae) * 100, 2) + 'pp' : '—') + '；候选误差 ' + (finite(comparison.candidateMae) ? fmt(Number(comparison.candidateMae) * 100, 2) + 'pp' : '—') + '。</p>' : '') + '</div>' : '') +
      '<p class="last-sync">最近日线同步：' + escapeHtml(state.lastSync ? readableTime(state.lastSync) : '使用内置真实历史样本') + '</p>' +
      '<div class="section-heading bar-separator"><h2>每一次升级都有依据</h2></div><div class="model-method"><p>当前是11个技术因子的标准化岭回归，没有训练或接入大语言模型。新闻、公告、财务指标尚未进入收益预测。</p><p>升级需积累当前模型之后60个已成熟信号日与至少60个标签。候选在同窗口的平均误差改善至少2%，方向命中下降不超过2个百分点，否则保留当前模型；通过此比较也不等于实盘有效。</p><p>自动同步不保证持续改善。Windows前台约30秒取报价、5分钟取资讯，最小化约5分钟尝试采集报价与资讯，受来源和网络影响；关闭软件后停止。新完整日线到达后才比较候选模型，盘中报价不是训练样本。</p></div>' +
      '<div class="model-footer">科技观察是参数研究工具，无交易功能。模型、回测及关键词情绪均不能替代对来源和风险的独立核对。行情接口没有延迟或可用性保证。</div>';
    $('auto-sync-toggle').onchange = function (e) { state.autoSync = e.target.checked; safeStorageWrite('ui.autoSync', state.autoSync); if (Market.setBackground) { try { Market.setBackground(state.autoSync); } catch (_) {} } showToast(state.autoSync ? '已开启自动同步与候选验证' : '已关闭自动同步；仍可手动更新'); };
    $('train-model').onclick = function () { trainModel(true); };
    $('sync-model-data').onclick = function () { syncData(true); };
    enhance();
  }
  function canvasContext(canvas) {
    if (!canvas) return null;
    var rect = canvas.getBoundingClientRect(), width = Math.max(200, rect.width), height = Math.max(180, rect.height), ratio = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext('2d'); if (!ctx) return null;
    ctx.scale(ratio, ratio); ctx.clearRect(0, 0, width, height); ctx.font = '10px system-ui, sans-serif'; ctx.textBaseline = 'middle';
    return { ctx: ctx, width: width, height: height };
  }
  function chartEmpty(c, text) { c.ctx.fillStyle = '#64758d'; c.ctx.textAlign = 'center'; c.ctx.fillText(text, c.width / 2, c.height / 2); }
  function drawCandles(canvas, allBars, days) {
    var c = canvasContext(canvas); if (!c) return;
    var all = validBars(allBars), bars = all.slice(-days), ctx = c.ctx;
    if (bars.length < 2) { chartEmpty(c, '历史样本不足，联网后同步日线'); return; }
    var left = 4, right = 47, top = 17, bottom = c.height - 58, plotW = c.width - left - right;
    var lo = Math.min.apply(null, bars.map(function (b) { return Number(b.low || b.close); })), hi = Math.max.apply(null, bars.map(function (b) { return Number(b.high || b.close); }));
    var span = hi - lo || hi * .05 || 1; lo -= span * .07; hi += span * .07; span = hi - lo;
    var y = function (v) { return top + (hi - Number(v)) / span * (bottom - top); }, step = plotW / bars.length, x = function (i) { return left + (i + .5) * step; };
    ctx.lineWidth = .7;
    for (var k = 0; k <= 4; k++) { var gy = top + (bottom - top) / 4 * k; ctx.strokeStyle = '#e6ebf3'; ctx.beginPath(); ctx.moveTo(left, gy); ctx.lineTo(c.width - right + 1, gy); ctx.stroke(); ctx.fillStyle = '#75839a'; ctx.textAlign = 'left'; ctx.fillText(fmt(hi - span / 4 * k, hi < 10 ? 3 : 2), c.width - right + 6, gy); }
    var volMax = Math.max.apply(null, bars.map(function (b) { return Number(b.volume) || 0; })) || 1;
    bars.forEach(function (b, i) {
      var color = Number(b.close) >= Number(b.open) ? '#c83d4d' : '#128466', cx = x(i), bw = Math.max(.8, Math.min(9, step * .66)), open = Number(b.open || b.close), close = Number(b.close);
      ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = .85; ctx.beginPath(); ctx.moveTo(cx, y(b.high || Math.max(open, close))); ctx.lineTo(cx, y(b.low || Math.min(open, close))); ctx.stroke();
      var cy = Math.min(y(open), y(close)), bh = Math.max(1, Math.abs(y(open) - y(close))); if (close >= open && step > 3) ctx.strokeRect(cx - bw / 2, cy, bw, bh); else ctx.fillRect(cx - bw / 2, cy, bw, bh);
      ctx.globalAlpha = .45; ctx.fillRect(cx - bw / 2, c.height - 24 - Number(b.volume || 0) / volMax * 24, bw, Number(b.volume || 0) / volMax * 24); ctx.globalAlpha = 1;
    });
    [[5, '#be8b34'], [20, '#255bca'], [60, '#142747']].forEach(function (m) {
      ctx.strokeStyle = m[1]; ctx.lineWidth = 1.15; ctx.beginPath(); var started = false, offset = all.length - bars.length;
      bars.forEach(function (_, i) { var globalI = offset + i; if (globalI < m[0] - 1) return; var sum = 0; for (var j = globalI - m[0] + 1; j <= globalI; j++) sum += Number(all[j].close); var cy = y(sum / m[0]); if (!started) { ctx.moveTo(x(i), cy); started = true; } else ctx.lineTo(x(i), cy); }); ctx.stroke();
    });
    ctx.fillStyle = '#75839a'; [0, Math.floor((bars.length - 1) / 2), bars.length - 1].forEach(function (i, j) { ctx.textAlign = j === 0 ? 'left' : j === 2 ? 'right' : 'center'; ctx.fillText(bars[i].date.slice(5), j === 0 ? left : j === 2 ? c.width - right : x(i), c.height - 10); });
    ctx.textAlign = 'left'; ctx.fillText('成交量', left, bottom + 15);
  }
  function drawReturns(canvas, curve) {
    var c = canvasContext(canvas); if (!c) return;
    var list = (curve || []).filter(function (x) { return x && x.date && finite(x.strategy) && finite(x.benchmark); }), ctx = c.ctx;
    if (list.length < 2) { chartEmpty(c, '运行检验后显示模拟净值曲线'); return; }
    var values = list.reduce(function (a, x) { return a.concat([Number(x.strategy), Number(x.benchmark)]); }, []), lo = Math.min.apply(null, values), hi = Math.max.apply(null, values), span = hi - lo || .1;
    lo -= span * .12; hi += span * .12; span = hi - lo;
    var left = 4, right = 41, top = 18, bottom = c.height - 28, plotW = c.width - left - right;
    var x = function (i) { return left + i / (list.length - 1) * plotW; }, y = function (v) { return top + (hi - Number(v)) / span * (bottom - top); };
    for (var k = 0; k <= 4; k++) { var gy = top + (bottom - top) / 4 * k; ctx.strokeStyle = '#e6ebf3'; ctx.lineWidth = .7; ctx.beginPath(); ctx.moveTo(left, gy); ctx.lineTo(c.width - right, gy); ctx.stroke(); ctx.fillStyle = '#75839a'; ctx.textAlign = 'left'; ctx.fillText(fmt(hi - span / 4 * k, 2), c.width - right + 6, gy); }
    [['benchmark', '#8594ac'], ['strategy', '#255bca']].forEach(function (series) { ctx.beginPath(); ctx.strokeStyle = series[1]; ctx.lineWidth = series[0] === 'strategy' ? 2 : 1.35; list.forEach(function (p, i) { if (i) ctx.lineTo(x(i), y(p[series[0]])); else ctx.moveTo(x(i), y(p[series[0]])); }); ctx.stroke(); });
    ctx.fillStyle = '#75839a'; [0, Math.floor((list.length - 1) / 2), list.length - 1].forEach(function (i, j) { ctx.textAlign = j === 0 ? 'left' : j === 2 ? 'right' : 'center'; ctx.fillText(list[i].date.slice(5), x(i), c.height - 10); });
  }
  async function refreshNews(manual) {
    if (!Market.news) return;
    if (manual) showToast('正在获取最新公开资讯');
    try { var items = await Market.news(); if (Array.isArray(items)) { state.news = items; lastNewsFetch = Date.now(); safeStorageWrite('ui.news', items); if (state.tab === 'news') renderNews(); if (manual) showToast((items.length && items.every(function (n) { return n.cached; }) ? '读取已有资讯缓存，共' : '资讯已刷新，共') + items.length + '条'); } }
    catch (e) { if (manual) showToast('资讯连接未完成，保留已有结果。' + safeError(e)); }
  }
  async function refreshQuotes(manual) {
    if (!state.initialized || !Market.quotes) return;
    try {
      var quotes = await Market.quotes();
      if (quotes && Object.keys(quotes).length) { state.quotes = Object.assign({}, state.quotes, quotes); var cached = Object.keys(quotes).every(function (k) { return quotes[k].cached; }); state.connection = cached ? 'offline' : 'online'; if (!cached) state.lastFetch = new Date().toISOString(); safeStorageWrite('ui.quotes', state.quotes); renderActive(); if (manual) showToast(cached ? '行情未更新，读取已有缓存' : '行情已更新'); }
      else throw new Error('来源未返回报价');
    } catch (e) { state.connection = 'offline'; setConnection(); if (manual) showToast('行情连接未完成，已有样本仍可查看。' + safeError(e)); }
  }
  async function refreshSectors() {
    if (!Market.sectors) return;
    try { var items = await Market.sectors(); if (Array.isArray(items) && items.length) { state.sectors = items; if (state.tab === 'observe') renderObserve(); } } catch (_) {}
  }
  function setProgress(current, total, symbol) {
    if (typeof current === 'object' && current) { symbol = current.symbol || current.name; total = current.total; current = current.completed || current.current || current.done || 0; }
    if (typeof current === 'string' && !finite(current)) state.progressLabel = current;
    else { state.progress = finite(total) && Number(total) > 0 ? Number(current) / Number(total) * 100 : finite(current) ? Math.min(100, Number(current)) : state.progress; state.progressLabel = '同步完整日线 ' + (finite(current) ? current : '') + (finite(total) ? '/' + total : '') + (symbol ? ' · ' + info(symbol).name : ''); }
    setConnection(); if (state.tab === 'model') renderModel();
  }
  function maybeAutomaticSync() {
    if (!state.autoSync || document.hidden || state.busy || state.training || state.evaluating) return;
    if (lastAutomaticSyncAt && Date.now() - lastAutomaticSyncAt < 30 * 60 * 1000) return;
    var clock = chinaClock(), last = state.lastSync ? chinaClock(state.lastSync) : null;
    var newDay = !last || last.day !== clock.day;
    var incompleteClose = clock.hour >= 16 && (last && last.hour < 16 || latestDate() < clock.day);
    if (newDay || incompleteClose) { lastAutomaticSyncAt = Date.now(); syncData(false); }
  }
  async function syncData(manual) {
    if (state.busy || state.training || state.evaluating) { if (manual) showToast('已有任务正在运行，请稍后'); return false; }
    state.busy = true; state.progress = 0; state.progressLabel = '正在同步完整日线'; renderActive();
    var success = false;
    try {
      await Promise.allSettled([refreshQuotes(false), refreshNews(false), refreshSectors()]);
      if (Market.syncHistories) {
        var histories = await Market.syncHistories(setProgress);
        if (histories && histories.histories) histories = histories.histories;
        if (histories && Object.keys(histories).length) { state.histories = Object.assign({}, state.histories, histories); state.lastSync = new Date().toISOString(); safeStorageWrite('ui.lastSync', state.lastSync); recomputePredictions(); success = true; }
      }
      if (state.selected && Market.rawHistory) { try { state.rawHistories[state.selected] = validBars(await Market.rawHistory(state.selected)); } catch (_) {} }
      if (!success) throw new Error('完整日线未更新');
    } catch (e) { state.connection = 'offline'; if (manual) showToast('同步未完成，保留已有真实样本。' + safeError(e)); }
    finally { state.busy = false; state.progressLabel = ''; renderActive(); }
    if (success && (manual || state.autoSync)) {
      // Synchronizing new data never promotes or retrains the deployed model.
      if (manual) showToast('日线已同步，候选模型比较已完成');
    }
    return success;
  }
  async function trainModel(manual) {
    if (state.training || state.busy || state.evaluating) { if (manual) showToast('已有任务正在运行，请稍后'); return; }
    if (!Object.keys(state.histories).length) { showToast('历史样本尚未载入，请先同步完整日线'); return; }
    state.training = true; state.progress = 15; state.progressLabel = '正在比较候选与当前模型'; renderActive();
    await new Promise(function (resolve) { setTimeout(resolve, 60); });
    try {
      var cutoff = latestDate() || today();
      if (state.model && Analysis.updateChampion) {
        var result = await Promise.resolve(Analysis.updateChampion(state.histories, state.model, { cutoff: cutoff, horizon: 20, alpha: finite(state.model.alpha) ? Number(state.model.alpha) : state.backtestAlpha }));
        if(result&&result.model)safeStorageWrite('model.researchCandidate',result.model);
        state.upgrade={accepted:false,deployed:false,researchAccepted:!!(result&&result.accepted),reason:'仅保存研究候选，未通过同账户、费用、风险及前瞻检验，不自动部署。'+(result&&result.reason||''),comparison:result&&result.comparison||null};
      } else {
        var candidate=await Promise.resolve(Analysis.train(state.histories,{cutoff:cutoff,horizon:20,alpha:state.backtestAlpha}));if(candidate)safeStorageWrite('model.researchCandidate',candidate);
        state.upgrade={accepted:false,deployed:false,reason:'初始候选仅研究，不自动发布投资模型'};
      }
      safeStorageWrite('model.researchComparison', state.upgrade); recomputePredictions();
      if (manual) showToast(state.upgrade.accepted ? '模型验证通过，已保存新版本' : state.upgrade.reason || '未满足升级条件，保留当前模型');
    } catch (e) { if (manual) showToast('训练未完成，保留当前模型。' + safeError(e)); state.upgrade = { accepted: false, reason: safeError(e) }; }
    finally { state.training = false; state.progressLabel = ''; renderActive(); }
  }
  async function runBacktest(year) {
    if (state.evaluating || state.training || state.busy) { showToast('已有任务正在运行，请稍后'); return; }
    if (!Object.keys(state.histories).length) { showToast('历史样本尚未载入，请先同步完整日线'); return; }
    state.evaluating = true; state.progressLabel = '正在运行' + year + '历史检验'; renderActive();
    await new Promise(function (resolve) { setTimeout(resolve, 60); });
    try {
      var report = await Promise.resolve(Analysis.evaluate(state.histories, year, { horizon: 20, alpha: state.backtestAlpha }));
      if (!report) throw new Error('检验未返回结果');
      state.reports[year] = report; safeStorageWrite('report.' + year, report); showToast(year + '历史检验已完成');
    } catch (e) { showToast('历史检验未完成。' + safeError(e)); }
    finally { state.evaluating = false; state.progressLabel = ''; renderActive(); }
  }
  async function initialize() {
    document.querySelectorAll('.bottom-nav button').forEach(function (b) { b.onclick = function () { switchTab(b.dataset.tab); }; });
    document.querySelector('.brand').onclick = function (e) { e.preventDefault(); switchTab('observe'); };
    $('refresh-button').onclick = function () { syncData(true); };
    if (!window.Market || !window.Analysis) { $('page-observe').innerHTML = '<div class="empty-state"><strong>应用资源尚未载入</strong>请重新打开应用；如仍失败，请重新下载完整软件。</div>'; return; }
    universe = Array.isArray(Market.UNIVERSE) ? Market.UNIVERSE : [];
    state.selected = safeStorageRead('ui.selected') || universe.length && universe[0].symbol || '';
    if (!universe.some(function (u) { return u.symbol === state.selected; })) state.selected = universe.length && universe[0].symbol || '';
    var auto = safeStorageRead('ui.autoSync'); state.autoSync = auto === null || auto === undefined ? true : auto === true;
    var seed = {};
    try { seed = await Market.loadSeed() || {}; } catch (_) { seed = window.TECH_SEED || {}; }
    var restored = null;
    if (Market.restoreHistories) { try { restored = await Promise.resolve(Market.restoreHistories(seed)); } catch (_) {} }
    state.histories = restored && restored.histories || seed.histories || {};
    state.rawHistories = restored && restored.rawHistories || seed.rawHistories || {};
    var seedAlpha = firstValue(seed.model && seed.model.validation, ['selectedAlpha']);
    if (!finite(seedAlpha)) seedAlpha = firstValue(seed.model, ['alpha']);
    state.backtestAlpha = finite(seedAlpha) ? Number(seedAlpha) : 0.1;
    state.generatedAt = seed.generatedAt || ''; state.model = safeStorageRead('model.approved') || seed.model || null;
    state.quotes = safeStorageRead('ui.quotes') || seed.quoteSnapshot || {};
    Object.keys(state.quotes).forEach(function (k) { state.quotes[k] = Object.assign({}, state.quotes[k], { cached: true }); });
    state.news = safeStorageRead('ui.news') || seed.newsSnapshot || []; state.sectors = seed.sectorSnapshot || [];
    if (Array.isArray(seed.reports)) seed.reports.forEach(function (r) { if (r && r.year) state.reports[r.year] = r; });
    else state.reports = seed.reports || {};
    [2025, 2026].forEach(function (year) { var cached = safeStorageRead('report.' + year); if (cached && cached.baselines) state.reports[year] = cached; });
    state.lastSync = safeStorageRead('ui.lastSync') || ''; state.upgrade = safeStorageRead('model.researchComparison');
    if (Market.setBackground) { try { Market.setBackground(state.autoSync); } catch (_) {} }
    state.initialized = true; recomputePredictions(); renderActive();
    await Promise.allSettled([refreshQuotes(false), refreshNews(false), refreshSectors()]);
    quoteTimer = setInterval(function () { if (state.autoSync && !document.hidden && !state.busy && !state.training && !state.evaluating) { refreshQuotes(false); if (Date.now() - lastNewsFetch > 5 * 60 * 1000) { refreshNews(false); refreshSectors(); } maybeAutomaticSync(); } }, 30000);
    if (state.autoSync) setTimeout(maybeAutomaticSync, 3500);
    document.addEventListener('visibilitychange', function () { if (!document.hidden && state.autoSync) { refreshQuotes(false); maybeAutomaticSync(); } });
  }
  window.addEventListener('resize', function () { if (state.tab === 'detail') { var raw = rawBarsFor(state.selected); drawCandles($('price-chart'), raw.length ? raw : barsFor(state.selected), state.chartDays); } if (state.tab === 'backtest') drawReturns($('backtest-chart'), reportFor(state.year) && reportFor(state.year).curve || []); });
  window.TechScopeUI = { state: state, switchTab: switchTab, selectInstrument: selectInstrument, render: renderActive, refresh: syncData, train: trainModel, runBacktest: runBacktest };
  window.TechScopeBack = function () { if (state.tab !== 'observe') { switchTab('observe'); return true; } return false; };
  initialize().catch(function (e) { state.connection = 'offline'; setConnection(); showToast('载入未完成。' + safeError(e)); });
})();
