# Forward cash-only event publisher — 2026-11-02

`forward-event-publisher.js` completes the event-side runtime interface; it does not start accounts, orders, tasks or SQL. The original development watcher is unchanged.

- `loadBaseline(file, expectedReviewSha256, at)` requires an externally frozen raw-file digest, the fixed b196… closure proof, exact root review status/reviewer, known six ETF coverage, explicit review scope and omission policy. A proposal is not approval. Approved objects are digest-bound after loading.
- `assess(baseline, coverage, at)` is a pure diagnostic. It cannot authorize publication. Exact symbol/title/date/URL mappings must be separately root-reviewed with document SHA; a new harmless-looking title still yields unknown until full-body review. Missing/duplicate source, business failure, stale/future receive time and any unreviewed announcement fail closed.
- `refresh({baselineFile, expectedReviewSha256, out})` uses the real current clock and fixed official collector with no injectable fetcher in this production wrapper. It saves a new immutable attempt directory with all six raw responses, metadata and assessment. Only results created by this real refresh are eligible for `publish(destination, assessment)`; pure assess or later object mutations cannot be published. Publish uses fsync plus atomic rename, <=64KB, same-day and <=30-minute gates.

Trust boundary: the caller must obtain `expectedReviewSha256` from the root-reviewed release seal, never hash an untrusted request's own baseline file and call that approval. No production CLI accepts arbitrary hashes. The consumer/release integration must pin this module and baseline and provide its fixed approved paths. Underlying official directory identity and bodies are checked by the existing collector. Reviewed PDF hashes are retained; reusing an already reviewed official URL does not certify that a publisher could never replace content at that URL. This limitation is explicit in the reviewed baseline.

## Actual run

The root independently checked the 53 already reviewed announcements (2026-07-01–10-30) and four implemented splits, then created a separate immutable review receipt. The old closure proof's `baselineReady=false` was not modified. This accepts bounded **no known pending event**, not exhaustive all-history absence or historical total-return validity. Pure cash starting accounts import no old entitlements. Discovery of a missed action pauses the study and invalidates affected results pending review; no shares/cash are guessed.

The first real 11/02 refresh `capture-xWfYIS` correctly returned unknown because a new 512720 announcement had appeared. Its full official three-page PDF was acquired (104716 bytes, SHA 13e53e224547c98cfcf94be4a6f1b630319e3653d902fbf0b89ab95b86350b27). It adds Caitong as a primary creation/redemption participant from 11/02; it does not alter holder shares/cash. Root read the pages and independently approved an appended seven-item review receipt, without overwriting the original six-item approval.

Final approved receipt SHA: 3c39dbdf0e82acf2a4b344319a2afd4c8afa4c21e5d20668be2fb3ba2acb7963. Real six-source refresh `capture-wc42LD` at 2026-11-02T00:57:16.341Z yielded `no_known_pending_event`, no failures. It was atomically published only to its independent attempt's `event-status.candidate.json`, SHA 8b1d1c43863708530824bd627dbfa7e762aa7d24f83e68ded330a672f6f902d9. No production study event-status was written by this task.

All evidence: D:/techno/validation/daily-20261102/event-ready. The 08:57 Beijing capture will be stale before the 09:35 entry window: production must perform a new actual refresh within the required 30 minutes, not merely advance checkedAt.

## Validation

11 focused tests passed. Module-absent initial red is retained; intermediate test-edit ReferenceErrors are retained separately and are fixture editing mistakes, not hidden production successes. Tests cover external hash pinning, root-approved status, altered scope/proof, unresolved known events, exact review identity, stale/future receipt, missing/duplicate sources, new unreviewed text, object mutation after loading/assessment, pure-helper publication rejection and separately approved added AP mappings. The real refresh independently exercised raw HTTP capture and atomic candidate publication.

No account launch, financial return, source-freeze approval, scheduler deployment or strategy promotion is claimed here.
