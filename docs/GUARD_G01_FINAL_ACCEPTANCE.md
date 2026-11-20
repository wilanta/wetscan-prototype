> Latest N04 review repair: [revision3 offline verification and inactive approval packet](acceptance/guard-g01/remaining-gates-v3/N04_REPAIR_REVIEW.md). DESIGN_REVIEW_ACCEPTED / RUNTIME_NOT_AUTHORIZED;913 offline tests pass. Revision2 packets are retained historical artifacts; changed implementation hashes require a new exact runtime approval.

> Verified offline continuation: [16-case readiness, current test evidence, approval packets and remaining blockers](GUARD_CONTINUATION_VERIFICATION_20261116.md). Overall G01 remains PARTIALLY COMPLETE; no new live case ran.

> Current instruction, 16 November 2026: owner/Codex owns G02-G06 on `feat/guard-g01-s03-integration`, PR #7. Publication to this existing branch is authorized after verification. Runtime cases still require fresh exact-case approval. See [active continuation and actual audit](GUARD_DEVELOPMENT_CONTINUATION.md) and [executable remaining-gate packages](acceptance/guard-g01/remaining-gates-v2/README.md). Earlier dated restrictions and assignments below are historical where superseded; preservation and runtime safety constraints remain.

# Current continuation: remaining G01 acceptance plans; no new runtime/publication approval

The owner requested four separate remaining-gate plans and fresh specific approvals before runtime mutations. Connected Worker/Auth prepare_only and the old exact-job evidence stay PASS/frozen; its 2 enqueue + 1 launch budget is consumed and must not be repeated. Plans and 16 inactive review intents are in [remaining-gates-v1](acceptance/guard-g01/remaining-gates-v1/README.md). They do not activate permits or authorize jobs/containers/faults. Runtime composition, exact specs, case-scoped controls and final artifact hashes must be completed before final execution approval.

Scope is existing localhost:5432/wetscan_s01_test_guardg01 only. Owner confirms external Sentinel NOT_VERIFIED / TARGET_NOT_IDENTIFIED; never probe historical127.0.0.1:55432, create another DB or change Sentinel. Successful down/up on retained rows is blocked by this preservation constraint; source-orphan reaping needs real one-hour age and a new cleanup-only approval window. These limits are not PASS or an automatic G01 waiver. Overall remains PARTIALLY COMPLETE. Publication will require new explicit permission after the final gate decision; historical permission statements below do not authorize commit/push now. G02-G06 not started.

---

# Current G01 decision: connected Worker/Auth PASS prepare_only; overall PARTIALLY COMPLETE

Verified15November2026: two owner-authenticated enqueue HTTP200 responses produce exactly one durable job; one real worker attempt42.005s completed with fence1, observed lease renewals, running?stopped heartbeat, released lease, matching foundation_prepared audit/coverage and fresh final Auth response. Coverage82/90files,175159bytes, partial; scan failed is the truthful G02-unconfigured result, scanner/sandbox NOT_RUN. Post-run SQL18 preservation passes with matching45e7...1095d hashes, differences[],3retained scans/0active leases; actual full target marker independently verified. Old permit bytes/markers and staging preserved. Runtime budget2enqueue+1launch is consumed; no additional action is authorized. Overall G01 remains PARTIALLY COMPLETE: integrated sandbox, live security-negative and real crash/restart/recovery gates remain open.

Read [final Worker/Auth report](acceptance/guard-g01/WORKER_AUTH_ACCEPTANCE_2c18db66.md) and [active Guard continuation](GUARD_DEVELOPMENT_CONTINUATION.md) for exact evidence, provenance/cleanup limits and remaining work. All conflicting older pending/unknown statements below are retained historical checkpoints.

---

# Two enqueues verified ? one durable job; worker launch pending

Both owner-supplied enqueue responses returned HTTP200 with exact scanId 2c18db662dcf8fec6052e05d02ed1362802facd839fca81a71a888c37b09ee18. Read-only observer at 2026-11-15 23:16:47 WIB confirms exactly one matching queued scan revision1 and queue row attempts0/fence0, no lease, attempt row or heartbeat. Scan/queue/audit are unchanged since the first enqueue; idempotent replay is LIVE_VERIFIED. No further enqueue is permitted under this two-call budget.

