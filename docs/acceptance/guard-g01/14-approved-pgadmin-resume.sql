-- pgAdmin wrapper: approved resume SQL unchanged; additional READ ONLY preservation instrumentation.
-- Source resume bundle fab43564e7c93293fa7d1149b7da980a33e7a526974e53e46772d98c695a3bfb.
-- Exact G01 target, expiry19:59WIB. No bootstrap, down, reset, password or marker removal.

-- Part: 11-resume-readonly-preflight.sql
BEGIN READ ONLY;
DO $target$ BEGIN IF clock_timestamp()>='2026-11-15T12:59:00+00:00'::timestamptz OR current_database()<>'wetscan_s01_test_guardg01' OR current_user<>'postgres' OR inet_server_port() IS DISTINCT FROM 5432 OR NOT COALESCE(inet_server_addr() IN('127.0.0.1'::inet,'::1'::inet),false) OR current_setting('server_version_num')::int<>180006 OR shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') IS DISTINCT FROM 'wetscan-s01:aa8b15a6-7ed3-4f19-81f0-07d9759ec62f' OR (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database())<>'wetscan_guard_migrator' THEN RAISE EXCEPTION 'guard_g01_target_denied'; END IF; END $target$;
DO $resume$ BEGIN
 IF to_regnamespace('guard') IS NOT NULL
 OR EXISTS(SELECT 1 FROM platform.module_limits WHERE module='guard')
 OR EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='platform' AND policyname IN('guard_boundary','guard_owner_read'))
 OR has_schema_privilege('wetscan_guard_app','platform','USAGE')
 OR NOT(SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
 THEN RAISE EXCEPTION 'guard_g01_resume_requires_rolled_back_step07'; END IF;
 IF (SELECT count(*) FROM platform.schema_migrations)<>3 THEN RAISE EXCEPTION 'guard_g01_platform_ledger_mismatch'; END IF;
END $resume$;
SELECT current_database(),current_user,shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') AS marker;
SELECT version,checksum FROM platform.schema_migrations ORDER BY version;
SELECT module,max_running FROM platform.module_limits ORDER BY module;
ROLLBACK;


-- Part: 15-session-readonly-observer-before.sql
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
DO $target$ BEGIN IF clock_timestamp()>='2026-11-15T12:59:00+00:00'::timestamptz OR current_database()<>'wetscan_s01_test_guardg01' OR current_user<>'postgres' OR inet_server_port() IS DISTINCT FROM 5432 OR NOT COALESCE(inet_server_addr() IN('127.0.0.1'::inet,'::1'::inet),false) OR current_setting('server_version_num')::int<>180006 OR shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') IS DISTINCT FROM 'wetscan-s01:aa8b15a6-7ed3-4f19-81f0-07d9759ec62f' OR (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database())<>'wetscan_guard_migrator' THEN RAISE EXCEPTION 'guard_g01_target_denied'; END IF; END $target$;
SET LOCAL row_security=off;
WITH data_rows AS (
SELECT 'sentinel.detection_alerts' AS relation,count(*)::bigint AS rows,encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') AS sha256 FROM sentinel.detection_alerts t
UNION ALL
SELECT 'sentinel.detection_audit' AS relation,count(*)::bigint AS rows,encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') AS sha256 FROM sentinel.detection_audit t
UNION ALL
SELECT 'sentinel.detection_cooldowns' AS relation,count(*)::bigint AS rows,encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') AS sha256 FROM sentinel.detection_cooldowns t
UNION ALL
SELECT 'sentinel.detection_evaluations' AS relation,count(*)::bigint AS rows,encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') AS sha256 FROM sentinel.detection_evaluations t
UNION ALL
SELECT 'sentinel.detection_evidence' AS relation,count(*)::bigint AS rows,encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') AS sha256 FROM sentinel.detection_evidence t
UNION ALL
SELECT 'sentinel.detection_rule_versions' AS relation,count(*)::bigint AS rows,encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') AS sha256 FROM sentinel.detection_rule_versions t
UNION ALL
SELECT 'sentinel.detection_rules' AS relation,count(*)::bigint AS rows,encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') AS sha256 FROM sentinel.detection_rules t
UNION ALL
SELECT 'sentinel.detection_suppressed_evidence' AS relation,count(*)::bigint AS rows,encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') AS sha256 FROM sentinel.detection_suppressed_evidence t
UNION ALL
SELECT 'sentinel.project_bindings' AS relation,count(*)::bigint AS rows,encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') AS sha256 FROM sentinel.project_bindings t
UNION ALL
SELECT 'sentinel.telemetry_batches' AS relation,count(*)::bigint AS rows,encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') AS sha256 FROM sentinel.telemetry_batches t
UNION ALL
SELECT 'sentinel.telemetry_credentials' AS relation,count(*)::bigint AS rows,encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') AS sha256 FROM sentinel.telemetry_credentials t
UNION ALL
SELECT 'sentinel.telemetry_events' AS relation,count(*)::bigint AS rows,encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') AS sha256 FROM sentinel.telemetry_events t
UNION ALL
SELECT 'sentinel.telemetry_sources' AS relation,count(*)::bigint AS rows,encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') AS sha256 FROM sentinel.telemetry_sources t
UNION ALL
SELECT 'platform.schema_migrations' AS relation,count(*)::bigint AS rows,encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') AS sha256 FROM platform.schema_migrations t
UNION ALL
SELECT 'platform.jobs' AS relation,count(*)::bigint AS rows,encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') AS sha256 FROM platform.jobs t WHERE module='sentinel'
UNION ALL
SELECT 'platform.job_attempts' AS relation,count(*)::bigint AS rows,encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') AS sha256 FROM platform.job_attempts t WHERE module='sentinel'
UNION ALL
SELECT 'platform.notification_outbox' AS relation,count(*)::bigint AS rows,encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') AS sha256 FROM platform.notification_outbox t WHERE module='sentinel'
UNION ALL
SELECT 'platform.notification_attempts' AS relation,count(*)::bigint AS rows,encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') AS sha256 FROM platform.notification_attempts t WHERE module='sentinel'
UNION ALL
SELECT 'platform.worker_heartbeats' AS relation,count(*)::bigint AS rows,encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') AS sha256 FROM platform.worker_heartbeats t WHERE module='sentinel'
UNION ALL
SELECT 'platform.module_limits' AS relation,count(*)::bigint AS rows,encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') AS sha256 FROM platform.module_limits t WHERE module='sentinel'
), signature AS (SELECT jsonb_build_object(
'data',(SELECT jsonb_agg(to_jsonb(t) ORDER BY relation) FROM data_rows t),
'relations',(SELECT jsonb_agg(to_jsonb(t) ORDER BY nspname,relname) FROM (SELECT n.nspname,c.relname,c.relkind,pg_get_userbyid(c.relowner) AS owner,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('sentinel','platform') AND c.relkind IN('r','p','v','S')) t),
'columns',(SELECT jsonb_agg(to_jsonb(t) ORDER BY table_schema,table_name,ordinal_position) FROM (SELECT table_schema,table_name,column_name,ordinal_position,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema IN('sentinel','platform')) t),
'constraints',(SELECT jsonb_agg(to_jsonb(t) ORDER BY nspname,relname,conname) FROM (SELECT n.nspname,c.relname,k.conname,pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('sentinel','platform')) t),
'indexes',(SELECT jsonb_agg(to_jsonb(t) ORDER BY schemaname,tablename,indexname) FROM (SELECT schemaname,tablename,indexname,indexdef FROM pg_indexes WHERE schemaname IN('sentinel','platform')) t),
'policies',(SELECT jsonb_agg(to_jsonb(t) ORDER BY schemaname,tablename,policyname) FROM (SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname IN('sentinel','platform') AND NOT(schemaname='platform' AND policyname IN('guard_boundary','guard_owner_read'))) t),
'grants',(SELECT jsonb_agg(to_jsonb(t) ORDER BY table_schema,table_name,grantee,privilege_type,is_grantable) FROM (SELECT table_schema,table_name,grantee,privilege_type,is_grantable FROM information_schema.role_table_grants WHERE table_schema IN('sentinel','platform') AND grantee NOT IN('wetscan_guard_app','wetscan_guard_worker','wetscan_guard_migrator')) t),
'schemaGrants',(SELECT jsonb_agg(to_jsonb(t) ORDER BY nspname,grantee,privilege_type) FROM (SELECT n.nspname,COALESCE(r.rolname,'PUBLIC') AS grantee,a.privilege_type,a.is_grantable FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) a LEFT JOIN pg_roles r ON r.oid=a.grantee WHERE n.nspname IN('sentinel','platform') AND COALESCE(r.rolname,'PUBLIC') NOT IN('wetscan_guard_app','wetscan_guard_worker','wetscan_guard_migrator')) t),
'roles',(SELECT jsonb_agg(to_jsonb(t) ORDER BY rolname) FROM (SELECT rolname,rolcanlogin,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolinherit,rolreplication FROM pg_roles WHERE rolname IN('wetscan_guard_app','wetscan_guard_worker','wetscan_guard_migrator','wetscan_migrator','wetscan_app','wetscan_sentinel_worker')) t)
) AS document)
SELECT set_config('wetscan.guard_g01_observer_before',encode(sha256(convert_to(document::text,'UTF8')),'hex'),false) AS observer_before_sha256 FROM signature;
COMMIT;


