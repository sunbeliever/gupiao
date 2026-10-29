# 一次性日线采集中断恢复修复（2026-10-29，尚未部署）

首个 stable-daily-data-2026-10-29 于09:04实际开始，保留12个原始响应及11分区；sz159852主响应无hfqday，尚未生成accepted。原进程中断原因未知，无failure.json。后续通用死owner恢复将它再次排队，第二次执行被永久claim拒绝；不得删claim、换ID追抓或把11分区当完整成功。

隔离真实Store夹具复现上述恢复路径。当前源码仅将死owner的data_collect转blocked，保存中断PID/attempt/旧result，并保持原ownerToken/attempt与CAS条件；活owner不变，其他kind仍按原恢复规则。已失败生产任务不重开，原协议、采集源、账户和数据库均不修改。

新增回归先红（queued而非blocked），修复后4新增+18原相关共22通过。独立复审通过，无重要缺陷；另10项独立断言通过；未发布后台、EXE或新模型。原center WIP保留。故障目录D:/techno/validation/daily-20261029/stable-first-capture-incident；原中断原因仍不能从此修复推断。

## 14:20实际发布

新后台20261029-recovery1/71源，从原stable-data1逐字节复用，只替换已复审的autonomous-research.js（SHA64ffe3f939e3f81fa7f47a8f9587a445231470be11aa5a80c74bed47032da375）。原任务权限/设置/触发XML逐项相同，14:20:20实际结果0，14:20:22核源通过。原失败24证据文件hash保持，accepted仍不存在；旧失败不重跑。未换Paper、Viewer、原账户或EXE。
