# 当前用户风险偏好（2026-10-20更新）

- 用户确认1万元最多接受500元（5%）回撤，随后补充最好一点不亏：保本金优先，5%为上限而非保证；原候选15.33%回撤不符合要求，当前不能称适合用户实投。
- 本轮研究ID `capital-preservation-20261020-c` 已冻结并单次运行，已有claim禁止重跑；先读comparison/failure/run.log。20日区间统计在`account-block-evidence.js`，已修过期边界起点，218项回归通过。
- 先按`docs/capital-preservation-research-2026-10-20.md`验证固定25%/12.5%投资上限及各自等仓位三ETF对照，保留同模型/1%净余量/退出规则，不直接启动原全额候选前瞻。

# 本聊天接续（2026-10-20）

- 开发工作区：`C:/Users/lqp07/.codex/worktrees/stock-entry-exit/techno`，分支 `codex/entry-exit-research`。旧聊天已归档。
- 冻结前瞻运行目录仍是 `C:/Users/lqp07/.codex/worktrees/audit-account-repair/techno`，归档后缺失源码/声明已恢复；此目录不是Git工作区，只用于原1100账户采集和只读报告。原PID38248在恢复时仍运行。不得重复开户。
- 归档恢复记录：原账户目录 `archive-recovery-2026-10-20T06-24-11-206Z.json`。完整tick链、账务、EXE、11模块及原生helper指纹验证通过；现存账本/状态/日志未被覆盖。丢失claim/lease从已验证manifest与完整链重建并显式标记，原始claim时间和租约token未知。后续按原PID核查及显式死进程租约恢复，不假称元数据原件仍在。
- 独立迁移恢复备份：`D:/techno/validation/thread-transfer-recovery/verification-root-2026-10-20T06-37-20-837Z/validation/continuous/continuous-etf-audit-20261020-1100`，完整核验至449条，包含明确标记的恢复claim/lease。静态证据，严禁与原PID并行运行。
- 新历史ID `entry-exit-research-20261020-b` 已全部完成，候选1累计+3.13%/观测回撤25.31%，候选2累计+68.47%/观测回撤15.33%（收益主要集中2025，2026至9月+2.09%）；详见`docs/入场退出研究结果-2026-10-20.md`，禁止重复--run。原四路径结果以已发布evidence ZIP为准，不在新工作区重开旧ID。
- 新规则见 `docs/next-entry-exit-research.md`；历史样本仍是已查看探索。

# 1.6.0.1 专项审计修复（2026-10-20，当前权威入口）

- 2026-10-20后续研究：`scripts/executable-research.js`将两个固定岭回归候选与指定ETF/三ETF等权选择器，通过同一个Paper持续账户回放2025—2026/09。先声明/后单次claim；每日真实开盘假设+16:00收盘估值，逐笔/最终哈希与Paper.replay一致。协议`docs/executable-research-2026-10-20.md`。仅历史探索，六ETF重拟合不等于EXE19池，合成可用时刻不是实际首次接收；不自动部署。
- 只读报告新增原生helper及C#源的冻结指纹核验、原生前瞻类型识别、冻结目标/风险退出的双边扣费场景与薄净空间提示。`entryEconomics`不是盈利概率。午休源时钟递增仍不得当合法报价，原失败计数保留。`docs/next-entry-exit-research.md`为已完成两个入场/退出候选登记；实现及结果见最新接续段，不修改1100账户。

