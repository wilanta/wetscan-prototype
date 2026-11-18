# S04 migration review — H04B TEST, H04C-A DEV Backup & H04C-B1 DEV Migration PASS / Pending H04C-B2 Runtime

Status: **H04C_B1_DEV_MIGRATION_COMPLETE_PENDING_H04C_B2_RUNTIME** (`0004_incidents` applied and verified on `wetscan_s01_test` under closed **H04B** approval; `wetscan_dev` read-only preflight and private `pg_dump 17.12` backup completed under closed **H04C-A** approval; `0004_incidents` applied UP twice and verified on `wetscan_dev` under now-closed **H04C-B1** approval with `91/91` original rows and `8/8` historical queued jobs preserved and `0` runtime workers started; **NOT APPLIED** to production; **H04C-B2** bounded runtime acceptance awaits separate explicit owner authorization).

---

## 1. Verified Offline Migration Identity (Normalized LF UTF-8)

Reproduced independently via PowerShell `.NET` `[System.Security.Cryptography.SHA256]` using the exact newline-normalized (`\r\n -> \n`) formula in `src/platform/migrations.ts`:

| Artifact / Plan | Normalized LF SHA-256 | Notes |
| --- | --- | --- |
| **Combined S04 Plan (`0001`+`0002`+`0003`+`0004`+roles)** | `3438a56e778b30afdd6acf03600638fe31e26c55c2ae5bf63d224f909c429ae7` | `migrationPlan().sha256` (`reviewedS04Plan`) |
| **`0004_incidents` pair (`up + "\0" + down`)** | `84b5b4987e498bbb047505cd81218716357ce5f1434fb466749c7ed433141663` | `Migration.checksum` for `0004_incidents` |
| **`migrations/sentinel/0004_incidents.up.sql`** | `84adf3030338757728552cae07a70b1dd549f9785078fc6e5a3ababae8d939dd` | 5 additive tables, 6 explicit indexes, 10 RLS policies |
| **`migrations/sentinel/0004_incidents.down.sql`** | `c695777076aea80a1e84c3824c6faf4b8f32595ec7795337f95ef89ef3f444f5` | Drops only the 5 S04 tables in dependency order |
| **`0001_foundation` pair (`Migration.checksum`)** | `dd061a60b123284882f154c438de3a171d60967b7b07a4e07200b6693f4eb778` | Unchanged from S01 (`up`: `d47e257ee8905a8fd24de1e93de259d83864ce6531a763099459dcf9e3f9d2ac`, `down`: `fd96ddb7f06c1461ebc7737cff123488d47c62af6efaf435587aad4e95d564f4`) |
| **`0002_telemetry` pair (`Migration.checksum`)** | `d1b67dc680f5bf3c2cbe585dca2427abf9d7ba9f29479c69b851f66b91c1f5a3` | Unchanged from S02 (`up`: `a2352cd01396467e917bbbbe0dc51d9f187ba6292e7f971f0752c2b429b7acb6`, `down`: `7c667f112025ad4789f330ce9e1a362a0e78a98ddb46f0f7a72af744770dcafa`) |
| **`0003_detection` pair (`Migration.checksum`)** | `4f0ee1cebdbdc81b835f719ef13c9cb703dfb5f440193765dfa0a61635fb6168` | Unchanged from S03 (`up`: `25c2820e7b50501c3358486bb6c4520a2d17fb5343635ee3a173424bcb01a83e`, `down`: `bfe2857310b8f7d1c6f1743cfc99c5bbfc28a110159c43510e73736671423234`) |
| **Historical S03 3-migration slice plan (`0001`..`0003`)** | `c3e39f6fd43ee6eb2fbf5b244778955aab4cabb8a11ed3c66d791cf99a252a94` | Preserved for historical S03 comparison |
| **`infra/sentinel/provision-roles.sql` (Normalized LF)** | `7c531cf4165f7fa4eb4a4b65aff4ad409360f6a3cd08f3af8932c48d91829299` | Unchanged from S01 (raw CRLF SHA-256: `df521303f529dbccdded1933bf2052095f445158c3db9be6d2a49bf35116220a`) |

---

## 2. Additive Schema Objects in `0004_incidents`

### Tables Created (5)

1. `sentinel.incidents`
   - Primary key: `(mode, workspace_id, project_id, incident_id)`
   - Unique constraints: `(mode, workspace_id, project_id, deduplication_key)`, `(mode, workspace_id, project_id, incident_id, source_id)`
   - Foreign keys (`ON DELETE RESTRICT`):
     - `(mode, workspace_id, project_id) -> sentinel.project_bindings`
     - `(mode, workspace_id, project_id, source_id) -> sentinel.telemetry_sources`
     - `(mode, workspace_id, project_id, primary_alert_id, source_id) -> sentinel.detection_alerts(mode, workspace_id, project_id, alert_id, source_id)`
     - `(mode, workspace_id, project_id, rule_id, rule_version) -> sentinel.detection_rule_versions`
   - Domain checks:
     - `mode = 'live'`, `schema_version = 1`, `rule_version BETWEEN 1 AND 100`, `revision BETWEEN 1 AND 1000`
     - `status IN ('open', 'investigating', 'closed')`
     - `verification_status = 'not_requested'`
     - `NOT archived`
     - `origin IN ('runtime', 'controlled_test')`
     - `(status = 'closed' AND closed_at IS NOT NULL AND closed_by IS NOT NULL AND close_reason IS NOT NULL) OR (status <> 'closed' AND closed_at IS NULL AND closed_by IS NULL AND close_reason IS NULL)`
2. `sentinel.incident_alerts`
   - Primary key: `(mode, workspace_id, project_id, incident_id, alert_id)`
   - Unique constraint: `(mode, workspace_id, project_id, alert_id)` (enforces 1-to-1 alert-to-incident ownership per project scope)
   - Foreign keys (`ON DELETE RESTRICT`): `sentinel.incidents(mode, workspace_id, project_id, incident_id, source_id)` and `sentinel.detection_alerts(mode, workspace_id, project_id, alert_id, source_id)`
3. `sentinel.incident_evidence`
   - Primary key: `(mode, workspace_id, project_id, incident_id, source_id, event_id)`
   - Foreign keys (`ON DELETE RESTRICT`): `sentinel.incidents(mode, workspace_id, project_id, incident_id, source_id)` and `sentinel.telemetry_events(mode, workspace_id, project_id, source_id, event_id)`
4. `sentinel.incident_timeline`
   - Primary key: `(mode, workspace_id, project_id, incident_id, timeline_id)`
   - Unique constraints: `(mode, workspace_id, project_id, incident_id, sequence)`, `(mode, workspace_id, project_id, incident_id, idempotency_key)`
   - Foreign key (`ON DELETE RESTRICT`): `sentinel.incidents(mode, workspace_id, project_id, incident_id)`
   - Domain checks:
     - `sequence BETWEEN 1 AND 1000`, `schema_version = 1`, `incident_revision BETWEEN 1 AND 1000`
     - `event_type IN ('alert_created', 'incident_opened', 'incident_closed')` (never permits S05 `policy_evaluating` or fabricated mitigation/verification events)
     - `actor_type IN ('system', 'user')`
     - `jsonb_typeof(metadata) = 'object' AND octet_length(metadata::text) <= 2048`
5. `sentinel.incident_timeline_evidence`
   - Primary key: `(mode, workspace_id, project_id, incident_id, timeline_id, source_id, event_id)`
   - Foreign keys (`ON DELETE RESTRICT`): `sentinel.incident_timeline`, `sentinel.incident_evidence`, and `sentinel.telemetry_events`

### Explicit Indexes Created (6)