The four original purpose permits were rechecked and unchanged; 41 implementation hashes match. Approval expires 23:54:19 WIB. One prepare_only launch remains, through the existing authenticated preparation endpoint with body action launch plus the exact scanId. The owner executes OWNER_LAUNCH_WORKER_2c18db66.js only once when instructed; it performs fresh readiness/Auth and one launch POST, no enqueue or scanner. Keep the browser/server open while it awaits the backend result. Do not repeat on error or unknown outcome. Retain authenticated_readiness, worker_launch_started and worker_launch_result safe JSON; do not expose headers/cookies/tokens.

Read-only observers should capture the actual leased job and renewals, worker running/stopped heartbeat, attempt outcome, persisted foundation_prepared audit/coverage and cleanup evidence. HTTP200/childexit0 alone is insufficient. A G02-unconfigured failed scan is expected for prepare_only and must not be called scanner success. Integrated sandbox/security-negative/crash-restart gates remain open; G01 is PARTIALLY COMPLETE. See [actual idempotency evidence](acceptance/guard-g01/worker-auth-second-enqueue-response.job-2c18db66.json).

---

# First enqueue verified ? one durable job; replay pending

Owner supplied actual readiness HTTP200 and first enqueue HTTP200 for exact-job 2c18db662dcf8fec6052e05d02ed1362802facd839fca81a71a888c37b09ee18. Read-only observer at 2026-11-15 23:14:19 WIB confirms bindingMatches true, one guard.scans record queued/revision1 and exactly one platform.jobs record queued/attempts0/fence0, no lease, attempts or heartbeat. Queued audit actor github-user-145520313 and subject/job match. This proves the first durable enqueue, not replay idempotency or worker preparation.

Remaining approval budget: one identical enqueue replay, then one prepare_only worker only after replay verification. Expiry unchanged: 23:54:19 WIB. Owner should execute only the prepared OWNER_SECOND_ENQUEUE_2c18db66.js once when instructed, retain its safe JSON, then await observer confirmation; do not repeat the first script or launch a worker. No scanner/G02/Sentinel/GitHub writes. See [actual first-enqueue evidence](acceptance/guard-g01/worker-auth-first-enqueue-response.job-2c18db66.json). Earlier absent-job/first-request-pending entries are historical.

---

# Current status: draft lost; exact job absent; recovery prepared

Owner reports server stop/page refresh with no subsequent Verify/enqueue/replay/worker. A fresh read-only observer at 2026-11-15 23:06:09 WIB confirms no scan, queue, attempt or heartbeat for exact-job 2c18db66...b09ee18. Original export, binding and nonce remain intact. Acceptance is HOLD_DRAFT_LOST_NO_DURABLE_JOB; no recovery request has been executed and permits were not changed. Existing expiry remains 23:54:19 WIB; changes of scope/artifacts/binding or expiry require fresh explicit approval. See [exact-job recovery procedure](acceptance/guard-g01/DRAFT_RECOVERY_2c18db66.md). G01 remains PARTIALLY COMPLETE; earlier waiting-for-button instructions are superseded.

---

# Current checkpoint: installed deadline repair; new-job approval pending

G01 remains **PARTIALLY COMPLETE**. Source-only acceptance is verified from matching owner-supplied HTTP200 and recovery journal carried forward in CONTINUE_G01.md; no source-only repeat. Deadline v3 is installed in the writable candidate; typecheck/lint/798 units/build/Guard7/Auth21/Canvas17 pass. Latest job is 2c18db662dcf8fec6052e05d02ed1362802facd839fca81a71a888c37b09ee18. New review packet SHA256 7f014b026d5e83634f4a2f07b17ffc9a27aabfe5a50f6c7dd029c7d977a2145a is NOT APPROVED; old permits expired and cannot authorize this different job. No enqueue/live worker/permit activation performed. See [worker recovery checkpoint](acceptance/guard-g01/WORKER_RECOVERY_2c18db66.md) for actual hashes, validation, provenance, retained history and the concrete approval scope. All older statuses and old execution/UI steps below are historical and superseded where they conflict.

