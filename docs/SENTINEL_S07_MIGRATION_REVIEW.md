# Sentinel S07 — Migration Review (`0007_ghost`)

**Status: reviewed + applied/reversed/re-applied on isolated throwaway PostgreSQL 17.12. NOT applied to any owner persistent development or production database.**

| Item                                               | Value                                                                                                |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Migration                                          | `migrations/sentinel/0007_ghost.{up,down}.sql` (additive, reversible, no backfill, no role creation) |
| `0007_ghost` checksum                              | `457170d379c3f3b02f590b78baf95608e276207fdf67fae0df3bc9a1ea79e946`                                   |
| Full plan sha256 (`0001`–`0007` + both role files) | `338db7cafabbb54304ff2944048b3f3c7b21ca78cabbc704a2c61117e2a82038`                                   |
| Reviewed S06 prefix (`0001`–`0006`)                | `82e203965623b099fdd835bff62f94a06ce296c93cb07ea1b5583ede75c11e8c` (unchanged)                       |
| Reviewed S05 prefix (`0001`–`0005`)                | `0433347677b0a752cc56966bdb923bfd499241d51bf8b6aceb81fe4a736d9056` (unchanged)                       |
| Reviewed S04 prefix (`0001`–`0004`)                | `3438a56e778b30afdd6acf03600638fe31e26c55c2ae5bf63d224f909c429ae7` (unchanged)                       |

## What it creates

- `sentinel.ghost_decoys`: project-scoped decoy configuration (`mode='live'` CHECK, `enabled boolean NOT NULL DEFAULT false`, `owned_app_confirmed boolean NOT NULL CHECK(owned_app_confirmed)`, validated `decoy_path` regex `^/(__wetscan|\.well-known)/[a-z0-9-]{3,40}$`, `response_status IN (200,204,404)`, `rate_limit_per_min BETWEEN 1 AND 120`), FKs (`ON DELETE RESTRICT`) to `sentinel.project_bindings` and `sentinel.telemetry_sources`, `UNIQUE(scope, source_id)`, `UNIQUE(scope, decoy_path)`.
- `sentinel.ghost_audit`: append-only configuration audit log (`created`, `updated`, `enabled`, `disabled`) with FK `ON DELETE RESTRICT` to `sentinel.ghost_decoys`.
- **Least-privilege grants**:
  - `wetscan_app`: `SELECT, INSERT` on `ghost_decoys`; column-scoped `UPDATE(name,target_ref,decoy_path,enabled,response_status,rate_limit_per_min,h07_proof_id,revision,updated_at)` on `ghost_decoys` (`source_id`, `origin`, `environment`, `owned_app_confirmed` are immutable); `SELECT, INSERT` only on `ghost_audit` (no `UPDATE` or `DELETE`).
  - `wetscan_sentinel_worker`: `SELECT` only on `ghost_decoys` and `ghost_audit`.
  - `wetscan_migrator`: `SELECT` RLS policy (`ghost_migration_read`).
- **Row-Level Security**: `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` on both tables, scoped by `wetscan.{module,mode,workspace,project}`.

## Reversal (`0007_ghost.down.sql` & `src/platform/migrations.ts`)

- `applyMigrations(..., "down")` locks `sentinel.ghost_audit, sentinel.ghost_decoys` in `ACCESS EXCLUSIVE MODE`, refuses (`PlatformError("target_denied")`) if either table holds any row, and drops only `ghost_audit` and `ghost_decoys` when both are empty, deleting only `"0007_ghost"` from `platform.schema_migrations`.
- Verified with unit doubles (`tests/sentinel/ghost-migrations.test.ts`) and real PostgreSQL 17.12 (`tests/sentinel/ghost.postgres.integration.ts`).

## Owner prerequisites before persistent `wetscan_dev` upgrade

1. Complete `H-S06-ROLE` (`wetscan_sentinel_notifier` creation + backup + `0005` and `0006`), or include `0007_ghost` in the same reviewed `wetscan_migrator` upgrade after a verified `pg_dump` backup.
2. Issue new sealed `app` and `worker` approvals bound to plan SHA-256 `338db7cafabbb54304ff2944048b3f3c7b21ca78cabbc704a2c61117e2a82038`.