- 独立分支 `fix/auditable-paper-account`；原1.5.1源码基线 `61443d4dbeb51efd18e0ef769c412b5f280dd2de`，原EXE/模拟目录仍在 `D:/techno`，不覆盖。以下旧版小节是历史，不是当前规则。
- Windows仍为 `Program → DesktopForm → assets/index.html` 五页。`paper-engine.js`是公开决策入口，`paper-account.js`为schema2持续账务；新键 `paper.continuous.current`，原 `paper.current`只读保留。`Market.readState`和原生严格Read区分缺失/损坏/读取失败，禁止损坏重建本金。
- `trading-calendar.js`统一2023—2026交易所日历、16:00日线完成界限、T+1和20日到期。`market.js`保存fetchedAt/sourceTime/dataAsOf/expectedAsOf/stale及备用源错误，全池共同落后不得入场。
- `fee-profile.js`统一可执行筛选/订单/持续回放/对照费用；`audit-identity.js`对策略、模型、池、规则、数据、费用、资金约束和模式计算SHA256。股票保留研究；持续模拟仅执行6只科技ETF，使用原19只池11因子部署模型，不换成研究候选。
- `startAuto/stepAuto`现为持续账户；30分钟只结束工程观察。全池失败阻止新仓，持仓仍独立估值；退出前冻结目标/8%风险/20交易日到期规则，T+1或拒单保留仓位与退出意图。本金不重置。`legacyStartAuto/legacyStepAuto`仅供明确标注的旧独立半小时研究兼容。
- `Analysis.evaluate`仍为独立区间研究，显式非可执行账户，不用全天H/L/V判断开盘成交；未成交退出不转现金。可执行历史/实时规则一致性由 `Paper.replay` 和 `scripts/continuous-replay-check.js` 逐笔证明，当前8场景是人工夹具，不是市场收益证据。
- `scripts/continuous-paper-monitor.js`冻结11模块/seed/EXE/门槛/驱动到新ID，未来时段才入场；append-only ticks+快照+永久claim+进程租约，可 `--resume` 跨日，不加本金。后台前瞻与UI是同引擎的独立账户，不能合并收益。
- 1040未开户采集失败保留；1100使用冻结1.6.0.0快照、同DesktopHttp原生helper，事前声明11:00—11:05入场。最终1.6.0.1只修UI同输入重复生成预测的缓存，金融核心11模块字节一致，原前瞻绑定不改。`continuous-account-report.js`只读哈希链完整前缀，输出净收益/费用/观测回撤/换手/暴露及风险限制差别。正式前瞻是否入场看实际ticks。
- `ui.js`同步不自动训练，手动训练只保存研究候选，不自动部署。`news-facts.js`仅字面事实/风险，保存原文、披露与首次接收时间；全文/财报核验/大模型/新闻入预测未覆盖。
- 回归：`node --test tests/*.test.js`；原生安全缓存 `tests/DesktopPolicyTests.cs`；`scripts/test-desktop.ps1 -Live`真实新EXE两进程恢复及原生全19池联网。`scripts/build-windows.ps1`单文件构建。交付矩阵见 `docs/audit-repair-2026-10-20.json`。
- 证据：`validation/audit-repair/baseline` 精确旧EXE提取、8个重建行为复现、内置2025/26重算；`offline-replay-ledger.json`人工跨日账本；`desktop-final`真实新EXE。审查原始两份JS脚本未随附件提供，重建脚本不冒充原脚本。

## 旧版项目地图（仅供历史追溯）

# 科技观察项目地图

- 1.5.1日线新鲜度修复：`Market.fetchYear`按应已完成的日期核查主源，过旧即试同复权备用来源，选更新日期，备用失败保留原日期；sourcePolicy使旧缓存重新核查。`check-history-freshness.js`独立Node健康检查19只均到2026-10-19，但最终Windows原生联网仍不完整（日期混有10-16与10-19，allHistoriesCurrent=false），不得将独立检查当EXE数据完整性通过。严格失败证据`validation/desktop/full-capital-freshness-failure.json`；最终功能检查及限制`dist/Windows-full-capital-verification.json`。原日常失败及claim保留，不重跑或重写预测日记。v2/v3未启动快照均已被v4替代。

- 最新Windows1.5全额资金研究版：`dist/科技观察-全额资金研究版.exe`；全部1万元用于组合投资，`Paper.plan(allocationMode:'full')`按实际1至3只分配；`stepAuto`后续入场仅分配剩余现金及空位，整手和费用留余款，无合格信号不强买。旧500元规则和持仓不改。
- 公司行动权威实现：`assets/corporate-actions.js`拆分/应收分红/发放日现金/保留原买价；`corporate-events.js`已核实6只ETF历史至2026-09-30共7事件，非未来完整账本。共享Paper/日线检验。测试`corporate-actions.test.js`、`paper-corporate.test.js`。
- 新研究：`prepare-cost-aware-data.js`25滞后因子→`prepare-cost-aware-correction.js`总收益修正→`prepare-full-capital-data.js`全额口径；`train_cost_aware.py`年度成熟标签训练→`cost-aware-backtest.js --full-capital`20日持仓；`train_profit_probability.py --full-capital`前两年拟合/前一年校准/下一年冻结评分。目录`cost-aware-v2`、`full-capital-optimization`、`net-profit-probability-full`。旧价格口径v1已标无效保留。所有候选未部署，不冒充原19只池权重。
- 新报告`dist/1万元全额资金验证报告.html`及`模型优化与修复验证报告.html`。全额六ETF趋势2024/2025/2026至9月各独立1万元净收益22.48%/29.29%/18.99%，单笔盈利50%/63.16%/60%，最大回撤18.86%/19.29%/20.33%；未证明可靠70%概率或未来年收益。
- 明日实时权威目录改为`validation/auto-full-v4-30m-2026-10-20`；`automatic-paper-monitor.js --full-capital --verified-release --run`。原`auto-30m`和`auto-full-30m`均未启动，冻结源/声明保留并标记superseded。新快照同1.5原19只池部署模型/引擎，不是六ETF趋势候选；09:30至09:35入场后实际观察30分钟。

