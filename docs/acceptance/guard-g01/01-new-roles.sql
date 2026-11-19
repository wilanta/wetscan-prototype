BEGIN;
DO $target$ BEGIN IF current_database()<>'postgres' OR current_user<>'postgres' OR inet_server_port() IS DISTINCT FROM 5432 OR NOT COALESCE(inet_server_addr() IN('127.0.0.1'::inet,'::1'::inet),false) OR current_setting('server_version_num')::int<>180006 THEN RAISE EXCEPTION 'guard_g01_target_denied'; END IF; END $target$;
SELECT pg_advisory_xact_lock(7342010);
DO $absent$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN('wetscan_guard_app','wetscan_guard_worker','wetscan_guard_migrator','wetscan_migrator','wetscan_app','wetscan_sentinel_worker')) OR EXISTS(SELECT 1 FROM pg_database WHERE datname='wetscan_s01_test_guardg01') THEN RAISE EXCEPTION 'guard_g01_requires_new_database_and_roles'; END IF; END $absent$;
CREATE ROLE wetscan_guard_app LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE wetscan_guard_worker LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE wetscan_guard_migrator LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE wetscan_migrator NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE wetscan_app NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE wetscan_sentinel_worker NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
COMMIT;
-- No passwords or memberships. Provision Guard credentials manually through a protected operator workflow.
