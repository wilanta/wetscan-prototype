# Sentinel S08 — Migration Review (`0008_internal_intelligence`)

**Status: reviewed + applied / reversed / re-applied on a throwaway PostgreSQL 17 container (`127.0.0.1:55433`, container `wetscan-s08-test-pg`). NOT applied to the persistent development database (`wetscan_dev`, `127.0.0.1:55432`) or any production database.**

| Item                                               | Value                                                                                                                                                                                                                    |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Migration                                          | `migrations/sentinel/0008_internal_intelligence.{up,down}.sql` (additive, reversible, no backfill, no role creation, no data DML)                                                                                        |
| `0008_internal_intelligence` checksum              | `6854b7fa28278ac80ec1bb46159c4c55406d31854be06b8bab61e5dc7cd85928`                                                                                                                                                       |
| Full plan sha256 (`0001`–`0008` + both role files) | `7ac3e11c4f1fc3caf30e782f2e8e3b73d1a6cdf19438d722bf3cb1d805733012`                                                                                                                                                       |
| Reviewed S07 prefix (`0001`–`0007`)                | `338db7cafabbb54304ff2944048b3f3c7b21ca78cabbc704a2c61117e2a82038` (**unchanged**)                                                                                                                                       |
| Reviewed S06 / S05 / S04 prefixes                  | `82e203965623b099fdd835bff62f94a06ce296c93cb07ea1b5583ede75c11e8c` / `0433347677b0a752cc56966bdb923bfd499241d51bf8b6aceb81fe4a736d9056` / `3438a56e778b30afdd6acf03600638fe31e26c55c2ae5bf63d224f909c429ae7` (unchanged) |
| Role provisioning                                  | **None.** No new role file; `wetscan_app` and `wetscan_sentinel_worker` already exist. The plan hash therefore changes only by the new migration checksum.                                                               |

Migration-version coordination: `0008_internal_intelligence` was free at branch time (`master@71afe06`, head `0007_ghost`). A concurrent S09 branch must pick `0009_*` or rebase; the runner refuses a ledger whose version/checksum order differs from the plan (`target_denied`).

## What it creates

| Table                            | Purpose                       | Key constraints                                                                                                                                                                                                                     |
| -------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sentinel.intel_cases`           | Archived-incident cases       | `mode='live'` CHECK; `UNIQUE(scope, incident_id)`; FK `RESTRICT` to `project_bindings`, `telemetry_sources`, `detection_rule_versions`; **no FK to `incidents`**; `cardinality(tags)<=10`; `indicators` ≤ 4 KB; status/shelf CHECKs |
| `sentinel.intel_case_evidence`   | Immutable evidence references | PK `(scope, case_id, source_id, event_id)`; FK to case only (**no FK to `telemetry_events`**)                                                                                                                                       |
| `sentinel.intel_candidates`      | DRAFT rule candidates         | `UNIQUE(scope, origin, signature, grouping_version)`; CHECKs: `DRAFT ⇔ no reviewer fields`, `validated ⇒ APPROVED`, `promoted ⇒ validated`; FK `RESTRICT` to `detection_rules`                                                      |
| `sentinel.intel_candidate_cases` | Candidate ↔ case membership   | FK `RESTRICT` to candidate and case                                                                                                                                                                                                 |
| `sentinel.intel_audit`           | Append-only audit             | exactly one of `case_id`/`candidate_id`; per-subject unique `sequence` (partial unique indexes); fixed action enum                                                                                                                  |

### Grants (least privilege)

- `wetscan_app`: `SELECT, INSERT` on `intel_cases` and `intel_candidates`; column `UPDATE` only on `intel_cases(tags,status,shelf_state,revision,updated_at)` and `intel_candidates(review_status,reviewed_*,review_reason,validated_*,promoted_*,revision,updated_at)`. `definition`, `basis`, `signature`, `origin`, `proposed_by` and all case provenance are **not** updatable. `SELECT, INSERT` only on evidence, membership and audit.
- `wetscan_sentinel_worker`: `SELECT` on `intel_cases` only (for the incident-retention pin).
- No `DELETE` is granted on any S08 table. `wetscan_migrator` gets the usual `FOR SELECT` RLS policy.
- RLS: `ENABLE` + `FORCE` on all five tables; policy `intel_scope` binds `mode`, `workspace_id`, `project_id`, `wetscan.module='sentinel'` and the role; `WITH CHECK` is `wetscan_app`-only.

## Other source changes that interact with the schema (all additive)

- `src/platform/migrations.ts`: down-guard for `0008` locks all five tables `ACCESS EXCLUSIVE`, refuses (`target_denied`) if **any** has a row, otherwise drops them and deletes only `0008_internal_intelligence` from the ledger. No force/cascade.
- `src/features/sentinel/incidents/retention.ts`: `retainIncidents` adds `AND NOT EXISTS(active, undismissed case)` when `to_regclass('sentinel.intel_cases')` is non-null (so an un-migrated DB behaves exactly as before).
- `src/features/sentinel/detection/store.ts`: new `createDraftInTx` (inserts one `DRAFT` rule inside the caller's transaction using the same capacity, version and audit code as `create`).

## Historical tests adjusted (history preserved, no weakened assertion)

`0007` was the latest migration when S07 tests were written. They now assume "latest" correctly: `ghost-migrations.test.ts` uses `migrationPlan("0007_ghost")` for the two reversal tests; `ghost.postgres.integration.ts` reverses the empty `0008` first; `tests/platform/migrations.test.ts` lists `0008`. S01–S07 migration files, checksums and reviewed prefix hashes are untouched.

## Verified on the throwaway container

Up/up idempotent; empty down reverses (ledger back to `0001`–`0007`) and re-applies; populated down is refused (unit double: no `DROP` is issued, transaction `ROLLBACK`); RLS, grants, constraints, concurrency and retention behavior per [SENTINEL_S08_VALIDATION.md](SENTINEL_S08_VALIDATION.md).

## Owner prerequisites before the persistent `wetscan_dev` upgrade (`NOT_RUN`)

1. Take a verified `pg_dump` backup and confirm the database identity marker (`wetscan-s01:<uuid>`).
2. Persistent `wetscan_dev` may still be at S04: complete `H-S06-ROLE` (notifier role), then apply `0005`–`0008` in one reviewed `wetscan_migrator` run.
3. Issue new sealed `app` and `worker` approvals bound to plan sha256 `7ac3e11c4f1fc3caf30e782f2e8e3b73d1a6cdf19438d722bf3cb1d805733012`. Existing approvals bound to earlier hashes are intentionally stale.
4. No data backfill is required or performed: the case library starts empty; humans archive incidents explicitly.
