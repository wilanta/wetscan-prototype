# Plan 4 - fixture preservation and safe schema lifecycle

## Exact scope supplied by owner

Only existing localhost:5432/wetscan_s01_test_guardg01, owner wetscan_guard_migrator, known full marker and normal pgAdmin are identified. It is a G01 fixture, not an external Sentinel database. External Sentinel is NOT_VERIFIED / TARGET_NOT_IDENTIFIED. Do not probe historical127.0.0.1:55432, create a new DB, mutate Sentinel or relabel the fixture. [Owner scope record](owner-scope-record.json) is the evidence for this limitation; it is not an endpoint-outage test or an acceptance waiver.

Existing actual SQL18 proof already covers post-positive-run preservation: baseline/final45e7cfe26767e26ad96ceda0dd2a53649a10ea7a5453844ac50ee30867e1095d, differences[],3 retained Guard scans/0active leases, unchanged Sentinel projection/catalog/roles/policies/grants/budget. Reuse it. Each newly approved phase captures an actual same-projection pre/post comparison plus exact projection of the three retained old Guard rows and existing platform ledger. Approved new case Guard rows/attempts/heartbeats are the only expected additions and stay retained. Do not hide a difference by excluding new sections or changing the baseline.

## L01: uncovered real up/up idempotence, no DDL

One historical actual apply is already proven. To close the live already_applied branch, propose exactly one invocation of existing applyGuardSchema with actual Guard/platform ledger hashes on a dedicated migration-purpose connection. Before calling, assert both matching ledgers/schema exist; force that session's default_transaction_read_only=on so its own BEGIN cannot create/alter a schema even if a preflight race occurs. No global role/config change. Expect already_applied and no catalog/ledger/fixture hash difference. Close the dedicated session afterward. A missing/mismatched ledger fails before invocation; do not run bootstrap/up as recovery.

This wrapper/helper and migration-purpose credential availability are not yet verified. Do not substitute app/worker credentials for migrator or display a password. Owner may provision only through the existing purpose mechanism after a new narrow approval, without .env/password reset. Runner code/hash and exact read-only property must be reviewed before asking final execution approval. [L01 intent](approval-intents/L01.json) does not authorize ordinary migrate_up or any DDL.

## L02: retained-data refusal guard only

[Prepared SQL](operator/retained-data-down-refusal.READONLY.sql) is a target-checked READ ONLY transaction for normal existing pgAdmin. It evaluates the canonical down's refusal predicate under the Guard migrator role. With retained rows it must raise SQLSTATEP0001 guard_rollback_requires_empty_inactive_scope. Run [ROLLBACK](operator/rollback-only.sql) separately after capturing the safe error and pre/post projection. The script deliberately contains no DROP/DELETE/CREATE/ALTER; unexpected empty scope also raises and never proceeds to down. This tests real SQL guard evaluation, not exclusive-lock/drop semantics or a successful schema-down cycle. [L02 review step](approval-intents/L02.json) has not run. Because it is READ ONLY, no new runtime-mutation permission or permit activation is required; normal owner execution and actual result evidence are still needed.

## Full down/re-up/recovery decision

Canonical down refuses retained scans/jobs; three actual scans are present. The owner prohibits additional DB creation, fixture deletion, Sentinel mutation/reset and unapproved runtime mutation. Therefore successful down/up/cold-bootstrap recovery is BLOCKED_BY_PRESERVATION_CONSTRAINT under current scope. Do not drop populated tables inside a transaction as a workaround, delete rows to satisfy the guard, relax FORCE RLS, use CASCADE, change ledgers or create an alternate DB. This constraint is explicit and supported by actual retained-row evidence and canonical code; no destructive attempt is needed to prove it.

Preservation/refusal may pass while full down remains unproven. Ask the owner for an acceptance decision on that limitation only after the safe evidence is recorded; never count it as a PASS or automatically mark G01 COMPLETE. Any later changed scope would need separate explicit authorization and a newly bound packet, not use this plan to create a database. External target identification likewise remains a separately documented limitation until the owner supplies an actual authorized target.
