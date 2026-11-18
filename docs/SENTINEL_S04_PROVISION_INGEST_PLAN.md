# S04 H04C-B2 provision-and-ingest: offline review and proposed execution plan

Follow-up: owner-authorized offline hardening is implemented and documented in [SENTINEL_S04_PROVISION_HARDENING.md](SENTINEL_S04_PROVISION_HARDENING.md). The review below records the pre-hardening baseline. It grants no live execution authority.

Prepared 16 November 2026, Asia/Jakarta. Overall status: **IMPLEMENTED_PENDING_ACCEPTANCE**. This document authorizes no execution.

**Review result: NOT READY FOR LIVE EXECUTION AS-IS.** The core application operations are bounded, but the current phase lacks the resource journal, phase-end preservation audit, create-only artifact handling, and guaranteed failure cleanup required for an independently authorized single phase. Preparation below is complete; live readiness depends on the explicitly listed offline hardening and a new owner authorization. No harness/application code was changed during this review.

## 1. Evidence and scope pins

| Item                                    | Required value                                                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Target                                  | `127.0.0.1:55432/wetscan_dev` only                                                                      |
| Database marker                         | `wetscan-s01:26b6b537-c016-4dc7-8007-4e839e8b838f`                                                      |
| Scope                                   | `mode=live`, workspace `github-user-187839747:test`, project `github-998736528`                         |
| Owner actor / repository                | `github-user-187839747` / `998736528`                                                                   |
| Exact origin                            | `http://localhost:3000` with callback `/api/auth/github/callback`; no implicit `127.0.0.1` substitution |
| Migration plan SHA-256                  | `3438a56e778b30afdd6acf03600638fe31e26c55c2ae5bf63d224f909c429ae7`                                      |
| Original H04C-A historical digest       | `4fba3a8a893cf25adcf5ea3902dedac650b0230d0982ca49f211e2b4033f034a`                                      |
| H04C-A backup                           | 110541 bytes; SHA-256 `67e363879f95475b5b4fae81cabe9816196d06ce84d27bee3f39dd2cfb83430e`                |
| Original pre-recovery canonical SHA-256 | `198c67e08647f12fbde99c72d01bb50b2f8d2cb4238bd88d854f89f6d550af2e`                                      |
| Contained old rule                      | `7ad1deb8-e555-44ec-be98-b7def574781d`, now DISABLED revision/version 3; no further mutation permitted  |
| Existing Incident #1                    | `8e8cc956-88cf-585f-ae59-6d47eb6996dc`; no mutation permitted                                           |

Pre-recovery directory: `C:\Users\sheil\.wetscan-sentinel\s04-h04c-b2-recovery-b3ecaac2-a04c-417f-83e9-64fcdd3cab41`.

Containment directory: `C:\Users\sheil\.wetscan-sentinel\s04-h04c-b2-contain-codex-f1862fad0fd1475d86cd39b2badba1cb`.

This review recomputed the canonical pre-recovery checksum and verified the local containment link without opening PostgreSQL: `containment.preRecoverySha256` equals the original checksum, and `containment.ruleRowBeforeHash` equals the original snapshot's hash for that exact rule. The containment artifact records ENABLED r2 -> DISABLED r3, its postcheck is PASS, and its approval is CLOSED with zero actions.

Lock these existing files by whole-file SHA-256 before any future execution:

| Containment file                   | SHA-256                                                            |
| ---------------------------------- | ------------------------------------------------------------------ |
| `containment.json`                 | `8b83c60fc15625671f44962f67f74572c4d1842ca1ad84a6c9e91f58da22c507` |
| `contain-rule-postcheck.json`      | `9b2514fdc8843bbde93053938b4cee0d29dfe0e28939e1d48638ac8e61f7d984` |
| `dev-contain-rule-approval.json`   | `e1eac3d6f911efd7b113f147845e5b2f8d6f1d123385fa194795f0f847845fc8` |
| `execution-summary.sanitized.json` | `0ae8e2bb84858eaa2d334e704fd4c270c0c38c3a9a188f7d8a83d81fe73a464c` |

