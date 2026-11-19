BEGIN;
DO $target$ BEGIN IF current_database()<>'wetscan_s01_test_guardg01' OR current_user<>'postgres' OR inet_server_port() IS DISTINCT FROM 5432 OR NOT COALESCE(inet_server_addr() IN('127.0.0.1'::inet,'::1'::inet),false) OR current_setting('server_version_num')::int<>180006 OR shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') IS DISTINCT FROM 'wetscan-s01:aa8b15a6-7ed3-4f19-81f0-07d9759ec62f' OR (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database())<>'wetscan_guard_migrator' THEN RAISE EXCEPTION 'guard_g01_target_denied'; END IF; END $target$;
SET LOCAL ROLE wetscan_migrator;
SELECT pg_advisory_xact_lock(7342001);
CREATE SCHEMA platform;
CREATE TABLE platform.schema_migrations(version text PRIMARY KEY,checksum char(64) NOT NULL,applied_at timestamptz NOT NULL DEFAULT clock_timestamp());
REVOKE ALL ON SCHEMA platform FROM PUBLIC;
-- platform schema + checksum ledger are bootstrapped transactionally by the reviewed runner.
CREATE SCHEMA sentinel;
REVOKE ALL ON SCHEMA platform, sentinel FROM PUBLIC;

CREATE TABLE sentinel.project_bindings (
  mode text NOT NULL CHECK (mode IN ('demo','live')),
  workspace_id text NOT NULL CHECK (length(workspace_id) BETWEEN 1 AND 256),
  project_id text NOT NULL CHECK (project_id ~ '^github-[1-9][0-9]*$'),
  repository_id text NOT NULL CHECK (repository_id ~ '^[1-9][0-9]*$'),
  actor_id text NOT NULL CHECK (length(actor_id) BETWEEN 1 AND 256),
  enabled boolean NOT NULL DEFAULT true,
  retention_hold boolean NOT NULL DEFAULT false,
  last_cleanup_at timestamptz,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (mode,workspace_id,project_id),
  CHECK (project_id = 'github-' || repository_id)
);
CREATE TABLE platform.module_limits (
  module text PRIMARY KEY CHECK (module IN ('sentinel','guard')),
  max_running integer NOT NULL CHECK (max_running BETWEEN 1 AND 2)
);
INSERT INTO platform.module_limits(module,max_running) VALUES ('sentinel',2);

CREATE TABLE platform.jobs (
  module text NOT NULL CHECK (module IN ('sentinel','guard')),
  mode text NOT NULL CHECK (mode IN ('demo','live')),
  workspace_id text NOT NULL CHECK (length(workspace_id) BETWEEN 1 AND 256),
  project_id text NOT NULL CHECK (length(project_id) BETWEEN 1 AND 256),
  job_id text NOT NULL CHECK (length(job_id) BETWEEN 1 AND 256),
  kind text NOT NULL CHECK (length(kind) BETWEEN 1 AND 256),
  subject_ref text NOT NULL CHECK (length(subject_ref) BETWEEN 1 AND 256),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 256),
  fingerprint char(64) NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','leased','completed','failed','cancelled')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL CHECK (max_attempts BETWEEN 1 AND 5 AND attempts <= max_attempts),
  cancel_requested boolean NOT NULL DEFAULT false,
  available_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  finished_at timestamptz,
  fence bigint NOT NULL DEFAULT 0 CHECK (fence >= 0),
  lease_owner text,
  lease_token text,
  lease_until timestamptz,
  lease_ms integer CHECK (lease_ms BETWEEN 5000 AND 120000),
  last_error text CHECK (length(last_error) <= 100),
  PRIMARY KEY (module,mode,workspace_id,project_id,job_id),
  UNIQUE (module,mode,workspace_id,project_id,idempotency_key),
  CHECK ((state='leased' AND lease_owner IS NOT NULL AND lease_token IS NOT NULL AND lease_until IS NOT NULL)
    OR (state<>'leased' AND lease_owner IS NULL AND lease_token IS NULL AND lease_until IS NULL)),
  CHECK (NOT cancel_requested OR state='cancelled'),
  CHECK ((state IN ('completed','failed','cancelled')) = (finished_at IS NOT NULL))
);
CREATE INDEX jobs_ready ON platform.jobs(module,mode,available_at,created_at) WHERE state='queued' AND NOT cancel_requested;
CREATE INDEX jobs_expired ON platform.jobs(module,lease_until) WHERE state='leased';
CREATE INDEX jobs_project ON platform.jobs(module,mode,workspace_id,project_id,state,created_at);

