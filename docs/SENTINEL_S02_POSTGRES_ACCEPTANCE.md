# S02 development migration verification

## S02 final review and publication authorization - 15 November 2026

The owner explicitly approved final S02 review, commit, push and a PR targeting master in this conversation. No merge, migration, deployment, production change, worker activation or S03 is authorized. All55reviewed files remain in approved S02 scope: authenticated telemetry/source lifecycle, strict ingestion/redaction/idempotency, additive0002SQL, isolated maintenance retention, opt-in sender, existing-UI integration and scoped test/documentation evidence. Existing Auth/Guard/Canvas, frozen contracts, original shared dispatcher and Demo body remain unchanged; the reviewed AppShell links and Sentinel wrapper are the narrow S02 integration. Latest origin/master fetched at e39b01da167052b8ef9b0ebe369a757fdea729bf, identical to branch base; no conflict or unrelated change found. No dependency/lockfile change.

Fresh finalization checks: typecheck PASS; ESLint PASS; complete unit/contract suite489/489PASS in33files,10.27s; production build PASS with private dotenv loading disabled; unchanged original browser regressions6/6PASS in one standalone3.3minute run; unchanged mocked-transport telemetry browser suite5/5PASS in23.1s. All exits0; no retries, timeout changes or assertion weakening. Original first case59.1s against60s remains a timing limitation; Next reported slow OneDrive filesystem. Browser evidence is fixture-based and separate from prior genuine H02. Existing PostgreSQL TEST suites, H02 HTTP/DB/UI/credential/restart and worker lifecycle were NOT RERUN. No DB connection/migration or main worker/emitter/scanner started in finalization. Existing H02 keys remain revoked/source disabled/runtime approvals closed.

Review corrected one documentation overstatement: the production Load older events button has not been browser-tested; actual API cursor pagination passed and remains distinct. No implementation, migration SQL or permission change, so prior PostgreSQL/H02 acceptance remains applicable. Retained helper/date-input failures stay visible. No raw private database snapshots, credentials, passwords, tokens, local approval/env files or runtime artifacts are included. Final private-argument scans and staged-manifest/whitespace checks precede commit; raw evidence remains ignored.

GitHub read-only checks: master unprotected, protection endpoint404, active branch rules empty; no configured required status checks. No GitHub Actions workflow directory exists in this checkout. Available PR/commit checks will be queried after push/PR; do not interpret absence of enforced checks as independent review approval. No manual Vercel deployment or cloud PostgreSQL configuration is permitted. Commit SHA/PR URL and live check results are reported in the final publication response and PR, not invented in this pre-commit document.

## Prior H02 acceptance and approval-gate record (historical)

**Current H02, 15 November 2026 (Asia/Jakarta): COMPLETE for bounded local controlled-test integration.** Owner explicitly changed the approved target from wilanta/wetscan-prototype to owned wilanta/portfolio (github-998736528). Real interactive GitHub login and fresh existing Auth/Canvas authority verified; workspace github-user-187839747:test. Exact approved wetscan_dev/marker/plan and unchanged prior catalog/data/roles verified before activation. One local/controlled_test source,8persisted events,6receipts and8queued accepted-job references retained. Real HTTP, PostgreSQL, Event Explorer, credential lifecycle, isolation and app-restart evidence passed. Both keys revoked, source disabled, emitter opt-ins zero, runtime approval consumed/closed; app/main-worker/emitter/capture/scanner processes stopped, listeners3000/3112/3113 zero. No migrations, TEST access, production, S03 or publication. Prior489units/typecheck/lint/build,6original-browser/5telemetry-browser and PG-suite evidence are historical, NOT RERUN. S02 is ready for final review; commit/push/PR requires separate owner approval. [Actual H02 evidence](SENTINEL_S02_VALIDATION.md), [handoff](agent-handoffs/HANDOFF_S02.md).

## H02 final development data verification

Full actual read-only audit before/after app restart matched ac02318931e86e10807362ba20f65e7819da663a5cdf7c53c7073f82737b6f38. Exact0001/0002ledger/SQL, roles/grants/RLS and original records unchanged; new retained1binding/1source/2revoked hashes/6receipts/8events/8queued jobs. No attempts/outbox changes; seed1/heartbeats3 unchanged. No migrations or TEST access. Final keys revoked/source disabled/runtime approval closed/processes stopped. See validation for12areas and preserved helper failures; this is H02 acceptance, not a rerun of the prior14/18PGsuites.

## Earlier status and preparation evidence (historical)

**H02 update,15 November2026:** owner approved stopping the wildcard app and a bounded loopback restart. Old PID12652 stopped; temporary app PID22180 served127.0.0.1:3000 with successful HTTP200/unauthenticated401 checks, then stopped. The real GitHub sign-in form requires owner interaction; actual Auth/Canvas authority and H02 ingestion/persistence/UI/credential/restart acceptance remain BLOCKED_AUTHENTICATION/NOT RUN. No PostgreSQL connection, ledger recheck, migration or data mutation occurred. Offline approved combined plan/checksums reproduced unchanged. All actual PG acceptance/migration results below remain historical, NOT RERUN. Final app/health listeners and worker/emitter/scanner process matches0. [Current handoff](agent-handoffs/HANDOFF_S02.md).

## Previous development-migration evidence (historical)

