BEGIN;
DO $target$ BEGIN IF current_database()<>'wetscan_s01_test_guardg01' OR current_user<>'postgres' OR inet_server_port() IS DISTINCT FROM 5432 OR NOT COALESCE(inet_server_addr() IN('127.0.0.1'::inet,'::1'::inet),false) OR current_setting('server_version_num')::int<>180006 OR shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') IS DISTINCT FROM 'wetscan-s01:aa8b15a6-7ed3-4f19-81f0-07d9759ec62f' OR (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database())<>'wetscan_guard_migrator' THEN RAISE EXCEPTION 'guard_g01_target_denied'; END IF; END $target$;
SET LOCAL ROLE wetscan_guard_migrator;
SELECT pg_advisory_xact_lock(7342002);
DO $ledger$ BEGIN IF (SELECT jsonb_agg(jsonb_build_object('version',version,'checksum',checksum) ORDER BY version) FROM platform.schema_migrations) IS DISTINCT FROM jsonb_build_array(jsonb_build_object('version','0001_foundation','checksum','dd061a60b123284882f154c438de3a171d60967b7b07a4e07200b6693f4eb778'),jsonb_build_object('version','0002_telemetry','checksum','d1b67dc680f5bf3c2cbe585dca2427abf9d7ba9f29479c69b851f66b91c1f5a3'),jsonb_build_object('version','0003_detection','checksum','4f0ee1cebdbdc81b835f719ef13c9cb703dfb5f440193765dfa0a61635fb6168')) THEN RAISE EXCEPTION 'guard_g01_platform_ledger_mismatch'; END IF; END $ledger$;
-- PROPOSAL ONLY. Apply as separately approved guard schema owner, never app/worker.
CREATE SCHEMA guard AUTHORIZATION wetscan_guard_migrator;
REVOKE ALL ON SCHEMA guard FROM PUBLIC;
CREATE TABLE guard.schema_migrations(version text PRIMARY KEY, checksum char(64) NOT NULL, applied_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE guard.scans (
 mode text NOT NULL CHECK(mode='live'), workspace_id text NOT NULL, project_id text NOT NULL CHECK(project_id ~ '^github-[1-9][0-9]*$'),
 scan_id char(64) NOT NULL CHECK(scan_id ~ '^[a-f0-9]{64}$'), idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 128),
 fingerprint char(64) NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'), repository_id text NOT NULL CHECK(project_id='github-'||repository_id), commit_sha char(40) NOT NULL CHECK(commit_sha ~ '^[a-f0-9]{40}$'),
 status text NOT NULL CHECK(status IN('queued','preparing','running','normalizing','completed','completed_partial','failed','cancelled')),
 job jsonb NOT NULL CHECK(jsonb_typeof(job)='object' AND octet_length(job::text)<=512000),
 coverage jsonb CHECK(octet_length(coverage::text)<=2000000), revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL DEFAULT clock_timestamp(), retention_until timestamptz NOT NULL DEFAULT(clock_timestamp()+interval '30 days'),
 PRIMARY KEY(mode,workspace_id,project_id,scan_id), UNIQUE(mode,workspace_id,project_id,idempotency_key),
 CHECK((job ?& ARRAY['mode','workspaceId','projectId','id','status','repository'] AND (job->'repository') ?& ARRAY['provider','repositoryId','commit'] AND job->>'mode'=mode AND job->>'workspaceId'=workspace_id AND job->>'projectId'=project_id AND job->>'id'=scan_id AND job->>'status'=status) IS TRUE),
 CHECK((job->'repository'->>'provider'='github' AND job->'repository'->>'repositoryId'=repository_id AND job->'repository'->>'commit'=commit_sha) IS TRUE)
);
CREATE INDEX guard_scan_history ON guard.scans(mode,workspace_id,project_id,scan_id);
CREATE INDEX guard_scan_retention ON guard.scans(retention_until) WHERE status IN('completed','completed_partial','failed','cancelled');
ALTER TABLE guard.scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE guard.scans FORCE ROW LEVEL SECURITY;
CREATE POLICY guard_scope ON guard.scans USING (
 mode='live' AND current_setting('wetscan.module',true)='guard' AND current_user IN('wetscan_guard_app','wetscan_guard_worker')
 AND mode=current_setting('wetscan.mode',true) AND workspace_id=current_setting('wetscan.workspace',true) AND project_id=current_setting('wetscan.project',true)
) WITH CHECK (
 mode='live' AND current_setting('wetscan.module',true)='guard' AND current_user IN('wetscan_guard_app','wetscan_guard_worker')
 AND mode=current_setting('wetscan.mode',true) AND workspace_id=current_setting('wetscan.workspace',true) AND project_id=current_setting('wetscan.project',true)
);
-- Scheduler reads only pending Guard scope metadata; scoped writes still use guard_scope.

CREATE POLICY guard_owner_read ON guard.scans FOR SELECT USING(current_user='wetscan_guard_migrator');
GRANT USAGE ON SCHEMA guard TO wetscan_guard_app,wetscan_guard_worker;
GRANT SELECT ON guard.schema_migrations TO wetscan_guard_app,wetscan_guard_worker;
GRANT SELECT,INSERT,UPDATE ON guard.scans TO wetscan_guard_app;
GRANT SELECT,UPDATE ON guard.scans TO wetscan_guard_worker;
-- Retention deletion is operator-owned; no automatic deletion or app DELETE privilege.

-- Least-privilege scheduler: returns only bounded scope keys, not other projects' job JSON.
CREATE FUNCTION guard.pending_scopes(after_workspace text,after_project text) RETURNS TABLE(mode text,workspace_id text,project_id text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,guard AS $$
 SELECT DISTINCT mode,workspace_id,project_id FROM guard.scans WHERE status NOT IN('completed','completed_partial','failed','cancelled') AND (after_workspace IS NULL OR (workspace_id,project_id)>(after_workspace,after_project)) ORDER BY workspace_id,project_id LIMIT 100
$$;
CREATE FUNCTION guard.active_lease_count(requested_module text) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,platform AS $$
 SELECT count(*)::int FROM platform.jobs WHERE requested_module='guard' AND module='guard' AND state='leased' AND lease_until>clock_timestamp()
$$;
REVOKE ALL ON FUNCTION guard.pending_scopes(text,text),guard.active_lease_count(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION guard.pending_scopes(text,text),guard.active_lease_count(text) TO wetscan_guard_worker;

INSERT INTO guard.schema_migrations(version,checksum) VALUES('0001_guard','8bdea256cdd5ab79b1525f43bd40508acf25e57502a72162ae6b5233dd55693b');
COMMIT;
