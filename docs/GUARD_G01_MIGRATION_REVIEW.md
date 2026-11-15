# G01 proposed migration and privilege review

## Current finalization status - 15 November 2026

See [GUARD_G01_FINALIZATION.md](GUARD_G01_FINALIZATION.md) for the current audit, implementation, test results and exact remaining approval checklist. Overall **PARTIALLY COMPLETE**, real acceptance **BLOCKED**. Latest user explicitly authorizes candidate commit/push despite the known baseline Sentinel failure; the earlier publication hold below is historical and superseded. No Sentinel fix/assertion edit, G02, real SQL/provider/worker/container operation, merge or deploy is performed. Current old Guard HEAD is92ee6fa, preserved; do not restore historical7207a16 state. New producer is prepare_only, lease getter is now forwarded, snapshot request mismatch/concurrency and sandbox identity/evidence boundaries are fixed; earlier descriptions of missing implementations describe their historical phase.


## Actual candidate plan - 15 November 2026

New candidate based onf7bfeef includes0003_detection. Running its actual node --import tsx worker/guard/plan.ts produced Guard aggregate b63e1e8568babcf8d7811fe0fa735ecbec11ade64df19bdea78deb030a85869d and platformc3e39f6fd43ee6eb2fbf5b244778955aab4cabb8a11ed3c66d791cf99a252a94. [JSON artifact](GUARD_G01_S03_MIGRATION_PLAN.json) records all exact versions/checksums and unchanged five Guard artifact hashes. Guard0001pair8bdea256... is unchanged. No SQL change/schema application/DB connection; approval NOT_GRANTED.

The old444596... plan below belongs to the preserved old Guard baseline, not this candidate. A compatibility test rejects that old aggregate before migration connection. Exact target/actions/roles/expiry and S03-aware preservation approvals remain required. Publication is also held by the user after an unchanged Sentinel browser gate failed; see [integration validation](GUARD_G01_S03_INTEGRATION_VALIDATION.md). Do not infer permission from source hashes or attempt a Sentinel downgrade.


## Static S03 candidate hash - 15 November 2026

[Baseline review](GUARD_G01_S03_BASELINE_REVIEW.md) reproduces old and candidate hashes directly from reviewed Git SQL blobs, with zero DB connections. Unchanged five Guard files + exactf7bfeef three-version platform plan yield candidate aggregate b63e1e8568babcf8d7811fe0fa735ecbec11ade64df19bdea78deb030a85869d. Platform plan:c3e39f6fd43ee6eb2fbf5b244778955aab4cabb8a11ed3c66d791cf99a252a94;0003pair:4f0ee1cebdbdc81b835f719ef13c9cb703dfb5f440193765dfa0a61635fb6168. Guard0001pair8bdea256... and all file hashes below stay unchanged; no Guard schema-version bump/SQL edit is required solely for S03.

This preview does not replace the current local444596... executable plan or grant permission. After owner-authorized candidate creation/alignment, reproduce the actual plan, review combined behavior and obtain fresh exact-target/purpose/action/hash approval. Preserve exact ledger validation; no Sentinel downgrade, populated DB reset or ledger edit to force a match. No migration/runtime/database operation occurred.


## Current baseline warning - 15 November 2026

No SQL file or Guard SQL hash changed in the resolver/launcher continuation, and no DB connection/mutation occurred. Exact launch, app-role and worker-role target/action approvals remain ungranted; Wil's general implementation approval does not supply them. Expected target is checked before credential loading in the new launcher path.

**Master has advanced externally to S03/f7bfeef and includes0003_detection.** The aggregate and two-version platform ledger below are valid only for isolated Guard HEAD7207a16. Do not authorize/apply that old plan to an S03 target. Owner instruction for baseline alignment, shared compatibility review, regenerated aggregate/ledger and fresh exact-target approval are required first. Nothing is rebased/merged or changed in shared migration files. See GUARD_G01_WORKER_AUTH_REVIEW.md.


