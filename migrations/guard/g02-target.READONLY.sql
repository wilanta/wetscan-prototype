-- READ ONLY metadata only. Run the WHOLE file on a NEW maintenance connection to postgres.
-- Never use the historical G01 Query Tool/transaction. No passwords, rows or secrets are selected.
BEGIN READ ONLY;
DO $g02$ BEGIN
 IF current_database()<>'postgres' THEN RAISE EXCEPTION 'g02_maintenance_database_required'; END IF;
END $g02$;
SELECT jsonb_build_object(
 'classification','G02_PREPROVISION_READONLY_METADATA',
 'observedAt',clock_timestamp(),'database',current_database(),'port',inet_server_port(),'operator',current_user,
 'readOnly',current_setting('transaction_read_only')='on',
 'target','wetscan_dev_guardg02',
 'targetExists',EXISTS(SELECT 1 FROM pg_database WHERE datname='wetscan_dev_guardg02'),
 'existingTargetOwner',(SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname='wetscan_dev_guardg02'),
 'existingTargetMarker',(SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname='wetscan_dev_guardg02'),
 'sharedBaselineRoles',(SELECT jsonb_agg(rolname ORDER BY rolname) FROM pg_roles WHERE rolname IN ('wetscan_app','wetscan_sentinel_worker')),
 'guardRoles',(SELECT jsonb_agg(jsonb_build_object('role',rolname,'login',rolcanlogin,'superuser',rolsuper,'bypassRls',rolbypassrls,'createDb',rolcreatedb,'createRole',rolcreaterole) ORDER BY rolname) FROM pg_roles WHERE rolname IN ('wetscan_guard_app','wetscan_guard_worker','wetscan_guard_migrator'))
) AS g02_catalog_metadata;
ROLLBACK;