---

# Source attempt under investigation - 2026-11-15 21:49 WIB

G01 remains PARTIALLY COMPLETE; source/worker Live acceptance NOT VERIFIED. Owner reported one UI click returning HTTP503 approval_required, no enqueue/launch. The exact approved source permit is still valid; its matching canonical fingerprint is recorded in a .used marker created21:41:26.648WIB. That proves prior validation/reservation, NOT successful snapshot retrieval or cleanup. Replay would reject before provider access, but the supplied response has not yet been correlated with that first reservation. Do not infer a duplicate user click or a final root cause without the timestamped Network/route evidence requested from owner. No marker reset/retry, source, enqueue or worker was performed by the agent.

Two additive unit regressions preserve one-attempt markers and first provider errors:4/4 targeted,784/784 full suite, typecheck and targeted lint PASS. These are unit evidence, not Live. Production implementation/approved hash are unchanged. Permit expires22:35:34WIB; expiry does not permit a retry. See docs/acceptance/guard-g01/worker-source-attempt.json for precise evidence and missing input. Existing user staging remains intact; no commit/push.

---

# G01 final acceptance decision

Updated 2026-11-15T21:03:07.884524+07:00, Asia/Jakarta. **PARTIALLY COMPLETE**. PostgreSQL/RLS isolated acceptance and real Docker control probes are verified. The authenticated connected worker/GitHub-source/sandbox foundation flow is not yet accepted. G02 is NOT READY and has not started.

## Baseline and publication

- Repository wilanta/wetscan-prototype.
- Candidate worktree C:/laragon/www/wetscan-2/wetscan-guard-g01-s03-candidate; branch feat/guard-g01-s03-integration.
- HEAD and local origin tracking ref:1b28fb88ae65a29902e0f1f314efdce44ed3c643. Remote not fetched/revalidated in this sprint. All new changes remain local/uncommitted.
- Masterf7bfeef and old Guard92ee6fa preserved; latest read-only status checks were clean. No branch change, reset, stash, merge, commit, push, PR or deploy.
- Source changes are confined to the already-authorized S03 error-state fix plus Guard snapshot-directory privacy. No dependency, canonical migration/schema source, Auth, Canvas or dashboard change. Actual SQL applies only to the newly approved disposable G01 database.

## Evidence decision by gate

| Gate | Classification | Actual evidence / limitation |
|---|---|---|
|S03 regression|INTEGRATION_VERIFIED|Shared loading/error race fixed by separate formError. Original failing test/assertions retained; fullS03 6/6, new deterministic race3/3 PASS.|
|PostgreSQL target/migration|LIVE_VERIFIED|Actual18.6 localhost:5432, newG01 owner/marker/3platform checksums/Guard checksum verified through approved normal operator pgAdmin and app/worker code.|
|PostgreSQL app/worker RLS/persistence/queue|LIVE_VERIFIED|14 original checks plus11 new missing-context/least-privilege checks, separate authenticated role connections, real PostgreSQL; synthetic metadata only.|
|Isolated Sentinel fixture preservation|LIVE_VERIFIED|Initial recorded observer versus AFTER both suites: hashes identical, differentSections[],20 data fingerprints/catalog/policies/grants/role flags unchanged except exact approved additive Guard policy/grant exclusions.|
|External Sentinel database preservation|NOT_TESTED|No external Sentinel/production DB was inspected, connected or mutated. Isolated fixture evidence is not an assertion about an unobserved database.|
|Docker isolation/control probes|LIVE_VERIFIED|6/6 actual pinned-image containers: isolation controls, output cap, timeout, cancel, OOM, orphan cleanup. All6 removed, filtered run-label listing empty. Synthetic trusted source only.|
|Snapshot host privacy|INTEGRATION_VERIFIED local filesystem|Real default ACL preflight found another inherited reader. New Guard roots now hardened and verified before first source file; actual Windows filesystem tests PASS. Actual GitHub snapshot has not run yet.|
|GitHub account/revision|LIVE_VERIFIED metadata only|Existing Auth/Canvas UI verified inkAja/wdu/main/SHA41861b14dbb3f329fe3b20aed59a008390ef0e2b. Owner exported authentic server-produced draft; no parallel OAuth/session/picker. Source snapshot/revocation acceptance remains pending.|
|Connected worker/Auth execution|BLOCKED pending exact execution approval and app readiness|Concrete exact-job plan/templates prepared from actual UI draft. All WAITING_USER; no worker/enqueue/source operation ran.|
|Worker-to-sandbox full foundation|NOT_TESTED / integration work remains|Existing prepare_only handler does not execute Docker. Current synthetic Docker probe cannot be relabeled as job-bound sandbox execution or production attestation. Must compose/review the existing enforcing adapter with approved image/command/spec/provenance and test the real foundation flow.|