-- Part: 10-resume-guard-platform-access.sql
BEGIN;
DO $target$ BEGIN IF clock_timestamp()>='2026-11-15T12:59:00+00:00'::timestamptz OR current_database()<>'wetscan_s01_test_guardg01' OR current_user<>'postgres' OR inet_server_port() IS DISTINCT FROM 5432 OR NOT COALESCE(inet_server_addr() IN('127.0.0.1'::inet,'::1'::inet),false) OR current_setting('server_version_num')::int<>180006 OR shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') IS DISTINCT FROM 'wetscan-s01:aa8b15a6-7ed3-4f19-81f0-07d9759ec62f' OR (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database())<>'wetscan_guard_migrator' THEN RAISE EXCEPTION 'guard_g01_target_denied'; END IF; END $target$;
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


-- Part: 08-guard-schema.sql
BEGIN;
DO $target$ BEGIN IF clock_timestamp()>='2026-11-15T12:59:00+00:00'::timestamptz OR current_database()<>'wetscan_s01_test_guardg01' OR current_user<>'postgres' OR inet_server_port() IS DISTINCT FROM 5432 OR NOT COALESCE(inet_server_addr() IN('127.0.0.1'::inet,'::1'::inet),false) OR current_setting('server_version_num')::int<>180006 OR shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') IS DISTINCT FROM 'wetscan-s01:aa8b15a6-7ed3-4f19-81f0-07d9759ec62f' OR (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database())<>'wetscan_guard_migrator' THEN RAISE EXCEPTION 'guard_g01_target_denied'; END IF; END $target$;
SET LOCAL ROLE wetscan_guard_migrator;
SELECT pg_advisory_xact_lock(7342002);
DO $ledger$ BEGIN IF (SELECT jsonb_agg(jsonb_build_object('version',version,'checksum',checksum) ORDER BY version) FROM platform.schema_migrations) IS DISTINCT FROM jsonb_build_array(jsonb_build_object('version','0001_foundation','checksum','dd061a60b123284882f154c438de3a171d60967b7b07a4e07200b6693f4eb778'),jsonb_build_object('version','0002_telemetry','checksum','d1b67dc680f5bf3c2cbe585dca2427abf9d7ba9f29479c69b851f66b91c1f5a3'),jsonb_build_object('version','0003_detection','checksum','4f0ee1cebdbdc81b835f719ef13c9cb703dfb5f440193765dfa0a61635fb6168')) THEN RAISE EXCEPTION 'guard_g01_platform_ledger_mismatch'; END IF; END $ledger$;
-- PROPOSAL ONLY. Apply as separately approved guard schema owner, never app/worker.
CREATE SCHEMA guard AUTHORIZATION wetscan_guard_migrator;
REVOKE ALL ON SCHEMA guard FROM PUBLIC;
CREATE TABLE guard.schema_migrations(version text PRIMARY KEY, checksum char(64) NOT NULL, applied_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE guard.scans (
 mode text NOT NULL CHECK(mode='live'), workspace_id text NOT NULL, project_id text NOT NULL CHECK(project_id ~ '^github-[1-9][0-9]*$'),
 scan_id char(64) NOT NULL CHECK(scan_id ~ '^[a-f0-9]{64}$'), idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 128),
 fingerprint char(64) NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'), repository_id text NOT NULL CHECK(project_id='github-'||repository_id), commit_sha char(40) NOT NULL CHECK(commit_sha ~ '^[a-f0-9]{40}$'),
 status text NOT NULL CHECK(status IN('queued','preparing','running','normalizing','completed','completed_partial','failed','cancelled')),
 job jsonb NOT NULL CHECK(jsonb_typeof(job)='object' AND octet_length(job::text)<=512000),
 coverage jsonb CHECK(octet_length(coverage::text)<=2000000), revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL DEFAULT clock_timestamp(), retention_until timestamptz NOT NULL DEFAULT(clock_timestamp()+interval '30 days'),
 PRIMARY KEY(mode,workspace_id,project_id,scan_id), UNIQUE(mode,workspace_id,project_id,idempotency_key),
 CHECK((job ?& ARRAY['mode','workspaceId','projectId','id','status','repository'] AND (job->'repository') ?& ARRAY['provider','repositoryId','commit'] AND job->>'mode'=mode AND job->>'workspaceId'=workspace_id AND job->>'projectId'=project_id AND job->>'id'=scan_id AND job->>'status'=status) IS TRUE),
 CHECK((job->'repository'->>'provider'='github' AND job->'repository'->>'repositoryId'=repository_id AND job->'repository'->>'commit'=commit_sha) IS TRUE)
);
CREATE INDEX guard_scan_history ON guard.scans(mode,workspace_id,project_id,scan_id);
CREATE INDEX guard_scan_retention ON guard.scans(retention_until) WHERE status IN('completed','completed_partial','failed','cancelled');
ALTER TABLE guard.scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE guard.scans FORCE ROW LEVEL SECURITY;
CREATE POLICY guard_scope ON guard.scans USING (
 mode='live' AND current_setting('wetscan.module',true)='guard' AND current_user IN('wetscan_guard_app','wetscan_guard_worker')
 AND mode=current_setting('wetscan.mode',true) AND workspace_id=current_setting('wetscan.workspace',true) AND project_id=current_setting('wetscan.project',true)
) WITH CHECK (
 mode='live' AND current_setting('wetscan.module',true)='guard' AND current_user IN('wetscan_guard_app','wetscan_guard_worker')
 AND mode=current_setting('wetscan.mode',true) AND workspace_id=current_setting('wetscan.workspace',true) AND project_id=current_setting('wetscan.project',true)
);
-- Scheduler reads only pending Guard scope metadata; scoped writes still use guard_scope.

