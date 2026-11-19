BEGIN READ ONLY;
DO $target$ BEGIN IF current_database()<>'postgres' OR current_user<>'postgres' OR inet_server_port() IS DISTINCT FROM 5432 OR NOT COALESCE(inet_server_addr() IN('127.0.0.1'::inet,'::1'::inet),false) OR current_setting('server_version_num')::int<>180006 THEN RAISE EXCEPTION 'guard_g01_target_denied'; END IF; END $target$;
SELECT current_database() AS database,current_user AS operator,inet_server_addr() AS address,inet_server_port() AS port,current_setting('server_version') AS version;
SELECT rolname,rolsuper,rolcreatedb,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname=current_user OR rolname IN('wetscan_guard_app','wetscan_guard_worker','wetscan_guard_migrator','wetscan_migrator','wetscan_app','wetscan_sentinel_worker');
SELECT datname,pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname='wetscan_s01_test_guardg01';
ROLLBACK;
