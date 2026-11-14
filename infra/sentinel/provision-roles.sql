-- REVIEW ONLY until H01. Run manually as the approved local bootstrap administrator.
-- All names must be new. A collision is an error; never ALTER an unknown existing role.
BEGIN;
CREATE ROLE wetscan_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE wetscan_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE wetscan_sentinel_worker LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
COMMIT;
-- Set each distinct password interactively with psql \password, never in a committed command.
-- Database creation, grants and marker comment are explicit manual H01 steps; no initdb mount runs this file.
