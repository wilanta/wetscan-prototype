# Latest G01 acceptance checkpoint

Connected positive Worker/Auth prepare_only is LIVE_VERIFIED: two identical enqueue calls retain one durable job, one actual 42.005s worker attempt completes with renewed lease, running?stopped heartbeat and matching foundation_prepared audit/coverage. Actual post-run SQL18 preservation matches initial/final hashes with differences[], three retained Guard scans and zero active leases. No schema/role/config/Sentinel change occurred. Overall G01 remains PARTIALLY COMPLETE; integrated sandbox, live negative and crash/restart/recovery gates remain open. See [final Worker/Auth report](acceptance/guard-g01/WORKER_AUTH_ACCEPTANCE_2c18db66.md) and [Will handoff](agent-handoffs/HANDOFF_WILL_G02_G06.md). Historical statuses below are superseded where inconsistent.

---

# Latest verified G01 checkpoint - 2026-11-15T21:03:07.884524+07:00

**Current decision: PARTIALLY COMPLETE.** Read [final acceptance](GUARD_G01_FINAL_ACCEPTANCE.md) first. The historical entries below are retained verbatim; their old UNKNOWN/permission/publication/S03-failure statements are superseded by this checkpoint.

Actual isolated PostgreSQL migration/ledger/FORCE RLS and role app/worker connections verified:14 persistence/queue +11 context/least-privilege checks PASS. After BOTH suites, owner18 observer confirms2retained Guard scans,0active leases; Sentinel fixture/catalog before/after hashes identical45e7cfe26767e26ad96ceda0dd2a53649a10ea7a5453844ac50ee30867e1095d, differences[]. Guard budget1/Sentinel2; canonical migration planb63...5869d unchanged. No existing external Sentinel DB was inspected or mutated. Docker real pinned Official Python control probes6/6 PASS, all6containers removed with ownership/filter verification. Synthetic controls are not connected worker/scanner acceptance.

New default-empty-temp ACL preflight found another account inherited read; Guard now verifies/hardens ONLY new empty snapshot roots before writing source (Windows owner+SYSTEM, POSIX0700). No Auth/Canvas/dashboard/dependency/canonicalSQL source change. Final affected checks:782/782units, typecheck/lint/build PASS; Guard7/Auth21/Canvas17 E2E PASS. S03 fix retained, original6/6 and race3/3 earlier same-sprint PASS; no weakened assertions. Initial new-helper path/mock compatibility failures fixed and recorded.

Owner supplied actual UI preparation draft for inkAja/wdu/main/41861b...0e2b; exact jobed1db523...ccee0c validated offline. Worker/source/preparation/DB-role templates stay WAITING_USER. Read acceptance/guard-g01/WORKER_AUTH_PLAN.md (path relative to docs) for current plan hash and safe single-app readiness/reexport step before any execution approval. NO live worker/enqueue/GitHub snapshot has run; no implicit source/worker/container permission. prepare_only does not execute Docker; integrated foundation composition and remaining live gates are still open. No G02, commit/push/PR/merge/deploy, reset, marker deletion or browser computer control. Existing.env.local remains unread/unmodified; owner-provisioned private purpose values were consumed only internally by the authorized Guard credential loader, never inspected/reported.

---

# Verified PostgreSQL/sandbox acceptance update ? 2026-11-15T20:06:18.619193+07:00

Current decision remains PARTIALLY COMPLETE, no G02/publication. PostgreSQL new target schema/ledger/FORCE RLS and isolated Sentinel fixture preservation are now LIVE_VERIFIED via actual owner18 pgAdmin result. Before/after45e7cfe26767e26ad96ceda0dd2a53649a10ea7a5453844ac50ee30867e1095d match, differences[]. Guard migration checksum8bdea?693b and planb63?5869d match; Guard budget1/Sentinel2. This supersedes pending17/COMMIT-only statuses below.17 session before hash was null and was not counted as preservation;18 uses recorded original06 catalog/data, not assumed source behavior. External Sentinel DB remains unobserved. Docker real isolated synthetic controls6/6 PASS; no connected worker/real GitHub-source execution is claimed. App/worker runtime tests still need manual private password provisioning and a valid renewed exact-target runtime/integration_test permit (old mutation window ended19:59WIB). Never read credentials, delete locks, replay migrations/reset, retry browser computer control, commit/push/merge/deploy or start G02. Read docs/GUARD_G01_FINAL_ACCEPTANCE.md and acceptance package for exact evidence/remaining steps.

---

# Latest G01 acceptance checkpoint ? 2026-11-15T19:53:11.945230+07:00

**This section supersedes historical statuses/publication instructions below.** Read [G01 final acceptance](GUARD_G01_FINAL_ACCEPTANCE.md) and its exact-target SQL/sandbox package. Branch feat/guard-g01-s03-integration remains1b28fb8 with local work; no commit/push/merge/deploy/G02 authorized. S03 is fixed and original6/6 PASS; do not report the historical failure as current.

Real Docker control probes6/6 PASS with pinned Official Python image, private ACL/read-only source, networknone/resource caps/timeout/cancel/OOM/orphan cleanup; filtered verification shows no remaining owned container. This is synthetic enforcement evidence, NOT connected worker/GitHub-source scanning or a production attestation. New G01 PostgreSQL database/roles/baseline/fixture were operator-provisioned under exact approval; original07 failed FORCE RLS for owner INSERT. Separate approved resume uses postgres only for Guard budget1; leaves policies/RLS/canonical migration hashb63?5869d unchanged. Operator13 verified rollback/exact marker/checksums. Owner14 reports COMMIT;17 read-only JSON is still required before accepting Guard migration/preservation. CLI login failure and EEXIST markers remain preserved. Both loopbacks share the PostgreSQL listener; no password reset or secret inspection. App/worker PostgreSQL tests still need manually provisioned guarded credentials. Mutation approval expires19:59WIB15November; no implicit renewal or destructive cleanup.

Overall PARTIALLY COMPLETE. Existing.env.local unchanged; ignored non-secret Guard sidecar prepared. Browser computer control is not retried. Do not rerun bootstrap/resume or delete markers before actual state verification. See the final report for exact commands/hashes/blockers and the gated G02 prompt.

---

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
