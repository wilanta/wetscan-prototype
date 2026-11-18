# Sentinel S04 Handoff — Durable Incidents, Evidence & Investigation Timeline

## Current handoff - owner offline acceptance, 16 November 2026

**Authentication archive exception:**
**ACCEPTED_OFFLINE_WITH_DOCUMENTED_RESIDUAL_RISKS**.
**Overall S04:** **IMPLEMENTED_PENDING_ACCEPTANCE**.

The accepted disposition preserves one historical session in its verified
archive while requiring its active file to remain absent. It is not complete
in-place historical preservation. Original validators, baselines, backups,
audit evidence, and historical failure receipts remain unchanged.

Residual risks: unknown deletion cause; unverified current GitHub access;
no permanent revocation ledger; unresolved refresh-persistence hazard.
The final independent offline review reproduced 43/43 focused and 1,125/1,125
full tests, typecheck/lint, six parser checks, and OFFLINE_READY preflight.
These are prior review results, not validation rerun for this documentation update.

Next: offline provision-and-ingest readiness review, including candidate
lifetime, explicit candidate CookieFile selection, exact runner hash and interface,
a newly reviewed manifest, historical integrity/approval guards, and a separately
scoped live authorization before any execution or active-resource handoff.
Only the updated exception document is pinned by the old manifest; its changed
pin blocks the current tree. Preserve the old manifest and do not bypass its failure.

See the [owner decision, evidence, risks and prerequisites](../SENTINEL_S04_OFFLINE_ACCEPTANCE.md).
No provider, database, OAuth, application, worker, provisioning, deployment, or
Git publication operation is authorized by this acceptance. Earlier dated sections
below are historical snapshots; their attempt counts and NOT_RUN states do not
supersede later receipts or this current offline-only decision.

Status: **IMPLEMENTED_PENDING_ACCEPTANCE** (15 November 2026, Asia/Jakarta).

16 November offline follow-up: [historical approval audit and proposed closure](../SENTINEL_S04_APPROVAL_REMEDIATION.md). Provision live invocations remain zero. Nine expired approvals retain APPROVED with empty actions and closedAt; the strengthened guard rejects them. No approval was mutated. Exact before/after previews await separate owner authorization; no later phase is authorized by that closure request.

---

## 1. Repository, Branch, and Verified Baseline

