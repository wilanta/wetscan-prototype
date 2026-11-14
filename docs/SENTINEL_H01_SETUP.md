# H01 manual local PostgreSQL setup and acceptance history

**Current finalization, 14 November 2026:** the approved instance exists; 14/14 real PostgreSQL acceptance passed on the separate test target, development up/up migration verification passed, and both private-parent IPC worker shutdown/restart cycles passed (22/20 ms, exits 0). The worker is stopped and temporary runtime approvals are closed. The owner authorized S01 review/commit/push/PR creation only; no new provisioning, database changes, worker startup, merge or deployment. [Actual acceptance and authorization history](SENTINEL_H01_ACCEPTANCE.md) supersedes the original setup-stage pending statements below. Do not repeat creation/migration commands against existing resources.

**Windows lifecycle note:** this tool's PTY did not deliver Ctrl+C reliably even to bare Node. The existing interactive worker command is retained, but Ctrl+C is not a verified stop mechanism in this environment. The separate `sentinel:worker:smoke` harness forks hidden direct Node children and sends private inherited IPC shutdown requests; it enforces a 180-second overall watchdog and 10-second idle stop deadline, with owned-process-only emergency cleanup. A future run needs a fresh exact-target runtime approval and `SENTINEL_SMOKE_OBSERVER_APPROVAL_FILE` pointing to the unchanged migration-only approval for read-only observation. Current records are closed; this note does not authorize starting it. No HTTP shutdown route exists.

**Current execution update, 14 November 2026:** the exact instance and acceptance-only target were approved/provisioned, then the owner separately authorized the shared-comment reader fix and test-only rerun. All **14 real PostgreSQL acceptance tests now pass**, exit 0, and up/up/down/up completed only on `wetscan_s01_test`. See [actual H01 results and source checksum](SENTINEL_H01_ACCEPTANCE.md). Development remains without module schemas/user tables; no main Sentinel worker was started. Do not repeat creation commands against the existing container/volume/secrets. Development migration and worker activation still need separate approval. The instructions below are retained as the original setup plan.

14 November 2026 (Asia/Jakarta). The implementation is prepared, not database-accepted. **Do not execute the provisioning, connection, migration or runtime commands below until the owner explicitly approves the exact target and migration plan.** They are instructions for that later authorized setup. No existing service/database/volume is to be reused or overwritten. H10 approval alone does not open this gate.

## Choices to approve

| Choice             | Proposed development value / decision needed                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Instance           | New dedicated Docker Desktop Linux PostgreSQL 17 container; owner selects reviewed `postgres:17...@sha256:...` image digest (not supplied or pulled automatically) |
| Network            | `127.0.0.1:55432` -> container 5432; confirm port unused; no public exposure                                                                                       |
| Database           | New `wetscan_dev`, UTF-8, UTC; owner `wetscan_migrator`; no changes to an existing native instance                                                                 |
| Volume             | New external `wetscan_sentinel_s01_dev_20261114` (proposal); owner confirms name unused. Stop if it already exists                                                 |
| Identity marker    | New `wetscan-s01:<UUID>` in database COMMENT and ignored approval/env; owner records exact value                                                                   |
| Roles              | Bootstrap `wetscan_bootstrap` only for local setup; runtime `wetscan_app`; separate worker `wetscan_sentinel_worker`; schema owner `wetscan_migrator`              |
| Secrets            | Four distinct random passwords, 20–512 characters, no line breaks; private ignored absolute-path files; never send passwords in chat                               |
| Resource/retention | DB 1 GiB / 2 CPUs / 128 PIDs / 40 connections; worker two active jobs, 256 MiB old-space heap; terminal infrastructure retention 30 days with holds                |
| Migration          | Review [SQL and runner plan](SENTINEL_S01_MIGRATION_REVIEW.md); explicitly approve initial `0001_foundation` up/application on this target                         |
| Acceptance target  | Separately approved NEW EMPTY `wetscan_s01_test` database/marker for destructive fixture and empty rollback checks; never `wetscan_dev`                            |