## PostgreSQL actual target, hashes and approved recovery

Target **localhost:5432/wetscan_s01_test_guardg01**, marker **wetscan-s01:aa8b15a6-7ed3-4f19-81f0-07d9759ec62f**, owner **wetscan_guard_migrator**, PostgreSQL**18.6/180006**. Three Guard LOGIN roles app/worker/migrator have no superuser/BYPASSRLS/createdb/createrole/inherit/replication/membership. Canonical prerequisite wetscan_migrator/wetscan_app/wetscan_sentinel_worker are NOLOGIN in this testing setup. No explicit grants outside this target were made; no other database was modified/inspected.

- Guard source plan **b63e1e8568babcf8d7811fe0fa735ecbec11ade64df19bdea78deb030a85869d**, recomputed after all implementation changes, unchanged.
- Guard up/down checksum **8bdea256cdd5ab79b1525f43bd40508acf25e57502a72162ae6b5233dd55693b**; actual guard.schema_migrations version0001_guard matches.
- Platform source aggregate **c3e39f6fd43ee6eb2fbf5b244778955aab4cabb8a11ed3c66d791cf99a252a94**. Actual versions0001_foundation/dd061a60...,0002_telemetry/d1b67dc6...,0003_detection/4f0ee1ce... match full checksums in manifests/evidence.
- Initial provisioning bundle **e6f3b28cd49ac8c875a20b034338645dc4e14a8f81036e200f453f0337a05f01**, owner explicitly approved before any create/migration. SQL01-06 succeeded in NEW DB only.
- Original07:30 failed `new row violates row-level security policy for table module_limits`. Cause: the packet ran INSERT as the non-bypass table owner under FORCE RLS. Operator13 confirmed entire07 transaction rolled back; no Guard schema/budget/policies/grants remained. No reset/replay of01-06.
- Resume bundle **fab43564e7c93293fa7d1149b7da980a33e7a526974e53e46772d98c695a3bfb** separately approved. Only the single Guard budget INSERT runs as the existing postgres operator, then returns to owner; no RLS disable/bypass policy/Sentinel budget change. Owner used normal authenticated pgAdmin after CLI postgres password rejection, without password reset or credential extraction. Resume/started/exit markers preserved; EEXIST safely rejected repeats.
- COMMIT/HTTP alone was not accepted.17 read-only JSON verified structure but its session before-hash was null, so preservation was NOT accepted from that method.18 independently compares the original06 output artifact, parsed fixed aligned columns with row-count assertions, against the current actual DB. No guessed data or fabricated before-hash.

After the two real runtime suites,18 reports **2 retained Guard fixture scans,0active leases**, Guard budget1/Sentinel budget2,7Guard platform policies,24Guard platform grants, FORCE RLS true, correct ledgers. Before/after preservation hash both **45e7cfe26767e26ad96ceda0dd2a53649a10ea7a5453844ac50ee30867e1095d**, differentSections[]. Initial source artifact SHA**184ee7bff8e22b308ffac213ce28ff554d7b87a1d6b47f0cb6d7145caa8fea80**. Projection covers20 relation data fingerprints,20tables,204columns,313constraints,39indexes,38original policies,224original grants,6roles. Only explicitly approved additive Guard platform grants/policies are excluded; Sentinel policies/rows/budget are included.

