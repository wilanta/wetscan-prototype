-- Runner holds an advisory lock and requires all runtime tables to be EMPTY first.
-- No CASCADE: later module dependencies prevent rollback rather than being deleted.
DROP TABLE platform.notification_attempts;
DROP TABLE platform.notification_outbox;
DROP TABLE platform.job_attempts;
DROP TABLE platform.jobs;
DROP TABLE platform.worker_heartbeats;
DROP TABLE platform.module_limits;
DROP TABLE sentinel.project_bindings;
DROP SCHEMA sentinel;
-- Runner removes this version from the ledger and, only for version zero, removes its own empty ledger/schema.
