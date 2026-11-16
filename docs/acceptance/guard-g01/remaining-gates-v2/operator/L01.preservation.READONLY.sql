-- Frozen READ ONLY projection for L01. Run before and after; ROLLBACK separately. No writes or destructive lifecycle operations.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL lock_timeout='1s';
SET LOCAL statement_timeout='5s';
DO $target$ BEGIN IF current_database()<>'wetscan_s01_test_guardg01' OR current_user<>'postgres' OR inet_server_port() IS DISTINCT FROM 5432 OR NOT COALESCE(inet_server_addr() IN ('127.0.0.1'::inet,'::1'::inet),false) OR shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') IS DISTINCT FROM 'wetscan-s01:aa8b15a6-7ed3-4f19-81f0-07d9759ec62f' OR (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database())<>'wetscan_guard_migrator' THEN RAISE EXCEPTION 'guard_g01_target_denied'; END IF; END $target$;
SET LOCAL row_security=off;
WITH projection AS(SELECT jsonb_build_object(
 'scans',(SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) FROM guard.scans t WHERE NOT false),
 'jobs',(SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) FROM platform.jobs t WHERE module='guard' AND NOT false),
 'attempts',(SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) FROM platform.job_attempts t WHERE module='guard' AND NOT false),
 'outbox',(SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) FROM platform.notification_outbox t WHERE module='guard' AND NOT false),
 'heartbeats',(SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) FROM platform.worker_heartbeats t WHERE module='guard' AND NOT(worker_id=ANY(ARRAY[]::text[]))),
 'guardLedger',(SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) FROM guard.schema_migrations t WHERE true),
 'platformLedger',(SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) FROM platform.schema_migrations t WHERE true),
 'guardBudget',(SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) FROM platform.module_limits t WHERE module='guard'),
 'guardCatalog',(SELECT COALESCE(jsonb_agg(jsonb_build_object('name',c.relname,'kind',c.relkind,'owner',c.relowner,'rls',c.relrowsecurity,'forced',c.relforcerowsecurity) ORDER BY c.relname),'[]'::jsonb) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='guard'),
 'guardPolicies',(SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) FROM pg_policies t WHERE schemaname='guard'),
 'guardGrants',(SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) FROM information_schema.table_privileges t WHERE table_schema='guard')
 ) AS document)
SELECT jsonb_build_object('caseId','L01','database',current_database(),'port',inet_server_port(),'marker',shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database'),'owner',(SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()),'projectionSha256',encode(sha256(convert_to(document::text,'UTF8')),'hex'),'excludedJob',NULL,'excludedWorkers',to_jsonb(ARRAY[]::text[]),'currentCaseScans',(SELECT count(*)::int FROM guard.scans WHERE false),'currentCaseJobs',(SELECT count(*)::int FROM platform.jobs WHERE module='guard' AND false),'observedAt',clock_timestamp(),'rlsVerified',(SELECT bool_and(relrowsecurity AND relforcerowsecurity) FROM pg_class WHERE oid IN('guard.scans'::regclass,'platform.module_limits'::regclass))) AS guard_projection FROM projection;
-- Keep this safe JSON together with SQL18's safe JSON as {sentinel:<SQL18>,guard:<this result>}.
-- ROLLBACK; must be executed separately.