Runtime-only test request **286a7a3d97e01786b1364387c849c27d09e230000d6093d47bb6206a79978e41** separately approved. Existing guarded file loader consumed purpose-specific owner-provisioned private app/worker credentials internally; agent never inspected/displayed values. Actual suite20:10:40-20:10:43WIB: original14/14 and new11/11 PASS. App/worker permit scope is those two test runners, not a live GitHub job or worker launch; expiry21:05:40WIB. No renewal/reuse is inferred for other operations.

The suites verify separate non-super/bypass role identities, actual scoped persistence/retrieval/idempotency, cross-workspace filtering, competing claims, stale revision/fence denial, lease reclaim, transaction rollback, fresh-pool retrieval, cancellation, existing-row read/update denial with no identity for both roles, and missing-context INSERT rejected42501 with no row persisted. Fresh pool is not worker-process crash/restart proof. No provider/scanner success is claimed.

Rollback plan remains separate:90 refuses retained scans/jobs/workers and has no CASCADE or DB/role drop. It was not executed; do not delete fixtures to force it through. Keep DB/image/fixture/audit/evidence for review; destructive cleanup/down needs exact separate approval. Live schema-up-up/down/recovery procedures beyond tested transaction rollback are not claimed.

## Real Docker evidence

Endpoint**npipe:////./pipe/dockerDesktopLinuxEngine**, daemon**c1c9b326-b14b-4797-8c28-77e288102e53**, Docker29.7.2/linux amd64, kernel6.18.54.1-microsoft-standard-WSL2. Only selected daemon metadata and approved-run resources were inspected.

Exact Docker Official Python reference**docker.io/library/python@sha256:d76f585fb0d5107dd47143da5e61554fd9cae656a30f3470f815cb8475769b6a**; inspected image ID**sha256:d76f585fb0d5107dd47143da5e61554fd9cae656a30f3470f815cb8475769b6a**, RepoDigest python@same digest. Both are actual observed values, not invented.

Attempt1 failed before pull/create when daemon pipe disappeared; original plan/result/.used retained. After owner restarted engine, attempt2 plan**368b9b515529b88d2271a5e309113e6b0a4289de2bcf4ccd7453127f09dbc89d** was explicitly approved. Real execution19:13:39-19:13:58WIB: **6/6 PASS**. Each exact named container was inspected before start: user65532, read-only root/source, network+IPCnone, no socket/host secret env/mount, capdropALL/no-new-privileges, CPU1, RAM/swap256MiB, PID64, tmpfs16MiB. Controls also checked forbidden path/source/root write denial, actual source readability, no TEST-NET egress, cgroup limits and scratch. Excess output64KiB, timeout1.5s, cancellation0.5s, actual memory OOM and orphan cleanup all passed.

All6 owned containers were removed under label/image/name ownership verification. At19:29:49WIB a filtered list for ONLY this run returned zero containers. Source hashes unchanged; owner+SYSTEM-only ACL on the synthetic source root verified. Image, synthetic source and evidence retained. No repository scripts were run on host or in the harness. Production operator attestation was NOT issued and no connected worker-to-container result is claimed.

## Snapshot privacy defect fixed before live-source approval

A new EMPTY directory using the same temp creation mechanism inherited read access for a different Windows account. chmod0700 alone was not NTFS isolation proof. Snapshot acquisition now calls **secureSnapshotDirectory** immediately after root creation and before writing source: verifies empty generated direct-temp directory/no symlink, strips inherited Windows ACL, grants only current owner+SYSTEM inheritable full-control, reads/verifies actual protected descriptor; POSIX verifies0700/owner. OS calls have scrubbed env, bounded output/time, no profile, shell-free icacls/whoami. OS details never become public errors and there is no insecure fallback. Existing directories are never hardened/overwritten.

Initial path comparison incorrectly rejected Windows8.3 aliases; now canonical parent confinement is verified. Full suite first exposed an old launcher child_process mock that lacked execFile; helper now loads execFile only inside the Windows hardening branch, preserving all old assertions. These failures were fixed, not hidden. Targeted28 tests PASS; final full**782/782/63files** PASS. Actual filesystem proof uses synthetic fixtures; real GitHub source snapshot remains pending execution approval.

## Final test commands and artifacts