CREATE POLICY guard_owner_read ON guard.scans FOR SELECT USING(current_user='wetscan_guard_migrator');
GRANT USAGE ON SCHEMA guard TO wetscan_guard_app,wetscan_guard_worker;
GRANT SELECT ON guard.schema_migrations TO wetscan_guard_app,wetscan_guard_worker;
GRANT SELECT,INSERT,UPDATE ON guard.scans TO wetscan_guard_app;
GRANT SELECT,UPDATE ON guard.scans TO wetscan_guard_worker;
-- Retention deletion is operator-owned; no automatic deletion or app DELETE privilege.

-- Least-privilege scheduler: returns only bounded scope keys, not other projects' job JSON.
CREATE FUNCTION guard.pending_scopes(after_workspace text,after_project text) RETURNS TABLE(mode text,workspace_id text,project_id text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,guard AS $$
 SELECT DISTINCT mode,workspace_id,project_id FROM guard.scans WHERE status NOT IN('completed','completed_partial','failed','cancelled') AND (after_workspace IS NULL OR (workspace_id,project_id)>(after_workspace,after_project)) ORDER BY workspace_id,project_id LIMIT 100
$$;
CREATE FUNCTION guard.active_lease_count(requested_module text) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,platform AS $$
 SELECT count(*)::int FROM platform.jobs WHERE requested_module='guard' AND module='guard' AND state='leased' AND lease_until>clock_timestamp()
$$;
REVOKE ALL ON FUNCTION guard.pending_scopes(text,text),guard.active_lease_count(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION guard.pending_scopes(text,text),guard.active_lease_count(text) TO wetscan_guard_worker;

INSERT INTO guard.schema_migrations(version,checksum) VALUES('0001_guard','8bdea256cdd5ab79b1525f43bd40508acf25e57502a72162ae6b5233dd55693b');
COMMIT;


-- Part: 09-readonly-security-verification.sql
BEGIN READ ONLY;
DO $target$ BEGIN IF clock_timestamp()>='2026-11-15T12:59:00+00:00'::timestamptz OR current_database()<>'wetscan_s01_test_guardg01' OR current_user<>'postgres' OR inet_server_port() IS DISTINCT FROM 5432 OR NOT COALESCE(inet_server_addr() IN('127.0.0.1'::inet,'::1'::inet),false) OR current_setting('server_version_num')::int<>180006 OR shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') IS DISTINCT FROM 'wetscan-s01:aa8b15a6-7ed3-4f19-81f0-07d9759ec62f' OR (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database())<>'wetscan_guard_migrator' THEN RAISE EXCEPTION 'guard_g01_target_denied'; END IF; END $target$;
SELECT version,checksum FROM platform.schema_migrations ORDER BY version;
SELECT version,checksum FROM guard.schema_migrations ORDER BY version;
SELECT n.nspname,c.relname,pg_get_userbyid(c.relowner) AS owner,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('guard','platform','sentinel') AND c.relkind='r' ORDER BY 1,2;
SELECT schemaname,tablename,policyname,cmd,qual,with_check FROM pg_policies WHERE schemaname IN('guard','platform') ORDER BY 1,2,3;
SELECT set_config('wetscan.module','',true),set_config('wetscan.mode','',true),set_config('wetscan.workspace','',true),set_config('wetscan.project','',true);
SET LOCAL ROLE wetscan_guard_app;
DO $deny$ BEGIN IF has_schema_privilege(current_user,'sentinel','USAGE') OR EXISTS(SELECT 1 FROM guard.scans) OR has_database_privilege(current_user,current_database(),'CREATE') THEN RAISE EXCEPTION 'guard_g01_least_privilege_or_unscoped_read_failure'; END IF; END $deny$;
SELECT current_user AS tested_role,count(*) AS unscoped_visible_rows FROM guard.scans;
SET LOCAL ROLE wetscan_guard_worker;
DO $deny$ BEGIN IF has_schema_privilege(current_user,'sentinel','USAGE') OR EXISTS(SELECT 1 FROM guard.scans) OR has_database_privilege(current_user,current_database(),'CREATE') THEN RAISE EXCEPTION 'guard_g01_least_privilege_or_unscoped_read_failure'; END IF; END $deny$;
SELECT current_user AS tested_role,count(*) AS unscoped_visible_rows FROM guard.scans;
ROLLBACK;


-- Part: 12-post-resume-readonly-verification.sql
BEGIN READ ONLY;
DO $target$ BEGIN IF clock_timestamp()>='2026-11-15T12:59:00+00:00'::timestamptz OR current_database()<>'wetscan_s01_test_guardg01' OR current_user<>'postgres' OR inet_server_port() IS DISTINCT FROM 5432 OR NOT COALESCE(inet_server_addr() IN('127.0.0.1'::inet,'::1'::inet),false) OR current_setting('server_version_num')::int<>180006 OR shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') IS DISTINCT FROM 'wetscan-s01:aa8b15a6-7ed3-4f19-81f0-07d9759ec62f' OR (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database())<>'wetscan_guard_migrator' THEN RAISE EXCEPTION 'guard_g01_target_denied'; END IF; END $target$;
DO $check$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM platform.module_limits WHERE module='guard' AND max_running=1)
 OR NOT EXISTS(SELECT 1 FROM platform.module_limits WHERE module='sentinel' AND max_running=2)
 OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN('wetscan_guard_app','wetscan_guard_worker','wetscan_guard_migrator') AND (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication))
 OR EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname IN('wetscan_guard_app','wetscan_guard_worker','wetscan_guard_migrator'))
 OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='platform.module_limits'::regclass AND relrowsecurity AND relforcerowsecurity)
 OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='guard.scans'::regclass AND relrowsecurity AND relforcerowsecurity)
 THEN RAISE EXCEPTION 'guard_g01_runtime_privilege_or_rls_failure'; END IF;
