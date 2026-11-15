# Sentinel S02 - agent-neutral handoff

## S02 final review and publication authorization - 15 November 2026

The owner explicitly approved final S02 review, commit, push and a PR targeting master in this conversation. No merge, migration, deployment, production change, worker activation or S03 is authorized. All55reviewed files remain in approved S02 scope: authenticated telemetry/source lifecycle, strict ingestion/redaction/idempotency, additive0002SQL, isolated maintenance retention, opt-in sender, existing-UI integration and scoped test/documentation evidence. Existing Auth/Guard/Canvas, frozen contracts, original shared dispatcher and Demo body remain unchanged; the reviewed AppShell links and Sentinel wrapper are the narrow S02 integration. Latest origin/master fetched at e39b01da167052b8ef9b0ebe369a757fdea729bf, identical to branch base; no conflict or unrelated change found. No dependency/lockfile change.

Fresh finalization checks: typecheck PASS; ESLint PASS; complete unit/contract suite489/489PASS in33files,10.27s; production build PASS with private dotenv loading disabled; unchanged original browser regressions6/6PASS in one standalone3.3minute run; unchanged mocked-transport telemetry browser suite5/5PASS in23.1s. All exits0; no retries, timeout changes or assertion weakening. Original first case59.1s against60s remains a timing limitation; Next reported slow OneDrive filesystem. Browser evidence is fixture-based and separate from prior genuine H02. Existing PostgreSQL TEST suites, H02 HTTP/DB/UI/credential/restart and worker lifecycle were NOT RERUN. No DB connection/migration or main worker/emitter/scanner started in finalization. Existing H02 keys remain revoked/source disabled/runtime approvals closed.

Review corrected one documentation overstatement: the production Load older events button has not been browser-tested; actual API cursor pagination passed and remains distinct. No implementation, migration SQL or permission change, so prior PostgreSQL/H02 acceptance remains applicable. Retained helper/date-input failures stay visible. No raw private database snapshots, credentials, passwords, tokens, local approval/env files or runtime artifacts are included. Final private-argument scans and staged-manifest/whitespace checks precede commit; raw evidence remains ignored.

GitHub read-only checks: master unprotected, protection endpoint404, active branch rules empty; no configured required status checks. No GitHub Actions workflow directory exists in this checkout. Available PR/commit checks will be queried after push/PR; do not interpret absence of enforced checks as independent review approval. No manual Vercel deployment or cloud PostgreSQL configuration is permitted. Commit SHA/PR URL and live check results are reported in the final publication response and PR, not invented in this pre-commit document.

## Current continuation prompt - authorized finalization

> Continue feat/sentinel-s02-telemetry in the existing repository. Owner explicitly approved final S02 review/commit/push/PR targetingmaster; never merge automatically. Preserve all55reviewed files, all private evidence/approvals and every DB row. Latest fetched origin/master e39b01da167052b8ef9b0ebe369a757fdea729bf matches feature base. Full scope/security review found no blocking integration issue; source/SQL unchanged since actual H02 acceptance. Fresh typecheck/lint/build PASS,489unit/contract tests PASS,6original-browser PASS(3.3min,firstcase59.1s/60s),5telemetry-browser PASS(23.1s); no DB/H02/worker suite rerun and no migration/runtime activation. H02 previously passed12required areas on owner-approved wilanta/portfolio/github-998736528/workspacegithub-user-187839747:test. Eightcontrolled events,6receipts,8queuedjobs,1source/binding,2revokedhashes retained; source disabled, emitter opt-ins0, runtime/preflight approvals closed; worker stopped. Original ledger/schema/RLS and S01 data preserved; exact plan9ceabe57b696fbe59bd51fb5939a197a378abed9c3084802850c4e9d632270f9 unchanged. Keep historical helper failures and fixture/live distinctions; UI Load older remains unverified in browser tests, real API cursor paging passed. Stage only the manifest55public files after actual-secret/ignore/whitespace/staged-blob checks; commit conventionally, push existing feature branch, create PR with architecture/migration/H02/fresh-vs-prior validation and limitations, then inspect actual check runs/statuses/mergeability. Master currently unprotected/no active branch rules or required checks; repository has no Actions workflow directory. Do not invent CI success or manually deploy Vercel. On CI failure fix only authorized S02 scope; stop for significant regressions/unrelated changes/conflicts. Final report exact SHA/PRURL/CI/manifest/unresolvedissues/merge-readiness and wait for separate explicit merge approval. No migrations, DB tests/reset, production, main worker/scanners, S03 or merge.

## Prior H02 acceptance and approval-gate record (historical)

**Current H02, 15 November 2026 (Asia/Jakarta): COMPLETE for bounded local controlled-test integration.** Owner explicitly changed the approved target from wilanta/wetscan-prototype to owned wilanta/portfolio (github-998736528). Real interactive GitHub login and fresh existing Auth/Canvas authority verified; workspace github-user-187839747:test. Exact approved wetscan_dev/marker/plan and unchanged prior catalog/data/roles verified before activation. One local/controlled_test source,8persisted events,6receipts and8queued accepted-job references retained. Real HTTP, PostgreSQL, Event Explorer, credential lifecycle, isolation and app-restart evidence passed. Both keys revoked, source disabled, emitter opt-ins zero, runtime approval consumed/closed; app/main-worker/emitter/capture/scanner processes stopped, listeners3000/3112/3113 zero. No migrations, TEST access, production, S03 or publication. Prior489units/typecheck/lint/build,6original-browser/5telemetry-browser and PG-suite evidence are historical, NOT RERUN. S02 is ready for final review; commit/push/PR requires separate owner approval. [Actual H02 evidence](../SENTINEL_S02_VALIDATION.md), [handoff](HANDOFF_S02.md).

| Requested H02 area | Actual evidence |
| --- | --- |
| 1 Existing project identity | Real signed-in wilanta; owner-approved portfolio; fresh Auth/Canvas checks; project github-998736528, workspace github-user-187839747:test |
| 2 Source persistence | One UUID source, local/controlled_test,7days,100events/min; DB and actual API agree |
| 3 Actual HTTP ingestion | Existing opt-in reference CLI sends all4families,202; raw HTTP and lifecycle probes add4events |
| 4 Normalization/redaction | DB payload and rendered details omit harmless fake query/fragment/private route/reason/actor data |
| 5 Event Explorer | Actual production route renders8persisted events with controlled-test labels; real source/type/severity/time filters and redacted detail |
| 6 Live/Demo separation | Demo surface contains no H02source/event IDs; real Demo reset followed by identical full DB snapshot |
| 7 Wrong project/workspace | Authenticated unrelated-project GET404, producer mismatch400, tampered key hints401; read-only RLS queries for wrong project/workspace return0 |
| 8 Invalid/revoked keys | Actual401; no unauthorized inserts; both actual keys now revoked |
| 9 Rotation | Old key401, replacement202; disable401/enable202; disable-enable never revives revoked keys |
| 10 Idempotency/concurrency | Exact nonce retry200; new nonce/same event duplicate; conflicting nonce/event409; concurrent identical requests200/202 with one event/job |
| 11 Restart durability | PID21436 stopped, fresh PID9624 returns200 and UI8events; new DB pool/full audit matches before restart exactly |
| 12 Actual timestamps | Persisted created/contact/occurred/ingested values agree with API/UI formatting; no manufactured runtime timestamp |

