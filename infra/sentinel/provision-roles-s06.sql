-- REVIEW ONLY. S06 additive role for the credential-isolated notification sender. Kept separate from provision-roles.sql so the
-- reviewed S01-S04 plan hash is preserved; it is hashed into every migration plan that includes 0006_notifications.
-- Run manually as the approved local bootstrap administrator BEFORE applying 0006. The name must be new; never ALTER an unknown role.
BEGIN;
CREATE ROLE wetscan_sentinel_notifier LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
COMMIT;
-- Set a distinct password interactively with psql \password (never in a committed command) and store it in an ignored file
-- referenced by SENTINEL_DB_NOTIFIER_PASSWORD_FILE. This role may never be granted to or share a password with another role.