The worker heap setting does not cap total RSS/CPU. If a hard process budget is required now, select an OS supervisor/container configuration before activation. No Guard scanner is started and no Guard jobs/roles are provisioned by this packet.

## Before approval: safe offline review

From this repository in PowerShell:

```powershell
npm.cmd run sentinel:db -- plan
docker compose --env-file .env.sentinel.example -f infra/sentinel/compose.yaml config --no-interpolate --quiet
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
```

The plan command prints SQL identities without a pool. Do not run `up`, `down`, `status`, worker or a configured health/test command before approval. Review templates and source; a local approval file must reflect an actual owner decision, not test success.

## After explicit target/provisioning approval only

1. Verify the proposed loopback port is unused with `Get-NetTCPConnection -LocalPort 55432 -ErrorAction SilentlyContinue`. Do not stop an existing process to free it; choose/reapprove a different port instead. Review Docker volumes with `docker volume ls`; do not inspect contents of unrelated databases or delete anything.
2. Create ignored `.local/sentinel/` and copy `.env.sentinel.example` to `.env.sentinel.local` **only if absent**. Do not overwrite an existing env file. Use forward-slash absolute paths (quoted if spaces) for local files. Put distinct passwords from a password manager into `bootstrap.password`, `app.password`, `worker.password`, `migration.password` inside that ignored directory, UTF-8 without BOM, one line each, with access limited to the local operator. Do not put passwords directly in env, command arguments or SQL. For interactive role password entry use the same corresponding local value.
3. Set these ignored env values: reviewed `SENTINEL_POSTGRES_IMAGE`, approved `SENTINEL_DB_VOLUME`, `SENTINEL_DB_BOOTSTRAP_PASSWORD_FILE`, and all runtime password-file paths. Fill host/port/name/marker and absolute `SENTINEL_DB_APPROVAL_FILE`. Compose's database name is deliberately fixed to `wetscan_dev`; changing the dev database name requires reviewing the Compose file too.
4. Only after confirming the chosen volume name is new and approval explicitly permits provisioning, create it by its **literal approved name**, then start this one service:

```powershell
# Example name below must match the actual owner's approved new name.
docker volume create wetscan_sentinel_s01_dev_20261114
docker compose --env-file .env.sentinel.local -f infra/sentinel/compose.yaml config --quiet
docker compose --env-file .env.sentinel.local -f infra/sentinel/compose.yaml up -d postgres
docker compose --env-file .env.sentinel.local -f infra/sentinel/compose.yaml ps
```

Do not use `down -v`, volume removal, initdb against existing data, a force/recreate shortcut, or an existing volume. Compose has no migration/role init mount and does not launch a worker. Its external volume is never implicitly created or removed by this Compose project. `pg_isready` checks only server readiness, not role/persistence acceptance.

5. On this approved **new** instance only, provision the reviewed password-free roles (collisions fail rather than altering existing roles):

```powershell
Get-Content -Raw infra/sentinel/provision-roles.sql | docker compose --env-file .env.sentinel.local -f infra/sentinel/compose.yaml exec -T postgres psql -X -v ON_ERROR_STOP=1 -U wetscan_bootstrap -d wetscan_dev
docker compose --env-file .env.sentinel.local -f infra/sentinel/compose.yaml exec postgres psql -X -v ON_ERROR_STOP=1 -U wetscan_bootstrap -d wetscan_dev
```

In that interactive `psql`, set each password with `\password wetscan_app`, `\password wetscan_sentinel_worker`, and `\password wetscan_migrator` (prompts hide input), then apply the following reviewed target setup. Replace the marker placeholder with the exact approved UUID, never a password:

```sql
ALTER DATABASE wetscan_dev OWNER TO wetscan_migrator;
REVOKE ALL ON DATABASE wetscan_dev FROM PUBLIC;
GRANT CONNECT ON DATABASE wetscan_dev TO wetscan_app, wetscan_sentinel_worker;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
COMMENT ON DATABASE wetscan_dev IS 'wetscan-s01:<approved UUID>';
```

