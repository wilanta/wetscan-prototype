# G01 PostgreSQL configuration / approval audit

15 November 2026 (Asia/Jakarta), candidate based on7eb6bfefe15aefc5a362dc33bcf74aa9db8dad25. **NO DATABASE CONNECTION OR SQL EXECUTION.** User explicitly requested configuration/approval inspection only for this audit. No Docker operation, TCP database probe, migration, database/role creation, reset, test fixture insertion or worker activation occurred. Actual .env/password/token/connection-string files were not read.

## Findings: example vs configured vs verified vs approved

| Field | Example/declarative configuration | Existing evidence / currently configured | Verified in this audit | Explicitly approved for G01 |
| --- | --- | --- | --- | --- |
| Host/port | `.env.sentinel.example:3-4`:127.0.0.1:55432; Compose declares host loopback and default55432 -> container5432 | H01/S02 historical evidence recorded this endpoint; current Next/server effective configuration UNKNOWN | UNKNOWN; no connection/port probe | UNKNOWN |
| G01 test database | Sentinel template says wetscan_dev. Guard proposes wetscan_s01_test_guardg01 | No provisioning/configuration evidence for a G01 test DB found in reviewed locations. Existing wetscan_dev / populated wetscan_s01_test are historical Sentinel targets | UNKNOWN | UNKNOWN; no creation/reuse permission |
| G01 target ownership | Compose declares bootstrap role wetscan_bootstrap. H01 recorded wetscan_migrator ownership for historical targets | No actual G01 target/owner found | UNKNOWN | UNKNOWN |
| G01 marker | Sentinel example is empty; Guard parser requires exact wetscan-s01:<UUID> | H01/S02 dev marker26b6b537-c016-4dc7-8007-4e839e8b838f and historical TEST marker9f3560a6-127f-42a6-abaf-9f45951e6bd5 are Sentinel-only historical identities | UNKNOWN for G01; neither marker is copied to a new target | UNKNOWN |
| PostgreSQL version | Compose requires operator-reviewed PostgreSQL17 image digest; ApprovedPool enforces>=170000 | H01/S02 recorded17.12 /170012, not a current query | UNKNOWN | UNKNOWN for a G01 target |
| Existing roles | Sentinel provision SQL defines wetscan_migrator,wetscan_app,wetscan_sentinel_worker; historical docs record restricted roles | Existence/privileges now UNKNOWN. Guard proposal defines wetscan_guard_migrator,wetscan_guard_app,wetscan_guard_worker; no provisioning evidence | UNKNOWN; no pg_roles query | UNKNOWN for migration/testing; do not substitute Sentinel credentials |
| Non-secret approval documents | infra/sentinel/approval.example.json is WAITING_USER; approvedBy/approvedAt/hash empty, actions[] | G01 checklists/reviews exist, but no active G01 target approval document found in reviewed locations | Template status verified from file; active G01 record UNKNOWN | None found usable |
| Allowed operations | Template actions[] | Historical Sentinel migration/runtime/testing approvals are completed/consumed/closed and phase/target-specific | No G01 operation permission verified | UNKNOWN; no database operation authorized by a general review message |
| Approved migration hash | Template hash empty | Actual candidate source plan b63e1e8568babcf8d7811fe0fa735ecbec11ade64df19bdea78deb030a85869d regenerated unchanged; independent Guard/platform ledgers required | Source hash verified offline, NOT applied | UNKNOWN for any concrete target |
| Expiry | Example has no expiry; Guard approval requires expiresAt | No active G01 approval/expiry found | UNKNOWN | UNKNOWN |

`PGHOST/PGPORT/PGDATABASE/PGUSER` and `GUARD_DB_APP_APPROVAL_FILE/GUARD_DB_WORKER_APPROVAL_FILE/GUARD_DB_MIGRATION_APPROVAL_FILE` are UNSET in the **agent process only**. This does not establish what the existing Next server is configured with. No server environment or dotenv was inspected. The first sandboxed environment API call was denied; its printed fallback labels were not treated as evidence. The scoped read-only retry returned the UNSET values above.

## Sources and search boundaries

- Allowed public template: [`.env.sentinel.example`](../.env.sentinel.example). This was inspected only as the user-requested example; only non-secret host/port/name/marker/approval-path fields were output. `env.sentinel.example` without the leading dot was not found.
- [Compose](../infra/sentinel/compose.yaml) is declarative source, not a running container observation. No image digest was guessed, pulled or started.
- [Approval template](../infra/sentinel/approval.example.json) is not an approval. [Sentinel role script](../infra/sentinel/provision-roles.sql) is a proposal/source definition, not current pg_roles output.
- [H01 history](SENTINEL_H01_ACCEPTANCE.md) and [S02 history](SENTINEL_S02_POSTGRES_ACCEPTANCE.md) contain historical actual observations and explicitly closed permissions. Their success does not accept/authorize Guard or the three-version S03 target.
- [Guard migration review](GUARD_G01_MIGRATION_REVIEW.md), [preflight](GUARD_G01_ACCEPTANCE_PREFLIGHT.md), [Guard role/config gate](../src/features/guard/live/database-config.ts) and the current plan were inspected.
- Reviewed tracked/public files and named ignored-directory existence only. `.local/sentinel` was absent in candidate, master and old Guard worktrees. No arbitrary home/private configuration search and no secret or private fingerprint-map read. An approval stored elsewhere remains UNKNOWN; supply its non-secret document path for review.

## Approval packet still required (not granted by this document)

Database operator + Wil/platform owner must identify actual environment, loopback host/port/database/owner/marker/PG version, independent Guard app/worker/migrator roles, exact permitted actions, plan hash above, approvedBy/approvedAt/expiresAt. Approve read-only identity/catalog/ledger/RLS/preservation preflight explicitly before a connection. Approve provisioning, Guard platform grants and migrate_up separately if necessary; runtime+integration_test are separate from schema-up. A migrate_down permission is separate and must identify retained-data stop conditions. No historical populated Sentinel DB reset/reuse is assumed.

Wil/Sentinel owner + operator must supply an approved read-only before/after observer covering Sentinel catalog/constraints/roles/policies/ledger, S01/S02/S03 data, shared Sentinel queue/budget and stop conditions. Guard runtime roles should not be granted Sentinel-wide access merely to perform this observer. Existing operator observer logic must be reviewed for the chosen target rather than silently running a historical Sentinel test command.

Risks: a wrong target/marker/hash or overprivileged role can affect existing data; concurrent legitimate Sentinel writes can invalidate a preservation comparison. Stop on identity/ledger/RLS/digest mismatch; do not delete/reset data to manufacture a pass. Recovery starts with transaction rollback on failure and retention of evidence. Separately approved Guard down refuses retained Guard jobs/data and uses no CASCADE; it is not automatic cleanup. Do not reset or roll back Sentinel.

Current DB/RLS/persistence/recovery/Sentinel-preservation runtime result: **BLOCKED / NOT RUN**. Required target and active exact-operation approval are UNKNOWN. No connection/migration/testing follows from this audit alone.
