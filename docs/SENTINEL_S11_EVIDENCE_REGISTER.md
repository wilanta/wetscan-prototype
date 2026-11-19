# Sentinel S11 evidence register (append-only)

Rules: rows are never rewritten; a later correction is a new row that names the row it supersedes. `PASS`, `FAIL`, `NOT_RUN`,
`BLOCKED` are literal. Classification: **FIXTURE** (mocks/loopback/fake providers), **DISPOSABLE-PG** (throwaway PostgreSQL
17.12 container, destroyed afterwards), **DEV-PG** (owner persistent `wetscan_dev`), **FIXTURE-E2E** (production build with
provider-substituted identities). No row is **LIVE** (no real provider, real GitHub session or production system was used).
Environment for all rows: Windows 11, Node v22.20.0, npm 11.4.1, Docker Desktop, Edge (Playwright channel `msedge`).
Authorization: owner's S11 full-development instruction of 19 Nov 2026 (conversation); receipts are in `docs/evidence/s11/`.
Times are UTC. Branch `feat/sentinel-s11-hardening-handoff`.

## A. Candidate identity

| Item | Value |
| --- | --- |
| Base | `master@0ab92568af6b51d769e6334404448694f0cab9ec` (S10 merge, PR #14); clean tree, identical to `origin/master` |
| Code candidate | `1e446cda1b7a59629a4f55b8d93644bfbcd9b7ca` (S11 application/code commit; the local final matrix in section B ran on this exact tree, `git status` clean at start). Later PR commits changed **only CI/test infrastructure and docs** (`.github/`, `.gitattributes`, `scripts/sentinel-ci-s01-fixture.ts`, `tests/sentinel/pg-idle-error-setup.ts`, PG configs, one Playwright wait, docs); `src/`, `worker/` and `next.config.ts` are byte-identical to `1e446cd`. Section F records GitHub-hosted results at the PR head. |
| Migration plan (frozen) | `94f99d996e08bec042aa11a2295087dd69cd35a64d2fc48211292817b287831c`, 9 versions `0001`-`0009`; **S11 adds no migration** |
| Active packages | S00-S10 (all). Deferred: Guard GRD-020/021, WhatsApp, NVD, AI port, production. |

## B. Authoritative runs on the code candidate `1e446cd` (receipt: `final-matrix-1e446cd.log`)

| ID | Package | Command | Start-End (UTC, `07:` + mm:ss) | Result | Count | Class |
| --- | --- | --- | --- | --- | --- | --- |
| E-A1-1 | all | `npm run typecheck` | 00:55-01:06 | PASS | exit 0 | - |
| E-A1-2 | all | `npm run lint` | 01:08-01:45 | PASS | exit 0 | - |
| E-A1-3 | S00-S11 | `npx vitest run` | 01:46-03:59 | PASS | **2098/2098, 112 files** (baseline 1780/108; +318 S11) | FIXTURE |
| E-A1-4 | all | `npm run build` | 03:59-04:22 | PASS | exit 0 | - |
| E-A2-1 | S05 | `test:sentinel:response:postgres` | 04:22-04:33 | PASS | 23/23 | DISPOSABLE-PG |
| E-A2-2 | S06 | `test:sentinel:notifications:postgres` | 04:34-04:47 | PASS | 22/22 | DISPOSABLE-PG |
| E-A2-3 | S07 | `test:sentinel:ghost:postgres` | 04:47-04:54 | PASS | 8/8 | DISPOSABLE-PG |
| E-A2-4 | S08 | `test:sentinel:intelligence:postgres` | 04:54-04:59 | PASS | 15/15 | DISPOSABLE-PG |
| E-A2-5 | S09 | `test:sentinel:external:postgres` | 04:59-05:08 | PASS | 41/41 (offline fixtures, no live feed) | DISPOSABLE-PG |
| E-A2-6 | S10 | `test:sentinel:s10:postgres` | 05:08-05:11 | PASS | 6/6 | DISPOSABLE-PG |
| E-A2-7 | S11 | `test:sentinel:s11:postgres` | 05:11-05:18 | PASS | **13/13** | DISPOSABLE-PG |
| E-A2-8 | S01 | `test:platform:postgres` (gated; generated throwaway approval for `wetscan_s01_test_s11` on a separate disposable container) | 05:18-05:23 | PASS | 14/14 | DISPOSABLE-PG |
| E-A5-1 | S10 | `playwright -c s10.playwright.config.ts` | 05:23-07:20 | PASS | 26/26 (viewports 1440/768/390, dark theme, keyboard, axe, print) | FIXTURE |
| E-A5-2..9 | S02-S09 | `playwright -c {telemetry,detection,incident,response,notification,ghost,intelligence,external}.playwright.config.ts` | 07:20-12:41 | PASS | 5, 6, 3, 3, 6, 4, 8, 10 | FIXTURE |
| E-A5-10 | Demo | `playwright -c tests/sentinel/playwright.config.ts` (original Orderly Demo walkthroughs, unchanged) | 12:42-15:36 | PASS | 6/6 | FIXTURE |
| E-A5-11 | Auth/Canvas | `node tests/auth/run-github-e2e.mjs` (production build, 3 isolated servers, provider-substituted GitHub identities) | 15:36-18:17 | PASS | 21/21 | FIXTURE-E2E |
| E-A6-1 | repo | `npm run sentinel:secret-scan` | 18:17-18:20 | PASS | 0 findings | - |
| E-A6-2 | deps | `npm audit --audit-level=high` | 18:20-18:23 | PASS | 0 vulnerabilities (all severities 0) | - |

Within the 2098 unit tests the S11 additions are: route matrix 298, secret scan 10, security headers 3, schema status 7.

## C. Persistent development database `wetscan_dev` (class DEV-PG; receipts `devdb-*.txt`)

Target verified before any change: `127.0.0.1:55432`, database `wetscan_dev`, marker `wetscan-s01:26b6b537-c016-4dc7-8007-4e839e8b838f`
(equal to `.env.sentinel.local` and the sealed approvals), PostgreSQL 17.12, image digest `sha256:99d1a998...fa32f0`, served by
container `wetscan-sentinel-s04-postgres-792151c53653` on volume `wetscan_sentinel_s04_dev_clone_20261117_792151c53653`
(**a 17 Nov clone volume, not the original S01 volume**; see S11-F9). Only one connection (the inspector) was active.

| ID | Action | Result |
| --- | --- | --- |
| E-DB-01 | Read-only discovery: databases, roles, ledger, connections | ledger at `0004_incidents`, checksums equal the current plan for 0001-0004; roles app/worker/migrator/bootstrap present; **notifier absent**; 25 tables |
| E-DB-02 | Pre-migration snapshot of all 25 tables (rows + md5 of row text) | `devdb-snapshot-pre-0004.txt`: e.g. 22 telemetry events, 4 incidents, 22 jobs |
| E-DB-03 | `pg_dump -Fc` backup (266 TOC entries, 164,980 bytes), copied to a private directory under the user profile (outside the repo) | sha256 `b65c87934032fa4e76740872a9b5a923fbfe25d9eb1e0da827dba27fdd08a8f4` identical inside the container and on the host |
| E-DB-04 | Restore rehearsal into a disposable database on a **different** container | **25/25 tables identical** (rows + md5), 18 forced-RLS tables present; rehearsal DB dropped |
| E-DB-05 | Fail-closed: historical approval (bound to the S01 plan) for `status` and worker `health` | `approval_required`, `database: not_connected` |
| E-DB-06 | Fail-closed: `up` without `--approve-plan`; `up` with a wrong 64-hex hash; `up` with a runtime-only approval; valid approval but wrong marker / wrong database name / wrong host | `blocked approval_required` x3; `target_denied` x3; **0 DB connections opened**, ledger unchanged |
| E-DB-07 | Notifier role created from the reviewed SQL (NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS) with its own random 48-char password written to a private file via stdin | role present; password not logged |
| E-DB-08 | New approvals in a private directory (historical approval files untouched): `migrate_up` approval and a separate `runtime` approval, both bound to the plan hash above; `approvedBy` quotes the owner's S11 instruction | accepted by `parseApproval` |
| E-DB-09 | `sentinel:db up --approve-plan=94f99d99...831c` | `applied`; ledger now 9 versions with checksums equal to the plan; second `up` is a no-op (still 9) |
| E-DB-10 | Post-migration comparison | **24 of 25 pre-existing tables byte-identical**; only `platform.schema_migrations` changed (4 -> 9 rows, expected); 45 tables; forced RLS on all but the ledger; 0 PUBLIC ACLs; 0 runtime `TRUNCATE/TRIGGER/REFERENCES` |
| E-DB-11 | Role behaviour on the real DB (app and notifier connections) | app: unscoped reads 0 rows from `incidents/telemetry_events/...` although 4 incidents exist, DDL denied; notifier: **first FAILED to connect (`CONNECT` missing, S11-F3)**, after `GRANT CONNECT` reads only notification tables, others `42501`, DDL denied |
| E-DB-12 | `main.ts --once` with the runtime approval (no activation blocks) | `started -> shutdown_requested(completed) -> stopped`, exit 0, **jobs table md5 unchanged**, one new `stopped` heartbeat |
| E-DB-13 | `sentinel:health` after S11 fix | `schema 0009_external_intelligence`, `schemaStatus current`; `status degraded` (no live worker heartbeat, 8 queued + 1 failed pre-existing S02-S04 jobs) - truthful, not a defect |

Not performed on DEV-PG (by design): any activation block, worker loop beyond `--once`, notifier start, real project binding,
real telemetry, response or notification traffic.

## D. Baseline and diagnostic runs (preserved; superseded by section B for acceptance)

| ID | Run | Result | Note |
| --- | --- | --- | --- |
| E-B-1 | `vitest run` on clean `master@0ab9256` | PASS 1780/1780 (108 files), 130 s | `baseline-unit-master-0ab9256.log` |
| E-B-2 | typecheck / lint / build on clean `master` | PASS | build 27 s |
| E-B-3 | PG suites S05-S10 first attempt (only `SENTINEL_S09_PG_ADMIN_URL` set) | S05/S07/S08/S10/ S06 **skipped or setup-failed** (their harnesses read the S05-S08 variables); S09 41/41 | **Not a pass** - env-variable mismatch, fixed by setting all `SENTINEL_S0[5-9]_PG_ADMIN_URL`; kept for history |
| E-B-4 | PG suites rerun with all variables | PASS 23+8+15+6+41+22 (`baseline-pg-master-0ab9256.log`) | before the S11 health change |
| E-B-5 | Browser suites on the working tree | PASS 26,5,6,3,3,6,4,8,10,6 (`baseline-browser-master-0ab9256.log`) | ran while the tree was being edited: not a clean baseline; authoritative results are B |
| E-B-6 | Route matrix first run | 5 failures: **test defect** (mock storage returned `undefined`, so the route 503'd before the query validator); fixed in the test, not by relaxing an assertion; 298/298 afterwards | `events` needed a real `TelemetryStore` |
| E-B-7 | S11 PG suite first run | 5 failures: wrong ledger table name, two tables wrongly allow-listed as unscoped (they carry tenant columns), ingest takes a **batch** not a single event | fixed in the test; no assertion weakened; 13/13 afterwards |
| E-B-8 | First `docker cp` of the dump | failed (MSYS path rewriting) and the in-container copy was deleted; **recreated from the unchanged DB**, host copy hash-verified | no data impact; runbook records `MSYS_NO_PATHCONV=1` |

## E. NOT_RUN / BLOCKED (never relabelled)

| ID | Item | Status | Reason |
| --- | --- | --- | --- |
| N-1 | GitHub Actions execution of `ci.yml` | **EXECUTED - see section F** (4 enforced jobs green at `cf61ff3`; advisory dependency review `BLOCKED` by repository settings) | - |
| N-2 | Authenticated real-GitHub-session E2E (`H-S10-E2E`) | NOT_RUN | no real owner session was driven; fixture identities only |
| N-3 | Real Telegram/Resend delivery | NOT_RUN | no consented destination/provider token configured; mock providers only |
| N-4 | Real response target (`H03`) | NOT_RUN | loopback fixture only |
| N-5 | S02-S04 gated historical PG suites (`telemetry/detection/incident/retention postgres`) | NOT_RUN | bound to historical exact-target approvals/snapshots; equivalent isolation re-proven by E-A2-7 on all 0001-0009 tables |
| N-6 | Worker activation on `wetscan_dev` (detection/incidents/response/external) | NOT_RUN | no activation approval exists; owner decision |
| N-7 | Staging environment | NOT_RUN | none exists |
| N-8 | Production | NOT_RUN | no production target authorized |
| N-9 | Load/flood beyond unit-level caps; third-party pentest | NOT_RUN | out of scope |
| N-10 | S01 legacy `sentinel-worker-smoke.ts` | NOT_RUN | hardcodes the S01 plan hash (superseded by E-DB-12) |

## F. GitHub Actions (PR #15), class CI-HOSTED (GitHub-hosted `windows-2025` / `ubuntu-24.04`, disposable service containers)

The first runs **failed and are preserved**; each failure was diagnosed from the hosted logs, fixed in the environment or the test
(no assertion weakened, nothing skipped) and the whole workflow re-run.

| ID | Run (head) | Job | Result | Diagnosis / action |
| --- | --- | --- | --- | --- |
| E-F-1 | `44479135365` (`a469913`) | typecheck+lint+unit (Windows) | **FAIL** 96/2098 tests in 7 files (S04 owner-runner suites) | Windows PowerShell 5.1 spawned from Node could not autoload `Microsoft.PowerShell.Security` (`Get-Acl`) because the runner's pwsh `PSModulePath` leaked in -> job runs with `shell: cmd` and an explicit `PSModulePath` |
| E-F-2 | same | PostgreSQL, build | PASS (1m06s, 1m04s) | - |
| E-F-3 | same | browser | cancelled by the next push | superseded |
| E-F-4 | same | dependency review (advisory) | **FAIL** `Forbidden` | dependency graph / GitHub Advanced Security is not enabled for this private repository. **BLOCKED (repo setting, owner O-5)**; the enforced gate is `npm audit` (0 vulnerabilities) |
| E-F-5 | push `50ba8a0` | workflow-file check | **FAIL** (workflow invalid) | my own edit wrote a control character (0x0B) into a YAML value; repaired, YAML parsed locally before the re-push |
| E-F-6 | `44480880899` (`2d7d3ce`) | unit (Windows) | **FAIL** 30/2098 | (a) `approval-history` 27 + `owner-reauth` 1: S04 private-root tests need `realpath(root) === root` but the runner's default `%TEMP%` is an 8.3 short path -> `TEMP/TMP = runner.temp`; (b) `audit-diagnostics` 2: see E-F-9 |
| E-F-7 | same | browser | **FAIL** 1/77: `detection.spec.ts` "invalid advanced conditions" | a click on *Save draft* before React hydration is silently lost (passes locally 6/6): the test now waits for the client-fetched rules before interacting. Not a timeout increase |
| E-F-8 | `44481908020` (`19d7d59`) | PostgreSQL | **FAIL** (exit 1 with every test green) | vitest "3 unhandled errors": harness `DROP DATABASE ... WITH (FORCE)` kills idle pooled connections (`57P01`) and pg emits an unhandled pool `error` -> `tests/sentinel/pg-idle-error-setup.ts` tolerates only `57P01/ECONNRESET/EPIPE` on pools |
| E-F-9 | same | unit | **FAIL** 2/2098: `audit-diagnostics` bootstrap tests, stage `bootstrap_common` | `Invoke-S04AuditProcedure.ps1` pins `sentinel-provision-common.ps1` by SHA-256 over **LF** bytes; the Windows runner checks out CRLF -> the pin fails closed (correct behaviour) -> `.gitattributes` `*.ps1 text eol=lf` (**finding S11-F11**; it affects any CRLF clone) |
| E-F-10 | **`44483248275` (`cf61ff3`)** | **typecheck + lint + unit + secret scan + audit (Windows)** | **PASS** 6m05s | unit **2098/2098 (112 files)**; secret scan 776 files, 0 findings; `npm audit` 0 vulnerabilities |
| E-F-11 | same | production build (Linux) | **PASS** 45s | - |
| E-F-12 | same | PostgreSQL service (Linux) | **PASS** 1m14s | S01 14 (CI-generated disposable approval on a second service container), S05 23, S06 22, S07 8, S08 15, S09 41, S10 6, S11 13 |
| E-F-13 | same | browser (Linux, Playwright `chromium`) | **PASS** 11m25s | 77/77: S10 26, demo 6, telemetry 5, detection 6, incident 3, response 3, notification 6, ghost 4, intelligence 8, external 10 |
| E-F-14 | same | dependency review (advisory) | FAIL `Forbidden` (BLOCKED, as E-F-4) | does not gate |

Branch protection / required status checks: **not configured** (master unprotected; historical API answer 404). The four jobs
*can* be made required (owner action O-5); until then CI is informative, not enforcing.

## G. Local re-check at the PR head `cf61ff3` (Windows 11, 2026-11-19 08:06-08:10 UTC)

| ID | Command | Result |
| --- | --- | --- |
| E-G-1 | `npm run typecheck` / `npm run lint` | PASS / PASS |
| E-G-2 | `npx vitest run` | PASS **2098/2098**, 112 files |
| E-G-3 | `npm run build` | PASS |
| E-G-4 | `npm run sentinel:secret-scan` / `npm audit --audit-level=high` | 776 files, 0 findings / 0 vulnerabilities |
| E-G-5 | S10, S11, S08 PG suites and `detection` browser suite after the infrastructure changes | PASS 6/6, 13/13, 15/15, 6/6 |
| E-G-6 | S01 gated suite through the new CI fixture script against a fresh container (`scripts/sentinel-ci-s01-fixture.ts`) | PASS 14/14 |

## H. Post-merge remediation (branch `fix/s11-post-merge-hardening`, base `master@830bb99`)

Code candidate `cfaeadd` (the local matrix below ran on this exact committed tree, clean at start; documentation edits followed and
touch no executable file). Receipts: `post-merge-matrix-cfaeadd.log`, `post-merge-devdb-snapshot-{before,after}.txt`. Same
environment as section B except PostgreSQL ran on a new throwaway container (`wetscan-s12-*`, destroyed afterwards).
Times are UTC on 2026-11-19, `09:` / `10:` + mm:ss.

| ID | Package | Command | Start-End | Result | Count | Class |
| --- | --- | --- | --- | --- | --- | --- |
| E-H-1 | all | `npm run typecheck` | 49:07-49:12 | PASS | exit 0 | - |
| E-H-2 | all | `npm run lint` | 49:12-49:54 | PASS | exit 0 | - |
| E-H-3 | S00-S11 | `npx vitest run` | 49:54-52:09 | PASS | **2135/2135, 114 files** (merge candidate: 2098/112; +37 = schema states, pool-error guard, pinned bytes, scanner, POST hygiene) | FIXTURE |
| E-H-4 | all | `npm run build` | 52:09-52:42 | PASS | exit 0 | - |
| E-H-5 | repo | `npm run sentinel:secret-scan` | 52:42-52:45 | PASS | 778 files, 737 scanned, 41 binary skipped, **0 findings, 0 incomplete** | - |
| E-H-6 | deps | `npm audit --audit-level=high` | 52:45-52:48 | PASS | 0 vulnerabilities | - |
| E-H-7 | S05, S06, S07, S08, S09, S10 | `test:sentinel:{response,notifications,ghost,intelligence,external,s10}:postgres` | 52:48-53:42 | PASS | 23, 22, 8, 15, 41, 6 | DISPOSABLE-PG |
| E-H-8 | S11 | `test:sentinel:s11:postgres` (adds the real-ledger schema-health test) | 53:42-53:50 | PASS | **14/14** (was 13) | DISPOSABLE-PG |
| E-H-9 | S01 | `test:platform:postgres` through `scripts/sentinel-ci-s01-fixture.ts` on a fresh container, with the new pool-error guard | 53:52-54:00 | PASS | 14/14 | DISPOSABLE-PG |
| E-H-10 | S10, S02-S09 | Playwright module suites (mocked transport) | 54:00-10:02:01 | PASS | 26, 5, 6, 3, 3, 6, 4, 8, 10 | FIXTURE |
| E-H-11 | Demo | original Orderly Demo walkthroughs | 10:02:01-10:04:52 | PASS | 6/6 | FIXTURE |
| E-H-12 | Auth/Canvas | `node tests/auth/run-github-e2e.mjs` (production build, Edge, Windows) | 10:04:52-10:07:04 | PASS | 21/21 | FIXTURE-E2E |
| E-H-13 | F1 | schema-state unit matrix (current, behind, mismatch, ahead-compatible, ahead-unverified x8 shapes) + real-ledger PG test (older plan on the real 0009 ledger: unattested -> `ahead_unverified`, attested -> `ahead_compatible` + warning, drifted checksum -> `checksum_mismatch`) | inside E-H-3, E-H-8 | PASS | - | DISPOSABLE-PG |
| E-H-14 | F3 | route matrix, mutation check: removing the two route-specific POST bodies makes exactly the `rules` and `sources` POST cases fail | ad hoc | PASS (the test can fail) | 2 of 298 fail under mutation | FIXTURE |
| E-H-15 | F4 | scanner tests: token after character 4000, token straddling the window boundary, 3 MB file, hard cap, unreadable and missing paths, binary counting, changed / appended / copied exception lines | inside E-H-3 | PASS | - | - |
| E-H-16 | F8 | pool-error guard tests: tolerates `57P01/ECONNRESET/EPIPE`; rethrows `23505/42501/28P01/57P03` and codeless errors | inside E-H-3 | PASS | - | - |
| E-H-17 | F10 | fresh `git clone -c core.autocrlf=true` of the branch: repository pins byte-exact; private-manifest PowerShell pins byte-exact | ad hoc, read-only | PASS | 5/5 repository pins; 16/16 PowerShell scripts found in 1,923 private files | - |
| E-H-18 | F10 | `s11-pinned-script-bytes.test.ts` mutation: removing the two TypeScript `eol=lf` lines makes it fail | ad hoc | PASS (the test can fail) | 1 of 4 fail under mutation | - |
| E-H-19 | F5 | the two agent-written private approvals: `approvedBy` corrected to the real authorship (`previousApprovedBy`, `authoredBy`, `authorizedBy`, `provenanceCorrectedAt` added; `approvedAt`, actions, plan hash untouched). Offline `parseApproval` for `migrate_up` / `runtime`, `sentinel:db status`, `sentinel:health` | after edit | PASS: both still accepted, `schemaStatus current`, `warnings []` | - | DEV-PG (read-only) |
| E-H-20 | dev DB | all 45 tables (rows + md5 of row text) before the remediation vs after every check above | before any change / after 10:07 | **IDENTICAL**; ledger still 9 rows, latest `0009_external_intelligence`; no activation, no worker started | 45/45 tables | DEV-PG |


GitHub-hosted results for the same code (PR #16, run `44502965648`, head `21f5c40`; GitHub Actions, class CI-HOSTED). First attempt,
no hosted failure to report this time:

| ID | Job | Result | Count |
| --- | --- | --- | --- |
| E-H-21 | typecheck + lint + unit + secret scan + audit (Windows) | **PASS** 6m29s | unit **2135/2135, 114 files**; secret scan 781 files, 740 scanned, 41 binary skipped, 0 findings, 0 incomplete; audit 0 vulnerabilities |
| E-H-22 | production build (Linux) | **PASS** 54s | - |
| E-H-23 | PostgreSQL service (Linux) | **PASS** 1m22s | S01 14, S05 23, S06 22, S07 8, S08 15, S09 41, S10 6, S11 14 |
| E-H-24 | browser (Linux, Chromium) incl. the NEW production-build E2E step | **PASS** 8m07s | module suites 26, 6 (demo), 5, 6, 3, 3, 6, 4, 8, 10; **production-build E2E 21/21 on Linux** (`next build` + `next start`, stubbed GitHub, no credentials) |
| E-H-25 | dependency review (optional) | **SKIPPED** by design (`GHAS_ENABLED` unset): no red check | - |

E-DB-08 (section C) described those approvals as quoting the owner's instruction; E-H-19 supersedes the wording of their `approvedBy`
field only. The original text is preserved inside each file.

Diagnostics during the remediation (kept): a lost backslash turned the version regex into `d{4}` (caught by the first run of the new
unit matrix); a mis-nested test block was reported by vitest as "test inside a test" and fixed; a scanner window test padded the
token with word characters so `\b` could not match (test artifact, fixed by a space); the Canvas overlay route needs a cached graph
before it opens storage, so the leak test now serves one.

