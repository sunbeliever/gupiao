# 显式未来模拟决策引擎合同（2026-10-30）

为避免历史权益资格不完整阻塞全部投资决策验证，新增独立未来研究会话能力；仍沿既有原Paper账务与独立未来验证路线。事前开发合同D:/techno/validation/strategy-research/forward-decision-contract-20261030-a，SHA feca650591f514e2e9db9c9ba187fd19c954cb5fadb722baf06ef584490034a5。它是implementation-only，不是已启动的前瞻账户。

新会话必须显式researchForwardPolicy和registered-decision-forward-v1模型，live模式及独立registered-forward-decision-v1指纹；固定六ETF/5万/12500与25%新增/3标的/4%/原费用，禁止历史买持开关关闭风险/到期。新会话不会从普通预测入口自动买入，只有显式applyForwardResearchDecision接登记计划；持有、风险退出和批次记账复用原实现。

前瞻观察只能是已发生且距实际墙钟不超过90秒，未来1ms也拒绝，不能离线补造过去成交。普通上下文不能创建该研究模型，旧历史applyResearchDecision不能处理live会话。同刻同计划幂等，变计划/报价/身份拒绝；T+1受阻卖出保留持仓和pending，不提前放现金。其他公司行动/应收在新合同仍拒绝，未来事件须暂停并单独审查。

独审发现合法候选可携model.researchExitMode=buy_hold关闭止损及到期的P2，已补红测后在create/session拒绝，并限制共享买持分支仅历史模式。另有未来时钟/遗漏新方法导出/普通上下文opt-in等红绿与初失败日志保留。新7目标及独立边界、默认会话完整字节兼容均核；旧受影响拒绝/兼容目标2项通过，不重复旧全量审计。

**未启动新真实采集或候选模拟账户、未接持久消费者/队列、未部署后台或Windows、没有新收益或晋级。** 下一需另行冻结实际前瞻协议（两个已有固定候选、同资金费用时点和盲前瞻窗口）、完整源/数据绑定和单写者日志；消费者只接真实已提交新tick，不复用原账户仓位或写其文件。后续账务只读重放必须另有显式审计入口，不能把live时间保护取消来运行旧tick。
