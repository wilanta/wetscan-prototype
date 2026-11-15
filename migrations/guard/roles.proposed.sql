-- PROPOSAL ONLY: exact-target operator approval required. Collision is an error.
-- No passwords, memberships, superuser, bypassrls, shared owner or Sentinel privileges.
CREATE ROLE wetscan_guard_app LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
CREATE ROLE wetscan_guard_worker LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
CREATE ROLE wetscan_guard_migrator LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
-- Approved bootstrap operator separately grants database CONNECT and CREATE only to the migrator.
-- Password provisioning is an operator action outside version control, never in SQL/chat.