- `incidents_query`: `sentinel.incidents(mode, workspace_id, project_id, last_observed_at DESC, incident_id DESC)`
- `incidents_filters`: `sentinel.incidents(mode, workspace_id, project_id, status, severity, source_id, rule_id, last_observed_at DESC)`
- `incident_alerts_lookup`: `sentinel.incident_alerts(mode, workspace_id, project_id, alert_id, incident_id)`
- `incident_evidence_event`: `sentinel.incident_evidence(mode, workspace_id, project_id, source_id, event_id)`
- `incident_timeline_order`: `sentinel.incident_timeline(mode, workspace_id, project_id, incident_id, sequence ASC, occurred_at ASC, timeline_id ASC)`
- `incident_timeline_evidence_event`: `sentinel.incident_timeline_evidence(mode, workspace_id, project_id, source_id, event_id)`

---

## 3. Least-Privilege Role Grants & FORCE RLS

- `REVOKE ALL ON sentinel.incidents, sentinel.incident_alerts, sentinel.incident_evidence, sentinel.incident_timeline, sentinel.incident_timeline_evidence FROM PUBLIC;`
- **`wetscan_app`**:
  - `SELECT` on all 5 S04 tables.
  - `UPDATE(status, updated_at, closed_at, closed_by, close_reason, last_actor_id, revision)` on `sentinel.incidents` only.
  - `INSERT` on `sentinel.incident_timeline` and `sentinel.incident_timeline_evidence` only.
  - **No** `INSERT` or `DELETE` on `sentinel.incidents`, `sentinel.incident_alerts`, or `sentinel.incident_evidence`.
  - **No** `UPDATE` or `DELETE` on `sentinel.incident_timeline` or `sentinel.incident_timeline_evidence`.
- **`wetscan_sentinel_worker`**:
  - `SELECT, INSERT, UPDATE, DELETE` on `sentinel.incidents`.
  - `SELECT, INSERT, DELETE` on `sentinel.incident_alerts`, `sentinel.incident_evidence`, `sentinel.incident_timeline`, and `sentinel.incident_timeline_evidence`.
  - **No** `UPDATE` on `sentinel.incident_timeline` or `sentinel.incident_timeline_evidence` (enforcing append-only timeline immutability across both runtime roles; `DELETE` is granted to the worker solely for expired 30-day closed-incident retention cleanup).
- **Row-Level Security (`FORCE ROW LEVEL SECURITY`)**:
  - Enabled and forced on all 5 tables.
  - `incident_scope` policy requires `mode = 'live'`, `current_user IN ('wetscan_app', 'wetscan_sentinel_worker')`, `current_setting('wetscan.module', true) = 'sentinel'`, and exact match on `mode`, `workspace_id`, and `project_id` in both `USING` and `WITH CHECK`.
  - `incident_migration_read` policy permits read-only `SELECT` for `wetscan_migrator` during baseline/postflight verification and `pg_dump --enable-row-security`.

---

## 4. Guarded Reversal Protocol (`applyMigrations(..., "down")`)

In `src/platform/migrations.ts`:

- When `latest.version === "0004_incidents"`, `applyMigrations` acquires `ACCESS EXCLUSIVE MODE` locks on `sentinel.incident_timeline_evidence`, `sentinel.incident_timeline`, `sentinel.incident_evidence`, `sentinel.incident_alerts`, `sentinel.incidents`, `sentinel.detection_alerts`, `sentinel.detection_evidence`, `sentinel.telemetry_events`, and `platform.jobs`.
- If **any** of the 5 S04 tables contains even 1 row (`SELECT EXISTS(SELECT 1 FROM sentinel.<table> LIMIT 1)`), `applyMigrations` throws `PlatformError("target_denied")` and rolls back without executing `DROP TABLE`.
- Only when all 5 S04 tables are completely empty does `applyMigrations` execute `0004_incidents.down.sql` and remove the `0004_incidents` row from `platform.schema_migrations`, leaving all S01–S03 tables and data untouched.

---

## 5. Required Human Approval Gates

1. **H04A — Read-Only TEST Preflight and Private Backup (`PASS — Completed 15 November 2026`)**:
   - Target: `127.0.0.1:55432 / wetscan_s01_test`, marker `wetscan-s01:9f3560a6-127f-42a6-abaf-9f45951e6bd5`.
   - Executed under a temporary private approval file (`actions: ["runtime"]`, `s04ReadOnlyPreflight: true`, `s04PrivateLogicalBackup: true`, `migrationPlanSha256: "3438a56e778b30afdd6acf03600638fe31e26c55c2ae5bf63d224f909c429ae7"`), now closed (`status: "COMPLETED_H04A_READONLY_BACKUP"`, `actions: []`).
2. **H04B — TEST Migration (`0004_incidents` up/up) and PostgreSQL Acceptance Suite (`PASS — Completed 15 November 2026`)**:
   - Executed under a temporary private approval file (`actions: ["integration_test", "migrate_up"]` only; no `"migrate_down"` or `"runtime"`) binding the verified H04A `baselineSha256` (`9facc592ff49e7ddeffc9fd1a2ecba8d93af4e82c3504de46dc044d2426a14a0`), `backupFile`, `backupSha256` (`d11c574de9fab2621ba18d893d88f514f380653b78c2e3598b6aa22278ad66ab`), `fixtureId` (`c28df621-8015-42e5-af91-20cafebc8457`), and `s04ApprovedOperations`.
   - Command (`node --env-file=.env.sentinel.s04.test.local --import tsx scripts/sentinel-incident-test.ts`): **PASS (2/2 tests, exit 0, `2.25s`)**, now closed (`status: "COMPLETED_H04B_TEST_ACCEPTANCE"`, `actions: []`).
3. **H04C-A — Read-Only DEV Preflight and Verified Private Backup (`PASS — Completed 15 November 2026`)**:
   - Target: `127.0.0.1:55432 / wetscan_dev`, marker `wetscan-s01:26b6b537-c016-4dc7-8007-4e839e8b838f`.
   - Executed under a temporary private approval file (`actions: ["runtime"]`, `s04ReadOnlyPreflight: true`, `s04PrivateLogicalBackup: true`, `migrationPlanSha256: "3438a56e778b30afdd6acf03600638fe31e26c55c2ae5bf63d224f909c429ae7"`) strictly using `REPEATABLE READ READ ONLY` and `pg_dump --enable-row-security` (`default_transaction_read_only=on`), now closed (`status: "COMPLETED_H04C_A_DEV_READONLY_BACKUP"`, `actions: []`, `mutations: 0`).
4. **H04C-B — DEV Migration (`wetscan_dev`) and Bounded Authenticated Runtime Acceptance (`BLOCKED_ON_ISOLATION_PATCH_AND_OWNER_APPROVAL`)**:
   - Prerequisite blocker identified during H04C-A: `worker/sentinel/acceptance.ts` hardcodes the S03 3-migration plan SHA-256 (`c3e39f6fd43ee6eb2fbf5b244778955aab4cabb8a11ed3c66d791cf99a252a94`) and `s03RuntimeAcceptance`, whereas `worker/sentinel/main.ts` enforces S04's `3438a56e...` after `0004_incidents`. Must update `worker/sentinel/acceptance.ts` for `s04RuntimeAcceptance` (plus rerun affected non-destructive checks) and obtain separate explicit H04C-B owner authorization before applying `0004_incidents` to `wetscan_dev`, starting the sealed worker, or running authenticated HTTP -> PostgreSQL -> UI runtime acceptance.

---

## 6. H04A Observed Result — PASS (15 November 2026)

Owner authorization: **WETSCAN SENTINEL S04 — H04A READ-ONLY TEST PREFLIGHT AND VERIFIED PRIVATE BACKUP** (15 November 2026). Permitted only read-only TEST preflight verification, verification of existing S01–S03 data and migration history, creation of a complete private logical backup of `wetscan_s01_test`, and read-only verification that the database remained unchanged (`mutations = 0`). The temporary H04A approval record is now closed (`COMPLETED_H04A_READONLY_BACKUP`, `actions: []`).

### 6.1 Exact Verified TEST Database & Container Identity

