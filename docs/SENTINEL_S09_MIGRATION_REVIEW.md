# Sentinel S09 — Migration Review (`0009_external_intelligence`)

**Status: reviewed + applied / reversed / re-applied / refused-when-populated on a throwaway PostgreSQL 17.12 container (`127.0.0.1:55434`, container `wetscan-s09-test-pg`, per-run databases `s09_<random>`). NOT applied to the persistent development database (`wetscan_dev`, `127.0.0.1:55432`) or any production database — it was neither inspected nor changed.**

| Item                                               | Value                                                                                                                                                                                                                          |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Migration                                          | `migrations/sentinel/0009_external_intelligence.{up,down}.sql` (additive, reversible, no backfill, no role creation; the only DML is the three seed rows of `ext_sources`)                                                      |
| `0009_external_intelligence` checksum              | `0eabf8a631727089cc2fe434d929c0c6f5bf5d542db92009a975190534f14f7a`                                                                                                                                                             |
| Full plan sha256 (`0001`–`0009` + both role files) | `94f99d996e08bec042aa11a2295087dd69cd35a64d2fc48211292817b287831c`                                                                                                                                                             |
| Reviewed S08 prefix (`0001`–`0008`)                | `7ac3e11c4f1fc3caf30e782f2e8e3b73d1a6cdf19438d722bf3cb1d805733012` (**unchanged**, asserted by `external-migrations.test.ts`)                                                                                                    |
| Reviewed S07 / S04 prefixes                        | `338db7cafabbb54304ff2944048b3f3c7b21ca78cabbc704a2c61117e2a82038` / `3438a56e778b30afdd6acf03600638fe31e26c55c2ae5bf63d224f909c429ae7` (**unchanged**; S04 matches `reviewedS04Plan`)                                         |
| Role provisioning                                  | **None.** `wetscan_app` and `wetscan_sentinel_worker` already exist; no new role file, so the plan hash changes only by the new migration checksum.                                                                              |

Numbering: `0009` was free at branch time (`master@e59b03c`, head `0008_internal_intelligence`). A concurrent branch must rebase onto a different number; the runner refuses a ledger whose version/checksum order differs from the plan (`target_denied`).

## What it creates

| Table                           | Tenancy                       | Writers (runtime)                                  | Key constraints                                                                                                                                                                                                      |
| ------------------------------- | ----------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sentinel.ext_sources`          | global                        | worker `UPDATE` (no `INSERT`/`DELETE`)             | `provider IN (cisa_kev, ghsa, osv)`; status/error-code/lease CHECKs; 3 seed rows                                                                                                                                      |
| `sentinel.ext_runs`             | global                        | worker `INSERT/UPDATE/DELETE`                      | FK `RESTRICT` to sources; status/trigger/counter CHECKs                                                                                                                                                              |
| `sentinel.ext_advisories`       | global                        | worker `INSERT/UPDATE`                             | PK `(provider, source_id)`; `https` source URL; hashes `^[a-f0-9]{64}$`; `kev` only for `cisa_kev`; `cardinality(ident) ≤ 40`; GIN index on `ident`                                                                    |
| `sentinel.ext_affected`         | global                        | worker `INSERT/DELETE`                             | FK `RESTRICT` to advisories; ecosystem CHECK; `ranges` ≤ 50, `versions` ≤ 200                                                                                                                                         |
| `sentinel.ext_history`          | global                        | worker `INSERT/DELETE` (bounded prune)             | PK `(provider, source_id, revision)`; snapshot ≤ 64 KB                                                                                                                                                              |
| `sentinel.ext_inventory_snapshots` | project (`mode='live'`)    | app `INSERT/DELETE` + `UPDATE(collected_at, expires_at, collected_by)` | FK `RESTRICT` to `project_bindings`; `source_kind='repository_lockfile'`; `UNIQUE(scope, commit_sha, lockfile_sha256)`; `expires_at > collected_at`; ≤ 10 000 items                                               |
| `sentinel.ext_inventory_items`  | project (`mode='live'`)       | app `INSERT/DELETE` (no `UPDATE`)                  | FK `RESTRICT` to snapshot; `ecosystem IN ('npm')` today                                                                                                                                                              |

## Security review

- `REVOKE ALL … FROM PUBLIC` on every table; **app role: `SELECT` only on the five global tables**; worker role: no privilege of any kind on the two inventory tables.
- Forced RLS on all seven tables. Global tables: `SELECT` for `wetscan_app`, `wetscan_sentinel_worker`, `wetscan_migrator`; `INSERT/UPDATE/DELETE` policies only for `wetscan_sentinel_worker`. Inventory tables: same policy shape as S08 (`mode='live'`, `current_user='wetscan_app'`, module/mode/workspace/project session settings must equal the row) with an extra migrator read policy — an unscoped session sees **zero** rows, a forged scope fails `WITH CHECK` (`42501`).
- Provenance immutability: no `UPDATE` on snapshot identity columns or on inventory items for any runtime role.
- No FK to or from telemetry/alert/incident/response/notification/case tables; no reference to tenant identifiers in the global tables (asserted by an `information_schema` test).

## Reversal protocol (`src/platform/migrations.ts`)

`down` for `0009` locks all seven tables + `platform.jobs`, refuses (`target_denied`, rollback, nothing dropped) if **any** of `ext_inventory_items`, `ext_inventory_snapshots`, `ext_history`, `ext_affected`, `ext_advisories`, `ext_runs` has a row, if any `ext_sources` row has left `never_run`/has a `last_attempt_at`, or if any `platform.jobs` row of kind `sentinel.advisory.%` exists. No force flag, no `CASCADE`. Verified on PostgreSQL: untouched `0009` rolls back (tables gone, ledger back to `0008`), re-applies, then refuses once a KEV sync has stored data.

Older tests that assumed "the latest migration" were re-pinned (`migrationPlan("0008_internal_intelligence")` / one extra empty `down`) — the same maintenance S08 performed for S07. No S01–S08 assertion was weakened.

## Persistent `wetscan_dev` upgrade (`H-S09-DEVDB`, `NOT_RUN`)

Not performed: the owner's approval files, role passwords and sealed plan-hash approvals are not available to the agent, the database is still presumed at the S04 level (needs `H-S06-ROLE`, `0005`–`0009`), and the S01–S04 approval-bound scripts are bound to a plan hash that changed. Required before any persistent use:

1. Verify identity (`127.0.0.1:55432`, `wetscan_dev`, marker) and current ledger (`SELECT version,checksum FROM platform.schema_migrations`); take a verified `pg_dump` and a restore rehearsal.
2. Complete `H-S06-ROLE`; apply `0005`–`0009` with the approved runner; issue new sealed `app`/`worker` approvals bound to plan sha256 `94f99d99…831c`.
3. Add the `externalIntel` approval block (see [SENTINEL_HUMAN_ACTIONS.md](SENTINEL_HUMAN_ACTIONS.md) `H08`) only after the owner decides cadence/retention.
