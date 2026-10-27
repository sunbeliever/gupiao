# 已登记公司行动多lot会计合同实现（2026-10-27 14时轮）

沿corporate-action-lot-protocol-20261027-a执行，原protocol/claim字节未改。新结果另存validation-contract-result.json。只改研究库assets/paper-account.js与新针对性测试，不替换原账户冻结源、69源worker或1.8.0.0 EXE，也不运行旧研究或新增收益路径。

新session必须显式historicalReplay、registered-decision-research身份及严格researchCorporateActionPolicy；绑定事前protocol与今日官方证据registry，封入rules/fingerprint/session integrity。临时context不能给旧session启用，缺省不增加状态字段，原初态和下一checkpoint与修改前完整深比一致。只接受四条已登记、全字段匹配的2/3整数折算事件；未知事件、分红、应收款继续拒绝。此政策绑定输入证据身份，不认证历史首次公开时刻或全市场完整覆盖。

固定会计用例与旧lot/公司行动/持续账户/退出回归53项通过，主线整合相关20项通过；四实际比例的合成Paper输出又由独立Python核对现金、持仓成本、费用、风险/目标价、日期。覆盖多lot/部分FIFO、T1、入场费分摊、待退出份额缩放、登记日权利、幂等、过期/缓存新单位报价不提前记价，及旧默认兼容。不是再次完整重放真实历史。

独立复审曾发现P2：把连续交易时段的fresh检查用于份额单位转换，导致除权日15:00合法收盘报价不能转换。新增红测确认100未变300后，只改新开关下单位门禁为合法及时的observedQuote；订单仍遵守原交易时段。修正后300份×新价1元与原100份×3元一致，现金/权益/费用/订单数不变。独立5例及默认1例复核通过；涨跌停/停牌标志不阻止已生效份额单位转换，未来/跨日/缓存数据不提前换单位。红测/loader错误及最终绿证据保留在D:/techno/validation/corporate-action-lot-independent-20261027。

这完成了会计库显式开关的合成合同验证，没有让原financial drivers接受corporateEvents，也没有接入自动研究handler。原L/旧decision驱动的非空事件保护仍在；不可仅删守卫跑利润。完整行动/分红覆盖、权益完整对账、日线open真实成交时点和历史PIT认证仍待完成，2026可靠财务排名不解除。下一步另行冻结独立财务驱动、数据和预登记比较协议，原结果与不利证据保留。

同轮已完成1.8.0.0在新鲜实际提交seq2698下真实Windows只读验收，详见docs/native-fresh-acceptance-2026-10-27.md；不是新EXE、模型或盈利升级。新库代码未打进已交付EXE，也没有热换原真实执行规则。