15 November 2026, Asia/Jakarta. **Development 0002_telemetry migration PASS; second up/idempotency PASS, both exit0.** H02 web/owned-application activation is NOT authorized or tested. S02 remains incomplete until that separately approved real integration is verified. All prior TEST acceptance and regression evidence below is retained, not rerun.

## Exact owner decision and target

Source: owner's explicit S02 Development Migration Approval in this conversation. Authorized exact-target migrate_up plus one identical up for idempotency, conditional on successful preflight. No down, test-database use, runtime, main worker/emitter/scanner, role/database/container/volume recreation, delete/reset, H02, S03 or publication.

- PostgreSQL17.12 /170012, client endpoint127.0.0.1:55432, database wetscan_dev.
- Marker:wetscan-s01:26b6b537-c016-4dc7-8007-4e839e8b838f; database owner and migration principal wetscan_migrator.
- Container remains healthy with approved immutable image and loopback mapping. PostgreSQL reports internal container port5432; the approved client port remains55432.
- Combined plan SHA256:9ceabe57b696fbe59bd51fb5939a197a378abed9c3084802850c4e9d632270f9, independently reproduced and matched by existing offline plan reader. Foundation pair unchanged dd061a60b123284882f154c438de3a171d60967b7b07a4e07200b6693f4eb778.

## Successful preflight and private approval

Existing S01 approval/config was used solely for READ ONLY foundation preflight with its original S01 hash; never for the S02 migration. Exact target/marker validated by ApprovedPool for app, dedicated worker and migrator logins. All three roles remain LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOBYPASSRLS, with no memberships. Before migration: only matching0001 ledger row;8S01tables/22relations; platform/public/sentinel schemas; no telemetry objects, default privilege overrides or user routines. Foundation column/constraint/ownership/FORCERLS metadata matched the reviewed acceptance baseline. Module seed remained sentinel/max_running2; application jobs/attempts/outbox/project bindings were empty.

Three pre-existing heartbeat rows exactly matched recorded S01 lifecycle evidence: one historical stale running row790e660d-408d-4f8f-8897-91b906a426e7 and two stopped rowsa59e22ad-7429-4b97-90a5-447674c7d981/e1ced748-f7ec-4d6b-a358-a6dcf77931ea. They were preserved, not refreshed or rewritten; no worker process was activated.

An initial local comparison mismatched an older summary's character base type with actual character(64). Read-only diagnosis confirmed correct lengths; the final comparison matches base types and separately enforces64. An intermediate read-only helper query omitted its FROM clause; corrected before successful preflight. These were audit-helper errors, not actual schema drift or migration attempts; no DDL ran until the complete preflight passed.

Only afterward, NEW ignored .local/sentinel/s02-dev-approval.json and .env.sentinel.s02.dev.local were created with exact target/hash and action migrate_up only. Existing credentials were reused through existing password-file paths, no passwords/connection strings printed. Previous S01/S02 approval/env/credential files and all55source/document files were fingerprint-verified unchanged before migration. Old approvals were neither upgraded nor reopened.

## Actual commands and output

Both runs used the existing unmodified gated runner:

node --env-file=.env.sentinel.s02.dev.local --import tsx scripts/sentinel-db.ts up --approve-plan=9ceabe57b696fbe59bd51fb5939a197a378abed9c3084802850c4e9d632270f9

First run output: {"status":"applied","direction":"up","planSha256":"9ceabe57b696fbe59bd51fb5939a197a378abed9c3084802850c4e9d632270f9"}. **Exit0.** Existing ordered foundation ledger was verified; only pending0002 SQL and its ledger row were applied inside the runner's advisory-locked transaction. No0001 reapplication, provisioning or down.

After first-run read-only schema/privilege/data verification passed, the identical command ran again. Same status=applied/direction=up/plan output, **exit0**. The ledger already matched both migrations; no pending SQL was replayed. Full first/second audit snapshot, ACL matrix and effective privilege matrix compare identical. Snapshot SHA256 after each: **dd39932af4a48e5dc185ae9fa1ed479ca1a3f603ef72878bdcee34d99e9d6c90**.

## Ledger, objects and privileges

| Version | Pair checksum | Applied UTC |
| --- | --- | --- |
| 0001_foundation | dd061a60b123284882f154c438de3a171d60967b7b07a4e07200b6693f4eb778 |2026-11-14 12:36:51.243758+00, unchanged|
| 0002_telemetry | d1b67dc680f5bf3c2cbe585dca2427abf9d7ba9f29479c69b851f66b91c1f5a3 |2026-11-14 22:17:24.288225+00 /15Nov05:17:24.288225WIB|

Exactly4new tables: sentinel.telemetry_sources, telemetry_credentials, telemetry_batches, telemetry_events. All owned by wetscan_migrator, empty, ENABLE/FORCE RLS,2policies each. All8policy definitions exactly match the already-tested reviewed policies in private acceptance evidence. Seven new indexes:4primary keys plus telemetry_events_query,telemetry_events_filter,telemetry_batches_retention. Foreign keys retain ON DELETE RESTRICT. No unexpected table/index/routine/schema was created.

| Table | wetscan_app | wetscan_sentinel_worker |
| --- | --- | --- |
| telemetry_sources |SELECT,INSERT,UPDATE|SELECT|
| telemetry_credentials |SELECT,INSERT,UPDATE|none|
| telemetry_events /telemetry_batches |SELECT,INSERT|SELECT,DELETE|

