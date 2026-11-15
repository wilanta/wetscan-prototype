-- NOT included in requested migrate-up permission. No row deletion, no CASCADE, no database/role drop.
BEGIN;
DO $target$ BEGIN IF current_database()<>'wetscan_s01_test_guardg01' OR current_user<>'postgres' OR inet_server_port() IS DISTINCT FROM 5432 OR NOT COALESCE(inet_server_addr() IN('127.0.0.1'::inet,'::1'::inet),false) OR current_setting('server_version_num')::int<>180006 OR shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') IS DISTINCT FROM 'wetscan-s01:aa8b15a6-7ed3-4f19-81f0-07d9759ec62f' OR (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database())<>'wetscan_guard_migrator' THEN RAISE EXCEPTION 'guard_g01_target_denied'; END IF; END $target$;
SET LOCAL ROLE wetscan_guard_migrator;
SELECT pg_advisory_xact_lock(7342002);
-- PROPOSAL ONLY. Never CASCADE; refuse all retained scan/evidence metadata.
LOCK TABLE guard.scans IN ACCESS EXCLUSIVE MODE;
DO $rollback$ BEGIN
 IF EXISTS(SELECT 1 FROM guard.scans) OR EXISTS(SELECT 1 FROM platform.jobs WHERE module='guard') OR EXISTS(SELECT 1 FROM platform.worker_heartbeats WHERE module='guard' AND status<>'stopped') THEN
  RAISE EXCEPTION 'guard_rollback_requires_empty_inactive_scope';
 END IF;
END $rollback$;
DROP FUNCTION guard.pending_scopes(text,text),guard.active_lease_count(text);
DROP TABLE guard.scans;
DROP TABLE guard.schema_migrations;
DROP SCHEMA guard;

SET LOCAL ROLE wetscan_migrator;
-- REVIEW ONLY: platform owner, exact target/plan approval, all Guard jobs empty and workers stopped.
DO $guard_rollback$ BEGIN
 IF to_regnamespace('guard') IS NOT NULL OR EXISTS(SELECT 1 FROM platform.jobs WHERE module='guard') OR EXISTS(SELECT 1 FROM platform.worker_heartbeats WHERE module='guard') THEN
  RAISE EXCEPTION 'guard_rollback_requires_empty_inactive_module';
 END IF;
END $guard_rollback$;
DROP POLICY guard_boundary ON platform.jobs;
DROP POLICY guard_boundary ON platform.job_attempts;
DROP POLICY guard_boundary ON platform.notification_outbox;
DROP POLICY guard_boundary ON platform.module_limits;
DROP POLICY guard_boundary ON platform.worker_heartbeats;
DROP POLICY guard_owner_read ON platform.jobs;
DROP POLICY guard_owner_read ON platform.worker_heartbeats;
DELETE FROM platform.module_limits WHERE module='guard';
REVOKE ALL ON platform.jobs,platform.job_attempts,platform.notification_outbox,platform.module_limits,platform.worker_heartbeats,platform.schema_migrations FROM wetscan_guard_app,wetscan_guard_worker,wetscan_guard_migrator;
REVOKE USAGE ON SCHEMA platform FROM wetscan_guard_app,wetscan_guard_worker,wetscan_guard_migrator;
-- Role removal/password lifecycle is a separate operator decision; no Sentinel role is changed.

COMMIT;
