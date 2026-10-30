# Forward event watch development producer (2026-10-30)

scripts/forward-event-watch.js captures only public SSE announcement directories and JSFund 741015/product1779 for six pinned ETFs, incrementally from 2026-10-24. It records request/receive clocks, URL, HTTP status, raw body and SHA256, validates business result envelopes, identity, page counts, stable totals and requested date bounds. Failures remain evidence. Title classification identifies rights suspects without guessing ratios, dates or cash amounts.

Run: node scripts/forward-event-watch.js 2026-10-30 D:/techno/validation/daily-20261030/forward-event-watch-dev

Output is restricted to this development root and fresh attempt subdirectories. No production event-status.json is published. No account, consumer, SQLite, scheduler, protocol or Paper code changes.

Actual attempt-Aod0hB captured six official responses at 2026-10-30T09:25:15Z–09:25:16Z. Five SSE directories passed pagination/identity checks. See per-symbol coverage for JSFund result and complete evidence. The assessment remains unknown regardless of apparently empty or benign new announcements: old pending events may have been announced before this incremental window. Historical baseline closure from the existing registry, cached official directories and already extracted attachments is still required. Existing cache was inspected to derive exact official URLs; it was not re-fetched or falsely treated as a certified baseline. Earlier events passed explicitly to assessment are retained unless resolved. No ready status is emitted in this development version.

Missing: certified full historical baseline, durable prior event registry ingestion, full announcement interpretation including effective dates, freshness/identity controls for baseline, and independent review/freeze before any production publication. This is a conservative incremental capture component, not a completed surveillance authority.

Validation: node --test tests/forward-event-watch.test.js. First run failed due to absent implementation; subsequent checks cover business failure, missing envelope, classification, baseline absence, retained pending event, identity/page errors and raw failure evidence retention.

Independent review follow-up: SSE nonempty actionErrors or fieldErrors now fail business validation. Announcement identity (JSFund ad_id when present; SSE URL) and normalized URL must each be unique within and across pages, in addition to stable total and final count closure. Three new regression checks were red before the fix; all nine tests pass afterward. No network recapture; original attempt-Aod0hB and commit remain preserved. Status remains unknown and baseline/full-text limitations above still apply.