Runtime UPDATE on events/batches remains false. No runtime TRUNCATE/REFERENCES/TRIGGER/MAINTAIN/grant-option privileges. Actual ACL expansion permits only owner/app/worker; no PUBLIC or unauthorized principal grant. Existing role attributes/memberships, schema ACLs, foundation table/column grants and policies remain exactly unchanged. These are read-only catalog/effective-privilege checks on empty development telemetry tables; conflicting-row isolation was established in prior TEST acceptance, not newly claimed here. No fixtures or role switches were used.

## Existing data and stop state

Every pre-existing foundation table definition/index/constraint/policy/owner/OID and grant remained identical. All existing records retained exact full-row fingerprints; only the new0002 ledger row was added. Seed1 and heartbeat3 remain unchanged; jobs/attempts/outbox/notification attempts/project bindings remain0. No telemetry sources, credentials, events or batch receipts were created. No test-database connection or mutation was performed; TEST fixture results remain historical evidence.

New bounded approval is CLOSED_AFTER_COMPLETED_DEVELOPMENT_MIGRATION, active actions[], original owner APPROVED decision/source/approvedActions migrate_up retained, both recorded exits0. It grants no web/worker/emitter startup or future migration. Original private files remain unchanged. Ignored artifacts: s02-dev-preflight.json, s02-dev-preflight-comparison-diagnostic.json, s02-dev-up1.log, s02-dev-after1.json, s02-dev-up2.log, s02-dev-after2.json, private approval/env and read-only audit helpers. Private fingerprint maps must never be printed/committed.

No application, SQL or test source changes were needed. Prior489unit/contract,6original-browser,5telemetry-browser and real PostgreSQL acceptance results are preserved, **not rerun in this migration-only phase**. Remaining gate: identify/authorize the actual owned H02 application/project, endpoint/origin, environment/provenance/retention/rate, private show-once credential handling, bounded web/emitter runtime and acceptance. Main worker/scanners and S03 remain unauthorized. Publication also requires separate approval. See [neutral handoff](agent-handoffs/HANDOFF_S02.md) and [validation](SENTINEL_S02_VALIDATION.md).

---

# Historical TEST retention recovery and acceptance

15 November 2026, Asia/Jakarta. **Case17 PASS:8/8fresh real PostgreSQL checks, exit0,1.80s**, started04:04:42WIB. All18S02 case areas now have passing evidence across separate authorized executions; **no fresh full18/18 or32-case run is claimed**. Original S01 cases14/14 and S02 cases1-14 are historical; pagination15/16/18 passed in the previous focused retest. S02 remains NOT COMPLETE pending development and actual owned-application H02 acceptance.

## Owner authorization and preflight

Source: owner's pasted S02 Retention Fix & Final Regression Recovery, attachment9676af0b-6f2c-4788-b7b8-5e50c8f71b4c. Authorized narrow least-privilege retention fix, deterministic regressions, standalone browser diagnosis/recovery and TEST-only case17 retest. Deletion permitted only for newly created disposable fixture records. No SQL/RLS/grant change, migration, previous evidence deletion, development, main worker/emitter/scanners, H02, S03 or publication.

New ignored .local/sentinel/s02-retention-approval.json and .env.sentinel.s02.retention.local were created without reopening either consumed S02 approval. Active action integration_test only. Exact target/marker/hash checked before pools; all3restricted principals verified PostgreSQL17.12/170012 at127.0.0.1:55432/wetscan_s01_test, markerwetscan-s01:9f3560a6-127f-42a6-abaf-9f45951e6bd5. Independent hashing and existing offline plan reader reproduced9ceabe57b696fbe59bd51fb5939a197a378abed9c3084802850c4e9d632270f9. Read-only preflight snapshot exactly matched the previous complete post-retest snapshot, including all rows, ledger, catalog/roles/grants/RLS; new fixture workspace was absent. Original private files/credential fingerprints remained unchanged.

## Confirmed failure and security-preserving fix

Previous actual SQLSTATE42501 was raised by the event DELETE's SELECT FOR UPDATE candidate query. PostgreSQL requires UPDATE privilege for that row lock; the approved worker deliberately has SELECT/DELETE only on events and batches. Receipt deletion had the same unsupported lock but had not been reached.

retainTelemetry now requires a Sentinel worker and locks the existing project binding FOR UPDATE instead of FOR SHARE. The unchanged S01 UPDATE(last_cleanup_at) column grant already permits this binding lock. No new privileges are added. That lock serializes same-project retention with legal-hold updates, ingestion and queue enrollment (which already lock the binding). After lock acquisition, READ COMMITTED deletion statements see committed holds/pins. Candidate selection uses SELECT only; DELETE supplies the normal row locks. Both outer DELETE and inner candidates explicitly filter live mode/workspace/project, use full composite keys and deterministic ordering, stable statement-clock age cutoffs and LIMIT100. Event candidates exclude every queued/leased Sentinel evidence reference. No telemetry UPDATE, explicit telemetry row lock, table lock, migrator/superuser cleanup or schema change.

