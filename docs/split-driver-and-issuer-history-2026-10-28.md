# 连续拆分会计驱动合同与发行人分红接口（2026-10-28 15时）

本轮将已实现的多批持仓折算会计接入连续决策驱动的开发验证入口，且并行补发行人分红历史。没有执行真实历史经济研究、重跑旧研究、改变模拟账户或发布Windows/后台。

## 新驱动能力与边界

事前声明 `D:/techno/validation/strategy-research/corporate-action-driver-contract-20261028-a/protocol.json`，保存源前版本和hash，stage为implementation_contract_only；不是新的财务收益协议。`decision-account-study.js`共享原连续买入—持有—计划—记价—退出及公开重放流程。原runReplay入口继续拒绝公司行动，并拒绝显式会计开关。新runSplitContract只支持固定合同ID、validationOnly和合成输入声明及已批准Paper会计policy；没有接自动处理器，也没有让真实920日数据进入该入口。

合成已登记芯片2:1场景：持仓1300→2600份、价3→1.5，入场/风险/目标价按原库同步换单位，T+1日期不变；费用仍15元，无卖单或换单位额外费用，记录日和终点权益一致。增量执行与公开Paper.replayResearch完整session深等。旧无事件返回与登记源前完整深等，JSON序列化也相同。

独立复审发现新合同分支已正确折算却仍报unreconciled的P2，先红测后修复：只按登记事件当日比例检查raw隔夜×ratio与hfq隔夜，匹配时保留记录并标registered_split_unit_gap/eventId/unitReconciled；额外20%残差仍保留原警告。旧默认输出不变。9相关检查及独立边界复核通过，无开放P1/P2；未重复旧53项会计合同。初次测试读错买持计划desiredShares（实际字段buyShares）及修复脚本export锚点失败均保留日志，未修改账务来迁就测试。

新接口返回明确syntheticContractOnly/financialRankingReady=false/economicPerformanceClaimAllowed=false。这只是驱动实现合同，不是正式财务执行器；不能把真实数据改标synthetic借此跑收益。下一步仍须完整输入覆盖、独立密封财务协议及正式入口/处理器审查，不能删守卫放行。

## 发行人历史来源增量

国泰目录 `D:/techno/validation/data-reconciliation/20261028-issuer-history-gt`：官方产品历史分红接口仅传fundCode，无日期/分页参数。512720返回登记2023-09-22及12-22两笔，每份0.0480元，共0.0960；512760与515880成功空数组，官方脚本空分支为“暂无分红数据”。保存证券身份、原响应、字段与17清单项hash。现时历史记录与历史PIT是不同问题；本轮不擅自改变密封现金覆盖证明或声明财务完整性已通过。

华夏/嘉实目录 `D:/techno/validation/data-reconciliation/20261028-issuer-history-hx-js`：华夏515070/588000准确基金参数的官方历史页为单页空表/合计空行，无明确无分配声明；嘉实新741016分红历史接口返回业务错误-1，网站失败与成功空数组均显示“暂无分红记录”，因此不能把界面无记录当现金0。三只仍UNRESOLVED_NOT_ZERO，22清单项hash核对通过。首次批量公开请求被自动审查拒绝，提交新741016端点与旧741015目录不同的证据后获准；记录保留，没有改变权限或绕过限制。

六只H2现金证明原始SHA及六缺口保持，未把缺失补零；未重抓47附件、12报告或8拆分PDF。待发行人完整性与证据合同审定后再决定新财务协议；本轮没有新盈利结论、模型晋级或可实投声明。