## Actual H02 target and retained evidence

Owner amendment in this conversation: "Authorize wilanta/portfolio instead; I own it and approve the same bounded local controlled-test scope". The earlier repository mismatch and separate-browser login blockers were resolved explicitly, never inferred. Fresh authenticated source GET reached telemetry_not_configured503 before DB activation, then200/empty after gated configuration, proving the existing authority path was exercised. The sender ran from the existing owned WetScan checkout; no code was installed in the portfolio repository and no actual portfolio request stream or production attack traffic is claimed.

Development target: PostgreSQL17.12/170012 at127.0.0.1:55432/wetscan_dev; marker wetscan-s01:26b6b537-c016-4dc7-8007-4e839e8b838f. Plan9ceabe57b696fbe59bd51fb5939a197a378abed9c3084802850c4e9d632270f9; foundation checksumdd061a60b123284882f154c438de3a171d60967b7b07a4e07200b6693f4eb778 and telemetry checksumd1b67dc680f5bf3c2cbe585dca2427abf9d7ba9f29479c69b851f66b91c1f5a3 unchanged, ledger application times unchanged. All3restricted principals verified during read-only preflight. Exact initial full snapshot matched prior development verification, SHA256dd39932af4a48e5dc185ae9fa1ed479ca1a3f603ef72878bdcee34d99e9d6c90.

Source3b67f63a-f67e-4fa4-96b9-2fecd9a6feba; name H02 local controlled acceptance 2026-11-15; environment local, origin controlled_test, retention7days, rate100/min, maximum20event budget. Actual retained8events:2auth.failed,1http.suspicious_path,4http.request,1ghost.decoy_triggered. The Ghost family is a synthetic wire probe, not an installed decoy or incident. Retained1project binding,1source,2revoked hash-only credentials,6receipts,8events and8queued sentinel.telemetry.accepted jobs. No attempts/outbox/notification records. Original module seed and3historical heartbeats unchanged; the stale running heartbeat label is preserved and does not imply an active worker. No record cleanup, reset or deletion.

Full before/after restart and Demo-reset snapshot hash: ac02318931e86e10807362ba20f65e7819da663a5cdf7c53c7073f82737b6f38. Catalog, both ledger rows/application times, grants/roles/memberships, FORCE RLS and original S01 records match preflight. Web runtime contains only app password-file path and uses wetscan_app; migration/worker credentials never supplied to the web process. Existing migrator/worker principals were used only for gated read-only audit/identity checks, never to write events or execute a worker.

Source created UTC2026-11-15 00:59:30.178073+00; final accepted contact/ingest2026-11-15 01:02:44.755547+00 (08:02:44.755547WIB). Source ended disabled/disconnected, activeCredentials0. Credential13cfd95e-b282-4568-bc5a-6f89cd0bb18c revoked01:02:09.829947+00; replacement752d6160-68d7-4139-9140-c22b50388bc4 revoked01:02:59.057559+00. Plaintext key files remain only in ACL-restricted C:/Users/sheil/.wetscan-sentinel/s02-h02-20261115 outside repo/OneDrive; never returned in tool/chat output or committed. A bounded two-key HTTP capture test helper on127.0.0.1:3113 accepted only the approved localhost origin/scoped route, wrote files directly without key logs, and was stopped immediately after rotation. No permanent API/CORS endpoint was added.

Cleanup confirmed15November08:08:49.9601508+07:00: final appPID9624 stopped, prior runtimes stopped, helper stopped, no3000/3112/3113listeners or matching main-worker/emitter/Guard-worker/capture processes. Emitter opt-ins reset0. Fresh read-only preflight approval closed; fresh H02 runtime-only approval CLOSED_AFTER_COMPLETED_H02_ACCEPTANCE/actions[], original owner provenance/approvedActions retained. All earlier consumed approval/env/password files preserved. No TEST database access, migrations, worker/scanner, production/external provider, commit/push/PR/merge/deploy or S03.

## Honest test accounting and limitations

Requested H02 acceptance areas: **12/12 PASS**, as the evidence matrix shows. This is a collection of actual HTTP/DB/UI/lifecycle observations, not a fresh18case S02 or32case PostgreSQL runner execution. The first private HTTP helper ran10PASS/1FAIL: its final audit incorrectly read a nested scope/evidence wrapper from raw stored payload JSON and threw TypeError. That failed artifact is retained; it was not relabelled or rerun against cleared/replayed data. A separate corrected read-only join/API audit verified all8events/provenance and queued jobs, then repeated in a fresh pool after restart with identical complete state. No application/store/SQL change.

The browser tool's initial date fill changed DOM values without React input events, so an initial time-exclusion check failed. Actual network inspection showed no from/to request; dispatching native input/change events exercised the real UI/server filter:0events before08:00WIB, then1high auth event after restoring the window. No product patch/assertion weakening. One early navigation raced app readiness and failed before startup; subsequent explicit HTTP readiness and navigation passed. Tool select fills required visible option text. Screenshot/file-output attempts were denied by the browser tool's configured workspace roots, so no screenshot artifact is claimed; safe DOM/API observations were saved by the local file tool. No credential was generated during the harmless file-output probe.

Real API cursors traversed8IDs in3pages at limit3 with stable window/no duplicates. The production UI uses default50; its Load older events button was not exercised with this small real dataset and remains unverified in browser tests. A second real GitHub account/workspace was not used; current-account wrong-project HTTP denial and real read-only RLS wrong-scope checks are separately identified. All events are controlled synthetic probes, not observed attacks or automatic portfolio instrumentation. No detection/alerts/incidents/response/notifications/Ghost installation/Intelligence/Guard integrations or S03 consumer. Eight jobs remain queued intentionally. Historical browser timing variability, Windows PTY Ctrl+C limitation and untested Linux worker signals remain historical.

No application/SQL/test/config-template source changed during H02, so broad typecheck/lint/unit/build/browser suites and TEST acceptance were NOT RERUN. Historical489/489units, typecheck/lint/build,6/6original-browser,5/5telemetry-browser; historical14/14S01 and all18S02case areas across separate authorized runs remain accurately labelled. Final-review/publication authorization is still required.

## Private evidence locations