The binding lock may wait within existing statement timeouts; this replaces SKIP LOCKED with per-project serialization. Existing source-before-binding ingestion order remains safe because retention does not lock source rows. Terminal-to-active arbitrary direct SQL enrollment is not a supported caller: shared enqueue/claim protocols remain the required boundary. The worker is still an intentionally trusted Sentinel-wide maintenance principal, not a tenant credential; app/Guard denial and explicit per-call scope filtering remain enforced without changing RLS.

Store SHA256:c4a192b94d04d53baecdce15e2092e4d8af5b9f3cc1c66beaa670f144af190ed. New runner scripts/sentinel-retention-test.ts performs no migrations/runtime/main-worker startup. Retention SQL executes only under wetscan_sentinel_worker. The existing migrator is used exclusively for read-only catalog/full-row fingerprint auditing. A test-only SQL firewall blocks worker DDL/DML except explicit telemetry DELETEs with exactly the newly approved primary scope.

## Actual focused case17 results

Command: node --env-file=.env.sentinel.s02.retention.local --import tsx scripts/sentinel-retention-test.ts. Ran once;8PASS/0FAIL,exit0. No original full runner/up/down setup, reset or retry.

| Check | Actual result |
| --- | --- |
| SELECT/DELETE-only grants and FORCE RLS |PASS; UPDATE false on events/batches; real worker UPDATE attempt fails42501 |
| Legal hold |PASS;208new events and206new receipts preserved while held |
| Bounded expiration |PASS; first pass deletes exactly100events/100receipts, keeps queued/leased/recent evidence |
| Concurrent cleanup |PASS; two simultaneous passes delete100and5each per table; no duplicates, no per-pass bound exceeded |
| Scope/authority |PASS; app/Guard retention denied, app RLS hides other project, new expired cross-project event/receipt witness unchanged |
| Concurrent legal hold |PASS; actual pending binding lock observed in pg_locks; committed hold prevents deletion; after explicitly unholding only the new fixture,1eligible event deleted |
| In-flight enqueue |PASS; binding wait observed; newly committed queued pin preserves its event |
| Restart/idempotency |PASS; fresh child process/pool and subsequent repeat return0/0, old full-row fingerprints unchanged |

Only new fixture records deleted:206expired events and205expired batch receipts. No previous fixture, source, credential, queued job or receipt was modified/deleted. All eligible age tests use DB timestamps; no host-clock aging simulation. Queued and synthetically leased job fixtures remain retained; no scanner, consumer or main worker processed them.

## Preserved data and immutable migration state

Disposable primary scope: github-user-7:s02-retention-4763216a-bf2d-47c4-ac37-8eeb7f640a36 /github-123. A new /github-456 in the same workspace is a read/isolation witness; its expired event/receipt were never deletion targets. Every earlier original and pagination-retest row remains byte-equivalent by full JSON SHA256, and ledger, owner, roles/grants and FORCE RLS snapshots are identical.

| Object | Before | After |
| --- | ---: | ---: |
| Bindings |5|7|
| Sources |19|21|
| Credential hashes |20|22|
| Events |21|26|
| Batch receipts |18|20|
| Jobs |16|19|
| Attempts/outbox/notification attempts/heartbeats |0each|0each|

New remaining event evidence:3pinned primary events(2queued,1leased),1recent primary event,1expired cross-project witness. Remaining new receipts:1recent primary plus1expired witness. Three new jobs remain; previous16jobs unchanged.

Ledger unchanged, including application times:

- 0001_foundation:dd061a60b123284882f154c438de3a171d60967b7b07a4e07200b6693f4eb778;2026-11-14 12:24:59.556942+00.
- 0002_telemetry:d1b67dc680f5bf3c2cbe585dca2427abf9d7ba9f29479c69b851f66b91c1f5a3;2026-11-14 20:03:28.380091+00.

New bounded approval is CLOSED_AFTER_COMPLETED_RETENTION_ACCEPTANCE, active actions empty, owner APPROVED decision/source/original actions preserved. Both earlier consumed approvals and all original private inputs unchanged. Ignored evidence: s02-retention-preflight.json, s02-retention-originals.json(private fingerprint map; do not print), s02-retention-run-baseline.json, s02-retention-run-after.json, s02-retention-postgres-run1.log and s02-retention-source-checksums.json. Private browser-before archive preserves prior traces/screenshots. None belongs in Git.

## Browser recovery and final validation

Preserved original3failed traces/error contexts and screenshots under ignored .local/sentinel/s02-retention-browser-before before new execution. Trace inspection found several navigations taking1.5-6.8s, repeated page/axe work consuming the unchanged60s whole-test budget. Completed responses were HTTP200/101; some requests remained status-1. No HTTP4xx/5xx or explicit network suspension was captured in those three trace summaries. ERR_ABORTED at the deadline does not prove a server outage. Exact environmental trigger/resource cause is not established.

Standalone unchanged original suite **6/6PASS,2.1min,exit0**, first fresh full run; previously failing cases now50.2s/21.8s/29.3s. Separate unchanged telemetry browser suite **5/5PASS,24.0s,exit0**. No concurrent build/heavy DB tests during either browser run, no increased timeouts, weakened assertions, Auth/Guard/Canvas/Demo or browser-product changes. This is a clean current recovery run, **not a claim that prior failures were passes or that nondeterminism is permanently fixed**; first case remains near its60s budget. No confirmed product/harness defect justified a browser code patch.

