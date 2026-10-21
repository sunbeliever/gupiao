# 2026-10-21 13:35新5万元模拟账户与右侧只读页
- 实验paired-capital50k-20261021-pm-a于13:00:07真实声明，首个固定原生探测通过；13:05:16共同起点实际创建双虚拟账户。采集PID24872至16:10，活进程不重复--run/resume。
- 候选买入588000科创50ETF2900份、512760芯片ETF4600份、515880通信ETF7700份。合计12335.6083元含买费15元，现金37664.3917；满足计划至少1万元且未超12500。对照花12373.0457含15元。今日T+1不可卖，最早10/22；20日到期11/18，4%风险线不保证500最大亏损。
- 静态完整审计至13:19:40/seq39，声明/源/helper/原始响应/hash链/两腿逐笔恢复/账务一致。D:/techno/validation/daily-20261021/capital50k-live-audit-1318/audit-report.json。该时点权益50005.9917，短时盈亏不是成熟证据。静态副本绝不运行/恢复。
- 本轮唯一产品改进为scripts/research-account-view.js、scripts/serve-research-view.js，只读manifest/claim/state/status。旧EXE、原UI、全部冻结采集源和账本不改。新只读页http://127.0.0.1:58659/，主机PID57148，稳定发布D:/techno/validation/right-panel-preview/account-view-20261021-v3，仅127.0.0.1。页面15秒刷新、实际行情约30秒采集，不是券商成交。
- 核对声明/协议/状态双层hash、同sequence与时刻、现金+持仓+应收=权益；页面当前时刻复用Paper.inspectExecution重查报价，过期停止处理提示。显示可卖日/冻结风险价/到期和待退出原因，500元警戒同时看本金损失及永久峰谷，不保证限损。
- 全274回归、9目标及独立复审通过。来源报价在显示时过期、畸形URL未捕获均已先红后绿修复。旧v1已停止保留superseded，v2只读服务换窄屏布局v3，版本留存。浏览器已实际打开并markDeliverable，三持仓与T+1完整可读；截图account-view-final-top.png/account-view-final-holdings.png。
- 新训练模型仍未部署：运行f0b16e0c/2024-12-31截止；8903成熟样本的新候选仍研究。新闻财报完整覆盖未知，70%和保本未证。最新盈亏以页面时间为准，各账户收益独立。
- 下一轮16:20优先读5万/旧B/1100各自完整收盘链、费用、回撤与可卖状态，不调参重训。viewer不是采集器，viewer停止不能重开或重置账户；只读viewer重启先核CIM和manifest。同账户采集恢复始终从其冻结source、显式--resume、无活写者前提执行。
