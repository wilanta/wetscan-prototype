-- The runner refuses this down migration when any notification row exists (see applyMigrations).
DROP POLICY notifier_scope ON sentinel.project_bindings;
DROP POLICY notifier_lock ON platform.module_limits;
DROP POLICY notifier_read ON platform.module_limits;
DROP POLICY notifier_scope ON platform.job_attempts;
DROP POLICY notifier_scope ON platform.notification_attempts;
DROP POLICY notifier_scope ON platform.notification_outbox;
DROP POLICY notifier_scope ON platform.jobs;
DROP TABLE sentinel.notification_audit;
DROP TABLE sentinel.notification_deliveries;
DROP TABLE sentinel.notification_channels;
REVOKE ALL ON platform.jobs,platform.notification_outbox,platform.notification_attempts,platform.job_attempts,platform.module_limits,platform.schema_migrations FROM wetscan_sentinel_notifier;
REVOKE ALL ON sentinel.project_bindings FROM wetscan_sentinel_notifier;
REVOKE USAGE ON SCHEMA platform,sentinel FROM wetscan_sentinel_notifier;
