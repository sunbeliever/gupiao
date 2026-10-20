(function () {
  'use strict';
  var journal, lastPredictions, lastHistories, currentState, accountResearch, announcementState = {};
  var paperSession, legacySession, paperRestoreBlocked = false, paperLoaded = false, lastPaperQuotes, paperError = '', startingPaper = false;
  var smallSettings = { budget: 10000, positionLimit: 10000, investableLimit:10000,maxExposure:1,maxThemeWeight:1,minFee: 5,commissionRate:.0003,slippage:.001,allocationMode: 'full' };
  var esc = function (x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var pc = function (x) { return typeof x === 'number' && Number.isFinite(x) ? (x * 100).toFixed(2) + '%' : '—'; };
  var pp = function (x) { return typeof x === 'number' && Number.isFinite(x) ? (x * 100).toFixed(2) + ' pp' : '—'; };
  var localTime = function (x) { var t = new Date(x); return Number.isFinite(t.getTime()) ? t.toLocaleString('zh-CN', { hour12: false }) : '未提供'; };
  function insert(page, id, html) {
    var old = document.getElementById(id);
    if (old) old.remove();
    var node = document.createElement('section'); node.id = id; node.className = 'research-card'; node.innerHTML = html;
    var lead = page.querySelector('.page-lead');
    if (lead) lead.insertAdjacentElement('afterend', node); else page.prepend(node);
    return node;
  }
  function compare(report) {
    if (!report || !report.baselines) return '<p>此报告尚无基准对照，请重新运行检验。</p>';
    var b = report.baselines;
    return '<div class="research-table-wrap"><table class="research-table"><thead><tr><th>同一批成熟标签</th><th>收益平均误差 ↓</th><th>方向命中</th></tr></thead><tbody>' +
      [['当前算法', report.mae, report.directionAccuracy], ['预测为训练期平均收益', b.trainingMean.mae, b.trainingMean.directionAccuracy], ['预测为零收益', b.zeroReturn.mae, null], ['始终预测上涨', null, b.alwaysUp.directionAccuracy]].map(function (r) {
        return '<tr><td>' + r[0] + '</td><td class="number">' + pp(r[1]) + '</td><td class="number">' + pc(r[2]) + '</td></tr>';
      }).join('') + '</tbody></table></div><p class="footnote">截至 ' + esc(report.asOf) + '，' + report.sampleCount + '个标的日标签 / ' + (report.signalDayCount || '—') + '个信号日。标签重叠且相关，不能当作同等数量的独立试验。pp 为收益百分点；误差越低越好。方向命中不是盈利概率。</p>';
  }
  function readiness(state) {
    var r = state.reports[2026];
    return '<div class="research-eyebrow">实盘推荐状态 · 尚未验证</div><h2>暂不发出实盘买入推荐</h2>' +
      '<p>候选排名可用于核查参数，但现有模型尚未证明稳定优于简单预测。没有足够证据时，系统保留不推荐。</p>' +
      '<details><summary>查看 ' + (r ? '2026' : '') + ' 预测与简单方法的对照</summary>' + compare(r) + '</details>' +
      '<p class="footnote">当前训练的是11个技术因子的岭回归模型；没有训练或接入大语言模型。新闻、公告和当前PE/PB供核对，尚未进入预测。持有周期为20个交易日左右。</p>' + beginnerGuide() + '<button id="open-paper" class="secondary-button">1万元全额资金模拟与测试结果 →</button>';
  }
  function beginnerGuide() {
    return '<details class="beginner-guide"><summary>第一次投资：先看懂这几件事</summary><p>1万元是总预算，不需要一次投入。单只500元、最多3只只是小额学习用的模拟限制，不是最佳投资比例；没有满足条件的标的时可以全部保留现金。</p>' +
      '<p>普通A股通常以100股整手买入；10元一股，100股约1000元，另加费用。场内ETF通常100份起买，2元一份约200元。ETF是一篮子证券，但多个科技ETF也可能重仓相同公司，不能算充分分散。</p>' +
      '<p>新手模式默认未开通创业板、科创板个股权限。创业板新申请一般要求前20个交易日日均资产10万元和24个月交易经验；科创板为50万元及24个月。主题ETF与直接买入这些个股是不同产品，具体准入由券商确认。</p>' +
      '<p>若每笔最低佣金为5元，500元买入再原价卖出，仅双边佣金约10元、占2%，还没计滑点和税费。ETF最低佣金依券商合同，可能不同；下方必须按实际约定填写，默认5元仅为模拟假设。</p>' +
      '<p>普通A股及境内股票ETF通常不能把当天新买入的份额当天卖出。软件不承诺止损一定成交，涨跌停、停牌和跳空都可能改变结果。</p>' +
      '<div class="research-table-wrap"><table class="research-table"><tbody>' +
      [['收益与亏损','投入500元，价格涨1%只有约5元毛收益；1万元亏10%是1000元，需涨约11.11%才能回本。'],['PE / PB','PE看价格相对盈利，PB看价格相对净资产。低不等于便宜，负PE不能当低估；ETF不直接套用单家公司指标。'],['MA / RSI','均线和RSI概括过去价格趋势与涨跌强弱。超买、超卖不是必涨必跌信号。'],['回撤 / 波动','回撤是从此前高点下跌多少；波动描述涨跌幅度，都应与收益一起看。'],['胜率 / 赚钱概率','赢7次、每次赚1元，输3次、每次亏5元，总计仍亏8元。模型分数不是已验证的赚钱概率。'],['真实验证','先保存模型、输入、选择与真实发布时间，等20个交易日结果成熟后再评分。反复调到某一次盈利不能证明有效。']].map(function (r) { return '<tr><th>' + r[0] + '</th><td class="guide-explanation">' + r[1] + '</td></tr>'; }).join('') +
      '</tbody></table></div><p class="footnote">规则核查于2026-10-19：<a href="https://www.sse.com.cn/assortment/fund/etf/question/" target="_blank" rel="noreferrer">上交所ETF说明</a> · <a href="https://investor.szse.cn/knowledge/t20200513_577026.html" target="_blank" rel="noreferrer">创业板准入</a> · <a href="https://www.sse.com.cn/lawandrules/sselawsrules2025/stocks/exchange/c/c_20260424_10816482.shtml" target="_blank" rel="noreferrer">上交所2026交易规则</a>。以交易所和券商现行规则为准。</p></details>';
  }
  function smallPreview(state) {
    try {
      var p = Paper.plan({ universe: Market.UNIVERSE, quotes: state.quotes, predictions: state.predictions, budget: smallSettings.budget, positionLimit: smallSettings.positionLimit, minFee: smallSettings.minFee, allocationMode: 'full' });
      return '<details><summary>查看小额筛选：当前' + p.selected.length + '只满足模拟条件</summary><p>先将信号后开盘起算的20日估计换算到盘中买入价，再扣模拟双边佣金与滑点进行研究排序，最多3只；不能负担、无权限或估计不足以覆盖费用时排除。这仍是原模型的研究估计，不是盘中新训练的预测，也不代表实盘优势；点击开始时联网重新计算并冻结。</p><div class="research-table-wrap"><table class="research-table"><thead><tr><th>标的</th><th>最小买入估算</th><th>当前研究检查</th></tr></thead><tbody>' + p.rows.map(function (r) { return '<tr><td>' + esc(r.name) + '<small>' + esc(r.symbol) + '</small></td><td>' + (Number.isFinite(r.minimumBuyCost) ? '¥' + r.minimumBuyCost.toFixed(2) : '—') + '</td><td>' + esc(r.selected ? '小额模拟候选；非实盘推荐' : r.reason) + '</td></tr>'; }).join('') + '</tbody></table></div><p class="footnote">当前筛选与模拟共用同版费用，股票计入卖出印花税及双边过户费；输入的最低佣金只控制本次新模拟，不能回改旧持仓费用。免费行情可能延迟，来源过旧时不入选。</p></details>';
    } catch (e) { return '<p class="research-warning">小额设置有误：总预算至少1000元，单只额度100元至总预算，最低佣金0至100元。</p>'; }
  }
  function legacyPaperMarkup(state) {
    var s = paperSession, history = window.RESEARCH_RESULTS && RESEARCH_RESULTS.historical;
    var html = '<div class="research-eyebrow">全额资金模拟 · 软件选择并冻结 · 无真实下单</div><h2>用1万元配置1至3只合格标的</h2><p>总本金用于组合投资，按实际入选数量均分，余款仅来自整手和手续费；无合格候选则明确保留现金。买价增加0.1%滑点，佣金按0.03%和最低额较高者估算。70%扣费后盈利机会、账户年收益10%至20%是待验证目标，当前未达到，也不能保证真实成交或盈利。</p>' +
      '<div class="small-settings"><label>虚拟投资总本金（元）<input id="small-budget" type="number" min="1000" max="10000000" step="100" value="' + smallSettings.budget + '"></label><label>单只上限（按入选数自动分配）<input id="small-position" type="number" disabled value="' + smallSettings.budget + '"></label><label>模拟单边最低佣金（元）<input id="small-min-fee" type="number" min="0" max="100" step="0.01" value="' + smallSettings.minFee + '"></label></div>' + smallPreview(state) + beginnerGuide() +
      '<button id="start-paper" class="primary-button"' + (startingPaper || s && s.automation && !s.automation.windowEnded ? ' disabled' : '') + '>' + (startingPaper ? '正在联网同步与冻结选择…' : s ? '新建模型模拟组合（归档旧记录）' : '联网更新并开始模型模拟') + '</button>' +
      '<button id="start-auto-paper" class="secondary-button"' + (startingPaper || s && s.automation && !s.automation.windowEnded ? ' disabled' : '') + '>软件全自动模拟30分钟</button><p>自动模式每次报价更新重查买入条件；价格达到冻结模型估计的20日目标价时请求撤出。受T+1限制则记录未执行，半小时结束不强制卖出。模型和输入不随中途训练更换。只作研究试验，未证明能赚钱。</p>' +
      '<p class="footnote">可在个股详情点“模拟买入此标的”自行试验。仅在交易时段、来源报价足够新且现金够整手时建立模拟持仓；无真实账户或真实下单。A股日内不模拟卖出。开启自动同步且保持窗口打开，每30秒按最新报价估值；关闭后停止，重新打开延续已存持仓。</p>';
    if (paperError) html += '<p class="research-warning">' + esc(paperError) + '</p>';
    if (s && s.automation) {
      var auto = s.automation, labels = {buy:'模拟买入',sell:'模拟卖出',exit_blocked:'撤出未执行（当日不可卖出）'};
      html += '<h3>本机软件自动决策记录</h3><p>' + (auto.windowEnded ? auto.done ? '30分钟观察完成' : '观察未完整完成：' + esc(auto.failureReason || '数据中断') : '正在观察；计划结束 ' + esc(localTime(auto.plannedEndAt))) + '。已实现盈亏 ¥' + s.realizedPnl.toFixed(2) + '；有效采样 ' + auto.validObservations + '；数据异常 ' + auto.dataFailureTicks + '。全现金0收益不计预测成功。</p><div class="research-table-wrap"><table class="research-table"><thead><tr><th>实际决策时间</th><th>代码</th><th>软件动作</th><th>数量 / 模拟价 / 费用</th></tr></thead><tbody>' + auto.events.slice(-80).map(function(e){return '<tr><td>' + esc(localTime(e.observedAt)) + '</td><td>' + esc(e.symbol) + '</td><td>' + esc(labels[e.action] || e.action) + '</td><td>' + e.shares + ' / ' + (Number.isFinite(e.price) ? e.price.toFixed(3) : '—') + ' / ' + (Number.isFinite(e.fee) ? e.fee.toFixed(2) : '—') + '</td></tr>';}).join('') + '</tbody></table></div><p class="footnote">自动模式计入股票卖出印花税0.05%和股票双边过户费0.001%，ETF二级买卖不收这两项；佣金仍是假设。成交按最新价加减0.1%滑点，没有盘口排队验证。保持窗口前台打开及联网；断开超过90秒会标记观察不完整，不能算完成测试。</p>';
    }
    if (s) html += '<div class="research-counts"><span><b>¥' + s.account.equity.toFixed(2) + '</b>模拟总资产</span><span><b>' + pc(s.account.equity / s.budget - 1) + '</b>浮动收益 / 已扣买入费用</span><span><b>' + pc(s.benchmark.equity / s.budget - 1) + '</b>科创50 ETF对照</span></div>' +
      '<p>已存模拟本金 ¥' + s.budget.toLocaleString('zh-CN') + '；开始 ' + esc(localTime(s.startedAt)) + '；最近取样 ' + esc(localTime(s.observedAt)) + '。' + (s.selection.includes('manual') ? '你手动指定的模拟标的' : '软件固定选择') + '，现金 ¥' + s.account.cash.toFixed(2) + (s.selectionPlan ? (s.selectionPlan.allocationMode === 'full' ? '，总资金按入选数量分配' : '，旧版每只额度 ¥' + s.selectionPlan.positionLimit) + '，最低佣金假设 ¥' + s.minFee : '') + '。20日预测仍未到期，准确度未评分。</p>' +
      '<div class="research-table-wrap"><table class="research-table"><thead><tr><th>模拟持仓</th><th>股数</th><th>调整后成本价 / 最新价</th><th>行情来源时间</th></tr></thead><tbody>' + s.account.holdings.map(function (h) { return '<tr><td>' + esc(h.name) + '<small>' + esc(h.symbol) + '</small></td><td>' + h.shares + '</td><td>' + h.entryPrice.toFixed(3) + ' / ' + h.lastPrice.toFixed(3) + (h.originalEntryPrice ? '<small>拆分前买入 ' + h.originalEntryShares + '份 × ' + h.originalEntryPrice.toFixed(3) + '</small>' : '') + '</td><td>' + esc(h.lastSourceTime) + '</td></tr>'; }).join('') + '</tbody></table></div><p class="footnote">收益为未实现估值，不含未来卖出费用；现金对照始终0%。已核实的基金拆分调整份额和单位成本，保留原买入记录；公司行动台账覆盖范围见模型页，后续新事件仍需核实。缺失、迟到或休市报价不会伪装成新成交。冻结模型 ' + esc(s.model.version || '—') + '，截止 ' + esc(s.model.cutoff || '—') + '；不会随重新训练改写已选持仓。</p>';
    if (history) html += '<details><summary>2023年固定抽样8轮结果（包含亏损）</summary><p>8轮中' + history.summary.profitableRounds + '轮盈利；全部预测方向 ' + pc(history.summary.directionAccuracy) + '，始终上涨 ' + pc(history.summary.alwaysUpAccuracy) + '。模型收益平均误差 ' + pp(history.summary.mae) + '，零收益 ' + pp(history.summary.zeroMae) + '。</p><div class="research-table-wrap"><table class="research-table"><thead><tr><th>信号日</th><th>固定选择</th><th>模型组合</th><th>同池等权</th><th>科创50 ETF</th></tr></thead><tbody>' + history.rounds.map(function (r) { return '<tr><td>' + esc(r.signalDate) + '</td><td>' + esc(r.chosen.map(function (h) { return h.name; }).join('、')) + '</td><td>' + pc(r.modelReturn) + '</td><td>' + pc(r.poolReturn) + '</td><td>' + pc(r.etfReturn) + '</td></tr>'; }).join('') + '</tbody></table></div><p class="footnote">抽样规则和正则参数在评分前固定，决策只用信号日及之前的数据。当前手选科技池仍有幸存者偏差。这是后复权日线20日区间模拟、每边近似费用0.15%，不是实际成交、不是全年收益，不能由高收益推断选股准确。</p></details>';
    var ml = window.RESEARCH_RESULTS && RESEARCH_RESULTS.mlResearch;
    if (ml) html += '<details><summary>新增非线性机器学习候选：未达到升级依据</summary><p>已在本机研究训练技术因子分类模型，先用过去数据拟合，再用下一年校准，最后冻结检验后续年度。不是大语言模型，也没有部署替换当前模型。</p><div class="research-table-wrap"><table class="research-table"><thead><tr><th>检验年</th><th>净收益方向正确率</th><th>始终预测盈利</th><th>分数≥0.70的标签</th></tr></thead><tbody>' + ml.rows.map(function (r) { return '<tr><td>' + r.year + '</td><td>' + pc(r.directionAccuracy) + '</td><td>' + pc(r.alwaysUpAccuracy) + '</td><td>' + r.selectedLabels + '</td></tr>'; }).join('') + '</tbody></table></div><p class="footnote">0.70是模型输出阈值，不是验证后的70%赚钱把握。2026只有5个阈值以上标签，其中3个来自同一股票相邻日期，样本重叠；即使全部价格净收益为正，也不足以证明70%长期胜率。2026检验只截至2026-09-30，价格净收益标签含近似每边0.15%费用，不等同真实成交。</p></details>';
    var candidate = window.RESEARCH_RESULTS && RESEARCH_RESULTS.candidateLive;
    var replay = window.RESEARCH_RESULTS && RESEARCH_RESULTS.automaticHistory;
    if (replay) html += '<details id="automatic-history-results"><summary>历史随机半小时：' + replay.summary.sampledWindows + '个窗口，全部结果</summary><p>完整 ' + replay.summary.completeWindows + '；缺数据未完成 ' + replay.summary.unresolvedWindows + '；有买入 ' + replay.summary.exposedWindows + '；全现金 ' + replay.summary.cashOnlyWindows + '。有持仓窗口中盈利 ' + replay.summary.profitableExposedWindows + '、亏损 ' + replay.summary.losingExposedWindows + '；现金不计预测成功。</p><div class="research-table-wrap"><table class="research-table"><thead><tr><th>历史开始</th><th>软件选择</th><th>半小时账面盈亏</th><th>买入 / 卖出 / 撤出未执行</th></tr></thead><tbody>' + replay.rounds.map(function(r){return '<tr><td>' + esc(localTime(r.startAt)) + '</td><td>' + esc(r.symbols.join('、') || '现金 / 参见完整性') + '</td><td>' + (r.complete ? '¥' + r.netPnl.toFixed(2) : '未完成：' + esc(r.reason)) + '</td><td>' + (r.buys || 0) + ' / ' + (r.sells || 0) + ' / ' + (r.blockedExits || 0) + '</td></tr>';}).join('') + '</tbody></table></div><p class="footnote">真实历史5分钟收盘快照重放，不是今天实时经历半小时；抽样种子20261019、模型与规则先固定，只用各窗口前已完成日线。5分钟内发生的变化不能验证。窗口各自用独立1万元，不累计成收益；当前手选池存在幸存者偏差。新闻尚未用于预测，不事后附会原因。模型目标为20个交易日，半小时不评分其预测准确率。</p></details>';
    var small = window.RESEARCH_RESULTS && RESEARCH_RESULTS.smallBudgetLive;
    if (small) html += '<details><summary>第三轮：初始小额规则观察（保留发现的问题）</summary><p>' + (small.done ? '实际一小时已完成' : '仍在实际观察，未满一小时') + '；开始 ' + esc(localTime(small.startedAt)) + '，数据截至 ' + esc(localTime(small.observedAt)) + '。模拟资产 ¥' + small.session.account.equity.toFixed(2) + '，浮动收益 ' + pc(small.session.account.equity / small.session.budget - 1) + '；同额满仓ETF对照 ' + pc(small.session.benchmark.equity / small.session.budget - 1) + '。保留现金 ¥' + small.session.account.cash.toFixed(2) + '。</p><p class="footnote">本轮冻结的是1.3初始规则，后来发现成本比较未换算盘中买价起点；已另开修正版观察，原记录保留，不能作为修正版的成绩。初始1万元、每只500元、最多3只、单边最低佣金5元；全现金的0收益不是预测成功。</p></details>';
    var correctedSmall = window.RESEARCH_RESULTS && RESEARCH_RESULTS.smallBudgetV2Live;
    if (correctedSmall) html += '<details><summary>第四轮：修正版1万元软件选择观察</summary><p>' + (correctedSmall.done ? '实际一小时已完成' : '仍在实际观察，未满一小时') + '；开始 ' + esc(localTime(correctedSmall.startedAt)) + '，数据截至 ' + esc(localTime(correctedSmall.observedAt)) + '。资产 ¥' + correctedSmall.session.account.equity.toFixed(2) + '，浮动收益 ' + pc(correctedSmall.session.account.equity / correctedSmall.session.budget - 1) + '；同额满仓ETF对照 ' + pc(correctedSmall.session.benchmark.equity / correctedSmall.session.budget - 1) + '。现金 ¥' + correctedSmall.session.account.cash.toFixed(2) + '。</p><p class="footnote">与1.3.1新手版同一选择规则，按当前交易日开盘价换算模型起点，再检查小额成本。按实际新入场时刻冻结，没有回写第三轮或按后续盈亏换股。现金不计作预测成功；本机账户与制作期间快照不混合。</p></details>';
    if (candidate) html += '<details><summary>第二轮固定候选独立实验</summary><p>' + (candidate.done ? '实际开始 ' + esc(localTime(candidate.startedAt)) + '，结束 ' + esc(localTime(candidate.observedAt)) + '。虚拟本金 ¥' + candidate.session.budget.toLocaleString('zh-CN') + '；组合浮动收益 ' + pc(candidate.session.account.equity / candidate.session.budget - 1) + '，ETF对照 ' + pc(candidate.session.benchmark.equity / candidate.session.budget - 1) + '。' : '计划2026-10-19 13:01开始，实际记录满一小时后再计分。虚拟本金50万元，候选新易盛、中际旭创，每只最多20%，保留现金。') + '</p><p class="footnote">仅为非线性研究候选的虚拟实验，不是实盘推荐。模型分数不是已证实的赚钱概率；与第一轮时段、仓位不同，不能直接归因为模型变好。没有真实下单或日内卖出。</p></details>';
    var live = window.RESEARCH_RESULTS && RESEARCH_RESULTS.live;
    if (live) html += '<details><summary>制作期间一小时实时实验记录</summary><p>实际开始 ' + esc(localTime(live.startedAt)) + '，观察结束 ' + esc(localTime(live.observedAt)) + '；' + live.ticks + '次采样，' + live.exceptionTicks + '次异常，' + live.cachedResponseTicks + '次全缓存；持仓价格在采样间变化 ' + live.priceChangedTicks + '次。</p><p>模型组合浮动收益 ' + pc(live.session.account.equity / live.session.budget - 1) + '，科创50 ETF对照 ' + pc(live.session.benchmark.equity / live.session.budget - 1) + '。本次只检验连通性与浮动估值，不能评定20日预测准确度。跨午间休市，来源快照时间为 ' + esc(live.lastSourceTime) + '，即使休市也可能更新，并非最近成交时间。</p></details>';
    return html;
  }
  function continuousMarkup(state) {
    var s=paperSession,locked=!!s,disabled=locked?' disabled':'',settings=s?s.settings:smallSettings;
    var html='<div class="research-eyebrow">持续模拟账户 · 科技ETF执行 · 股票仅研究</div><h2>同一账户跨日持有与退出</h2><p>30分钟只检查刷新和执行，结束后持仓仍继续估值。新观察不重置本金、现金或亏损；退出规则、费用和模型在开户时冻结。当前仍未证明投资优势。</p>'+
      '<div class="small-settings"><label>命名方案<select id="paper-preset"'+disabled+'><option value="full"'+(settings.allocationMode==='full'?' selected':'')+'>全额资金配置</option><option value="capped"'+(settings.allocationMode!=='full'?' selected':'')+'>小额学习（每只500元）</option></select></label><label>账户本金<input id="small-budget" type="number" min="1000" value="'+(s?s.budget:smallSettings.budget)+'"'+disabled+'></label><label>单只额度<input id="small-position" type="number" disabled value="'+(settings.allocationMode==='full'?(s?s.budget:smallSettings.budget):500)+'"></label><label>单边最低佣金假设<input id="small-min-fee" type="number" min="0" max="100" step="0.01" value="'+(s?s.minFee:smallSettings.minFee)+'"'+disabled+'></label></div>'+
      '<div class="small-settings"><label>可投资额度上限<input id="paper-investable" type="number" min="0" value="'+(s?s.riskLimits.investableLimit:smallSettings.investableLimit)+'"'+disabled+'></label><label>最大仓位（%）<input id="paper-exposure" type="number" min="1" max="100" value="'+100*(s?s.riskLimits.maxExposure:smallSettings.maxExposure)+'"'+disabled+'></label><label>单主题上限（%）<input id="paper-theme" type="number" min="1" max="100" value="'+100*(s?s.riskLimits.maxThemeWeight:smallSettings.maxThemeWeight)+'"'+disabled+'></label><label>佣金率（%）<input id="paper-commission" type="number" min="0" step="0.005" value="'+100*(s?s.feeProfile.commissionRate:smallSettings.commissionRate)+'"'+disabled+'></label><label>假设滑点（%）<input id="paper-slippage" type="number" min="0" step="0.05" value="'+100*(s?s.feeProfile.slippage:smallSettings.slippage)+'"'+disabled+'></label></div>'+
      '<p>账户本金、可投资额度、最大仓位与单主题约束分别保存，按更严格者执行；最多3只。全额方案留整手及费用余款，小额学习默认可投资1500元以内。主题按声明板块分类，未做穿透持仓。账户不会自动追加风险本金；已开户后配置冻结。最低5元为模拟假设，按实际合同填写；股票研究同版计卖出印花税及双边过户费，ETF免这两项。</p>'+
      '<button id="start-paper" class="primary-button"'+(startingPaper||paperRestoreBlocked?' disabled':'')+'>'+(startingPaper?'正在核对完整日线…':s?'联网更新并继续同一账户':'核对数据并建立持续模拟账户')+'</button><button id="start-auto-paper" class="secondary-button"'+(startingPaper||paperRestoreBlocked||s&&!s.automation.windowEnded?' disabled':'')+'>开始30分钟工程观察（不重置资金）</button>'+
      '<p class="footnote">每20交易日到期请求退出，另有入场成本下方8%风险阈值、冻结预测目标价退出；受T+1、停牌、涨跌停或缺价阻止时保留仓位和退出意图。只使用盘中最新价加减声明滑点的假设成交，没有盘口队列验证。拆分和现金分红调整总收益阈值，当前公司行动覆盖仍有限。关闭软件停止采集，重开恢复账本。</p>';
    if(paperError)html+='<p class="research-warning">'+esc(paperError)+'</p>';
    if(s){var a=s.account,o=s.automation;
      html+='<div id="continuous-account-status"><h3>'+esc(s.accountId)+'</h3><p>工程窗口：'+(o.windowEnded?(o.done?'采集检查完成':'采集检查不完整'):'观察中')+'；投资账户：'+esc(s.investmentStatus)+'。窗口结束不代表策略通过。日线应截至 '+esc(s.entryHealth.expectedAsOf)+'；新开仓条件 '+(s.entryHealth.ok?'有效':'暂停：'+esc(s.entryHealth.reason||'交易时段限制'))+'。</p><div class="research-counts"><span><b>¥'+a.equity.toFixed(2)+'</b>总权益</span><span><b>¥'+a.cash.toFixed(2)+'</b>现金</span><span><b>¥'+a.receivableValue.toFixed(2)+'</b>应收分红</span></div><p>现金 '+a.cash.toFixed(2)+' + 市值 '+a.marketValue.toFixed(2)+' + 应收 '+a.receivableValue.toFixed(2)+' = '+a.equity.toFixed(2)+'；冻结资金 '+a.frozenFunds.toFixed(2)+'。已实现 '+a.realizedPnl.toFixed(2)+'；未实现 '+a.unrealizedPnl.toFixed(2)+'；累计费用 '+a.feesPaid.toFixed(2)+'。入场费用已计入盈亏，未退出部分未预扣未来卖费。</p>'+
        '<div class="research-table-wrap"><table id="continuous-holdings" class="research-table"><thead><tr><th>持仓</th><th>份额 / 成本</th><th>末次价 / 估值状态</th><th>T+1可卖 / 到期</th><th>退出计划</th></tr></thead><tbody>'+a.holdings.map(function(h){return '<tr><td>'+esc(h.name)+'<small>'+esc(h.symbol)+'</small></td><td>'+h.shares+' / '+h.entryPrice.toFixed(3)+'</td><td>'+h.lastPrice.toFixed(3)+'<small>'+esc(h.lastSourceTime)+' · '+(h.stale?'过期，保留末次价':'来源有效')+'</small></td><td>'+esc(h.sellableSession)+'<small>'+esc(h.maturitySession)+'</small></td><td>'+esc(h.pendingExit?h.pendingExit.reason:'按冻结规则等待')+'</td></tr>';}).join('')+'</tbody></table></div>'+
        '<h3>同一时点、同一1万元的预设对照</h3><div class="research-table-wrap"><table id="continuous-comparisons" class="research-table"><thead><tr><th>方案</th><th>权益 / 净盈亏</th><th>实际风险暴露</th><th>费用 / 估值完整</th></tr></thead><tbody>'+Object.keys(s.comparisons).map(function(k){var b=s.comparisons[k],names={cash:'现金',hold_etf:'科创50ETF持有',equal_weight:'科技ETF等权'};return '<tr><td>'+esc(names[k])+'</td><td>'+b.equity.toFixed(2)+' / '+(b.equity-s.budget).toFixed(2)+'</td><td>'+pc(b.equity?b.marketValue/b.equity:0)+'</td><td>'+b.feesPaid.toFixed(2)+' / '+(b.valuationComplete===false?'过期或不完整':'完整')+'</td></tr>';}).join('')+'</tbody></table></div><p>对照均使用同版费用和真实整手约束；持有/等权对照持有20交易日，不使用模型目标或8%止损，须结合各自暴露比较，不能把多留现金称为预测优势。</p>'+
        '<details><summary>逐笔订单和被拒原因（最近80笔；完整账本保存在本机）</summary><div class="research-table-wrap"><table id="continuous-orders" class="research-table"><thead><tr><th>决策 / 来源 / 接收</th><th>账户 / 标的</th><th>订单</th><th>假设成交或拒绝原因</th></tr></thead><tbody>'+s.orders.slice(-80).map(function(r){return '<tr><td>'+esc(localTime(r.decisionAt))+'<small>'+esc(r.sourceTime)+' / '+esc(r.receivedAt)+'</small></td><td>'+esc(r.account)+' / '+esc(r.symbol)+'</td><td>'+esc(r.side)+' '+r.shares+'</td><td>'+esc(r.status)+'<small>'+esc(r.rejectionReason||r.reason)+' · '+(r.fees?'费用 '+r.fees.total.toFixed(2):'未收成交费用')+'</small></td></tr>';}).join('')+'</tbody></table></div></details><details><summary>模型、数据、规则与费用指纹</summary><p>'+esc(JSON.stringify(s.fingerprint))+'</p><p>账本链和快照校验只能辅助本机审计，不是第三方防篡改认证。</p></details></div>';
    }
    if(legacySession)html+='<details><summary>原版本机账户封存记录（不改写、不并入新收益）</summary><p>原本金 '+esc(legacySession.budget)+'；末次估值 '+esc(legacySession.observedAt)+'；原键 paper.current 保留。</p></details>';
    var old=legacyPaperMarkup(state),begin=old.indexOf('<details><summary>2023年');if(begin>=0)html+='<details><summary>保留的旧独立研究与亏损记录</summary>'+old.slice(begin)+'</details>';
    return html;
  }
  function paperMarkup(state){return continuousMarkup(state);}
  function accountContext(state,model){
    var at=new Date().toISOString();
    if(!accountResearch||accountResearch.model!==model||accountResearch.histories!==state.histories){
      var key=AuditIdentity.hash({model:model,histories:state.histories});
      if(!accountResearch||accountResearch.key!==key){var predictions={};Market.UNIVERSE.forEach(function(u){predictions[u.symbol]=Analysis.predict(model,state.histories[u.symbol]||[],{publishedAt:at,firstReceivedAt:at});});accountResearch={key:key,predictions:predictions};}
      accountResearch.model=model;accountResearch.histories=state.histories;
    }
    return {predictions:accountResearch.predictions,model:model,dataHealth:Market.validateHistoryPool(state.histories,{at:at}),now:at};
  }
  async function startPaper(state, symbols, automatic) {
    if (startingPaper) return;
    if(paperRestoreBlocked){paperError='本机账户校验失败，已保留原记录；禁止重建本金覆盖。';return;}
    if(symbols&&symbols.length){paperError='本阶段仅由冻结策略执行科技ETF；个股参数和权限筛选继续供研究。';window.TechScopeUI.switchTab('model');return;}
    if (state.busy || state.training || state.evaluating) { paperError = '请等待当前同步、训练或回测结束，再建立模拟持仓。'; window.TechScopeUI.switchTab('model'); return; }
    startingPaper = true; paperError = ''; window.TechScopeUI.switchTab('model');
    try {
      var synced = await window.TechScopeUI.refresh(false);
      if (synced !== true) throw new Error('完整日线同步未成功；未建立新的模拟持仓');
      var dataHealth=Market.validateHistoryPool(state.histories,{at:new Date().toISOString()});
      if(!dataHealth.ok)throw new Error('日线未达到交易所最近完整交易日 '+dataHealth.expectedAsOf+'；仅保留采集，不放行入场');
      var freshQuotes = await Market.quotes();
      if (Market.UNIVERSE.some(function (u) { var q = freshQuotes[u.symbol]; return !q || q.cached || Market.isStale(q); })) throw new Error('研究池报价不完整或过旧；不把数据失败记录成策略空仓');
      var ctx=accountContext(state,paperSession?paperSession.model:state.model),next;
      if(paperSession){next=Paper.stepAuto(paperSession,freshQuotes,ctx.now,ctx);if(automatic&&next.automation.windowEnded)next=Paper.observe(next,{now:ctx.now});}
      else next=Paper.startContinuous({universe:Market.UNIVERSE,quotes:freshQuotes,predictions:ctx.predictions,model:state.model,dataHealth:dataHealth,historyHash:typeof AuditIdentity!=='undefined'?AuditIdentity.hash(state.histories):null,budget:smallSettings.budget,positionLimit:smallSettings.allocationMode==='full'?smallSettings.budget:500,minFee:smallSettings.minFee,feeProfile:{commissionRate:smallSettings.commissionRate,slippage:smallSettings.slippage},riskLimits:{investableLimit:smallSettings.investableLimit,maxExposure:smallSettings.maxExposure,maxThemeWeight:smallSettings.maxThemeWeight,maxPositions:3},profile:'beginner',allocationMode:smallSettings.allocationMode,executionMode:Market.read('app.verification')?'desktop_ui_verification':'continuous_paper',now:ctx.now});
      if (!Market.write('paper.continuous.current', next)) throw new Error('持续账本保存失败；未替换原已存账户');
      paperSession = next; state.quotes = freshQuotes; lastPaperQuotes = freshQuotes;
      state.autoSync = true; Market.write('ui.autoSync', true); Market.setBackground(true);
    } catch (e) { var msg = String(e.message); paperError = '模拟未建立：' + (msg.includes('continuous') ? '需要至少还剩30分钟的连续交易时段；当前不能开始。' : msg.includes('trading') ? '需要在交易时段操作。' : msg.includes('fresh') ? '没有足够新的源报价，请检查网络后重试。' : msg.includes('No positive') ? '当前没有可用的正预测或选定标的。' : msg.includes('insufficient') ? '虚拟现金不足以买入最小股数。' : msg); }
    finally { startingPaper = false; window.TechScopeUI.switchTab('model'); }
  }
  function paperCard(state) {
    var node = insert(document.getElementById('page-model'), 'research-paper', paperMarkup(state));
    node.querySelector('#start-paper').onclick = function () { startPaper(state); };
    node.querySelector('#start-auto-paper').onclick = function () { startPaper(state, undefined, true); };
    node.querySelector('#paper-preset').onchange=function(){if(paperSession)return;smallSettings.allocationMode=this.value;smallSettings.positionLimit=this.value==='full'?smallSettings.budget:500;smallSettings.investableLimit=this.value==='full'?smallSettings.budget:Math.min(1500,smallSettings.budget);Market.write('paper.continuous.settings',smallSettings);paperCard(state);};
    [['#paper-investable','investableLimit',1],['#paper-exposure','maxExposure',100],['#paper-theme','maxThemeWeight',100],['#paper-commission','commissionRate',100],['#paper-slippage','slippage',100]].forEach(function(pair){node.querySelector(pair[0]).onchange=function(){if(paperSession)return;var prior=smallSettings[pair[1]];smallSettings[pair[1]]=Number(this.value)/pair[2];if(!Number.isFinite(smallSettings[pair[1]])||smallSettings[pair[1]]<0||pair[1]==='investableLimit'&&smallSettings[pair[1]]>smallSettings.budget||/Weight|Exposure/.test(pair[1])&&(smallSettings[pair[1]]<=0||smallSettings[pair[1]]>1)){smallSettings[pair[1]]=prior;paperError='约束超出范围，保留原设置。';}Market.write('paper.continuous.settings',smallSettings);paperCard(state);};});
    [['#small-budget', 'budget'], ['#small-min-fee', 'minFee']].forEach(function (pair) { node.querySelector(pair[0]).onchange = function () { if(paperSession)return;smallSettings[pair[1]] = Number(this.value);smallSettings.positionLimit=smallSettings.allocationMode==='full'?smallSettings.budget:Math.min(500,smallSettings.budget);smallSettings.investableLimit=Math.min(smallSettings.investableLimit,smallSettings.budget);try { Paper.plan(Object.assign({ universe: [], quotes: {}, predictions: {} }, smallSettings)); if (!Market.write('paper.continuous.settings', smallSettings)) paperError = '设置未能保存，请检查磁盘空间'; } catch (e) { paperError = '设置超出范围，尚未保存；请修正后再开始。'; } paperCard(state); }; });
  }
  function costOptimizationCard() {
    var c=window.RESEARCH_RESULTS&&RESEARCH_RESULTS.costOptimization;if(!c)return '';
    var names={'original11-ridge':'11因子线性对照','robust25-huber':'新25因子稳健模型','trend-baseline':'简单趋势对照'};
    return '<div class="research-eyebrow">1.5 · 已实际训练与修复 · 新候选未部署</div><h2>把费用和完整持有周期纳入优化</h2><p>已训练Huber稳健回归与梯度提升树两种候选，增加至25个过去价格/量能/板块因子，目标为20个交易日扣费后收益；2023先选择规则，再固定检查后续年份。80%胜率但仅5笔的设置因样本不足未入选。</p><p>软件模拟账本已补ETF拆分份额、分红应收与发放日现金；保留原始买入单价，避免把拆分当价格暴跌。事件表核查至2026-09-30，未来新增事件仍需公告核对，覆盖不是完整证券公司账本。</p><div class="research-table-wrap"><table id="cost-optimization-table" class="research-table"><thead><tr><th>年份 / 方法</th><th>1万元净盈亏</th><th>最大回撤</th><th>平均持仓比例</th><th>完整交易 / 盈利占比</th></tr></thead><tbody>'+c.rows.map(function(r){return '<tr><td>'+r.year+' · '+esc(names[r.model]||r.model)+'</td><td>¥'+r.netPnl.toFixed(2)+'</td><td>'+pc(r.maxDrawdown)+'</td><td>'+pc(r.averageExposure)+'</td><td>'+r.closedPositions+' / '+pc(r.winRate)+'</td></tr>';}).join('')+'</tbody></table></div><p class="research-warning">新模型仍未稳定优于简单趋势，不替换当前预测模型，也不发出实盘买入建议。简单趋势这些年份虽为正，收益低且胜率未达到70%，仍只作对照。</p><p class="footnote">每年独立1万元、每只500元、最多3只、单边最低佣金5元、双边滑点0.1%；按真实未复权开盘价、整手及已核实分红拆分，20个观察交易日后卖出，年度最后20日不再开新仓。2026仅截至9月30日，各年本金独立，不合并为一个账户。11因子对照在同样6只ETF重新训练，区别于原19只池的部署权重。所有年份已经用于历史研究，不能冒充新盲测。新闻尚未进入这些模型。</p>';
  }
  function fullCapitalCard() {
    var f=window.RESEARCH_RESULTS&&RESEARCH_RESULTS.fullCapitalOptimization;if(!f)return '';
    return '<div class="research-eyebrow">保留的6只ETF历史探索 · 未部署 · 已查看年份</div><h2>历史全额本金研究（不代表当前软件收益）</h2><p>有合格候选时，全部可投资现金按实际1至3只分配，仅留整手和费用余款；没有合格候选则明确等待。目标为20个交易日扣费后约70%盈利机会、总账户年收益10%至20%，当前没有证明达到。</p><div class="research-table-wrap"><table id="full-capital-table" class="research-table"><thead><tr><th>年份 / 历史方法</th><th>1万元净盈亏</th><th>账户收益</th><th>最大回撤</th><th>平均仓位</th><th>完整交易 / 盈利占比</th></tr></thead><tbody>'+f.rows.map(function(r){return '<tr><td>'+r.year+' · '+(r.model==='trend-baseline'?'趋势候选':'11因子对照')+'</td><td>¥'+r.netPnl.toFixed(2)+'</td><td>'+pc(r.netReturn)+'</td><td>'+pc(r.maxDrawdown)+'</td><td>'+pc(r.averageExposure)+'</td><td>'+r.closedPositions+' / '+pc(r.winRate)+'</td></tr>';}).join('')+'</tbody></table></div><p class="research-warning">趋势候选历史收益较好，但单笔盈利占比未稳定达到70%，曾有约20%回撤；概率分类器也未通过后续年份校准，所以不给当前标的标注可靠的70%机会，也未替换部署预测模型。</p><details><summary>实际训练的盈利概率模型检验</summary><div class="research-table-wrap"><table id="profit-probability-table" class="research-table"><thead><tr><th>年份 / 模型</th><th>声称≥70%的已到期标签</th><th>实际盈利占比</th><th>单标的不重叠案例 / 盈利占比</th><th>概率误差 / 常数对照（越低越好）</th></tr></thead><tbody>'+f.probability.map(function(p){return '<tr><td>'+p.year+' · '+p.model+'</td><td>'+p.thresholdLabels+'</td><td>'+pc(p.actualWinFraction)+'</td><td>'+p.nonoverlapCases+' / '+pc(p.nonoverlapWinFraction)+'</td><td>'+p.brier.toFixed(3)+' / '+p.priorBrier.toFixed(3)+'</td></tr>';}).join('')+'</tbody></table></div><p>只用更早年份训练、前一年校准，再冻结检验；相邻日期标签会重叠，不是独立胜率样本，ETF之间也相关。0.7输出未被证明等于70%真实赚钱概率。</p></details><p class="footnote">这是6只科技ETF、完整20日持仓的历史研究；有信号时接近全额投入，等待期及年末停止新开仓使平均仓位低于100%。按真实开盘价、整手、双边费用与核实的分红拆分。各年独立1万元；2026仅截至9月30日，不是全年或年化成绩。历史年份已被研究，不能作为新盲测。11因子为同6只ETF重训对照，不是原19只池的部署权重；上方历史趋势也不是当前部署预测模型。现有30分钟模拟只验证执行与估值，不评分20日准确率。</p>';
  }
  function journalCard() {
    var s = journal.summary(), list = journal.records().slice(-12).reverse();
    return '<div class="research-eyebrow">本机前瞻观察 · 记录后等结果</div><h2>让预测留下原始记录</h2>' +
      '<div class="research-counts"><span><b>' + s.total + '</b>已保存</span><span><b>' + s.pending + '</b>等待后续日线</span><span><b>' + s.scored + '</b>已到期评分</span><span><b>' + s.excluded + '</b>迟发排除</span></div>' +
      (s.error ? '<p class="research-warning">本次记录保存失败；不会计作已保存。请检查磁盘空间后重新打开。</p>' : '') +
      (s.scored ? '<p>已评分记录：模型误差 ' + pp(s.mae) + '，零收益误差 ' + pp(s.zeroMae) + '，训练均值误差 ' + pp(s.trainingMeanMae) + '；方向 ' + pc(s.directionAccuracy) + '，始终上涨 ' + pc(s.alwaysUpAccuracy) + '。共' + s.signalDayCount + '个信号日，仍不足以证明实盘有效。</p>' : '<p>还没有发布在先且结果已到期的记录。不会把过去的回测填充为真实前瞻成绩。</p>') +
      '<div class="research-table-wrap"><table class="research-table"><thead><tr><th>标的 / 信号日</th><th>真实发布时间</th><th>20日估计</th><th>状态 / 实际收益</th></tr></thead><tbody>' + list.map(function (r) {
        var u = Market.UNIVERSE.find(function (x) { return x.symbol === r.symbol; });
        return '<tr><td>' + esc(u && u.name || r.symbol) + '<small>' + esc(r.asOf) + '</small></td><td>' + esc(localTime(r.publishedAt)) + '</td><td class="number">' + pc(r.expectedReturn) + '</td><td>' + (r.status === 'scored' ? pc(r.outcome.actualReturn) : r.status === 'excluded' ? '开盘后迟发，排除' : '等待真实后续日线') + '</td></tr>';
      }).join('') + '</tbody></table></div><p class="footnote">保存首次预测的模型与输入快照，同一标的/信号日/周期不覆盖。以共享已观察交易日历，次日开盘至20个交易日后开盘的后复权收益评分；停牌缺数不挪到下一天。迟于入场开盘发布的记录不计成绩。仅为本地价格预测记录，不是券商成交记录或防篡改认证；软件打开且同步后才会记录和评分，最多索引最近24个月。</p>';
  }
  function methodReviewCard() {
    var review = window.RESEARCH_RESULTS && RESEARCH_RESULTS.methodReview, ranking = window.RESEARCH_RESULTS && RESEARCH_RESULTS.rankingResearch;
    if (!review) return '';
    var html = '<div class="research-eyebrow">公开方法调研 · 核查于 ' + esc(review.checkedOn) + '</div><h2>按证据改进，月预算上限 ¥' + review.monthlyBudgetYuan + '</h2><p>借鉴Qlib的统一对照、TradingAgents的信息分工和FinGPT的文本处理。当前付费接口未启用，新闻尚未进入预测；本次新增研究候选未显示稳定优势，因此不替换主模型。</p>';
    html += '<details><summary>查看公开方法、当前缺口与下一步</summary>' + review.methods.map(function (m, i) { return '<h3>' + esc(m.name) + '</h3><p>' + esc(m.finding) + '</p><p>' + esc(m.action) + '</p><button class="research-source" data-method-source="' + i + '">查看项目原始说明 ↗</button>'; }).join('') + '</details>';
    if (ranking) html += '<details><summary>本次实际训练：' + ranking.featureCount + '特征相对收益候选，未部署</summary><p>每年只用上一年末已成熟标签训练。19只手选存续标的，数据截至 ' + esc(ranking.sourceAsOf) + '；已经查看过这些历史年份，属于回顾性探索。相对收益以同窗口科创50ETF为基准。</p><div class="research-table-wrap"><table class="research-table" id="ranking-research-table"><thead><tr><th>年份</th><th>研究候选</th><th>相对收益误差↓</th><th>零相对收益基准↓</th><th>排序相关性</th></tr></thead><tbody>' + ranking.rows.map(function (r) { return '<tr><td>' + r.year + '</td><td>' + (r.model === 'tree_relative' ? '树模型' : '线性模型') + '</td><td>' + pp(r.mae) + '</td><td>' + pp(r.zeroMae) + '</td><td>' + (Number.isFinite(r.rankIC) ? r.rankIC.toFixed(4) : '—') + '</td></tr>'; }).join('') + '</tbody></table></div><p class="footnote">相对收益为零是假设表现与基准相同。这里只评价有后续标签的误差和排序，没有1万元成交或收益证明；标签重叠，相关性不是赚钱概率。早期前三名价格窗口存在未来标签可用性筛选问题，已撤下并留档，不作为交易证据。</p></details>';
    html += '<details><summary>100元/月预算：先试小样本，不必花满</summary><p>建议先保留0至20元/月用于新闻事实抽取验证。按每天50条、每条输入2000/输出500 Token、每月30天及千问官方短上下文非思考价格估算，约3.90元/月；重试、长上下文、搜索等另计。适配与费用保护尚未实现，没有调用付费接口。</p><p>Tushare基础积分档官网标价200元/年，折合约16.7元/月，但实际需一次付200元，超过当前单月100元上限。分钟、新闻与公告可能有独立权限，不能假设基础档全包含；目前未购买。</p><p>1万元本金若每月支出100元，全年1200元相当于初始本金12%，应先验证新增数据的价值。下一步优先补历史成分、披露版本、带出处的新闻事实、实际佣金和ETF价差/溢价数据。</p><button class="research-source" data-budget-source="tushare">Tushare官方权限与价格 ↗</button><button class="research-source" data-budget-source="qwen">千问官方模型价格 ↗</button><button class="research-source" data-budget-source="deepseek">DeepSeek官方模型价格 ↗</button></details>';
    return html;
  }
  function showAnnouncements(state) {
    var u = Market.UNIVERSE.find(function (x) { return x.symbol === state.selected; });
    if (!u) return;
    var a = announcementState[u.symbol], code = u.symbol.slice(2), body = '';
    if (u.type === 'stock') {
      if (!a || a.loading && !a.result) body = '<p>正在检索公司公开公告…</p>';
      else if (!a.result) body = '<p>公告暂未获取：' + esc(a.error || '来源无响应') + '。不能据此判断公司没有风险。</p>';
      else {
        var result = a.result;
        body = '<p class="footnote">' + (result.cached ? '连接失败，使用缓存 · ' : '来源：东方财富公告检索 · ') + '最近获取 ' + esc(localTime(result.fetchedAt)) + (result.storageError ? ' · 本次缓存未保存' : '') + '</p>' +
          (result.items.length ? result.items.map(function (item, i) { return '<article class="research-ann"><span class="tag">' + esc(item.category) + '</span> <time>' + esc(String(item.publishedAt || '未提供').slice(0, 19)) + '</time><button class="research-source" data-ann="' + i + '">' + esc(item.title) + ' ↗</button><small>本机首次看到 ' + esc(localTime(item.firstSeenAt)) + '</small></article>'; }).join('') : '<p>来源当前未返回公告。未返回不等于没有公告。</p>');
      }
    } else body = '<p>ETF暂未接入基金公告；请在基金公司或交易 App 中核查持仓、费率、溢价和公告。</p>';
    var node = insert(document.getElementById('page-detail'), 'research-detail', '<div class="research-eyebrow">来源与交易准备</div><h2>核对代码，再查看公告</h2><div class="research-actions"><label>证券 App 搜索代码 <input id="research-code" readonly value="' + esc(code) + '" aria-label="证券代码"></label><button id="research-copy" class="secondary-button">复制代码</button><button id="research-quote" class="secondary-button">官网行情 ↗</button><button id="research-broker" class="text-button">东方财富官方下载 ↗</button></div><p class="footnote">未绑定证券账户；需在券商 App 自行加入自选并确认交易。交易 App 的选择不影响本模型预测。当前没有实盘买入推荐。</p><details><summary>展开公司公开公告与来源</summary>' + body + '<p class="footnote">仅检索最新标题并链接原文；公告不是已经核实的利好/利空评分，也未用于当前模型。业绩预告、减持、风险提示等需打开原文核查。</p></details>');
    var buy = document.createElement('button'); buy.className = 'secondary-button'; buy.id = 'paper-buy-selected'; buy.textContent = '模拟买入此标的'; buy.onclick = function () { startPaper(state, [u.symbol]); }; node.querySelector('.research-actions').append(buy);
    node.querySelector('#research-copy').onclick = async function () { var field = node.querySelector('#research-code'); field.focus(); field.select(); try { await navigator.clipboard.writeText(code); this.textContent = '已复制'; } catch (_) { this.textContent = '已选中，请按 Ctrl+C'; } };
    node.querySelector('#research-quote').onclick = function () { Market.openUrl('https://quote.eastmoney.com/' + u.symbol + '.html'); };
    node.querySelector('#research-broker').onclick = function () { Market.openUrl('https://18.cn/download'); };
    node.querySelectorAll('[data-ann]').forEach(function (button) { button.onclick = function () { var item = a && a.result && a.result.items[Number(button.dataset.ann)]; if (item) Market.openUrl(item.url); }; });
    if (u.type !== 'stock' || a && (a.loading || Date.now() - a.attemptAt < 30 * 60000)) return;
    a = announcementState[u.symbol] = { loading: true, attemptAt: Date.now(), result: a && a.result };
    Market.announcements(u.symbol).then(function (result) { a.result = result; }).catch(function (e) { a.error = e.message; }).finally(function () {
      a.loading = false;
      if (currentState && currentState.tab === 'detail' && currentState.selected === u.symbol) showAnnouncements(currentState);
    });
  }
  function render(state) {
    currentState = state;
    if (!state.initialized) return;
    if (!journal) journal = ForecastJournal.create({ read: Market.read, write: Market.write }, Analysis);
    if (!paperLoaded) { legacySession=Market.read('paper.current');var stored=Market.readState('paper.continuous.current');if(stored.status!=='missing')try{if(stored.status!=='valid')throw Error(stored.status);paperSession=Paper.resume(stored.value);}catch(e){paperRestoreBlocked=true;paperError='持续账户无法读取或校验失败，原始数据保留，禁止重建本金覆盖。请先备份并检查本机账本。';}var savedSettings=Market.read('paper.continuous.settings');if(savedSettings&&Number.isFinite(savedSettings.budget)&&Number.isFinite(savedSettings.minFee))smallSettings=Object.assign({},smallSettings,savedSettings,{investableLimit:Math.min(savedSettings.investableLimit===undefined?smallSettings.investableLimit:savedSettings.investableLimit,savedSettings.budget)});paperLoaded=true; }
    if (paperSession && lastPaperQuotes !== state.quotes) {
      try{var ctx=accountContext(state,paperSession.model),marked=Paper.stepAuto(paperSession,state.quotes,ctx.now,ctx);if(Market.write('paper.continuous.current',marked)){paperSession=marked;lastPaperQuotes=state.quotes;}else paperError='持续账本未能保存，保留上次已存记录，不重建本金。';}catch(e){paperError='账户更新暂停：'+String(e.message);}
    }
    if (lastPredictions !== state.predictions || lastHistories !== state.histories) {
      var result = journal.refresh({ histories: state.histories, predictions: state.predictions, model: state.model });
      if (result.saved) { lastPredictions = state.predictions; lastHistories = state.histories; }
    }
    if (state.tab === 'observe') { var card = insert(document.getElementById('page-observe'), 'research-readiness', readiness(state)); card.querySelector('#open-paper').onclick = function () { window.TechScopeUI.switchTab('model'); }; }
    else if (state.tab === 'detail') showAnnouncements(state);
    else if(state.tab==='news'&&typeof NewsFacts!=='undefined'){
      var seen=Market.read('news_archive')||[],facts=(state.news||[]).slice(0,6).map(function(item){var prior=seen.find(function(n){return n.url===item.url;});return NewsFacts.analyze(Object.assign({},item,{firstSeenAt:prior?prior.firstSeenAt:item.firstSeenAt}));});
      insert(document.getElementById('page-news'),'research-facts','<div class="research-eyebrow">原文事实与风险 · 未输入价格预测</div><h2>有来源的资讯核对</h2><p>当前覆盖标题字面信息，新闻全文、财报正文、宏观解释与大模型提取均未接入；不据此补写历史推荐原因。</p>'+facts.map(function(f){return '<article><strong>'+esc(f.title)+'</strong><p>披露 '+esc(f.publishedAt||'未提供')+'；首次接收 '+esc(f.firstSeenAt||'未记录')+'；原文覆盖 '+esc(f.coverage)+'</p><p>'+esc(f.originalText)+'</p><p>字面风险：'+esc(JSON.stringify(f.risks))+'</p></article>';}).join(''));
    }
    else if (state.tab === 'backtest') insert(document.getElementById('page-backtest'), 'research-baselines', '<div class="research-eyebrow">预测能力对照</div><h2>比“始终上涨”更好吗？</h2>' + compare(state.reports[state.year]) + '<p class="footnote">回顾性结果仍未证明可实盘使用。即便历史收益很高，也受固定研究池幸存者偏差、市场行情和成交模拟假设影响。</p>');
    else if (state.tab === 'model') {
      insert(document.getElementById('page-model'), 'research-journal', journalCard());
      var methods = methodReviewCard();
      if (methods) { var mr = insert(document.getElementById('page-model'), 'research-methods', methods), review = RESEARCH_RESULTS.methodReview;
        mr.querySelectorAll('[data-method-source]').forEach(function (button) { button.onclick = function () { var item = review.methods[Number(button.dataset.methodSource)]; if (item) Market.openUrl(item.source); }; });
        mr.querySelectorAll('[data-budget-source]').forEach(function (button) { button.onclick = function () { var item = review.costs[button.dataset.budgetSource]; if (item) Market.openUrl(item.source); }; });
      }
      var optimized=costOptimizationCard();if(optimized)insert(document.getElementById('page-model'),'research-cost-optimization','<details><summary>旧500元单笔方案：账务修复与候选训练记录</summary>'+optimized+'</details>');
      var full=fullCapitalCard();if(full)insert(document.getElementById('page-model'),'research-full-capital','<details><summary>历史6只ETF研究（非当前部署策略，非前瞻收益）</summary>'+full+'</details>');
      paperCard(state);
    }
  }
  window.ResearchUI = { render: render, summary: function () { return journal ? journal.summary() : null; } };
}());
