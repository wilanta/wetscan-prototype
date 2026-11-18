# S04 provision-and-ingest readiness after audit reconciliation

**READY for one separately authorized live DEV attempt.** This is offline readiness, not a live execution or database-current-state claim. S04 remains **IMPLEMENTED_PENDING_ACCEPTANCE**. The previous provisioning and audit grants are consumed.

## Existing evidence and actual gate

The original standalone audit's `audit-result.sanitized.json` is PASS, its temporary approval is CLOSED/actions empty, and its independent watchdog receipt is CLEANUP_COMPLETE. The original `audit-runner-finished.json` remains NOT_VERIFIED. The separate offline reconciliation explains the Windows PowerShell exit-code defect without rewriting any original receipt or inventing complete byte-level containment after-hashes. All these files remain protected inputs.

**Another standalone live audit is not required by any provisioning gate.** The actual sequence in `Invoke-H04CB2ProvisionAndIngest.ps1` is offline history/prerequisites, fresh live approvals, `Invoke-ProvisionNode 'audit-start'`, temporary APP-only Next.js, authenticated GET, `execute`, server shutdown, then `audit-end`.

`runProvisionOperation('audit-start')` validates the two new `provision-ingest` runtime approvals, exact DEV role/target and original filesystem baselines; captures a new read-only repeatable-read database snapshot; checks all four migration versions/checksums; and calls `verifyProvisionStart`. Only success creates this attempt's input manifest and phase-start snapshot. `execute` captures again and compares every phase-start row-hash multiset before writes. `audit-end` verifies exact permitted deltas and all historical row hashes. No code consults the old standalone controller receipt as a PASS prerequisite. No audit-only permission is forged, reused or substituted for provisioning authorization.

The reused verifier covers the 91 original rows, 16 jobs, eight heartbeats, Incident #1/evidence/timeline, prior contained sources and credentials, all three disabled rules including the contained revision 3, owner/project binding, schema/migrations, absent leases, unexpected sessions and orphan evidence. The approved containment pointer/version/audit delta retains its existing semantic limitation.

## Specific defects and necessary fixes

The initial provisioning runner independently hashed to `e52d2a62ebc23e0008300b34ffce8d3ca4122f78d281fbbac43ecc8531fd9505`.

Two demonstrated finalization defects required correction:

1. Its tracked child processes used the same unretained native handles and nullable `ExitCode -ne 0` check as the standalone audit. It could falsely reject the successful `audit-start` before provisioning. The existing offline 0/7 exit-code reproduction applies directly; new provisioning tests exercise its wait pattern and null rejection.
2. It published the final result before waiting for the watchdog, whose normal path returned merely because `runner-finished.json` existed. A pre-fix offline regression proved that this marker short-circuited independent closure of unusable fixture approvals. This does not claim that historical real approvals remained open: their recorded closure is preserved.

Changes are confined to:

- `scripts/Invoke-H04CB2ProvisionAndIngest.ps1`: retains tracked/Next.js/watchdog handles, records integer child exits, publishes a separate cleanup handshake, waits for and verifies watchdog completion before the final receipt, and keeps the external ten-minute bound.
- `scripts/sentinel-provision-common.ps1`: integer exit validation; atomic create-only receipts; serialized atomic closure of only the two owned runtime approval files with before/after hash evidence; idempotence preserving existing closedAt; independent process cleanup; and closure/watchdog evidence validation.
- `scripts/sentinel-provision-watchdog.ps1`: independently attempts closure and process cleanup on normal completion as well as expiry, and publishes bound cleanup evidence. A stale completion marker cannot substitute for verified closure.
- `tests/sentinel/provision-runner.test.ts`: child exits, independent closure, closure hashes, missing/stale/failed watchdog output, idempotence, contention and final-publication ordering. Only invalid/expired local fixtures are written; no live approval is created.

The Node database verifier, API sequence, CookieContainer helper, phase authorization, resource journal, preservation/delta algorithms and mutation budgets were not changed. No new acceptance phase or standalone-audit requirement was introduced.

**Current provisioning runner SHA-256:**

`2c500b073980a2fe23a872ed25f0ea62c84a9438bcea0307230e38965dc7e034`

## Inputs and compatibility

Private evidence directory:

`C:\Users\sheil\.wetscan-sentinel\s04-provision-readiness-31200c4508694deabb7fba26eb0a8b0c`

`reviewed-provision-input-pins.private.json` has **1554 entries**: 584 historical private files, 393 source/configuration files, 573 compiled Next.js server files and four build metadata files. Its SHA-256 is:

`634b191983e1102bbd1c90e195a3f2e1f4c2a7b45c20635d849920d1879e79c0`

This is a fresh review candidate; it is not an existing closed approval or an extension of a consumed grant. It covers the actual provisioning loader's 50 protected inputs. The loader independently verifies the canonical H04C-A digest/backup, pre-recovery digest `198c67e08647f12fbde99c72d01bb50b2f8d2cb4238bd88d854f89f6d550af2e`, four immutable containment pins and recovery linkage, plus migration-plan SHA `3438a56e778b30afdd6acf03600638fe31e26c55c2ae5bf63d224f909c429ae7`.

