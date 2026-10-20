# Windows 原生日线连接诊断

检查时间：2026-10-20 北京时间 09:45–09:46。仅请求现有白名单公开日线，没有账户、交易、付费、配置修改或证书校验例外。

## 既有失败继续保留

原始失败：`D:/techno/validation/desktop/full-capital-freshness-failure.json`，SHA256 `353b6d4ead634bc7fa7a39bc10c6bd40a5e756b4aab6f06bba17703f45702f4d`。昨日 Windows 发布程序日线没有全部达到应有日期。本次只读探测没有重写该证据，不能用本次连接成功覆盖之前的失败。

## 同时点对照

- `node-initial.json`：Node v24.18.0，请求同一芯片 ETF 后复权日线 URL，成功，673 ms。
- `framework-initial.json`：发行同款 .NET Framework 4.0.30319.42000、TLS 1.2。原 `DesktopHttp`、显式直连、系统代理无压缩且关闭复用、直连无压缩且关闭复用，四组均成功，约 275–490 ms。
- `framework-six-etf.json`：同一个未修改的 `DesktopHttp` 实例、原四并发上限，六只科技 ETF 全部成功，均含最近完整日 `2026-10-19`，约 377–598 ms。接口还返回了当日上午未闭合的 `2026-10-20`；`completedDataAsOf` 单列最近完整日，没有将盘中日线冒充完整日。

系统默认代理在本次检查中为 `127.0.0.1:7897`，该主机不绕过代理；环境没有 HTTP(S)_PROXY 项。此路由差异是排查线索，但当前两种路由均成功，**没有证实代理、TLS、压缩或 HTTP 版本就是昨日故障根因**。原始正文包含盘中数据，时间稍有差异导致 SHA256 不同，不把这些正文哈希差异解释为闭合历史不一致。

## 结论与边界

本次未复现旧的 `response prematurely ended`，因此没有修改 `windows/DesktopServices.cs`，没有加入未经验证的代理绕过、弱 TLS、无限重试或 Node 发行依赖。探针只证明上述时刻该入口可返回数据；新 EXE 的完整池日线、真实原生启动和后续稳定性仍须由主验证流程单独检查。遇到数据失败继续阻止无效入场，不降低完整性门槛。

诊断源码 `NativeNetworkProbe.cs` 由 Windows 自带 .NET Framework 编译器与权威 `windows/DesktopServices.cs` 一起编译；`node-probe.js` 仅作排查对照，非软件运行依赖。冻结实验和真实前瞻账本均未改动。
