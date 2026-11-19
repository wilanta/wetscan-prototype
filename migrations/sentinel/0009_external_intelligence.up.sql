-- Additive S09. External Intelligence: global public-advisory catalog (CISA KEV / GHSA / OSV), source-run ledger and project-private declared-dependency inventory. No S01-S08 edits, no runtime events/alerts/incidents, no backfill. Exposure is computed at read time (never persisted), so recomputation is always safe.
-- Global catalog: no tenant data. App role is read-only; only the worker role writes (grants + forced RLS).
CREATE TABLE sentinel.ext_sources (
 provider text PRIMARY KEY CHECK(provider IN ('cisa_kev','ghsa','osv')),
 status text NOT NULL DEFAULT 'never_run' CHECK(status IN ('never_run','ok','partial','degraded','failed','rate_limited')),
 last_attempt_at timestamptz,last_success_at timestamptz,
 last_error_code text CHECK(last_error_code IS NULL OR length(last_error_code)<=64),
 consecutive_failures integer NOT NULL DEFAULT 0 CHECK(consecutive_failures BETWEEN 0 AND 100000),
 etag text CHECK(etag IS NULL OR length(etag)<=256),watermark timestamptz,
 feed_version text CHECK(feed_version IS NULL OR length(feed_version)<=64),
 blocked_until timestamptz,record_count integer NOT NULL DEFAULT 0 CHECK(record_count>=0),
 lease_owner text CHECK(lease_owner IS NULL OR length(lease_owner)<=256),lease_until timestamptz,
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((lease_owner IS NULL)=(lease_until IS NULL))
);
INSERT INTO sentinel.ext_sources(provider) VALUES ('cisa_kev'),('ghsa'),('osv');
CREATE TABLE sentinel.ext_runs (
 run_id uuid PRIMARY KEY,provider text NOT NULL REFERENCES sentinel.ext_sources ON DELETE RESTRICT,
 trigger text NOT NULL CHECK(trigger IN ('manual','scheduled')),
 status text NOT NULL CHECK(status IN ('running','succeeded','partial','not_modified','failed','rate_limited')),
 started_at timestamptz NOT NULL DEFAULT clock_timestamp(),finished_at timestamptz,
 http_status integer CHECK(http_status IS NULL OR http_status BETWEEN 100 AND 599),
 requests integer NOT NULL DEFAULT 0 CHECK(requests BETWEEN 0 AND 1000),bytes bigint NOT NULL DEFAULT 0 CHECK(bytes>=0),
 records_seen integer NOT NULL DEFAULT 0 CHECK(records_seen>=0),records_changed integer NOT NULL DEFAULT 0 CHECK(records_changed>=0),
 records_rejected integer NOT NULL DEFAULT 0 CHECK(records_rejected>=0),
 error_code text CHECK(error_code IS NULL OR length(error_code)<=64),worker_id text CHECK(worker_id IS NULL OR length(worker_id)<=256)
);
CREATE INDEX ext_runs_recent ON sentinel.ext_runs(provider,started_at DESC);
-- One row per provider assertion. Providers never overwrite each other; canonical_id only groups alias-equivalent assertions (min identifier: CVE < GHSA < other).
CREATE TABLE sentinel.ext_advisories (
 provider text NOT NULL REFERENCES sentinel.ext_sources ON DELETE RESTRICT,source_id text NOT NULL CHECK(length(source_id) BETWEEN 3 AND 64),
 canonical_id text NOT NULL CHECK(length(canonical_id) BETWEEN 3 AND 64),
 ident text[] NOT NULL CHECK(cardinality(ident) BETWEEN 1 AND 40),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','withdrawn','removed_from_source')),
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 300),summary text CHECK(summary IS NULL OR length(summary)<=2000),
 severity text NOT NULL DEFAULT 'unknown' CHECK(severity IN ('unknown','low','medium','high','critical')),
 cvss_vector text CHECK(cvss_vector IS NULL OR length(cvss_vector)<=200),cvss_score numeric(3,1) CHECK(cvss_score IS NULL OR cvss_score BETWEEN 0 AND 10),
 kev jsonb CHECK(kev IS NULL OR (provider='cisa_kev' AND jsonb_typeof(kev)='object' AND octet_length(kev::text)<=4096)),
 published_at timestamptz,modified_at timestamptz,withdrawn_at timestamptz,
 source_url text NOT NULL CHECK(source_url ~ '^https://' AND length(source_url)<=500),
 feed_version text CHECK(feed_version IS NULL OR length(feed_version)<=64),
 retrieved_at timestamptz NOT NULL,raw_sha256 char(64) NOT NULL CHECK(raw_sha256 ~ '^[a-f0-9]{64}$'),
 content_hash char(64) NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
 revision integer NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 1000000),
 osv_checked_at timestamptz,first_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(provider,source_id)
);
CREATE INDEX ext_advisories_ident ON sentinel.ext_advisories USING gin(ident);
CREATE INDEX ext_advisories_canonical ON sentinel.ext_advisories(canonical_id);
CREATE INDEX ext_advisories_recent ON sentinel.ext_advisories(modified_at DESC NULLS LAST,canonical_id);
CREATE TABLE sentinel.ext_affected (
 provider text NOT NULL,source_id text NOT NULL,idx smallint NOT NULL CHECK(idx BETWEEN 0 AND 199),
 ecosystem text NOT NULL CHECK(ecosystem IN ('npm','pypi','go','crates.io','maven','nuget','rubygems','packagist','pub','hex','swift','actions','other')),
 package_name text NOT NULL CHECK(length(package_name) BETWEEN 1 AND 300),
 ranges jsonb NOT NULL CHECK(jsonb_typeof(ranges)='array' AND jsonb_array_length(ranges)<=50),
 versions text[] NOT NULL DEFAULT '{}' CHECK(cardinality(versions)<=200),fixed text[] NOT NULL DEFAULT '{}' CHECK(cardinality(fixed)<=50),
 certainty text NOT NULL CHECK(certainty IN ('verified','uncertain')),
 PRIMARY KEY(provider,source_id,idx),FOREIGN KEY(provider,source_id) REFERENCES sentinel.ext_advisories ON DELETE RESTRICT
);
CREATE INDEX ext_affected_pkg ON sentinel.ext_affected(ecosystem,package_name);
-- Append-only record of changed assertions (bounded: pruned to the last 10 revisions per record).
CREATE TABLE sentinel.ext_history (
 provider text NOT NULL,source_id text NOT NULL,revision integer NOT NULL,
 modified_at timestamptz,content_hash char(64) NOT NULL,retrieved_at timestamptz NOT NULL,
 snapshot jsonb NOT NULL CHECK(octet_length(snapshot::text)<=65536),
 PRIMARY KEY(provider,source_id,revision),FOREIGN KEY(provider,source_id) REFERENCES sentinel.ext_advisories ON DELETE RESTRICT
);
-- Project-private declared-dependency inventory (repository lockfile). Never proof of deployment.
CREATE TABLE sentinel.ext_inventory_snapshots (
 mode text NOT NULL CHECK(mode='live'),workspace_id text NOT NULL,project_id text NOT NULL,snapshot_id uuid NOT NULL,
 source_kind text NOT NULL CHECK(source_kind='repository_lockfile'),
 repository_id text NOT NULL CHECK(repository_id ~ '^[1-9][0-9]*$'),commit_sha char(40) NOT NULL CHECK(commit_sha ~ '^[a-f0-9]{40}$'),
 lockfile_path text NOT NULL CHECK(length(lockfile_path) BETWEEN 1 AND 256),lockfile_sha256 char(64) NOT NULL CHECK(lockfile_sha256 ~ '^[a-f0-9]{64}$'),
 lockfile_version integer NOT NULL CHECK(lockfile_version BETWEEN 1 AND 10),
 item_count integer NOT NULL CHECK(item_count BETWEEN 0 AND 10000),ecosystems text[] NOT NULL CHECK(cardinality(ecosystems)<=8),
 collected_by text NOT NULL CHECK(length(collected_by) BETWEEN 1 AND 256),
 collected_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL,CHECK(expires_at>collected_at),
 PRIMARY KEY(mode,workspace_id,project_id,snapshot_id),UNIQUE(mode,workspace_id,project_id,commit_sha,lockfile_sha256),
 FOREIGN KEY(mode,workspace_id,project_id) REFERENCES sentinel.project_bindings ON DELETE RESTRICT
);
CREATE INDEX ext_inventory_snapshots_recent ON sentinel.ext_inventory_snapshots(mode,workspace_id,project_id,collected_at DESC);
CREATE TABLE sentinel.ext_inventory_items (
 mode text NOT NULL,workspace_id text NOT NULL,project_id text NOT NULL,snapshot_id uuid NOT NULL,
 ecosystem text NOT NULL CHECK(ecosystem IN ('npm')),package_name text NOT NULL CHECK(length(package_name) BETWEEN 1 AND 300),
 version text NOT NULL CHECK(length(version) BETWEEN 1 AND 128),
 dep_scope text NOT NULL CHECK(dep_scope IN ('runtime','dev','optional','unknown')),
 PRIMARY KEY(mode,workspace_id,project_id,snapshot_id,ecosystem,package_name,version),
 FOREIGN KEY(mode,workspace_id,project_id,snapshot_id) REFERENCES sentinel.ext_inventory_snapshots ON DELETE RESTRICT
);
CREATE INDEX ext_inventory_items_pkg ON sentinel.ext_inventory_items(ecosystem,package_name);
REVOKE ALL ON sentinel.ext_sources,sentinel.ext_runs,sentinel.ext_advisories,sentinel.ext_affected,sentinel.ext_history,sentinel.ext_inventory_snapshots,sentinel.ext_inventory_items FROM PUBLIC;
GRANT SELECT ON sentinel.ext_sources,sentinel.ext_runs,sentinel.ext_advisories,sentinel.ext_affected,sentinel.ext_history TO wetscan_app;
GRANT SELECT,UPDATE ON sentinel.ext_sources TO wetscan_sentinel_worker;
GRANT SELECT,INSERT,DELETE ON sentinel.ext_runs,sentinel.ext_affected,sentinel.ext_history TO wetscan_sentinel_worker;
GRANT UPDATE ON sentinel.ext_runs TO wetscan_sentinel_worker;
GRANT SELECT,INSERT,UPDATE ON sentinel.ext_advisories TO wetscan_sentinel_worker;
GRANT SELECT,INSERT,DELETE ON sentinel.ext_inventory_snapshots,sentinel.ext_inventory_items TO wetscan_app;
-- Provenance of a stored snapshot is immutable; re-verification of the same commit/lockfile only extends validity.
GRANT UPDATE(collected_at,expires_at,collected_by) ON sentinel.ext_inventory_snapshots TO wetscan_app;
DO $policies$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['ext_sources','ext_runs','ext_advisories','ext_affected','ext_history'] LOOP
  EXECUTE format('ALTER TABLE sentinel.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE sentinel.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY ext_read ON sentinel.%I FOR SELECT USING(current_user IN (''wetscan_app'',''wetscan_sentinel_worker'',''wetscan_migrator''))',t);
  EXECUTE format('CREATE POLICY ext_insert ON sentinel.%I FOR INSERT WITH CHECK(current_user=''wetscan_sentinel_worker'')',t);
  EXECUTE format('CREATE POLICY ext_update ON sentinel.%I FOR UPDATE USING(current_user=''wetscan_sentinel_worker'') WITH CHECK(current_user=''wetscan_sentinel_worker'')',t);
  EXECUTE format('CREATE POLICY ext_delete ON sentinel.%I FOR DELETE USING(current_user=''wetscan_sentinel_worker'')',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['ext_inventory_snapshots','ext_inventory_items'] LOOP
  EXECUTE format('ALTER TABLE sentinel.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE sentinel.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format($policy$CREATE POLICY ext_scope ON sentinel.%I USING(mode='live' AND current_user='wetscan_app'
    AND current_setting('wetscan.module',true)='sentinel' AND mode=current_setting('wetscan.mode',true)
    AND workspace_id=current_setting('wetscan.workspace',true) AND project_id=current_setting('wetscan.project',true))
    WITH CHECK(mode='live' AND current_user='wetscan_app' AND current_setting('wetscan.module',true)='sentinel'
    AND mode=current_setting('wetscan.mode',true) AND workspace_id=current_setting('wetscan.workspace',true) AND project_id=current_setting('wetscan.project',true))$policy$,t);
  EXECUTE format('CREATE POLICY ext_migration_read ON sentinel.%I FOR SELECT USING(current_user=''wetscan_migrator'')',t);
 END LOOP;
END;
$policies$;
