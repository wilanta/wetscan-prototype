-- Additive S04. No historical alert backfill, queue replay, role provisioning or historical SQL edits.
CREATE TABLE sentinel.incidents (
 mode text NOT NULL CHECK(mode='live'),workspace_id text NOT NULL,project_id text NOT NULL,incident_id uuid NOT NULL,
 source_id uuid NOT NULL,primary_alert_id uuid NOT NULL,rule_id uuid NOT NULL,rule_version integer NOT NULL CHECK(rule_version BETWEEN 1 AND 100),
 schema_version integer NOT NULL CHECK(schema_version=1),title text NOT NULL CHECK(length(title) BETWEEN 3 AND 160),
 summary text NOT NULL CHECK(length(summary) BETWEEN 3 AND 512),category text NOT NULL CHECK(category IN ('authentication','http','decoy')),
 severity text NOT NULL CHECK(severity IN ('low','medium','high')),status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','investigating','closed')),
 verification_status text NOT NULL DEFAULT 'not_requested' CHECK(verification_status='not_requested'),archived boolean NOT NULL DEFAULT false CHECK(NOT archived),
 origin text NOT NULL CHECK(origin IN ('runtime','controlled_test')),correlation_key char(64) NOT NULL CHECK(correlation_key ~ '^[a-f0-9]{64}$'),
 deduplication_key char(64) NOT NULL CHECK(deduplication_key ~ '^[a-f0-9]{64}$'),first_observed_at timestamptz NOT NULL,
 last_observed_at timestamptz NOT NULL CHECK(last_observed_at>=first_observed_at),opened_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),closed_at timestamptz,
 closed_by text CHECK(closed_by IS NULL OR length(closed_by) BETWEEN 1 AND 256),close_reason text CHECK(close_reason IS NULL OR length(close_reason) BETWEEN 3 AND 280),
 last_actor_id text NOT NULL CHECK(length(last_actor_id) BETWEEN 1 AND 256),revision integer NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 1000),
 CHECK((status='closed' AND closed_at IS NOT NULL AND closed_by IS NOT NULL AND close_reason IS NOT NULL) OR (status<>'closed' AND closed_at IS NULL AND closed_by IS NULL AND close_reason IS NULL)),
 PRIMARY KEY(mode,workspace_id,project_id,incident_id),UNIQUE(mode,workspace_id,project_id,deduplication_key),UNIQUE(mode,workspace_id,project_id,incident_id,source_id),
 FOREIGN KEY(mode,workspace_id,project_id) REFERENCES sentinel.project_bindings ON DELETE RESTRICT,
 FOREIGN KEY(mode,workspace_id,project_id,source_id) REFERENCES sentinel.telemetry_sources ON DELETE RESTRICT,
 FOREIGN KEY(mode,workspace_id,project_id,primary_alert_id,source_id) REFERENCES sentinel.detection_alerts(mode,workspace_id,project_id,alert_id,source_id) ON DELETE RESTRICT,
 FOREIGN KEY(mode,workspace_id,project_id,rule_id,rule_version) REFERENCES sentinel.detection_rule_versions ON DELETE RESTRICT
);
CREATE TABLE sentinel.incident_alerts (
 mode text NOT NULL,workspace_id text NOT NULL,project_id text NOT NULL,incident_id uuid NOT NULL,alert_id uuid NOT NULL,source_id uuid NOT NULL,
 linked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(mode,workspace_id,project_id,incident_id,alert_id),UNIQUE(mode,workspace_id,project_id,alert_id),
 FOREIGN KEY(mode,workspace_id,project_id,incident_id,source_id) REFERENCES sentinel.incidents(mode,workspace_id,project_id,incident_id,source_id) ON DELETE RESTRICT,
 FOREIGN KEY(mode,workspace_id,project_id,alert_id,source_id) REFERENCES sentinel.detection_alerts(mode,workspace_id,project_id,alert_id,source_id) ON DELETE RESTRICT
);
CREATE TABLE sentinel.incident_evidence (
 mode text NOT NULL,workspace_id text NOT NULL,project_id text NOT NULL,incident_id uuid NOT NULL,source_id uuid NOT NULL,event_id uuid NOT NULL,
 linked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(mode,workspace_id,project_id,incident_id,source_id,event_id),
 FOREIGN KEY(mode,workspace_id,project_id,incident_id,source_id) REFERENCES sentinel.incidents(mode,workspace_id,project_id,incident_id,source_id) ON DELETE RESTRICT,
 FOREIGN KEY(mode,workspace_id,project_id,source_id,event_id) REFERENCES sentinel.telemetry_events ON DELETE RESTRICT
);
CREATE TABLE sentinel.incident_timeline (
 mode text NOT NULL,workspace_id text NOT NULL,project_id text NOT NULL,incident_id uuid NOT NULL,timeline_id uuid NOT NULL,
 sequence integer NOT NULL CHECK(sequence BETWEEN 1 AND 1000),schema_version integer NOT NULL CHECK(schema_version=1),
 event_type text NOT NULL CHECK(event_type IN ('alert_created','incident_opened','incident_closed')),
 actor_id text NOT NULL CHECK(length(actor_id) BETWEEN 1 AND 256),actor_type text NOT NULL CHECK(actor_type IN ('system','user')),
 from_status text CHECK(from_status IS NULL OR from_status IN ('open','investigating','closed')),
 to_status text CHECK(to_status IS NULL OR to_status IN ('open','investigating','closed')),
 summary text NOT NULL CHECK(length(summary) BETWEEN 3 AND 280),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(metadata)='object' AND octet_length(metadata::text)<=2048),
 idempotency_key char(64) NOT NULL CHECK(idempotency_key ~ '^[a-f0-9]{64}$'),
 incident_revision integer NOT NULL CHECK(incident_revision BETWEEN 1 AND 1000),
 occurred_at timestamptz NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(mode,workspace_id,project_id,incident_id,timeline_id),
 UNIQUE(mode,workspace_id,project_id,incident_id,sequence),UNIQUE(mode,workspace_id,project_id,incident_id,idempotency_key),
 FOREIGN KEY(mode,workspace_id,project_id,incident_id) REFERENCES sentinel.incidents ON DELETE RESTRICT
);
CREATE TABLE sentinel.incident_timeline_evidence (
 mode text NOT NULL,workspace_id text NOT NULL,project_id text NOT NULL,incident_id uuid NOT NULL,timeline_id uuid NOT NULL,
 source_id uuid NOT NULL,event_id uuid NOT NULL,
 PRIMARY KEY(mode,workspace_id,project_id,incident_id,timeline_id,source_id,event_id),
 FOREIGN KEY(mode,workspace_id,project_id,incident_id,timeline_id) REFERENCES sentinel.incident_timeline ON DELETE RESTRICT,
 FOREIGN KEY(mode,workspace_id,project_id,incident_id,source_id,event_id) REFERENCES sentinel.incident_evidence ON DELETE RESTRICT,
 FOREIGN KEY(mode,workspace_id,project_id,source_id,event_id) REFERENCES sentinel.telemetry_events ON DELETE RESTRICT
);
CREATE INDEX incidents_query ON sentinel.incidents(mode,workspace_id,project_id,last_observed_at DESC,incident_id DESC);
CREATE INDEX incidents_filters ON sentinel.incidents(mode,workspace_id,project_id,status,severity,source_id,rule_id,last_observed_at DESC);
CREATE INDEX incident_alerts_lookup ON sentinel.incident_alerts(mode,workspace_id,project_id,alert_id,incident_id);
CREATE INDEX incident_evidence_event ON sentinel.incident_evidence(mode,workspace_id,project_id,source_id,event_id);
CREATE INDEX incident_timeline_order ON sentinel.incident_timeline(mode,workspace_id,project_id,incident_id,sequence ASC,occurred_at ASC,timeline_id ASC);
CREATE INDEX incident_timeline_evidence_event ON sentinel.incident_timeline_evidence(mode,workspace_id,project_id,source_id,event_id);
REVOKE ALL ON sentinel.incidents,sentinel.incident_alerts,sentinel.incident_evidence,sentinel.incident_timeline,sentinel.incident_timeline_evidence FROM PUBLIC;
GRANT SELECT ON sentinel.incidents,sentinel.incident_alerts,sentinel.incident_evidence,sentinel.incident_timeline,sentinel.incident_timeline_evidence TO wetscan_app;
GRANT UPDATE(status,updated_at,closed_at,closed_by,close_reason,last_actor_id,revision) ON sentinel.incidents TO wetscan_app;
GRANT INSERT ON sentinel.incident_timeline,sentinel.incident_timeline_evidence TO wetscan_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON sentinel.incidents TO wetscan_sentinel_worker;
GRANT SELECT,INSERT,DELETE ON sentinel.incident_alerts,sentinel.incident_evidence,sentinel.incident_timeline,sentinel.incident_timeline_evidence TO wetscan_sentinel_worker;
DO $policies$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['incidents','incident_alerts','incident_evidence','incident_timeline','incident_timeline_evidence'] LOOP
  EXECUTE format('ALTER TABLE sentinel.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE sentinel.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format($policy$CREATE POLICY incident_scope ON sentinel.%I USING(mode='live' AND current_user IN ('wetscan_app','wetscan_sentinel_worker')
    AND current_setting('wetscan.module',true)='sentinel' AND mode=current_setting('wetscan.mode',true)
    AND workspace_id=current_setting('wetscan.workspace',true) AND project_id=current_setting('wetscan.project',true))
    WITH CHECK(mode='live' AND current_user IN ('wetscan_app','wetscan_sentinel_worker') AND current_setting('wetscan.module',true)='sentinel'
    AND mode=current_setting('wetscan.mode',true) AND workspace_id=current_setting('wetscan.workspace',true) AND project_id=current_setting('wetscan.project',true))$policy$,t);
  EXECUTE format('CREATE POLICY incident_migration_read ON sentinel.%I FOR SELECT USING(current_user=''wetscan_migrator'')',t);
 END LOOP;
END;
$policies$;