Exact timestamps/exit codes/classifications are in [evidence-summary.json](acceptance/guard-g01/evidence-summary.json). Local raw logs are ignored under test-results/guard-g01-unblock and private.local/sentinel/guard-g01-unblock. None contains credential values. Current affected checks:

| Command | Result | Dependency classification |
|---|---|---|
|node node_modules/typescript/bin/tsc --noEmit|PASS20:51:16-20:51:20WIB|Static typecheck|
|node node_modules/eslint/bin/eslint.js .|PASS20:51:20-20:51:34|Static lint|
|node node_modules/vitest/vitest.mjs run --reporter=json --outputFile=test-results/guard-g01-unblock/private-snapshot-final-unit.json|782/782,63files, exit0,20:51:34-20:51:42|UNIT_VERIFIED; mocked services, real filesystem/IPC where labeled|
|node tests/guard/run-e2e.mjs|Production build+Guard7/7 PASS20:51:42-20:52:27|INTEGRATION_VERIFIED; fixture Auth/provider|
|node tests/guard/g01/run-regression.mjs auth|21/21 PASS20:52:27-20:53:45|INTEGRATION_VERIFIED; fixture|
|same wrapper canvas|17/17 PASS20:53:45-20:55:27|INTEGRATION_VERIFIED; fixture|
|same wrapper detection / race / sentinel|Earlier same-sprint S03 6/6, race3/3, S02 5/5 PASS; source/assertions retained|INTEGRATION_VERIFIED; fixture; not rerun after Guard-only ACL change|
|same wrapper legacy|Historical6PASS; not rerun here|NOT_TESTED in this continuation|
|node --require ./tests/auth/skip-dotenv.cjs --import tsx worker/guard/plan.ts|b63...5869d, unchanged; no DB operation|Offline artifact check|
|node --require ./tests/auth/skip-dotenv.cjs --import tsx tests/guard/g01/postgres.acceptance.ts|14/14 PASS, exit0|LIVE_VERIFIED PostgreSQL; synthetic metadata|
|same command postgres-context.acceptance.ts|11/11 PASS, exit0|LIVE_VERIFIED PostgreSQL; no mock role/session|
|operator normal pgAdmin18|Matching initial/final hashes, correct2retained scans/0active leases|LIVE_VERIFIED isolated observer; owner-supplied actual JSON|
|approved docker.acceptance.ts --run=exact per-run record|6/6 PASS, exit0|LIVE_VERIFIED Docker; trusted synthetic fixture|
|Live GitHub source-only / connected worker / worker crash-restart / integrated sandbox|Not run; actual UI metadata draft only|BLOCKED/NOT_TESTED pending scoped plan approval/readiness and remaining composition|

## Current worker/Auth plan and remaining requirements

[WORKER_AUTH_PLAN.md](acceptance/guard-g01/WORKER_AUTH_PLAN.md), [worker-auth-request.json](acceptance/guard-g01/worker-auth-request.json), proposed request SHA**d138ea8c79eaf51130f6aab1cf1b8a3fe14f725fb070f75b4da43d8669fdaace**. Actual owner draft file C:/laragon/www/wetscan-2/guard-preparation-request(1).json (original file unchanged). Verified structural binding:

- actor github-user-145520313; workspace github-user-145520313:testing; projectgithub-839286157; repositoryinkAja/wdu.
- main /41861b14dbb3f329fe3b20aed59a008390ef0e2b; profilequick; requested engine metadata sast.
- jobed1db52330e28a2340652da778f02e4cd1c0b9628d663f7685c5856647ccee0c; idempotency401dc6b8-f082-4254-ae3b-256c9d6bf8e6. Existing createJob SHA independently recomputed; this is not a fabricated grant or current-user authorization proof. Backend must revalidate live identity/installation/repository/branch/SHA at operation time.

Five source/preparation/worker/DB-role templates remain WAITING_USER with blank timestamps, plus ignored.env.guard-g01.worker-49f2240c.local containing ONLY Guard paths/flag. No worker/source/job has started. Owner requested review plan first and forbids worker execution before explicit approval. Before asking execution approval, owner must prepare the SINGLE existing candidate app with this sidecar (normal Auth credentials/config consumed only internally), preserving existing Auth store/session, and reexport draft if restart/reverification changes the React idempotency/job ID. Do not silently substitute a new binding. See plan's exact startup command. No second Auth writer, OAuth, onboarding or repo picker.