- **Endpoint & Database**: `127.0.0.1:55432 / wetscan_s01_test`
- **Shared-Object Marker**: `wetscan-s01:9f3560a6-127f-42a6-abaf-9f45951e6bd5`
- **PostgreSQL Server**: `17.12 (Debian 17.12-1.pgdg12+1)`, `server_version_num = 170012`, `max_connections = 40`
- **Database Owner & ACL**: `wetscan_migrator`, `datacl = {wetscan_migrator=CTc/wetscan_migrator,wetscan_app=c/wetscan_migrator,wetscan_sentinel_worker=c/wetscan_migrator}`
- **Docker Context / Container / Volume / Image**:
  - Context: `desktop-linux`
  - Container: `wetscan-sentinel-local-postgres-1` (`0220e86e719aa43c30dfd3ba371e290de0fe9141d8d1fe7f7fc6a58accb8961f`), running, port mapping `127.0.0.1:55432 -> 5432/tcp` only
  - Volume: `wetscan_sentinel_s01_dev_20261114` mounted at `/var/lib/postgresql/data`
  - Image digest: `sha256:99d1a998c76487d3abb48b141505bda5dcf8089c0c4cd7be40f75de314fa32f0` (`postgres:17.12-bookworm`)
- **Principals & Role Connections (`BEGIN READ ONLY`)**:
  - `wetscan_app`, `wetscan_sentinel_worker`, and `wetscan_migrator` all connected in `transaction_read_only = on` mode with `LOGIN`, `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOBYPASSRLS`, `0` role memberships, `0` `pg_default_acl` overrides, and `row_security_active = true` across `platform.jobs`, `sentinel.telemetry_events`, and `sentinel.detection_alerts`.
- **Absence of S04 Objects**: `to_regclass('sentinel.incidents') IS NULL` and `0` `incident*` tables or indexes in `platform` or `sentinel`.

### 6.2 Existing Migration Ledger & Checksum Verification

| Applied Migration | Pair Checksum (`up + "\0" + down`) | Applied At (UTC) | Status |
| --- | --- | --- | --- |
| `0001_foundation` | `dd061a60b123284882f154c438de3a171d60967b7b07a4e07200b6693f4eb778` | `2026-11-14 12:24:59.556942+00` | Exact match |
| `0002_telemetry` | `d1b67dc680f5bf3c2cbe585dca2427abf9d7ba9f29479c69b851f66b91c1f5a3` | `2026-11-14 20:03:28.380091+00` | Exact match |
| `0003_detection` | `4f0ee1cebdbdc81b835f719ef13c9cb703dfb5f440193765dfa0a61635fb6168` | `2026-11-15 03:44:09.392677+00` | Exact match |

### 6.3 Historical Row Preservation & Pre/Post Backup Snapshot Comparison

- **Canonical 12-Table Baseline Digest (`baselineSha256`)**:
  - Pre-backup (`before`): `9facc592ff49e7ddeffc9fd1a2ecba8d93af4e82c3504de46dc044d2426a14a0`
  - Post-backup (`after`): `9facc592ff49e7ddeffc9fd1a2ecba8d93af4e82c3504de46dc044d2426a14a0`
  - Post-H03B historical reference: **100% byte-for-byte match**
- **Extended 20-Table & Catalog Inventory Digest (`extendedSha256`)**:
  - Pre-backup (`before`): `f749b16c3e19967c1832e38b563f572a276e50585a4c4d94c808ae3758ad48e3`
  - Post-backup (`after`): `f749b16c3e19967c1832e38b563f572a276e50585a4c4d94c808ae3758ad48e3`
  - Post-H03B historical reference (all 20 table row digests, 39 indexes, 38 RLS policies, 19 FORCE RLS tables, schemas, constraints, column grants, table privileges): **100% byte-for-byte match**

| Table (`platform.*` / `sentinel.*`) | Historical Post-H03B | H04A Pre-Backup (`before`) | `pg_dump` Archive (`INSERT` rows) | H04A Post-Backup (`after`) |
| --- | ---: | ---: | ---: | ---: |
| `platform.schema_migrations` | 3 | 3 | 3 | 3 |
| `platform.module_limits` | 1 | 1 | 1 | 1 |
| `sentinel.project_bindings` | 9 | 9 | 9 | 9 |
| `sentinel.telemetry_sources` | 35 | 35 | 35 | 35 |
| `sentinel.telemetry_credentials` | 36 | 36 | 36 | 36 |
| `sentinel.telemetry_events` | 41 | 41 | 41 | 41 |
| `sentinel.telemetry_batches` | 33 | 33 | 33 | 33 |
| `platform.jobs` | 34 | 34 | 34 | 34 |
| `platform.job_attempts` | 16 | 16 | 16 | 16 |
| `platform.notification_outbox` | 0 | 0 | 0 | 0 |
| `platform.notification_attempts` | 0 | 0 | 0 | 0 |
| `platform.worker_heartbeats` | 0 | 0 | 0 | 0 |
| `sentinel.detection_rules` | 14 | 14 | 14 | 14 |
| `sentinel.detection_rule_versions` | 26 | 26 | 26 | 26 |
| `sentinel.detection_audit` | 26 | 26 | 26 | 26 |
| `sentinel.detection_alerts` | 33 | 33 | 33 | 33 |
| `sentinel.detection_evidence` | 41 | 41 | 41 | 41 |
| `sentinel.detection_evaluations` | 130 | 130 | 130 | 130 |
| `sentinel.detection_cooldowns` | 33 | 33 | 33 | 33 |
| `sentinel.detection_suppressed_evidence` | 6 | 6 | 6 | 6 |
| **Subtotal — 12 S01–S02 Tables (`baselineSha256`)** | **208** | **208** | **208** | **208** |
| **Subtotal — 8 S03 Detection Tables (`detectionRows`)** | **309** | **309** | **309** | **309** |
| **Grand Total — All 20 Existing Tables (`extendedSha256`)** | **517** | **517** | **517** | **517** |

- **Historical Job States**: `queued: 19`, `completed: 13`, `cancelled: 1`, `leased: 1` (`expired_leases: 1`, `active_leases: 0`).
- **Historical Detection Alerts**: `33` alerts (`origin = 'controlled_test'`, `severity = 'low'`, `category = 'http'`).
- **Row-Total Reconciliation (`517` Verified Rows vs `481` Prose Sum)**:
  - Inspection of the existing H04A private evidence files (`before.json`, `after.json`, `backup-report.json`, and `.local/sentinel/s04-test-preflight-c28df621-8015-42e5-af91-20cafebc8457.json`) without reconnecting to PostgreSQL confirmed that the true total across all 20 tables is **517 rows** (`208` rows across the 12 S01–S02 tables + `309` rows across the 8 S03 detection tables).
  - Specifically, `sentinel.telemetry_credentials` (`36` rows) was captured in full in:
    1. `.local/sentinel/s04-test-preflight-c28df621-8015-42e5-af91-20cafebc8457.json`: `snapshot.counts["sentinel.telemetry_credentials"] = 36` and `snapshot.rows["sentinel.telemetry_credentials"].length = 36` (36 per-row SHA-256 digests).
    2. `before.json` and `after.json`: `allCounts["sentinel.telemetry_credentials"] = 36` and `migratorBackupCoverage` (`visibleRows: 36`, `expectedHistoricalRows: 36`, `tableSelectPrivilege: true`, `readableColumns: 8/8`, `permissiveMigratorSelectPolicy: true`, `restrictivePolicies: 0`).
    3. `backup-report.json`: `rows["sentinel.telemetry_credentials"] = 36` (36 `INSERT INTO sentinel.telemetry_credentials VALUES (...)` statements verified in offline `pg_restore 17.12 --file=-` decode of `wetscan_s01_test-before-0004.dump`).
  - The `481` figure in the initial H04A chat summary was solely a manual arithmetic error in the response prose (`517 - 36 = 481`) when summing the 20 published table counts by hand; there is zero inconsistency between the read-only database snapshot and the private backup archive.

### 6.4 Backup Completeness Proof & Verified Private Archive

