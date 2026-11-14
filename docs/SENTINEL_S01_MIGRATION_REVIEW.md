# S01 migration review and approved execution history

**Current review status, 14 November 2026:** the exact plan below was explicitly approved and accepted: test-only up/up/down/up with 14/14 real PostgreSQL cases, then separately approved development up/up with unchanged ledger/checksum. SQL and roles remain unchanged. This finalization task authorizes review/commit/push/PR publication, not any migration or new database connection. The worker is stopped. See [actual execution/approval history](SENTINEL_H01_ACCEPTANCE.md). The original review/proposal below is retained as historical context; pending-H01 language there is not the current local acceptance state. Existing development data/heartbeats prohibit empty-only down, which is not authorized.

Prepared 14 November 2026 (Asia/Jakarta). **Review material only: no instance provisioned, connection opened, migration applied or existing database/volume changed by this task.** H10 architecture approval is not H01 target/application approval. SQL creation is authorized by the subsequent explicit S01 task.

Run `npm run sentinel:db -- plan` without database configuration to reproduce the plan. Newline normalization makes hashes stable across Windows Git checkouts.

| Artifact                                                                 | Review identity                                                                                            |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Version                                                                  | `0001_foundation`                                                                                          |
| Up + NUL + down SHA-256                                                  | `dd061a60b123284882f154c438de3a171d60967b7b07a4e07200b6693f4eb778`                                         |
| Plan SHA-256 (ordered version/checksum manifest + role provisioning SQL) | `7dac33cd59f2373d6ef87a94d6f588c723a8ce34f3115c47676d7353f7d61e43`                                         |
| SQL                                                                      | `migrations/sentinel/0001_foundation.up.sql`, paired `.down.sql`                                           |
| Separate prerequisite                                                    | `infra/sentinel/provision-roles.sql`; three NEW roles, no passwords, transactional, no collision overwrite |
| Runner                                                                   | `src/platform/migrations.ts`, `scripts/sentinel-db.ts`                                                     |

Any change to these SQL files invalidates the hash and requires renewed review/approval. The plan hash identifies SQL content, not approval by itself. Review the runner and provisioning steps too. An ignored approval record records the human decision; software does not independently authenticate its author.

## Proposed target and objects

Proposed target: a **new dedicated Docker PostgreSQL 17 development instance**, image pinned to an owner-reviewed digest, `127.0.0.1:55432`, database `wetscan_dev`, new explicitly named external volume. Exact image, volume, marker, credentials and creation/application permission remain unapproved. No use of any existing service on 5432 is proposed. The [H01 guide](SENTINEL_H01_SETUP.md) supplies configuration and manual commands, all gated.

| Schema/object                                                    | Purpose / ownership                                                                |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `platform.schema_migrations`                                     | Runner-owned ordered version/checksum ledger                                       |
| `platform.module_limits`                                         | Shared module budget; only Sentinel seed (2), no Guard seed                        |
| `platform.jobs`, `platform.job_attempts`                         | Scoped references, idempotency, leases/fences/revisions and attempt outcomes       |
| `platform.notification_outbox`, `platform.notification_attempts` | Transactional reference-only outbox and evidence/outcome ledger; no provider sends |
| `platform.worker_heartbeats`                                     | Module/worker infrastructure heartbeat                                             |
| `sentinel.project_bindings`                                      | Authorized repository processing metadata, disable and retention hold              |

Composite job/outbox keys include module, mode, workspace and project. Indexes cover due jobs, expired leases, project queue state and terminal outbox retention. Foreign keys cascade only attempt records; outbox-to-job uses RESTRICT. No Auth/Canvas/Guard schema, telemetry, alert, incident, Ghost or Intelligence table is created. Shared tables do not reference Sentinel bindings by FK, leaving future Guard adapters independent.

Roles: `wetscan_migrator` owns prepared schemas, `wetscan_app` has scoped application grants, `wetscan_sentinel_worker` has live Sentinel scheduling/settlement/retention grants. All are NOSUPERUSER/NOBYPASSRLS/NOCREATEDB/NOCREATEROLE. PUBLIC schema privileges are revoked on new module schemas. Forced RLS restricts runtime module/mode/scope; worker scheduling is deliberately cross-project within Sentinel. Bootstrap remains a separate local administrative principal and is never used by the runtime. Database CONNECT/public-schema configuration is a reviewed manual prerequisite, not an automatic mutation to an unknown instance.

## Execution and failure plan

1. Owner approves exact new target, image/volume/marker, credentials, budgets and this plan. Provision roles/database/comment only on that identified new target.
2. Configure ignored absolute-path approval and purpose-specific password files. The runner requires target equality, plan equality and the requested action **before pool creation**. Once connected it checks database identity, marker, role and version before migration work.
3. `up` additionally requires `--approve-plan=<exact hash>`. A dedicated client takes transaction advisory lock 7342001. Bootstrap of the `platform` schema/ledger and all pending migration SQL run inside one transaction. Existing module namespaces without the expected ledger, unknown/out-of-order versions or checksum edits are refused.
4. A second `up` verifies the same ordered checksums and performs no schema change. Failed SQL rolls back all changes; failed rollback destroys the client. Connection errors and SQL failures use fixed redacted CLI outcomes. Nothing runs on app/worker startup.
5. Validate on the separately approved empty test database first. Then separately authorize the initial development `up`; test success never implies permission to apply elsewhere.

## Reverse plan and data safety

`down` is a separately approved action and also needs the exact hash flag. The runner supports reversing only this single foundation version, locks all owned runtime tables, checks for foreign module budgets and refuses **any** jobs, attempts, outbox, bindings or worker heartbeat rows (including stopped heartbeats). There is no force, truncate, CASCADE, database drop or volume removal option.

The down SQL drops only the foundation's empty objects in dependency order; the runner removes its ledger and empty platform schema last. Unknown dependencies/remaining schema objects cause a transactional failure. Roles and the PostgreSQL instance/volume are retained. A populated database requires backup/recovery and a separately reviewed forward migration or explicit data handling plan. This down script is not a data restore or a permitted cleanup mechanism. Stop workers/app access before any separately approved rollback.

Retention at runtime is a separate deliberate behavior: only aged terminal infrastructure rows, bounded batches, respecting holds; it is not run during migration. The proposed 30-day policy must be accepted under H01 before worker activation.

## Checks and outstanding acceptance

The up/down/role SQL, PL/pgSQL policy block and parameterized runtime SQL templates were syntax-parsed offline; zero statements executed against a database. Compose configuration validates without starting Docker services. Recording-double tests check transaction/error/gate behavior. These checks cannot establish role grants, RLS execution or durable concurrent behavior.

All 14 real-PostgreSQL acceptance cases remain **BLOCKED_H01 / NOT RUN**, including empty up/up/down/up, concurrent claims/enqueue, process restart/reclaim, rollback, stale revision/fence, cancellation, retry exhaustion, project/workspace/module isolation, outbox atomicity, retention and health. No fixture result is labeled live PostgreSQL evidence. See [validation](SENTINEL_S01_VALIDATION.md).

**Approval required next:** identify the development target and its new volume/image digest/marker; authorize its provisioning and the exact initial migration plan/application. A separate empty test target plus `integration_test`, `migrate_up`, `migrate_down` and runtime permissions is needed for database acceptance. Do not grant development rollback merely to enable the test suite. S02 remains unstarted.
