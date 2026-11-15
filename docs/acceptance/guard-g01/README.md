# Current execution status - 2026-11-15T21:03:07.884524+07:00

The historical preparation below is retained for audit, not an instruction to rerun. Approved provisioning/resume completed and verified. PostgreSQL14+11 real checks PASS; initial/final isolated observer hashes match45e7cfe2...1095d with differences[]. Docker6/6 real synthetic control probes PASS; all owned containers removed. Fixtures/evidence retained. No external Sentinel DB or secret inspected. Worker/Auth plan remains NOT APPROVED; see WORKER_AUTH_PLAN.md and ../../GUARD_G01_FINAL_ACCEPTANCE.md. Do not execute expired SQL or erase markers. Canonical Guard migration hash remainsb63e1e...5869d.

---

# G01 exact-target acceptance package ? WAITING FOR OWNER APPROVAL

15 November 2026 (Asia/Jakarta). No SQL in this directory has been executed. No Docker image has been pulled and no container has been created/started. Generating files/hashes is not approval.

## Database identity and privilege boundary

- Service: Windows `postgresql-x64-18`, PostgreSQL **18.6 / 180006**, loopback **localhost:5432** (verified earlier through read-only maintenance `postgres`; not a historical port55432 target).
- New database: **wetscan_s01_test_guardg01**, template0, UTF8. Owner: **wetscan_guard_migrator**.
- Proposed marker: **wetscan-s01:aa8b15a6-7ed3-4f19-81f0-07d9759ec62f**. This marker is generated for this new target; not yet applied/verified.
- Operator provisioning: existing `postgres` identity through the normal approved operator connection. Its password is never read or put in commands. Recheck version/role flags and absence using00 immediately before any mutation. Stop on collision; never ALTER an existing role/database to make the script pass.
- New Guard LOGIN roles: `wetscan_guard_app`, `wetscan_guard_worker`, `wetscan_guard_migrator`. All NOINHERIT/NOSUPERUSER/NOBYPASSRLS/NOCREATEDB/NOCREATEROLE/NOREPLICATION, no memberships. No passwords in SQL.
- Canonical platform prerequisite roles: `wetscan_migrator`, `wetscan_app`, `wetscan_sentinel_worker`, all **NOLOGIN** with the same restricted attributes. These exact names are required by unchanged S01?S03 SQL. They must still be absent. They receive permissions ONLY inside the new database. They do not connect to a Sentinel database. Cluster-global role creation is explicitly part of the approval request.
- Only Guard app/worker/migrator CONNECT on new DB; PUBLIC CONNECT/TEMP and public-schema CREATE revoked there. Platform owner gets temporary database CREATE only during baseline setup, then that grant is revoked atomically. Guard app/worker get no Sentinel-schema USAGE, no DELETE or schema CREATE, no role membership.
- Preserve existing PostgreSQL databases, roles, server settings, pg_hba and data. No application/worker startup or SQL is authorized by the file generation.

## Exact SQL sequence for approval

Execute files separately and on the named connection only; do not concatenate them across database contexts.

| File | Connection | Effect |
| --- | --- | --- |
|00-maintenance-preflight.sql|postgres|Read-only identity/role flags and only proposed name/role existence.|
|01-new-roles.sql|postgres|Atomic create six absent roles; rejects any collision.|
|02-create-database.sql|postgres|Single CREATE DATABASE, alone outside transaction.|
|03-target-and-privileges.sql|new G01 DB|Reject nonempty/wrong owner/marker target, set marker and database/schema privileges.|
|04-fresh-platform-baseline.sql|new G01 DB|Canonical S01/S02/S03 baseline and exact ledger, in one transaction. Creates a synthetic Sentinel-shaped schema ONLY in this new empty DB; no existing Sentinel schema is reused.|
|05-preservation-fixture.sql|new G01 DB|Nonempty synthetic project/source/event/rule/audit + completed Sentinel fixture job; no actual GitHub or customer content.|
|06-preservation-observer.sql|new G01 DB|Repeatable-read, read-only observer BEFORE07/08 and AFTER Guard tests. Hash/count all Sentinel rows, Sentinel-module platform rows, platform ledger, structural catalog/policies/grants/role flags. Exclude only named authorized Guard platform policies/grants.|
|07-guard-platform-access.sql|new G01 DB|Canonical additive Guard policies/grants and Guard-only module budget; no Sentinel rows/policies changed.|
|08-guard-schema.sql|new G01 DB|Validate exact platform ledger, apply Guard schema/FORCE RLS/functions and Guard ledger checksum.|
|09-readonly-security-verification.sql|new G01 DB|Role/ledger/RLS catalog checks and role-specific empty-context denial assertions; read-only.|
|90-empty-guard-rollback.REQUIRES-SEPARATE-APPROVAL.sql|new G01 DB|**Excluded** from up/test permission. Guard-only down refuses retained scan/job data or workers. No CASCADE, no database/role drop, no fixture deletion.|

