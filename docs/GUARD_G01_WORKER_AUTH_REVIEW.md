# Guard G01 - Auth resolver and bounded worker launcher

## Current finalization status - 15 November 2026

See [GUARD_G01_FINALIZATION.md](GUARD_G01_FINALIZATION.md) for the current audit, implementation, test results and exact remaining approval checklist. Overall **PARTIALLY COMPLETE**, real acceptance **BLOCKED**. Latest user explicitly authorizes candidate commit/push despite the known baseline Sentinel failure; the earlier publication hold below is historical and superseded. No Sentinel fix/assertion edit, G02, real SQL/provider/worker/container operation, merge or deploy is performed. Current old Guard HEAD is92ee6fa, preserved; do not restore historical7207a16 state. New producer is prepare_only, lease getter is now forwarded, snapshot request mismatch/concurrency and sandbox identity/evidence boundaries are fixed; earlier descriptions of missing implementations describe their historical phase.


## Actual combined candidate - 15 November 2026

The resolver/launcher delta was copied unchanged to the user-authorized f7bfeefcandidate branch feat/guard-g01-s03-integration. Combined707units/typecheck/lint/build and42focused contracts pass; actual planb63e1e... includes three platform versions. No shared queue/executor/Auth source change was required. Runtime/secret/provider/DB/sandbox acceptance remains unperformed. Browser gate is59/60because original S03JSON-error check fails; user denied Sentinel changes and held publication. No new commit/push. See GUARD_G01_S03_INTEGRATION_VALIDATION.md; earlier drift-blocker paragraphs are historical and no longer mean the candidate is absent.


15 November 2026 (Asia/Jakarta). **IMPLEMENTED_PENDING_ACCEPTANCE for the bounded prepare-only composition; overall G01 remains PARTIALLY_VERIFIED.** No G02 work. User reports Wil's approval: "Approve mas, aman." This supports continuing G01 code/review within scope, not specific database, infrastructure, source-target, runtime or publication operations. No non-secret target approval was fabricated, and no secret/credential/.env file was opened.

## Implemented flow

1. Trusted existing backend may call launchApprovedGuardWorker with the stored scan, existing session token, explicit launch approval and operator-managed config paths. No browser route or automatic startup calls it. This is a server-only composition function, not an activated service/UI.
2. Validate the exact job binding and permit before Auth/config access or fork. The binding covers live workspace/project, job ID, creator actor, GitHub repository ID/branch/commit, profile, engines and idempotency key; repositoryName is additionally matched against current backend authorization. Invalid/general/expired/extra-action/extra-field approvals fail closed.
3. Independent Guard app-role database approval must match the launch target before any purpose-specific credential loading. Reuse ApprovedPool/PlatformDatabase and exact Guard/platform ledger checks. No migration or bootstrap SQL runs automatically.
4. In the existing Auth process, GuardSessionBroker reuses authorizeGuardProject -> authorizeCanvasProject and existing GitHub App authorization. Current session/logout, selected repository, user, workspace, installation and repository access are revalidated. Store metadata is loaded and checked against immutable binding. Only the existing Auth process handles session/provider access; no duplicate OAuth/session store/identity model.
5. Fork one hidden Node child through inherited private IPC with an environment allowlist. The child receives neither browser cookie/session token nor Auth/GitHub/Sentinel credentials/config. Its own separately approved Guard worker-role configuration uses operator-managed file paths only after validating the boot and exact DB target approval. No dotenv is loaded. No HTTP/listening-port broker is added.
6. Child validates both ledgers, heartbeat and one approved job, then uses the existing Guard lifecycle and S01 executor. GuardPostgresQueue's optional onlyJobId restricts claim AND failed-job/attempt/outbox/scan reconciliation. Default queue behavior is retained for other existing callers.
7. ipcWorkerResolver requests fresh authority tied to an active lease. Parent verifies exact worker/owner/token/expiry/cancellation against scoped Guard platform rows. Resolve/acquire recheck current Auth and persisted scan; acquire checks again after retrieval. Repository/profile/engines/commit changes are rejected. The shared validateJob is an enqueue validator, so lease fields are separately validated rather than incorrectly passing attempt1/revision2 to the enqueue-only contract.
8. Source acquisition stays in the Auth process using GuardSnapshotAdapter and the existing GitHub transport. Child receives expiring grants plus bounded metadata only, never raw source, provider credentials or absolute source directory. G01 does not execute a scanner. Existing prepare handler records explicit failed foundation preparation because G02 is unconfigured, never a completed scan.
9. Owned snapshot handles cannot be forged or disposed by another lease. Cleanup remains permitted for an owned handle after lease expiry/revocation; new access does not. IPC timeout/cancel/disconnect aborts work and clears pending listeners. Parent shutdown drains IPC, disposes owned snapshots and closes its pool; failures are surfaced with fixed safe codes. Process exit0/boot handoff does not prove a job was processed or a scan completed.

## Exact runtime authorization required (NOT granted)

GuardWorkerApproval schemaVersion1/module guard-worker/status APPROVED requires approvedBy/approvedAt/expiresAt<=1hour, workerId, exact loopback target {host,port,database,marker}, migrationPlanSha256, exact GuardJobBinding, repositoryName and execution=prepare_only. Actions must be exactly worker_start, queue_claim, heartbeat, snapshot_read, scan_metadata_write, cleanup. No scanner/build/egress/migration action is allowed. Snapshot read implies the existing documented bounded source policy and a separately explicit human authorization for that repository/commit; no general implementation review substitutes for it.

