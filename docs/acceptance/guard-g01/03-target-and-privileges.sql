BEGIN;
DO $target$ BEGIN IF current_database()<>'wetscan_s01_test_guardg01' OR current_user<>'postgres' OR inet_server_port() IS DISTINCT FROM 5432 OR NOT COALESCE(inet_server_addr() IN('127.0.0.1'::inet,'::1'::inet),false) OR current_setting('server_version_num')::int<>180006 THEN RAISE EXCEPTION 'guard_g01_target_denied'; END IF; END $target$;
DO $fresh$ BEGIN IF (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database())<>'wetscan_guard_migrator' OR shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') IS NOT NULL OR to_regnamespace('platform') IS NOT NULL OR to_regnamespace('sentinel') IS NOT NULL OR to_regnamespace('guard') IS NOT NULL THEN RAISE EXCEPTION 'guard_g01_requires_fresh_target'; END IF; END $fresh$;
COMMENT ON DATABASE wetscan_s01_test_guardg01 IS 'wetscan-s01:aa8b15a6-7ed3-4f19-81f0-07d9759ec62f';
REVOKE ALL ON DATABASE wetscan_s01_test_guardg01 FROM PUBLIC;
GRANT CONNECT ON DATABASE wetscan_s01_test_guardg01 TO wetscan_guard_app,wetscan_guard_worker,wetscan_guard_migrator;
GRANT CREATE ON DATABASE wetscan_s01_test_guardg01 TO wetscan_migrator;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
COMMIT;