Ignored .local/sentinel files include s02-h02-preflight.ts/json and closed preflight approval; s02-h02-approval.json (closed), source-baseline, runtime1/runtime2-process and startup logs, capture helper/process/safe logs, http.ts/http-results.json (10PASS/1FAIL preserved), key-check.ts and rotated/disabled/enabled/revoked results, readonly-verify.ts and before-restart/after-restart.json, browser-evidence.json/browser-restart.json, emitter-disabled-audit.json and final-cleanup.json. .env.sentinel.s02.h02.local points to the closed runtime record. Earlier stopped attempts are preserved. Outside repo/OneDrive, restricted initial/rotated credential and metadata files plus emitter.env(opt-ins0) remain private. No private artifact belongs in a future commit.

## Historical H02 continuation prompt (publication approval subsequently granted above)

> Continue feat/sentinel-s02-telemetry in the existing wetscan-prototype checkout. Read HANDOFF_S02.md, S02_VALIDATION/POSTGRES_ACCEPTANCE/ARCHITECTURE/API/MIGRATION_REVIEW/H02_SETUP and prior S01 baseline. Preserve all55uncommitted files/0staged, HEAD e39b01da167052b8ef9b0ebe369a757fdea729bf, all private records and retained TEST/dev data. H02 COMPLETE for actual owner-approved wilanta/portfolio (github-998736528), workspace github-user-187839747:test, through real interactive GitHub/Auth/Canvas authority; the owner explicitly changed the originally proposed repository. Existing WetScan checkout ran the opt-in reference sender; no portfolio instrumentation/production monitoring claim. Eight controlled events,6receipts,8queued jobs,1source/binding and2revoked credential hashes retained in wetscan_dev. Both0001/0002ledger rows and plan9ceabe57b696fbe59bd51fb5939a197a378abed9c3084802850c4e9d632270f9 unchanged. Initial snapshotdd39932af4a48e5dc185ae9fa1ed479ca1a3f603ef72878bdcee34d99e9d6c90 matched prior dev verification; full post-acceptance snapshotsac02318931e86e10807362ba20f65e7819da663a5cdf7c53c7073f82737b6f38 identical across app restart/Demo reset. Original S01 records,roles,grants,RLS preserved. Requested H02 areas12/12PASS, but preserve initial helper10PASS/1FAIL(TypeError payload/wrapper assumption) and date-fill interop failure, corrected by separate real read-only/native-event checks; no app/SQL changes or reset. UI shows8events; real API pagination3pages; actual UI Load older remains unverified in browser tests. Prior489units/typecheck/lint/build,6original/5telemetry-browser and PostgreSQL suites NOT RERUN during H02. Bothkeysrevoked, source disabled, emitter opt-ins0, runtime/preflight approvals consumed/closed; all app/worker/emitter/capture/scanner processes stopped and3000/3112/3113listeners0 at08:08:49WIB. No TEST use/migration/production/S03/publication. Next step requires explicit owner final-review/commit/push/PR approval; after authorization fetch/review latest master without discarding work, review all55files, verify ownership boundaries/secret exclusions/compatibility, run appropriate final checks, stage only reviewed public S02 files, commit/push and prepare PR targetingmaster, never auto-merge/deploy/S03 or start worker. Never reopen consumed runtime/test approvals or rerun populated empty-reversal fixtures. A new runtime scope requires a fresh explicit approval record. Keep controlled/live/fixture evidence distinct and report genuine limitations.

## Final H02 source and private-artifact verification

Final ignored audit s02-h02-final-review.json PASS at15November08:12:27WIB: exactly55public changed/new files match the manifest,0staged, branch/HEAD unchanged. H02 modified only10existing status/handoff documents; every application/SQL/test/template fingerprint remains unchanged. Protected Auth/Guard/Canvas/Demo/frozen-contract/foundation/role-provisioning paths have no diff. Original private approval/env/password inputs unchanged. Nine actual secret values checked against all55public changes,0matches; private H02 paths ignored. All3existing Sentinel API build traces contain174files each with0private env/approval/password/credential artifacts. Full tracked diff and all-file whitespace checks PASS. No static/unit/build/browser/TEST suite rerun is implied. Current manifest is retained below.

## Earlier phase evidence (historical; current status above takes precedence)

## Historical H02 authentication-blocked attempts (superseded)

The owner has now authorized bounded LOCAL H02 integration for proposed owned repository `wilanta/wetscan-prototype`, conditional on successful preflight. This supersedes the earlier WAITING_USER statements about initial H02 authorization below. It does not authorize migrations, TEST database use, main-worker/scanner activation, publication or S03. S02 is NOT COMPLETE.

The owner explicitly answered the runtime question: **Authorize bounded stop and loopback restart**. This resolved the previous wildcard-runtime blocker. PID12652 and its `0.0.0.0:3000` listener were reverified before the authorized stop. The first immediate post-stop port check still reported occupied and stopped that command; subsequent read-only verification found both the old process and listener gone. No replacement/unrelated port owner was stopped. The existing S02 production build (BUILD_ID timestamp15November04:06:10 local) was started without rebuild or source edits as hidden PID22180, using `node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3000`. Actual listener was127.0.0.1:3000 only, preserving APP_URL http://localhost:3000. No Sentinel DB runtime configuration was supplied.

The controlled browser navigated to /app and was redirected to /login. Clicking the existing Continue with GitHub button reached the real github.com/login sign-in form, with login/password inputs; no GitHub account sign-in was completed. This used the real existing Auth flow, including its normal anonymous session/OAuth state handling; no session was fabricated, exported or logged. An owner interaction request is pending for real sign-in and selecting wilanta/wetscan-prototype in that controlled browser. The browser may differ from the owner's personal browser; cookie-free onboarding checks do not establish personal-browser login state. Actual repository authority, numeric project ID and Auth-derived workspace remain UNVERIFIED. Do not substitute fixtures, encrypted-store session fabrication or GitHub connector identity.

Actual bounded smoke checks: GET /, /login and /api/onboarding returned200; onboarding was authenticated=false, connected=false, step=workspace. Cookie-free GET /api/sentinel/projects/github-1/sources and /events returned401. These establish unauthenticated denial, not authorization for the proposed real repository or cross-project isolation. Offline plan reader again produced9ceabe57b696fbe59bd51fb5939a197a378abed9c3084802850c4e9d632270f9 with unchanged0001/0002 checksums and zero DB connections. Docker read-only inspect found the existing approved immutable image running/healthy, mapping127.0.0.1:55432; no container/volume change.

No new H02 runtime approval/env, source, ingest credential, emitter configuration or event was created. No PostgreSQL connection, ledger recheck, migration, TEST access, worker activation or credential lifecycle operation occurred. Ingestion/persistence/Event Explorer/isolation/rotation/revocation/connection-restart acceptance remains NOT RUN/BLOCKED; app startup PASS does not establish these. Historical database/static/browser results were not rerun. No code changes required regression reruns. No credential was printed/committed; the legitimate anonymous Auth login flow is not an ingest source or key.

