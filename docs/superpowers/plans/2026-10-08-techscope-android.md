# 科技观察 Android Implementation Plan

> **For agentic workers:** Use subagent-driven-development to implement independently owned tasks, followed by focused review.

**Goal:** 交付可安装 APK，提供科技股票参数、行情/新闻、可解释预测、2025和2026检验及持续训练。
**Architecture:** Java WebView shell限制HTTPS请求域名并缓存；本地JavaScript完成市场解析、参数计算、回归训练和图表。
**Tech Stack:** Java、Android API23+、HTML/CSS/JS、Node行为测试；APK签名和本地构建。
**Spec:** ../specs/2026-10-08-techscope-android-design.md

## Global Constraints
- 写入仅限 D:/techno；API23+，target35；无账户和交易。
- 仅真实数据，报价时间可见；缺失指标显示缺失；科技A股/ETF当前研究池有幸存者偏差。
- 完整日线产生信号；标签结束日必须早于训练截止；2025冻结、2026滚动检验。
- 新闻情绪不用于缺少历史快照的回测；更新模型需要真实验证改善。

### Task 1: 分析引擎
**Files:** assets/analysis.js、tests/analysis.test.js
**Interfaces:** `Analysis.indicators(bars)`；`Analysis.train(histories, {cutoff,horizon,alpha})`；`Analysis.predict(model,bars)`；`Analysis.evaluate(histories,year,options)`；`Analysis.updateChampion(histories,oldModel,options)`。bar `{date,open,close,high,low,volume}`，histories `{symbol: bars}`。
- [x] 先编写并运行行为测试：`assert.equal(Analysis.indicators(constantBars).rsi,50)`、标签purge、未来扰动、已实现标签、贡献总和等于预测、2026部分年。
- [x] 实现指标、训练标准化/岭回归、预测贡献、冻结/滚动检验与版本门槛。
- [x] 运行 `node --test tests/analysis.test.js`，审查无前视和不足数据行为。

### Task 2: 市场数据与原生容器
**Files:** assets/market.js、src/cn/techscope/app/MainActivity.java、MarketJob.java、AndroidManifest.xml、tests/market.test.js
**Interfaces:** Market.UNIVERSE、`Market.quotes()`、`Market.history(symbol)`、`Market.news()`；原生桥 `Native.request(id,url)` 异步回调 `window.nativeResult(id,payload,error)`、`Native.read(key)`/`write(key,value)`/`openUrl(url)`。
- [x] 先编写并运行报价缺失PE/PB、成交量单位、非法日线/去重和陈旧时间测试。
- [x] 实现双源日线、分年缓存、报价和新闻解析；Java限制域名和HTTP、大小/超时，并在私有目录持久化。
- [x] 校验真实2025/2026数据覆盖，初始数据与模型加入assets；后台只采集数据，打开后训练。

### Task 3: 移动界面
**Files:** assets/index.html、style.css、ui.js
**Interfaces:** 消费Analysis和Market；入口assets/index.html；初始种子seed.json `{histories,model,reports,generatedAt}`。
- [x] 实现概览、股票明细参数和K线、新闻、2025/2026回测、模型页及手动/自动同步。
- [x] 手机宽度截图检查并验证切页、筛选、选择、训练和离线行为。

### Task 4: 打包及交付
**Files:** scripts/build-apk.*、tools/、dist/科技观察.apk、README.md、validation.json
- [x] 在工作目录下载并核实必要开放源码工具，不自动接受新SDK合同。
- [x] 编译Java、打包本地资源、签名并验证APK。
- [x] 集成运行数据解析、模型和界面检查，审查所有任务，记录实际验证范围与未验证真机部分。

## Completion evidence
2026-10-08：26/26 JS行为测试、Native安全和真实HTTPS/GB18030/243条2025ETF日线、手机393px离线/联网界面行为与固定2025回测重跑一致性通过。独立最终审查发现的四项P2已修复并限定复核通过。APK结构/签名/源文件一致性由dist/TechScope-verification.json记录。未进行安卓真机或模拟器安装测试。