Fresh full unit/contract489/489PASS,33files,7.96s; typecheck/lint PASS. Production build PASS(exit0). Final55-file ownership/whitespace/credential checks PASS; only intentional dummy URL matched, private artifacts ignored. All3API traces174files each with0private artifacts; worker/emitter/scanner processes and health3112listeners0. Exact final evidence is recorded in the validation report. Tests/SQL doubles/browser mocks remain separate from actual authorized GitHub/owned-app H02 evidence. [Detailed validation](SENTINEL_S02_VALIDATION.md).

## Remaining approvals

No confirmed code/PG acceptance failure remains in this scope. Development0002 migration/up-up verification requires explicit owner approval for the development target and unchanged plan; no wetscan_dev connection/mutation occurred. H02 requires actual owned app/project/endpoint/consent/credential setup and separate bounded runtime approval. PR publication is not authorized. Main Sentinel worker/emitter/scanners remain stopped, no commit/push/PR/merge/deploy/S03. Keep the timing variability limitation visible and preserve all fixtures. [Agent-neutral handoff](agent-handoffs/HANDOFF_S02.md).

---

# Historical pagination recovery - retention still blocked at that time

15 November 2026, Asia/Jakarta. **NOT ACCEPTED / S02 NOT COMPLETE.** Fresh focused retest: **5 PASS, 1 FAIL, exit1**, 2.07s, started03:43:25 WIB. This is not a rerun of all S01/S02 cases. Historical results below remain14 S01 PASS;14 S02 PASS, pagination FAIL, remaining3 NOT RUN.

## Current authorization and preflight

Source: owner's pasted S02 Pagination Fix & Nondestructive Acceptance Retest, attachment a6686e1e-7942-48b7-9509-97ff2b277753. Authorized pagination fix/regressions, populated TEST retest, new isolated fixtures, retention only on newly created disposable fixtures and guarded populated rollback refusal. No migration setup/successful down, development, main worker/emitter, H02/S03 or publication.

Separate ignored .local/sentinel/s02-pagination-retest-approval.json and .env.sentinel.s02.retest.local were created. Active actions: integration_test and migrate_down **only for guarded refusal**, no runtime/migrate_up. Prior consumed S02 and S01 approvals/config/credential files were preserved and fingerprint-verified. The new execution record is now CLOSED_AFTER_FAILED_RETEST, actions empty; original owner APPROVED decision, source and approved actions retained. It does not authorize another run.

Read-only preflight verified all three restricted principals on PostgreSQL17.12/170012, **127.0.0.1:55432/wetscan_s01_test**, marker **wetscan-s01:9f3560a6-127f-42a6-abaf-9f45951e6bd5**, owner wetscan_migrator. Both ledger checksums matched. Offline CLI reproduced plan **9ceabe57b696fbe59bd51fb5939a197a378abed9c3084802850c4e9d632270f9**. No SQL, role grants, markers, credentials or migration-runner change in this fix. Before mutation:3 bindings/15 sources/16 hashes/11 events/12 batches/11 jobs, full-row SHA256 and catalog/role/grant/RLS snapshots captured. Suite beforeAll required this exact preflight snapshot and new scopes absent before any fixture write.

## Root cause and correction

The original failed invocation did not capture its first window; its exact clock offset remains unreconstructable. The faulty mechanism is now reproduced against the **same retained real rows**: freeze host time at2026-11-14T20:03:32.500Z; the old default upper bound excludes the newest stored row at.503439Z and returns exactly2of3. No retained row changed. New unit regressions also expose microsecond loss in explicit bounds normalized through JavaScript Date.

TelemetryStore.events() now samples PostgreSQL clock_timestamp() as exact UTC text once for the default upper bound inside the existing scoped transaction. It preserves six-digit fractions in from/to/cursor.at, retains that fraction in the default24-hour lower bound, validates ordering/max31days using integer microseconds, and reuses the cursor window without resampling. Explicit bounds remain inclusive; descending (ingested_at,source_id,event_id), scope/filter binding, RLS and API shape are preserved. No window widening, assertion weakening or event-payload normalization change.

Six new pagination unit cases failed5/6 before the fix and passed6/6 afterward: immediate retrieval with host offsets-10s/0/+10s, submillisecond rows, equal timestamps and page boundaries, stable traversal despite later insert, explicit precise bounds, scope/filter/window denial. Four additional offline safety tests cover populated refusal, empty-precheck refusal, blocking unexpected rollback SQL and detecting evidence modification/removal. SQL doubles do not establish live database success.

## Fresh real PostgreSQL execution

Command: node --env-file=.env.sentinel.s02.retest.local --import tsx scripts/sentinel-telemetry-retest.ts. Separate fail-fast harness; original full runner was NOT repeated. No up/down setup, successful reversal, reset or retry. Case18 ran before retention to complete its guarded safety assertion before any unexpected retention failure.

| Check | Actual result |
| --- | --- |
| 15a Retained three-event traversal under reproduced host skew | PASS, all3IDs once |
| 15b Immediate post-ingest, host-10s, later insertion | PASS, stable window sees initial3, fresh query all4 |
| 15c Equal timestamps across sources and exact inclusive bounds | PASS, all3IDs once |
| 16 Separate process/fresh pool persistence | PASS,7new-scope events observed |
| 18 Populated rollback refusal | PASS, target_denied, ROLLBACK, zero DDL/DML sent; snapshot identical |
| 17 Disposable retention/queued evidence | **FAIL: SQLSTATE42501, permission denied for table telemetry_events** |