1. **Pre-Backup Role & RLS Completeness Verification**:
   - Before invoking `pg_dump`, read-only inspection confirmed that `wetscan_migrator` has table-level `SELECT` and column-level `SELECT` across 100% of columns on all 20 tables.
   - `platform.schema_migrations` has `relrowsecurity = false` and is owned by `wetscan_migrator`.
   - All 19 remaining tables have `relrowsecurity = true`, `relforcerowsecurity = true`, `row_security_active = true`, an unconditional `PERMISSIVE` `FOR SELECT` policy (`USING (current_user = 'wetscan_migrator')`), and `0` `RESTRICTIVE` policies.
   - Empirical `SELECT count(*)::int` queries executed as `wetscan_migrator` with `row_security = on` matched 100% of historical rows across all 20 tables without disabling RLS, elevating privileges, or changing grants.
2. **Verified Private Archive (`VERIFIED_ARCHIVE_NOT_RESTORE_TESTED`)**:
   - **UTC Window**: `2026-11-15T08:58:17.625Z` – `2026-11-15T08:58:18.119Z`
   - **File Name & Location**: `wetscan_s01_test-before-0004.dump`, stored outside the repository and outside OneDrive in a new ACL-restricted directory (inheritance disabled; only current operator and `SYSTEM` granted access; referenced via gitignored `.local/sentinel/s04-h04a-private-directory.txt`).
   - **Size**: `138,323` bytes
   - **SHA-256 Digest**: `d11c574de9fab2621ba18d893d88f514f380653b78c2e3598b6aa22278ad66ab`
   - **Format & Tooling**: `PostgreSQL custom PGDMP`, created by container `pg_dump 17.12` (`--format=custom --inserts --enable-row-security --no-password --lock-wait-timeout=5s`, `default_transaction_read_only=on`, `row_security=on`), `dumpExitCode = 0`, `stderrBytes = 0`.
   - **TOC & Offline Decode Verification (`pg_restore 17.12 --list` and `--file=-`)**:
     - `20` `TABLE` definitions, `20` `TABLE DATA` entries, `38` `POLICY` entries, `19` `ROW SECURITY` entries, `14` standalone `INDEX` entries (plus `25` constraint-backed indexes = `39` total), and `27` `ACL` entries.
     - Offline decoded `INSERT INTO <schema>.<table> VALUES (` row counts matched the read-only snapshot for all 20 tables (`100%` row coverage).
   - **Limitations**: Archive listing and offline SQL decode do not constitute a live restore rehearsal. Restoring into `wetscan_s01_test`, `wetscan_dev`, or production is forbidden; an isolated restore test into a disposable database would require separate owner authorization.
   - **Helper Diagnostics Note**: Two read-only helper script checks in `.local/sentinel/` were refined during H04A (sorting the 8 S03 detection table keys alphabetically to match `h03bAfter.detectionRows` key order, parsing `pg_policies.roles` array text `"{public}"` alongside `Array.isArray`, and using `TABLE\s+(?!DATA\b)` when counting `pg_restore --list` `TABLE` vs `TABLE DATA` entries). Zero production, migration, or test files were modified, and `pg_dump` was executed only once.

### 6.5 H04B Prerequisites & Readiness

All H04B prerequisites are satisfied (`PASS`):
- Proposed isolated fixture UUID: `c28df621-8015-42e5-af91-20cafebc8457` (preflight artifact `.local/sentinel/s04-test-preflight-c28df621-8015-42e5-af91-20cafebc8457.json`)
- Unused fixture scope verified: `github-user-7:s04-c28df621-8015-42e5-af91-20cafebc8457` and `github-user-7:s04-c28df621-8015-42e5-af91-20cafebc8457-other` (`fixture_exists = false`)
- Active job leases: `0` (`other_sentinel_sessions = 0`)
- Verified `baselineSha256`: `9facc592ff49e7ddeffc9fd1a2ecba8d93af4e82c3504de46dc044d2426a14a0`
- Verified `backupSha256`: `d11c574de9fab2621ba18d893d88f514f380653b78c2e3598b6aa22278ad66ab` (`138,323` bytes)

### 6.6 H04B Safety Patch — Removal of `migrate_down` Approval & Read/Lock-Only SQL Allowlist Refusal Coverage

To enforce least privilege before H04B execution, the S04 acceptance runner and safety suite were patched across 5 existing S04 test/script files (`scripts/sentinel-incident-test.ts`, `tests/sentinel/incident-acceptance-safety.ts`, `tests/sentinel/incident.postgres.integration.ts`, `tests/sentinel/incident-acceptance-safety.test.ts`, and `tests/sentinel/incident-migrations.test.ts`) with zero changes to production source or SQL migrations:

1. **Removal of `migrate_down` Approval & Strict Action Allowlist (`actions: ["integration_test", "migrate_up"]` Only)**:
   - Removed `parseApproval(c.approval, c.target, "migrate_down", reviewedS04Plan);` from `scripts/sentinel-incident-test.ts`.
   - `incidentAcceptancePermission` (`tests/sentinel/incident-acceptance-safety.ts:189-200`) now enforces `parseApproval(approval, s04TestTarget, "integration_test", reviewedS04Plan)` and `parseApproval(approval, s04TestTarget, "migrate_up", reviewedS04Plan)` and rejects any approval whose `actions` array does not contain **only** `["integration_test", "migrate_up"]` (rejecting `"migrate_down"`, `"runtime"`, missing required actions, or wrong TEST target/migration hash).
2. **Exact 11-Statement Read/Lock-Only SQL Allowlist (`s04DownRefusalAllowedSql`)**:
   - `isAllowedS04DownRefusalSql(sql, values)` (`tests/sentinel/incident-acceptance-safety.ts:65-77`) rejects any parameterized query (`values.length > 0`), rejects any SQL matching `\b(DROP|DELETE|TRUNCATE|ALTER|INSERT|UPDATE|CREATE|GRANT|REVOKE|COMMIT|COPY|VACUUM)\b/i`, and permits only exact membership in `s04DownRefusalAllowedSql`:
     1. `"BEGIN"`
     2. `"ROLLBACK"`
     3. `"SELECT pg_advisory_xact_lock(7342001)"`
     4. `"SELECT to_regclass('platform.schema_migrations') AS ledger,to_regnamespace('platform') AS platform,to_regnamespace('sentinel') AS sentinel"`
     5. `"SELECT version,checksum FROM platform.schema_migrations ORDER BY version"`
     6. `"LOCK TABLE sentinel.incident_timeline_evidence,sentinel.incident_timeline,sentinel.incident_evidence,sentinel.incident_alerts,sentinel.incidents,sentinel.detection_alerts,sentinel.detection_evidence,sentinel.telemetry_events,platform.jobs IN ACCESS EXCLUSIVE MODE"`
     7. `"SELECT EXISTS(SELECT 1 FROM sentinel.incident_timeline_evidence LIMIT 1) AS occupied"`
     8. `"SELECT EXISTS(SELECT 1 FROM sentinel.incident_timeline LIMIT 1) AS occupied"`
     9. `"SELECT EXISTS(SELECT 1 FROM sentinel.incident_evidence LIMIT 1) AS occupied"`
     10. `"SELECT EXISTS(SELECT 1 FROM sentinel.incident_alerts LIMIT 1) AS occupied"`
     11. `"SELECT EXISTS(SELECT 1 FROM sentinel.incidents LIMIT 1) AS occupied"`