END $check$;
SELECT module,max_running FROM platform.module_limits ORDER BY module;
SELECT version,checksum FROM guard.schema_migrations ORDER BY version;
ROLLBACK;


-- Part: 16-session-readonly-observer-after.sql
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
DO $target$ BEGIN IF clock_timestamp()>='2026-11-15T12:59:00+00:00'::timestamptz OR current_database()<>'wetscan_s01_test_guardg01' OR current_user<>'postgres' OR inet_server_port() IS DISTINCT FROM 5432 OR NOT COALESCE(inet_server_addr() IN('127.0.0.1'::inet,'::1'::inet),false) OR current_setting('server_version_num')::int<>180006 OR shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') IS DISTINCT FROM 'wetscan-s01:aa8b15a6-7ed3-4f19-81f0-07d9759ec62f' OR (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database())<>'wetscan_guard_migrator' THEN RAISE EXCEPTION 'guard_g01_target_denied'; END IF; END $target$;
SET LOCAL row_security=off;
WITH data_rows AS (
SELECT 'sentinel.detection_alerts' AS relation,count(*)::bigint AS rows,encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') AS sha256 FROM sentinel.detection_alerts t
UNION ALL
SELECT 'sentinel.detection_audit' AS relation,count(*)::bigint AS rows,encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') AS sha256 FROM sentinel.detection_audit t
UNION ALL
SELECT 'sentinel.detection_cooldowns' AS relation,count(*)::bigint AS rows,encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') AS sha256 FROM sentinel.detection_cooldowns t
UNION ALL
SELECT 'sentinel.detection_evaluations' AS relation,count(*)::bigint AS rows,encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') AS sha256 FROM sentinel.detection_evaluations t
UNION ALL
SELECT 'sentinel.detection_evidence' AS relation,count(*)::bigint AS rows,encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') AS sha256 FROM sentinel.detection_evidence t
UNION ALL
SELECT 'sentinel.detection_rule_versions' AS relation,count(*)::bigint AS rows,encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') AS sha256 FROM sentinel.detection_rule_versions t
UNION ALL
SELECT 'sentinel.detection_rules' AS relation,count(*)::bigint AS rows,encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') AS sha256 FROM sentinel.detection_rules t
UNION ALL
SELECT 'sentinel.detection_suppressed_evidence' AS relation,count(*)::bigint AS rows,encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') AS sha256 FROM sentinel.detection_suppressed_evidence t
UNION ALL
SELECT 'sentinel.project_bindings' AS relation,count(*)::bigint AS rows,encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') AS sha256 FROM sentinel.project_bindings t
UNION ALL
SELECT 'sentinel.telemetry_batches' AS relation,count(*)::bigint AS rows,encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') AS sha256 FROM sentinel.telemetry_batches t
UNION ALL
SELECT 'sentinel.telemetry_credentials' AS relation,count(*)::bigint AS rows,encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') AS sha256 FROM sentinel.telemetry_credentials t
UNION ALL
SELECT 'sentinel.telemetry_events' AS relation,count(*)::bigint AS rows,encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') AS sha256 FROM sentinel.telemetry_events t
UNION ALL
SELECT 'sentinel.telemetry_sources' AS relation,count(*)::bigint AS rows,encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') AS sha256 FROM sentinel.telemetry_sources t
UNION ALL
SELECT 'platform.schema_migrations' AS relation,count(*)::bigint AS rows,encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') AS sha256 FROM platform.schema_migrations t
UNION ALL
SELECT 'platform.jobs' AS relation,count(*)::bigint AS rows,encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') AS sha256 FROM platform.jobs t WHERE module='sentinel'
UNION ALL
SELECT 'platform.job_attempts' AS relation,count(*)::bigint AS rows,encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') AS sha256 FROM platform.job_attempts t WHERE module='sentinel'
UNION ALL
SELECT 'platform.notification_outbox' AS relation,count(*)::bigint AS rows,encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') AS sha256 FROM platform.notification_outbox t WHERE module='sentinel'
UNION ALL
SELECT 'platform.notification_attempts' AS relation,count(*)::bigint AS rows,encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') AS sha256 FROM platform.notification_attempts t WHERE module='sentinel'
UNION ALL
SELECT 'platform.worker_heartbeats' AS relation,count(*)::bigint AS rows,encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') AS sha256 FROM platform.worker_heartbeats t WHERE module='sentinel'
UNION ALL
SELECT 'platform.module_limits' AS relation,count(*)::bigint AS rows,encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]'),'UTF8')),'hex') AS sha256 FROM platform.module_limits t WHERE module='sentinel'
), signature AS (SELECT jsonb_build_object(
'data',(SELECT jsonb_agg(to_jsonb(t) ORDER BY relation) FROM data_rows t),
'relations',(SELECT jsonb_agg(to_jsonb(t) ORDER BY nspname,relname) FROM (SELECT n.nspname,c.relname,c.relkind,pg_get_userbyid(c.relowner) AS owner,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('sentinel','platform') AND c.relkind IN('r','p','v','S')) t),
'columns',(SELECT jsonb_agg(to_jsonb(t) ORDER BY table_schema,table_name,ordinal_position) FROM (SELECT table_schema,table_name,column_name,ordinal_position,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema IN('sentinel','platform')) t),
'constraints',(SELECT jsonb_agg(to_jsonb(t) ORDER BY nspname,relname,conname) FROM (SELECT n.nspname,c.relname,k.conname,pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('sentinel','platform')) t),
'indexes',(SELECT jsonb_agg(to_jsonb(t) ORDER BY schemaname,tablename,indexname) FROM (SELECT schemaname,tablename,indexname,indexdef FROM pg_indexes WHERE schemaname IN('sentinel','platform')) t),
'policies',(SELECT jsonb_agg(to_jsonb(t) ORDER BY schemaname,tablename,policyname) FROM (SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname IN('sentinel','platform') AND NOT(schemaname='platform' AND policyname IN('guard_boundary','guard_owner_read'))) t),
'grants',(SELECT jsonb_agg(to_jsonb(t) ORDER BY table_schema,table_name,grantee,privilege_type,is_grantable) FROM (SELECT table_schema,table_name,grantee,privilege_type,is_grantable FROM information_schema.role_table_grants WHERE table_schema IN('sentinel','platform') AND grantee NOT IN('wetscan_guard_app','wetscan_guard_worker','wetscan_guard_migrator')) t),
'schemaGrants',(SELECT jsonb_agg(to_jsonb(t) ORDER BY nspname,grantee,privilege_type) FROM (SELECT n.nspname,COALESCE(r.rolname,'PUBLIC') AS grantee,a.privilege_type,a.is_grantable FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) a LEFT JOIN pg_roles r ON r.oid=a.grantee WHERE n.nspname IN('sentinel','platform') AND COALESCE(r.rolname,'PUBLIC') NOT IN('wetscan_guard_app','wetscan_guard_worker','wetscan_guard_migrator')) t),
'roles',(SELECT jsonb_agg(to_jsonb(t) ORDER BY rolname) FROM (SELECT rolname,rolcanlogin,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolinherit,rolreplication FROM pg_roles WHERE rolname IN('wetscan_guard_app','wetscan_guard_worker','wetscan_guard_migrator','wetscan_migrator','wetscan_app','wetscan_sentinel_worker')) t)
) AS document)
SELECT jsonb_build_object('scope','isolated G01 database; external Sentinel database not observed','observerBeforeSha256',current_setting('wetscan.guard_g01_observer_before',true),'observerAfterSha256',encode(sha256(convert_to(document::text,'UTF8')),'hex'),'preserved',current_setting('wetscan.guard_g01_observer_before',true)=encode(sha256(convert_to(document::text,'UTF8')),'hex'),'frozenOriginalDataMatch',document->'data'='[{"relation":"platform.job_attempts","rows":0,"sha256":"4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945"},{"relation":"platform.jobs","rows":1,"sha256":"c04ab8fe05cf05f24f45fc2de01d3e0cc593021153e4d52e6aa6d8278cdbb6ac"},{"relation":"platform.module_limits","rows":1,"sha256":"275b66a17f90168401956c905caf538d7aa133815305f0564f22eb48dce0b534"},{"relation":"platform.notification_attempts","rows":0,"sha256":"4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945"},{"relation":"platform.notification_outbox","rows":0,"sha256":"4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945"},{"relation":"platform.schema_migrations","rows":3,"sha256":"093b0f450060c0feac018d9a38d6e6d36f02a797dd11a65b42986fd35cd0f19c"},{"relation":"platform.worker_heartbeats","rows":0,"sha256":"4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945"},{"relation":"sentinel.detection_alerts","rows":0,"sha256":"4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945"},{"relation":"sentinel.detection_audit","rows":1,"sha256":"3ca32ad2bc821a578e8cd85fc481c10848f56a8c7e7d8157faf3cef58ee6d3c5"},{"relation":"sentinel.detection_cooldowns","rows":0,"sha256":"4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945"},{"relation":"sentinel.detection_evaluations","rows":0,"sha256":"4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945"},{"relation":"sentinel.detection_evidence","rows":0,"sha256":"4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945"},{"relation":"sentinel.detection_rule_versions","rows":1,"sha256":"c520e695a99dd04335c86f5293879571ee3cb638aa897f6b045997c553af0187"},{"relation":"sentinel.detection_rules","rows":1,"sha256":"5b7c7e044aa0ea0dcb08605be5543e4b75a5005afe1eed60ce7348f435ff0d9a"},{"relation":"sentinel.detection_suppressed_evidence","rows":0,"sha256":"4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945"},{"relation":"sentinel.project_bindings","rows":1,"sha256":"f5d322d09916eb6d0a95a4f21668c67dad27ecdb0520e6edf35f3a81d63039dc"},{"relation":"sentinel.telemetry_batches","rows":0,"sha256":"4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945"},{"relation":"sentinel.telemetry_credentials","rows":0,"sha256":"4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945"},{"relation":"sentinel.telemetry_events","rows":1,"sha256":"e5bd3ff4cc4af8be41ed6c6a4e2d987762b078358fe87f278f5f052e5817e936"},{"relation":"sentinel.telemetry_sources","rows":1,"sha256":"b60bea4ed22954e41a8c058e21390ba3fcc21904ea555b768f30ae5aae101949"}]'::jsonb,'guardRlsForced',(SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='guard.scans'::regclass),'moduleLimitsRlsForced',(SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='platform.module_limits'::regclass),'state',jsonb_build_object(
 'database',current_database(),'operator',current_user,'owner',(SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()),
 'marker',shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database'),
 'serverVersion',current_setting('server_version'),'serverPort',inet_server_port(),
 'operatorSuperuser',(SELECT rolsuper FROM pg_roles WHERE rolname=current_user),
 'platformVersions',(SELECT jsonb_agg(jsonb_build_object('version',version,'checksum',checksum) ORDER BY version) FROM platform.schema_migrations),
 'guardSchemaExists',to_regnamespace('guard') IS NOT NULL,
 'guardLedgerExists',to_regclass('guard.schema_migrations') IS NOT NULL,
 'guardBudget',(SELECT max_running FROM platform.module_limits WHERE module='guard'),
 'sentinelBudget',(SELECT max_running FROM platform.module_limits WHERE module='sentinel'),
 'guardPolicies',(SELECT count(*) FROM pg_policies WHERE schemaname='platform' AND policyname IN('guard_boundary','guard_owner_read')),
 'guardPlatformUsage',has_schema_privilege('wetscan_guard_app','platform','USAGE'),
 'guardPlatformGrants',(SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema='platform' AND grantee IN('wetscan_guard_app','wetscan_guard_worker','wetscan_guard_migrator')),
 'activeGuardJobs',(SELECT count(*) FROM platform.jobs WHERE module='guard' AND state='leased' AND lease_until>clock_timestamp()),
 'guardScans',CASE WHEN to_regclass('guard.scans') IS NULL THEN NULL ELSE query_to_xml('SELECT count(*) AS rows FROM guard.scans',true,false,'')::text END
)) AS guard_g01_resume_evidence FROM signature;
COMMIT;