Role creation is transactional. CREATE DATABASE cannot be part of that transaction; if later setup fails, retain the new database/roles and evidence for review. Each schema transaction rolls back its own failure. Never silently retry/reset a partially prepared target. No down, DROP DATABASE/ROLE, role password mutation, DB reset, production/Sentinel connection, settings/pg_hba change, or cleanup is implied. Resources remain for owner review. A separate cleanup approval must name exact resources and retained-data policy.

## Actual hashes

- Guard migration aggregate: `b63e1e8568babcf8d7811fe0fa735ecbec11ade64df19bdea78deb030a85869d`.
- Platform baseline aggregate: `c3e39f6fd43ee6eb2fbf5b244778955aab4cabb8a11ed3c66d791cf99a252a94`.
- **Target/SQL/acceptance-runner bundle SHA256: `e6f3b28cd49ac8c875a20b034338645dc4e14a8f81036e200f453f0337a05f01`.**
- [manifest.json](manifest.json) binds target, proposed marker, version, owner and normalized-LF SHA256 of each SQL file plus existing PostgreSQL test runner. Canonical source migration files are unmodified. Any change invalidates this bundle and requires review/approval again.
- Guard up/down checksum: `8bdea256cdd5ab79b1525f43bd40508acf25e57502a72162ae6b5233dd55693b`.

## Requested operation scope and expiry

Request owner approval for00?09 on ONLY the new target, new roles above, read-only before/after observer, and the existing opt-in PostgreSQL acceptance runner (Guard-only synthetic scan/queue mutations, retained rows). Runtime and integration_test are separate app and worker purpose records; migration is a separate purpose record. Window: **60 minutes starting at explicit approval**, stamp actual approvedAt/expiresAt only after reply. If it expires, stop new mutations; do not manufacture an approval. Current pending records say WAITING_USER and are deliberately rejected by application guards.

Credential creation/provisioning is **not** performed by these SQL files. After role creation, the owner sets distinct Guard passwords through their normal protected operator workflow and supplies purpose-specific ignored password files; do not send values in chat or SQL history. Existing guarded credential loading may consume those files only with the active exact-target purpose approval. The agent does not read/print them. LOGIN roles start without a password and cannot pass password authentication until that manual step is completed.

## Local configuration and commands (prepared, NOT executed)

Existing `.env.local` is not read or modified. New ignored `.env.guard-g01.local` contains only paths/disabled flags, created exclusively without overwriting a file. [env.local.additions.example](env.local.additions.example) is its non-secret review copy. Password files do not exist. Pending approval JSON under `.local/sentinel/guard-g01-unblock` has blank approver/timestamps and WAITING_USER. Do not load this over active Auth configuration blindly. After approval/credentials, activate the sidecar in the existing single Auth process; do not start two Auth writers. An owner can merge only these Guard keys into `.env.local` if preferred; the agent cannot guarantee a duplicate-free merge while forbidden from reading the file, so no append/shadowing has been attempted.

```powershell
# Offline plan / no connection:
node --require ./tests/auth/skip-dotenv.cjs --import tsx worker/guard/plan.ts
# ONLY AFTER approved database is provisioned, active purpose permits and credentials are supplied;
# set GUARD_POSTGRES_ACCEPTANCE=1 and GUARD_LIVE_READ_ENABLED=1 in the Guard sidecar first:
node --env-file=.env.guard-g01.local --require ./tests/auth/skip-dotenv.cjs --import tsx tests/guard/g01/postgres.acceptance.ts
```

The existing runner tests app/worker privileges, FORCE RLS, scoped idempotency/persistence/retrieval, cross-workspace filtering, competing claims, stale fence/revision denial, lease reclaim, rollback, fresh-pool retrieval, cancellation. It retains synthetic rows. It does **not** prove actual worker-process restart, real GitHub, complete findings/evidence persistence, or sandbox execution. Do not call it full G01 end-to-end. Re-run06 after all approved Guard activity and compare actual outputs, not just exit codes. Production/Sentinel database preservation remains unverified without a separate approved observer on that database; the G01 fixture observer proves only this isolated target.