3. **Bounded Lock Timeout, Generic Proxy Typing & Guaranteed Transaction/Lock Cleanup (`createS04DownRefusalPool`, `assertS04DownRefusalAudit`, `verifyPopulatedS04DownRefusal`)**:
   - `createS04DownRefusalPool` (`tests/sentinel/incident-acceptance-safety.ts:104-142`) implements `SqlClient.query<R extends QueryResultRow = QueryResultRow>` generically and forwards `await c.query<R>(sql, values)`, preserving exact generic row typing without `any`, `@ts-ignore`, or casts.
   - Immediately after `await c.query("BEGIN")`, `createS04DownRefusalPool` executes `SET LOCAL lock_timeout = '3000ms'` inside the transaction to bound lock acquisition (`pg_advisory_xact_lock(7342001)` and `LOCK TABLE ... IN ACCESS EXCLUSIVE MODE`), and only records `audit.statements.push(sql)` after the underlying query resolves.
   - If any disallowed SQL is attempted, it is recorded in `audit.blockedStatements` and rejected with `Error("blocked_unapproved_down_sql")` **before** reaching `c.query(...)`, triggering `ROLLBACK` in `applyMigrations`'s `catch` block (`src/platform/migrations.ts:222-227`).
   - On `release(destroy)`, if `audit.inTransaction` is still `true` (e.g., if `ROLLBACK` failed), the proxy forces `c.release(true)` to destroy the underlying connection and release all PostgreSQL locks.
   - `assertS04DownRefusalAudit` verifies `PlatformError("target_denied")`, empty `blockedStatements`, `lockTimeoutConfigured`, `clientReleased`, `!inTransaction`, `!destroyedOnRelease`, `BEGIN`..`ROLLBACK` bracketing, `pg_advisory_xact_lock`, `LOCK TABLE`, `SELECT EXISTS(... sentinel.incident_...)`, and zero DDL/DML/COMMIT keywords in `audit.statements`, throwing `Error("invalid_down_refusal_audit")` on any incomplete/failed rollback or tampered audit. (Recovered on 15 November 2026 after initial operator CLI run reported 1 generic TS error at `incident-acceptance-safety.ts:101` and 1 double-wrapping test failure at `incident-acceptance-safety.test.ts:289`; verified **PASS** by operator local PowerShell prior to H04B: `tsc --noEmit` exit `0`, `eslint .` `0` errors/`0` warnings, `vitest run` **726/726 PASS across 53/53 files**.)
4. **Live PostgreSQL Acceptance Refusal Coverage (`tests/sentinel/incident.postgres.integration.ts:229-265`)**:
   - After the first test correlates an S03 alert into a durable S04 incident and commits 4 timeline entries, the second test (`populated 0004_incidents reversal is refused before any destructive statement and preserves all committed records`) first verifies the committed S04 incident, alert link, evidence link, and 4 timeline entries exist, then runs `verifyPopulatedS04DownRefusal(pools.migration, plan.migrations)` (`PlatformError("target_denied")` verified before any destructive SQL), and finally re-queries `incidents.incidentDetails(...)` and `preserveS03(before, ...)` to confirm 100% preservation of both new S04 rows and all 517 historical S01–S03 rows.

---

## 7. H04B Observed Result — PASS (`wetscan_s01_test`, 15 November 2026)

Owner authorization: **WETSCAN SENTINEL S04 — H04B TEST MIGRATION & POSTGRESQL ACCEPTANCE** (15 November 2026). Limited strictly to `127.0.0.1:55432 / wetscan_s01_test` (`wetscan-s01:9f3560a6-127f-42a6-abaf-9f45951e6bd5`) with temporary private approval (`actions: ["integration_test", "migrate_up"]` only — zero `"migrate_down"`, zero `"runtime"`), now closed (`COMPLETED_H04B_TEST_ACCEPTANCE`, `actions: []`).

### 7.1 Pre-Execution Verification & Acceptance Run (`2/2 PASS`, `2.25s`)

- **Pre-Execution Checks Before Any Write (`PASS`)**: Confirmed `migrationPlan().sha256 = 3438a56e778b30afdd6acf03600638fe31e26c55c2ae5bf63d224f909c429ae7`, `0004_incidents = 84b5b4987e498bbb047505cd81218716357ce5f1434fb466749c7ed433141663`, untouched H04A backup (`wetscan_s01_test-before-0004.dump`, `138,323` bytes, SHA-256 `d11c574de9fab2621ba18d893d88f514f380653b78c2e3598b6aa22278ad66ab`), unchanged `baselineSha256` (`9facc592ff49e7ddeffc9fd1a2ecba8d93af4e82c3504de46dc044d2426a14a0`) & `extendedSha256` (`f749b16c3e19967c1832e38b563f572a276e50585a4c4d94c808ae3758ad48e3`), `517` rows across `20` tables, `0` `incident*` objects, `fixture_exists = false`, `active_leases = 0`, `other_sessions = 0`.
- **Command Run (Executed Once)**:
  `node --env-file=.env.sentinel.s04.test.local --import tsx scripts/sentinel-incident-test.ts` (exit code `0`, Vitest `v5.1.0`, Start `17:05:12`, Duration `2.25s`):
  1. `beforeAll`: Verified 3-role approval & `baselineSha256`, applied `0004_incidents` UP, and executed a second `applyMigrations(..., "up")` confirming idempotency (`up_up`).
  2. Test 1 (`530ms` — `correlates a persisted S03 alert into a durable S04 incident with append-only timeline and RLS isolation`): Created controlled fixture source/rule/event (`github-user-7:s04-c28df621-8015-42e5-af91-20cafebc8457` / `github-998736528`, `origin = 'controlled_test'`), processed 1 leased job with `{ correlateIncidents: true }`, read initial `open` incident (`verificationStatus = 'not_requested'`) with `["alert_created", "incident_opened"]`, executed `investigate` (`expectedRevision: 1`) -> `close` (`expectedRevision: 2`), verified `status = 'closed'`, `verificationStatus = 'not_requested'`, and 4 timeline entries, and executed `retainIncidents`, `retainDetection`, and `retainTelemetry`.
  3. Test 2 (`109ms` — `populated 0004_incidents reversal is refused before any destructive statement and preserves all committed records`): Executed `verifyPopulatedS04DownRefusal(pools.migration, plan.migrations)` via the 11-statement SQL allowlist proxy + `SET LOCAL lock_timeout = '3000ms'`, asserting `PlatformError("target_denied")`, zero blocked SQL, clean `ROLLBACK` / release, intact 4-entry incident details, and intact S01–S03 snapshot.

### 7.2 Independent Read-Only Postflight Verification (`PASS`)

- **Ledger (`platform.schema_migrations`)**: Exact 4 rows — `0001_foundation`, `0002_telemetry`, `0003_detection` (with unchanged `applied_at`), and `0004_incidents` (`checksum = 84b5b4987e498bbb047505cd81218716357ce5f1434fb466749c7ed433141663`, `applied_at = 2026-11-15 10:05:14.264242+00`).
- **Schema, Indexes, Composite FKs, Policies & Least-Privilege Grants**:
  - `25` tables total (`20` pre-existing + `5` `sentinel.incident*` owned by `wetscan_migrator`); `24` `ENABLE + FORCE ROW LEVEL SECURITY` tables (`platform.schema_migrations` excluded). All S01–S03 catalog objects, indexes, constraints, policies, privileges, and column grants matched pre-H04B 100%.
  - `16` indexes on `sentinel.incident*` (`55` total indexes), including all 6 explicit S04 indexes (`incidents_query`, `incidents_filters`, `incident_alerts_lookup`, `incident_evidence_event`, `incident_timeline_order`, `incident_timeline_evidence_event`).
  - `12` validated `ON DELETE RESTRICT` composite `(mode, workspace_id, project_id, ...)` foreign keys across the 5 `incident*` tables (`convalidated = true`, `confdeltype = 'r'`).
  - `10` new RLS policies (`48` total across `platform`/`sentinel`): `incident_scope` (`PERMISSIVE`, `ALL`) and `incident_migration_read` (`PERMISSIVE`, `SELECT`, `CURRENT_USER = 'wetscan_migrator'`) on all 5 `incident*` tables.
  - Exact grants verified: `0` `PUBLIC` grants; `wetscan_app` holds `SELECT` on all 5, `INSERT` only on `incident_timeline` & `incident_timeline_evidence`, column-level `UPDATE(close_reason, closed_at, closed_by, last_actor_id, revision, status, updated_at)` only on `incidents`, and `0` `DELETE`; `wetscan_sentinel_worker` holds `SELECT, INSERT, DELETE` on all 5 and `UPDATE` only on `incidents` (`0` `UPDATE` on timeline tables).
