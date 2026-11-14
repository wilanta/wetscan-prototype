# H01 Phase A preflight - exact targets awaiting approval

**Historical Phase A record:** the exact targets below were subsequently approved and provisioned. Test acceptance, the shared-comment-reader fix, separate development migration/idempotency and worker lifecycle acceptance are recorded in [H01 acceptance history](SENTINEL_H01_ACCEPTANCE.md). Original preflight observations/checksums are retained unchanged as evidence of what was reviewed before execution; they are not current runtime status. Finalization authorizes publication only; no recreation, new connection/migration or worker startup.

14 November 2026 (Asia/Jakarta), checks approximately 18:42-18:45. **Phase A only. No volume/database/container/network created, no service started, no PostgreSQL connection, role provisioning or migration application. Infrastructure is not operationally accepted.** The owner's configuration preferences and resource/retention choices are recorded; approval of these exact final targets is still pending under Phase B.

## Repository and preservation

Current branch: `feat/sentinel-s01-platform`; HEAD `ec6838b77cf14a126cb3c4d1a7f8d86d70d85665`. The existing 44 changed/untracked S01 files were fingerprinted before any documentation addition. No checkout, reset, stash, dependency install, commit, push or merge was performed. This report is the only intended addition; original S01 code/configuration/documents remain untouched.

Read completely: H01 setup, S01 migration review and S01 validation report. Re-read the migration runner/CLI, approval/connection gates, Compose and password-free role prerequisites. The earlier validation report is historical offline evidence (374 unit tests, six fixture browser regressions), not a real PostgreSQL result from this preflight. The 14 real acceptance tests remain NOT RUN.

## Exact proposed runtime identities

| Setting                           | Final proposal / observed availability                                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Docker context                    | `desktop-linux`, Docker Desktop Linux x86_64, Engine 29.9.2; daemon responding                                                          |
| Compose project                   | `wetscan-sentinel-local`; no containers currently bear this project label                                                               |
| Service / expected container name | `postgres` / `wetscan-sentinel-local-postgres-1`; name absent; no container ID exists yet                                               |
| Expected new project network      | `wetscan-sentinel-local_default`; name absent                                                                                           |
| New external volume               | `wetscan_sentinel_s01_dev_20261114`; exact name absent from successful Docker volume enumeration                                        |
| Data mount                        | That new volume only -> `/var/lib/postgresql/data`                                                                                      |
| Host endpoint                     | **`127.0.0.1:55432`** -> container TCP 5432; no existing TCP binding on any local address at 55432                                      |
| Windows reserved ports            | 55432 is outside enumerated IPv4/IPv6 TCP exclusion ranges                                                                              |
| Development database              | NEW `wetscan_dev`, UTF-8, UTC, owner `wetscan_migrator`; foundation migration withheld pending separate later approval                  |
| Acceptance database               | NEW EMPTY `wetscan_s01_test`, UTF-8, UTC, owner `wetscan_migrator`; only this database receives acceptance migrations/reversal/fixtures |
| Dev database marker               | `wetscan-s01:26b6b537-c016-4dc7-8007-4e839e8b838f`                                                                                      |
| Test database marker              | `wetscan-s01:9f3560a6-127f-42a6-abaf-9f45951e6bd5`                                                                                      |
| Future worker health              | `127.0.0.1:3112/health`; port also currently unused; worker will not start at initial test provisioning                                 |

Both marker UUIDs were generated locally with `[guid]::NewGuid()` at 18:42:35 +07:00 and are non-secret proposed database COMMENT values. They have not been applied or written into any runtime approval/env file. Use explicit Docker context/project arguments during future approved provisioning to prevent environment variables selecting another project. Recheck port/name availability immediately before creation; the checks do not reserve them.

Because both the container and its dedicated volume are absent, the proposed databases/roles/module objects are to be created in a new cluster, not an existing application database. No existing database catalogs or Docker volume contents were inspected. Actual database emptiness cannot be demonstrated before the approved cluster/database creation. The image will also initialize PostgreSQL's standard internal databases; it will not access another instance or the native 5432 service.

## Exact official image and verification

Proposed platform-specific immutable image reference:

```text
docker.io/library/postgres:17.12-bookworm@sha256:99d1a998c76487d3abb48b141505bda5dcf8089c0c4cd7be40f75de314fa32f0
```

