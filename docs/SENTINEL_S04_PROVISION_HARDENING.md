# S04 provision-and-ingest offline hardening

Latest review: [provision readiness after audit reconciliation](SENTINEL_S04_PROVISION_READINESS.md) supersedes the historical hashes and readiness notes below. The nine stale approvals were separately closed; the current inventory has 19 terminal approvals with empty actions. The latest review also corrects demonstrated Windows PowerShell process-exit and watchdog finalization defects. Earlier implementation details below are retained as historical context; no live grant is carried forward.

16 November 2026, Asia/Jakarta. **OFFLINE_HARDENED_PENDING_LIVE_AUTHORIZATION**. S04 remains **IMPLEMENTED_PENDING_ACCEPTANCE**.

This implements the owner-authorized offline follow-up to [the provisioning review](SENTINEL_S04_PROVISION_INGEST_PLAN.md). No DEV/TEST PostgreSQL connection, live approval, Next.js/worker startup, ingestion, emergency containment, migration, or Git publication was performed. Temporary-file tests use synthetic data and invalid fixture approvals; the CookieContainer tests use an isolated loopback fixture, not WetScan DEV.

## Changes

| File                                          | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/Invoke-H04CB2ProvisionAndIngest.ps1` | New provision-specific owner runner. Default exits after read-only offline prerequisites. Live requires `-ExecuteLive`, an owner authorization reference, exact scope token, and explicit active-handoff/emergency-containment switches. Separate fresh APP/controller approvals, role-separated processes, CookieContainer management GET, owned-PID/start-time tracking, independently attempted closure and process cleanup, sanitized final report. |
| `scripts/sentinel-provision-watchdog.ps1`     | Separate process enforcing the common 10-minute UTC deadline and a monotonic elapsed-time cap. It closes both approvals and stops only recorded owned processes even if the controller stalls. Main runner refuses an unavailable watchdog.                                                                                                                                                                                                             |
| `scripts/sentinel-provision-common.ps1`       | Protected owner/SYSTEM ACL creation, directory/file ACL validation, exclusive-create writes, OneDrive/repository/reparse rejection, independent approval closure, and process creation-time checks against PID reuse.                                                                                                                                                                                                                                   |
| `scripts/sentinel-provision-private.ps1`      | Small ACL-check/create entrypoint used by Node and fixture tests.                                                                                                                                                                                                                                                                                                                                                                                       |
| `scripts/sentinel-provision-owner.ts`         | Offline checksum/session/origin/process/credential checks; gated live adapters; full start/end read-only snapshots; create-only evidence, durable resource journal, private secret storage, exact input hash preservation, emergency/failure audits and sanitized handoff evidence. Native Node ESM import is covered.                                                                                                                                  |
| `scripts/sentinel-provision-safety.ts`        | Dependency-injected orchestrator, strict HTTP status/schema/ID/revision checks, paired 10-minute runtime-only approval validation, exact old-row hash preservation, new-row ID/scope attribution, 10/12-insert budgets, deadline/worker guards, one-event replay audit and bounded emergency containment.                                                                                                                                               |
| `scripts/sentinel-dev-acceptance.ts`          | Routes only `provision-and-ingest` to the hardened adapter. Adds optional raw-row/hash pairing within the existing read-only snapshot and database-name session attribution. Context canary checks load the bearer from its single secret file instead of duplicating it in context, retaining a generic bearer-pattern check after credential clearing. Other phase dispatch and worker implementation are retained.                                   |
| `tests/sentinel/provision-fixtures.ts`        | In-memory application/state fixture; no database/socket/worker.                                                                                                                                                                                                                                                                                                                                                                                         |
| `tests/sentinel/provision-hardening.test.ts`  | Mutation attribution, exact one-job budget, replay idempotency, response loss/partial commits, incorrect revisions/receipts, unknown IDs, old-row drift, forbidden downstream records, worker appearance, expiry, role/phase approval restrictions and bounded emergency recovery.                                                                                                                                                                      |
| `tests/sentinel/provision-runner.test.ts`     | Native ESM smoke test; real Windows ACL/exclusive-create primitives using temporary invalid fixtures; default-off runner with mocked offline diagnostic; deadline-sidecar closure and cleanup-failure independence; PID reuse refusal.                                                                                                                                                                                                                  |

Existing application authentication, Canvas/Guard/Demo Mode, worker code, SQL migrations and all private historical recovery artifacts were left untouched by this hardening work. The original uncommitted S04 changes remain in the working tree.

## Default-off command

Runner SHA-256: `e4b6713c8577c759b879564bb879beb70f4db85e9e7eb51504dab36ae076794f`.

From any Windows PowerShell directory:

```powershell
powershell.exe -NoProfile -NonInteractive -File "C:\Users\sheil\OneDrive\Dokumen\Wildhan\projects\wetscan-prototype\scripts\Invoke-H04CB2ProvisionAndIngest.ps1"
```

Default mode reads and verifies the original H04C-A digest/backup, canonical H04C-B2 recovery digest, four pinned containment files, closed prior containment/provision approvals, existing encrypted session/profile and origin metadata, distinct credential files, required build, and port/process availability. It performs no database or provider request, creates no directory/approval/output, and starts no Next.js/worker/watchdog. It never calls private `getSession`, which could delete expired records.

Observed result: `OFFLINE_READY`, `databaseConnections: 0`, `executionPerformed: false`. `CLI=provision-and-ingest` and approval `phase=provision-ingest` remain distinct.

## State verification and mutation limits

Start audit revalidates actual database identity/role, migration checksums and schema readiness, no leases/orphans/unexpected sessions, the 91-row original multiset, all 16 old jobs, 8 heartbeats, existing Incident #1 and its evidence, exact prior source/rule containment and the existing enabled owner binding. It permits only the previously approved r2->r3 containment exception relative to the original recovery snapshot. The old contained rule's scope, column shape, revision, seed state and timestamp range are constrained; original version/audit hashes are retained, with exactly the authorized v3 disable/version additions. It writes a new phase-start snapshot rather than replacing any old artifact.

Every later audit requires **all phase-start row hashes still present, including old rows in tables receiving new records**. New rows must fit exact scope/IDs, definitions, revisions, statuses, receipts and job identity. Aggregate row counts alone are insufficient. Unexpected detection evaluations, alerts, outbox/attempt/heartbeat rows, incidents and all S04 evidence changes fail the audit.

| Table                              | Normal new rows | Emergency maximum new rows |
| ---------------------------------- | --------------- | -------------------------- |
| `sentinel.telemetry_sources`       | 1               | 1                          |
| `sentinel.telemetry_credentials`   | 1               | 1                          |
| `sentinel.detection_rules`         | 1               | 1                          |
| `sentinel.detection_rule_versions` | 2               | 3                          |
| `sentinel.detection_audit`         | 2               | 3                          |
| `sentinel.telemetry_events`        | 1               | 1                          |
| `sentinel.telemetry_batches`       | 1               | 1                          |
| `platform.jobs`                    | 1               | 1                          |
| **Total**                          | **10**          | **12**                     |

Normal updates are confined to the new source's rate/contact fields and the new rule's r1->r2 pointer. The two valid ingestion submissions are the same one-event batch; the second is the explicit idempotency probe, never a retry after failure. The job remains queued, attempts 0, revision 1, maxAttempts 5, fence 0 and unleased, with exact source/event subject and idempotency key. Expected inventory is 17 jobs, including the 16 untouched old jobs. No job is admitted to a worker: context `admittedJobIds` stays empty.

Emergency adds only revoke/disable changes to the positively identified new source/credential and, if still ENABLED r2, one new-rule disable with expectedRevision 2 (new v3/version audit). It never retries POSTs, guesses IDs from names or unexpected deltas, touches old resources, cancels jobs, or exceeds 12 inserts. It preserves failed or unprocessed new telemetry/jobs as evidence. Unknown/lost creation responses produce durable intent/uncertain records and a private observed-state snapshot; if ownership/state cannot be established, containment remains **NOT_VERIFIED**, approvals close and the owned server stops. No automatic second attempt follows.

## Secret, journal and handoff contract

- Ambient APP/MIGRATION/WORKER/BOOTSTRAP/TEST credential variables from the shell or dotenv are rejected by default; live role-specific processes receive only their explicitly resolved credential. PowerShell approval timestamps use the exact three-digit UTC format accepted by the phase validator.

- The resource journal is exclusively created and fsynced after each intent, status response, acknowledged ID and uncertain outcome. Source/credential IDs are acknowledged before secret storage or another request; rule ID is acknowledged before enablement; batch/event IDs are allocated and journaled before ingestion. No bodies, cookies, canary strings or bearer values are journaled.
- The bearer exists on disk only in `h04c-b2-ingest-credential.secret`, under a genuinely restricted Windows ACL; its integrity is checked again at final audit. `run-context.json` contains only the fixed secret-file reference, never the credential value. Database snapshots contain stored token hashes, not the bearer. Downstream canary checks read the protected secret when needed without adding it back to context.
- Normal success intentionally leaves the new source enabled, one credential active, and the new rule ENABLED r2. This is required by the later duplicate-event ingestion/acceptance sequence. The source credential has no automatic expiry; it is **not** revoked by approval closure. The future owner grant must explicitly approve this active-resource custody.
- `active-handoff.sanitized.json` records the proposed active state pending audit; `provision-audit.sanitized.json` PASS and `runner-finished.json` PASS/activeHandoff=true complete the handoff. Next.js is then stopped and both runtime approvals are CLOSED/actions empty. All further API use, sealing, worker execution and later phases require new authorization. Eventual separately approved final cleanup revokes the new credential and disables the new source/rule; no historical resource is included.
- Main and sidecar deadline checks prevent subsequent requests at expiry. If time is exhausted, approval closure/process teardown takes priority; expired or uncertain cleanup is reported NOT_VERIFIED rather than bypassing the gate. Cleanup failure cannot suppress the independent approval-closure attempts.

New live outputs, only after separate authorization, are a protected fresh `s04-h04c-b2-provision-<guid>` directory outside Git/OneDrive. Evidence includes an input hash manifest, phase-start/end private snapshots, append-only resource journal, sole credential file, context, sanitized normal/emergency audits, active-handoff record, owned-process records, private operation logs and final approval/runner reports. Existing output paths are rejected; old recovery/containment files are read-only inputs.

## Validation and limitations

| Check                                                                               | Result                                               |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `pnpm.cmd typecheck`                                                                | PASS                                                 |
| `pnpm.cmd lint`                                                                     | PASS                                                 |
| Focused provisioning + acceptance-safety + CookieContainer suites, `--maxWorkers=2` | 97/97 PASS, 4 files                                  |
| Full Vitest, `--maxWorkers=2`                                                       | 842/842 PASS, 57 files                               |
| Offline acceptance plan                                                             | PASS; zero database connections, unchanged plan hash |
| Default owner runner                                                                | OFFLINE_READY; zero database connections/execution   |
| Four PowerShell parsers                                                             | Zero errors                                          |
| Existing 19-file private artifact/runner/helper snapshot                            | All unchanged                                        |
| Git whitespace check                                                                | PASS                                                 |

Early test runs exposed fixture-clock/JSON-field-order assumptions, a native CJS/ESM import mismatch, and PowerShell timer-overload/timestamp-precision issues; those were corrected and covered before the passing runs above. No live success is inferred from these tests. Live database/API semantics, real application process teardown and live emergency containment remain **NOT RUN** under this offline-only grant. A future mismatch or ambiguous commit may leave new resources awaiting separate recovery instructions; that is intentionally reported NOT_VERIFIED. This is Windows PowerShell 5.1 tooling; Windows-specific tests are skipped elsewhere.

## Draft authorization for the next turn

Authorize **ONE** live DEV `provision-and-ingest` attempt using the reviewed runner and its recorded SHA-256, only against `127.0.0.1:55432/wetscan_dev`, marker `wetscan-s01:26b6b537-c016-4dc7-8007-4e839e8b838f`, workspace `github-user-187839747:test`, project `github-998736528`. Permit two new runtime-only approvals with phase `provision-ingest`, a shared external 10-minute limit, temporary APP-only Next.js, read-only migrator audits, the reviewed denial probes, one new source/credential/rule and one unique event/batch/queued job with one explicit identical-batch replay. Bound normal writes to 10 inserts and updates solely to the new source/rule. Explicitly permit the described active-resource handoff on success and bounded, positively identified new-resource emergency containment up to 12 total inserts on failure. Close approvals and stop only owned processes regardless of outcome; report any uncertain mutation. No second attempt, historical job/Incident #1 mutation, workers/sealing, later phases, TEST/production, migrations/resets, or Git publication. Stop after this phase and retain IMPLEMENTED_PENDING_ACCEPTANCE.

That authorization is a draft, not granted by the offline hardening request. Future live opt-in must supply `-ExecuteLive`, `-OwnerAuthorization`, `-ConfirmScope 'github-998736528:1source:1rule:1event:1job'`, `-ApproveActiveHandoff`, `-ApproveEmergencyContainment`, and a fresh `-OutputDir`. None was used during this work.
