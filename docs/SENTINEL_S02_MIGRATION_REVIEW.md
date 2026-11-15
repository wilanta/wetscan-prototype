# S02 migration review and approval gate

## S02 final review and publication authorization - 15 November 2026

The owner explicitly approved final S02 review, commit, push and a PR targeting master in this conversation. No merge, migration, deployment, production change, worker activation or S03 is authorized. All55reviewed files remain in approved S02 scope: authenticated telemetry/source lifecycle, strict ingestion/redaction/idempotency, additive0002SQL, isolated maintenance retention, opt-in sender, existing-UI integration and scoped test/documentation evidence. Existing Auth/Guard/Canvas, frozen contracts, original shared dispatcher and Demo body remain unchanged; the reviewed AppShell links and Sentinel wrapper are the narrow S02 integration. Latest origin/master fetched at e39b01da167052b8ef9b0ebe369a757fdea729bf, identical to branch base; no conflict or unrelated change found. No dependency/lockfile change.

Fresh finalization checks: typecheck PASS; ESLint PASS; complete unit/contract suite489/489PASS in33files,10.27s; production build PASS with private dotenv loading disabled; unchanged original browser regressions6/6PASS in one standalone3.3minute run; unchanged mocked-transport telemetry browser suite5/5PASS in23.1s. All exits0; no retries, timeout changes or assertion weakening. Original first case59.1s against60s remains a timing limitation; Next reported slow OneDrive filesystem. Browser evidence is fixture-based and separate from prior genuine H02. Existing PostgreSQL TEST suites, H02 HTTP/DB/UI/credential/restart and worker lifecycle were NOT RERUN. No DB connection/migration or main worker/emitter/scanner started in finalization. Existing H02 keys remain revoked/source disabled/runtime approvals closed.

Review corrected one documentation overstatement: the production Load older events button has not been browser-tested; actual API cursor pagination passed and remains distinct. No implementation, migration SQL or permission change, so prior PostgreSQL/H02 acceptance remains applicable. Retained helper/date-input failures stay visible. No raw private database snapshots, credentials, passwords, tokens, local approval/env files or runtime artifacts are included. Final private-argument scans and staged-manifest/whitespace checks precede commit; raw evidence remains ignored.

GitHub read-only checks: master unprotected, protection endpoint404, active branch rules empty; no configured required status checks. No GitHub Actions workflow directory exists in this checkout. Available PR/commit checks will be queried after push/PR; do not interpret absence of enforced checks as independent review approval. No manual Vercel deployment or cloud PostgreSQL configuration is permitted. Commit SHA/PR URL and live check results are reported in the final publication response and PR, not invented in this pre-commit document.

## Prior H02 acceptance and approval-gate record (historical)

**Current H02, 15 November 2026 (Asia/Jakarta): COMPLETE for bounded local controlled-test integration.** Owner explicitly changed the approved target from wilanta/wetscan-prototype to owned wilanta/portfolio (github-998736528). Real interactive GitHub login and fresh existing Auth/Canvas authority verified; workspace github-user-187839747:test. Exact approved wetscan_dev/marker/plan and unchanged prior catalog/data/roles verified before activation. One local/controlled_test source,8persisted events,6receipts and8queued accepted-job references retained. Real HTTP, PostgreSQL, Event Explorer, credential lifecycle, isolation and app-restart evidence passed. Both keys revoked, source disabled, emitter opt-ins zero, runtime approval consumed/closed; app/main-worker/emitter/capture/scanner processes stopped, listeners3000/3112/3113 zero. No migrations, TEST access, production, S03 or publication. Prior489units/typecheck/lint/build,6original-browser/5telemetry-browser and PG-suite evidence are historical, NOT RERUN. S02 is ready for final review; commit/push/PR requires separate owner approval. [Actual H02 evidence](SENTINEL_S02_VALIDATION.md), [handoff](agent-handoffs/HANDOFF_S02.md).

## Earlier status and preparation evidence (historical)