Both GUARD_DB_APP_APPROVAL_FILE/PASSWORD_FILE and GUARD_DB_WORKER_APPROVAL_FILE/PASSWORD_FILE are separately approved, purpose-specific operator configuration. Paths/values are not supplied in this document. Matching target is checked before a credential read; runtime grant and role-approval expiry are checked before new work. Direct CLI startup, a launch flag alone, missing inherited IPC, or Wil's general approval message is rejected before database configuration. All test permits and fake credentials are clearly synthetic and do not authorize any real operation.

Database, worker and GitHub runtime actions are still BLOCKED pending explicit target/action approval. SQL is unchanged; old Sentinel approvals cannot be reused. No actual approved launcher invocation occurred.

## Auth ownership and restart limits

This design requires the existing supported single Auth-writer process. It does not repair or authorize a horizontally scaled Auth deployment. The only token reference is transient in that Auth process and is not persisted in Guard jobs, IPC, logs or a new store. Logout causes the next existing authorization to fail. A parent restart loses the binding and stops the IPC child; resume requires a new authenticated binding and applicable approval, not silent recovery from stored tokens.

Launcher is bounded one-job/one-poll preparation (once=true), not an installed long-running daemon/supervisor. Child startup without approval is denied. A real approved operator invocation still needs to be arranged in the existing Auth process; no public activation endpoint is exposed. Multiple host launches, physical overlap after lease-loss/cleanup, actual crash recovery, broker/worker/pool shutdown under real I/O and service-account source permissions require acceptance. Reaper functions remain unscheduled. No production attestor or actual sandbox enforcement is supplied by these IPC changes. Snapshot paths are intentionally unavailable to scanner code in this stage.

## Tests actually run in this continuation

- `node --require ./tests/auth/skip-dotenv.cjs ./node_modules/vitest/vitest.mjs run`: **567/567 PASS,48files**, including20 added cases on top of the prior547. G01 subset:78/78,15files.
- `npm.cmd run typecheck`: PASS. `npm.cmd run lint`: PASS, no warnings in the final run.
- `node tests/guard/run-e2e.mjs`: production build and5/5 Guard browser regressions PASS (latest23.4s).
- `node tests/guard/g01/run-regression.mjs auth`:21/21 PASS,58.6s. `... sentinel`:5/5 PASS,20.6s. Auth includes logout/protected-history and GitHub installation regressions. Canvas17/legacy6 remain prior-stage evidence, not freshly rerun here.

New tests exercise approval denial/expiry/target/repository/job, persisted creator identity, logout/workspace/revocation, active/stale lease, strict request scope, cleanup after expiry/failure, timeout/cancel/disconnect, input bounds, environment scrubbing, fork failure and exact-job SQL filters. One real Node fixture child exchanges grants/snapshot metadata and disposal over inherited IPC with synthetic Auth/store/source dependencies. Two production-entry child invocations deny missing/general permits before any DB config. Positive parent composition uses a fake child/pool; it does not prove connected worker execution. No test opened actual credential files, PostgreSQL, GitHub or Docker.

Initial failures retained: the new subprocess fixture originally captured the first IPC request rather than the result message (75/76 passed); filtering by result type fixed the fixture without weakening assertions. New typing errors in config-expiry/ProcessEnv/optional disconnect and fixture/RPC pending types were corrected. Two unused-expression lint warnings were fixed with explicit branches. Final full checks passed; no real acceptance failure was replaced with a mocked pass.

## Concurrent master drift - new acceptance prerequisite

During this continuation, another workflow advanced clean master from12b843e to **f7bfeef29488c3f997e9444555039514f55fa0a3**, merging S03 commit a7a0998. Guard worktree remains **7207a16ad3a7640d48bd67719188642b27fb9be2** plus local changes; no branch switch/merge/rebase/reset or publication was performed.

Read-only audit of the public diff and HANDOFF_S03 found:

- Shared PostgresQueue adds optional Sentinel-only admission/cutoff parameters. Existing three-argument Guard construction leaves them unset; inherited ordinary methods preserve the normal path. Guard's optional exact-job filter is local, not copied into shared code. Static compatibility is plausible, not combined-runtime proof.
- S03 preserves JobHandler(job,signal) and adds LeaseAwareJobHandler for executeLease; Guard's two-argument tracking remains assignable. Lifecycle changes add shutdown reasons, not a conflicting Guard channel.
- S03 adds0003_detection. Guard's local platform plan is still the two-version S01/S02 baseline; its aggregate **444596c4628d94f0824f98afcc960148662f55c691155e1092e0a11698101dfc** is valid only for this isolated source baseline. Master reports a different platform plan (c3e39f6fd43ee6eb2fbf5b244778955aab4cabb8a11ed3c66d791cf99a252a94 in the S03 handoff). Do not apply the old Guard approval/plan against a three-version target. Existing exact-ledger checks reject the mismatch.

The567-unit/build/browser results apply to this Guard worktree, NOT combined S03+new-resolver code. Before runtime approval, the owner must choose/authorize baseline alignment without losing work or violating the no-merge restriction. Then review shared changes, regenerate Guard aggregate/hash packet, repeat affected combined checks and obtain exact target/action approvals. No SQL/shared source was edited to bypass this blocker. Historical S03 acceptance is Sentinel-only, not Guard acceptance or permission.

## Changed files and publication

All continuation edits are local in C:/laragon/www/wetscan-2/wetscan-guard-g01. Shared Auth/Canvas/platform/Sentinel source, dashboard/UI, SQL, package/lock remain unchanged. Existing four preflight documentation changes were preserved. See the handoff for exact current modified/new manifest. No git add/commit/push/PR/merge/deploy.
