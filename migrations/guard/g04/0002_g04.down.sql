-- Refuses to run over retained G04 data. Never CASCADE.
LOCK TABLE guard.g04_policies,guard.g04_triggers,guard.g04_evaluations,guard.g04_check_runs,guard.g04_deployments,guard.g04_schedules,guard.g04_deliveries,guard.g04_audit,guard.g04_provider_mappings,guard.g04_policy_revisions IN ACCESS EXCLUSIVE MODE;
DO $rollback$ BEGIN
 IF EXISTS(SELECT 1 FROM guard.g04_policies) OR EXISTS(SELECT 1 FROM guard.g04_triggers) OR EXISTS(SELECT 1 FROM guard.g04_evaluations) OR EXISTS(SELECT 1 FROM guard.g04_check_runs)
  OR EXISTS(SELECT 1 FROM guard.g04_deployments) OR EXISTS(SELECT 1 FROM guard.g04_schedules) OR EXISTS(SELECT 1 FROM guard.g04_deliveries) OR EXISTS(SELECT 1 FROM guard.g04_audit)
  OR EXISTS(SELECT 1 FROM guard.g04_provider_mappings) OR EXISTS(SELECT 1 FROM guard.g04_policy_revisions) THEN RAISE EXCEPTION 'g04_rollback_requires_empty_tables'; END IF;
END $rollback$;
DROP FUNCTION guard.g04_route(text),guard.g04_installation_scopes(bigint),guard.g04_work(integer);
DROP TABLE guard.g04_schedules,guard.g04_deployments,guard.g04_provider_mappings,guard.g04_check_runs,guard.g04_evaluations,guard.g04_triggers,guard.g04_audit,guard.g04_deliveries,guard.g04_policy_revisions,guard.g04_policies;
DROP TABLE guard.g04_schema_migrations;