**Of the remaining three original cases,16and18 passed;17 failed.** No fresh18/18 or32-case success claimed. Historical1-14 were not rerun. Across executions17distinct S02 cases have passing evidence, with17still failed; acceptance remains incomplete.

Case18 independently verified populated sources and exact ledger before invoking the existing migration runner through a restrictive SQL allowlist. Only BEGIN, advisory/table locks, exact catalog/ledger/occupied-source reads and ROLLBACK could reach PostgreSQL. Any down SQL or ledger DML was blocked before execution. Existing populated guard genuinely raised target_denied.

Case17 created a unique disposable scope with3eight-day-old events,2two-day-old receipts and1queued evidence pin. Legal hold returned zero deletions successfully. After unholding only that new binding, the first retention DELETE containing FOR UPDATE failed. Read-only privilege checks: worker SELECT/DELETE true, UPDATE false for both events and batches. Row locking requires UPDATE privilege absent from approved grants. No code/grant/SQL workaround was made. The transaction rolled back; all3disposable events and2receipts remain. Actual expiration deletion and queued-pin survival through successful cleanup are **not verified**.

## Integrity and ledger

All pre-existing full-row SHA256 fingerprints remain present unchanged, including original source timestamps/counters, credential hashes, bindings, jobs and pagination source. Ledger, owners, roles/grants and RLS policies compare identical before/after. Original private-file fingerprints unchanged. No old evidence cleanup/update/delete or forced retry. New scopes:

- github-user-7:s02-retest-074d03af-1ad7-4855-ab2d-9deec8ce7053
- github-user-7:s02-retest-074d03af-1ad7-4855-ab2d-9deec8ce7053-disposable

| Object | Before | After |
| --- | ---: | ---: |
| Bindings |3|5|
| Sources |15|19|
| Credential hashes |16|20|
| Events |11|21|
| Batch receipts |12|18|
| Queued accepted jobs |11|16|
| Attempts/outbox/notification attempts/heartbeats |0each|0each|

| Ledger version | Unchanged pair checksum | Unchanged applied UTC |
| --- | --- | --- |
| 0001_foundation | dd061a60b123284882f154c438de3a171d60967b7b07a4e07200b6693f4eb778 |2026-11-14 12:24:59.556942+00|
| 0002_telemetry | d1b67dc680f5bf3c2cbe585dca2427abf9d7ba9f29479c69b851f66b91c1f5a3 |2026-11-14 20:03:28.380091+00|

Ignored evidence: s02-retest-preflight.json, s02-retest-originals.json (private-file fingerprints; do not print), s02-retest-run-baseline.json, s02-retest-run-after.json, s02-retest-final-evidence.json, s02-pagination-retest-run1.log and separate retest approval/env. Prior evidence retained. Synthetic DB fixtures do not prove GitHub authorization, owned-app telemetry, protection or providers.

## Fresh non-database validation

Typecheck/lint/production build PASS(exit0); complete unit/contract483/483PASS in32files,11.63s. New telemetry browser fixtures5/5PASS,37.3s. Original browser suite3PASS/3FAIL,4.5min,exit1: interaction accessibility timed out in AxeBuilder.analyze, desktop/mobile accessibility/screenshots exceeded60s, broad-route walkthrough exceeded60s with ERR_ABORTED navigating /app/activity. Cause not established; no source/assertion/timeout changes or retries to force success. Historical original-browser successes remain distinct. Whitespace/source ownership/credential-pattern checks PASS; only harmless dummy URL matched. New private files ignored; all3API build traces174files each with0private artifacts. Main worker process/listener0/0. No unqualified final-regression PASS claim. [Detailed validation](SENTINEL_S02_VALIDATION.md).

## Next gate

Resolve the3browser timeouts before declaring all regressions green. Obtain narrow owner approval for retention permission/locking investigation/fix and another data-preserving case17 retest. Review a safe implementation compatible with least-privilege grants; do not silently grant UPDATE or change migration SQL/hash. Any necessary SQL/permission change needs renewed migration review/approval. Preserve both fixture sets; new approval is closed, old full runner remains unsuitable for populated state. After required acceptance passes, development0002 and H02/runtime need separate approvals. No wetscan_dev connection/migration, main worker/emitter, Guard scanner, H02/S03, commit/push/PR/merge/deploy.

---

# Historical initial acceptance - stopped on pagination failure

15 November 2026, Asia/Jakarta. **NOT ACCEPTED: 28 passed, 1 failed, 3 not run.** No development migration or H02 owned-application acceptance is authorized. No implementation fix or acceptance rerun was performed after the failure.

## Owner decision and scope

Source: the owner's explicit **WetScan Sentinel — S02 PostgreSQL Test Acceptance Approval** message. Decision: **APPROVED for existing TEST database acceptance only, subject to successful final preflight**. Actions: `runtime` for the legacy test precheck only, `integration_test`, `migrate_up`, `migrate_down` on the test target. No main worker/emitter, role/marker/credential/volume changes, development migration, commit, merge, deployment or S03.

