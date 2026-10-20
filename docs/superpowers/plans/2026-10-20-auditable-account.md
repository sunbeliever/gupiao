# Auditable continuous paper-account implementation plan

User specification: 2026-10-20专项修复指令及独立审查报告。授权执行，不增加实盘交易、付费服务或风险本金。

Baseline source commit: 61443d4dbeb51efd18e0ef769c412b5f280dd2de. Preserve original EXE SHA e68ee81a8a42b8c26baad12bf7ce1b6640d6e0742ed3a1284631ba7cf9fcb4c2 and every old account/report. Original directory remains baseline; changes only in this managed worktree/repair branch.

Architecture: Keep the five-page UI and authoritative Analysis/Market/Paper entry points. Add shared exchange calendar, fee profile and audit fingerprint modules. Separate a bounded engineering observation from a persistent investment account. Use ETF execution universe first and keep all stocks available as research. Existing independent interval reports stay explicitly exploratory.

## Tasks and validation gates

This is the preregistered implementation plan. Completion evidence is recorded in docs/audit-repair-2026-10-20.json and the delivered release manifest, not the original checkboxes below.

- [ ] Extract the exact release resource; compare authoritative modules by normalized and byte hashes; preserve before/after evidence. Original review scripts not attached: label reconstructed eight-case reproductions accordingly. Recompute embedded 2025/26 reports before edits.
- [ ] Exchange calendar + history metadata: official holidays, known coverage, expected completed session, T+1 and maturity dates; fail closed outside verified coverage. Distinguish request/receipt/provider date and stale. Reject jointly old pools. Unit tests for morning, Monday, holiday, lunch, close and fallback failure.
- [ ] Shared fee profile + deterministic SHA256 provenance + source-grounded news facts: same fee version across plan, entries, exits, benchmark and replay; keep minimum5 assumption configurable, never silently waive. Text-only extraction explicitly lacks full-report coverage.
- [ ] Continuous Paper account: explicit frozen strategy, signal contract, risk/capital limits, order intent/rejection/fill ledger, T+1 and frozen expiry/risk exits; partial holding marks independent of entry-pool health. Observation completion cannot stop account valuation or clear losses. Restart is idempotent; replacing funded accounts prohibited.
- [ ] Causal Analysis research fill assumptions: never use full-day future high/low/volume to decide an opening fill. Explicitly mark independent interval estimates; no automatic conversion of an unfilled exit into reinvestable account cash. Shared Paper replay proves persistent-ledger accounting.
- [ ] Integrate existing UI and native host: preserve legacy records read-only, restore matching continuous schema, show stale held quotes, maturity/sellable dates, fees/provenance, rejected orders and comparison accounts. New namespace/data root avoids corrupting legacy app records.
- [ ] Same-input tick replay/live parity, fees, T+1/holiday, failed exits, split/dividend/duplicate event, outage/restart and accounting identities; retain original appropriate tests. Review changes before release.
- [ ] Commit fixes on repair branch; build separately named EXE; actual Windows launch, persistence, complete-pool native networking check recorded without relaxing its result. Create source/evidence ZIP, issue/evidence/change/regression/uncovered matrix and SHA256. New forward run must use a new ID and only a future valid session after code/data gates pass.

No model training or deployment promotion in this repair. No original active frozen monitor imports this worktree. 2023-26 already seen history remains exploration. 30-minute baseline is engineering observation, not investment success.
