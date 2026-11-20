DO $down$
DECLARE
  t text;
  occupied boolean;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'g05_audit',
    'g05_reports',
    'g05_findings',
    'g05_case_results',
    'g05_runs',
    'g05_test_plans',
    'g05_workflow_imports',
    'g05_trust_plans',
    'g05_test_accounts',
    'g05_execution_grants',
    'g05_target_revisions',
    'g05_targets'
  ] LOOP
    IF to_regclass('guard.' || t) IS NOT NULL THEN
      EXECUTE format('SELECT EXISTS(SELECT 1 FROM guard.%I LIMIT 1)', t) INTO occupied;
      IF occupied THEN
        RAISE EXCEPTION 'g05_refuses_rollback_over_retained_rows';
      END IF;
    END IF;
  END LOOP;
END $down$;

DROP FUNCTION IF EXISTS guard.g05_pending_scopes(integer);
DROP TABLE IF EXISTS guard.g05_audit;
DROP TABLE IF EXISTS guard.g05_reports;
DROP TABLE IF EXISTS guard.g05_findings;
DROP TABLE IF EXISTS guard.g05_case_results;
DROP TABLE IF EXISTS guard.g05_runs;
DROP TABLE IF EXISTS guard.g05_test_plans;
DROP TABLE IF EXISTS guard.g05_workflow_imports;
DROP TABLE IF EXISTS guard.g05_trust_plans;
DROP TABLE IF EXISTS guard.g05_test_accounts;
DROP TABLE IF EXISTS guard.g05_execution_grants;
DROP TABLE IF EXISTS guard.g05_target_revisions;
DROP TABLE IF EXISTS guard.g05_targets;
DROP TABLE IF EXISTS guard.g05_schema_migrations;
