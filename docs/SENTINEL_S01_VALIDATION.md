# S01 validation and limitations

## Owner-approved finalization review

14 November 2026 (Asia/Jakarta). The owner's **S01 Final Review, Commit & Pull Request** request explicitly authorizes final review, a descriptive S01 commit, feature-branch push and PR creation targeting `master`. It does not authorize merging, deployment, database changes, worker startup or S02. The historical preparation and lifecycle entries below retain their original phase restrictions; they do not override this later publication authorization.

Pre-commit review re-fetched `origin/master` at `ec6838b77cf14a126cb3c4d1a7f8d86d70d85665`, matching the existing branch base. Reviewed the complete 51-file S01 manifest, migration/RLS/queue/outbox ownership, gated runners, worker/coordinator/private-IPC harness and test boundaries. No implementation/SQL changes were needed; stale preparation-status banners in Sentinel documents were reconciled with actual accepted H01 results. H10 approval provenance and all no-touch application boundaries are preserved.

The 14/14 PostgreSQL suite, development up/up verification and 22/20 ms worker lifecycle results are **previously executed acceptance evidence**, not tests rerun during finalization. SQL, database adapters and worker implementation are unchanged, so this review does not invalidate that evidence. No database connection, migration command, acceptance suite or worker startup is part of finalization. Fresh post-commit typecheck/lint/unit/build/browser results will be reported in the PR against the exact commit; the historical validation results below are labeled separately.

Only the 51 reviewed source/test/config-template/SQL/documentation files are eligible for staging. `.env.sentinel.local`, `.env.sentinel.test.local`, all `.local/sentinel/` approvals/probes/evidence, private password files, `.next`, `node_modules`, reports/screenshots/build metadata and database files are excluded. `.env.sentinel.example` and `infra/sentinel/approval.example.json` intentionally contain only safe unapproved templates. Full manifest follows below. The local worker must remain stopped; no automatic merge or manually requested deployment.

14 November 2026 (Asia/Jakarta). Branch `feat/sentinel-s01-platform` was created after fetching remote master and verifying merge `ec6838b77cf14a126cb3c4d1a7f8d86d70d85665`. Starting working tree was clean. S00 files/contracts are preserved. S01 changes are local and uncommitted; no push, merge, deployment or new repository/worktree/application.

## Validation record

### Latest: shutdown fix, real lifecycle retest and final checks PASS

14 November 2026 (Asia/Jakarta). Owner authorization: **S01 Worker Shutdown Fix & Lifecycle Retest**, pasted attachment `20d6005c-314d-45d1-b19f-cd93176c2647/Pasted text.txt`. Database-free probes reproduced missing Ctrl+C/SIGINT delivery through this Windows PTY with bare Node, `tsx` and npm; ordinary stdin worked. The fix adds an idempotent signal/private-IPC coordinator, a testable worker runtime and an approval-gated direct-child smoke command with a three-minute watchdog. It changes no SQL, executor settlement, identity checks or protected application modules. [Full diagnosis, exact source checksums, authorization and actual observations](SENTINEL_H01_ACCEPTANCE.md).

| Final check | Actual result |
| --- | --- |
| Typecheck | **PASS**, `npm.cmd run typecheck`, exit 0 |
| Lint | **PASS**, `npm.cmd run lint`, exit 0 |
| Complete unit/contract suite | **397/397 PASS, 27 files**, `npm.cmd test`, exit 0; 12 new lifecycle cases |
| Focused platform suite | **81/81 PASS, 10 files**, exit 0; deterministic controls / SQL doubles explicitly distinct from real DB tests |
| Production build | **PASS**, exit 0; optimized build and 13 static pages generated using existing skip-dotenv preload |
| Existing browser regressions | **6/6 PASS**, exit 0, 1.7 minutes; Edge, existing isolated UI fixture on 3218, unchanged demo walkthroughs |
| Real PostgreSQL main-worker lifecycle | **PASS**, exit 0, **21.980 seconds total**; exact approved dev target and ledger, startup/idle/shutdown/restart/idle/shutdown |
| First worker / restart | PIDs **12064 / 19476**; startup **586 / 512 ms**, graceful shutdown **22 / 20 ms**, both exits 0 without kill signal |
| Listener, sessions, heartbeats | After each exit PID absent, port 3112 available, zero worker DB sessions, new heartbeat `stopped`; historical stale row unchanged |
| Health / isolation | HTTP 200/ready each cycle, genuine idle heartbeat advancement, dedicated worker role only; queue/outbox/lag zero; provider `not_configured`, telemetry `not_implemented` |
| Previous real PostgreSQL suite | **14/14 PASS preserved**, not rerun; migration pair, role SQL, plan, database/health/queue/outbox adapters unchanged |
| Latest master / ownership | Fetched master remains `ec6838b77cf14a126cb3c4d1a7f8d86d70d85665`; Auth/Guard/Canvas/Demo/shared routing/Guard worker and S00 contracts unchanged |
| Diff / targeted source review | PASS, `git diff --check`; no normal `process.exit()`, scanner imports, private keys or connection URLs introduced |