15 November 2026. Status: PREPARATION_ONLY / BLOCKED_BY_APPROVAL. No PostgreSQL connection, database/role creation, migration, reset, down, runtime activation or historical Sentinel acceptance suite was run.

## Exact reviewed plan

Read-only command: `node --import tsx worker/guard/plan.ts` from the G01 worktree. SQL is UTF-8, normalized to LF before hashing. Pair checksum is SHA-256(up + NUL + down); aggregate binds ordered artifact names/hashes plus the existing platform plan hash. Any SQL/platform change invalidates approval.

- Guard aggregate: `444596c4628d94f0824f98afcc960148662f55c691155e1092e0a11698101dfc`
- Guard up/down pair: `8bdea256cdd5ab79b1525f43bd40508acf25e57502a72162ae6b5233dd55693b`
- Existing platform aggregate: `9ceabe57b696fbe59bd51fb5939a197a378abed9c3084802850c4e9d632270f9`
- Existing platform ledger: 0001_foundation (`dd061a60b123284882f154c438de3a171d60967b7b07a4e07200b6693f4eb778`), 0002_telemetry (`d1b67dc680f5bf3c2cbe585dca2427abf9d7ba9f29479c69b851f66b91c1f5a3`). These files and ledger are not modified.

| Guard-owned artifact | SHA-256 |
| --- | --- |
| `roles.proposed.sql` | `a0a4d924d8bd15ceb708f47ad9efff7e10df46ce0d99ff5c91a15077c6081645` |
| `platform-access.proposed.sql` | `1aa2d83eaba396d645e1ba684819a8999ab60eea49fb0bfc656eb175c5f7fb2d` |
| `platform-access.rollback.proposed.sql` | `d4025c6965fa1c23eac358d341a9bc51013090471e9403fcb22a08bd4332d52c` |
| `0001_guard.up.sql` | `542fa52a97c2b498b01ea06613a589c284e254ecd6de863574327d9780e18315` |
| `0001_guard.down.sql` | `9e7b7f8f5b1f5bea5b53f9c8865695d20dfbf09769086e505bb3d1329edee3b3` |

## Roles and expected changes

New roles: wetscan_guard_app, wetscan_guard_worker, wetscan_guard_migrator, all NOSUPERUSER/NOBYPASSRLS/NOCREATEDB/NOCREATEROLE. Credentials are provisioned by the operator outside Git/chat. No role memberships or Sentinel rights are requested. The bootstrap operator separately grants CONNECT and migrator CREATE on the exact approved database; runtime roles never receive migration/admin credentials.

The proposed platform extension adds Guard-only policies/grants to jobs, attempts, outbox, module_limits, heartbeats and read-only platform ledger. It adds one Guard budget row (max_running=1), never updates Sentinel rows or removes/rewrites Sentinel policies. Roles/policies/budget collision is an error, intentionally not silently reconciled. This is a shared platform security extension requiring platform-owner review before application. Existing global PUBLIC privileges and role memberships must also be audited by that owner; static SQL tests cannot prove the resulting effective privileges.

The Guard schema owns its independent ledger and scans table. FORCE RLS checks live mode + guard module + workspace/project GUCs + runtime role. Denormalized identities/status must match JSON. Unique scoped idempotency, immutable fingerprints, CAS/revision and active lease locks protect writes. Metadata/evidence reference bounds: 512,000-byte job, 1,000 findings/audit entries, 20 evidence references/finding, 2,000,000-byte coverage. Access expires at 30 days. Raw source/credential persistence is forbidden. There is no physical encrypted evidence object store or automated retention purge yet.

Two SECURITY DEFINER functions have fixed search_path and revoked PUBLIC execute. pending_scopes exposes max100 Guard scope keys per page, not jobs; active_lease_count returns only Guard aggregate occupancy. The owner read policies apply only to the Guard migrator and Guard rows, not Sentinel. Security-definer privileges, cross-role access and concurrency still require actual PostgreSQL acceptance.