The last completed containment audit is historical evidence, not a new database observation. A newly authorized read-only audit must re-establish the live starting state before writes. Do not replace the original recovery snapshot with a post-containment snapshot.

## 2. Actual implementation and approvals

The CLI dispatcher invokes [`runProvisionAndIngest`](../scripts/sentinel-dev-acceptance.ts#L836). **CLI command: `provision-and-ingest`; approval metadata phase: `provision-ingest`.** Using the CLI spelling as metadata fails the phase validator.

| Component                        | Actual requirement                                                                                                                                                                      | Proposed owner-controlled limit                                                                                                 |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| CLI prechecks and DB clock reads | `SENTINEL_H04C_B2_EXECUTION=1`; `SENTINEL_DB_APPROVAL_FILE`; migration password file; purpose `migration`, role `wetscan_migrator`; action `runtime`; metadata phase `provision-ingest` | New controller approval, runtime only, 10-minute TTL; no migration operation                                                    |
| Temporary Next.js API            | APP password file; purpose `app`, role `wetscan_app`; generic runtime approval and matching plan                                                                                        | Separate new web approval, runtime only, metadata also pinned to `provision-ingest` by the wrapper; 10-minute external deadline |
| Session/GitHub authorization     | Existing encrypted session/profile, `AUTH_SECRET`, `AUTH_DATA_DIR`, GitHub App configuration, exact origin                                                                              | Web process only; OAuth refresh and session persistence can occur during authenticated requests                                 |
| Telemetry ingestion              | New source's show-once `ws2` bearer credential, stored token hash, enabled source and binding                                                                                           | Only the new source/project; two explicitly specified valid submissions of the same one-event batch                             |
| Worker                           | Not needed; phase checks worker absence twice and never spawns one                                                                                                                      | Zero worker starts, worker password files, claim operations, worker/sealed approvals, or worker activation metadata             |

[`requireH04CB2ExecutionGate`](../tests/sentinel/dev-acceptance-safety.ts#L464) checks exact DEV target, reviewed plan, role separation, `APPROVED` status, phase equality, expiry, and opt-in. The non-worker maximum TTL is 1800000 ms (30 minutes); use 600000 ms in the proposed wrapper. Approval actions must be exactly `["runtime"]`, with no migration, integration-test, detection, incident, or worker-acceptance extensions.

Important enforcement limit: the web [`telemetryStore`](../src/features/sentinel/server/telemetry-runtime.ts#L9) uses generic `approvedDatabaseConfig`; that parser does **not** enforce `h04cB2.phase` or its expiry. The controller validator does. Therefore TTL metadata alone cannot stop web access: the owner wrapper must enforce its wall-clock deadline, close the web approval, and stop its owned server. These files are operator gates, not resource-specific PostgreSQL grants; the wrapper must enforce the narrower permitted operations.

The web process receives only APP PostgreSQL credentials; remove migration, worker, bootstrap, and TEST credential variables before spawning it, and verify effective dotenv settings do not reintroduce them. The controller receives only the distinct migration password file for read-only transactions; no APP/worker/bootstrap credential inheritance. Each connection verifies database, marker, expected role, PostgreSQL version, and non-superuser/non-bypass-RLS status through `ApprovedPool`. No ambient PostgreSQL URL is used. Never print credential paths' contents or auth records.

## 3. Exact request sequence, source, rule, and event

The current harness sends ten HTTP requests, without generic HTTP retry logic:

| Order | Request                                                                          | Required result / effect                                         |
| ----- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1     | GET owned project `/incidents`, without cookie                                   | 401, no mutation                                                 |
| 2     | GET foreign project `github-999999999999/incidents`, with cookie                 | 404, no mutation                                                 |
| 3     | POST owned `/incidents` with origin `https://evil.invalid`, random incident UUID | 403 before mutation; never targets Incident #1                   |
| 4     | GET `orderly-demo/incidents`, with cookie                                        | 404, no mutation                                                 |
| 5     | POST owned `/sources`, `action=create`                                           | Application returns 201; one source and one credential           |
| 6     | POST owned `/rules`, `action=create`                                             | Application returns 201; new DRAFT revision/version 1            |
| 7     | POST owned `/rules`, `action=enable`, expectedRevision from creation             | 200; new rule ENABLED revision/version 2                         |
| 8     | POST `/api/sentinel/ingest`, deliberately invalid bearer, body `{}`              | 401; malformed credential rejected before constructing a DB pool |
| 9     | POST `/api/sentinel/ingest`, new valid bearer, Batch 1                           | 202; one unique event, one batch, one queued job                 |
| 10    | Repeat exactly the same Batch 1 and bearer                                       | 200 duplicate batch receipt; no additional event/batch/job       |

The negative boundary probes are built into this phase; they are not the separate `negative-matrix` phase. Management base path is `/api/sentinel/projects/github-998736528`. There is no external attack target: the event describes a synthetic GET/403 observation and is sent to the local ingestion endpoint.

Source definition: `H04C-B2 Controlled Probe`, `environment=local`, `origin=controlled_test`, `retentionDays=7`, `rateLimit=1000`, `ownedApplicationConfirmed=true`. It is created enabled, revision 1, with exactly one active credential. The rate limit is API configuration, not authorization to send 1000 events. The credential contains scoped routing hints plus a random 32-byte secret; only its SHA-256 is persisted in PostgreSQL. Authorization checks its stored hash and unrevoked status. Source UUID and credential UUID are freshly generated server-side; no rotation or old source reuse occurs.

Rule: `H04C-B2 Controlled 403 Rule`, category `http`, severity `high`, confidence 95, kind `http.request`, conditions method GET and statusCode 403, correlation `source`, threshold 1, **windowSeconds=600**, cooldownSeconds 0, empty suppression windows. A stale source comment says one-second window; executable definition is 600 seconds. The creation/enable responses need stricter wrapper checks than the current revision fallbacks: require exactly revision 1, then ENABLED revision 2, and the exact fresh rule ID.

Only **one distinct event** is ingested in this phase, with random batch/event UUIDs, host-generated occurredAt/sentAt, `severityHint=low`, GET, status 403, durationMs 14, and deliberate redaction canaries. The high severity belongs to the rule, not this event. This same-batch replay is distinct from the later `ingest-duplicate` phase, which creates another event and another job. No automatic retry after a failed or timed-out POST is authorized.

Expected persisted event: route `/api/v1/users/:redacted`, query removed, actorHash omitted, reasonCode `redacted`, durationMs 14 retained, client `controlled` flag discarded; trusted provenance comes from the source. The batch receipt replay has top-level `duplicate=true`; its stored per-event receipt can still have `duplicate=false` from the initial receipt. Check IDs and database counts, not a false assumption that the nested receipt flag changes.

The harness captures `preIngestAt` from PostgreSQL `clock_timestamp()` minus 500 ms immediately before ingestion. Event validation permits at most 5 minutes in the past and 30 seconds in the future relative to DB time. Future execution must reject unacceptable clock drift.

## 4. Exact normal mutation budget

These bounds are a proposed authorization limit for one successful run, derived from the actual stores, not limits enforced by the phase approval file itself. Require a new output directory and a single invocation; re-running the phase would create additional resources because source/rule creation is not idempotent.

| Table                                                                    | Maximum new rows | Permitted updates                                                                                            |
| ------------------------------------------------------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------ |
| `sentinel.telemetry_sources`                                             | 1                | Only that new row: two rate-window/usage updates and one contact/ingest timestamp update; revision remains 1 |
| `sentinel.telemetry_credentials`                                         | 1                | None on normal success; credential remains active                                                            |
| `sentinel.detection_rules`                                               | 1                | Only that new row: one current_version/updated_at update from 1 to 2                                         |
| `sentinel.detection_rule_versions`                                       | 2                | None: DRAFT v1, ENABLED v2, same new rule                                                                    |
| `sentinel.detection_audit`                                               | 2                | None: create v1, enable v2, expected owner actor                                                             |
| `sentinel.telemetry_events`                                              | 1                | None                                                                                                         |
| `sentinel.telemetry_batches`                                             | 1                | None                                                                                                         |
| `platform.jobs`                                                          | 1                | None: queued, revision 1, attempts 0, maxAttempts 5, fence 0, no lease/cancellation                          |
| Every other existing table, including project binding and all S04 tables | 0                | 0                                                                                                            |

Total: **10 inserts across 8 tables**, up to 3 UPDATE statements on the new source and 1 on the new rule; zero deletes and zero changes to any pre-existing row. The duplicate replay consumes rate budget because rate accounting occurs before batch deduplication. New source `rate_used` is normally 2, or 1 if the two requests cross a minute boundary; it must never exceed 2 for these requests. No second contact timestamp update occurs on the duplicate path.

[`bindProject`](../src/features/sentinel/storage/projects.ts#L7) can re-enable/change an existing project binding during source creation. Therefore the future precheck must require the existing binding already enabled and owned by the exact actor/repository, and verify its row hash stays unchanged. Do not authorize an incidental binding repair.

Expected job: module `sentinel`, kind `sentinel.telemetry.accepted`, subjectRef exactly `<newSourceId>/<newEventId>`, idempotencyKey `telemetry:<newSourceId>:<newEventId>`. No queue claims, attempts, worker heartbeats, notifications, detection evaluations/alerts/evidence/cooldowns, incidents, or timeline records are created in this phase. Telemetry evidence is the sanitized event row; detection and incident evidence remain unchanged.

From the recorded baseline, expected job inventory after success is 17 total: 8 untouched historical queued + 6 historical non-queued + 2 prior acceptance jobs + 1 new queued job. Queued total becomes 9. This is a future expectation, not a fresh DB observation.

Later, separately approved `seal-worker` discovers candidates using the new source and cutoff, excluding historical queued, historical non-queued, and prior-attempt IDs. It permits 1..12 candidates generally; this phase's contract permits **exactly one**, so do not widen the owner limit to 12. Sealing validates source, target, kind, IDs, TTL and protected-set disjointness. The later worker constrains SQL with `job_id=ANY(approved IDs)` and pauses maintenance. **Do not run sealing or a worker here.** Current `run-context.json` deliberately has `admittedJobIds: []` at this stage; record the observed new job in a separate audit artifact without issuing worker authority.

Expected downstream outcome only after separately approved isolated processing: one new matching high-severity alert, detection evidence for the new event, one new incident, its alert/evidence links, and initial `alert_created`/`incident_opened` timeline. Those outcomes are not acceptance evidence for this phase, and Incident #1 must remain unchanged. Evaluation records for existing disabled rules may also be written by the later worker; they are outside this phase's zero-evaluation budget.

## 5. Preservation and exact evidence linkage

Current implementation does validate canonical pre-recovery integrity, requires a recovery snapshot when partial S04/prior jobs exist, requires all old sources disabled with zero credentials, requires all old rules disabled, and requires containment's checksum to match the original snapshot when it records an enabled old rule. It captures old source/rule/job/incident IDs for later phases. It does **not** call `verifyHistoricalMultisetPreserved` at the start or end of provisioning, compare exact post-containment row hashes, or persist a phase-end DB audit.

Required new phase-specific read-only precheck and postcheck, under the future authorization:

1. Validate target/role/marker, four migration checksums, table/index readiness, all prior approvals CLOSED/actions empty, no conflicting process, and intact artifact hashes. Recompute H04C-A and H04C-B2 checksums and backup hash. Check the four containment file hashes above, exact rule/status/revision/old-row hash, PASS postcheck, closed containment approval, and exact scope in its summary.
2. Compare the live pre-state against the original recovery snapshot allowing **only** completed containment: old rule r2->r3, one corresponding DISABLED v3 and disable audit. Require exact zero changes elsewhere. Require the 91 H04C-A rows as an immutable multiset subset, all 16 old jobs byte-identical, all old heartbeat/S04 rows byte-identical, all 3 old sources disabled/zero credentials, all 3 old rules disabled, and old target revision 3 exactly. Capture this newly validated post-containment state as a **new** phase-start snapshot; never rewrite original baseline files.
3. After the phase, compare every old row/hash against that phase-start snapshot; allow only the 10-insert/new-row-update budget above, attributed to the exact newly observed IDs. This makes the expected unchanged-table count **17 of 25**, rather than containment's 22: eight tables gain new rows here. Existing rows in those eight must still be byte-identical. Confirm every S04 table and Incident #1/evidence unchanged, and 8 historical heartbeat rows unchanged.
4. Explicitly identify the one new queued job by exact source/event/subjectRef/idempotency key, scope, kind, creation cutoff and disjoint ID sets. Check all 8 protected jobs and both previous acceptance jobs field-for-field; do not use `admittedJobIds: []` with the old global job verifier and expect it to admit the new row. A phase-specific observed-job allowlist is needed for audit only, not claims.
5. Verify all HTTP receipts and statuses, exact new source/credential/rule scope, sanitized event/receipt, initial/duplicate row-count behavior, and zero extra alerts/evidence/incidents/attempts/outbox rows. Report only redaction booleans and counts. Do not dump event payloads or raw context to the console.
6. Close the APP pool by stopping the owned Next.js tree before the final comprehensive read-only snapshot, so expected unexpected runtime sessions can be exactly zero. Close all audit clients/pools, approvals and role variables in independent finally paths. Recheck port/PIDs and old artifact hashes. Do not call another CLI phase to perform these checks.

## 6. Artifacts, authentication, and lifecycle gaps

Current phase writes only `h04c-b2-ingest-credential.secret` after source creation and `run-context.json` at the very end. Both use overwrite-capable writes. `run-context.json` is sensitive: **`canaryValues` contains the actual bearer credential**, in addition to the credential file. Its console PASS reports IDs, not the secret. It creates no resource journal, phase audit, approval closure, server startup/shutdown, or automatic cleanup. Current `assertSafeDevArtifactDir` rejects paths inside this checkout but does not reject every other OneDrive path; POSIX mode/chmod alone does not establish a private Windows ACL.

Required future wrapper artifacts in a fresh directory outside Git and OneDrive, with protected current-user/SYSTEM ACL and exclusive-create checks:

- `input-manifest.sanitized.json`: code/artifact hashes, target/scope, TTL/bounds, owner authorization reference.
- Two new runtime approvals, never copies/reactivations of the closed containment approvals; each closed to `CLOSED`, `actions: []`, with metadata retained.
- New phase-start and phase-end state/delta snapshots; private row hashes plus a sanitized verification result.
- Private append-only resource/operation journal written immediately after each returned resource ID and before subsequent writes; includes failure/uncertain outcomes. Generate batch/event UUIDs and journal them before sending.
- `h04c-b2-ingest-credential.secret` and `run-context.json`, treated as equally sensitive while the current context format retains the credential. Do not print either, even as purported sanitized JSON. A hardened format should reference the credential file instead of duplicating its value.
- Private owned-process startup log/PID tree, private CLI/error logs, sanitized HTTP status/receipt summary, cleanup/closure report, and final output manifest.

PowerShell management GETs must use [`sentinel-session-get.ps1`](../scripts/sentinel-session-get.ps1), which sends CookieContainer cookies, rejects nonlocal targets and redirects, and never prints the cookie. Require a positive authenticated owned-project GET with exact identity before any provisioning mutation; the contained old rule must be DISABLED r3, not the previous runner's ENABLED r2 expectation. **Do not rerun the containment runner.** The Node CLI uses `fetch` with an explicit Cookie header and manual redirects; the PowerShell header omission does not apply to that path. Owner-origin POSTs require exact Origin and content type; ingestion uses the new bearer rather than the owner's session cookie. GitHub/current repository access is checked on management requests and can fail or refresh independently of local session validity.

### Success handoff and revocation

The actual successful phase leaves **one new source enabled, one new credential active, and one new rule ENABLED r2** for subsequent duplicate ingestion and worker acceptance. All prior sources/credentials/rules remain contained. Closing web/controller approvals and stopping Next.js prevents that server from accepting more requests, but does not revoke the bearer: credentials have no automatic expiry in this schema. The owner must explicitly approve this private active-credential handoff before this normal contract is used. No worker is needed to retain that handoff.

Do not silently revoke on success: unchanged later `ingest-duplicate` reads this credential, and revocation would break that contract. If the owner requires zero active credentials at every stop, revise the plan offline to include an explicitly authorized new-source re-enable/credential-rotation path and altered subsequent artifacts; do not add those writes dynamically.

### Failure or ambiguous mutation

Multi-request provisioning is not one database transaction. Source creation, rule creation, enabling, and ingestion commit independently. A lost response can leave a committed resource without an ID in the current late-written context. Stop normal execution on the first failure, never replay resource-creation/enable/ingest POSTs automatically, and record whether a write may have committed. The planned identical-batch submission is an explicit idempotency probe, not an automatic failure retry.

Propose separate, pre-authorized emergency containment limited to this attempt's **positively identified new IDs**: revoke its one credential, disable its one source, and disable its new rule only if it is confirmed ENABLED r2 using expectedRevision 2. No global source/project disable, no deletion/cancellation/requeue of any job, no historical rule mutation, and no old Incident #1 action. Do not invoke existing whole-run `cleanup` or `postflight`, whose phase gates and end-of-sequence assumptions do not match this stop point.

Emergency maximum beyond the normal budget: zero additional sources/credentials/events/batches/jobs; at most one credential revoked_at update, two source revision updates (revoke then disable, ending revision 3 if both occur), one new-rule pointer update, one DISABLED v3 insert and one disable audit insert. Thus at most **12 inserted rows overall**, with partial prefixes possible. Preserve partial events/jobs unprocessed. If IDs/state cannot be proven, do not guess or widen mutation scope: close approvals and stop the owned server, retain the secret securely, and report containment NOT_VERIFIED for new owner instructions. Cleanup failure does not justify another provisioning attempt. Do not claim credential clearing until every new secret-bearing artifact, including context/journal, is handled; old recovery artifacts remain immutable.

## 7. Owner-side PowerShell execution plan (not executed)

No safe provision-specific orchestration runner currently exists in the inspected private directory. The containment runner must not be adapted by merely changing its CLI phase. Before a live command is offered, prepare and test the offline hardening above, including timeout/partial-commit/cleanup fixtures, then present that new runner's hash and default-off execution interface for owner review.

The future owner runner should perform this sequence:

1. Resolve the exact checkout, reviewed code/build, origin and distinct credential files; reject placeholders, symlink/path escape, OneDrive, inherited role pollution, existing output files, open old approvals, or process/port conflicts. Create a fresh `s04-h04c-b2-provision-<new-guid>` directory with protected ACL. Preserve all earlier directories unchanged.
2. Validate immutable input hashes, offline plan, session/cookie format and origin metadata without printing secrets. After the separate live grant, exclusively create the two bounded runtime approvals. The controller uses `provision-ingest` metadata and a single fresh run ID; web metadata is checked by the wrapper too.
3. Under controller migration credentials, perform the read-only phase-start audit in section 5 before starting Next.js. Reject any drift. Capture a new post-containment snapshot and exact existing binding/IDs. No migration is performed.
4. Spawn `node node_modules\next\dist\bin\next start -H localhost -p 3000` with `Start-Process -WindowStyle Hidden`, APP credentials only, private stdout/stderr, and a recorded owned process tree. Poll bounded server readiness without retrying mutations. Perform the positive authenticated GET via CookieContainer. Require no worker throughout.
5. Invoke the CLI below exactly once with explicit old baseline and separate containment paths; never rely on defaults within the new directory. The future hardened harness/wrapper must journal resources, enforce receipt schema/new-ID bounds, and preserve progress when errors occur.
6. Run phase-specific read-only mutation/preservation checks; apply only explicitly pre-authorized emergency containment on failure. Stop the owned server, then perform final read-only session/preservation checks with no active app connections. Close pools, close both approvals, clear credentials/environment and verify artifacts/PIDs in independent finally paths.
7. Write sanitized PASS/FAIL/NOT_VERIFIED evidence and stop. Do not seal, claim, process, perform duplicate-event ingestion, or run any later CLI phase.

The following documents exact current CLI arguments; the leading `throw` is intentional because the required wrapper/hardening and live authorization are pending. It creates no approvals and is **not a ready-to-run live script**:

```powershell
throw 'PLAN ONLY: provision wrapper hardening, reviewed hash, and separate live authorization are required.'

$repoRoot = 'C:\Users\sheil\OneDrive\Dokumen\Wildhan\projects\wetscan-prototype'
$preRecovery = 'C:\Users\sheil\.wetscan-sentinel\s04-h04c-b2-recovery-b3ecaac2-a04c-417f-83e9-64fcdd3cab41\pre-recovery-baseline.json'
$containment = 'C:\Users\sheil\.wetscan-sentinel\s04-h04c-b2-contain-codex-f1862fad0fd1475d86cd39b2badba1cb\containment.json'
$cookieFile = 'C:\Users\sheil\.wetscan-sentinel\s01-20261114\secrets\owner-session.cookie'
# $freshPrivateOutput, $controllerApproval and $migrationPasswordFile are
# resolved and verified by the future owner-reviewed wrapper, never guessed.
Set-Location -LiteralPath $repoRoot
$env:SENTINEL_DB_HOST = '127.0.0.1'
$env:SENTINEL_DB_PORT = '55432'
$env:SENTINEL_DB_NAME = 'wetscan_dev'
$env:SENTINEL_DB_MARKER = 'wetscan-s01:26b6b537-c016-4dc7-8007-4e839e8b838f'
$env:SENTINEL_DB_APPROVAL_FILE = $controllerApproval
$env:SENTINEL_DB_MIGRATION_PASSWORD_FILE = $migrationPasswordFile
$env:SENTINEL_H04C_B2_EXECUTION = '1'
# APP/WORKER/BOOTSTRAP/TEST credential variables absent in this CLI process.
& node --import tsx scripts/sentinel-dev-acceptance.ts provision-and-ingest `
  "--artifact-dir=$freshPrivateOutput" `
  "--pre-recovery=$preRecovery" `
  "--containment=$containment" `
  "--cookie-file=$cookieFile" `
  '--origin=http://localhost:3000'
# Check exit code; finally cleanup/closure is mandatory, not supplied by this CLI.
```

## 8. Sanitized verification checklist and blockers

- [ ] Actual live target, marker, roles, scope, exact source/rule/binding IDs, four migrations, original backup and linked containment evidence verified before writes.
- [ ] Zero worker/process conflicts; every old approval CLOSED/actions empty; new output exclusive/private; fresh role-separated approvals with external deadline.
- [ ] H04C-A 91-row subset and original recovery rows preserved with only the previously completed containment exception; phase-start snapshot contains 16 unchanged old jobs and Incident #1.
- [ ] Positive CookieContainer GET passes; built-in denial statuses are 401/404/403/404 and invalid-bearer 401; denied requests cause no database mutation.
- [ ] Exactly one source/credential and new DRAFT v1 -> ENABLED v2 rule, correct actor/definition; only one unique event/batch/job; replay status/receipt deduplication confirmed.
- [ ] Job remains queued/attempts 0; all old jobs byte-identical, especially exhausted job `0610c6d6-fd47-43fd-9685-0c409a51f135` and completed job `76b672a8-5496-4f42-9c14-dd5b0172abab`. No worker admission/sealing performed.
- [ ] Exactly permitted table deltas; all S04 rows/evidence, old rules/sources/credentials/binding, heartbeats, attempts/outbox and other old rows unchanged; zero leases/orphans; canaries and bearer absent from persisted database text.
- [ ] Only the new source/credential/rule remains active on explicitly approved normal handoff, or precisely documented new-ID emergency containment applied. No historical resource touched.
- [ ] Owned Next.js/PIDs stopped, port free, unexpected DB sessions zero, both new approvals CLOSED/actions empty, private secret custody documented, old artifact hashes unchanged.

Blocking offline work: provision-specific guarded runner; mandatory exact containment/provenance and live baseline comparison; early resource/ambiguity journal; create-only paths and Windows ACL; strict response/revision checks; exact one-job/10-row phase audit; deadline enforcement on the web process; new-ID failure containment; secret-aware handoff/cleanup; and offline regression coverage. Existing tests cover general phase gating, containment and isolated worker controls, but no direct `runProvisionAndIngest` orchestration/failure test was found. No claim is made that these missing controls already exist.

## 9. Precise separate authorization requests

**Next request: offline hardening only.** Authorize additive preparation of a default-off provision wrapper, minimal harness/safety fixes for the blockers above, and synthetic/mocked regression tests. Preserve existing implementation and all private historical artifacts. No PostgreSQL, HTTP against DEV, Next.js startup, workers, approvals, Git publication, or live mutation. Return the resulting runner/hash, tests and final mutation bounds for review before asking to execute.

**Draft subsequent live request, conditional on that hardening passing:** authorize ONE bounded DEV `provision-and-ingest` attempt at the exact target/scope in section 1; two fresh runtime-only approvals with metadata `provision-ingest`, TTL <=10 minutes; temporary APP-only Next.js and read-only migrator audits; the ten reviewed HTTP requests including one identical-batch replay; at most 1 new source, 1 credential, 1 rule, 2 versions, 2 audit rows, 1 sanitized event, 1 batch and 1 queued job (10 inserts), with updates only to the new source/rule; and the bounded, positively identified new-ID emergency containment in section 6 (at most 12 inserts overall). Explicitly approve or reject the active new-credential/source/rule handoff on normal success. Include owned-process teardown, read-only preservation audits and CLOSED/actions-empty approvals regardless of outcome. Exclude workers/sealing/claims, later duplicate-event ingestion, Incident #1 changes, historical job writes, other phases, migrations/resets, TEST/production, and Git publication. Stop after the first failed or uncertain operation except the pre-authorized cleanup; no renewed attempt without renewed owner consent.

Neither request is granted by this planning task. Current work stops at review preparation.

## 10. Validation performed in this planning turn

PASS: source/validator/store/queue/role/grant/worker-isolation/cleanup review; local containment checksum linkage and CLOSED approval evidence; `node --import tsx scripts/sentinel-dev-acceptance.ts plan` with `databaseConnections: 0` and unchanged reviewed plan. No live state was refreshed. No DEV/TEST connection, Next.js/worker startup, live approval, ingestion, migration, or Git publication occurred. Existing harness, app, worker and migration files were left unchanged; this new document is the only intended workspace edit.