Commands ran after the implementation changes. No test was skipped or weakened. Coverage percentage was not measured. The initial build invocation failed before Next started because Windows backslashes in the NODE_OPTIONS preload path were interpreted as escapes; the corrected forward-slash preload command above passed without source changes. Existing browser NO_COLOR, React Flow attribution and smooth-scroll warnings remain non-failing. Browser evidence is fixture/UI regression evidence, not live OAuth/scanning/provider acceptance.

The worker is stopped. Runtime-only retest approval is closed and preserves its original record; existing dev/test approval/env files and credentials were unchanged. Only two heartbeat rows were added; no events, jobs, outbox, bindings or test-database fixtures were created. No migrations, infrastructure changes, scanners, providers, commit, PR, merge, deployment or S02. The original terminal interrupt limitation remains documented; private parent IPC is the verified Windows lifecycle mechanism. Actual Linux signals and other Windows terminals were not exercised.

### Historical first worker activation attempt

**Latest worker activation update, 14 November 2026: INCOMPLETE / SHUTDOWN FAILED.** The owner authorized local worker health/lifecycle testing on the approved development target. Startup and idle health passed. Ctrl+C and a subsequent Windows console interrupt did not stop the worker; the shutdown observer exited 1 with `shutdown_verification_failed`. The owned process was forcibly stopped; its listener and database session closed. The retained heartbeat remains `running` and becomes stale. Temporary runtime approval is closed. See [actual observations, timestamps, isolation limits and cleanup](SENTINEL_H01_ACCEPTANCE.md).

| Initial worker/final check | Actual result at that stage |
| --- | --- |
| Dev identity, unchanged plan/ledger | PASS; no migration executed |
| Dedicated worker role / loopback | PASS; one observed worker-role connection; 127.0.0.1:3112 |
| Startup / idle health | PASS; 2 samples, HTTP 200/ready, heartbeat ages 5.51 / 5.30 seconds |
| Guard claim / unregistered project / cross-scope handle | PASS; no jobs/bindings created; trusted worker SQL remains module-scoped |
| Queue / outbox | Observed counts and lag zero; no failed/expired leases |
| Graceful shutdown | **FAIL**; observer exit 1; forced termination required |
| Cleanup | PASS; PID gone, listener closed, worker DB sessions zero; stale heartbeat retained |
| Restart / heartbeat recovery | **NOT RUN** after shutdown failure |
| Final typecheck / lint / all units / build / browser | **NOT RUN** after failure, per owner's stop condition |
| Prior PostgreSQL acceptance | **14/14 PASS**, retained evidence; not rerun |
| Latest master / protected-source diff | Fetched master still `ec6838b77cf14a126cb3c4d1a7f8d86d70d85665`; protected source and S00 contracts unchanged |

No synthetic/live application events or enrollment were added. No implementation/SQL/test or protected module changes were made in this phase. Only the three current documentation reports and ignored runtime/evidence files changed. No commit/PR/deployment/S02. Lifecycle acceptance remains unresolved before PR creation.

The Phase D, bug-fix and preparation records below are historical; their authorization and runtime statements describe those earlier stages. Their test counts are not a fresh final validation run.

**Latest Phase D update, 14 November 2026:** the owner's explicit initial-development-migration approval was recorded privately with only `migrate_up` permitted. The unchanged gated runner applied `0001_foundation` to the verified `127.0.0.1:55432 / wetscan_dev` target and exact approved marker, then repeated the same approved up: **both exit 0**. Before the first run the database had no application schemas/relations/routines or user data. Afterward it has the expected two schemas/eight tables, one matching ledger row (`applied_at=2026-11-14T12:36:51.243Z`), seven forced-RLS runtime tables and only the Sentinel capacity seed. The second run preserved the full captured development state, including ledger timestamp/checksum. Actual app/worker read-only privilege/RLS checks passed; test database state, markers/credentials/role flags and database ACL stayed unchanged. See [Phase D target, approval, role/RLS details and migration evidence](SENTINEL_H01_ACCEPTANCE.md). The main Sentinel worker remains stopped; activation requires separate approval. No commit, merge, deployment or S02.

