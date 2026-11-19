-- PREPARED ONLY. Existing pgAdmin operator, exact G01 fixture. Never run destructive down here.
-- READ ONLY refusal predicate extracted from canonical down; no DROP/DELETE/CREATE/ALTER statements.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
DO $target$
BEGIN
 IF current_database()<>'wetscan_s01_test_guardg01' OR current_user<>'postgres'
 OR inet_server_port() IS DISTINCT FROM 5432
 OR NOT COALESCE(inet_server_addr() IN ('127.0.0.1'::inet,'::1'::inet),false)
 OR current_setting('server_version_num')::int<>180006
 OR shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') IS DISTINCT FROM 'wetscan-s01:aa8b15a6-7ed3-4f19-81f0-07d9759ec62f'
 OR (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database())<>'wetscan_guard_migrator'
 THEN RAISE EXCEPTION 'guard_g01_target_denied'; END IF;
END $target$;
SET LOCAL ROLE wetscan_guard_migrator;
DO $rollback$
BEGIN
 IF EXISTS(SELECT 1 FROM guard.scans)
 OR EXISTS(SELECT 1 FROM platform.jobs WHERE module='guard')
 OR EXISTS(SELECT 1 FROM platform.worker_heartbeats WHERE module='guard' AND status<>'stopped')
 THEN RAISE EXCEPTION 'guard_rollback_requires_empty_inactive_scope'; END IF;
 RAISE EXCEPTION 'unexpected_empty_scope_stop_no_down_authorized';
END $rollback$;
-- EXPECT SQLSTATE P0001 guard_rollback_requires_empty_inactive_scope with retained rows.
-- The error leaves an aborted READ ONLY transaction: run operator/rollback-only.sql separately.