Platform: **linux/amd64**, matching the local x86_64 Linux engine. Source: [Docker Official Image postgres](https://hub.docker.com/_/postgres). Its [official-images tag catalog](https://github.com/docker-library/official-images/blob/master/library/postgres) lists 17.12-bookworm and amd64, with source commit `76a70e36d51517f2ab061a9bb60b1980a6902e29`, directory `17/bookworm`. The immutable [Dockerfile](https://github.com/docker-library/postgres/blob/76a70e36d51517f2ab061a9bb60b1980a6902e29/17/bookworm/Dockerfile) identifies PostgreSQL major 17, package `17.12-1.pgdg12+1` and Debian Bookworm. Registry annotations match that source commit/path/version.

| Registry artifact                         | Verified SHA-256 / evidence                                                                                             |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Multi-platform index for `17.12-bookworm` | `sha256:40865bc877a289da75963d97d72b59633f639fc5af7a4e856bfa3714cae5b536`; 6,496 raw bytes                              |
| Selected linux/amd64 image manifest       | `sha256:99d1a998c76487d3abb48b141505bda5dcf8089c0c4cd7be40f75de314fa32f0`; 3,641 raw bytes; exact descriptor/size match |
| Image config descriptor                   | `sha256:431b070f8300b219ab7e6597e7ebb158df31767739896f53a936cfc749d8437a`                                               |
| Retrieved config fields                   | `os=linux`, `architecture=amd64`, `PG_MAJOR=17`, `PG_VERSION=17.12-1.pgdg12+1`, `PGDATA=/var/lib/postgresql/data`       |

Verification used registry-only `docker buildx imagetools inspect` metadata/config and `--raw` manifest output. A Node SHA-256 calculation over the exact raw bytes independently matched BOTH the reported index digest and its selected platform digest, and the platform descriptor sizes matched. The selected image manifest lists 14 layers; none were pulled or executed. [Docker documentation](https://docs.docker.com/reference/cli/docker/buildx/imagetools/inspect/) describes these registry inspection/raw/config operations. This verifies immutable manifest identity and platform/config compatibility; no publisher signature verification, vulnerability scan or running-server version/health is claimed. A future pull must use the exact digest above, not a floating tag.

## Roles and approved development budgets

All roles are new within the proposed new cluster:

- `wetscan_bootstrap`: image-created local bootstrap administrator; setup only, never an app/worker principal.
- `wetscan_migrator`: LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOBYPASSRLS; owner of these two new databases/module schemas.
- `wetscan_app`: distinct LOGIN/non-superuser/non-bypass role; application scope grants after migration.
- `wetscan_sentinel_worker`: distinct LOGIN/non-superuser/non-bypass role; Sentinel scheduling/retention/health only; no Guard scanner role or enrollment.

Use the same three cluster roles for both new databases, with distinct role passwords; dev/test configuration uses different database names/markers/approval files. Database PUBLIC privileges are revoked; CONNECT is granted to app/worker on the approved databases. Runtime roles do not own module schemas. Forced RLS/module grants are applied only when that database's foundation migration is authorized.

Budgets accepted as preferences: database 1 GiB RAM, 2 CPUs, 128 PIDs, 128 MiB shared buffers, 40 connections; pools app/worker/migration 5/3/1 per process; Sentinel at most two active leases, 1 s polling, 30 s lease, 10 s heartbeat, 20 s handler timeout, five attempts maximum, 1,000 active jobs/project. Retention is 30 days for terminal infrastructure metadata with holds and bounded batches. The future worker has 256 MiB V8 old-space, **not a hard total RSS/CPU limit or OS sandbox**. Local Docker reports 8 CPUs and about 3.68 GiB engine RAM; the proposed DB cap fits that allocation. No worker is started now.

## Migration and runner identity

Offline command re-executed successfully: `npm run sentinel:db -- plan`, reporting `review_only`, database connections 0.

```text
Version: 0001_foundation
Up + NUL + down SHA-256:
dd061a60b123284882f154c438de3a171d60967b7b07a4e07200b6693f4eb778
Plan SHA-256 (ordered version/checksum manifest + role SQL):
7dac33cd59f2373d6ef87a94d6f588c723a8ce34f3115c47676d7353f7d61e43
```

Independent SHA-256 recalculation using the documented CRLF normalization reproduced both values exactly, matching `SENTINEL_S01_MIGRATION_REVIEW.md`. Thus the reviewed up/down/role SQL content has not changed. Compose template syntax also passed `config --no-interpolate --quiet`; no services were started.

The plan hash does not include runner source. Runner/CLI were re-read and checked against the review's behavior: action/target/marker/hash gates before pool creation; no startup migrations; one transaction/client and advisory lock; ordered checksum checks; refusal of unknown module namespaces; empty-only single-version reverse with no CASCADE/data-clearing bypass. For this approval packet, normalized UTF-8 file SHA-256 identities are now explicitly recorded:

| File                                 | SHA-256                                                            |
| ------------------------------------ | ------------------------------------------------------------------ |
| `src/platform/migrations.ts`         | `39b1d81265f62f6786378550e5db622c7e9655bceb1456b6d2147fc92a57ed5b` |
| `scripts/sentinel-db.ts`             | `ea8ce7d843e439f16fb7b227fe813805763b490eadfedfebe7028054b854d90e` |
| `src/platform/config.ts`             | `477cb74650cda3c373873cfcc72d167d58ca85c28c122a64b3ab21176cf33e4c` |
| `src/platform/database.ts`           | `7e38d20a36d3b7e88b5e6959070c9630b3da643f018eeb218f081f5344632f3c` |
| `infra/sentinel/compose.yaml`        | `8fce970c203154e314b251af7a75a809a12a413ca9dcce69e6588721a0ab6119` |
| `infra/sentinel/provision-roles.sql` | `7c531cf4165f7fa4eb4a4b65aff4ad409360f6a3cd08f3af8932c48d91829299` |

## Secure password-file instructions - not executed

The repository resides under OneDrive. To avoid placing plaintext database passwords in that synchronized tree, propose private files **outside the repository and OneDrive**:

```text
C:/Users/sheil/.wetscan-sentinel/s01-20261114/secrets/bootstrap.password
C:/Users/sheil/.wetscan-sentinel/s01-20261114/secrets/app.password
C:/Users/sheil/.wetscan-sentinel/s01-20261114/secrets/worker.password
C:/Users/sheil/.wetscan-sentinel/s01-20261114/secrets/migration.password
```

After future explicit approval only: verify that this directory/files do not already exist; never overwrite existing secrets. Create a private NTFS directory with inheritance removed and FullControl allowed only to the current local operator and SYSTEM. Generate four independent random passwords using a password manager or cryptographic RNG (32 random bytes encoded as 64 hex characters is suitable). Write each as UTF-8 **without BOM**, one line, no trailing whitespace; do not echo, log, paste in chat, place in shell command arguments/history or commit it. Verify ACLs/length without printing contents. Enter the corresponding role password through hidden `psql \password` prompts or an equivalently reviewed secret-input path after the new cluster is approved. Do not put actual values into SQL or connection URLs.

Ignored `.env.sentinel.local` and `.env.sentinel.test.local` will contain only non-secret settings and absolute password-file paths. Proposed ignored approval records are `.local/sentinel/dev-approval.json` and `.local/sentinel/test-approval.json`; they are not created/marked APPROVED now. Dev/test target names and markers must never be interchanged. The bootstrap file is mounted as the Compose secret; the worker gets only its worker credential path. No existing Auth env file needs to change. No credentials were generated/read/printed during Phase A.

## Exact next approval and expected operations

The following is a future plan, **not permission derived from configuration preferences**:

1. Recheck `desktop-linux`, unused names/port and all reviewed hashes. Pull only the pinned linux/amd64 image, create only the named new external volume and new Compose project network/container, publish only loopback 55432. If anything now exists, stop and resolve rather than reuse/delete it.
2. Create private local credentials and the approved configuration/records. Initialize the new cluster and new `wetscan_dev`; provision the three reviewed new roles, set distinct role passwords, database ownership/CONNECT/public-schema restrictions and the exact dev COMMENT marker. **Do not create dev `platform`/`sentinel` schemas, apply `0001_foundation`, start a worker or authorize dev migrate_up yet.**
3. Create new empty `wetscan_s01_test` on that new instance, configure its ownership/permissions and distinct marker. Its approval record needs explicit `runtime`, `integration_test`, `migrate_up` and `migrate_down`, exact target and plan hash. Development migration permission is separate and stays absent.
4. Run `npm run test:platform:postgres` using only the test env/record. Its authorized test sequence is up/up/down/up, followed by the 14 real acceptance tests and fixture-only cleanup. Migrations create `platform` ledger/jobs/attempts/outbox/heartbeats/module budget and `sentinel.project_bindings` **in the acceptance database only**. There are no Guard/Auth/Canvas or telemetry/incident/provider schemas. No Guard worker or external notifications run.
5. Report actual pass/fail results; do not mark infrastructure operational on failure. Stop for **separate development migration authorization**, even if all test cases pass. Only that subsequent approval can enable dev migrate_up, dev idempotency checks, isolated worker startup and real health checks.

No name/port conflict was found at preflight. Remaining cautions are availability races (recheck before creation), bootstrap administrator isolation, plaintext file ACL/location, and the documented worker heap-vs-RSS distinction. Manifest identity is verified, but running PostgreSQL/RLS/durability/health remain unverified until approved testing. No existing Docker volume or production service is a target. No code in Auth, Guard, Canvas, Demo Mode or routing changes; S02 remains NOT_STARTED.

**Phase B status: WAITING_USER for the exact provisioning and acceptance targets above. Development foundation migration remains a distinct later approval gate.**
