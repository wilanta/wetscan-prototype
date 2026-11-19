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