| Identity | Verified value |
| --- | --- |
| PostgreSQL | 17.12 (Debian 17.12-1.pgdg12+1), version_num170012 |
| Endpoint/database | `127.0.0.1:55432 / wetscan_s01_test` |
| Marker | `wetscan-s01:9f3560a6-127f-42a6-abaf-9f45951e6bd5` |
| Plan | `9ceabe57b696fbe59bd51fb5939a197a378abed9c3084802850c4e9d632270f9` |
| Context/container | `desktop-linux / wetscan-sentinel-local-postgres-1`, running/healthy |
| Image | `docker.io/library/postgres:17.12-bookworm@sha256:99d1a998c76487d3abb48b141505bda5dcf8089c0c4cd7be40f75de314fa32f0`, linux/amd64 |
| Existing volume | `wetscan_sentinel_s01_dev_20261114`, preserved |
| Principals | `wetscan_app`, `wetscan_sentinel_worker`, `wetscan_migrator`; all LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOBYPASSRLS; no memberships |

Complete 0002 up/down SQL, foundation SQL, migration runner, test runner and both suites were inspected. The CLI and an independent SHA-256 implementation reproduced the exact approved plan; no SQL/role-provisioning file changed. Before DDL, all three existing restricted roles verified the exact database/marker/version. Read-only catalog preflight found eight S01 tables, seven forced-RLS runtime tables, the one correct foundation ledger row, correct owner/grants/limit2 and40max_connections, no S02 relations, zero application rows/other clients. Only the existing Sentinel module-limit row and foundation ledger row were present.

Separate ignored `.local/sentinel/s02-test-approval.json` and `.env.sentinel.s02.test.local` were created, reusing the existing private password-file paths outside the repository/OneDrive. S01 approval/env/credential files were fingerprinted and verified unchanged afterward. No credential values were printed or placed in Git. The new runner adds only `--bail=1` and verbose case reporting to comply with the first-failure stop instruction; no application/SQL logic or assertion was changed.

A local setup attempt compared JSON object key order and stopped before writing the S02 env file. An ensuing runner invocation exited9 because that file was absent; zero SQL/tests ran in that attempt. Value-by-value roundtrip validation resolved the local setup error; the already-created new approval record was preserved. The actual database suite then ran **once**, with the configured target and all approval guards intact.

## Actual results

Command: `node --env-file=.env.sentinel.s02.test.local --import tsx scripts/sentinel-telemetry-test.ts`. Actual test start: **03:03:27 WIB**. S01 duration3.04s; S02 duration1.31s. Overall runner exit **2** after fail-fast. Test describe labels still contain their preparation-stage "BLOCKED/NOT RUN until approval" wording; these are static labels, not the execution result.

| Suite | Passed | Failed | Not run | Result |
| --- | ---: | ---: | ---: | --- |
| S01 real PostgreSQL | 14 | 0 | 0 | PASS |
| S02 real PostgreSQL | 14 | 1 | 3 | FAIL, stopped |
| Total | **28** | **1** | **3** | **NOT ACCEPTED** |

The launcher maps any failed child suite to its generic `database_unavailable` reason. The underlying observed failure is the pagination assertion, not a demonstrated database outage; subsequent read-only identity/catalog queries succeeded.

All fourteen S01 cases passed: migration checksum/idempotency/refusal, transaction rollback, idempotent/concurrent enqueue, bounded concurrent claims, heartbeat/fencing/stale lease, separate-process lease recovery, retries/exhaustion, cancellation/disabled binding, project/workspace/demo RLS, Guard enrollment denial, transactional outbox/provider unavailable, bounded retention/holds, heartbeat/health separation. Its reviewed per-case cleanup removed only that suite's newly created temporary S01 fixtures; no existing or S02 fixture records were removed to force a rerun.

| S02 case | Actual result |
| --- | --- |
| 1 Source registration/hash-only storage | PASS |
| 2 Redacted event + atomic job | PASS |
| 3 Invalid credential | PASS |
| 4 Rotation/revocation | PASS |
| 5 Disable/enable | PASS |
| 6 Wrong project/tampered workspace | PASS |
| 7 FORCE RLS/unfiltered scope isolation | PASS |
| 8 Worker credential/claim boundaries | PASS |
| 9 Nonce/event deduplication | PASS |
| 10 Nonce-content conflict | PASS |
| 11 Replay/clock rejection | PASS |
| 12 Concurrent ingestion | PASS |
| 13 Durable rate rejection/no partial insert | PASS |
| 14 Multi-event conflict rollback | PASS |
| **15 Cursor pagination** | **FAIL: expected 3 events, got 2** |
| 16 Separate-process event read | NOT RUN, fail-fast |
| 17 Telemetry retention/evidence pinning | NOT RUN, fail-fast |
| 18 Populated S02 down protection | NOT RUN, fail-fast |

S01 infrastructure retention and separate-process queue recovery passed; they do **not** establish the three unexecuted S02 cases. The telemetry suite's worker case verifies that a maintenance-only queue does not claim the accepted telemetry jobs and that Guard claims fail; it does not remove the trusted Sentinel worker role's intentional module-wide maintenance authority.

## Migration sequence and ledger

