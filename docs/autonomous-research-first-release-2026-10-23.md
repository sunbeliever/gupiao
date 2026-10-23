# 自主研发基础首轮交付

不是成熟量化系统最终验收。已实现SQLite持久任务、唯一策略hash、事务认领、ownerToken和CAS恢复、防重叠、不可变输入/结果、失败记录、内存门槛、只读研发中心和研发进度日/周/月报告。仅允许已编码处理器，不执行队列Shell。训练处理器明确阻塞，未假装自动训练；自动晋级/回退和完整滚动扣费回测尚未实现。

稳定根D:/techno/validation/autonomous-research；release releases/20261023-a。任务Techno-Autonomous-Research-v1以当前用户普通权限、登录会话执行，每5分钟唤醒一次并在登录时触发，IgnoreNew防重叠、24分钟执行上限。实际LastTaskResult=0，scheduler-last.json证明独立运行。关机/未登录不能执行；此首轮并未实现无人登录服务或冻结采集器独立守护。注册采用微软ScheduledTasks文档：https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/new-scheduledtasktrigger 与 /register-scheduledtask 。没有修改安全策略、购买服务或接券商。

右侧仍58659。冻结25项sourceHashes，boot每次核验后执行队列，查看器42596单独只读启动。新的summary异常只隐藏研发区，账户不改；缺失短/长期信号、训练阻塞、未升级明确可见。接口GET/HEAD，无写入订单入口。默认旧启动界面兼容，旧EXE不替换。

唯一新实验cooldown-case-20261023-a先声明问题、输入hash、源码hash和不能晋级的条件，使用10/22已见静态证据，仅一个固定禁止当日重买候选。其他实际交易保持不变：实际累计亏515.4676，删除同刻重买的终点条件亏422.1584，差93.3092，其中买费5。不能推论完整策略收益、最大回撤、夏普或赚钱概率，未独立样本外、未未来模拟、未晋级。新仓位和旧账户未被此候选修改。

正式回归292通过，最终24项目标及独立复审通过。三项重要问题已先红后绿修复：恢复可误抢新执行者（token+CAS）、研究区嵌套错误波及财务页面（schema隔离）、真实成交schema适配（fillAt/fees.total只采hypothetical_fill）。这些是工程改善，不是盈利能力证据。

今天主5万12520、小仓62748在09:06从原冻结源显式resume，完整重放后才新增输入。旧1100因可用提交内存不足暂缓，未改冻结驱动，未重开或回填。以上PID下次必须重核。研究训练不能抢占采集。

后续沿docs/自主研发路线图.md继续。首要数据版本化、同引擎冷静期完整策略回放与固定5/20/60日简单基线；60日不等于12个月。已看行情不作为新盲测。收益风险仍未通过，实投准备度继续研究。
