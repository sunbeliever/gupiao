# 一次性日线采集中断恢复修复（2026-10-29，尚未部署）

首个 stable-daily-data-2026-10-29 于09:04实际开始，保留12个原始响应及11分区；sz159852主响应无hfqday，尚未生成accepted。原进程中断原因未知，无failure.json。后续通用死owner恢复将它再次排队，第二次执行被永久claim拒绝；不得删claim、换ID追抓或把11分区当完整成功。

隔离真实Store夹具复现上述恢复路径。当前源码仅将死owner的data_collect转blocked，保存中断PID/attempt/旧result，并保持原ownerToken/attempt与CAS条件；活owner不变，其他kind仍按原恢复规则。已失败生产任务不重开，原协议、采集源、账户和数据库均不修改。

新增回归先红（queued而非blocked），修复后4新增+18原相关共22通过。独立复审通过，无重要缺陷；另10项独立断言通过；未发布后台、EXE或新模型。原center WIP保留。故障目录D:/techno/validation/daily-20261029/stable-first-capture-incident；原中断原因仍不能从此修复推断。