- **Row Counts Before vs After H04B (`517 -> 545`)**:
  - **Historical S01–S03 rows (`517/517`)**: 100% preserved bit-for-bit (`208` S01–S02 pre-existing + `1` `0004_incidents` ledger row + `309` S03 detection rows, including all `36` `sentinel.telemetry_credentials` rows, `19` historical queued jobs, and `1` historical expired leased job).
  - **Controlled S04 fixture rows (`27` total)**: `16` across pre-existing S01–S03 tables (`project_bindings +1`, `telemetry_sources +1`, `telemetry_credentials +1`, `telemetry_events +1`, `telemetry_batches +1`, `platform.jobs +1 [completed]`, `platform.job_attempts +1`, `detection_rules +1`, `detection_rule_versions +2`, `detection_audit +2`, `detection_alerts +1`, `detection_evidence +1`, `detection_evaluations +1`, `detection_cooldowns +1`) plus `11` across S04 incident tables (`incidents: 1`, `incident_alerts: 1`, `incident_evidence: 1`, `incident_timeline: 4`, `incident_timeline_evidence: 4`), all strictly scoped to `workspace_id = 'github-user-7:s04-c28df621-8015-42e5-af91-20cafebc8457'` (`project_id = 'github-998736528'`, `origin = 'controlled_test'`).
  - **Committed Incident & Timeline**: `incident_id = 66822b74-113b-5e7e-a079-e29fe2ba4bdb` (`status = 'closed'`, `verification_status = 'not_requested'`, `archived = false`, `revision = 3`, `closed_at/closed_by/close_reason` present) with timeline sequences `1..4`: `alert_created` (`system`, rev 1), `incident_opened` (`system`, `null -> open`, rev 1), `incident_opened` (`user`, `open -> investigating`, rev 2), `incident_closed` (`user`, `investigating -> closed`, rev 3).
- **Operational Hygiene & Honest Scope Boundary**: `active_leases = 0`, `other_sessions = 0`, H04A backup archive untouched (`138,323` bytes), H04B approval closed (`COMPLETED_H04B_TEST_ACCEPTANCE`, `actions: []`), zero connections to `wetscan_dev` during H04B. Note that `incident.postgres.integration.ts` did not directly execute `reopen`, `revision_conflict`, duplicate-alert correlation, live `GRANT`-denial SQL rollback (`negative_dml_rollback`), a second-project live RLS query, authenticated HTTP incident API calls, or the Live Incidents UI against PostgreSQL; domain/HTTP contracts are covered by Vitest (`726/726`) and live runtime verification moves to **H04C-B**.

---

## 8. H04C-A Observed Result — DEV Read-Only Preflight & Verified Private Backup (`wetscan_dev`, 15 November 2026)

Owner authorization: **WETSCAN SENTINEL S04 — H04C-A: DEV READ-ONLY PREFLIGHT & VERIFIED PRIVATE BACKUP** (15 November 2026). Strictly authorized read-only inspection and private logical `pg_dump` backup of `127.0.0.1:55432 / wetscan_dev` only (no migration, no worker activation, no test-row insertion, no historical job processing, no restore, no Git publication). The temporary H04C-A approval record is now closed (`COMPLETED_H04C_A_DEV_READONLY_BACKUP`, `actions: []`, `mutations: 0`).

### 8.1 Exact Verified DEV Database & Cluster Identity

- **Target Host / Port / Database**: `127.0.0.1:55432 / wetscan_dev`
- **DEV Shared-Object Database Marker**: `wetscan-s01:26b6b537-c016-4dc7-8007-4e839e8b838f` (positively distinguished from cluster sibling `wetscan_s01_test`, marker `wetscan-s01:9f3560a6-127f-42a6-abaf-9f45951e6bd5`)
- **PostgreSQL Server**: `17.12 (Debian 17.12-1.pgdg12+1)`, `server_version_num = 170012`, `max_connections = 40`, `transaction_read_only = on`, `row_security = on`
- **Database Owner & ACL**: `wetscan_migrator`, `datacl = {wetscan_migrator=CTc/wetscan_migrator,wetscan_app=c/wetscan_migrator,wetscan_sentinel_worker=c/wetscan_migrator}`
- **Docker Context / Container / Volume / Image**: `desktop-linux`, container `wetscan-sentinel-local-postgres-1` (`0220e86e719aa43c30dfd3ba371e290de0fe9141d8d1fe7f7fc6a58accb8961f`, running), volume `wetscan_sentinel_s01_dev_20261114` at `/var/lib/postgresql/data`, image `sha256:99d1a998c76487d3abb48b141505bda5dcf8089c0c4cd7be40f75de314fa32f0`, port binding `127.0.0.1:55432->5432/tcp`
- **Principals & Role Read-Only Connections (`BEGIN READ ONLY`)**: `wetscan_app`, `wetscan_sentinel_worker`, and `wetscan_migrator` all verified `LOGIN`, `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOBYPASSRLS`, `0` role memberships (`pg_auth_members`), `0` `pg_default_acl` entries, `publicPrivilegesAllFalse = true`, `transaction_read_only = 'on'`, and `row_security_active = true` across `platform.jobs`, `sentinel.telemetry_events`, and `sentinel.detection_alerts`
- **Absence of S04 Incident Objects**: `0` `incident*` catalog objects (`incidentObjects = 0`) and `0` `incident*` columns (`incidentColumns = 0`) in `platform` and `sentinel`
- **Structure Totals**: `3` schemas (`platform`, `public`, `sentinel`), `20` base tables, `204` columns, `126` constraints (`c=80, f=21, p=20, u=5`), `39` indexes, `19` `ENABLE + FORCE ROW LEVEL SECURITY` tables (`platform.schema_migrations` disabled), `38` RLS policies, `plpgsql 1.0`, `0` large objects, `0` custom routines

### 8.2 DEV Migration Ledger (`platform.schema_migrations`)

| Applied Migration | Pair Checksum (`up + "\0" + down`) | Applied At (UTC) | Status |
| --- | --- | --- | --- |
| `0001_foundation` | `dd061a60b123284882f154c438de3a171d60967b7b07a4e07200b6693f4eb778` | `2026-11-14 12:36:51.243758+00` | Exact match |
| `0002_telemetry` | `d1b67dc680f5bf3c2cbe585dca2427abf9d7ba9f29479c69b851f66b91c1f5a3` | `2026-11-14 22:17:24.288225+00` | Exact match |
| `0003_detection` | `4f0ee1cebdbdc81b835f719ef13c9cb703dfb5f440193765dfa0a61635fb6168` | `2026-11-15 04:02:14.211905+00` | Exact match |
| `0004_incidents` | — | *(NOT APPLIED)* | Expected absent |

### 8.3 Historical DEV Row Counts, SHA-256 Fingerprints & H03C-2 Comparison (`91` Rows)

