# H01 PostgreSQL and worker acceptance history

**Finalization authorization, 14 November 2026:** the owner explicitly approved final review, commit, push and a PR to `master`. The local acceptance records below are preserved evidence, not new executions in this publication phase. No database/worker actions are authorized by this finalization task; no acceptance suite or lifecycle retest is rerun, and the worker remains stopped. Fresh post-commit static/unit/build/browser validation is reported with the exact commit in the PR. Earlier phase-specific no-commit/no-PR restrictions below describe those historical tasks and have been superseded only for publication, not for merge/deploy/S02.

## Latest result: shutdown fix and bounded lifecycle retest PASS

14 November 2026 (Asia/Jakarta). Source: the owner's explicit **S01 Worker Shutdown Fix & Lifecycle Retest** pasted request (attachment `20d6005c-314d-45d1-b19f-cd93176c2647/Pasted text.txt`). This authorized a narrow lifecycle investigation/fix, regression tests and **one** bounded idle startup/shutdown/restart/shutdown retest, followed by final validation if it passed. It authorized no migrations, reprovisioning, events, scanners, providers, commit, PR or S02. **The real retest passed, exit 0, in 21,980 ms. Both workers are stopped.** Previous failures and acceptance records are preserved below.

### Confirmed cause and limits of the diagnosis

Three database-free, self-expiring 20-second probes installed SIGINT/SIGTERM/SIGBREAK listeners: bare Node (`PID 21736`), Node with `--import tsx` (`7824`), and an offline npm shell call running Node with `tsx` (`15636`). All reported TTY input/output. The tool's PTY Ctrl+C request generated **no signal callback** in any probe; each reached its own deadline and exited 1. Bare Node did receive ordinary input bytes `[120,13,10]`. Thus the failed terminal request is reproducible without the worker, database, npm wrapper or loader: **this Windows tool/PTY path does not reliably deliver Ctrl+C as SIGINT**. The specific Windows terminal internals are not established; the prior separate Console CTRL_C_EVENT attempt is not evidence that a worker handler ran.