The following bug-fix/acceptance and preparation entries are historical results retained for provenance; their statements that development is unmigrated describe the earlier stage.

**Previous H01 update, 14 November 2026:** following the owner's narrowly scoped bug-fix authorization, the marker reader now uses `shobj_description`; all identity/approval checks remain intact. Typecheck/lint passed; **69 platform unit tests** passed, including **11 new identity regressions**. The real PostgreSQL rerun at 19:24:58 +07:00 passed **all 14 cases**, exit 0. Test-only up/up/down/up completed and the test ledger has one matching `0001_foundation` row; both migration hashes are unchanged. New normalized `src/platform/database.ts` SHA-256: `025abb619e82ab155ed0a428e950940a2408dba38b74ce7cf0e2845ca23c3d90`. The prior setup failure is retained in [full H01 acceptance history, exact diff/checksums and all 14 results](SENTINEL_H01_ACCEPTANCE.md). At that stage `wetscan_dev` still had no module schemas/user tables; its migration and main worker activation were unauthorized and NOT RUN.

The table below is the preserved S01 preparation/offline validation record, preceding this H01 run. Its zero-connection and BLOCKED_H01 entries describe that earlier preparation stage, not today's provisioned database state.

Results distinguish offline execution from PostgreSQL acceptance. The default suite contains the unchanged 316 baseline tests plus 58 platform tests.

| Check                                           | Result / evidence                                                                                                                                                          |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Typecheck                                       | PASS, `npm run typecheck`, exit 0 after final code changes                                                                                                                 |
| ESLint                                          | PASS, `npm run lint`, exit 0 after final code changes                                                                                                                      |
| Default unit/contract suite                     | PASS, `npm test`: **374 tests / 25 files**, exit 0                                                                                                                         |
| Production build                                | PASS, `npm run build`, exit 0 after final code changes; existing skip-dotenv test preload prevents reading actual Auth env                                                 |
| Existing browser regressions                    | PASS, `npx playwright test --config tests/sentinel/playwright.config.ts`: **6 passed**, exit 0; Edge, unchanged isolated UI fixture on 3218; no live OAuth/provider claims |
| Compose config                                  | PASS, `config --no-interpolate --quiet`; no pull/start/provision                                                                                                           |
| SQL syntax                                      | PASS, pglast 8.8 offline parse: 32 up / 8 down / 5 role-file statements, policy PL/pgSQL block and **64 runtime query templates**; SQL executed against PostgreSQL: 0      |
| Guard/Auth/Canvas/Demo/routing source diff      | PASS, existing protected source files and S00 platform contracts unchanged                                                                                                 |
| Real PostgreSQL acceptance                      | **BLOCKED_H01 / NOT RUN — all 14 cases**                                                                                                                                   |
| Database connections / migrations / new volumes | **0 / 0 / 0**                                                                                                                                                              |

The opt-in suite `tests/platform/postgres.integration.ts` is selected only by `tests/platform/postgres.config.ts` through the approval-gated runner. No default test silently skips or simulates that suite. Default SQL-adapter tests use recording doubles; worker executor tests use fake clocks; authorization tests use explicit doubles. They establish protocol/error behavior, not PostgreSQL durability or live repository permission acceptance. Offline syntax parsing cannot validate row grants, RLS, indexes or concurrency. Existing Guard fixtures remain fixture evidence; Guard live integrations are unchanged/unverified.

## Change manifest

Reviewed full S01 diff against master: **51 files** (7 tracked modifications and 44 additions). The manifest below is the publication allowlist; commit identity and fresh post-commit checks are reported in the PR. The earlier shutdown-fix phase changed nine review files: `package.json`, `worker/sentinel/main.ts`, the three H01/S01 reports and four additions (`worker/sentinel/lifecycle.ts`, `worker/sentinel/runtime.ts`, `scripts/sentinel-worker-smoke.ts`, `tests/platform/lifecycle.test.ts`). The final review additionally reconciles status banners in the existing Sentinel documentation; no implementation/SQL/test changes were needed. Ignored approvals, probes, observations and four existing local env/approval files remain outside this manifest.