- **Repository**: `wilanta/wetscan-prototype`
- **Verified `master` / `origin/master` HEAD**: `f7bfeef29488c3f997e9444555039514f55fa0a3` (PR #6 merged 15 November 2026; S03 implementation commit `a7a0998d110a2abf46d7d123d2140eb9a77879fb`)
- **Current S04 Working Branch**: `feat/sentinel-s04-incidents` (branched directly from `f7bfeef29488c3f997e9444555039514f55fa0a3`)
- **Working Tree State**: **50 changed/new files** (**33 created / untracked**, **17 modified**), **0 staged**, **0 commits ahead of `master`**, **no push or PR created**
- **Other Worktrees Preserved**: `C:/Users/sheil/OneDrive/Dokumen/Wildhan/projects/wetscan-canvas-full` (`0696879 [feat/canvas-full-module]`) inspected by identity only and left completely untouched.

---

## 2. Reconstructed Packet History & Historical Evidence Boundary

| Packet | Merge SHA | Implementation SHA | PR | Verified Historical Status |
| --- | --- | --- | --- | --- |
| **S00** | `ec6838b` | `aa84457` | PR #2 | Frozen Sentinel contracts, scope validation, Canvas/Guard integration seams. |
| **S01** | `e39b01d` | `cc45bc0` | PR #3 | PostgreSQL foundation (`0001_foundation`), approval gate, scoped transactions, leased/fenced job queue, worker runtime. |
| **S02** | `cd313ce` | `ba951c9` | PR #4 | Authenticated telemetry ingestion (`0002_telemetry`), redaction, sources/credentials/events/batches, Event Explorer API & Live UI. |
| **Guard G01** | `12b843e` | `7207a16` | PR #5 | Guard G01 persistence, queue subclass, worker, and proposed SQL (`migrations/guard/**`). |
| **S03** | `f7bfeef` | `a7a0998` | PR #6 | Deterministic detection rules, immutable versions, durable alerts/evidence (`0003_detection`), Rules/Alerts API & Live UI. |
| **S04** | *(uncommitted)* | *(working tree)* | *(none)* | **IMPLEMENTED_PENDING_ACCEPTANCE**: Durable incidents, append-only timeline, retention pins, Incidents API & Live UI. |

- **Historical Evidence Distinction**: The S03 final review results (680/680 unit/contract tests, 60/60 browser regressions, 24/24 TEST PostgreSQL acceptance cases in H03B, and bounded DEV HTTP -> PostgreSQL -> worker -> alert -> UI acceptance in H03C-2) are **historical observations from merged PR #6**, not newly executed S04 runs.
- **Database Preservation**: During S04 implementation, static review, unit/type/lint/build validation, and browser regression testing, zero database connections were made. Under explicit owner **H04A** authorization (15 November 2026), read-only preflight and a private `pg_dump 17.12` backup (`138,323` bytes) were executed against `127.0.0.1:55432/wetscan_s01_test` (`mutations = 0`). Under explicit owner **H04B** authorization (15 November 2026), `0004_incidents` (`up`/`up`) and `scripts/sentinel-incident-test.ts` (**2/2 PASS in `2.25s`**) executed against `wetscan_s01_test` only under least-privilege `integration_test` + `migrate_up` approval (now closed), preserving all **517 pre-existing S01–S03 rows**, all **36 telemetry credentials**, all **19 historical queued jobs**, the **1 historical expired lease**, all S01–S03 catalog objects/grants/policies, and the untouched H04A backup archive. Under explicit owner **H04C-A** authorization (15 November 2026), a read-only preflight and private `pg_dump 17.12` backup (`110,541` bytes, `VERIFIED_ARCHIVE_NOT_RESTORE_TESTED`) were executed against `127.0.0.1:55432/wetscan_dev` (`mutations = 0`, **91/91 historical DEV rows** matching H03C-2 bit-for-bit, **0** active leases/sessions/processes, `0004_incidents` **NOT APPLIED**, H04C-A approval now closed). Under explicit owner **H04C-B1** authorization (15 November 2026), `0004_incidents` (`up`/`up`) was applied cleanly to `127.0.0.1:55432/wetscan_dev` under a narrow `actions: ["migrate_up"]`-only approval (now closed) and verified via `REPEATABLE READ READ ONLY` postflight: all **91/91 original DEV rows** (**92** total rows including the `0004_incidents` ledger row), all **8 historical queued H02 jobs**, all S01–S03 catalog/policies/grants, and the H04C-A backup archive (`110,541` bytes) were preserved, and `5` empty `sentinel.incident*` tables with `FORCE RLS`, `10` new policies, `6` explicit indexes, `12` validated `ON DELETE RESTRICT` FKs, and least-privilege grants were confirmed. **No** DEV worker activation, test-row insertion, HTTP/UI runtime acceptance (**H04C-B2**), or historical job processing has occurred on `wetscan_dev`, and **no** production migration has occurred.

---

## 3. S04 Implementation Inventory & Architecture Summary

### 3.1 Additive SQL Migration (`migrations/sentinel/0004_incidents.{up,down}.sql`)

- Creates 5 Sentinel-owned tables with composite `(mode, workspace_id, project_id, ...)` primary and foreign keys (`ON DELETE RESTRICT`), 6 explicit indexes, `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, and least-privilege grants to `wetscan_app`, `wetscan_sentinel_worker`, and `wetscan_migrator`:
  1. `sentinel.incidents`
  2. `sentinel.incident_alerts` (`UNIQUE(mode, workspace_id, project_id, alert_id)`)
  3. `sentinel.incident_evidence`
  4. `sentinel.incident_timeline` (append-only: neither `wetscan_app` nor `wetscan_sentinel_worker` has `UPDATE` privilege)
  5. `sentinel.incident_timeline_evidence` (append-only: neither `wetscan_app` nor `wetscan_sentinel_worker` has `UPDATE` privilege)
- Extends `applyMigrations(..., "down")` in `src/platform/migrations.ts` to lock all 5 S04 tables and S01–S03 parent tables in `ACCESS EXCLUSIVE MODE` and refuse reversal (`PlatformError("target_denied")`) if any S04 table contains any rows.

### 3.2 Incident Domain, Fenced Correlation & Append-Only Timeline (`src/features/sentinel/incidents/**`)

- **`model.ts`**: Defines `SecurityIncident`, `IncidentTimelineRecord`, `IncidentPage`, `IncidentDetailRecord`, `IncidentTimelineEventType` (`"alert_created" | "incident_opened" | "incident_closed"`), and `incidentLimits` (`10,000` incidents/project, `1,000` timeline entries/incident, `1,000` revisions/incident, `500` evidence events/incident, `30`-day closed retention).
- **`validation.ts`**: Defines `deterministicUuid`, `cleanNote` (`3..280` chars, control-char/HTML rejection, and secret/token pattern rejection), `incidentCommand`, and `validateTransition`.
- **`store.ts`**:
  - `correlateAlertIncident`: Called from `DetectionStore.persistMatch` (`src/features/sentinel/detection/store.ts`) inside the same fenced worker transaction when `correlateIncidents` is enabled and an eligible S03 alert (`alert_created` or `alert_deduplicated`) is persisted. Deterministically creates or updates the incident (`ON CONFLICT DO NOTHING`), links the alert (`sentinel.incident_alerts`) and matched window events (`sentinel.incident_evidence`), and appends idempotent `#1 alert_created` and `#2 incident_opened` timeline entries.
  - `IncidentStore.correlateAlertById`: Explicit worker-only transactional entrypoint to correlate a persisted S03 alert by ID.
  - `IncidentStore.incidents`: Scoped cursor-paginated query (`status`, `severity`, `origin`, `sourceId`, `ruleId`, `from`, `to`, `limit`, `cursor`) preserving PostgreSQL microsecond timestamps.
  - `IncidentStore.incidentDetails`: Scoped detail reader returning `{ incident, alerts, evidence, timeline }`.
  - `IncidentStore.command`: Optimistic concurrency (`expectedRevision`) status transition handler (`investigate`: `open -> investigating`; `close`: `open | investigating -> closed`; `reopen`: `closed -> investigating`) appending an immutable `sentinel.incident_timeline` entry while keeping `verificationStatus = "not_requested"`.
- **`activation.ts`**: Default-off `incidentActivation(approval, enabled, detection)` requiring both `SENTINEL_INCIDENTS_ENABLED=1` and a private `approval.incidents` object matching the active `detectionActivation` scope with `notBefore >= approval.approvedAt` and `notBefore >= detection.notBefore`.
- **`retention.ts`**: `retainIncidents(db, scope)` pins `open` and `investigating` incidents indefinitely and deletes only `closed` incidents older than 30 days without active jobs. `retainDetection` (`src/features/sentinel/detection/retention.ts`) and `retainTelemetry` (`src/features/sentinel/telemetry/store.ts`) are updated with `incidentsReady` pins so incident-referenced alerts and telemetry events are never deleted.

### 3.3 Authenticated HTTP API & Live Sentinel UI

- **`src/features/sentinel/server/incident-http.ts` & `src/app/api/sentinel/projects/[projectId]/incidents/route.ts`**:
  - Enforces `^github-[1-9]\d{0,15}$` project IDs (`404` on `orderly-demo`), same-origin `requireOrigin` on `POST` (`403`), 8 KiB body cap (`413`), session + GitHub/Canvas repository authorization (`401`/`404`), and sanitized `503` errors.
  - Supports `GET` list, `GET ?incidentId=<UUID>[&view=full|timeline|alerts|evidence]`, and `POST` transition commands (`investigate`, `close`, `reopen`, `transition_status`).
- **`src/features/sentinel/components/live-incidents.tsx`, `src/app/app/projects/[projectId]/sentinel/[[...section]]/page.tsx`, `src/components/views/sentinel.tsx`**:
  - Mounts live incident list and detail permalink routes (`/app/projects/github-<id>/sentinel/incidents` and `/app/projects/github-<id>/sentinel/incidents/<incidentId>`) and adds the `Incidents` navigation tab across live Sentinel views while keeping `Orderly Demo` (`DemoSentinel`) 100% isolated.

---

## 4. Static Review, Verified Operator Validation & Browser Trace Investigation

1. **`LifecycleEvent` Semantic Audit (`policy_evaluating` Removed from S04)**:
   - Restricted `IncidentTimelineEventType` (`src/features/sentinel/incidents/model.ts`) and the SQL `CHECK` constraint on `sentinel.incident_timeline.event_type` (`migrations/sentinel/0004_incidents.up.sql`) strictly to `('alert_created', 'incident_opened', 'incident_closed')`. Active transitions (`open`, `investigate`, `reopen`) use `event_type = 'incident_opened'` alongside explicit `from_status`, `to_status`, and `metadata.action` (`"investigate"`, `"reopen"`, `"close"`).
2. **Guard-Module Database Handle Rejection**:
   - Added explicit `if (db.module !== "sentinel") throw new PlatformError("scope_denied");` guards to `correlateAlertIncident` and all `IncidentStore` methods in `src/features/sentinel/incidents/store.ts`.
3. **Preserved Initial Operator CLI Findings & Targeted Test/Fixture Fixes**:
   - **Initial `tsc --noEmit` (4 errors in test/fixture files; 0 in `src/`, `worker/`, `scripts/`)**: Fixed explicit types in `tests/sentinel/incident-fixtures.ts`, `tests/sentinel/incident.postgres.integration.ts`, and `tests/sentinel/incident.spec.ts`.
   - **Initial `vitest run` (`723/724` passed, 1 failed in `tests/sentinel/incident-store.test.ts`)**: Replaced double-serialized `JSON.stringify(invTimeline.values)` with `JSON.parse(String(values[11]))` and structured assertions.
   - **Initial `eslint .` (0 errors, 1 warning in `tests/sentinel/incident-store.test.ts`)**: Removed unused `ruleId` import.
4. **Verified Post-Fix Operator CLI & Build Results (Node.js v22.20.0 in Local PowerShell)**:
   - `node node_modules/typescript/bin/tsc --noEmit`: **PASS (exit code 0)**.
   - `node node_modules/eslint/bin/eslint.js .`: **PASS (exit code 0, 0 warnings)**.
   - `node node_modules/vitest/vitest.mjs run`: **PASS — 724/724 tests across 53/53 test files, 0 failures (16.70 seconds, exit code 0)**.
   - `node node_modules/next/dist/bin/next build`: **PASS (exit code 0)**.
5. **First Operator Browser Regression Results & Trace Root-Cause Findings (`59 PASSED, 4 FAILED, 63 EXECUTED` — Preserved)**:
   - **Passing Suites on First Run**: S04 Incidents (`3/3 PASS`), S02 Telemetry (`5/5 PASS`), Guard G01 (`5/5 PASS`), Auth/GitHub/Onboarding (`21/21 PASS`).
   - **4 Investigated First-Run Failures (`docs/SENTINEL_S04_VALIDATION.md` Section 3)**:
     - **Failure A (`tests/sentinel/detection.spec.ts:216`)**: `GET /app/detection-fixture` returned `200 OK`, but React client hydration (`useEffect`) stalled for `16.0s` after `load` (`34984.5ms` -> `50957.5ms`), firing `GET /api/sentinel/projects/github-123/rules` at `mono=51107.6ms` (`363ms` after the `15000ms` assertion timeout expired at `50744.8ms`). Forbidden project data never rendered.
     - **Failure B (`tests/e2e/walkthrough.spec.ts:189`)**: Iterations 1–5 passed `h1` visibility, `AxeBuilder.analyze()` (`0` violations), and screenshots. On Iteration 6 (`390x844` `/app/projects/orderly-demo/canvas`), `heading "Everything is connected." [level=1]` was present in `<main>` (`error-context.md` line 44), but the overall `60000ms` test timeout expired `375.7ms` into the `expect` call.
     - **Failure C (`tests/e2e/walkthrough.spec.ts:239`)**: All 20 declared screens (including `/app/projects/orderly-demo/sentinel/incidents`), `/app/integrations` staging validation, and Canvas `Trust`/`Workflows`/`Security` lenses passed, but the `20`-route dev compilation loop consumed `47.2s`, causing the overall `60000ms` test timeout to expire `113.2ms` into clicking `button "Show component list"` (which was present in `<main>` in `error-context.md` line 138).
     - **Failure D (`tests/canvas/canvas.spec.ts:25`)**: Test #1 of 17 in `canvas-regression.config.ts` hit a `8048ms` cold SSR + Turbopack `"building"` delay immediately after `walkthrough.spec.ts` wrote `286 MB` into `tests/canvas/fixture/.next` under OneDrive, delaying `useCanvas` hydration past `15000ms`; all 16 subsequent tests in the suite passed (`16/17 PASS`).
6. **Verified Fresh Browser Revalidation (`--retries=0` — `63/63 PASS, 0 Retries`)**:
   - Without modifying any test timeout, assertion, or production/test code, the operator executed targeted (`--retries=0`) and full (`--retries=0`) browser revalidation in local PowerShell (Node.js v22.20.0) without global `NODE_OPTIONS`:
     - **Targeted Rerun (`--retries=0`)**: S03 Detection (`detection.spec.ts:216`) `1/1 PASS`, Original Application (`walkthrough.spec.ts:189` and `:239`) `2/2 PASS`, Canvas (`canvas.spec.ts:25`) `1/1 PASS` (**4/4 PASS**).
     - **Complete Browser Regression Suites (`--retries=0`)**: S04 Incidents `3/3 PASS`, S03 Detection `6/6 PASS`, S02 Telemetry `5/5 PASS`, Original Application `6/6 PASS`, Canvas Compatibility `17/17 PASS`, Guard G01 `5/5 PASS`, Auth/GitHub/Onboarding `21/21 PASS` (**63/63 PASS, zero retries**).
   - **The non-destructive S04 validation gate is COMPLETE (PASS).**

---

## 5. Verified Checksums and Migration Plan Hash

Computed offline over LF-normalized UTF-8 (`\r\n -> \n`) matching `src/platform/migrations.ts` (and verified by `tests/platform/migrations.test.ts` and `tests/sentinel/incident-migrations.test.ts` in the 724/724 Vitest run):

| Item | SHA-256 |
| --- | --- |
| **Combined S04 Plan (`migrationPlan().sha256`)** | `3438a56e778b30afdd6acf03600638fe31e26c55c2ae5bf63d224f909c429ae7` |
| **`0004_incidents` pair (`Migration.checksum`)** | `84b5b4987e498bbb047505cd81218716357ce5f1434fb466749c7ed433141663` |
| **`migrations/sentinel/0004_incidents.up.sql` (LF)** | `84adf3030338757728552cae07a70b1dd549f9785078fc6e5a3ababae8d939dd` |
| **`migrations/sentinel/0004_incidents.down.sql` (LF)** | `c695777076aea80a1e84c3824c6faf4b8f32595ec7795337f95ef89ef3f444f5` |
| **`0001_foundation` pair (`Migration.checksum`)** | `dd061a60b123284882f154c438de3a171d60967b7b07a4e07200b6693f4eb778` |
| **`0002_telemetry` pair (`Migration.checksum`)** | `d1b67dc680f5bf3c2cbe585dca2427abf9d7ba9f29479c69b851f66b91c1f5a3` |
| **`0003_detection` pair (`Migration.checksum`)** | `4f0ee1cebdbdc81b835f719ef13c9cb703dfb5f440193765dfa0a61635fb6168` |
| **Historical S03 3-migration slice plan** | `c3e39f6fd43ee6eb2fbf5b244778955aab4cabb8a11ed3c66d791cf99a252a94` |
| **`infra/sentinel/provision-roles.sql` (LF)** | `7c531cf4165f7fa4eb4a4b65aff4ad409360f6a3cd08f3af8932c48d91829299` |

---

## 6. Validation Status, Completed Non-Destructive Gate, Completed H04A/H04B & Remaining Approval Gates

1. **Non-Destructive Validation Gates (`PASS` — Sandbox + Operator Local PowerShell)**:
   - **Pre-Patch Full Suite + Build + Browser Regressions (Operator PowerShell, Node.js v22.20.0)**: `tsc --noEmit` PASS, `eslint .` PASS (0 warnings), `vitest run` **724/724 PASS across 53/53 files** (`16.70s`), `next build` PASS, and complete Playwright browser suites (`--retries=0`) **63/63 PASS across 7 suites** (S04 Incidents `3/3`, S03 Detection `6/6`, S02 Telemetry `5/5`, Original Application `6/6`, Canvas Compatibility `17/17`, Guard G01 `5/5`, Auth/GitHub/Onboarding `21/21`).
   - **Post-Safety-Patch Operator CLI Rerun (Operator PowerShell, Node.js v22.20.0)**: Following recovery of the test-only H04B safety patch (`SqlClient` generic `query<R>` forwarding + `assertS04DownRefusalAudit`), operator execution verified `tsc --noEmit` (**PASS, exit 0**), `eslint .` (**PASS, exit 0, 0 warnings**), and `vitest run` (**PASS — 726/726 across 53/53 files**; prior `next build` & `63/63` browser suites predated the test/script-only safety patch and were not rerun).
   - Offline SHA-256 migration checksums, `git diff --check`, secret scan, `.gitignore`, and ownership boundary checks: **PASS (sandbox)**.
2. **Completed H04A Read-Only TEST Preflight & Verified Private Backup (`PASS — 15 November 2026`)**:
   - **Target**: `127.0.0.1:55432 / wetscan_s01_test`, marker `wetscan-s01:9f3560a6-127f-42a6-abaf-9f45951e6bd5`, PostgreSQL `17.12` (`170012`), container `wetscan-sentinel-local-postgres-1`, volume `wetscan_sentinel_s01_dev_20261114`.
   - **Read-Only Preflight & Backup**: `baselineSha256 = 9facc592ff49e7ddeffc9fd1a2ecba8d93af4e82c3504de46dc044d2426a14a0`, `extendedSha256 = f749b16c3e19967c1832e38b563f572a276e50585a4c4d94c808ae3758ad48e3`, `517` total rows across `20` tables (`208` S01–S02 + `309` S03, including all `36` `sentinel.telemetry_credentials` rows), private `pg_dump 17.12` archive `wetscan_s01_test-before-0004.dump` (`138,323` bytes, SHA-256 `d11c574de9fab2621ba18d893d88f514f380653b78c2e3598b6aa22278ad66ab`, `VERIFIED_ARCHIVE_NOT_RESTORE_TESTED`), H04A approval closed (`COMPLETED_H04A_READONLY_BACKUP`, `actions: []`).
3. **Completed H04B TEST Migration (`0004_incidents` up/up) & PostgreSQL Acceptance (`PASS — 15 November 2026`)**:
   - **Scoped Approval**: Private `.local/sentinel/s04-h04b-private-directory.txt` -> `test-approval.json` (`actions: ["integration_test", "migrate_up"]` only — zero `"migrate_down"`, zero `"runtime"`, `SENTINEL_DETECTION_ENABLED=0`, `SENTINEL_INCIDENTS_ENABLED=0`), now closed (`COMPLETED_H04B_TEST_ACCEPTANCE`, `actions: []`).
   - **Command (`scripts/sentinel-incident-test.ts`, Executed Once)**: `node --env-file=.env.sentinel.s04.test.local --import tsx scripts/sentinel-incident-test.ts` (**PASS, exit 0, 2/2 tests in `2.25s`, 0 failed, 0 skipped**):
     - `beforeAll`: `0004_incidents` (`84b5b4987e498bbb047505cd81218716357ce5f1434fb466749c7ed433141663`) applied UP + second UP idempotency verified (`up_up`).
     - Test 1 (`530ms`): Created controlled fixture under `github-user-7:s04-c28df621-8015-42e5-af91-20cafebc8457` / `github-998736528` (`origin = 'controlled_test'`), processed 1 leased job (`correlateIncidents: true`), read `open` incident + `["alert_created", "incident_opened"]`, executed `investigate` -> `close` (`status: 'closed'`, `verificationStatus: 'not_requested'`, `revision: 3`, `4` timeline rows), and ran `retainIncidents`, `retainDetection`, and `retainTelemetry`.
     - Test 2 (`109ms`): Verified populated `0004_incidents` `down` refusal (`PlatformError("target_denied")`) via 11-statement SQL allowlist proxy + `SET LOCAL lock_timeout = '3000ms'` with zero DDL/DML executed and all records preserved.
   - **Independent Read-Only Postflight (`PASS`)**: `517/517` historical rows (including `36` telemetry credentials, `19` queued historical jobs, `1` expired historical lease) preserved bit-for-bit; ledger `0001`–`0003` `applied_at` unchanged + `0004_incidents` recorded at `2026-11-15 10:05:14.264242+00`; `25` tables / `24` `FORCE RLS` tables / `48` policies (`10` on `incident*`) / `55` indexes (`16` on `incident*`, `6` explicit) / `12` validated `ON DELETE RESTRICT` composite FKs / exact least-privilege grants verified; `27` controlled fixture rows committed (`16` S01–S03 + `11` S04); H04A backup archive untouched (`138,323` bytes); `active_leases = 0`; `other_sessions = 0`.
   - **Honest Scope Boundary**: Live Postgres cases in `incident.postgres.integration.ts` did not directly execute `reopen`, `revision_conflict`, duplicate-alert correlation, live `GRANT` refusal (`negative_dml_rollback`), a second-project live RLS query, HTTP routes, Live Incidents UI against Postgres, or standalone worker startup (domain/HTTP contracts passed in Vitest `726/726`; catalog grants/policies verified in postflight; runtime execution gated on **H04C**).
4. **Completed H04C-A Read-Only DEV Preflight & Verified Private Backup (`PASS — 15 November 2026`)**:
   - **Target**: `127.0.0.1:55432 / wetscan_dev`, marker `wetscan-s01:26b6b537-c016-4dc7-8007-4e839e8b838f` (positively verified distinct from `wetscan_s01_test`), PostgreSQL `17.12` (`170012`), container `wetscan-sentinel-local-postgres-1`, volume `wetscan_sentinel_s01_dev_20261114`.
   - **Read-Only Preflight & Archive**: Verified `0001_foundation`..`0003_detection` ledger (`0004_incidents` **NOT APPLIED**, `0` `incident*` catalog objects/columns), `20` tables, `204` columns, `126` constraints, `39` indexes, `19` `FORCE RLS` tables, `38` policies, all 3 roles (`wetscan_app`, `wetscan_sentinel_worker`, `wetscan_migrator`) connected in `BEGIN READ ONLY` with `row_security = on`, and **91/91 DEV rows** matching H03C-2 `audit-final.json` 100% (including `8` historical queued H02 jobs, `14` telemetry events, `3` revoked credentials, `2` alerts, and `5` heartbeat rows [`4` `stopped`, `1` historical stale `running` heartbeat from `2026-11-14T13:37:10Z` with `0` active DB sessions or running OS processes]). Created private `pg_dump 17.12` custom backup `wetscan_dev-before-0004.dump` (`110,541` bytes, SHA-256 `67e363879f95475b5b4fae81cabe9816196d06ce84d27bee3f39dd2cfb83430e`, `20/20` `TABLE` & `TABLE DATA`, `91/91` offline `INSERT` rows matched, `VERIFIED_ARCHIVE_NOT_RESTORE_TESTED`). Pre/post digest `4fba3a8a893cf25adcf5ea3902dedac650b0230d0982ca49f211e2b4033f034a` matched bit-for-bit (`mutations = 0`, `active_leases = 0`, `liveSessionsCount = 0`, `runningAppOrWorkerProcessesCount = 0`), and H04C-A approval is closed (`COMPLETED_H04C_A_DEV_READONLY_BACKUP`, `actions: []`).
5. **Completed Pre-H04C-B Worker Isolation Patch (`PASS — 15 November 2026`, Code Patch Only)**:
   - **Isolation Fix Implemented & Verified (`0` PG connections, `0` real workers started)**: Updated `worker/sentinel/acceptance.ts`, `worker/sentinel/main.ts`, `worker/sentinel/runtime.ts`, and `tests/sentinel/runtime-isolation.test.ts` so `s04RuntimeAcceptance` binds 1:1 to S04's plan hash (`3438a56e...`) alongside preserved S03 compatibility (`c3e39f6f...`), validates `IncidentActivation` scope/chronology and `0004_incidents` (`84b5b498...`), pins 8 disjoint historical `protectedJobIds`, gates queue claims and admission checks via `sealedAdmission`, pauses all 5 retention loops plus `executeLease` maintenance writes under `input.isolation`, and shuts down cleanly at `acceptanceDeadline`. Fresh checks passed: `pnpm typecheck`, `pnpm lint` (0 warnings), `pnpm test` (`736/736` across `53/53` files, `33/33` in `runtime-isolation.test.ts`), `pnpm build`, and Sentinel/Original Playwright (`20/20`, `--retries=0`). Canvas (`17/17`), Guard (`5/5`), and Auth (`21/21`) predate this worker-only patch and were not rerun.
6. **Completed H04C-B1 DEV Migration (`0004_incidents` up/up) & Postflight Audit (`PASS — 15 November 2026`)**:
   - **Least-Privilege Approval & Env**: Dedicated ACL-restricted private directory referenced by `.local/sentinel/s04-h04c-b1-private-directory.txt` -> `dev-migrate-approval.json` (`actions: ["migrate_up"]` ONLY, `15m` expiry, `migrate_down`/`runtime`/`integration_test` refused) and `.env.sentinel.s04.dev.migrate.local` (`SENTINEL_DB_MIGRATION_PASSWORD_FILE` only; `APP`/`WORKER` credentials omitted; `SENTINEL_DETECTION_ENABLED=0`, `SENTINEL_INCIDENTS_ENABLED=0`, `SENTINEL_ACCEPTANCE_ISOLATION=0`).
   - **Execution & Postflight (`PASS`, `0` workers started, `0` fixture rows, `0` jobs processed)**: Read-only `REPEATABLE READ` preflight matched H04C-A (`20` tables, `91` rows, `4fba3a8a893cf25adcf5ea3902dedac650b0230d0982ca49f211e2b4033f034a`, `0001`–`0003` ledger, `0` incident objects, `8` queued jobs, `0` leases/sessions/processes). Executed `scripts/sentinel-db.ts up --approve-plan=3438a56e778b30afdd6acf03600638fe31e26c55c2ae5bf63d224f909c429ae7` twice (`0004_incidents` `84b5b4987e498bbb047505cd81218716357ce5f1434fb466749c7ed433141663` applied at `2026-11-15 11:01:14.682295+00`; second UP idempotent between `after_up1` and `postflight`). Independent `REPEATABLE READ READ ONLY` postflight verified `25` tables, `5` empty `sentinel.incident*` tables (`wetscan_migrator`, `ENABLE + FORCE RLS`, `10` new policies / `48` total, `16` S04 indexes including all `6` explicit indexes / `55` total, `12` validated `ON DELETE RESTRICT` FKs, exact table and 7-column `wetscan_app` `incidents` `UPDATE` grants, `0` `PUBLIC` grants), unchanged S01–S03 catalog/policies/grants, **`91/91` original DEV rows preserved (`92` total)**, all `8` historical queued jobs untouched, `0` active leases/sessions/processes, untouched H04C-A backup (`110,541` bytes), and immediate closure of `dev-migrate-approval.json` (`COMPLETED_H04C_B1_DEV_MIGRATION`, `actions: []`, refusing further `migrate_up`).
7. **Completed H04C-B2 Readiness & Safety Harness Preparation (`PASS — 15 November 2026`, Offline Only)**:
   - **Isolation Audit & New Readiness Artifacts (`0` PG Connections, `0` `src/`/`worker/`/`migrations/`/`infra/` Edits)**: Confirmed existing `worker/sentinel/{acceptance,main,runtime,executor,lifecycle}.ts` and `src/platform/{config,database,queue,migrations}.ts` satisfy all 13 H04C-B2 isolation and clean-shutdown controls. Added `tests/sentinel/dev-acceptance-safety.ts` (DEV target/baseline parity, `SENTINEL_H04C_B2_EXECUTION=1` + fail-closed phase approvals forbidding `migrate_down`/`integration_test`, `buildSealedS04RuntimeApproval`, `assertWorkerHealthPayload`, `verifyHistoricalMultisetPreserved`, `verifyCleanShutdownAndPostflight`, `verifyBackupArtifactIntact`, savepoint-proxied `withRollbackOnlyDatabase`, and `runNegativePostgresMatrix` reusing `verifyPopulatedS04DownRefusal` with `"runtime"` action only + rolled-back retention-pin checks), `scripts/sentinel-dev-acceptance.ts` (offline `plan` + 10 gated DEV phases with PG `clock_timestamp()`-aligned `preIngestAt` / `notBefore` ordering), and `tests/sentinel/dev-acceptance-safety.test.ts` (7 offline safety/gating/queue-isolation/savepoint tests).
   - **Fresh Post-Readiness Verification**: `tsc --noEmit` PASS, `eslint .` PASS (0 warnings), `vitest run` **743/743 PASS across 54/54 files** (`dev-acceptance-safety.test.ts` `7/7`), `next build` PASS (`13/13` static pages), offline `node --import tsx scripts/sentinel-dev-acceptance.ts plan` PASS (`databaseConnections: 0`), S04 Playwright (`tests/sentinel/incident.playwright.config.ts --retries=0`) **3/3 PASS** (`43.5s`), `git diff --check` PASS, secret scan clean (only `*_PASSWORD_FILE` env keys and offline test placeholder strings). Prior S03/S02/Original App `17/17` ran after Pre-H04C-B worker patch; Canvas `17/17`, Guard `5/5`, and Auth `21/21` predate worker patch.
8. **Remaining Approval-Gated Phases (`PAUSED / NOT_RUN`)**:
   - **H04B Targeted TEST PostgreSQL Regression (`PREPARED, NOT_RUN`)**: Execute the expanded correlation `23503` regression in `tests/sentinel/incident.postgres.integration.ts` against `127.0.0.1:55432 / wetscan_s01_test` under dedicated short-lived TEST owner authorization (see Section 9).
   - **H04C-B2 (`PAUSED AFTER PHASE 5 FAILURE`)**: Phases 1–4 and Phase 5 ingestion passed; Phase 5 second worker failed with `23503` (fixed and verified offline; see Section 9). DEV recovery and Phases 6–7 require separate explicit owner authorization after TEST regression passes.
   - **Publication (`NOT_RUN`)**: Staging, commit, push, and PR creation require separate owner approval after H04C-B2 completes. Overall status remains **IMPLEMENTED_PENDING_ACCEPTANCE**.

---

## 7. Exact Changed-File Manifest (50 Files: 33 Created, 17 Modified, 0 Staged)

### Created Files (33)

1. `docs/SENTINEL_S04_API.md`
2. `docs/SENTINEL_S04_ARCHITECTURE.md`
3. `docs/SENTINEL_S04_CONTEXT_AUDIT.md`
4. `docs/SENTINEL_S04_MIGRATION_REVIEW.md`
5. `docs/SENTINEL_S04_VALIDATION.md`
6. `docs/agent-handoffs/HANDOFF_S04.md`
7. `infra/sentinel/incident.env.example`
8. `migrations/sentinel/0004_incidents.down.sql`
9. `migrations/sentinel/0004_incidents.up.sql`
10. `scripts/sentinel-dev-acceptance.ts`
11. `scripts/sentinel-incident-preflight.ts`
12. `scripts/sentinel-incident-test.ts`
13. `src/app/api/sentinel/projects/[projectId]/incidents/route.ts`
14. `src/features/sentinel/components/live-incidents.tsx`
15. `src/features/sentinel/incidents/activation.ts`
16. `src/features/sentinel/incidents/model.ts`
17. `src/features/sentinel/incidents/retention.ts`
18. `src/features/sentinel/incidents/store.ts`
19. `src/features/sentinel/incidents/validation.ts`
20. `src/features/sentinel/server/incident-http.ts`
21. `tests/canvas/fixture/app/app/incident-fixture/page.tsx`
22. `tests/sentinel/dev-acceptance-safety.test.ts`
23. `tests/sentinel/dev-acceptance-safety.ts`
24. `tests/sentinel/incident-acceptance-safety.test.ts`
25. `tests/sentinel/incident-acceptance-safety.ts`
26. `tests/sentinel/incident-fixtures.ts`
27. `tests/sentinel/incident-http.test.ts`
28. `tests/sentinel/incident-migrations.test.ts`
29. `tests/sentinel/incident-postgres.config.ts`
30. `tests/sentinel/incident-store.test.ts`
31. `tests/sentinel/incident.playwright.config.ts`
32. `tests/sentinel/incident.postgres.integration.ts`
33. `tests/sentinel/incident.spec.ts`

### Modified Files (17)

1. `docs/SENTINEL_INTEGRATION_BACKLOG.md`
2. `scripts/sentinel-detection-preflight.ts`
3. `scripts/sentinel-detection-test.ts`
4. `src/app/app/projects/[projectId]/sentinel/[[...section]]/page.tsx`
5. `src/components/views/sentinel.tsx`
6. `src/features/sentinel/components/live-detection.tsx`
7. `src/features/sentinel/components/live-telemetry.tsx`
8. `src/features/sentinel/detection/retention.ts`
9. `src/features/sentinel/detection/store.ts`
10. `src/features/sentinel/telemetry/store.ts`
11. `src/platform/migrations.ts`
12. `tests/platform/migrations.test.ts`
13. `tests/sentinel/detection-migrations.test.ts`
14. `tests/sentinel/runtime-isolation.test.ts`
15. `worker/sentinel/acceptance.ts`
16. `worker/sentinel/main.ts`
17. `worker/sentinel/runtime.ts`

---

## 8. Copy-Ready H04C-B2 DEV Bounded Runtime Acceptance Proposal

> **Note**: With **H04A** (TEST read-only preflight & backup), **H04B** (TEST `0004_incidents` up/up, `2/2` acceptance, `517/517` preservation), **H04C-A** (DEV read-only preflight `91/91` rows & private `110,541`-byte `pg_dump 17.12` backup `67e363879f95475b5b4fae81cabe9816196d06ce84d27bee3f39dd2cfb83430e`, `mutations = 0`), the **Pre-H04C-B Worker Isolation Patch** (`worker/sentinel/acceptance.ts`, `main.ts`, `runtime.ts`, `runtime-isolation.test.ts`), **H04C-B1** (DEV `0004_incidents` up/up migration & independent read-only postflight confirming `91/91` original rows + `8/8` historical queued jobs preserved, `0` fixture rows, `dev-migrate-approval.json` closed), and **H04C-B2 Readiness Preparation** (`scripts/sentinel-dev-acceptance.ts`, `tests/sentinel/dev-acceptance-safety.ts`, `tests/sentinel/dev-acceptance-safety.test.ts` + fresh `tsc`/`eslint`/`vitest 743/743`/`next build`/S04 Playwright `3/3` PASS) now **COMPLETE (PASS)**, executing **H04C-B2** requires separate explicit owner authorization against `127.0.0.1:55432 / wetscan_dev`. The proposal below grants no permission by itself.

```text
WETSCAN SENTINEL S04 — H04C-B2: DEV Bounded Runtime Acceptance (Post-H04C-B1)

Owner decision: PENDING_EXPLICIT_OWNER_AUTHORIZATION. Target ONLY `127.0.0.1:55432 / wetscan_dev` (`wetscan-s01:26b6b537-c016-4dc7-8007-4e839e8b838f`; never connect to `wetscan_s01_test` or production, never grant `migrate_down` or `integration_test`, never run retention deletes outside outer `BEGIN ... ROLLBACK`, never restore H04C-A archive onto live DEV/TEST, never start S05, and never commit/push/create a PR).

1. Completed H04C-B1 & Readiness Prerequisites (Verified):
   - `0004_incidents` (`84b5b4987e498bbb047505cd81218716357ce5f1434fb466749c7ed433141663`) is already applied and idempotency-verified on `wetscan_dev` (`25` tables, `5` empty `sentinel.incident*` tables, `91/91` original DEV rows & `8/8` historical queued jobs preserved, temporary migration approval closed).
   - `worker/sentinel/acceptance.ts`, `main.ts`, `runtime.ts` enforce `s04RuntimeAcceptance` pinned to `3438a56e778b30afdd6acf03600638fe31e26c55c2ae5bf63d224f909c429ae7`, `IncidentActivation`, `0004_incidents`, 8 DEV `protectedJobIds`, `job_id = ANY($admittedJobIds)` admission, `incidents.notBefore >= detection.notBefore >= approval.approvedAt`, 5 paused retention loops, `executeLease` maintenance denial, and bounded `acceptanceDeadline` shutdown.
   - `scripts/sentinel-dev-acceptance.ts` & `tests/sentinel/dev-acceptance-safety.ts` enforce explicit `SENTINEL_H04C_B2_EXECUTION=1`, phase-scoped short-lived approvals, PostgreSQL `clock_timestamp()`-aligned `preIngestAt`, savepoint-proxied rolled-back `retainIncidents`/`retainDetection`/`retainTelemetry` and RLS/DML checks, and `verifyPopulatedS04DownRefusal` via `"runtime"` action only.

2. Execute Bounded H04C-B2 Acceptance Sequence (`SENTINEL_H04C_B2_EXECUTION=1`):
   - Run `preflight`: confirm DEV identity/marker, `91/91` historical rows, `8` protected queued H02 jobs, `0` leases/sessions/processes, untouched `wetscan_dev-before-0004.dump` (`110,541` bytes), and `5` empty `incident*` tables.
   - Start Next.js production server under temporary `actions: ["runtime"]` approval (`SENTINEL_DETECTION_ENABLED=1`, `SENTINEL_INCIDENTS_ENABLED=1`, `SENTINEL_ACCEPTANCE_ISOLATION=0` on web app); verify `401`/`403`/`404` denials, owned project `/api/sentinel/projects/github-998736528/...` access, and `/app/projects/orderly-demo/sentinel/incidents` isolation.
   - Run `provision-and-ingest`: create temporary `controlled_test` source, credential, and fresh rule, record PG `preIngestAt`, ingest synthetic high-severity telemetry via authenticated HTTP (verifying credential redaction), and collect only the newly created `admittedJobIds`.
   - Run `seal-worker` + bounded `worker-run`: issue `<= 10m` `s04RuntimeAcceptance` approval (`notBefore` between PG `preIngestAt` and earliest admitted `created_at`, `protectedJobIds` = all 8 DEV H02 jobs), run isolated worker until admitted job correlates `open` S03 alert -> S04 incident + timeline (`alert_created`, `incident_opened`), and verify clean shutdown + `/health` `acceptanceIsolation: true`.
   - Run `ingest-duplicate` + bounded worker follow-up + `verify-incidents` + `ui-verify`: verify duplicate/repeat alert correlation coalesces onto the single incident, drive authenticated Live UI & HTTP `open -> investigating (rev 2) -> closed (rev 3) -> reopen (rev 4)` and stale `expectedRevision` `409` conflict, and verify restart persistence.
   - Run `negative-matrix`: inside outer `BEGIN ... ROLLBACK` savepoint transactions (`withRollbackOnlyDatabase`) verify cross-project RLS, `42501` DML denials, `PostgresQueue` fencing/idempotency, and `retainIncidents`/`retainDetection`/`retainTelemetry` pins; then verify populated `0004_incidents` `down` refusal (`PlatformError("target_denied")`) under `"runtime"` action only.
   - Run `cleanup` + `postflight`: cleanly stop worker & Next server, revoke temporary H04C-B2 credential & disable temporary source/rule, close temporary DEV approvals (`actions: []`), confirm `91/91` pre-existing DEV rows (`8/8` protected queued H02 jobs untouched), `0` active leases/sessions/processes, and untouched `110,541`-byte H04C-A backup, then update S04 docs and stop awaiting Git publication approval.
```

---

## 9. H04C-B2 Phase 5 Incident-Timeline `23503` Root Cause Fix, Post-Fix Validation & TEST Regression Preparation

- **Status**: **IMPLEMENTED_PENDING_ACCEPTANCE** (status unchanged; targeted production fix verified offline and in operator browser/build runs; DEV runtime acceptance paused cleanly after Phase 5 failure; post-H04B PostgreSQL TEST regression prepared offline only, not yet executed).
- **Phase 5 Failure & Root Cause (`SQLSTATE 23503`)**:
  - In H04C-B2 Phase 5 duplicate-event processing, the second worker job exhausted 5 attempts with PostgreSQL `23503` on `sentinel.incident_timeline_evidence` constraint `incident_timeline_evidence_mode_workspace_id_project_id_in_fkey` (referenced key absent from `sentinel.incident_timeline`).
  - Root cause: `DetectionStore.process` in `src/features/sentinel/detection/store.ts` passed `lease.job` (`DurableJob` carrying `jobId`, `subjectRef`, `attempts`, `availableAt`, etc.) as `scope` into `correlateAlertIncident` in `src/features/sentinel/incidents/store.ts`, altering `fingerprint`/`deterministicUuid` keys between Job 1 and Job 2 so `INSERT INTO sentinel.incident_timeline ... ON CONFLICT DO NOTHING` skipped conflicting `(incident_id, sequence)` silently before `INSERT INTO sentinel.incident_timeline_evidence` failed on FK `23503`. `correlateAlertIncident` also lacked verification of persisted `timeline_id` and cohesive handling of duplicate/distinct multi-alert sequence allocation when `created === false`.
- **Targeted Production & Regression Fix (Zero Migration / Schema Changes)**:
  - `src/features/sentinel/scope.ts`: Added `canonicalScope(scope): SentinelScope` returning `{ mode, workspaceId, projectId }`.
  - `src/features/sentinel/detection/store.ts`: Normalized `lease.job` with `canonicalScope(...)` across `process` (`db.scoped`, `eventView`, `ruleView`, `persistMatch`) and inside `persistMatch`.
  - `src/features/sentinel/incidents/store.ts`: Normalized `scope`/`context.scope` with `canonicalScope(...)` in `correlateAlertIncident`, `correlateAlertById`, `incidents`, and `command`; added `buildInitialTimelineEntries`, `appendCorrelationTimelineEntry` (`RETURNING timeline_id` + `idempotency_key` fallback lookup, throwing `"incident_timeline_missing"` fail-closed if absent), and `linkTimelineEvidence`; locked the parent incident with `UPDATE ... RETURNING revision`; reused existing persisted `timeline_id`s (canonical `idempotency_key` or legacy `event_type IN ('alert_created','incident_opened') AND metadata->>'alertId'=$7`) when `created === false`; and handled `maxSeq === 0` vs `maxSeq > 0` (`maxSeq + 1` single `alert_created`).
  - `tests/sentinel/incident-store.test.ts`: Added `createConstraintDouble` (enforcing `0004` composite PK/UNIQUE/`23503` FK checks + `BEGIN/COMMIT/ROLLBACK` snapshot restore + cross-project isolation) with focused offline regression coverage (`19/19 PASS` in Vitest).
- **Verified Operator & Offline Post-Fix / Post-Prep Results**:
  - Immediately after production fix: `pnpm typecheck` PASS, `pnpm lint` PASS, `pnpm test` (`vitest run`) 750/750 PASS across 54/54 files.
  - Owner verification (`src/` unchanged since): `pnpm build` PASS (Next.js 16.4.6, 13/13 static pages); Playwright `--retries=0`: S04 3/3 PASS, S03 6/6 PASS, S02 5/5 PASS (14/14 PASS total).
  - After offline TEST-prep additions (+2 safety tests in `tests/sentinel/incident-acceptance-safety.test.ts`): `pnpm typecheck` PASS, `pnpm lint` PASS, `pnpm test` (`vitest run`) 752/752 PASS across 54/54 files (`tests/sentinel/incident.postgres.integration.ts` gated and excluded).
  - SQL migrations unchanged (`migrations/` & `src/features/sentinel/types.ts` diff empty).
- **Residual DEV State (Read-Only Assessment)**:
  - First test job completed; second test job failed after 5 attempts; initial incident persisted; temporary source disabled; temporary credential revoked; controlled detection rule remains enabled; worker and Next.js application stopped; temporary approvals closed; 8 historical queued jobs preserved; full post-failure 91-row DEV historical hash audit not yet completed. Disabling the remaining controlled detection rule is recorded as a required pre-flight containment step under separate DEV owner authorization before any recovery work.
- **Prepared Post-H04B TEST PostgreSQL Regression (`NOT_RUN`, Zero DB Connections)**:
  - `tests/sentinel/incident-acceptance-safety.ts`: Added `FullS04Snapshot`, `fullS04EvidenceSnapshot(pool)`, and `preserveAllS04CommittedRows(before, after)` to cover all 25 S01–S04 base tables (protecting both `517` S01–S03 rows and committed H04B `c28df621-...` fixture rows).
  - `scripts/sentinel-incident-preflight.ts`: Kept `--read-only` unchanged; added `--post-h04b` (post-H04B TEST preflight generating a fresh `fixtureId` UUID and fresh `baselineSha256`/`fullBaselineSha256`) and `--postflight <path>` (read-only audit verifying `preserveAllS04CommittedRows`, `catalogCount === 25`, `activeLeases === 0`, `0` orphaned `incident_timeline_evidence` rows, and optional H04A backup integrity).
  - `tests/sentinel/incident.postgres.integration.ts`: Wired `fullS04EvidenceSnapshot` + `preserveAllS04CommittedRows` and expanded the same-window correlation regression test (`Alert` -> `Incident` -> persisted `incident_timeline` -> `incident_timeline_evidence` -> duplicate same-window alert -> raw `23503` negative check inside `ROLLBACK` -> `correlateAlertById` idempotency -> `investigate`/`revision_conflict`/`close`/`reopen` -> atomic mid-tx `ROLLBACK` -> historical preservation).
  - `tests/sentinel/incident-acceptance-safety.test.ts`: Added offline safety tests for `--post-h04b`, `--postflight`, and `preserveAllS04CommittedRows`.
  - No `src/` files changed since the verified `pnpm build` and 14/14 Playwright runs; `wetscan_s01_test` and `wetscan_dev` remain untouched.

---

## 10. Verified Post-H04B TEST PostgreSQL Pass & Offline H04C-B2 DEV Recovery Harness Adaptations

- **Status**: **`IMPLEMENTED_PENDING_ACCEPTANCE`** (**DEV recovery has NOT passed or executed yet.**).
- **Authoritative Post-H04B TEST PostgreSQL Regression (`wetscan_s01_test` — PASS)**:
  - Executed once against `127.0.0.1:55432 / wetscan_s01_test` (`wetscan-s01:9f3560a6-127f-42a6-abaf-9f45951e6bd5`): read-only `--post-h04b` preflight `PASS` (`545` pre-existing rows, `fixtureId: a9605fba-cc28-4e11-abc0-b5cb19e91099`), `scripts/sentinel-incident-test.ts` **3/3 PASS in `3.44s`** (`0` skipped, `0` retries), and independent read-only `--postflight` `PASS` (`preservedTables: 25`, `catalogCount: 25`, `activeLeases: 0`, `orphanedTimelineEvidence: 0`, H04A backup `138,323` bytes `d11c574d...` verified, `545` preserved + `73` additive fixture rows = `618` total), with temporary TEST approvals closed (`actions: []`).
- **Offline Partial-DEV Recovery Harness Adaptations (Harness & Safety Modules Only)**:
  - Modified only [dev-acceptance-safety.ts](file:///C:/Users/sheil/OneDrive/Dokumen/Wildhan/projects/wetscan-prototype/tests/sentinel/dev-acceptance-safety.ts), [sentinel-dev-acceptance.ts](file:///C:/Users/sheil/OneDrive/Dokumen/Wildhan/projects/wetscan-prototype/scripts/sentinel-dev-acceptance.ts), and [dev-acceptance-safety.test.ts](file:///C:/Users/sheil/OneDrive/Dokumen/Wildhan/projects/wetscan-prototype/tests/sentinel/dev-acceptance-safety.test.ts) (no `src/`, `worker/`, or migration changes):
    1. **Partially Populated Incident Tables**: Replaced empty-S04 table hard failure with SHA-256-checksummed `pre-recovery-baseline.json` (`PreRecoverySnapshot`, `buildPreRecoverySnapshot`, `verifyPreRecoverySnapshot`) covering all `25` DEV tables (`preRecoveryRowHashesByTable`), asserting `0` orphaned `incident_timeline_evidence` rows, and preserving both the `91` H04C-A DEV rows and committed attempt-1 S04 rows.
    2. **Attempt-1 & Historical Job Preservation**: Separated `8` queued H02 jobs, `6` historical non-queued jobs, immutable attempt-1 `completed` (Job 1) and exhausted `failed` (Job 2) jobs (forbidden from retry/requeue/seal/mutation), and recovery `admittedJobIds` scoped strictly to `ctx.sourceId`.
    3. **Dual-Attempt Rule Containment**: Added `"contain-rule"` phase (`runContainRule`, `h04cB2Phases`) for prior synthetic rule `7ad1deb8-e555-44ec-be98-b7def574781d` (`containment.json`), enforced prior-rule `DISABLED` and prior-source `disabled / 0 active_credentials` preconditions before new provisioning, authorized strictly that verified rule transition in `verifyHistoricalMultisetPreserved`, and enforced both prior and new rule/source containment in `runCleanup` / `runPostflight`.
    4. **Deterministic UI Incident Selection**: Updated `runUiVerify()` to target exact `ctx.incidentId` (`a[href$="/incidents/${ctx.incidentId}"]`) instead of `.first()`, paired with `selectRecoveryIncident()` and `priorIncidentIds` exclusion in `runVerifyIncidents()` and `runUiVerify()`.
    5. **Historical Heartbeat Isolation**: Added `verifyWorkerHeartbeatsClean()` keeping immutable pre-existing `platform.worker_heartbeats` rows (including H04C-A stale `status='running'` `790e660d-408d-4f8f-8897-91b906a426e7`) intact while requiring all recovery worker IDs to finish `status === "stopped"` with `0` active/expired leases.
- **Verified Post-Adaptation Offline Validation (Owner Windows PowerShell)**:
  - `pnpm typecheck`: **PASS**.
  - `pnpm lint`: **PASS**.
  - `pnpm exec vitest run --maxWorkers=2`: **756/756 PASS** across **54** files (`tests/sentinel/incident.postgres.integration.ts` remained gated/unexecuted).
  - `node --import tsx scripts/sentinel-dev-acceptance.ts plan`: **PASS** (`databaseConnections: 0`, `supportsPartialDevRecovery: true`, `contain-rule` phase present, prohibition on retrying previously exhausted jobs preserved).
- **Remaining DEV Acceptance Sequence (`NOT_RUN`)**:
  - Read-only DEV recovery `preflight` -> bounded `contain-rule` (`7ad1deb8-e555-44ec-be98-b7def574781d`) -> `provision-and-ingest` -> `seal-worker` -> `worker-run` (Batch 1) -> `ingest-duplicate` -> `seal-worker` -> `worker-run` (Batch 2) -> `verify-incidents` -> `ui-verify` -> `negative-matrix` -> `cleanup` -> `postflight` -> approval closure.

## 11. HTTP 401 takeover investigation (15-16 November 2026)

See [S04 authentication diagnosis](../SENTINEL_S04_AUTH_401_DIAGNOSIS.md) for current evidence, the Windows PowerShell Cookie-header root cause, a minimal CookieContainer helper, eight transport regressions, the preserved original and corrected private runner, and the precise remaining authorization scope. Offline validation: typecheck/lint PASS, 769/769 tests PASS across 55 files with `--maxWorkers=4`, unchanged zero-connection acceptance plan, and corrected runner offline prerequisites PASS. The second failed execution approval is CLOSED with zero actions. No live phase was rerun and no database connection was made. Status remains **IMPLEMENTED_PENDING_ACCEPTANCE**.

## 12. Owner-authorized contain-rule PASS (16 November 2026)

One bounded live attempt with the reviewed corrected runner passed authenticated GET and the single pinned disable POST: rule `7ad1deb8-e555-44ec-be98-b7def574781d` is now **DISABLED revision 3**, from ENABLED revision 2. Comprehensive read-only preservation audit, independent process cleanup checks, artifact-integrity checks, and CLOSED/zero-action approval verification all passed. Sanitized evidence is in `C:\Users\sheil\.wetscan-sentinel\s04-h04c-b2-contain-codex-f1862fad0fd1475d86cd39b2badba1cb`; see the [execution follow-up](../SENTINEL_S04_AUTH_401_DIAGNOSIS.md#owner-authorized-contain-rule-execution-16-november-2026) for counts and scope. No later phase ran. Stop here; S04 remains **IMPLEMENTED_PENDING_ACCEPTANCE**.

## 13. Offline provision-and-ingest hardening (16 November 2026)

The owner separately authorized offline engineering only. The dedicated default-off runner is `scripts/Invoke-H04CB2ProvisionAndIngest.ps1`; see [hardening, validation, handoff and future authorization](../SENTINEL_S04_PROVISION_HARDENING.md). Normal mutation limit remains 10 inserted rows; emergency containment is limited to positively identified new resources and 12 inserts overall. No historical row/job/incident mutation or worker execution is allowed. Typecheck/lint, 97 focused tests, and 842 full tests passed; default runner and acceptance plan report zero database connections. No live provision/ingest or emergency attempt occurred. Stop pending a separate live owner grant; overall status remains **IMPLEMENTED_PENDING_ACCEPTANCE**.
