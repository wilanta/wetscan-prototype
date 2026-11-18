# S04 preservation-audit controller discrepancy

Status: **IMPLEMENTED_PENDING_ACCEPTANCE**. This correction and reconciliation are offline only. The previous one-attempt live authorization is consumed. No PostgreSQL connection, audit rerun, provisioning, new live approval, Docker operation, application/worker startup or Git publication is authorized or performed here.

## Confirmed defect

The executed runner was SHA-256 `05c79054461e30b655a247b2455e8aebf9c111d1457cd6a7f501a76423dc02e5`. Its original output remains unchanged at:

`C:\Users\sheil\.wetscan-sentinel\s04-dev-preservation-26c1176782ee4823ade18729c213bdc6`

Windows PowerShell **5.1.26100.9818** returned a `System.Diagnostics.Process` from `Start-Process -PassThru` without retaining its native handle. After the existing wait/refresh sequences, `ExitCode` was **null**, including for a successful child. PowerShell evaluates `$null -ne 0` as true.

The exact two original rejection conditions were:

1. `$auditProcess.ExitCode -ne 0`: threw `audit_NOT_VERIFIED`; the catch appended the same generic classification before consuming the valid database result.
2. `$watchdog.ExitCode -ne 0 -or Test-Path ...audit-deadline-expired.sanitized.json`: the null exit-code operand was true, appending `audit_watchdog_cleanup_failed` and skipping the later valid cleanup-receipt branch. No deadline-expiry artifact exists.

Eight harmless local child-process cases reproduced both original wait modes, with expected exits 0 and 7. All four original cases lost their exit code; all four cases retaining the native handle returned the exact expected integer. No approval or database was involved. The historical runner did not persist the original child exit-code values, so those values cannot be recovered retroactively. The source defect and its reproduction are confirmed independently of that missing historical instrumentation.

This is a process-handle lifetime defect, not evidence of a database or receipt-flush failure. The controller already waited for the watchdog to exit before consuming its receipt. The successful database output, closed approval, hash receipt, independent watchdog output and final controller output were all present. No file-ordering race is needed to explain the two false failures. Original receipts are never rewritten to PASS.

## Separate evidence conclusions

- **Database verification: PASS at the recorded snapshot.** One read-only connection verified database/marker/role, four migration versions and checksums, 91 original rows, all 16 jobs, eight heartbeats, Incident #1 and evidence/timeline, contained sources/credentials and three disabled rules. No unexpected rows, leases, sessions or orphan evidence were reported. This is historical snapshot evidence, not a new connection or a claim about later changes.
- **Cleanup: independently supported.** The audit pool's `finally` awaited `end()` before successful artifacts were published. The child exited; the recorded post-run host checks found no remaining owned/audit processes or established host connections. The temporary approval is CLOSED/actions empty; its before backup and after approval match the closure receipt hashes. All non-closure fields are unchanged. The independent watchdog receipt is CLEANUP_COMPLETE with no errors.
- **Original controller result: NOT_VERIFIED.** That result and its two error classifications remain immutable. A new offline reconciliation report references their hashes and explains the discrepancy. It does not manufacture historical exit codes or retrospectively run the corrected aggregator on old, unbound receipts.

The authorized containment pointer/version/audit delta remains verified using the reviewed semantic checks. The old containment receipt does not independently supply complete after-hashes for every new field; this correction adds no byte-level claim.

## Targeted correction

- `scripts/Invoke-S04ReadOnlyAudit.ps1`: retains both child-process handles, validates integer exit codes, records both exit codes and the failed stage, keeps the 120-second deadline, waits for watchdog completion and aggregates independently validated evidence before final publication.
- `scripts/sentinel-readonly-audit-common.ps1`: adds atomic create-only receipt publication after durable flush; exact run/output binding; before/after closure-hash and metadata checks; bounded closure-lock contention handling; surviving-process checks; and fail-closed final aggregation. Unknown/null/nonzero exit codes and missing, malformed, stale or incomplete receipts cannot yield PASS. Independent process cleanup still runs after closure failure.
- `scripts/sentinel-readonly-audit-watchdog.ps1`: binds and atomically publishes receipts, validates the controller handshake and independently checks closure evidence. A controller marker never substitutes for revocation.
- `scripts/sentinel-readonly-audit.ts`: adds run/output binding to the result envelope only. The PostgreSQL implementation, fixed SQL allowlist, single-connection limit, read-only session/transaction, timeouts and historical verifier are unchanged.
- `tests/sentinel/readonly-audit-runner.test.ts`: regression cases use only expired, unusable 2020 fixtures in private temporary directories and harmless local child processes.