Relative to the preceding 560-entry audit candidate, exactly the three provisioning PowerShell source pins change. Their original bytes and before/after hashes are recorded in `input-pin-reconciliation.sanitized.json`. No historical private pin changed. Older manifests remain unchanged, including their stale source pins; they are not silently repinned. The previous standalone audit candidate is consequently not reusable without dependency review, but that is not a provisioning gate.

All **19 historical approvals** are terminal/actions empty: 15 CLOSED and four reviewed CLOSED_H04C_B2_READONLY_PREFLIGHT. The latest audit-only authorization remains distinct from runtime/provisioning authority. APP, migrator and owner-cookie private-file ACLs pass; credential values are not printed. Existing required compiled API routes are present. The post-build platform database change adds optional diagnostic observation without changing identity enforcement; these PowerShell corrections do not require a Next.js rebuild.

## Preserved live contract

- One phase attempt; two new runtime-only `provision-ingest` approvals; shared external UTC/monotonic ten-minute watchdog; no automatic POST retry.
- Exact `127.0.0.1:55432/wetscan_dev`, DEV marker `wetscan-s01:26b6b537-c016-4dc7-8007-4e839e8b838f`, workspace `github-user-187839747:test`, project `github-998736528`.
- APP-only temporary Next.js; migrator-only controller; no worker credentials or queue claims. Authenticated PowerShell GET still uses WebRequestSession/CookieContainer, never the broken Cookie header path.
- Phase-start and phase-end database audits, durable fsynced intent/acknowledgment/uncertainty journal, sole private bearer file and hash verification, create-only output, owner/SYSTEM ACLs and PID/start-time-scoped process cleanup.
- Maximum **10 normal INSERTs**: source 1, credential 1, rule 1, rule versions 2, detection audit 2, event 1, batch 1, queued job 1. Only the new source's bookkeeping and new rule pointer may update normally. No alerts, evaluations, incident changes or worker records are permitted.
- One distinct event/batch/job with one identical-batch replay, which must add no second event/batch/job. The new job stays queued, attempts 0, unleased; the old 16 jobs remain unchanged. Context admittedJobIds remains empty.
- On success, one source ENABLED, credential ACTIVE and rule ENABLED revision 2 remain under explicitly approved custody. Approval closure does not revoke that bearer. Subsequent use and final credential/source/rule containment require separate authorization.
- On failure, only positively acknowledged and independently scoped **new** resource IDs may be emergency-contained while time and approval remain. Source/credential revoke/disable updates and at most one new-rule r2-to-r3 disable add at most two INSERTs: **12 total maximum**. No historical resource or job is touched. Unknown/ambiguous ownership remains NOT_VERIFIED; it is never repaired by guessing IDs or widening scope.

## Offline validation

| Check                                  | Result                                            |
| -------------------------------------- | ------------------------------------------------- |
| Typecheck / lint                       | PASS / PASS                                       |
| Focused Vitest                         | 274/274 PASS, 8 files                             |
| Full Vitest                            | 1024/1024 PASS, 61 files, two workers             |
| PowerShell parsers                     | Eight files, zero errors                          |
| Actual default-off provisioning runner | OFFLINE_READY, executionPerformed=false           |
| Strict offline preload                 | Zero pg pool connect, TCP connect and fetch calls |
| Existing approvals                     | 19 terminal, actions empty                        |

The final private verification receipt records whole historical/workspace hash comparisons and all review pins. The expected failing pre-fix regression is preserved in `old-watchdog-regression.log`. An ad hoc host command was rejected by environment policy before execution; reproduction used the existing guarded Vitest temporary-fixture harness instead. Full tests use SQL doubles and permit their existing ephemeral loopback HTTP fixtures, with PostgreSQL/external access blocked. No DEV/TEST connection, server/worker startup, Docker modification, live approval, ingestion, database mutation, migration or Git publication occurred.

## Proposed one-attempt command and authorization request

The exact hash-guarded owner-side PowerShell command is saved as **`proposed-owner-command.ps1.txt`** in the private evidence directory. It is text, not an executed script. It verifies the runner SHA, manifest SHA and all 1554 review pins, selects a new output directory, invokes the real documented CLI once with both explicit handoff/emergency switches, and verifies all 584 historical private pins again in finally. The provision CLI has no static-manifest argument; its own live audit-start independently creates and enforces this attempt's manifest. The outer hash guard pins this review without bypassing or replacing that gate.

Request fresh owner authorization for **ONE** controlled DEV provision-and-ingest attempt using the runner/hash and manifest above. The grant must cover two short-lived runtime approvals, temporary APP-only Next.js, phase-specific read-only migrator audits, the reviewed denial probes, one synthetic source/credential/rule and event/batch/job with identical-batch replay, the 10/12 INSERT limits, explicit successful active-resource handoff and bounded new-ID emergency containment. Close both approvals and stop only owned processes regardless of result. No worker/sealing, later phases, historical resource mutations, migrations/resets, TEST/production or publication is included.

There is no remaining offline blocker at this review. Actual database identity/current rows, authentication, API behavior and runtime cleanup are revalidated only inside the separately authorized attempt and may still fail closed. No prior grant may be reused. STOP after readiness review; retain IMPLEMENTED_PENDING_ACCEPTANCE.