## Docker control-probe approval package

- Explicit endpoint: `npipe:////./pipe/dockerDesktopLinuxEngine`; read-only terminal metadata verified Docker29.7.2/linux/amd64, daemon`c1c9b326-b14b-4797-8c28-77e288102e53`. No unrelated containers/images enumerated.
- Docker Official Python image, manifest verified linux/amd64 (not pulled): `docker.io/library/python@sha256:d76f585fb0d5107dd47143da5e61554fd9cae656a30f3470f815cb8475769b6a`. Origin: https://hub.docker.com/_/python and https://github.com/docker-library/python. ImageID is **NOT YET VERIFIED**; inspect only this exact reference after approved pull and verify its RepoDigest + content image ID.
- **Sandbox plan SHA256: `368b9b515529b88d2271a5e309113e6b0a4289de2bcf4ccd7453127f09dbc89d`**. [sandbox-plan.json](sandbox-plan.json) binds endpoint/daemon/image/run UUID/source path/six exact new container names/resource caps/probe and harness hashes. Any change needs a new hash and approval.
- Only synthetic fixture files from this package may be mounted at `/source:ro`; exact host root is in the plan, must not already exist. Current-user+SYSTEM-only protected ACL is applied/verified only on that new fixture directory. No customer repository scripts, host secret mounts, app env, DB credentials, Docker socket or named volumes. Source fixtures and image retained for review.
- Containers: nonroot65532:65532, root read-only, networknone, IPCnone, all capabilities dropped, no-new-privileges, CPU1, RAM/swap256MiB, PIDs64; `/tmp`16MiB noexec/nosuid/nodev tmpfs. No published ports. Never privileged. Output cap64KiB; normal execution5s; timeout1.5s; cancellation0.5s. Only the exact six names + acceptance run label/image may be removed.
- Trusted control fixture [sandbox-probe.py](sandbox-probe.py) tests source/root write denial, forbidden path denial, missing protected env keys/socket, TEST-NET egress denial, cgroup caps, scratch, excessive output, timeout, cancellation, actual memory OOM, orphan-container cleanup. No host execution of the probe. [harness](../../../tests/guard/g01/docker.acceptance.ts) uses the existing scrubbed Docker driver, verifies actual inspect settings before start, records failures, verifies ownership before removal and stops on uncertain cleanup. No production attestation is fabricated/issued.
- Production `DockerGuardSandbox` still requires its own matching enforcing-control attestation and approved supported image/command. This trusted fixture harness does not bypass that gate for real repositories. Connected worker/Auth crash/restart remains a separate gate; orphan CLI recovery is not worker-crash proof.

```powershell
# Default: pure approval/package check; Docker operations=0
node --require ./tests/auth/skip-dotenv.cjs --import tsx tests/guard/g01/docker.acceptance.ts
# ONLY AFTER exact plan approval is recorded in the ignored operator file:
node --require ./tests/auth/skip-dotenv.cjs --import tsx tests/guard/g01/docker.acceptance.ts --run="C:/laragon/www/wetscan-2/wetscan-guard-g01-s03-candidate/.local/sentinel/guard-g01-unblock/sandbox-approval.f31fa008-6766-4be7-99a7-51445b6cb3e4.json"
```

Docker request: pull ONLY that digest (linux/amd64), create/start/inspect the six new plan-bound containers, stop/remove only those verified-owned containers for cleanup. Same60-minute window from explicit approval. Atomic `.used` reservation makes this one attempt, including failed setup; do not erase it to retry. Expiry stops new pull/create/start; owned cleanup remains mandatory. No image deletion/prune, unrelated resource inspection, network creation, Docker settings change, or production worker is included.

## Attempt1 outcome / attempt2 awaiting approval

Attempt1 (`1eb47093e02bf6fbd5c3bb67ec4f462f28cd82df27b86a4948a9c3a4e39748b4`) failed on daemon version metadata because the approved pipe was absent. No image pull, container creation or source fixture occurred. Its approval, `.used`, result and original plan are retained. Engine subsequently reverified with the same daemon ID/version/kernel. Attempt2 changes only run UUID, names/source root and per-run approval filename handling; image/operations/limits are unchanged. It requires approval of the new exact plan hash above. No consumed attempt is erased or silently reused.
