# 2026-10-19 第二轮后续复核

已于本次公开方法调研中完成第二轮复核：实际13:01:00至14:01:00、121次采样、无异常；50万元虚拟本金期末502072.78元（+0.4146%），满仓ETF对照502896.79元（+0.5794%）。两者仓位不同，不据此认定算法改善。1.3.2 `科技观察-研究对照版.exe` 已内置该完成记录，并实际验证28项原生检查；`Windows-research-verification.json`的embeddedResearch.candidateLive.done为true。原14:05单次复核已撤销以避免重复；后续15:00小额修正版与工作日16:20研究复核保留。

补充：用户随后明确初始1万元、单只几百元。当前代码已升级1.3小额模式；不要回退。另有13:45:25启动的第三轮，14:45:25后才完整，在`validation/small-budget-live`，详见`docs/continuous-validation.md`。14:05复核时第三轮应标为尚未完成，不能提前计为最终结果。当前用户可能已打开`科技观察-新手小额版.exe`，后续打包必须另外命名。

- 用户明确要求优化候选后再模拟一小时；不是真钱交易，不承诺70%成功或反复试到盈利。
- 任务进程：`node scripts/candidate-paper-monitor.js`，统一执行会话80451，启动时PID34612。已排队2026-10-19 13:01（中国时间），实际开始后运行3600000ms，若错过13:03不伪造入场。
- 冻结选择：新易盛sz300502、中际旭创sz300308；研究分数来自11:31的Oct16日线输入。分类器基础标签截止2024末、2025校准，未部署成实盘推荐。
- 虚拟本金在入场前因整手约束由10万改50万；旧声明保存在`validation/candidate-live/declaration-before-lot-correction.json`。每只最多20%，其余现金；股票选择未改，没有看下午后续收益。
- 原第一轮在`validation/live-paper`，不得覆盖。第二轮文件在`validation/candidate-live`，其中status有实际起止、done/elapsedMs、session；failure文件表示失败。不要重开为挑盈利结果。
- 应已创建本聊天单次跟进，名称“下午候选模拟复核”，自动化ID `automation`，计划14:05本地。电脑与Codex需保持运行。

完成后先验证第二轮done且elapsedMs>=3600000，再运行：
1. `scripts/package-verified-windows.ps1 -OutputName '科技观察-双轮验证版.exe'`（自动更新研究摘要和HTML报告；不得覆盖用户可能打开的首轮EXE）。
2. `scripts/test-desktop.ps1 -Executable 'D:\techno\dist\科技观察-双轮验证版.exe'`，需实际网络。Python仅离线研究，不是EXE依赖。
3. `scripts/finalize-windows-release.ps1 -ExecutableName '科技观察-双轮验证版.exe' -ArchiveName '科技观察-Windows双轮验证版.zip' -VerificationName 'Windows-dual-verification.json'`。
4. 查看实际报告和快照，报告两轮各自金额/百分比、费用/现金差异和源时间，不能直接比较成算法改进。原模型仍没有实盘优势；非线性候选也未达到可靠70%证据。

如果尚未完成或失败，先读状态/错误，如实告知；不伪造持仓、成绩或满一小时，不购买服务、不连接券商、不按单次收益升级为买入推荐。
