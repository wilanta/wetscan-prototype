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