```text
.env.sentinel.example
.gitignore
docs/SENTINEL_ARCHITECTURE.md
docs/SENTINEL_COMPATIBILITY.md
docs/SENTINEL_H01_ACCEPTANCE.md
docs/SENTINEL_H01_PREFLIGHT.md
docs/SENTINEL_H01_SETUP.md
docs/SENTINEL_HUMAN_ACTIONS.md
docs/SENTINEL_INTEGRATION_BACKLOG.md
docs/SENTINEL_S01_ARCHITECTURE.md
docs/SENTINEL_S01_MIGRATION_REVIEW.md
docs/SENTINEL_S01_VALIDATION.md
infra/sentinel/approval.example.json
infra/sentinel/compose.yaml
infra/sentinel/provision-roles.sql
migrations/sentinel/0001_foundation.down.sql
migrations/sentinel/0001_foundation.up.sql
package-lock.json
package.json
scripts/sentinel-db.ts
scripts/sentinel-health.ts
scripts/sentinel-postgres-test.ts
scripts/sentinel-worker-smoke.ts
src/features/sentinel/server/platform-projects.ts
src/features/sentinel/storage/projects.ts
src/platform/config.ts
src/platform/database.ts
src/platform/health.ts
src/platform/identity.ts
src/platform/migrations.ts
src/platform/outbox.ts
src/platform/queue.ts
src/platform/retention.ts
tests/platform/claim-process.ts
tests/platform/cli.test.ts
tests/platform/config.test.ts
tests/platform/database.test.ts
tests/platform/helpers.ts
tests/platform/identity.test.ts
tests/platform/lifecycle.test.ts
tests/platform/migrations.test.ts
tests/platform/operations.test.ts
tests/platform/postgres.config.ts
tests/platform/postgres.integration.ts
tests/platform/projects.test.ts
tests/platform/queue.test.ts
tests/platform/worker.test.ts
worker/sentinel/executor.ts
worker/sentinel/lifecycle.ts
worker/sentinel/main.ts
worker/sentinel/runtime.ts
```

- Configuration: `.env.sentinel.example`, `.gitignore`, `infra/sentinel/compose.yaml`, `approval.example.json`, password-free `provision-roles.sql`.
- Schema/runner: paired `migrations/sentinel/0001_foundation.*.sql`; `src/platform/migrations.ts`; `scripts/sentinel-db.ts`.
- Shared adapters: `src/platform/config.ts`, `database.ts`, `identity.ts`, `queue.ts`, `outbox.ts`, `retention.ts`, `health.ts`.
- Sentinel: additive `storage/projects.ts` and `server/platform-projects.ts`; separate `worker/sentinel/main.ts` and `executor.ts`; no routes/UI wiring.
- Tools/tests: `scripts/sentinel-health.ts`, `sentinel-postgres-test.ts`; `tests/platform/` offline and gated PostgreSQL suites plus process-restart helper.
- Dependencies: exact `pg@8.23.1`, `tsx@4.23.15`, development `@types/pg@8.23.1`, manifest/lock and five dedicated scripts including the new local lifecycle smoke command. Existing dependency versions/shared application scripts are preserved; this lifecycle fix did not change the lockfile.
- Documentation: S01 architecture, migration review, H01 manual setup and this report; current status additions in S00 architecture/compatibility/human-actions/backlog. Historical S00 validation is retained.

Lock comparison found 43 added entries and no existing package version/resolution/integrity changes. The existing optional macOS `fsevents` entry lost dev/peer-only flags because the new runtime `tsx` also depends on it; its version is unchanged. Browser output included existing attribution/smooth-scroll and NO_COLOR warnings; all assertions passed. Browser evidence uses the existing UI test fixture and is not a live OAuth, scanner, monitoring or provider acceptance claim.

## Outstanding acceptance and human decisions

H01 instance provisioning, separate test database acceptance and initial development migration were explicitly approved and completed; the historical reports above preserve their evidence. H10 provenance remains owner-reported for Daud. No credentials or approval files are committed. See [H01 setup](SENTINEL_H01_SETUP.md) and [migration review](SENTINEL_S01_MIGRATION_REVIEW.md).

The authorized S01 lifecycle fix, real idle restart/shutdown acceptance and its final checks are complete. The owner has now explicitly approved final review/commit/push/PR publication; merge approval remains separate. Keep the worker stopped. No providers are implemented/enabled. This Windows tool/PTY Ctrl+C path remains unreliable; use the documented private-parent IPC smoke only with a fresh explicit runtime approval. No actual Linux-signal acceptance is claimed. Worker SQL is trusted/module-scoped, 256 MiB old-space is not a hard RSS/CPU sandbox, and future handlers need cooperative abort plus fenced/idempotent effects. The approved mutable workspace namespace limitation remains. No S02 work is included.