## Target and approval gate

No exact target/port/marker is currently approved or connected. Recommended acceptance target is a NEW disposable `wetscan_s01_test_guardg01` on loopback, PostgreSQL>=17, with a freshly verified `wetscan-s01:<operator-supplied UUID>` database comment marker. Do not reuse/reset the populated historical `wetscan_s01_test` or its previous approvals. The parser also permits wetscan_dev_guardg01/wetscan_dev, but these require separate new exact-target authorization and preservation review; the acceptance script refuses them.

Before any database operation obtain written authorization containing:

1. Operator/environment, exact host, port, database and marker; authorization to create a fresh target if needed (no implicit CREATE DATABASE approval).
2. The five exact artifact hashes and aggregate above; reviewed existing platform baseline.
3. Explicit role bootstrap/platform-owner extension/schema-up operations and separate purpose-specific app/worker runtime+integration_test permissions; approver/time/expiry.
4. No updates/deletes/reset of Sentinel or historical populated targets; owner-provided read-only before/after preservation observer for Sentinel schema/rows/ledger/module limits.
5. Stop criteria, verification and rollback plan. No destructive reset as a test remedy.

A future Guard approval JSON extends the existing platform shape with module=guard, purpose=app|worker|migration, role as above and expiresAt. Required existing fields: schemaVersion=1, status=APPROVED, approvedBy, approvedAt, exact target {host,port,database,marker}, actions (migration: migrate_up; acceptance app/worker: runtime+integration_test), migrationPlanSha256 equal to Guard aggregate. Values must be provided/approved by the operator, never invented by an agent. JSON itself is not authorization without the user's explicit instruction.

Runtime file-path configuration (names only, no values supplied): GUARD_DB_APP_APPROVAL_FILE / GUARD_DB_APP_PASSWORD_FILE, corresponding WORKER and MIGRATION pairs; absolute paths, separate Guard-only credentials. GUARD_LIVE_READ_ENABLED remains off. No Sentinel credential/approval is consumed. No .env or secret was inspected during this work.

## Application, idempotence and rollback plan (NOT EXECUTED)

After target/platform-owner approval, a reviewed bootstrap establishes roles and Guard-only platform extension on the fresh existing approved platform baseline. applyGuardSchema reuses the existing SQL pool/transaction contract, checks exact target/role/marker and platform ledger, takes transaction advisory lock7342002, creates Guard schema once, and records only guard.schema_migrations. Same version/checksum is a no-op; unexpected schema/ledger/plan is rejected. Role/extension bootstrap is not auto-run by this function or the app. Actual SQL parsing/migration behavior is not yet verified by PostgreSQL.

Run the Guard-specific acceptance script only after explicit approval and correct provisioning: `node --import tsx tests/guard/g01/postgres.acceptance.ts`, with GUARD_POSTGRES_ACCEPTANCE=1 and the purpose-specific approvals. It tests real scoped app/worker access, idempotence, atomic rollback, competing leases, expired ownership, cancellation and persistence across new pool instances; it retains synthetic rows. It does not constitute full Sentinel before/after preservation or full connected-worker crash acceptance; operator observer and follow-up tests are still required.

Rollback is a separately approved operation, not automatic error recovery. Stop only Guard workers/read activation, verify no live Guard leases/heartbeats and retain evidence. 0001_guard.down refuses any retained Guard scan/queue rows, uses no CASCADE, and drops only an empty Guard schema. platform-access.rollback separately runs as platform owner after Guard schema removal and refuses Guard jobs/active workers before revoking only Guard grants/policies/empty budget. Roles are not auto-dropped. Retained evidence/jobs mean rollback is BLOCKED rather than deleting data. Database transaction rollback on failed schema-up is covered only by SQL doubles so far.