CREATE TABLE platform.job_attempts (
  module text NOT NULL, mode text NOT NULL, workspace_id text NOT NULL, project_id text NOT NULL, job_id text NOT NULL,
  attempt integer NOT NULL CHECK (attempt > 0), lease_token text NOT NULL, worker_id text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(), finished_at timestamptz,
  outcome text CHECK (outcome IN ('completed','cancelled','lease_expired','handler_failed','handler_timeout','worker_stopping','not_configured')),
  PRIMARY KEY(module,mode,workspace_id,project_id,job_id,attempt),
  FOREIGN KEY(module,mode,workspace_id,project_id,job_id) REFERENCES platform.jobs ON DELETE CASCADE
);
CREATE TABLE platform.notification_outbox (
  module text NOT NULL, mode text NOT NULL, workspace_id text NOT NULL, project_id text NOT NULL,
  delivery_id text NOT NULL CHECK (length(delivery_id) BETWEEN 1 AND 256),
  topic text NOT NULL CHECK (length(topic) BETWEEN 1 AND 256),
  subject_ref text NOT NULL CHECK (length(subject_ref) BETWEEN 1 AND 256),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 240),
  fingerprint char(64) NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  job_id text NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','accepted','failed')),
  available_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), finished_at timestamptz,
  PRIMARY KEY(module,mode,workspace_id,project_id,delivery_id),
  UNIQUE(module,mode,workspace_id,project_id,idempotency_key),
  FOREIGN KEY(module,mode,workspace_id,project_id,job_id) REFERENCES platform.jobs ON DELETE RESTRICT
);
CREATE INDEX outbox_retention ON platform.notification_outbox(module,mode,workspace_id,project_id,finished_at) WHERE state IN ('accepted','failed');
CREATE TABLE platform.notification_attempts (
  module text NOT NULL, mode text NOT NULL, workspace_id text NOT NULL, project_id text NOT NULL, delivery_id text NOT NULL,
  attempt integer NOT NULL CHECK (attempt > 0),
  outcome text NOT NULL CHECK (outcome IN ('not_configured','failed','accepted')),
  evidence_ref text CHECK (length(evidence_ref) <= 256),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(module,mode,workspace_id,project_id,delivery_id,attempt),
  FOREIGN KEY(module,mode,workspace_id,project_id,delivery_id) REFERENCES platform.notification_outbox ON DELETE CASCADE,
  CHECK (outcome <> 'accepted' OR evidence_ref IS NOT NULL)
);
CREATE TABLE platform.worker_heartbeats (
  module text NOT NULL CHECK (module IN ('sentinel','guard')),
  worker_id text NOT NULL CHECK (length(worker_id) BETWEEN 1 AND 256),
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  status text NOT NULL CHECK (status IN ('running','stopping','stopped')),
  PRIMARY KEY(module,worker_id)
);

-- Runtime principals are provisioned separately only after H01 approval. No passwords in SQL.
GRANT USAGE ON SCHEMA platform,sentinel TO wetscan_app,wetscan_sentinel_worker;
GRANT SELECT ON platform.schema_migrations TO wetscan_app,wetscan_sentinel_worker;
GRANT SELECT,INSERT,UPDATE,DELETE ON sentinel.project_bindings TO wetscan_app;
GRANT SELECT ON sentinel.project_bindings TO wetscan_sentinel_worker;
GRANT UPDATE(last_cleanup_at) ON sentinel.project_bindings TO wetscan_sentinel_worker;
GRANT SELECT,INSERT,UPDATE ON platform.jobs,platform.notification_outbox TO wetscan_app,wetscan_sentinel_worker;
GRANT SELECT ON platform.job_attempts,platform.notification_attempts TO wetscan_app;
GRANT UPDATE(outcome,finished_at) ON platform.job_attempts TO wetscan_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON platform.job_attempts,platform.notification_attempts TO wetscan_sentinel_worker;
GRANT DELETE ON platform.jobs,platform.notification_outbox TO wetscan_sentinel_worker;
GRANT SELECT,INSERT,UPDATE,DELETE ON platform.worker_heartbeats TO wetscan_sentinel_worker;
GRANT SELECT ON platform.worker_heartbeats TO wetscan_app;
GRANT SELECT,UPDATE ON platform.module_limits TO wetscan_sentinel_worker;