No evidence implicated a stuck PostgreSQL operation, pool, handler or HTTP request in the original idle failure. However, inspection also found lifecycle hardening gaps: no SIGBREAK listener, no received-signal diagnostics, no bounded cleanup coordinator, and awaiting the poll operation could delay entering cleanup. Those gaps are addressed without changing queue/lease SQL or executor settlement logic. Node documents Windows signal differences and inherited IPC in its [signal events](https://nodejs.org/api/process.html#signal-events) and [child-process IPC documentation](https://nodejs.org/api/child_process.html#subprocesssendmessage-sendhandle-options-callback). Windows `child.kill('SIGTERM')` is not used as a graceful substitute.

### Exact implementation and deterministic regression evidence

- `worker/sentinel/main.ts`: retains the same credential scrubbing, dedicated worker role, approval/target/plan checks and command; delegates runtime orchestration and emits fixed, redacted lifecycle records.
- `worker/sentinel/lifecycle.ts`: one idempotent coordinator for SIGINT/SIGTERM, Windows SIGBREAK, and versioned commands on an **inherited parent IPC channel only**; parent disconnect requests shutdown too. Repeated requests cannot start duplicate cleanup. Deadline timers and signal/IPC listeners are removed; no HTTP shutdown endpoint or network control interface exists.
- `worker/sentinel/runtime.ts`: preserves the approved maintenance-only Sentinel scheduler; checks cancellation around awaited scheduling operations, races active polling against shutdown, aborts waits/handlers, drains pending operations for at most five seconds, closes HTTP/idle sockets (remaining sockets after one second), writes the stopped heartbeat after draining when the verified schema is ready, then closes the pool. Cleanup shares a nine-second budget and reports failure if it cannot finish. A stopped-heartbeat write failure still closes the pool. There is no normal unconditional `process.exit()`.
- `scripts/sentinel-worker-smoke.ts` and additive `sentinel:worker:smoke` package command: run direct, hidden Node children with private IPC; independently gate the exact approved target/plan; monitor via read-only transactions; enforce a 180-second overall watchdog and 10-second idle shutdown deadline; stop the sequence and force-clean only its owned child on failure. The existing interactive `sentinel:worker` command is unchanged. This is the explicit local testing mechanism for this unreliable PTY.
- `tests/platform/lifecycle.test.ts`: **12/12 PASS**. Covers idle timer cancellation, repeated requests/one cleanup, Unix signal registration, Windows SIGBREAK, malformed/no-channel commands, parent disconnect, bounded deadline failure, real loopback HTTP/pool closure with SQL doubles, pending work, failed heartbeat cleanup, non-settling drain, stale-heartbeat restart, Guard claim denial, and late old-handler settlement after restart. The focused platform run passed **81/81 in 10 files**. SQL-double tests do not replace the original real PostgreSQL acceptance suite.

The executor, health/database adapters, queue/outbox/retention SQL, S00 contracts, migration pair, role SQL and secrets are unchanged. Source identities below use normalized UTF-8 LF SHA-256:

```text
worker/sentinel/main.ts         5d5c0e334d50c1bb046b71e81aa8ba3015c0c2ae81b20df75b552b665b102620
worker/sentinel/runtime.ts      1a797e45fd1f6a599a93911a1a1f83ea4a412845df4c46e2d82af8904d45b1e9
worker/sentinel/lifecycle.ts    9e11b7521ccfc25f924723137d5c12c2370d1df3868c26d42c1df87bc1a14584
scripts/sentinel-worker-smoke.ts 0ef79815ca6435c9d8efba50aebfc60fe0d8a824dc4c24c8a567a44e34409675
tests/platform/lifecycle.test.ts 402c5e72f935275e8c6038dcfbfba95fe8c9c37200004a9fa7c3f3bd50ed1793
src/platform/database.ts        025abb619e82ab155ed0a428e950940a2408dba38b74ce7cf0e2845ca23c3d90 (unchanged)
```

### Actual development lifecycle retest

Before startup: previous PID absent, no worker session/process, port 3112 unused; existing container ID/image/budgets unchanged. The gated reader reverified PostgreSQL **170012**, `127.0.0.1:55432 / wetscan_dev`, marker `wetscan-s01:26b6b537-c016-4dc7-8007-4e839e8b838f`, restricted role flags, and the exact ledger. Plan remains `7dac33cd59f2373d6ef87a94d6f588c723a8ce34f3115c47676d7353f7d61e43`; ledger checksum remains `dd061a60b123284882f154c438de3a171d60967b7b07a4e07200b6693f4eb778`, applied at `2026-11-14T12:36:51.243Z`. No up/down command was run.

Command: `npm.cmd run sentinel:worker:smoke`, using a separate ignored runtime-only approval and the unchanged migration-only dev approval for read-only observation. Overall **20:55:56.224 to 20:56:18.204 +07:00**, command exit **0**.

| Cycle | Worker PID / ID | Startup to ready | Shutdown request to process/stdio closure | Exit |
| --- | --- | --- | --- | --- |
| Initial | `12064` / `a59e22ad-7429-4b97-90a5-447674c7d981` | 586 ms | **22 ms** | 0, no kill signal |
| Restart | `19476` / `e1ced748-f7ec-4d6b-a358-a6dcf77931ea` | 512 ms | **20 ms** | 0, no kill signal |

Both cycles returned HTTP **200/ready**, database connected, schema `0001_foundation`, worker running; queue queued/leased/expired/failed/lag and pending outbox all zero. Telemetry remained `not_implemented`, provider `not_configured`. Actual sessions used **only `wetscan_sentinel_worker`**, with at most two observed connections, within pool maximum three. The observer used the separate migrator connection for SELECTs only. Worker role remains a trusted module-wide Sentinel service, not a per-project raw-SQL principal.

Initial heartbeat advanced from `13:55:57.241Z` to `13:56:07.261Z`; stopped at **`13:56:07.530Z`**. Restart heartbeat advanced from `13:56:08.025Z` to `13:56:18.045Z`; stopped at **`13:56:18.177Z`**. Each child received two IPC requests but emitted only one shutdown-request diagnostic and one stopped diagnostic. After each exit: owned PID absent, port rebound probe succeeded (no orphaned listener), zero worker DB sessions, and corresponding row `stopped`. No forced cleanup or stderr diagnostics occurred.

The historical row `790e660d-408d-4f8f-8897-91b906a426e7` retains `running` and last seen **`13:37:10.149Z`**, now stale. Its persisted fields were compared unchanged after both cycles. All existing rows were preserved; only two new worker heartbeat rows were added and naturally marked stopped. Jobs, outbox and bindings remained zero. No security events or notifications were enqueued, and the separate acceptance database was not used.

Evidence: ignored `.local/sentinel/worker-lifecycle-retest.json` contains real observations and diagnostics. The separate `worker-retest-approval.json` is now closed as `COMPLETED`, actions empty, worker activation false, original approval preserved. Existing approvals/env files/credentials were unchanged. Do not launch the worker again using this closed record.

Final checks and complete changed-file manifest are recorded in [S01 validation](SENTINEL_S01_VALIDATION.md). The verified lifecycle route is parent IPC on Windows; actual Linux signal execution and a different Windows interactive terminal are not claimed. Existing old-space/RSS and mutable workspace-namespace limits remain. No commit, PR, merge, deployment or S02; the worker remains stopped for owner review.

---

## Previous result: worker startup healthy; shutdown verification FAILED

14 November 2026 (Asia/Jakarta). Source: the owner's explicit **H01 Worker Activation & S01 Final Validation** request. **Startup and idle health passed. Shutdown verification failed; restart and final validation were NOT RUN under the owner's failure stop condition. The worker has been forcibly stopped. S01 lifecycle acceptance remains incomplete.**

### Target, authorization and isolation

- The existing approved container/image/volume and PostgreSQL 17.12 target were rechecked without Docker changes: `127.0.0.1:55432 / wetscan_dev`, marker `wetscan-s01:26b6b537-c016-4dc7-8007-4e839e8b838f`.
- Plan remained `7dac33cd59f2373d6ef87a94d6f588c723a8ce34f3115c47676d7353f7d61e43`. The single `0001_foundation` ledger row retained checksum `dd061a60b123284882f154c438de3a171d60967b7b07a4e07200b6693f4eb778` and `applied_at=2026-11-14T12:36:51.243Z`. No migration ran in this phase.
- A separate ignored, exact-target worker-smoke approval permitted only `runtime`; the existing dev approval stayed migration-only. After cleanup the temporary record was closed as `COMPLETED_WITH_FAILURE`, with no actions and worker activation false, retaining its original approval as history. Credentials, env files, markers, roles and test approval were unchanged.
- Existing `npm.cmd run sentinel:worker` started PID `10016`, worker ID `790e660d-408d-4f8f-8897-91b906a426e7`. A live PostgreSQL session reported only `wetscan_sentinel_worker` / application name `wetscan-sentinel-worker` (one connection). The process command included `--max-old-space-size=256` and `worker/sentinel/main.ts`.
- Restricted role flags, grants and seven ENABLE/FORCE RLS policies were rechecked. The configured queue rejected `module=guard` with `scope_denied`; an unregistered project claim returned no leases; a transaction handle used with a different project scope was rejected. No project/job/event fixtures were inserted. No Guard/scanner execution imports were found in the worker/platform path.
- **Isolation limit:** the trusted worker role has module-wide access to live Sentinel records for scheduling. Raw SQL under that role is not isolated to a single project. Application-role RLS uses workspace/project context; worker operations enforce scopes and active bindings. Conflicting-row isolation evidence remains the separate 14-case test suite below; empty development tables do not establish it anew.

### Actual startup and idle observations

The worker started at **19:45:34.963 +07:00**. Its listener was bound only to `127.0.0.1:3112`. At **19:46:20.577** and **19:46:50.427 +07:00**, GET `/health` returned HTTP **200**:

```json
{"status":"ready","database":"connected","schema":"0001_foundation","worker":"running","queue":{"queued":0,"leased":0,"expired":0,"failed":0,"lagSeconds":0},"outbox":{"pending":0,"provider":"not_configured"},"telemetry":"not_implemented"}
```

The same heartbeat advanced from `12:46:15.047Z` to `12:46:45.113Z`; observed ages were 5.51 and 5.30 seconds, within the 30-second freshness threshold. Queue/outbox remained empty. This establishes idle infrastructure readiness, not application monitoring or provider delivery. No application security events, bindings, jobs or notifications were enrolled.

Configured limits remained pool maximum 3, concurrency 2, poll 1 second, lease 30 seconds, heartbeat 10 seconds, handler timeout 20 seconds, retention 30 days and 256 MiB V8 old-space. One process sample showed working set 37,580,800 bytes and 0.8125 seconds CPU; these are samples, not peaks or hard RSS/CPU limits. Database budgets remained 1 GiB / 2 CPUs / 128 PIDs / 40 connections. No active workload exercised development capacity.

### Shutdown failure and cleanup

The PTY Ctrl+C request did not terminate the worker. The shutdown observer returned exit **1** with `WORKER_SMOKE_FAILED / shutdown_verification_failed`: port 3112 remained open and the heartbeat kept advancing. A subsequent Windows console CTRL_C_EVENT also did not stop the observed process. The root cause of signal delivery/handling is **unconfirmed**; there is no evidence that the shutdown handler ran.

After verifying the owned PID's worker command, `Stop-Process -Id 10016 -Force` was used at **20:37:13.467 +07:00** to meet the required stopped state. The worker remained running for approximately 52 minutes; the intended bounded lifecycle smoke did not complete. Its command session ended with exit **1**. This was forced cleanup, **not successful graceful shutdown**.

Read-only evidence at **20:37:31.916 +07:00** confirmed: process absent, no port-3112 listener, HTTP unavailable, zero worker PostgreSQL sessions, jobs/outbox/bindings all zero and unchanged development ledger. The retained heartbeat still says `running`, last seen `13:37:10.149Z`; it was not rewritten/deleted to conceal the failure and becomes stale after the existing freshness threshold. No restart was attempted.

Ignored evidence: `.local/sentinel/worker-smoke-start1.json`, `worker-smoke-idle1.json`, `worker-smoke-forced-cleanup.json`, and closed `worker-smoke-approval.json`. No passwords are included. Only the three requested documentation reports and ignored runtime/evidence files changed during this phase; implementation/SQL/tests and protected modules were preserved. No reset/down, volume changes, scanner/provider execution, commit, PR, merge, deployment or S02.

**Remaining gate:** diagnose Windows/npm/PTY signal propagation and obtain authorization for any scoped fix/retest. Restart/heartbeat recovery, graceful stopped-heartbeat persistence and final typecheck/lint/all-unit/build/browser checks remain **NOT RUN** after this failure. Prior 14/14 real PostgreSQL acceptance and development up/up evidence below are retained, not rerun or replaced.

---

## Previous result: Phase D development migration verified

14 November 2026 (Asia/Jakarta). Source: the owner's explicit **H01 Phase D: Development Migration Approval**, dated 14 November 2026, in this conversation. This authorizes only initial `0001_foundation` on the exact development target, a second up for idempotency/checksum verification and read-only role/RLS checks. It does not authorize down, reset/recreation, worker activation, commit/merge/deployment or S02. **Both development up runs passed, exit 0; verification passed. The main Sentinel worker remains stopped.** Prior acceptance and failure history is retained below.

### Pre-migration checks and private approval

- Branch `feat/sentinel-s01-platform`, HEAD `ec6838b77cf14a126cb3c4d1a7f8d86d70d85665`; existing S01 implementation/tests/SQL preserved.
- Existing container ID `0220e86e719aa43c30dfd3ba371e290de0fe9141d8d1fe7f7fc6a58accb8961f`, approved immutable image, `desktop-linux`, loopback port and approved data-volume mount verified; no Docker mutations performed.
- The successful 14/14 PostgreSQL acceptance command result (exit 0) was rechecked against retained execution evidence and this report. The test ledger retained its original `2026-11-14T12:24:59.556Z` application timestamp and matching checksum. The suite was not rerun and its fixtures were not touched.
- Before applying up, a real gated migrator connection verified `wetscan_dev`, owner/login `wetscan_migrator`, PostgreSQL `170012`, the exact marker, no non-public application schemas, no user relations/routines or large objects, and no migration ledger. `public` was empty.
- The private dev approval record now records the explicit Phase D owner decision and preserves its previous approval. Its sole action is **`migrate_up`**; no `migrate_down`, general `runtime` or `integration_test` permission was added. Worker activation remains explicitly false. No env file, secret, marker, role or test approval record changed.

```text
Verified endpoint: 127.0.0.1:55432
Database: wetscan_dev
Database marker: wetscan-s01:26b6b537-c016-4dc7-8007-4e839e8b838f
Version: 0001_foundation
Plan SHA-256: 7dac33cd59f2373d6ef87a94d6f588c723a8ce34f3115c47676d7353f7d61e43
SQL pair checksum: dd061a60b123284882f154c438de3a171d60967b7b07a4e07200b6693f4eb778
```

The offline plan and reviewed source checksums were reproduced before execution. The SQL/role files, runner and corrected identity checks are unchanged from successful acceptance. Migration ran only through the existing gated command:

```powershell
npm.cmd run sentinel:db -- up --approve-plan=7dac33cd59f2373d6ef87a94d6f588c723a8ce34f3115c47676d7353f7d61e43
```

### Actual migration and second-run result

| Check                               | Actual result                                                                                                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial gated development up        | PASS, `status=applied`, `direction=up`, exact approved plan, exit 0                                                                                                       |
| Development ledger after initial up | Exactly one `0001_foundation` row with approved checksum                                                                                                                  |
| Ledger `applied_at`                 | `2026-11-14T12:36:51.243Z` (19:36:51.243 Asia/Jakarta)                                                                                                                    |
| Second identical gated up           | PASS, exit 0; runner verified ordered ledger/checksum and had no pending migration                                                                                        |
| Idempotency evidence                | Ledger count/checksum/timestamp, catalog/ACL/policy metadata, seed and application-record counts unchanged after second up; full captured development-state SHA-256 equal |
| Application records                 | Jobs, job attempts, outbox, notification attempts, worker heartbeats and project bindings all remain zero                                                                 |
| Module seed                         | Only `sentinel`, maximum running jobs 2; no Guard seed                                                                                                                    |
| Test database preservation          | Read-only pre/post snapshot equal; ledger timestamp, catalog metadata, ACLs, policies, seed and record counts unchanged                                                   |

Created schemas/tables: `sentinel.project_bindings` and `platform.schema_migrations`, `platform.module_limits`, `platform.jobs`, `platform.job_attempts`, `platform.notification_outbox`, `platform.notification_attempts`, `platform.worker_heartbeats`. Eight tables were verified (22 relations including their indexes). No Auth, Guard, Canvas, telemetry, incident, detection or provider tables exist in this foundation.

### Roles, permissions and RLS - read-only verification

The three existing LOGIN roles retain NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOBYPASSRLS. App/worker have no membership in the migrator role. Database ownership/CONNECT ACL and role flags match the pre-migration snapshot. Module schema/table/column grants and policy definitions match the already accepted test foundation; no extra grants were introduced outside the approved migration.

| Boundary                   | Verified result                                                                                                                     |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Schema ownership           | `wetscan_migrator`; runtime roles have platform USAGE, no CREATE in platform/sentinel                                               |
| App jobs permissions       | SELECT/INSERT/UPDATE, no DELETE                                                                                                     |
| Worker jobs permissions    | SELECT/INSERT/UPDATE/DELETE as reviewed for retention                                                                               |
| Ledger runtime permissions | App/worker SELECT allowed, UPDATE denied                                                                                            |
| Worker binding permissions | `enabled` UPDATE denied; `last_cleanup_at` UPDATE allowed                                                                           |
| Runtime RLS                | All seven runtime tables have ENABLE + FORCE RLS; `row_security_active` true for jobs/bindings on actual app and worker connections |
| Module/mode policies       | Definitions equal the accepted test policies; live Sentinel boundary retained; no Guard/demo rows visible                           |

These checks ran in **BEGIN READ ONLY** transactions. No development/test fixtures or application records were inserted/updated/deleted, and no data was changed to demonstrate denial. Enforcement against real conflicting rows was established by the previous 14/14 acceptance suite on the separate test database; this phase verifies the development catalog/privileges/active policies without modifying data. Role connections are verification queries, not worker process activation or general runtime approval.

### Phase D stop state and limits

No failure remains from Phase D. The initial development foundation and idempotency/checksum verification are complete; no down was run on either database. Both database markers, credentials, roles, Docker container/network/volume and the test database remain intact. No application code, tests, SQL or shared ownership boundaries changed in this phase. Only the private dev approval and H01 validation documentation were updated; local verification artifacts remain ignored and contain no passwords.

The main Sentinel worker was not started, no heartbeat/project/job was enrolled, and service lifecycle/HTTP health remain NOT RUN. Guard scanners/providers were not called. No commit, merge, deployment or S02 work. **Stop after this verified development migration; worker activation requires the owner's next explicit approval.**

---

## Previous result: authorized identity fix and acceptance PASS

14 November 2026 (Asia/Jakarta), rerun at **19:24:58 +07:00**. Source authorization: the owner's explicit **H01 PostgreSQL Acceptance Bug Fix** request in this conversation. It permits only the shared-comment reader fix, regression tests and a rerun against the unchanged approved test database/marker/endpoint/plan. **All 14 real PostgreSQL acceptance cases passed**, exit 0. Development migration and main Sentinel worker activation remain unauthorized and unperformed. The historical first failure is preserved below.

The root cause was using a per-database object-comment reader for a shared database catalog object. Exact implementation diff, in `src/platform/database.ts`:

```diff
-        obj_description(d.oid, 'pg_database') AS marker, r.rolsuper, r.rolbypassrls,
+        shobj_description(d.oid, 'pg_database') AS marker, r.rolsuper, r.rolbypassrls,
```

No condition, approval action, database/role/version/marker equality check, timeout or permission changed. Inverting only this replacement reproduces the preflight's old normalized source hash, independently confirming the one-line scope. Normalized UTF-8 (CRLF -> LF) SHA-256 identities:

```text
Old database.ts: 7e38d20a36d3b7e88b5e6959070c9630b3da643f018eeb218f081f5344632f3c
New database.ts: 025abb619e82ab155ed0a428e950940a2408dba38b74ce7cf0e2845ca23c3d90
```

### Regression and static checks

Added `tests/platform/identity.test.ts`: 11 driver-double regressions. They cover the correct shared-catalog marker, incorrect/missing marker, wrong database, wrong role, superuser/bypass roles, unsupported version, absent identity row, redacted query errors and refusal before pool construction when approval configuration is absent. A controlled reproduction against the old source produced the expected single marker-acceptance failure (10 other cases passed); all 11 pass with the fix. These negative identity cases use a driver double, not extra databases or changed live markers. The corrected approved identity lookup was also verified against the real PostgreSQL test target before migrations.

| Check after the fix              | Result                                                                                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`              | PASS, exit 0                                                                                                                                   |
| `npm run lint`                   | PASS, exit 0                                                                                                                                   |
| `npx vitest run tests/platform`  | PASS, **69 tests / 9 files**, including all 11 new regressions                                                                                 |
| Migration plan command           | Exact approved hash and pair checksum reproduced; zero migrations from plan command                                                            |
| Real test target precheck        | Same container ID, image, volume, endpoint, database/marker and approval actions; test DB initially had zero user tables and no module schemas |
| `npm run test:platform:postgres` | PASS, **14 tests / 1 file**, exit 0, duration 5.13 s                                                                                           |

No approval record, env configuration, credential, database marker, role, container or volume was changed by this fix/rerun. No migration SQL changed. The existing test suite and migration runner were not edited.

### All 14 real PostgreSQL acceptance results

| Case                                                                    | Result |
| ----------------------------------------------------------------------- | ------ |
| Reversible/checksummed migrations and edited-ledger denial              | PASS   |
| Transaction rollback / no partial job write                             | PASS   |
| Idempotency receipt and conflicting payload denial                      | PASS   |
| Concurrent enqueue produces one durable job                             | PASS   |
| Concurrent claims enforce module capacity across projects               | PASS   |
| Heartbeat revision and expired/reclaimed fencing                        | PASS   |
| Exited test-claim process recovered by a fresh process                  | PASS   |
| Retry exhaustion persists failed state                                  | PASS   |
| Cancellation and disabled project invalidate active lease               | PASS   |
| Cross-project/workspace and demo RLS denial                             | PASS   |
| Guard module/enrollment denial under Sentinel roles                     | PASS   |
| Transactional outbox rollback/commit and unavailable provider ledger    | PASS   |
| Retention hold and active-job preservation                              | PASS   |
| Heartbeat health, stale worker state and telemetry/provider distinction | PASS   |

### Migration sequence and final database state

The approved test-only setup sequence **up -> up -> down -> up** completed through the existing runner on `wetscan_s01_test`. The repeated up was idempotent; down operated on the empty test foundation before fixtures; final up left one matching ledger row. No database/volume was dropped or reset. The test runner's existing fixture cleanup removed its own project/job/outbox/attempt/heartbeat rows.

Read-only inspection after acceptance, at **19:25:48 +07:00**, found:

```text
Target: 127.0.0.1:55432 / wetscan_s01_test
Marker: wetscan-s01:9f3560a6-127f-42a6-abaf-9f45951e6bd5
Plan: 7dac33cd59f2373d6ef87a94d6f588c723a8ce34f3115c47676d7353f7d61e43
Ledger rows: 1
Version: 0001_foundation
Checksum: dd061a60b123284882f154c438de3a171d60967b7b07a4e07200b6693f4eb778
Applied at: 2026-11-14T12:24:59.556Z
Remaining jobs/attempts/outbox/notification attempts/heartbeats/project bindings: all 0
Module budget seed: sentinel = 2; no Guard seed
```

All seven runtime tables have both RLS and FORCE RLS enabled; the migration ledger is a separate non-RLS infrastructure table. Real acceptance exercised project/workspace/module read/write denials, cancellation/fencing, transaction/outbox rollback, concurrent claims and independent-process reclaim. This is local PostgreSQL acceptance evidence, not live GitHub/provider or deployed monitoring evidence.

The independent post-run development check still finds **no `platform` schema, no `sentinel` schema and zero user tables in `wetscan_dev`**. Both original markers/owners and non-superuser/non-bypass role flags are unchanged. Main `worker/sentinel/main.ts` was not started; process recovery used only the authorized test helper `tests/platform/claim-process.ts`. Actual service startup/HTTP worker health and development migration remain NOT RUN and require separate approval.

No acceptance failure remains from this run. Negative-marker regression cases use driver doubles; actual PostgreSQL confirms the correct marker and the full existing 14-case suite. The documented worker heap limit is not a hard RSS/CPU sandbox, and no external/provider/scanner acceptance is implied. Auth, Guard, Canvas, Demo Mode, routing and S00 contracts remain unchanged. No commit, merge, deployment or S02 work. **Stop here pending separate development migration approval.**

---

## Historical first attempt - retained unchanged for provenance

Everything below describes the original provisioning/failed setup attempt, before the subsequently authorized fix and successful rerun above.

14 November 2026 (Asia/Jakarta). **Provisioning completed; PostgreSQL acceptance FAILED IN SETUP. S01 is not operationally accepted.** Development migration and Sentinel worker activation remain unauthorized and were not performed.

## Approval and exact scope

Source: the owner's explicit **WetScan Sentinel - H01 Phase B Approval** in this conversation, dated 14 November 2026 (Asia/Jakarta), after reviewing `SENTINEL_H01_PREFLIGHT.md`. Approved: only the specified new instance/volume/network, private credentials, new dev/test databases and roles/markers, and the reviewed acceptance-only migration sequence/tests. The owner explicitly withheld dev `0001_foundation`, worker activation, Guard scanners, deployment/merge and S02.

The branch remains `feat/sentinel-s01-platform`, HEAD `ec6838b77cf14a126cb3c4d1a7f8d86d70d85665`. All existing implementation, SQL and tests are preserved. Only documentation is updated by this packet; ignored local setup/evidence files are not source changes. No commit/push/merge/deployment.

## Actual provisioning evidence

Immediately before creation, `desktop-linux`, Linux/amd64, unoccupied 55432 and absent volume/container/network/project identities were rechecked. The approved manifest SHA-256 was independently reproduced again; the six runner/config/Compose/role-file hashes matched the preflight. No previous target collision was found. Only the approved immutable image was pulled.

| Item                    | Observed result                                                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Image                   | `docker.io/library/postgres:17.12-bookworm@sha256:99d1a998c76487d3abb48b141505bda5dcf8089c0c4cd7be40f75de314fa32f0`, linux/amd64 |
| New container           | `wetscan-sentinel-local-postgres-1`                                                                                              |
| Container ID            | `0220e86e719aa43c30dfd3ba371e290de0fe9141d8d1fe7f7fc6a58accb8961f`                                                               |
| New external volume     | `wetscan_sentinel_s01_dev_20261114`, mounted at `/var/lib/postgresql/data`                                                       |
| New network / project   | `wetscan-sentinel-local_default` / `wetscan-sentinel-local`                                                                      |
| Published port          | Only `127.0.0.1:55432 -> 5432/tcp`                                                                                               |
| Actual server           | `PostgreSQL 17.12 (Debian 17.12-1.pgdg12+1) on x86_64-pc-linux-gnu`, 64-bit                                                      |
| Server settings         | UTC, `max_connections=40`, `shared_buffers=128MB`                                                                                |
| Actual container limits | Memory 1,073,741,824 bytes, NanoCPUs 2,000,000,000 (2 CPUs), PIDs 128                                                            |
| Container readiness     | Running, Docker healthcheck healthy; this is server readiness, not S01 acceptance                                                |

Four independent 32-byte random values were encoded as distinct 64-character hex passwords and stored under the approved private directory outside both the repository and OneDrive. Inheritance is disabled on the private directories; the only allowed principals are the current operator and SYSTEM. Password values were never printed or stored in env/SQL/source/log output. Role password setup used locally generated SCRAM-SHA-256 verifiers rather than plaintext SQL literals; verifiers were not printed.

Ignored dev/test env files contain configuration and absolute secret-file paths only. The dev approval record has **no runtime/migrate_up/migrate_down/integration_test actions**. The separate test record has the four explicitly authorized test/runtime/up/down actions and the exact test target/plan. Neither record authorizes Sentinel worker activation. No Auth env file was changed.

Created roles are `wetscan_migrator`, `wetscan_app`, `wetscan_sentinel_worker`; catalog inspection confirms all three LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOBYPASSRLS. The image-created bootstrap administrator is used only for authorized setup/diagnostics. Both new databases are UTF-8, owned by `wetscan_migrator`, with PUBLIC database privileges revoked, explicit runtime CONNECT grants and public-schema CREATE restricted.

| Database           | Actual shared-object COMMENT marker                | Post-attempt module state                                               |
| ------------------ | -------------------------------------------------- | ----------------------------------------------------------------------- |
| `wetscan_dev`      | `wetscan-s01:26b6b537-c016-4dc7-8007-4e839e8b838f` | No platform/sentinel schemas; zero user tables; no foundation migration |
| `wetscan_s01_test` | `wetscan-s01:9f3560a6-127f-42a6-abaf-9f45951e6bd5` | No platform/sentinel schemas; no foundation migration/ledger            |

All three runtime/migration credentials successfully connected to the **test** database for a subsequent read-only identity diagnostic. Their old marker lookup returned NULL; the correct shared-object lookup returned the exact approved marker. These were identity queries in read-only transactions, not a substitute for or bypass of migration/queue/RLS acceptance.

## Reviewed migration identity and actual result

```text
Version: 0001_foundation
Up + NUL + down SHA-256:
dd061a60b123284882f154c438de3a171d60967b7b07a4e07200b6693f4eb778
Approved plan SHA-256:
7dac33cd59f2373d6ef87a94d6f588c723a8ce34f3115c47676d7353f7d61e43
```

The existing offline plan command reproduced both hashes. The unchanged real command `npm run test:platform:postgres` ran at **18:57:13 +07:00**, using `.env.sentinel.test.local` and the approved test record. It launched Vitest and attempted the first acceptance migration through the reviewed runner. Result:

```text
FAIL tests/platform/postgres.integration.ts
Error: target_denied
  ApprovedPool.connect          src/platform/database.ts:69
  applyMigrations               src/platform/migrations.ts:60
  beforeAll                     tests/platform/postgres.integration.ts:120

Test Files  1 failed (1)
Tests       14 skipped (14)
Exit code   1
```

**0 passed, 0 individual test bodies executed, 14 skipped, 1 failed suite.** This is a real PostgreSQL-backed setup failure, not 14 passed or 14 assertion failures. The requested up/up/down/up sequence **did not execute**: `ApprovedPool.connect` refused the target before the migration transaction's first BEGIN/DDL. No reviewed foundation migration was applied to either database. The password-free prerequisite role SQL did run on the new instance, as authorized; that is distinct from `0001_foundation`.

| Acceptance case                                                 | Actual result                |
| --------------------------------------------------------------- | ---------------------------- |
| Reversible/checksummed migrations and edited-ledger denial      | SKIPPED: setup target_denied |
| Transaction rollback / no partial writes                        | SKIPPED: setup target_denied |
| Idempotency receipt and payload conflict                        | SKIPPED: setup target_denied |
| Concurrent enqueue                                              | SKIPPED: setup target_denied |
| Concurrent claims / module capacity across projects             | SKIPPED: setup target_denied |
| Heartbeat revision / expired and reclaimed fencing              | SKIPPED: setup target_denied |
| Exited-process lease recovery                                   | SKIPPED: setup target_denied |
| Retry exhaustion / persisted failure                            | SKIPPED: setup target_denied |
| Cancellation and disabled binding                               | SKIPPED: setup target_denied |
| Cross-project/workspace and demo RLS denial                     | SKIPPED: setup target_denied |
| Guard enrollment/module denial                                  | SKIPPED: setup target_denied |
| Atomic outbox and unavailable provider                          | SKIPPED: setup target_denied |
| Retention holds / active-job preservation                       | SKIPPED: setup target_denied |
| Worker heartbeat / queue/provider/telemetry health distinctions | SKIPPED: setup target_denied |

RLS policies, durable transaction behavior, concurrency/restart/fencing, queue/outbox/retention and S01 worker health therefore remain **NOT VERIFIED ON POSTGRESQL**. No production worker or acceptance child-claim process was started because setup failed before test bodies.

## Root cause and proposed fix - not applied

`src/platform/database.ts` reads `obj_description(d.oid, 'pg_database')`. Database comments are shared catalog objects, so this returns NULL even when the approved database COMMENT is correctly set. PostgreSQL's [comment information documentation](https://www.postgresql.org/docs/17/functions-info.html#FUNCTIONS-INFO-COMMENT-TABLE) specifies `shobj_description` for databases, roles and tablespaces. The diagnostic reproduced the discrepancy under bootstrap and all three non-superuser roles; database names/owners/version and the real markers match approval.

Proposed narrow fix:

```diff
- obj_description(d.oid, 'pg_database') AS marker
+ shobj_description(d.oid, 'pg_database') AS marker
```

Keep every target/role/version/hash check, force-RLS policy and approval action unchanged. Add a focused ApprovedPool regression using actual PostgreSQL shared comments, retain a wrong-marker refusal, then rerun the unchanged full 14-case acceptance sequence only on `wetscan_s01_test`. This source fix has **not** been applied; no guard has been removed, marker bypassed or in-memory substitute used. The initial ignored setup helper had the same mistaken comment lookup; only its read-only verification was corrected to inspect the actual provisioning result. The reviewed application runner/source remains untouched.

This function-only source proposal would not change migration SQL/plan identity, but would change the reviewed `database.ts` source hash and must be recorded/revalidated if authorized. No attempt was made to recreate/delete the now-existing approved targets, overwrite secrets or reset databases after the failure.

## Stop state

The newly approved PostgreSQL container remains running with server readiness healthy. It is **not an operationally accepted Sentinel platform**. Both databases and their exact markers exist; both remain without foundation schemas. Credentials remain private, ignored approval/config files remain local, existing volumes/databases/services are untouched. Auth/Guard/Canvas/Demo/routing and S00 contracts are unchanged. No Guard scanners, external providers, merge/deployment or S02 work.

Next decision: review/authorize the narrow shared-comment lookup fix and test-only rerun. **Development migration and worker activation still require a later separate approval, even if acceptance subsequently passes.**