Cleanup verified at15November06:41:34.9675868+07:00: temporary PID22180 stopped after identity verification; original PID12652 remains absent; no port3000/3112 listeners; no matching Sentinel main-worker/emitter/Guard worker processes. No key existed to revoke and no events existed from this attempt to clean up. Private ignored evidence: .local/sentinel/s02-h02-initial-process.json, s02-h02-web-initial.stdout.log, s02-h02-web-initial.stderr.log, s02-h02-unauthenticated-http.json, s02-h02-auth-blocked-cleanup.json. Do not print OAuth state, session cookies or any secret-bearing browser/log content.

All55uncommitted files/0staged are preserved; only the same5status/handoff documents changed in this continuation. Next action requires real interactive GitHub sign-in in the controlled browser; the app is currently stopped. Existing bounded loopback-start permission persists, but recheck port/process identity before restarting. Do not create a DB runtime approval or source until remaining preflight succeeds. Preserve all closed approvals and database records.

### Historical authentication-blocked continuation (superseded)

> Continue feat/sentinel-s02-telemetry in the existing wetscan-prototype checkout. Read this current H02 section before historical records below. Preserve55uncommitted files,0staged and every private/database record. Owner approved bounded stop/loopback restart: old PID12652 stopped; temporary PID22180 successfully served on127.0.0.1:3000 then stopped; final listeners3000/3112 and worker/emitter/scanner counts0. H02 now BLOCKED_AUTHENTICATION: real existing login flow reached github.com/login, awaiting owner interactive sign-in/repository selection in the controlled browser. No credentials/cookies should be sent in chat or fabricated. App is stopped; existing bounded restart permission persists after rechecking port/process identities. Actual Auth/Canvas authorization/workspace/project remain unverified. Offline approved combined plan reproduced; Docker healthy on approved loopback endpoint. No H02 DB approval/env/source/key/events/DB connection or migration yet; only startup/HTTP200/unauthenticated401 smoke checks passed. After real authority and remaining preflight succeed, verify dev PG17.12 target127.0.0.1:55432/wetscan_dev, marker wetscan-s01:26b6b537-c016-4dc7-8007-4e839e8b838f, exact0001/0002 ledger and plan9ceabe57b696fbe59bd51fb5939a197a378abed9c3084802850c4e9d632270f9 using existing gated configuration and fresh runtime-only approval; never reopen consumed approvals. Complete actual authorized project -> one local controlled_test source -> private scoped key -> bounded reference emitter -> HTTP -> PostgreSQL -> Event Explorer and lifecycle/isolation/restart acceptance. Secrets outside repo/OneDrive, revoke key/stop temporary processes, preserve records and report genuine evidence. No migrations, TEST use, main worker/scanners, new repo/worktree/app, production, S03 or commit/push/PR/merge/deploy. S02 remains incomplete; publication requires separate owner approval after H02 succeeds.

## Previous development-migration handoff (historical)

Updated 15 November 2026, Asia/Jakarta. Existing workspace C:/Users/sheil/OneDrive/Dokumen/Wildhan/projects/wetscan-prototype. **Development 0002 migration and second-up idempotency PASS. Web/main-worker/emitter activation and H02 actual owned-application integration remain WAITING_USER. S02 is NOT COMPLETE.** No S03 or publication permission.

## Current Git and latest owner authorization

