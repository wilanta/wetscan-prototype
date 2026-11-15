BEGIN READ ONLY;
DO $target$ BEGIN IF current_database()<>'wetscan_s01_test_guardg01' OR current_user<>'postgres' OR inet_server_port() IS DISTINCT FROM 5432 OR NOT COALESCE(inet_server_addr() IN('127.0.0.1'::inet,'::1'::inet),false) OR current_setting('server_version_num')::int<>180006 OR shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') IS DISTINCT FROM 'wetscan-s01:aa8b15a6-7ed3-4f19-81f0-07d9759ec62f' OR (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database())<>'wetscan_guard_migrator' THEN RAISE EXCEPTION 'guard_g01_target_denied'; END IF; END $target$;
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