A future explicit permit may cover one source-only snapshot, one bound enqueue with identical replay for idempotency, and one prepare_only worker claim/heartbeat/snapshot/audit/coverage/cleanup on the approved DB, <=55minutes. Role/source/worker grants are independent; normal Postgres test approvals are not reused. No GitHub repository/settings write, source script execution, container/scanner/G02 or production worker is included. All authority belongs to the requesting owner/operator; do not send them to another operator/Wil for these approvals.

Even a successful prepare_only worker does not close the full sandbox foundation gate. Remaining local integration work must compose the existing enforcing adapter with exact image/command/spec/provenance and operator evidence, and then validate the same real job/snapshot. Do not manufacture production attestation from synthetic fixtures. Live revocation/cancel/timeout/crash/restart need separately controlled approved phases/jobs if not evidenced in positive run. Actual external Sentinel data remains unobserved. No approval to mutate it is requested or assumed.

## Windows startup correction - 2026-11-15T21:12:03.145528+07:00

Owner reported --env-file= not allowed in NODE_OPTIONS with Node24.17.0. Actual installed Next formatter reproduces exit9: process.execArgv env-file is forwarded into child NODE_OPTIONS. API process.loadEnvFile followed by a normal CMD npm.cmd run dev avoids flag inheritance; same command with --help exited0, all G01 configured booleans true, no values printed. Existing.env files/dependencies untouched; no app/worker/enqueue started by agent. Correct command is in [STARTUP_CMD.md](acceptance/guard-g01/STARTUP_CMD.md); worker plan startup instructions updated.

## Configuration, risk and retention

Existing.env.local was never read or overwritten. New sidecars created exclusively/ignored; non-secret review copies are in package. Private purpose-file root is protected to owner+SYSTEM before owner input; helper does not read/overwrite existing files or mutate DB. Existing Guard loader consumes them only after target/purpose/action/hash/expiry checks; no credential values in frontend/IPC/tools/report. Worker sidecar WAITING_USER files are not activated authorizations; flags are not permissions. Do not append duplicate keys to existing user config.

Do not remove initial/resume.used/started/exit markers or repeat bootstrap. Schema rollback, database/role/image deletion/prune and test-resource cleanup need separate exact permission. Retain2 cancelled fixture scans and all evidence. This report does not claim schema-down, production deployment, real SAST/SCA scanning or G01 COMPLETE.

## G02 handoff prompt - gated, copy-ready

```text
Do not start G02 until the owner explicitly accepts G01 and supplies the actual G02 Markdown with an instruction to start. Read docs/GUARD_G01_FINAL_ACCEPTANCE.md, docs/agent-handoffs/HANDOFF_GUARD_G01.md, the worker/Auth plan and linked architecture/reviews. Verify current candidate branch/SHA/local changes; preserve master, old Guard, all source/test/evidence and markers. PostgreSQL25 real checks, isolated before-after preservation and Docker6 real control cases are verified; do not repeat migrations, reset credentials/data, erase markers or replace them with mocks. Preserve the S03 fix and snapshot NTFS privacy hardening. Connected GitHub source/worker/integrated enforcing-sandbox flow and any missing live revocation/restart gates must still be genuinely proven; prepare_only/synthetic Docker controls are not full scan or integrated acceptance. Use existing Auth/Canvas and manual normal UI, no browser computer control or token/cookie exports. Never read.env/credentials, mutate an unapproved target, run untrusted repo scripts on host or publish Git changes without separate explicit instruction. Worker permits are still WAITING_USER until an exact current draft/target/action/hash/expiry approval is received. Only after G01 is truly accepted and G02 provided, read G02 fully, reconcile dependencies/ownership and implement only its approved scope; do not infer later stages.
```

## Exact changed-file manifest