**Current S02,15 November2026:** Owner-approved development0002 migration and identical second up PASS(exit0/0), exact wetscan_dev target/marker and combined plan verified. Four empty telemetry tables,7indexes,8FORCERLS policies and approved privileges verified; S01 schema/data/heartbeats and existing role grants unchanged. No TEST connection or runtime activation. Separate migrate_up-only record consumed/closed; previous approvals untouched. H02 actual owned-app/configuration/web-emitter activation and PR publication remain WAITING_USER; S02 not complete. Prior TEST/static/browser passes preserved, not rerun. [Actual migration and acceptance](SENTINEL_S02_POSTGRES_ACCEPTANCE.md), [handoff](agent-handoffs/HANDOFF_S02.md).

## Historical preparation and initial acceptance record

**Current,15 November 2026: OWNER TEST-ONLY APPROVED, EXECUTED, FAILED ACCEPTANCE.** Exact target/marker/hash and restricted roles passed independent read-only preflight. The test-only up/up/empty0002-down/up sequence completed. S01 passed14/14; S02 passed14, pagination failed1, remaining3 NOT RUN; stopped without fix/retry/reset. SQL and approved hashes unchanged. Both ledger versions remain on TEST with retained fixtures; development was not connected/migrated. New S02 approval/env files preserved S01 records; the one-run approval is now closed after failure with original approval audit fields retained. [Actual report](SENTINEL_S02_POSTGRES_ACCEPTANCE.md). The proposal/commands below document the reviewed initial sequence, not authorization to rerun it against populated telemetry. Next approval is narrow pagination fix plus data-preserving retest; development/app runtime/H02 remain separate gates.

Offline command, no env/pool: `node --import tsx scripts/sentinel-db.ts plan`.

| Item | Reviewed identity |
| --- | --- |
| Foundation pair | `0001_foundation`, unchanged `dd061a60b123284882f154c438de3a171d60967b7b07a4e07200b6693f4eb778` |
| New pair | `0002_telemetry`, `d1b67dc680f5bf3c2cbe585dca2427abf9d7ba9f29479c69b851f66b91c1f5a3` |
| **Combined plan SHA-256** | **`9ceabe57b696fbe59bd51fb5939a197a378abed9c3084802850c4e9d632270f9`** |
| Role provisioning SQL | Existing S01 file unchanged; included in plan hashing, not rerun |
| Proposed acceptance target | Existing PostgreSQL17.12, `127.0.0.1:55432`, `wetscan_s01_test` |
| Acceptance marker | `wetscan-s01:9f3560a6-127f-42a6-abaf-9f45951e6bd5` |
| Later development target | `127.0.0.1:55432`, `wetscan_dev` |
| Development marker | `wetscan-s01:26b6b537-c016-4dc7-8007-4e839e8b838f` |

Targets above are previously approved S01 identities, **proposals for renewed S02 approval**, not current DB verification. Revalidate context/container/version/marker/roles/ledger read-only only after the owner authorizes that connection. Never connect an unknown host or change markers/roles to make a check pass. Existing container `wetscan-sentinel-local-postgres-1`, project `wetscan-sentinel-local`, context `desktop-linux`, volume `wetscan_sentinel_s01_dev_20261114` must be preserved. No provisioning is necessary or authorized here.

## Expected up operations

Dedicated existing migrator role, advisory transaction lock, exact existing ledger validation. With matching foundation already present, create four new Sentinel telemetry tables, primary/foreign/check constraints, three indexes, table grants to existing app/worker roles, FORCE/ENABLE RLS and two policies/table. Insert only the `0002_telemetry` ledger row. No foundation SQL is replayed; no Auth/Guard/Canvas/schema/role/volume/data reset occurs. Full SQL is in `migrations/sentinel/0002_telemetry.up.sql` and must be reviewed directly. Expected records are in the architecture/API documents. Source credentials are secure whole-token SHA-256 hashes only.

All new FK deletion actions are RESTRICT. App cannot delete events/nonces; worker cannot read credentials or modify sources. The existing transaction, queue, roles, project binding and outbox are reused. Worker remains maintenance-only; no automatic startup, scanner enrollment, telemetry detection or provider notification is added.

