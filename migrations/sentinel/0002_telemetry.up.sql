-- Additive S02 only. Existing foundation objects/data remain intact.
CREATE TABLE sentinel.telemetry_sources (
 mode text NOT NULL CHECK(mode='live'), workspace_id text NOT NULL, project_id text NOT NULL, source_id uuid NOT NULL,
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 60), environment text NOT NULL CHECK(environment IN ('local','staging','production')),
 origin text NOT NULL CHECK(origin IN ('runtime','controlled_test')), enabled boolean NOT NULL DEFAULT true,
 retention_days integer NOT NULL CHECK(retention_days BETWEEN 1 AND 30), rate_limit integer NOT NULL CHECK(rate_limit BETWEEN 1 AND 6000),
 rate_window timestamptz, rate_used integer NOT NULL DEFAULT 0 CHECK(rate_used>=0), revision integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), last_contact_at timestamptz, last_ingested_at timestamptz,
 PRIMARY KEY(mode,workspace_id,project_id,source_id),
 FOREIGN KEY(mode,workspace_id,project_id) REFERENCES sentinel.project_bindings ON DELETE RESTRICT
);
CREATE TABLE sentinel.telemetry_credentials (
 mode text NOT NULL, workspace_id text NOT NULL, project_id text NOT NULL, source_id uuid NOT NULL, credential_id uuid NOT NULL,
 token_hash char(64) NOT NULL CHECK(token_hash ~ '^[a-f0-9]{64}$'), created_at timestamptz NOT NULL DEFAULT clock_timestamp(), revoked_at timestamptz,
 PRIMARY KEY(mode,workspace_id,project_id,source_id,credential_id),
 FOREIGN KEY(mode,workspace_id,project_id,source_id) REFERENCES sentinel.telemetry_sources ON DELETE RESTRICT
);
CREATE TABLE sentinel.telemetry_batches (
 mode text NOT NULL,workspace_id text NOT NULL,project_id text NOT NULL,source_id uuid NOT NULL,batch_id uuid NOT NULL,
 fingerprint char(64) NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'), receipt jsonb NOT NULL CHECK(jsonb_typeof(receipt)='array'),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(mode,workspace_id,project_id,source_id,batch_id),
 FOREIGN KEY(mode,workspace_id,project_id,source_id) REFERENCES sentinel.telemetry_sources ON DELETE RESTRICT
);
CREATE TABLE sentinel.telemetry_events (
 mode text NOT NULL,workspace_id text NOT NULL,project_id text NOT NULL,source_id uuid NOT NULL,event_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('auth.failed','http.suspicious_path','http.request','ghost.decoy_triggered')),
 severity text NOT NULL CHECK(severity IN ('info','low','medium','high')),occurred_at timestamptz NOT NULL,ingested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 fingerprint char(64) NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'), event jsonb NOT NULL CHECK(jsonb_typeof(event)='object'),
 PRIMARY KEY(mode,workspace_id,project_id,source_id,event_id),
 FOREIGN KEY(mode,workspace_id,project_id,source_id) REFERENCES sentinel.telemetry_sources ON DELETE RESTRICT
);
CREATE INDEX telemetry_events_query ON sentinel.telemetry_events(mode,workspace_id,project_id,ingested_at DESC,source_id DESC,event_id DESC);
CREATE INDEX telemetry_events_filter ON sentinel.telemetry_events(mode,workspace_id,project_id,source_id,kind,severity,ingested_at DESC);
CREATE INDEX telemetry_batches_retention ON sentinel.telemetry_batches(recorded_at);
GRANT SELECT,INSERT,UPDATE ON sentinel.telemetry_sources,sentinel.telemetry_credentials TO wetscan_app;
GRANT SELECT,INSERT ON sentinel.telemetry_events,sentinel.telemetry_batches TO wetscan_app;
GRANT SELECT ON sentinel.telemetry_sources TO wetscan_sentinel_worker;
GRANT SELECT,DELETE ON sentinel.telemetry_events,sentinel.telemetry_batches TO wetscan_sentinel_worker;
DO $policies$
DECLARE table_name text;
BEGIN
 FOREACH table_name IN ARRAY ARRAY['telemetry_sources','telemetry_credentials','telemetry_events','telemetry_batches'] LOOP
  EXECUTE format('ALTER TABLE sentinel.%I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('ALTER TABLE sentinel.%I FORCE ROW LEVEL SECURITY',table_name);
  EXECUTE format($policy$CREATE POLICY telemetry_scope ON sentinel.%I USING(mode='live' AND
    ((current_user='wetscan_app' AND current_setting('wetscan.module',true)='sentinel' AND mode=current_setting('wetscan.mode',true)
      AND workspace_id=current_setting('wetscan.workspace',true) AND project_id=current_setting('wetscan.project',true))
      OR current_user='wetscan_sentinel_worker'))
    WITH CHECK(mode='live' AND current_user='wetscan_app' AND current_setting('wetscan.module',true)='sentinel'
      AND mode=current_setting('wetscan.mode',true) AND workspace_id=current_setting('wetscan.workspace',true) AND project_id=current_setting('wetscan.project',true))$policy$,table_name);
  EXECUTE format('CREATE POLICY telemetry_migration_read ON sentinel.%I FOR SELECT USING(current_user=''wetscan_migrator'')',table_name);
 END LOOP;
END;
$policies$;