- `docs/GUARD_G01_FINAL_ACCEPTANCE.md`
- `docs/GUARD_G01_LIVE_ACCEPTANCE.md`
- `docs/GUARD_G01_POSTGRES_CONFIG_AUDIT.md`
- `docs/GUARD_IMPLEMENTATION_STATUS.md`
- `docs/acceptance/guard-g01/00-maintenance-preflight.sql`
- `docs/acceptance/guard-g01/01-new-roles.sql`
- `docs/acceptance/guard-g01/02-create-database.sql`
- `docs/acceptance/guard-g01/03-target-and-privileges.sql`
- `docs/acceptance/guard-g01/04-fresh-platform-baseline.sql`
- `docs/acceptance/guard-g01/05-preservation-fixture.sql`
- `docs/acceptance/guard-g01/06-preservation-observer.sql`
- `docs/acceptance/guard-g01/07-guard-platform-access.sql`
- `docs/acceptance/guard-g01/08-guard-schema.sql`
- `docs/acceptance/guard-g01/09-readonly-security-verification.sql`
- `docs/acceptance/guard-g01/10-resume-guard-platform-access.sql`
- `docs/acceptance/guard-g01/11-resume-readonly-preflight.sql`
- `docs/acceptance/guard-g01/12-post-resume-readonly-verification.sql`
- `docs/acceptance/guard-g01/13-recovery-readonly-state.sql`
- `docs/acceptance/guard-g01/14-approved-pgadmin-resume.sql`
- `docs/acceptance/guard-g01/15-session-readonly-observer-before.sql`
- `docs/acceptance/guard-g01/16-session-readonly-observer-after.sql`
- `docs/acceptance/guard-g01/17-readonly-post-resume-evidence.sql`
- `docs/acceptance/guard-g01/18-readonly-initial-observer-comparison.sql`
- `docs/acceptance/guard-g01/90-empty-guard-rollback.REQUIRES-SEPARATE-APPROVAL.sql`
- `docs/acceptance/guard-g01/README.md`
- `docs/acceptance/guard-g01/RESUME.md`
- `docs/acceptance/guard-g01/STARTUP_CMD.md`
- `docs/acceptance/guard-g01/WORKER_AUTH_PLAN.md`
- `docs/acceptance/guard-g01/env.local.additions.example`
- `docs/acceptance/guard-g01/evidence-summary.json`
- `docs/acceptance/guard-g01/manifest.json`
- `docs/acceptance/guard-g01/operator-bootstrap.psql`
- `docs/acceptance/guard-g01/operator-resume.psql`
- `docs/acceptance/guard-g01/preservation-before.captured.json`
- `docs/acceptance/guard-g01/resume-manifest.json`
- `docs/acceptance/guard-g01/runtime-test-request.json`
- `docs/acceptance/guard-g01/sandbox-plan.attempt1.json`
- `docs/acceptance/guard-g01/sandbox-plan.json`
- `docs/acceptance/guard-g01/sandbox-probe.py`
- `docs/acceptance/guard-g01/startup-cmd-evidence.json`
- `docs/acceptance/guard-g01/worker-auth-request.json`
- `docs/acceptance/guard-g01/worker-env.additions.example`
- `docs/agent-handoffs/HANDOFF_GUARD_G01.md`
- `src/features/guard/live/snapshot-directory.ts`
- `src/features/guard/live/snapshot.ts`
- `src/features/sentinel/components/live-detection.tsx`
- `tests/guard/g01/docker.acceptance.ts`
- `tests/guard/g01/postgres-context.acceptance.ts`
- `tests/guard/g01/postgres-launcher.mjs`
- `tests/guard/g01/postgres-resume-launcher.mjs`
- `tests/guard/g01/postgres-state-launcher.mjs`
- `tests/guard/g01/run-regression.mjs`
- `tests/guard/g01/s03-race.config.ts`
- `tests/guard/g01/s03-validation-race.spec.ts`
- `tests/guard/g01/snapshot-directory.test.ts`
- `tests/guard/g01/store-local-passwords.mjs`

Ignored local items are not staged/published: .env.guard-g01.local, .env.guard-g01.worker-49f2240c.local, purpose credential/approval files, markers, operator outputs, raw test logs, Docker configs/synthetic temp roots. Only non-secret evidence summaries/catalog definitions are in the tracked-file candidate manifest.
