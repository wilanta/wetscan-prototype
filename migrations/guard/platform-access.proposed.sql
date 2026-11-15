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
INSERT INTO platform.module_limits(module,max_running) VALUES('guard',1);

GRANT SELECT ON platform.jobs,platform.worker_heartbeats TO wetscan_guard_migrator;
CREATE POLICY guard_owner_read ON platform.jobs FOR SELECT USING(module='guard' AND current_user='wetscan_guard_migrator');
CREATE POLICY guard_owner_read ON platform.worker_heartbeats FOR SELECT USING(module='guard' AND current_user='wetscan_guard_migrator');