- **Composite Deterministic State SHA-256**:
  - Pre-backup (`before`): `4fba3a8a893cf25adcf5ea3902dedac650b0230d0982ca49f211e2b4033f034a`
  - Post-backup (`after`): `4fba3a8a893cf25adcf5ea3902dedac650b0230d0982ca49f211e2b4033f034a`
  - **H03C-2 `audit-final.json` Comparison (`2026-11-15T04:48:51.087Z`)**: `h03c2MatchesExact = true`, `h03c2DataDiffs = []` (**100% unchanged since H03C-2**; note DEV contains `91` historical rows, distinct from TEST's `517` pre-0004 rows)

| Table (`platform.*` / `sentinel.*`) | Pre-Backup (`before`) | Archive `INSERT` Rows | Post-Backup (`after`) | Sorted Row-Hash Digest (`sha256Json`) |
| --- | ---: | ---: | ---: | --- |
| `platform.job_attempts` | 6 | 6 | 6 | `382feb46e21294b3aee06c0de657751aeccd47613de895a222813238c804dc14` |
| `platform.jobs` | 14 | 14 | 14 | `d73c0c1379fb0367d9b1cf577e29cc5a00839ee54f26794ecf01a5c96abe0679` |
| `platform.module_limits` | 1 | 1 | 1 | `29b0c729d6cb6531663de83dccde667bffeccdac221ebab6a64779300ee14496` |
| `platform.notification_attempts` | 0 | 0 | 0 | `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945` |
| `platform.notification_outbox` | 0 | 0 | 0 | `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945` |
| `platform.schema_migrations` | 3 | 3 | 3 | `71c89389162bf398290bb50e2af3eec1c126339e99a3309c8fd6ab9034baccef` |
| `platform.worker_heartbeats` | 5 | 5 | 5 | `871bc2d13c851d20d5e6f1d25687b7ecb842684b18633f3ec404a5f2df186d7b` |
| `sentinel.detection_alerts` | 2 | 2 | 2 | `876fb2b06030413aaa24fc4f117246cca2ba83424441bfd9d28cbc7e34466cc4` |
| `sentinel.detection_audit` | 6 | 6 | 6 | `876b55303a17cb7dcc5ffef1011090843fd0a195e8803fa4d0e277161141e052` |
| `sentinel.detection_cooldowns` | 2 | 2 | 2 | `4dc8b4e730bd194c08f02b4a75c5c9aa46eac4c0d43cfde3ce65dc585864fb5e` |
| `sentinel.detection_evaluations` | 12 | 12 | 12 | `cdb1d0d062e27f8388345f7db9b62ad65c6ec305cc51c724845e7a497aff6fda` |
| `sentinel.detection_evidence` | 3 | 3 | 3 | `0a80a4626ed4614a005c1d7d019cd55d6a10744e7b147d20f79a995099141f2a` |
| `sentinel.detection_rule_versions` | 6 | 6 | 6 | `c0b739446bf396ffc76d92d4025a0e46225362ec8b54280e97e2c3c30e6c83b9` |
| `sentinel.detection_rules` | 2 | 2 | 2 | `8340ce17198f4e750ec322ebfc4e1dd07a0feb904fbf2cc28026e5f53c0d8392` |
| `sentinel.detection_suppressed_evidence` | 0 | 0 | 0 | `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945` |
| `sentinel.project_bindings` | 1 | 1 | 1 | `75a397f386770f070c37522bfb557ff14b929f1414943750189f78d50d4a1e6a` |
| `sentinel.telemetry_batches` | 9 | 9 | 9 | `92d5a31ff45bad22bff8109072a846d68a2b445d38916bed5043a5a7f15f6fec` |
| `sentinel.telemetry_credentials` | 3 | 3 | 3 | `e4e85a320f4ea776a955bf96368fb639d2fd4d67cc9d6d2990e5c6ba84caf4c5` |
| `sentinel.telemetry_events` | 14 | 14 | 14 | `46faacc73d99e8abede47dffd89be9adb181e94e264fb3a9f4678c9e90509145` |
| `sentinel.telemetry_sources` | 2 | 2 | 2 | `30f678ccb1b937301356e355f9ecd81cf5062bb6a87a85436c481e3a7347cb7b` |
| **Grand Total — All 20 Tables** | **91** | **91** | **91** | `4fba3a8a893cf25adcf5ea3902dedac650b0230d0982ca49f211e2b4033f034a` |

- **Non-Secret Scope, Auth, Queue & Runtime Summary**:
  - **Project Binding (`1`)**: `mode = "live"`, `workspace_id = "github-user-187839747:test"`, `project_id = "github-998736528"`, `repository_id = "998736528"`, `actor_id = "github-user-187839747"`, `enabled = true`, `retention_hold = false`.
  - **Telemetry Sources & Credentials**: `2` disabled `controlled_test` sources (`3b67f63a-f67e-4fa4-96b9-2fecd9a6feba` from H02 with `2` revoked credentials; `806e6444-2d44-449d-9495-43feb08f15a2` from H03C-2 with `1` revoked credential — `active = 0`, `revoked = 3`).
  - **Jobs & Leases (`14` total)**: `6` `completed` (`806e6444-...`), **`8` historical `queued`** (`sentinel.telemetry.accepted`, H02 source `3b67f63a-...`, created `2026-11-15 00:59:42..01:02:44+00`), `activeLeases = 0`, `expiredLeases = 0`.
  - **Heartbeats & Sessions**: `5` heartbeat rows (`4` `stopped` from `2026-11-14T13:56Z` to `2026-11-15T04:46Z`; `1` historical stale `status = 'running'` row `790e660d-408d-4f8f-8897-91b906a426e7` last seen `2026-11-14 13:37:10.149873+00` with `0` active DB sessions or running OS worker processes).
  - **Detection State**: `2` rules (`9dfd4ef7-...`, `ff8275f9-...`), both currently v3 `status = 'DISABLED'`; `2` historical `controlled_test` `detection_alerts` (`1` high, `1` medium, `http`); `12` evaluations; `0` incidents.

### 8.4 Verified Private Logical DEV Backup (`VERIFIED_ARCHIVE_NOT_RESTORE_TESTED`)

- **Pre-Backup Completeness Check**: Verified `wetscan_migrator` holds table `SELECT`, `204/204` column `SELECT`, `0` `RESTRICTIVE` policies, and unconditional `PERMISSIVE` `SELECT` policies on all 19 RLS tables, matching `91/91` rows prior to `pg_dump`.
- **Archive Identity**: `wetscan_dev-before-0004.dump` stored outside Git and OneDrive in a separate ACL-restricted directory referenced by gitignored `.local/sentinel/s04-h04c-a-private-directory.txt` (distinct from H04A TEST backup and S03 H03C backups).
- **Size & Digest**: **`110,541` bytes**, SHA-256 **`67e363879f95475b5b4fae81cabe9816196d06ce84d27bee3f39dd2cfb83430e`** (`2026-11-15T10:22:15.379Z` – `2026-11-15T10:22:15.861Z`).
- **Command & Verification**: Container `pg_dump 17.12` (`--format=custom --inserts --enable-row-security --no-password --lock-wait-timeout=5s`, `default_transaction_read_only=on`, `row_security=on`), `dumpExitCode = 0`, `stderrBytes = 0`, `PGDMP` header verified; `pg_restore 17.12 --list` (`20` `TABLE`, `20` `TABLE DATA`, `38` `POLICY`, `19` `ROW SECURITY`, `14` standalone `INDEX`, `46` `CONSTRAINT`, `21` `FK CONSTRAINT`, `27` `ACL` entries) and offline `pg_restore --file=-` (`91/91` matching `INSERT` rows across all 20 tables) passed without executing SQL or exposing secrets.
- **Explicit Restore Status**: `restorePerformed = false`, `restoreTested = false` (**`VERIFIED_ARCHIVE_NOT_RESTORE_TESTED`**). Isolated restore rehearsal was neither authorized nor performed in H04C-A.

### 8.5 Historical Job Isolation Assessment & Resolved Pre-H04C-B Worker Isolation Patch

- **Live Exposure Mitigated**: A non-isolated DEV worker started with `SENTINEL_DETECTION_ENABLED=1` would claim the **8 historical `queued` H02 jobs** (`PostgresQueue.claim` in `src/platform/queue.ts:242-279`) and run retention deletes across worker heartbeats, detection evaluations/alerts, incidents, and telemetry (`worker/sentinel/runtime.ts:187-218`). Previously, `worker/sentinel/acceptance.ts` hardcoded S03's 3-migration hash (`c3e39f6f...`) and inspected only `s03RuntimeAcceptance`, causing `SENTINEL_ACCEPTANCE_ISOLATION=1` to fail closed against S04's `3438a56e...` plan hash (`worker/sentinel/main.ts:27-33`).
- **Implemented S04 Worker Isolation Resolution (`CODE PATCH ONLY` — No DB / No Real Worker Run)**:
  - Updated `worker/sentinel/acceptance.ts`, `worker/sentinel/main.ts`, `worker/sentinel/runtime.ts`, and `tests/sentinel/runtime-isolation.test.ts` so `s04RuntimeAcceptance` binds 1:1 to `3438a56e778b30afdd6acf03600638fe31e26c55c2ae5bf63d224f909c429ae7` (`s03RuntimeAcceptance` stays bound 1:1 to `c3e39f6f...`), verifies `IncidentActivation` scope/chronology (`notBefore >= approval.approvedAt && >= detection.notBefore`) and `0004_incidents` checksum (`84b5b4987e498bbb047505cd81218716357ce5f1434fb466749c7ed433141663`) both offline and in `platform.schema_migrations` (`BEGIN READ ONLY`), requires all `8` DEV `protectedJobIds` to remain `queued` and `< detection.notBefore` while restricting queue claims to `admitted` IDs `>= incidents.notBefore` before expiry, skips all 5 retention loops + guards `executeLease` against maintenance execution when `input.isolation` is set, and shuts down cleanly at `acceptanceDeadline`.
  - Verified SQL migrations (`0001`–`0004`) and H04C-A backup (`wetscan_dev-before-0004.dump`, `110,541` bytes) were not altered; fresh `pnpm typecheck`, `pnpm lint` (0 warnings), `pnpm test` (`736/736` across `53/53` files), `pnpm build`, and Sentinel/Original Playwright regressions (`20/20`, `--retries=0`) passed.

### 8.6 H04C-B1 DEV `0004_incidents` UP/UP Migration & Independent Postflight Audit (`PASS`, 15 November 2026)

- **Narrow Authorization & Environment**: Under explicit owner **H04C-B1** authorization against `127.0.0.1:55432 / wetscan_dev` (`wetscan-s01:26b6b537-c016-4dc7-8007-4e839e8b838f`), temporary approval `dev-migrate-approval.json` granted `actions: ["migrate_up"]` ONLY (`15m` expiry; `migrate_down`, `runtime`, and `integration_test` verified refused) and `.env.sentinel.s04.dev.migrate.local` supplied `SENTINEL_DB_MIGRATION_PASSWORD_FILE` only (omitting `APP`/`WORKER` credentials; `SENTINEL_DETECTION_ENABLED=0`, `SENTINEL_INCIDENTS_ENABLED=0`, `SENTINEL_ACCEPTANCE_ISOLATION=0`).
- **Preflight & `up/up` Execution**:
  - Mandatory `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY` preflight (`PASS`): `20` tables, `91` historical rows matching H04C-A digest `4fba3a8a893cf25adcf5ea3902dedac650b0230d0982ca49f211e2b4033f034a`, `0001`–`0003` ledger unchanged, `0` `incident*` objects/columns, `8` historical queued jobs, `0` active leases, `0` live sessions, `0` running worker/app processes.
  - First `scripts/sentinel-db.ts up --approve-plan=3438a56e778b30afdd6acf03600638fe31e26c55c2ae5bf63d224f909c429ae7` (**PASS**): applied `0004_incidents` (`84b5b4987e498bbb047505cd81218716357ce5f1434fb466749c7ed433141663`) at `2026-11-15 11:01:14.682295+00`.
  - Second `scripts/sentinel-db.ts up --approve-plan=3438a56e778b30afdd6acf03600638fe31e26c55c2ae5bf63d224f909c429ae7` (**PASS**): verified idempotent with identical `platform.schema_migrations` row and timestamp between `after_up1` and `postflight`.
- **Independent Read-Only Postflight & Approval Closure (`PASS`)**:
  - Verified `25` tables, `5` empty `sentinel.incident*` tables (`0` rows each) owned by `wetscan_migrator` with `ENABLE + FORCE RLS`, `10` new S04 policies (`48` total), `16` S04 indexes including all `6` explicit indexes (`incidents_query`, `incidents_filters`, `incident_alerts_lookup`, `incident_evidence_event`, `incident_timeline_order`, `incident_timeline_evidence_event`; `55` total), `12` validated `ON DELETE RESTRICT` composite FKs, `0` `PUBLIC` grants, `wetscan_app` holding `SELECT` on all 5 tables + `INSERT` on `incident_timeline` & `incident_timeline_evidence` + zero table-level `UPDATE` + column-level `UPDATE` exclusively on `incidents` (`close_reason`, `closed_at`, `closed_by`, `last_actor_id`, `revision`, `status`, `updated_at`), and `wetscan_sentinel_worker` holding `SELECT,INSERT,DELETE` on all 5 tables + `UPDATE` strictly on `incidents`.
  - Verified S01–S03 schemas, roles, memberships, default ACLs, routines, policies, grants, and `0001`–`0003` ledger rows unchanged; **`91/91` original DEV rows preserved** (`92` total rows including `0004_incidents` ledger row); all `8` historical queued H02 jobs untouched; `0` fixture rows; `0` active leases/sessions/processes; H04C-A backup untouched (`110,541` bytes, SHA-256 `67e363879f95475b5b4fae81cabe9816196d06ce84d27bee3f39dd2cfb83430e`, `VERIFIED_ARCHIVE_NOT_RESTORE_TESTED`).
  - Temporary DEV migration approval immediately closed (`COMPLETED_H04C_B1_DEV_MIGRATION`, `actions: []`) and verified to refuse subsequent `migrate_up`. **H04C-B2 runtime acceptance remains `PENDING_EXPLICIT_OWNER_AUTHORIZATION`**. See [SENTINEL_S04_VALIDATION.md](SENTINEL_S04_VALIDATION.md) Sections 8–10 and [HANDOFF_S04.md](agent-handoffs/HANDOFF_S04.md) Sections 6 & 8.

### 8.7 H04C-B2 Runtime Acceptance Readiness Preparation (`PREPARATION ONLY`, 15 November 2026)

- **Zero SQL / Backup / Catalog Changes**: Verified `migrations/sentinel/0004_incidents.{up,down}.sql` LF SHA-256s (`84adf3030338757728552cae07a70b1dd549f9785078fc6e5a3ababae8d939dd` / `c695777076aea80a1e84c3824c6faf4b8f32595ec7795337f95ef89ef3f444f5`), `0001`–`0004` combined plan hash (`3438a56e778b30afdd6acf03600638fe31e26c55c2ae5bf63d224f909c429ae7`), and the H04C-A archive (`110,541` bytes, SHA-256 `67e363879f95475b5b4fae81cabe9816196d06ce84d27bee3f39dd2cfb83430e`, `VERIFIED_ARCHIVE_NOT_RESTORE_TESTED`) are untouched (`src/`, `worker/`, `migrations/`, and `infra/` unchanged from H04C-B1; `0` DB connections performed).
- **Prepared H04C-B2 Least-Privilege Safety Harness (`scripts/sentinel-dev-acceptance.ts`, `tests/sentinel/dev-acceptance-safety.ts`, `tests/sentinel/dev-acceptance-safety.test.ts`)**:
  - `parseH04CB2PhaseApproval` and `requireH04CB2ExecutionGate` require `SENTINEL_H04C_B2_EXECUTION=1`, reject `migrate_down` or `integration_test` actions, pin target/marker `127.0.0.1:55432 / wetscan_dev / wetscan-s01:26b6b537-c016-4dc7-8007-4e839e8b838f` and plan `3438a56e...`, and bound temporary DEV approvals to `<= 10m` for sealed worker runs.
  - `runNegativePostgresMatrix` executes `verifyPopulatedS04DownRefusal` strictly with `allowAction: "runtime"` through the 11-statement SQL allowlist proxy (`SET LOCAL lock_timeout = '3000ms'`) without ever granting `migrate_down`, and wraps cross-project RLS, `42501` DML denials, and `retainIncidents`/`retainDetection`/`retainTelemetry` retention-pin exercises inside outer `BEGIN ... ROLLBACK` with nested savepoint translation (`withRollbackOnlyDatabase`) so historical H02/H03C-2 DEV data cannot be mutated.
  - Verified with `tsc --noEmit` PASS, `eslint .` PASS (0 warnings), `vitest run` **743/743 PASS** across `54/54` files (`7/7` in `dev-acceptance-safety.test.ts`), `next build` PASS, offline `sentinel-dev-acceptance.ts plan` (`databaseConnections = 0`), and S04 Playwright (`3/3`, `--retries=0`). Overall status remains **IMPLEMENTED_PENDING_ACCEPTANCE**.
