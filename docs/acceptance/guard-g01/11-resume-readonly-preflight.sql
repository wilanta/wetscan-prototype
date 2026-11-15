BEGIN READ ONLY;
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
SELECT current_database(),current_user,shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') AS marker;
SELECT version,checksum FROM platform.schema_migrations ORDER BY version;
SELECT module,max_running FROM platform.module_limits ORDER BY module;
ROLLBACK;
