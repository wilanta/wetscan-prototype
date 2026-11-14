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
