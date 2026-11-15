BEGIN READ ONLY;
DO $target$ BEGIN IF current_database()<>'wetscan_s01_test_guardg01' OR current_user<>'postgres' OR inet_server_port() IS DISTINCT FROM 5432 OR NOT COALESCE(inet_server_addr() IN('127.0.0.1'::inet,'::1'::inet),false) OR current_setting('server_version_num')::int<>180006 OR shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') IS DISTINCT FROM 'wetscan-s01:aa8b15a6-7ed3-4f19-81f0-07d9759ec62f' OR (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database())<>'wetscan_guard_migrator' THEN RAISE EXCEPTION 'guard_g01_target_denied'; END IF; END $target$;
SELECT jsonb_build_object(
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
) AS guard_g01_recovery_state;
ROLLBACK;