The original null check failed closed; it did not turn unknown exits into success. The correction retains that behavior explicitly and strengthens the previously incomplete final receipt-binding/hash checks. Publication uses a flushed private temporary file followed by atomic create-only rename. A crash, missing receipt, hash mismatch, deadline receipt, live owned process or genuine cleanup failure still prevents PASS.

## Candidate and validation

New runner SHA-256:

`fc557d8360ab179d560bafef9a8861cca6f78eb7ed2fe0350b416604f27bb1d2`

New private offline evidence:

`C:\Users\sheil\.wetscan-sentinel\s04-audit-controller-diagnosis-24fae561fec74aa18ca4df52f180ac9c`

The new **candidate, not owner-approved**, manifest is `candidate-input-pins.private.json`, SHA-256 `b862f73f78378a94e0aa81c66a17be7738308a5f10eda944560a0d791f5ca1f0`: 543 existing private files plus 17 runtime source files, 560 entries. Four source pins intentionally change; the exact before/after hashes are recorded separately. The old approved 504-entry manifest remains unchanged and must reject the changed runtime. No pins are silently updated in historical evidence.

| Offline check                             | Result                                                                                               |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Typecheck / lint                          | PASS / PASS                                                                                          |
| Focused Vitest                            | 264/264 PASS, 8 files                                                                                |
| Full Vitest                               | 1014/1014 PASS, 61 files, two workers                                                                |
| Three PowerShell parsers                  | Zero errors                                                                                          |
| Actual audit default-off                  | OFFLINE_READY; zero database connections                                                             |
| Existing provisioning default-off         | OFFLINE_READY; zero database connections                                                             |
| Original manifest against changed runtime | Rejected with audit_manifest_pin                                                                     |
| Original execution input evidence         | All 544 inputs reverified; four changed source files verified against preserved original-byte copies |
| Historical approvals                      | 19 terminal: 15 CLOSED and four CLOSED_H04C_B2_READONLY_PREFLIGHT; all actions empty                 |

The first full-suite attempt used a blanket network-denial preload, which also blocked the existing lifecycle tests' ephemeral loopback HTTP fixtures and caused fixture failures/timeouts. It is preserved as `full-tests.log`. The successful full suite used a guard that still blocks all PostgreSQL drivers, DEV/TEST ports and external network access while permitting only non-database loopback HTTP fixtures; concurrency was bounded to two workers. The focused/default-off checks retained the stricter guard. An initial stale-manifest negative-check wrapper also stopped on the expected native stderr under PowerShell Stop semantics; its subsequent bounded check confirmed the intended rejection. No runtime guard or production test was weakened.

The private `verification.sanitized.json` records final network counters, workspace/private-file hashes and candidate pins. All original execution receipts remain unchanged. `offline-reconciliation.sanitized.json` separately records the snapshot PASS, closure proof, original NOT_VERIFIED controller outcome and missing historical exit-code instrumentation.

## Acceptance boundary

Existing evidence supports a separate offline reconciliation of the successful database snapshot and cleanup without another database connection. Another live audit is **not needed to diagnose or reconcile this controller defect**. The corrected controller remains offline-validated; it has not been live-accepted. If a fresh current-state audit or live validation of this new runner is required, its changed runner/dependency hashes and candidate manifest require review and a new, separate owner authorization.

Provision-and-ingest remains unexecuted and separately gated. Before it can run, the owner must review the reconciliation/current-state requirements and the actual provisioning candidate with its changed shared inputs, then separately authorize its exact one-attempt mutation budget and active-resource handoff. No infrastructure or audit authorization carries forward to provisioning.
