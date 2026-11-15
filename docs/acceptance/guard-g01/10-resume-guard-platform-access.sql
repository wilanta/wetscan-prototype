BEGIN;
DO $target$ BEGIN IF current_database()<>'wetscan_s01_test_guardg01' OR current_user<>'postgres' OR inet_server_port() IS DISTINCT FROM 5432 OR NOT COALESCE(inet_server_addr() IN('127.0.0.1'::inet,'::1'::inet),false) OR current_setting('server_version_num')::int<>180006 OR shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') IS DISTINCT FROM 'wetscan-s01:aa8b15a6-7ed3-4f19-81f0-07d9759ec62f' OR (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database())<>'wetscan_guard_migrator' THEN RAISE EXCEPTION 'guard_g01_target_denied'; END IF; END $target$;
DO $resume$ BEGIN
 IF to_regnamespace('guard') IS NOT NULL
 OR EXISTS(SELECT 1 FROM platform.module_limits WHERE module='guard')
 OR EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='platform' AND policyname IN('guard_boundary','guard_owner_read'))
 OR has_schema_privilege('wetscan_guard_app','platform','USAGE')
 OR NOT(SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
 THEN RAISE EXCEPTION 'guard_g01_resume_requires_rolled_back_step07'; END IF;
 IF (SELECT count(*) FROM platform.schema_migrations)<>3 THEN RAISE EXCEPTION 'guard_g01_platform_ledger_mismatch'; END IF;
END $resume$;
SET LOCAL ROLE wetscan_migrator;
SELECT pg_advisory_xact_lock(7342002);
-- REVIEW/APPLY SEPARATELY AS PLATFORM OWNER. Does not alter existing Sentinel policies or rows.
GRANT USAGE ON SCHEMA platform TO wetscan_guard_app,wetscan_guard_worker,wetscan_guard_migrator;
GRANT SELECT ON platform.schema_migrations TO wetscan_guard_app,wetscan_guard_worker,wetscan_guard_migrator;
GRANT SELECT,INSERT,UPDATE ON platform.jobs TO wetscan_guard_app,wetscan_guard_worker;
GRANT SELECT,UPDATE(outcome,finished_at) ON platform.job_attempts TO wetscan_guard_app;
GRANT SELECT,INSERT,UPDATE ON platform.job_attempts TO wetscan_guard_worker;
GRANT SELECT,UPDATE ON platform.notification_outbox TO wetscan_guard_app,wetscan_guard_worker;
GRANT SELECT ON platform.module_limits TO wetscan_guard_app;
GRANT SELECT,UPDATE(module) ON platform.module_limits TO wetscan_guard_worker;
GRANT SELECT,INSERT,UPDATE ON platform.worker_heartbeats TO wetscan_guard_worker;
DO $guard_policies$
DECLARE table_name text;
BEGIN
 FOREACH table_name IN ARRAY ARRAY['jobs','job_attempts','notification_outbox'] LOOP
  EXECUTE format($policy$CREATE POLICY guard_boundary ON platform.%I USING(
   module='guard' AND mode='live' AND current_setting('wetscan.module',true)='guard' AND current_user IN('wetscan_guard_app','wetscan_guard_worker')
   AND mode=current_setting('wetscan.mode',true) AND workspace_id=current_setting('wetscan.workspace',true) AND project_id=current_setting('wetscan.project',true)
  ) WITH CHECK(module='guard' AND mode='live' AND current_setting('wetscan.module',true)='guard' AND current_user IN('wetscan_guard_app','wetscan_guard_worker')
   AND mode=current_setting('wetscan.mode',true) AND workspace_id=current_setting('wetscan.workspace',true) AND project_id=current_setting('wetscan.project',true))$policy$,table_name);
 END LOOP;
 FOREACH table_name IN ARRAY ARRAY['module_limits','worker_heartbeats'] LOOP
  EXECUTE format($policy$CREATE POLICY guard_boundary ON platform.%I USING(module='guard' AND current_setting('wetscan.module',true)='guard' AND current_user IN('wetscan_guard_app','wetscan_guard_worker')) WITH CHECK(module='guard' AND current_setting('wetscan.module',true)='guard' AND current_user='wetscan_guard_worker')$policy$,table_name);
 END LOOP;
END $guard_policies$;
-- Separate module budget; never update the Sentinel budget.
-- FORCE RLS also constrains the table owner. Bootstrap ONLY this exact new Guard budget as the approved operator.
RESET ROLE;
INSERT INTO platform.module_limits(module,max_running) VALUES('guard',1);
SET LOCAL ROLE wetscan_migrator;

GRANT SELECT ON platform.jobs,platform.worker_heartbeats TO wetscan_guard_migrator;
CREATE POLICY guard_owner_read ON platform.jobs FOR SELECT USING(module='guard' AND current_user='wetscan_guard_migrator');
CREATE POLICY guard_owner_read ON platform.worker_heartbeats FOR SELECT USING(module='guard' AND current_user='wetscan_guard_migrator');

COMMIT;