Exit with `\q`. The migrator owns this new database; runtime roles cannot create databases/roles or bypass RLS. No `guard` role or schema is needed. Check identity/role/marker on this known new target as part of authorized setup. Never run these statements on a different connection.

## Record approval and apply only the reviewed plan

Copy `infra/sentinel/approval.example.json` to an absent ignored `.local/sentinel/dev-approval.json`. Its initial status is `WAITING_USER`. **Only after the actual owner approval**, record `APPROVED`, reviewer/date, exact target/marker and the reproduced plan hash. For development activation the approved action list is `runtime` plus `migrate_up`; leave `migrate_down` and `integration_test` absent unless separately approved. A future SQL edit requires review and a new plan identity. Keep this file private and do not commit it. It documents approval; editing a file does not itself confer permission.

Verify ignored files with `git check-ignore .env.sentinel.local .local/sentinel/dev-approval.json`. Runtime readers use purpose-specific password paths, not connection URLs. Existing Auth `.env` and secrets stay untouched; Node scripts read only `.env.sentinel.local` (or the separate test file).

After **initial migration application is explicitly approved**, run:

```powershell
npm.cmd run sentinel:db -- plan
npm.cmd run sentinel:db -- up --approve-plan=7dac33cd59f2373d6ef87a94d6f588c723a8ce34f3115c47676d7353f7d61e43
npm.cmd run sentinel:db -- status
# A second approved up should verify checksums and make no schema changes.
npm.cmd run sentinel:db -- up --approve-plan=7dac33cd59f2373d6ef87a94d6f588c723a8ce34f3115c47676d7353f7d61e43
```

The runner refuses missing approval/marker/hash, unknown module namespaces or changed ledger checksums. Do not bypass a refusal or relabel an existing database to make it pass; investigate and request an amended plan. Down additionally requires explicit `migrate_down` permission, stops on **any runtime data**, and never deletes data to force reversal. Backups/recovery of a populated database require a separate plan.

After approved migration/role checks, start `npm.cmd run sentinel:worker` in a separate terminal and run `npm.cmd run sentinel:health` or `Invoke-RestMethod http://127.0.0.1:3112/health`. Stop with Ctrl+C. No projects/jobs are automatically created; health can be ready with an empty queue while telemetry remains `not_implemented` and providers `not_configured`. DB health alone does not prove worker durability.

## Separate real-PostgreSQL acceptance approval

The 14-case suite is intentionally not part of `npm test`. Its up/up/down/up and fixtures must run only on a separately approved **empty** test database. It never drops a database/volume, but it does create/reverse the foundation and write/delete its own test rows. Do not point it at development/user records.

After explicit approval, the local operator can create `wetscan_s01_test` on the same new instance with owner `wetscan_migrator`, revoke PUBLIC database privileges, grant CONNECT to app/worker, set a distinct approved database COMMENT marker and revoke public-schema CREATE in that database. Shared instance roles/passwords may be reused if the owner agrees; test target identity must differ from development. No production services are involved.

Copy the safe template to absent `.env.sentinel.test.local`, set `SENTINEL_DB_NAME=wetscan_s01_test`, its distinct marker, private absolute password-file paths and a separate ignored test approval record. That record must explicitly allow **all four** `runtime`, `integration_test`, `migrate_up`, `migrate_down` actions with the exact plan hash. The test runner checks permissions before launching Vitest. Only then run:

```powershell
npm.cmd run test:platform:postgres
```

The suite checks ordered checksums, rollback, concurrent enqueue/claim, exited-process lease recovery, stale fencing/revision, retry exhaustion, cancellation, cross-project/workspace/module RLS, outbox atomicity/unavailable provider, retention and heartbeat health. Fixture authorization is not real GitHub authorization evidence. Failure must remain failure; no in-memory fallback. Preserve redacted output and update the validation report only after actual execution.

Until those approvals/configuration are recorded, database acceptance is **BLOCKED_H01**, migration application is **NOT RUN**, and S02 stays **NOT_STARTED**.