- 当前Windows入口：`windows/Program.cs`释放内置资源 → `windows/DesktopForm.cs`独立WebView2窗口 → 共享`assets/index.html`。`DesktopServices.cs`负责HTTPS白名单与缓存。`scripts/build-windows.ps1`打包为单EXE；`scripts/test-desktop.ps1`从单文件中文路径验证真实启动和联网；电脑布局只在`windows/desktop.css`覆盖，不复制分析引擎。
- Windows缓存默认`LocalAppData/TechScopeDesktop/cache`，验证数据在`validation/desktop/profile`；关闭窗口终止运行，不安装系统服务。
- Android入口：`AndroidManifest.xml` → `MainActivity.java` → `assets/index.html` → `seed.js`、`analysis.js`、`market.js`、`ui.js`。
- 参数和建模：`assets/analysis.js`，纯JS可独立测试；20日成熟标签、2025冻结、2026月度滚动；`updateChampion`在旧模型截止日之后验证才升级。
- 行情/新闻/板块：`assets/market.js`，报价腾讯；日线腾讯优先/东财备用；腾讯科创板量为股，其他研究标的为手，东财原始日线为手。训练HFQ与展示raw分开，禁止默默混用。新闻首次观察时间及90天有限积累保存在`news_archive`，不回填初始历史预测。
- 原生桥：`MainActivity`异步HTTPS回调；`SecurityGate`限制主机/协议和缓存键；`HttpData`超时/大小限制；`LocalStore`私有缓存；`MarketJob`30分钟受系统调度采集新闻/行情。
- 界面：`assets/ui.js`消费Market/Analysis，五页与状态保存在原生私有目录；图表CSS/Canvas无外部CDN。
- Windows 1.2验证增强：`forecast-journal.js`保存首次实际预测/模型/因子快照，按后续真实观察日历到期评分并排除迟发；`assurance-ui.js`在五页中插入推荐证据、基准对照、本机记录和公司公告。模型尚无实盘优势，界面主动不发出买入推荐；没有训练/接入大语言模型。日记键`forecast.index`/`forecast.YYYYMM`，公告`ann_SYMBOL`。
- 初始数据：`scripts/prepare-seed.js` → `data/seed-data.json` → `scripts/finalize-seed.js` → `assets/seed.js`；2024验证正则，2025/2026用于显示检验。
- 构建：`scripts/build-apk.py`使用本地开放工具链，输出`dist/TechScope.apk`；`scripts/verify-apk.py`结构验证，构建程序额外验证v1/v2/v3签名。签名材料不可打包/发布。
- 检查：`tests/analysis.test.js`、`tests/market.test.js`、`tests/SecurityGateTest.java`；`scripts/browser-check.js`通过桌面浏览器验证移动界面与模拟原生传输边界，不能代替真机验证。
- 证据：`validation/initial-analysis.json`、`validation/browser/`、`dist/apk-verification.json`（具体路径以构建脚本输出为准）。
- 新模拟证据：`validation/live-paper/`真实一小时报价/固定持仓；`validation/historical-paper/`2023冻结决策与评分；`validation/risk-research/`仓位/趋势候选；`validation/ml-research/`梯度提升离线训练及时间隔离校准检验（未部署）。`scripts/prepare-research-results.js`只导出研究摘要，最终一小时后由`package-verified-windows.ps1`打包，提前运行会拒绝。
- 下午独立候选实验：`candidate-paper-monitor.js`，实际13:01至14:01已完成，50万元虚拟本金/单只20%上限；复核在`docs/afternoon-followup.md`，原首轮记录不能覆盖。`validation/candidate-live`保存其状态，原14:05单次跟进已撤销。
- Windows1.3小资金适配：`Paper.plan`与`Paper.start(profile:'beginner')`共用整手/佣金/权限/费用门槛，默认1万元、单只500元、最多3只，无候选可全现金；不改旧10万/50万实验。`assurance-ui.js`可调金额与佣金、显示完整排除原因及初学说明。`small-budget-paper-monitor.js`在13:45:25用同一引擎/部署模型启动第三轮实际小时，文件`validation/small-budget-live`，禁止重开/覆盖。测试`tests/small-budget.test.js`及`paper-ui.test.js`；成本尚未包含股票税费/过户费。
- 1.3.1校正模型开盘起算与盘中买价的换算，第四轮`--corrected`在13:52:55实际启动，`validation/small-budget-v2-live`；第三轮旧规则原样保留。后续维护见`docs/continuous-validation.md`；`daily-research-check.js`在工作日16:20采集闭合日线、保存20日前瞻记录，候选仍研究不自动部署；`research-file-store.js`以临时文件原子替换保护既有日记。
- 1.3.2公开方法调研：`docs/ai-investing-research.json`为方法/价格/优先级的权威记录，`make-online-research-report.js`生成HTML；模型页展示同一资料。用户数据/API预算100元/月，未开通付费接口。`ranking-research-data.js`→`train_ranking_research.py`为18特征市场相对收益研究，不部署；`validation/ranking-research`保存条件标签误差/排序，旧选股窗口有未来标签可用性偏差已归档无效。测试`ranking-research.test.js`、`ranking_split_test.py`；Python沿用bundled3.12及tools/ml-research依赖。
- 四轮记录已于2026-10-19 15:01打包并实际验证：`dist/科技观察-小额四轮记录版.exe`，证据`dist/Windows-four-round-verification.json`，四轮embeddedResearch均done且满3600000ms。第三/四轮均全现金0收益，不计预测成功；第四轮ETF对照-1.12933%。15:00单次复核完成后已删除，工作日16:20研究复核继续。不得重开旧实验或覆盖用户可能正在运行的四轮版。
- Windows1.4新增软件全自动30分钟研究模拟：`Paper.startAuto/stepAuto`冻结模型/预测/开盘参考，按原小额条件重查买入，达到估计20日目标价请求退出，T+1阻止当天卖出；股票税费选项只用于新自动模式，不重写旧四轮。`tests/auto-paper.test.js`覆盖费用、时钟、缺数据、T+1和不可强制期末卖出。
- 真实历史5分钟重放：`docs/automatic-replay-policy.json`先声明固定随机种子20261019，`historical-auto-replay.js`只用日线前缀/当时快照，初始决定全部冻结后评分。`validation/auto-history-30m`保存24轮及原始行情、源码/日线/模型。24完整、21交易窗口中2账面浮盈19浮亏、3现金不算成功；每独立1万元窗口平均-13.259354元；再估卖费全部不为正。新闻未入模、不补写新闻因果，历史完成另用historicalComplete，不是实时done。
- 新交付`dist/科技观察-自动模拟验证版.exe`1.4.0.0，SHA25620f0be2ca2e61da2356d5587847e0464f59d7e72d9e65b7e7cf4e0d31b3e8fe6；2026-10-19 15:33真实桌面联网启动29项检查及72项JS测试通过。`Windows-automatic-verification.json`绑定同一24轮决策SHA；`软件自动模拟-历史半小时检验.html`为可读报告。旧四轮EXE哈希未改变。模型没有因本轮亏损而被换成调参后的候选。
- 下一次一次性真实自动半小时：`automatic-paper-monitor.js --run`使用`validation/auto-30m-2026-10-20`冻结源码/内置模型，09:30至09:35允许实际入场，之后1800000ms结束。2026-10-19 15:31只做19源报价预检，没有开新仓。启动跟进名“半小时软件模拟启动”(automation,09:28)、结果跟进名“半小时软件模拟结果复核”(automation-2,10:10)，均COUNT=1；这是新建任务，不能误当此前同ID的已删除四轮跟进。规则见`docs/automatic-validation.md`，不得重开claim或补挑盈利窗口。
- 关键限制：当前手选研究池存在幸存者偏差；教学日线模拟不能证明实际成交；新闻无完整历史快照所以不回填训练；训练残差区间不是独立测试置信区间；后台不是全天逐秒保证。
- 实施记录：`docs/superpowers/specs/`、`docs/superpowers/plans/`。本工作目录开始为空，无既有Git分支；Serena初始配置无JS语言服务，当前导航采用限定文件/函数检索。
