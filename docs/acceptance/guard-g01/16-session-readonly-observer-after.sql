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
