# 右侧研究区摘要超限修复与H2目录证据（2026-10-28）

用户最新要求是保持软件页面在右侧，直接查看真实盈亏，不额外扩大首屏功能。早前完成的profit-results-panel源码在26c5543提交，尚未部署；本次不将它混入运行环境。原research-center-view.js未提交WIP保持原样。

## 实际故障与恢复

后台summary.json已增长至85,294字节，旧研究读者明确只接受65,536字节，因此API仍返回原账户快照，但research.available=false。根因是任务列表内重复携带完整比较结果，再叠加缩进序列化；不是没有执行研究或账户停止。

新research-summary-writer只投影任务列表中超过2KB的重复详细结果，保留任务身份、状态、次数及有限结果指针/金额、失败错误摘要、病例金额、数据版本计数。完整不可变结果和SQLite不变，四个独立比较区深相等；日/周/月报告发布路径仍按原方式。展示JSON使用紧凑UTF8，写前严格检查64KB，超限保留旧快照，fsync后原子替换。不放宽读者、Native或CSP限制。

真实样本压缩至27,856字节；独立复审后来捕获85,295→27,857字节样本，冻结读者由不可用恢复可用。35项相关验证通过，独立复审无剩P1/P2。原临时目录rename EPERM测试记录保留，独立D临时目录目标测试通过；不把此工程通过当收益改善。

发布D:/techno/validation/autonomous-research/releases/20261028-summary1，70项源指纹。从desktop1/69源完整复用，只替换run-autonomous-research.js并增加research-summary-writer.js；原只读viewer、PaperAccount、采集器冻结源及Windows1.8.0.0不变。原唯一任务仅换action，principal/settings/triggers完全一致，电源保护未改，没有新增并行SQLite调度器。第一次更新因空WorkingDirectory参数失败，任务仍旧版；修正参数后13:31:45实际原任务运行结果0，13:31:48核源成功。既有viewer无需重启，HTTP200、research.available=true、六路径实际结果在HTML内恢复显示，账户仍原ID/seq3233。此为HTTP验收，未声称浏览器目视验收。

## H2公司行动目录增量

隔离目录D:/techno/validation/data-reconciliation/20261028-h2-distribution-evidence保存六ETF官方无关键词筛选公告目录：五只上交所、一只嘉实管理人，2026-07-01至10-23公告发布日期共47条，六目录原始响应哈希与分页总量独立核对通过。未识别现金分配标题，但未逐篇通读47附件，也没有取得该期间明确无分配声明，allSixCashZeroProven=false，不能把目录无匹配写成现金零值已证实。

新增正文证据：512760自7月6日最小申赎单位由300万变200万；159852自8月17日终止国信证券流动性服务。两者均不是持有人份额拆分或现金分红。既有8拆分PDF与12年/半年报未重抓。历史首次公开时刻仍未认证，2026可靠收益排名继续阻断，未跑新收益或修改旧份额。

下一步沿原路线补齐目录附件与现金分配覆盖，再准备显式opt-in财务驱动和新事前财务协议。原六路径、decision两路径及compare均已完成，永不run/resume重跑；本次无模型/策略晋级，无盈利承诺。
