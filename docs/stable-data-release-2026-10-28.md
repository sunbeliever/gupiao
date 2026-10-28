# 未来次日完整日线采集修复已发布（2026-10-28）

今日daily-data-2026-10-28失败保持failed/attempt1；原claim、failure及raw28/hfq27两个响应的SHA、队列payload/result前后完全相同，没有改ID重抓今天，也没有新数据或模型晋级。

原协议stable-daily-data-protocol-20261028-a的SHA `bca81aacb248f9092876a14c51ab7493f276147cecc4f6e98373b72f55f000dc`未变。仅10月29日起，已知交易日09:00后生成stable-daily-data-<计划采集交易日>，固定请求其前一完整交易日。晚登录或排队延期仍保持原计划cutoff，实际startedAt/receivedAt用执行时真实时钟；captureSession表示计划版本交易日，不是实际首次接收时间。周末不新建，未知2027日历不外推。数据仍须12个原价/后复权分区同时满足完整截止，源仍迟到则保留失败，不保证明早一定到齐。

修复包含三个层次：计划生成、父执行器、实际research-dataset CLI。独审先发现父执行器16点后拒固定前日，补了模拟子进程的集成测试；再次独审发现真实CLI仍用旧等式，模拟子进程不足以覆盖该层，因而继续阻止发布。最后把admit集中到research-data-schedule，父与CLI都调用。稳定声明必须完整重建相同policy：固定协议及SHA、计划交易日/09:00、ID、前一截止、年份、源账户、目录结构及minBars；未来截止仍拒。普通data_collect保持原最新截止规则，已有accepted版本仍核验原结果。

CLI在读取原账户前验证稳定声明，再将原计划binding保存在sourceBinding.collectionSchedule，保留原frozen manifest/native helper来源字段；没有回填接收时刻。42相关测试通过，独立22个实际CLI边界及12相关复核通过，两层P1关闭。实际CLI离线夹具阻断账户和网络；测试VM初次产生跨realm JSON原型假拒绝，已修为共享JSON模拟真实Node模块环境，没有放宽生产deepStrict matcher，原失败日志保留。

发布 `D:/techno/validation/autonomous-research/releases/20261028-stable-data1`，71源指纹。从summary1/70源逐字节复用，仅改autonomous-research、run-autonomous-research、research-dataset并增加research-data-schedule。未带入公司行动研究库、新合成驱动、26c5543首屏功能或research-center-view原WIP；原Paper、只读viewer和Windows1.8.0.0保持。发布4个源字节与独审指纹一致；发布实际CLI两延期场景到达离线账户边界，未真实抓取。

原唯一任务只换action；principal/settings/triggers逐XML相同，权限、电源、5分钟周期、24分钟限时及资源门槛未变。17:39:23实际新任务结果0、17:39:24核源通过；原viewer继续HTTP可用/research.available=true，seq3522收盘状态不变。今天plan=null，生产库stable jobs=0，旧失败身份及四个证据文件SHA未变。

**尚待明早真实首次采集验收。** 本次不称“今日数据已恢复”或“自动训练已完成”。先核新任务唯一claim、实际源响应与完整accepted/manifest，再决定是否形成新研究输入。关机、未登录、电池任务条件、资源或来源滞后仍可能阻断，不能宣称全天在线。