Branch feat/sentinel-s02-telemetry; HEAD e39b01da167052b8ef9b0ebe369a757fdea729bf (S01 PR #3/master starting point). All 55 listed files remain uncommitted, nothing staged. No clone/worktree/new app, commit/push/PR/merge/deploy. This phase changed only9existing documentation files and ignored local approval/audit files; all application/test/migration/config-template source fingerprints were preserved. Final55-file manifest/whitespace/private-input checks PASS, only intentional dummy URL matched the credential scan; new artifacts ignored. Main worker/emitter/scanner processes and health3112listeners0. Final audit: .local/sentinel/s02-dev-final-review.json.

Latest source: owner's explicit S02 Development Migration Approval in this conversation. It authorized migrate_up plus identical second up on the exact local development target after successful preflight. It authorized no down, TEST use, runtime, main worker/emitter/scanners, H02, S03 or publication. The prior retention/test approvals were not reopened.

## Actual development target and preflight

PostgreSQL17.12/170012, client endpoint127.0.0.1:55432, database wetscan_dev, marker wetscan-s01:26b6b537-c016-4dc7-8007-4e839e8b838f. Database owner/migrator wetscan_migrator. Approved container remains healthy, official immutable PG17.12 image unchanged, mapping127.0.0.1:55432->container5432. No Docker/provisioning operation.

Combined plan independently reproduced and unchanged: 9ceabe57b696fbe59bd51fb5939a197a378abed9c3084802850c4e9d632270f9. S01 checksum dd061a60b123284882f154c438de3a171d60967b7b07a4e07200b6693f4eb778 unchanged. Exact target/marker/restricted login verified for wetscan_app, wetscan_sentinel_worker and wetscan_migrator. All remain non-superuser/non-createdb/non-createrole/non-bypass with no memberships.

Before migration: matching0001 ledger only; 8S01 tables/22relations; no telemetry objects/user routines/default-ACL overrides; app jobs/attempts/outbox/bindings empty; Sentinel module limit2. Foundation columns/constraints/owners/FORCERLS matched reviewed acceptance structure. An old summary omitted character typmods; the corrected comparison checks the same base types and independently enforces approved character(64). An intermediate malformed read-only identity query was corrected before complete preflight pass. No DDL or attempted migration preceded that pass.

Three known historical S01 heartbeat rows were preserved:790e660d-408d-4f8f-8897-91b906a426e7 (running label, stale since2026-11-14 13:37:10.149873+00), a59e22ad-7429-4b97-90a5-447674c7d981 (stopped13:56:07.530196+00), e1ced748-f7ec-4d6b-a358-a6dcf77931ea (stopped13:56:18.177735+00). A persisted running label does not establish a running process; do not rewrite/delete it to hide history.

## Approval, actual up/up output and ledger

The existing S01 approval was used only for READ ONLY foundation preflight with its old plan, never to migrate S02. After complete preflight, NEW ignored .local/sentinel/s02-dev-approval.json and .env.sentinel.s02.dev.local recorded the exact owner decision/target/current hash and action migrate_up only, bounded to two invocations. Existing passwords/configs/approvals remained unchanged, no credentials printed. The new record is now CLOSED_AFTER_COMPLETED_DEVELOPMENT_MIGRATION, active actions[], original owner APPROVED decision/source/approvedActions preserved. Do not reactivate it or infer runtime permission.

Both invocations used the unchanged gated CLI:

node --env-file=.env.sentinel.s02.dev.local --import tsx scripts/sentinel-db.ts up --approve-plan=9ceabe57b696fbe59bd51fb5939a197a378abed9c3084802850c4e9d632270f9

First output: {"status":"applied","direction":"up","planSha256":"9ceabe57b696fbe59bd51fb5939a197a378abed9c3084802850c4e9d632270f9"}, exit0. Runner verified existing0001, applied only0002 and inserted its ledger row in the advisory-locked transaction. No foundation reapplication/down/provisioning. First schema/data/ACL check passed before repeating.

Second output identical, exit0; no pending SQL. Complete first/second catalog/data/ACL/effective-privilege snapshots exactly equal, SHA256 dd39932af4a48e5dc185ae9fa1ed479ca1a3f603ef72878bdcee34d99e9d6c90.

Development ledger now exactly:

- 0001_foundation; checksum dd061a60b123284882f154c438de3a171d60967b7b07a4e07200b6693f4eb778; UTC2026-11-14 12:36:51.243758+00, unchanged.
- 0002_telemetry; checksum d1b67dc680f5bf3c2cbe585dca2427abf9d7ba9f29479c69b851f66b91c1f5a3; UTC2026-11-14 22:17:24.288225+00 (15Nov05:17:24.288225WIB), unchanged on second up.

Four new empty tables: sentinel.telemetry_sources,telemetry_credentials,telemetry_batches,telemetry_events. Owner wetscan_migrator, ENABLE/FORCERLS,2policies each; all8policy definitions exactly match already-tested reviewed policies. Seven indexes:4primary keys plus telemetry_events_query,telemetry_events_filter,telemetry_batches_retention. Foreign keys ON DELETE RESTRICT.

Effective privileges exactly approved: app SELECT/INSERT/UPDATE sources/credentials, SELECT/INSERT events/batches; worker SELECT sources, no credential access, SELECT/DELETE events/batches. No runtime telemetry UPDATE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN or grant option. No PUBLIC/other principal ACL grant. Existing role attributes/memberships, schema ACLs, old table/column grants and RLS unchanged. Read-only empty-table catalog checks do not replace prior conflicting-row TEST isolation evidence.

Every S01 structure/index/constraint/owner/OID/policy/grant and all old full-row fingerprints remained identical. Only0002 ledger row/new objects added. Existing module seed1 and heartbeat3 unchanged, application records0; telemetry sources/credentials/events/receipts0. No security event fixtures created. TEST database was not connected or modified in this phase.

Ignored evidence under .local/sentinel: s02-dev-preflight.json (includes private input fingerprint maps; never print), s02-dev-preflight-comparison-diagnostic.json, s02-dev-up1.log, s02-dev-after1.json, s02-dev-up2.log, s02-dev-after2.json, closed s02-dev-approval.json, plus read-only audit/preflight/verification helper scripts. New env .env.sentinel.s02.dev.local points to the closed migration-only record and does not authorize web runtime. Prior TEST/retention approvals, env and evidence are untouched.

## Remaining H02 and publication gates

No migration failure remains. Do not run another up/down or enable runtime from this handoff alone.

1. Owner must identify one actual owned/authorized application path and owner, actual GitHub repository/project ID and Auth-derived workspace, approved loopback app endpoint/port and existing APP_URL browser origin. Preserve current Auth/session/Canvas authority; no OAuth/settings rewrite to accommodate a different hostname without approval.
2. Confirm instrument/send permission, four controlled event families, environment local, provenance controlled_test, retention1-30days/default7, rate budget, and explicit bounded sender/runtime/negative-test/restart scope. Runtime labels alone prove no runtime observations. External HTTPS/staging, tunnels and providers are separate designs/permissions.
3. After explicit H02 web activation approval, create NEW ignored runtime-only approval/env (for example .local/sentinel/s02-h02-approval.json and .env.sentinel.s02.h02.local) for the same dev identity/full plan. Preserve all closed migration/test records; no integration_test/down/up actions in H02 runtime approval. Never overwrite private files or reuse consumed approvals.
4. Use existing real sign-in/repository selection and fresh project authority to register a controlled_test source. Save show-once ingest key outside repository/OneDrive in ACL-restricted storage without logs/browser storage/CLI secrets. Configure ignored emitter env/key-file path and both opt-ins only after explicit sender approval. No sender/app is started now.
5. Complete actual GitHub authorized-project -> source -> owned-app sender -> PostgreSQL -> Event Explorer flow, same-source redaction/filters/cursor/detail, project/workspace/Demo isolation, retry/conflict/clock/body/concurrent HTTP rejection, rotation/revoke/disable/enable and approved app-process restart persistence. Record real results without keys. Do not reset/delete previous data, flood pending1000job cap, start worker/Guard scanners or implement S03 to consume jobs. Stop approved app/sender processes after bounded acceptance unless owner authorizes otherwise.
6. Actual H02 must pass before S02 COMPLETE. Commit/push/PR publication still needs separate approval; no merge/deploy/S03 permission. Browser timing variability and Windows PTY/Linux-signal historical limitations remain visible.

Prior489unit/typecheck/lint/build,6original-browser/5telemetry-browser and PostgreSQL TEST results below are **historical, not rerun during this migration-only phase**. No implementation/SQL/tests changed, so unnecessary broad reruns were avoided. See [full migration/acceptance](../SENTINEL_S02_POSTGRES_ACCEPTANCE.md), [validation](../SENTINEL_S02_VALIDATION.md), [migration review](../SENTINEL_S02_MIGRATION_REVIEW.md), [H02 setup](../SENTINEL_H02_SETUP.md), [S01 baseline](HANDOFF_S01_BASELINE.md).

## Previous retention and TEST evidence (not executed in this phase)

## Exact retention correction and concurrency boundary

Application change is limited to retainTelemetry in src/features/sentinel/telemetry/store.ts. Previous real 42501 failure occurred in the event DELETE candidate SELECT FOR UPDATE: PostgreSQL requires UPDATE privilege for explicit row locking, while telemetry grants intentionally supply only SELECT/DELETE. Batch candidates had the same latent issue.

The function now:

- Requires a worker PlatformDatabase for module sentinel before retention SQL.
- Locks the exact existing project binding FOR UPDATE instead of FOR SHARE, using the unchanged S01 UPDATE(last_cleanup_at) column grant. No telemetry UPDATE or new privilege is used.
- Reads legal hold under that exclusive binding lock. Same-project cleanup, hold updates, ingestion/enqueue and claims already use compatible binding coordination, so cleanup sees committed holds/pins before subsequent READ COMMITTED statements.
- Deletes via SELECT-only candidates and normal DELETE row locks, with both outer/inner live mode/workspace/project predicates and full composite keys. Stable statement_timestamp age cutoffs, deterministic ordering and LIMIT 100 per table remain.
- Excludes events referenced by any queued/leased Sentinel job; leaves recent events and receipts, source metadata and credentials untouched.

This replaces SKIP LOCKED on telemetry rows with bounded per-project serialization. Lock waits remain subject to existing statement timeouts. Retention does not lock source rows, preserving the source-before-binding ingest lock order. Shared queue/ingest protocols are required; arbitrary terminal-to-active direct SQL writes are not a supported caller. Existing worker authority remains intentionally trusted across Sentinel projects, not a tenant credential. Tests establish app/Guard denial, RLS and explicit per-call filtering, not a newly invented worker tenant boundary.

Store SHA-256: c4a192b94d04d53baecdce15e2092e4d8af5b9f3cc1c66beaa670f144af190ed. Earlier pagination logic is unchanged: default exact PostgreSQL time, six-digit bounds/cursors, fixed 24-hour default window across pages, integer-microsecond max31-day validation and unchanged tuple/filter/project authorization. Original host-bound omission was reproduced on retained rows; its exact original failed invocation offset was never captured.

## New test infrastructure and real PostgreSQL evidence

New files this phase: scripts/sentinel-retention-test.ts, tests/sentinel/retention-postgres.config.ts, retention.postgres.integration.ts, retention-probe.ts and telemetry-retention.test.ts. Dedicated runner validates exact test identity/plan/action before pools and never invokes migrations, the old full runner or main worker. Probe is a bounded child using a fresh restricted-role pool, not the Sentinel worker program.

Retention executes only as wetscan_sentinel_worker. Existing migrator is used solely for READ ONLY catalog/full-row integrity snapshots. Test firewall prohibits worker DDL/DML except telemetry DELETEs whose outer predicate and parameters match the newly approved disposable primary scope. Before writes, suite verifies the exact preflight snapshot, ledger and absent workspace. Original sources/credentials/jobs/receipts/events are never fixture cleanup targets.

Approved TEST identity: PostgreSQL 17.12 /170012, 127.0.0.1:55432, wetscan_s01_test. Marker: wetscan-s01:9f3560a6-127f-42a6-abaf-9f45951e6bd5. All three existing principals verified exact identity; roles/credentials/markers/container/volume remain unchanged. Combined plan independently reproduced and unchanged: 9ceabe57b696fbe59bd51fb5939a197a378abed9c3084802850c4e9d632270f9.

Ledger remains exactly:

- 0001_foundation, checksum dd061a60b123284882f154c438de3a171d60967b7b07a4e07200b6693f4eb778, applied UTC 2026-11-14 12:24:59.556942+00.
- 0002_telemetry, checksum d1b67dc680f5bf3c2cbe585dca2427abf9d7ba9f29479c69b851f66b91c1f5a3, applied UTC 2026-11-14 20:03:28.380091+00.

Command: node --env-file=.env.sentinel.s02.retention.local --import tsx scripts/sentinel-retention-test.ts. Ran once at 04:04:42 WIB; **8/8 PASS, 1.80s, exit 0**:

1. Actual SELECT/DELETE/noUPDATE privileges, forced RLS and worker UPDATE rejection 42501.
2. Legal hold preserves all 208 new events and 206 new receipts.
3. First cleanup deletes exactly 100 eligible events and 100 receipts, preserving queued/leased/recent evidence.
4. Two simultaneous cleanups serialize, deleting 100 and 5 per table without duplicates or exceeding per-pass caps.
5. App/Guard retention denied; app RLS hides other project; expired cross-project witness survives.
6. A real pending lock wait is observed in pg_locks; concurrent committed legal hold blocks deletion. After explicit new-fixture unhold, one eligible event is deleted.
7. Cleanup waits for in-flight enqueue and preserves the newly committed queued evidence pin.
8. Separate process/fresh pool and repeated cleanup return 0/0; previous evidence fingerprints remain unchanged.

Six new SQL-double protocol units also pass, including whole-transaction rollback on receipt deletion failure. First draft had test-only parameter-shape/generic type errors, corrected before PostgreSQL execution; no failed PostgreSQL retest or fixture reset occurred this phase.

## Preserved fixtures and private evidence

Every pre-existing full-row JSON SHA-256 remains unchanged, including all original and previous pagination-retest scopes. Owners, roles/grants, FORCE RLS policies/catalog and both ledger application times compare identical. Original private-file fingerprints also match.

New workspace: github-user-7:s02-retention-4763216a-bf2d-47c4-ac37-8eeb7f640a36. Disposable primary github-123; new github-456 is an isolation witness, never a deletion target. Only new records deleted: **206 expired events and 205 expired receipts**. New retained evidence: three pinned primary events (two queued, one synthetically leased), one recent primary event, one expired cross-project event; one recent primary receipt and one expired cross-project receipt. All jobs, sources and credential hashes remain.

Counts before -> after: bindings 5->7, sources 19->21, credential hashes 20->22, events 21->26, batches 18->20, jobs 16->19. Attempts, outbox, notification attempts and worker heartbeats remain zero. Synthetic leased state is an acceptance fixture, not evidence of a running worker or processed event.

Private ignored artifacts under .local/sentinel include s02-retention-approval.json, s02-retention-originals.json, s02-retention-preflight.json, s02-retention-run-baseline.json, s02-retention-run-after.json, s02-retention-postgres-run1.log, s02-retention-source-checksums.json, unit/build/browser logs and s02-retention-browser-before archive. The original evidence, closed approvals and private env files are preserved. Never rerun old up/up/empty-down/up acceptance on this populated database. Fresh runs require new approval, baseline and unused disposable scopes.

## Browser investigation and fresh full validation

Previous original-browser result was 3 PASS /3 FAIL, with 60s timeouts in interaction/axe, desktop-mobile accessibility/screenshots, and broad route traversal (ERR_ABORTED at /app/activity). Prior traces/error contexts/screenshots were copied before new runs. Trace inspection shows several 1.5-6.8s navigations and cumulative page/axe work consuming whole-case budgets; completed HTTP responses were 200/101, some pending/aborted status -1 entries, no recorded HTTP4xx/5xx or explicit network suspension in extracted summaries. Exact environment/resource trigger remains unproven; no confirmed product defect justified changing UI/Auth/Guard/Canvas/Demo or browser code.

Recovery used one complete standalone original suite and then one separate telemetry suite, without concurrent build/heavy database work:

- Original regressions: **6/6 PASS in one clean run**, 2.1min, exit0. Previously failed cases took 50.2s, 21.8s and 29.3s.
- Telemetry browser fixtures: **5/5 PASS**, 24.0s, exit0.
- No assertion/timeout change or selective retry. Prior failures remain failures. Timing variability remains a limitation (50.2s against60s), not claimed permanently resolved.
- Full unit/contract suite: **489/489 PASS**, 33files, 7.96s, exit0.
- Typecheck, ESLint and production build: PASS, exit0; no broad tracing warnings. Existing skip-dotenv preload excludes private local config during build/browser checks.

S01's 14 real cases and S02 cases1-14 were not rerun. Previous real cases15/16/18 remain supported because their code/SQL did not change. Current case17 closes passing evidence for all18S02case areas across separately authorized runs; never claim a fresh complete18/18 or32-case run. SQL doubles and mocked browser APIs are not real GitHub/owned-app integration evidence. Historical S01 worker shutdown22/20ms and Windows PTY/untested Linux-signal limitations remain historical, not rerun here.

## Completed implementation / architecture

Control plane reuses existing `wetscan_session`, Auth same-origin checks, Canvas identity/workspace and `authorizeSentinelProject` fresh current repository authorization. Workspace `github-user-<id>:<workspace>`, project `github-<repository id>`, Canvas ref `github-user-<id>/github-<repository id>`. No duplicate registry, OAuth, Auth storage or Guard/Canvas implementation change. Existing project binding/transactions/queue/outbox are reused. Workspace rename still changes scope and is not silently migrated.

Sources are per-project UUIDs with immutable local/staging/production environment and runtime/controlled_test provenance. Create/list/status/rotate/revoke/disable/enable implemented. Status derives real accepted-contact timestamps: two-minute connected, <=15-minute stale, older/disabled disconnected, no active key/contact not configured. A runtime label is source-declared and proves no actual runtime observation. Source names are human labels; never put secrets in them.

Credentials: `ws2.<base64url {mode,workspaceId,projectId,sourceId,credentialId}>.<32-random-byte hex secret>`. Route fields are unauthenticated candidate hints, not authority. Store only SHA-256 of the entire token; timing-safe digest comparison; lookup exact scope/source/credential and enabled project/source. Create/rotate return plaintext once, no retrieval endpoint/logging/storage. Rotation locks source and revokes all old active keys atomically; revoke all; disable rejects ingest; enable does not revive revoked keys. No token expiration or automatic GitHub-revocation synchronizer: delegated keys require explicit revoke/disable. Source cap100/project, credential history100/source.

Strict v1 ingest accepts only four frozen event kinds, validates producer project as equality against stored source, rejects unknown/sensitive fields, discards actorHash/provenance claims and conservatively redacts path segments/query/fragment and reason strings. HTTP body64KiB, batch25, controls4KiB, incomplete-body5s deadline, JSON-only/no compression/fatalUTF8. DB-clock past5min/future30s inclusive for all timestamps. Bounded process admission1,500requests/min; durable source event rate1–6,000/min default1,000. Transactions serialize source authentication plus project capacity, atomically store redacted events/nonce receipts/timestamps and `sentinel.telemetry.accepted` durable job references. Identical nonce returns prior receipt; same event under new nonce deduplicates; changed normalized content409; errors/caps roll back whole batch. Redacted canonical content defines fingerprint identity. Project event cap100,000; batch receipt cap10,000; inherited queued/leased jobs cap1,000. No S03 consumer: backpressure429 is intentional, never silently drain/drop jobs to hide it.

Queries are RLS-scoped, filtered by source/eventID/kind/severity/time, cursor paginated by DB microsecond `(ingested_at,source_id,event_id)`. Cursor binds project/filter/fixed window; default24h/max31days; page1–100. Worker retains only maintenance claims; retention <=100 events +100 day-old nonce receipts/project/pass, source event retention1–30days/default7, legal hold and queued/leased evidence pins respected. No Guard scanner, detection rule, alert, incident, notification, Ghost endpoint, response or Intelligence work implemented. Legacy S01 worker `telemetry:not_implemented` health does not probe web ingest; source UI/API represents receipt status, not operational protection.

Existing Sentinel component delegates to live telemetry only for authorized GitHub project; unchanged demo body/reducers remain. Narrow new server route handles live base/activity/sources; original shared catch-all untouched, original Orderly subroutes preserved by fallback. Sidebar Canvas/Sentinel links retain live project; Guard/Ghost/Intelligence still demo. One-time key remains component memory only and remounts on project/section changes. No browser/localStorage key storage. Event Explorer supports source/kind/severity/time filters, redacted detail, stable pagination, visible-tab15s refresh, async states and 150ms filter debounce.

## API / event / database contracts

* `GET /api/sentinel/projects/[projectId]/sources`: authenticated/fresh-authorized -> `{sources:SourceView[]}`. SourceView extends frozen TelemetrySource with name/enabled/activeCredentials/lastContactAt/retentionDays/rateLimit; no plaintext/hashes returned.
* `POST .../sources`: existing origin check then fresh project authority. Create body `{action:"create",ownedApplicationConfirmed:true,source:{name,environment,origin,retentionDays,rateLimit}}`; 201 -> `{sourceId,credentialId,credential,showOnce:true}`. Rotate/revoke/disable/enable body exactly `{action,sourceId}`; rotate returns new one-time credential, others `{sourceId}`. Unknown/forbidden project masked404; errors sanitized/no-store.
* `POST /api/sentinel/ingest`: Bearer credential, JSON envelope `{schemaVersion:1,batchId:<UUID>,sentAt:<UTCISO>,events:[...]}`; no query params or cookie authority. Event: `{schemaVersion:1,eventId:<UUID>,projectId,occurredAt:<UTCISO>,kind,severityHint?,actorHash?,request?,attributes?}`. Kinds exactly auth.failed/http.suspicious_path/http.request/ghost.decoy_triggered; severity info/low/medium/high defaultsinfo. Request allowlist method/routeTemplate/statusCode. Attributes only reasonCode/durationMs/controlled; controlled discarded, unknown reason redacted. No headers/body/IP/email/free text. 202 new /200 nonce retry -> `{batchId,duplicate,events:[{eventId,duplicate}]}`. Invalidkey401, malformed/time400, conflict409, rate/caps429, large413, media415, timeout408, unavailable/unapproved503.
* `GET .../events`: existing auth -> `{items:StoredSecurityEvent[],nextCursor:string|null,window:{from,to}}`; parameters sourceId/eventId/kind/severity/from/to/limit/cursor only. Frozen StoredSecurityEvent includes server scope/source/ingestedAt and evidence origin/source/timestamps; severity is only a sender hint. [Full wire detail](../SENTINEL_S02_API.md).

`0002_telemetry` adds only sentinel.telemetry_sources/credentials/batches/events, scoped composite primary/foreign keys, three indexes and FORCE RLS on all four. App grants SELECT/INSERT/UPDATE source/keys, SELECT/INSERT events/nonces with exact project GUC policies; worker reads source metadata and reads/deletes events/nonces, has NO credential grant. Existing trusted Sentinel worker role can maintain across Sentinel projects; it is not a tenant-facing identity. Existing migrator owns objects with SELECT policy for safe emptiness checks. No new role or foundation SQL change.

## Exact changed-file manifest (55 files)

- docs/SENTINEL_ARCHITECTURE.md
- docs/SENTINEL_H02_SETUP.md
- docs/SENTINEL_HUMAN_ACTIONS.md
- docs/SENTINEL_INTEGRATION_BACKLOG.md
- docs/SENTINEL_S02_API.md
- docs/SENTINEL_S02_ARCHITECTURE.md
- docs/SENTINEL_S02_MIGRATION_REVIEW.md
- docs/SENTINEL_S02_POSTGRES_ACCEPTANCE.md
- docs/SENTINEL_S02_VALIDATION.md
- docs/agent-handoffs/HANDOFF_S01_BASELINE.md
- docs/agent-handoffs/HANDOFF_S02.md
- infra/sentinel/emitter.env.example
- migrations/sentinel/0002_telemetry.down.sql
- migrations/sentinel/0002_telemetry.up.sql
- package.json
- scripts/sentinel-emit.ts
- scripts/sentinel-retention-test.ts
- scripts/sentinel-telemetry-retest.ts
- scripts/sentinel-telemetry-test.ts
- src/app/api/sentinel/ingest/route.ts
- src/app/api/sentinel/projects/[projectId]/events/route.ts
- src/app/api/sentinel/projects/[projectId]/sources/route.ts
- src/app/app/projects/[projectId]/sentinel/[[...section]]/page.tsx
- src/components/app-shell.tsx
- src/components/views/sentinel.tsx
- src/features/sentinel/components/live-telemetry.tsx
- src/features/sentinel/server/telemetry-http.ts
- src/features/sentinel/server/telemetry-runtime.ts
- src/features/sentinel/telemetry/emitter.ts
- src/features/sentinel/telemetry/store.ts
- src/features/sentinel/telemetry/validation.ts
- src/platform/health.ts
- src/platform/migrations.ts
- tests/canvas/fixture/app/app/projects/[projectId]/sentinel/[[...section]]/page.tsx
- tests/canvas/fixture/app/app/telemetry-fixture/page.tsx
- tests/platform/migrations.test.ts
- tests/platform/postgres.integration.ts
- tests/sentinel/retention-postgres.config.ts
- tests/sentinel/retention-probe.ts
- tests/sentinel/retention.postgres.integration.ts
- tests/sentinel/telemetry-http.test.ts
- tests/sentinel/telemetry-pagination.test.ts
- tests/sentinel/telemetry-postgres.config.ts
- tests/sentinel/telemetry-probe.ts
- tests/sentinel/telemetry-retention.test.ts
- tests/sentinel/telemetry-retest-safety.test.ts
- tests/sentinel/telemetry-retest-safety.ts
- tests/sentinel/telemetry-retest.config.ts
- tests/sentinel/telemetry-store.test.ts
- tests/sentinel/telemetry-validation.test.ts
- tests/sentinel/telemetry.playwright.config.ts
- tests/sentinel/telemetry.postgres.integration.ts
- tests/sentinel/telemetry.retest.integration.ts
- tests/sentinel/telemetry.spec.ts
- worker/sentinel/runtime.ts

## S03 dependencies (do not implement yet)

Require accepted real S02/H02 flow first. Future detection must claim only explicitly registered `sentinel.telemetry.accepted`, resolve subjectRef sourceUUID/eventUUID under project scope, honor existing fencing/revision/cancellation/idempotency, treat severity/provenance as untrusted/source-declared, and transactionally record versioned deterministic rule evaluation/alerts. Evidence may be pinned by queued/leased jobs. Do not process Guard scan jobs or invent inventory. Rules/alerts/incidents/outbox notification activation, source disabled behavior for already queued work, rule version/window/out-of-order deduplication, retention outcomes and updated health capability reporting need explicit S03 contracts/tests. No live incident UI should be made from S02 event rows alone.

## Copy-ready continuation prompt

> Continue feat/sentinel-s02-telemetry in C:/Users/sheil/OneDrive/Dokumen/Wildhan/projects/wetscan-prototype. Read HANDOFF_S02.md and S02_POSTGRES_ACCEPTANCE/VALIDATION/MIGRATION_REVIEW/ARCHITECTURE/API/H02 docs. Preserve all55uncommitted files, private records and every TEST/development row; HEAD e39b01da167052b8ef9b0ebe369a757fdea729bf,0staged,noS02publication. Development0002 is now successfully migrated and second up verified idempotent, exits0/0. Exact devPG17.12,127.0.0.1:55432,wetscan_dev,marker wetscan-s01:26b6b537-c016-4dc7-8007-4e839e8b838f,plan9ceabe57b696fbe59bd51fb5939a197a378abed9c3084802850c4e9d632270f9. Ledger0001checksumdd061a60b123284882f154c438de3a171d60967b7b07a4e07200b6693f4eb778/UTC2026-11-14 12:36:51.243758+00;0002checksumd1b67dc680f5bf3c2cbe585dca2427abf9d7ba9f29479c69b851f66b91c1f5a3/UTC2026-11-14 22:17:24.288225+00. Four empty new tables,7indexes,8FORCERLS policies and exact approved app/worker privileges verified; no worker telemetry UPDATE or credential access. First/second whole audit hashdd39932af4a48e5dc185ae9fa1ed479ca1a3f603ef72878bdcee34d99e9d6c90. AllS01structures/grants/records unchanged;3old heartbeat rows preserved, including stale historical running label; no actual worker. New migrate_up-only dev record CLOSED_AFTER_COMPLETED_DEVELOPMENT_MIGRATION, all previous TEST/retention records closed/unchanged. Never reopen/reuse them or rerun migrations/full empty-reversal setup. TEST not connected this phase; historical retained7bindings/21sources/22hashes/26events/20receipts/19jobs untouched. Prior489units/typecheck/lint/build,6original-browser/5telemetry-browser and all18S02case areas across separate realPG runs remain historical, not fresh reruns. S02 NOT COMPLETE. Next required owner approval is H02 actual owned app/repository/workspace/APP_URL/loopback receiver endpoint, consent/env/provenance/retention/rate/private show-once key handling and bounded web/emitter/restart/negative-test scope. After approval use fresh separate runtime-only private H02approval/env, not closeddevrecord. No app/main worker/emitter/Guard scanner startup, runtime, TEST/development mutation, source registration, H02 execution, Auth/Canvas/Guard/Demo/shared-router/S00 rewrites, new repo/worktree/app, S03, commit/push/PR/merge/deploy from this prompt alone. Preserve strict fixture/live distinction and timing/PTY limitations; report genuine evidence and stop at next gate. H02 and publication require separate explicit decisions.
