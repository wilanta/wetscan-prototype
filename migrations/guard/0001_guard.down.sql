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
