CREATE TABLE IF NOT EXISTS guard.g06_schema_migrations (
  version text PRIMARY KEY,
  checksum text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS guard.g06_canvas_overlays (
  workspace_id text NOT NULL,
  project_id text NOT NULL,
  id text NOT NULL,
  commit_sha text NOT NULL,
  graph_revision text NOT NULL,
  scan_id text NOT NULL,
  g05_run_id text NULL,
  coverage_status text NOT NULL CHECK (coverage_status IN ('available', 'partial', 'stale', 'not_scanned', 'unavailable')),
  mapped_count integer NOT NULL DEFAULT 0 CHECK (mapped_count >= 0),
  unmatched_count integer NOT NULL DEFAULT 0 CHECK (unmatched_count >= 0),
  overlay_digest text NOT NULL,
  overlay jsonb NOT NULL,
  stale_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  retention_until timestamptz NOT NULL DEFAULT (clock_timestamp() + interval '90 days'),
  PRIMARY KEY (workspace_id, project_id, id)
);

CREATE INDEX IF NOT EXISTS g06_canvas_overlays_lookup_idx
  ON guard.g06_canvas_overlays (workspace_id, project_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS g06_canvas_overlays_revision_idx
  ON guard.g06_canvas_overlays (workspace_id, project_id, commit_sha, graph_revision, updated_at DESC);

CREATE TABLE IF NOT EXISTS guard.g06_outbox (
  workspace_id text NOT NULL,
  project_id text NOT NULL,
  delivery_id text NOT NULL,
  topic text NOT NULL CHECK (topic IN ('intelligence_inventory', 'sentinel_pipeline')),
  scan_id text NOT NULL,
  commit_sha text NOT NULL,
  idempotency_key text NOT NULL,
  payload_digest text NOT NULL,
  event_type text NOT NULL,
  schema_version text NOT NULL,
  payload jsonb NOT NULL,
  state text NOT NULL CHECK (state IN ('pending', 'leased', 'retry_scheduled', 'acknowledged', 'conflict', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts >= 1 AND max_attempts <= 20),
  next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  lease_owner text NULL,
  lease_token text NULL,
  lease_until timestamptz NULL,
  last_error text NULL,
  consumer_status text NULL,
  consumer_ack_ref text NULL,
  acknowledged_at timestamptz NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  retention_until timestamptz NOT NULL DEFAULT (clock_timestamp() + interval '90 days'),
  PRIMARY KEY (workspace_id, project_id, delivery_id),
  UNIQUE (workspace_id, project_id, topic, idempotency_key)
);

CREATE INDEX IF NOT EXISTS g06_outbox_pending_idx
  ON guard.g06_outbox (workspace_id, project_id, state, next_attempt_at);

CREATE INDEX IF NOT EXISTS g06_outbox_scan_idx
  ON guard.g06_outbox (workspace_id, project_id, scan_id, created_at DESC);

CREATE TABLE IF NOT EXISTS guard.g06_delivery_attempts (
  workspace_id text NOT NULL,
  project_id text NOT NULL,
  id text NOT NULL,
  delivery_id text NOT NULL,
  topic text NOT NULL CHECK (topic IN ('intelligence_inventory', 'sentinel_pipeline')),
  attempt integer NOT NULL CHECK (attempt >= 1),
  worker_id text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('acknowledged', 'retryable_error', 'consumer_unavailable', 'conflict', 'rejected', 'permanent_failure', 'lease_expired')),
  http_status integer NULL,
  consumer_ref text NULL,
  error_code text NULL,
  error_detail text NULL,
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  finished_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id, project_id, id)
);

CREATE INDEX IF NOT EXISTS g06_delivery_attempts_delivery_idx
  ON guard.g06_delivery_attempts (workspace_id, project_id, delivery_id, attempt DESC);

CREATE TABLE IF NOT EXISTS guard.g06_intelligence_sync (
  workspace_id text NOT NULL,
  project_id text NOT NULL,
  sync_id text NOT NULL,
  delivery_id text NOT NULL,
  scan_id text NOT NULL,
  commit_sha text NOT NULL,
  inventory_digest text NOT NULL,
  lockfile_path text NOT NULL,
  item_count integer NOT NULL CHECK (item_count >= 0),
  unsupported_count integer NOT NULL DEFAULT 0 CHECK (unsupported_count >= 0),
  sync_status text NOT NULL CHECK (sync_status IN ('pending', 'acknowledged', 'consumer_unavailable', 'project_not_registered', 'failed')),
  sentinel_snapshot_id text NULL,
  exposure_assessment text NULL CHECK (exposure_assessment IS NULL OR exposure_assessment IN ('potential_exposure', 'no_match_within_coverage', 'cannot_assess')),
  exposure_count integer NOT NULL DEFAULT 0 CHECK (exposure_count >= 0),
  exposure_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  acknowledged_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  retention_until timestamptz NOT NULL DEFAULT (clock_timestamp() + interval '90 days'),
  PRIMARY KEY (workspace_id, project_id, sync_id)
);

CREATE INDEX IF NOT EXISTS g06_intelligence_sync_lookup_idx
  ON guard.g06_intelligence_sync (workspace_id, project_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS guard.g06_reports (
  workspace_id text NOT NULL,
  project_id text NOT NULL,
  report_id text NOT NULL,
  commit_sha text NULL,
  scan_id text NULL,
  g05_run_id text NULL,
  g04_evaluation_id text NULL,
  overall_status text NOT NULL CHECK (overall_status IN ('VERIFIED', 'PARTIAL', 'INCOMPLETE', 'BLOCKED', 'NOT_CONFIGURED', 'STALE', 'FAILED')),
  report_digest text NOT NULL,
  body jsonb NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  retention_until timestamptz NOT NULL DEFAULT (clock_timestamp() + interval '90 days'),
  PRIMARY KEY (workspace_id, project_id, report_id)
);

CREATE INDEX IF NOT EXISTS g06_reports_lookup_idx
  ON guard.g06_reports (workspace_id, project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS guard.g06_audit (
  workspace_id text NOT NULL,
  project_id text NOT NULL,
  id text NOT NULL,
  actor text NOT NULL,
  action text NOT NULL,
  subject_id text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id, project_id, id)
);

CREATE INDEX IF NOT EXISTS g06_audit_lookup_idx
  ON guard.g06_audit (workspace_id, project_id, occurred_at DESC);

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'g06_canvas_overlays',
    'g06_outbox',
    'g06_delivery_attempts',
    'g06_intelligence_sync',
    'g06_reports',
    'g06_audit'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE guard.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE guard.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS g06_scope ON guard.%I', t);
    EXECUTE format(
      $p$CREATE POLICY g06_scope ON guard.%I USING (
        current_setting('wetscan.module', true) = 'guard'
        AND current_user IN ('wetscan_guard_app', 'wetscan_guard_worker')
        AND current_setting('wetscan.mode', true) = 'live'
        AND workspace_id = current_setting('wetscan.workspace', true)
        AND project_id = current_setting('wetscan.project', true)
      ) WITH CHECK (
        current_setting('wetscan.module', true) = 'guard'
        AND current_user IN ('wetscan_guard_app', 'wetscan_guard_worker')
        AND current_setting('wetscan.mode', true) = 'live'
        AND workspace_id = current_setting('wetscan.workspace', true)
        AND project_id = current_setting('wetscan.project', true)
      )$p$,
      t
    );
    EXECUTE format('DROP POLICY IF EXISTS g06_owner ON guard.%I', t);
    EXECUTE format(
      'CREATE POLICY g06_owner ON guard.%I USING (current_user = %L) WITH CHECK (current_user = %L)',
      t,
      'wetscan_guard_migrator',
      'wetscan_guard_migrator'
    );
  END LOOP;
END $$;

REVOKE ALL ON TABLE
  guard.g06_schema_migrations,
  guard.g06_canvas_overlays,
  guard.g06_outbox,
  guard.g06_delivery_attempts,
  guard.g06_intelligence_sync,
  guard.g06_reports,
  guard.g06_audit
FROM PUBLIC;

GRANT SELECT ON guard.g06_schema_migrations TO wetscan_guard_app, wetscan_guard_worker;
GRANT SELECT, INSERT, UPDATE ON
  guard.g06_canvas_overlays,
  guard.g06_outbox,
  guard.g06_intelligence_sync
TO wetscan_guard_app, wetscan_guard_worker;

GRANT SELECT, INSERT ON
  guard.g06_delivery_attempts,
  guard.g06_reports,
  guard.g06_audit
TO wetscan_guard_app, wetscan_guard_worker;

CREATE OR REPLACE FUNCTION guard.g06_pending_deliveries(max_rows integer DEFAULT 25)
RETURNS TABLE (workspace_id text, project_id text, delivery_id text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, guard
AS $$
  SELECT o.workspace_id, o.project_id, o.delivery_id
  FROM guard.g06_outbox o
  WHERE o.retention_until > clock_timestamp()
    AND (
      (o.state IN ('pending', 'retry_scheduled') AND o.next_attempt_at <= clock_timestamp())
      OR (o.state = 'leased' AND o.lease_until IS NOT NULL AND o.lease_until <= clock_timestamp())
    )
  ORDER BY o.next_attempt_at ASC, o.created_at ASC
  LIMIT greatest(1, least(coalesce(max_rows, 25), 100));
$$;

REVOKE ALL ON FUNCTION guard.g06_pending_deliveries(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION guard.g06_pending_deliveries(integer) TO wetscan_guard_worker;
