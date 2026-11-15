-- Additive S03. No seed enrollment, event replay, role provisioning or historical SQL edits.
CREATE TABLE sentinel.detection_rules (
 mode text NOT NULL CHECK(mode='live'), workspace_id text NOT NULL, project_id text NOT NULL, rule_id uuid NOT NULL,
 current_version integer NOT NULL CHECK(current_version BETWEEN 1 AND 100), seed_key text CHECK(length(seed_key)<=80),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(mode,workspace_id,project_id,rule_id), UNIQUE(mode,workspace_id,project_id,seed_key),
 FOREIGN KEY(mode,workspace_id,project_id) REFERENCES sentinel.project_bindings ON DELETE RESTRICT
);
CREATE TABLE sentinel.detection_rule_versions (
 mode text NOT NULL,workspace_id text NOT NULL,project_id text NOT NULL,rule_id uuid NOT NULL,version integer NOT NULL CHECK(version BETWEEN 1 AND 100),
 schema_version integer NOT NULL CHECK(schema_version=1),status text NOT NULL CHECK(status IN ('DRAFT','ENABLED','DISABLED')),
 definition jsonb NOT NULL CHECK(jsonb_typeof(definition)='object' AND definition->>'schemaVersion'='1'),
 actor_id text NOT NULL CHECK(length(actor_id) BETWEEN 1 AND 256),enabled_at timestamptz,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((status='ENABLED')=(enabled_at IS NOT NULL)),
 PRIMARY KEY(mode,workspace_id,project_id,rule_id,version),
 FOREIGN KEY(mode,workspace_id,project_id,rule_id) REFERENCES sentinel.detection_rules ON DELETE RESTRICT
);
ALTER TABLE sentinel.detection_rules ADD CONSTRAINT detection_current_version FOREIGN KEY(mode,workspace_id,project_id,rule_id,current_version)
 REFERENCES sentinel.detection_rule_versions(mode,workspace_id,project_id,rule_id,version) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE sentinel.detection_audit (
 mode text NOT NULL,workspace_id text NOT NULL,project_id text NOT NULL,rule_id uuid NOT NULL,version integer NOT NULL,
 action text NOT NULL CHECK(action IN ('create','seed','update','enable','disable')),actor_id text NOT NULL CHECK(length(actor_id) BETWEEN 1 AND 256),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(mode,workspace_id,project_id,rule_id,version),
 FOREIGN KEY(mode,workspace_id,project_id,rule_id,version) REFERENCES sentinel.detection_rule_versions ON DELETE RESTRICT
);
CREATE TABLE sentinel.detection_alerts (
 mode text NOT NULL,workspace_id text NOT NULL,project_id text NOT NULL,alert_id uuid NOT NULL,rule_id uuid NOT NULL,rule_version integer NOT NULL,source_id uuid NOT NULL,
 schema_version integer NOT NULL CHECK(schema_version=1),category text NOT NULL CHECK(category IN ('authentication','http','decoy')),
 severity text NOT NULL CHECK(severity IN ('low','medium','high')),confidence integer NOT NULL CHECK(confidence BETWEEN 0 AND 100),
 origin text NOT NULL CHECK(origin IN ('runtime','controlled_test')),correlation_key char(64) NOT NULL CHECK(correlation_key ~ '^[a-f0-9]{64}$'),
 window_start timestamptz NOT NULL,window_end timestamptz NOT NULL CHECK(window_end>window_start),
 first_observed_at timestamptz NOT NULL,last_observed_at timestamptz NOT NULL CHECK(last_observed_at>=first_observed_at),
 matched_event_count integer NOT NULL CHECK(matched_event_count BETWEEN 1 AND 500),deduplication_key char(64) NOT NULL CHECK(deduplication_key ~ '^[a-f0-9]{64}$'),
 detected_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(mode,workspace_id,project_id,alert_id),UNIQUE(mode,workspace_id,project_id,deduplication_key),
 FOREIGN KEY(mode,workspace_id,project_id,rule_id,rule_version) REFERENCES sentinel.detection_rule_versions ON DELETE RESTRICT,
 FOREIGN KEY(mode,workspace_id,project_id,source_id) REFERENCES sentinel.telemetry_sources ON DELETE RESTRICT,
 UNIQUE(mode,workspace_id,project_id,alert_id,source_id)
);
CREATE TABLE sentinel.detection_evidence (
 mode text NOT NULL,workspace_id text NOT NULL,project_id text NOT NULL,alert_id uuid NOT NULL,source_id uuid NOT NULL,event_id uuid NOT NULL,
 PRIMARY KEY(mode,workspace_id,project_id,alert_id,source_id,event_id),
 FOREIGN KEY(mode,workspace_id,project_id,alert_id,source_id) REFERENCES sentinel.detection_alerts(mode,workspace_id,project_id,alert_id,source_id) ON DELETE RESTRICT,
 FOREIGN KEY(mode,workspace_id,project_id,source_id,event_id) REFERENCES sentinel.telemetry_events ON DELETE RESTRICT
);
CREATE TABLE sentinel.detection_evaluations (
 mode text NOT NULL,workspace_id text NOT NULL,project_id text NOT NULL,rule_id uuid NOT NULL,rule_version integer NOT NULL,source_id uuid NOT NULL,event_id uuid NOT NULL,
 outcome text NOT NULL CHECK(outcome IN ('rule_not_applicable','insufficient_evidence','late_event','alert_suppressed','alert_created','alert_deduplicated')),
 reason text NOT NULL CHECK(reason IN ('rule_inactive','actor_identity_not_persisted','kind_or_activation_cutoff','window_finalized_at_ingestion','threshold_not_reached','explicit_event_time_window','cooldown','threshold_reached','existing_window')),
 matched boolean NOT NULL,match_key char(64) NOT NULL,window_start timestamptz NOT NULL,window_end timestamptz NOT NULL,
 evaluated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(mode,workspace_id,project_id,rule_id,rule_version,source_id,event_id),
 FOREIGN KEY(mode,workspace_id,project_id,rule_id,rule_version) REFERENCES sentinel.detection_rule_versions ON DELETE RESTRICT,
 FOREIGN KEY(mode,workspace_id,project_id,source_id,event_id) REFERENCES sentinel.telemetry_events ON DELETE RESTRICT
);
CREATE TABLE sentinel.detection_cooldowns (
 mode text NOT NULL,workspace_id text NOT NULL,project_id text NOT NULL,rule_id uuid NOT NULL,rule_version integer NOT NULL,source_id uuid NOT NULL,correlation_key char(64) NOT NULL,
 last_alert_at timestamptz NOT NULL,
 PRIMARY KEY(mode,workspace_id,project_id,rule_id,rule_version,source_id,correlation_key),
 FOREIGN KEY(mode,workspace_id,project_id,rule_id,rule_version) REFERENCES sentinel.detection_rule_versions ON DELETE RESTRICT,
 FOREIGN KEY(mode,workspace_id,project_id,source_id) REFERENCES sentinel.telemetry_sources ON DELETE RESTRICT
);
-- Suppressed matches keep genuine evidence links without fabricating an alert.
CREATE TABLE sentinel.detection_suppressed_evidence (
 mode text NOT NULL,workspace_id text NOT NULL,project_id text NOT NULL,rule_id uuid NOT NULL,rule_version integer NOT NULL,
 source_id uuid NOT NULL,event_id uuid NOT NULL,evidence_event_id uuid NOT NULL,
 PRIMARY KEY(mode,workspace_id,project_id,rule_id,rule_version,source_id,event_id,evidence_event_id),
 FOREIGN KEY(mode,workspace_id,project_id,rule_id,rule_version,source_id,event_id) REFERENCES sentinel.detection_evaluations ON DELETE RESTRICT,
 FOREIGN KEY(mode,workspace_id,project_id,source_id,evidence_event_id) REFERENCES sentinel.telemetry_events(mode,workspace_id,project_id,source_id,event_id) ON DELETE RESTRICT
);
CREATE INDEX detection_alerts_query ON sentinel.detection_alerts(mode,workspace_id,project_id,detected_at DESC,alert_id DESC);
CREATE INDEX detection_alerts_filters ON sentinel.detection_alerts(mode,workspace_id,project_id,rule_id,source_id,severity,detected_at DESC);
CREATE INDEX detection_evaluations_retention ON sentinel.detection_evaluations(mode,workspace_id,project_id,evaluated_at);
CREATE INDEX detection_evaluations_event ON sentinel.detection_evaluations(mode,workspace_id,project_id,source_id,event_id);
CREATE INDEX detection_evidence_event ON sentinel.detection_evidence(mode,workspace_id,project_id,source_id,event_id);
CREATE INDEX detection_suppressed_event ON sentinel.detection_suppressed_evidence(mode,workspace_id,project_id,source_id,evidence_event_id);
CREATE INDEX telemetry_detection_window ON sentinel.telemetry_events(mode,workspace_id,project_id,source_id,occurred_at,event_id);
REVOKE ALL ON sentinel.detection_rules,sentinel.detection_rule_versions,sentinel.detection_audit,sentinel.detection_alerts,sentinel.detection_evidence,sentinel.detection_evaluations,sentinel.detection_cooldowns,sentinel.detection_suppressed_evidence FROM PUBLIC;
GRANT SELECT,INSERT ON sentinel.detection_rules,sentinel.detection_rule_versions,sentinel.detection_audit TO wetscan_app;
GRANT UPDATE(current_version,updated_at) ON sentinel.detection_rules TO wetscan_app;
GRANT SELECT ON sentinel.detection_alerts,sentinel.detection_evidence,sentinel.detection_evaluations,sentinel.detection_cooldowns,sentinel.detection_suppressed_evidence TO wetscan_app;
GRANT SELECT ON sentinel.detection_rules,sentinel.detection_rule_versions,sentinel.detection_audit TO wetscan_sentinel_worker;
GRANT SELECT,INSERT,UPDATE,DELETE ON sentinel.detection_alerts,sentinel.detection_cooldowns TO wetscan_sentinel_worker;
GRANT SELECT,INSERT,DELETE ON sentinel.detection_evidence,sentinel.detection_evaluations,sentinel.detection_suppressed_evidence TO wetscan_sentinel_worker;
DO $policies$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['detection_rules','detection_rule_versions','detection_audit','detection_alerts','detection_evidence','detection_evaluations','detection_cooldowns','detection_suppressed_evidence'] LOOP
  EXECUTE format('ALTER TABLE sentinel.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE sentinel.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format($policy$CREATE POLICY detection_scope ON sentinel.%I USING(mode='live' AND current_user IN ('wetscan_app','wetscan_sentinel_worker')
    AND current_setting('wetscan.module',true)='sentinel' AND mode=current_setting('wetscan.mode',true)
    AND workspace_id=current_setting('wetscan.workspace',true) AND project_id=current_setting('wetscan.project',true))
    WITH CHECK(mode='live' AND current_user IN ('wetscan_app','wetscan_sentinel_worker') AND current_setting('wetscan.module',true)='sentinel'
    AND mode=current_setting('wetscan.mode',true) AND workspace_id=current_setting('wetscan.workspace',true) AND project_id=current_setting('wetscan.project',true))$policy$,t);
  EXECUTE format('CREATE POLICY detection_migration_read ON sentinel.%I FOR SELECT USING(current_user=''wetscan_migrator'')',t);
 END LOOP;
END;
$policies$;