## Reverse safety and migration runner change

`down` reverses **only the latest applied version**. For 0002 it locks the four new tables and platform.jobs ACCESS EXCLUSIVE and refuses if any S02 table has a row or any telemetry.accepted job exists. Empty-only reversal drops only the four new tables and deletes only the 0002 ledger row. S01 bindings/jobs/heartbeats/outbox/limits remain intact. No CASCADE. A populated S02 database requires a separately reviewed data-preservation/export decision; there is no force/reset path. A subsequent independent down of 0001 still has its original empty-foundation checks. **Never run down on development.**

Shared health now queries the foundation version explicitly instead of mistaking the later 0002 ledger row for a missing foundation. Worker/web startup still verifies the complete exact ordered ledger/checksums. Existing S01 plan approvals cannot be silently carried forward because the combined hash changed. The S01 acceptance ledger-count assertion was generalized to current plan length; its original 14/14 evidence remains unmodified and has not been rerun.

The offline/runtime migration-plan reader now uses a fixed repository-owned `migrations/sentinel` directory rather than an unused configurable directory parameter. This prevents Next from tracing the whole project into API server output. SQL, role provisioning and both version checksums/combined hash are unchanged. Final build traces include only the four migration files and existing roles SQL for this reader, not private env/approval/password files.

## Proposed acceptance sequence requiring explicit approval

1. Approve the exact acceptance target, marker, combined hash, test-only `migrate_up`, `migrate_down`, `integration_test` and the retained legacy worker `runtime` precheck. The S01-style runner conservatively requires that extra precheck even though its worker-role claim subprocesses actually open `integration_test` connections; no main worker is started or left running. Preserve original private approval files; create a new ignored S02 record only after approval.
2. Recheck existing test ledger and absence of S02 objects/rows. Stop on changed SQL, identity, permission conflict or existing unexpected telemetry state. No roles, markers, credentials or databases are recreated.
3. Run `scripts/sentinel-telemetry-test.ts` against a private S02 test configuration. It checks **all** permissions before child processes or pools, then runs the existing S01 14-case PostgreSQL suite first. This executes up/up/down/up; down targets empty 0002 only, preserving foundation. A repeat against populated telemetry is intentionally refused.
4. The runner then executes the new 18-case real PostgreSQL telemetry suite. Synthetic contexts use unique `github-user-7:s02-<UUID>` workspaces and isolated test-only GitHub project IDs. These are DB isolation fixtures, not proof of actual GitHub authorization. It verifies credential lifecycle, RLS, worker grants, atomic persistence, duplicate/concurrent/rate/replay behavior, pagination, separate-process read recovery, bounded retention and refusal to reverse populated telemetry. It leaves uniquely scoped test records for review, never resets either DB. The final expected down attempt is a safety-denial assertion, not a successful reversal.
5. Stop and report all actual cases/failures. No development migration from this approval. If populated acceptance records prevent a later reversal/rerun, request a separately approved target/sequence; do not delete them to force a pass.

Future command only after that explicit approval, using a new ignored `.env.sentinel.s02.test.local` with the unchanged test target/password-file paths and new approval-file path:

```powershell
node --env-file=.env.sentinel.s02.test.local --import tsx scripts/sentinel-telemetry-test.ts
```

After test acceptance, request **separate** development up/up approval for the same exact hash/marker. Use the existing `scripts/sentinel-db.ts up --approve-plan=<combined hash>` with a private S02 development record. `0001_foundation` must remain unchanged; perform ledger/table/grant/RLS checks and idempotent second up without down. No command has been run on either target in S02.

Web runtime approval and H02 actual owned-app selection/registration/emission/retrieval are further explicit configurations. The web API intentionally remains 503 under the existing migration-only S01 approval. See [H02 instructions](SENTINEL_H02_SETUP.md). New SQL, role changes, changed hash/target or unexpected existing state requires renewed review; never bypass the guard.