ALTER TABLE sentinel.project_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentinel.project_bindings FORCE ROW LEVEL SECURITY;
CREATE POLICY project_scope ON sentinel.project_bindings USING (
  mode='live' AND (current_user='wetscan_sentinel_worker' OR (current_user='wetscan_app'
  AND mode=current_setting('wetscan.mode',true) AND workspace_id=current_setting('wetscan.workspace',true)
  AND project_id=current_setting('wetscan.project',true)))
) WITH CHECK (mode='live' AND (current_user='wetscan_sentinel_worker' OR (current_user='wetscan_app' AND mode=current_setting('wetscan.mode',true)
  AND workspace_id=current_setting('wetscan.workspace',true) AND project_id=current_setting('wetscan.project',true))));
CREATE POLICY project_migration_read ON sentinel.project_bindings FOR SELECT USING(current_user='wetscan_migrator');

DO $policies$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['jobs','job_attempts','notification_outbox','notification_attempts'] LOOP
    EXECUTE format('ALTER TABLE platform.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE platform.%I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format($policy$CREATE POLICY scope_boundary ON platform.%I USING (
      module='sentinel' AND mode='live' AND (current_user='wetscan_sentinel_worker' OR (current_user='wetscan_app'
      AND module=current_setting('wetscan.module',true) AND mode=current_setting('wetscan.mode',true)
      AND workspace_id=current_setting('wetscan.workspace',true) AND project_id=current_setting('wetscan.project',true)))
    ) WITH CHECK (module='sentinel' AND mode='live' AND (current_user='wetscan_sentinel_worker' OR (current_user='wetscan_app'
      AND module=current_setting('wetscan.module',true) AND mode=current_setting('wetscan.mode',true)
      AND workspace_id=current_setting('wetscan.workspace',true) AND project_id=current_setting('wetscan.project',true))))$policy$,table_name);
    EXECUTE format('CREATE POLICY migration_read ON platform.%I FOR SELECT USING(current_user=''wetscan_migrator'')',table_name);
  END LOOP;
  FOREACH table_name IN ARRAY ARRAY['module_limits','worker_heartbeats'] LOOP
    EXECUTE format('ALTER TABLE platform.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE platform.%I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY module_boundary ON platform.%I USING(module=''sentinel'' AND current_user IN (''wetscan_sentinel_worker'',''wetscan_app'')) WITH CHECK(module=''sentinel'' AND current_user=''wetscan_sentinel_worker'')',table_name);
    EXECUTE format('CREATE POLICY migration_read ON platform.%I FOR SELECT USING(current_user=''wetscan_migrator'')',table_name);
  END LOOP;
END;
$policies$;

INSERT INTO platform.schema_migrations(version,checksum) VALUES('0001_foundation','dd061a60b123284882f154c438de3a171d60967b7b07a4e07200b6693f4eb778');
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

INSERT INTO platform.schema_migrations(version,checksum) VALUES('0002_telemetry','d1b67dc680f5bf3c2cbe585dca2427abf9d7ba9f29479c69b851f66b91c1f5a3');
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

INSERT INTO platform.schema_migrations(version,checksum) VALUES('0003_detection','4f0ee1cebdbdc81b835f719ef13c9cb703dfb5f440193765dfa0a61635fb6168');
RESET ROLE;
-- Remove the temporary baseline CREATE privilege in the same transaction.
REVOKE CREATE ON DATABASE wetscan_s01_test_guardg01 FROM wetscan_migrator;
COMMIT;