The approved S01 beforeAll sequence completed **up/up/down/up** on the test database. The down reversed only the newly created, empty0002 tables/ledger row; foundation objects were preserved. No post-fixture down, data reset, cleanup to obtain a pass or full-run retry occurred.

| Ledger version | Pair checksum | Applied UTC (ledger) |
| --- | --- | --- |
| `0001_foundation` | `dd061a60b123284882f154c438de3a171d60967b7b07a4e07200b6693f4eb778` | `2026-11-14T12:24:59.556Z`, unchanged |
| `0002_telemetry` | `d1b67dc680f5bf3c2cbe585dca2427abf9d7ba9f29479c69b851f66b91c1f5a3` | `2026-11-14T20:03:28.380Z` /15 November 03:03:28.380 WIB |

Foundation column/constraint/owner/RLS fingerprint remained `836309ed5fbabf86b2a1638adf3c7cba3f962d3412d981897990cf075e857e22`. Restricted role attributes and original private file fingerprints were unchanged. All four new tables are owned by wetscan_migrator with ENABLE/FORCE RLS; the worker cannot SELECT credentials. No `wetscan_dev` connection or S02 migration was performed; its S01-only state was not freshly queried because this approval is test-only.

## Retained evidence and failure diagnosis

| Retained object | Count |
| --- | ---: |
| Project bindings | 3 |
| Telemetry sources | 15 |
| Credential hash records | 16 (2 revoked) |
| Telemetry events | 11 |
| Nonce/batch receipts | 12 |
| Queued `sentinel.telemetry.accepted` jobs | 11 |
| Job attempts / outbox / notification attempts / heartbeat rows | 0 each |

Scopes: `github-user-7:s02-3244b383-f0c9-4ab9-800d-f811a47f5730` projects github-123/github-456, plus the `-other` workspace with github-123. These are **controlled database fixtures, not actual GitHub authorization or owned-app runtime evidence**. All sixteen credential rows have the expected64hex hash shape; the hash test passed. None of eleven stored event JSON values contains the harmless fake sensitive strings used by the suite. No plaintext sender key is retained by the suite.

Failing pagination source: `4240347f-4f2c-4d44-853a-65d1c07760b6`. Read-only inspection confirmed three stored events at20:03:32.462663Z,20:03:32.484339Z and20:03:32.503439Z. A later **read-only diagnostic**, not an acceptance rerun, traversed all three using one-item cursors with exact microseconds. No new records or mutations were made by that diagnostic.

**Likely cause, not proven from the failing invocation:** events() freezes its default upper bound with host `new Date().toISOString()` before the DB query, while ingested_at uses PostgreSQL clock_timestamp(). In a diagnostic sample the database timestamp was20:04:51.014333Z and host20:04:51.011Z, about3.3ms behind. A freshly committed DB event can therefore lie beyond the default host-clock window. The failing test did not record its initial window, so the exact excluded event/window remains unconfirmed. Cursor traversal later succeeding does not retroactively pass the test.

Proposed narrow fix, **not implemented**: derive the default fixed query window from the database clock with sufficient precision, preserve it in every cursor, and add a regression for immediate post-ingest retrieval with host/database clock skew. Do not weaken the expected three-event assertion, enlarge windows blindly or discard the existing fixture data. Check telemetry retention privileges/locking during the still-unexecuted acceptance; no retention success is claimed.

Ignored local artifacts: `s02-preflight.json`, `s02-postgres-acceptance.log` (setup-only missing-file attempt), `s02-postgres-acceptance-run1.log` (actual verbose cases), `s02-postgres-postfailure.json` (read-only catalog/fixture/diagnostic evidence), separate S02 approval and env files. These stay outside the commit manifest. They contain no plaintext passwords or sender credentials. The one-run approval is closed after recording this stopped outcome; the owner's original APPROVED decision/provenance is retained in its audit fields, not represented as an owner revocation.

Current reviewed source-file SHA-256 values are in ignored `s02-reviewed-source-checksums.json` (runner formatting only after execution): telemetry store `e2d96acd8842f9e2a2e0e8ab65446cd469c053372aa7d474ef8ab423694b5b0b`; migration runner `a663b30c28ed4b139a648e16dae6a0eb7f5ea30a32e6e4e138489d62fb326490`; test launcher `f697196a3c4ca11c875932cc3ae390f8715a7c097975595538a38dd219d70539`. The neutral [HANDOFF_S02.md](agent-handoffs/HANDOFF_S02.md) contains the complete 44-file change manifest and continuation prompt. Source ownership, whitespace/manifest and credential-pattern checks passed; the only pattern match is the pre-existing harmless dummy URL in the error-redaction unit test. Main worker process/listener counts are0/0. No static/unit/build/browser suites were rerun in this test-only phase; their earlier evidence remains labelled historical preparation results.

## Next gate

Request **narrow pagination-fix and data-preserving test-retest authorization** first. The original full runner now encounters populated S02 state and must not be rerun by clearing data or forcing empty reversal. A future approved continuation should inspect the retained evidence read-only, review a nondestructive test sequence (including the remaining three cases), then record a fresh exact-target/hash/action approval. SQL/permissions changes require renewed migration-plan review. Development0002 up/up, app runtime and H02 owned-app integration remain separate approvals after acceptance succeeds. No main worker/emitter, scanner, commit/PR, merge, deployment or S03 work occurred.
