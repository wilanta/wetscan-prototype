-- WetScan Guard G05 (Scoped DAST, Authenticated API Testing, Canvas Trust/Workflows, Live Integrity).
-- Applied by wetscan_guard_migrator AFTER guard 0001. Own ledger: guard 0001 plan hash stays untouched.
CREATE TABLE guard.g05_schema_migrations (
  version text PRIMARY KEY,
  checksum char(64) NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- Approved staging / local_synthetic targets + immutable revision history
CREATE TABLE guard.g05_targets (
  workspace_id text NOT NULL,
  project_id text NOT NULL CHECK (project_id ~ '^github-[1-9][0-9]*$'),
  id text NOT NULL CHECK (id ~ '^[a-z0-9-]{4,64}$'),
  revision integer NOT NULL CHECK (revision > 0),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 128),
  environment text NOT NULL CHECK (environment IN ('staging', 'local_synthetic')),
  origin text NOT NULL CHECK (length(origin) BETWEEN 8 AND 256),
  service_identity text CHECK (service_identity IS NULL OR length(service_identity) BETWEEN 4 AND 128),
  owner text NOT NULL CHECK (length(owner) BETWEEN 1 AND 128),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'revoked')),
  config jsonb NOT NULL CHECK (jsonb_typeof(config) = 'object' AND octet_length(config::text) <= 32000),
  target_digest char(64) NOT NULL CHECK (target_digest ~ '^[a-f0-9]{64}$'),
  created_by text NOT NULL,
  updated_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id, project_id, id)
);

CREATE TABLE guard.g05_target_revisions (
  workspace_id text NOT NULL,
  project_id text NOT NULL,
  target_id text NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  environment text NOT NULL CHECK (environment IN ('staging', 'local_synthetic')),
  origin text NOT NULL,
  service_identity text,
  config jsonb NOT NULL,
  target_digest char(64) NOT NULL,
  changed_by text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 500),
  PRIMARY KEY (workspace_id, project_id, target_id, revision)
);

-- Target-bound consent / execution authorization grants
CREATE TABLE guard.g05_execution_grants (
  workspace_id text NOT NULL,
  project_id text NOT NULL CHECK (project_id ~ '^github-[1-9][0-9]*$'),
  id char(64) NOT NULL CHECK (id ~ '^[a-f0-9]{64}$'),
  target_id text NOT NULL,
  target_revision integer NOT NULL CHECK (target_revision > 0),
  target_digest char(64) NOT NULL CHECK (target_digest ~ '^[a-f0-9]{64}$'),
  consent_actor text NOT NULL CHECK (length(consent_actor) BETWEEN 1 AND 200),
  proof_id text NOT NULL CHECK (length(proof_id) BETWEEN 4 AND 200),
  authorization_ref text NOT NULL CHECK (length(authorization_ref) BETWEEN 4 AND 200),
  approved_categories jsonb NOT NULL CHECK (jsonb_typeof(approved_categories) = 'array' AND octet_length(approved_categories::text) <= 4000),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_by text,
  revoke_reason text CHECK (revoke_reason IS NULL OR length(revoke_reason) <= 500),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id, project_id, id)
);
CREATE INDEX g05_grants_target ON guard.g05_execution_grants (workspace_id, project_id, target_id, status, expires_at DESC);

-- Synthetic test identities (AES-256-GCM sealed credentials only, never plaintext)
CREATE TABLE guard.g05_test_accounts (
  workspace_id text NOT NULL,
  project_id text NOT NULL CHECK (project_id ~ '^github-[1-9][0-9]*$'),
  id text NOT NULL CHECK (id ~ '^[a-z0-9-]{4,64}$'),
  target_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('anonymous', 'user_a', 'user_b', 'privileged', 'custom')),
  custom_role_name text CHECK (custom_role_name IS NULL OR length(custom_role_name) BETWEEN 1 AND 64),
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 128),
  synthetic boolean NOT NULL CHECK (synthetic = true),
  username_ref text NOT NULL CHECK (length(username_ref) BETWEEN 1 AND 200),
  auth_strategy text NOT NULL CHECK (auth_strategy IN ('none', 'bearer_login', 'cookie_login', 'header_token')),
  login_path text CHECK (login_path IS NULL OR length(login_path) <= 256),
  credential_ciphertext text CHECK (credential_ciphertext IS NULL OR (credential_ciphertext ~ '^g05v1:' AND length(credential_ciphertext) <= 8000)),
  credential_fingerprint char(64) CHECK (credential_fingerprint IS NULL OR credential_fingerprint ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'configured' CHECK (status IN ('configured', 'active', 'expired', 'revoked', 'cleaned')),
  expires_at timestamptz NOT NULL,
  last_verified_at timestamptz,
  revoked_at timestamptz,
  created_by text NOT NULL,
  updated_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id, project_id, id),
  CHECK (auth_strategy = 'none' OR (credential_ciphertext IS NOT NULL AND credential_fingerprint IS NOT NULL))
);
CREATE INDEX g05_accounts_target ON guard.g05_test_accounts (workspace_id, project_id, target_id, status);

-- Canvas Trust plan imports (GRD-014)
CREATE TABLE guard.g05_trust_plans (
  workspace_id text NOT NULL,
  project_id text NOT NULL CHECK (project_id ~ '^github-[1-9][0-9]*$'),
  id char(64) NOT NULL CHECK (id ~ '^[a-f0-9]{64}$'),
  canvas_graph_revision text NOT NULL CHECK (length(canvas_graph_revision) BETWEEN 1 AND 128),
  plan_version integer NOT NULL CHECK (plan_version > 0),
  target_commit char(40) CHECK (target_commit IS NULL OR target_commit ~ '^[a-f0-9]{40}$'),
  source_plan_digest char(64) NOT NULL CHECK (source_plan_digest ~ '^[a-f0-9]{64}$'),
  integration_status text NOT NULL CHECK (integration_status IN ('CONNECTED', 'NOT_CONNECTED', 'INVALID_PLAN', 'STALE', 'NOT_AUTHORIZED')),
  confirmed boolean NOT NULL,
  confirmed_by text NOT NULL CHECK (length(confirmed_by) <= 200),
  confirmed_at timestamptz,
  expires_at timestamptz,
  plan_json jsonb NOT NULL CHECK (jsonb_typeof(plan_json) = 'object' AND octet_length(plan_json::text) <= 128000),
  validation_errors jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(validation_errors) = 'array' AND octet_length(validation_errors::text) <= 16000),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id, project_id, id)
);
CREATE INDEX g05_trust_plans_created ON guard.g05_trust_plans (workspace_id, project_id, created_at DESC);

-- Canvas Workflow imports (GRD-015)
CREATE TABLE guard.g05_workflow_imports (
  workspace_id text NOT NULL,
  project_id text NOT NULL CHECK (project_id ~ '^github-[1-9][0-9]*$'),
  id char(64) NOT NULL CHECK (id ~ '^[a-f0-9]{64}$'),
  workflow_id text NOT NULL CHECK (length(workflow_id) BETWEEN 1 AND 128),
  workflow_name text NOT NULL CHECK (length(workflow_name) BETWEEN 1 AND 256),
  workflow_version integer NOT NULL CHECK (workflow_version > 0),
  canvas_graph_revision text NOT NULL CHECK (length(canvas_graph_revision) BETWEEN 1 AND 128),
  source_digest char(64) NOT NULL CHECK (source_digest ~ '^[a-f0-9]{64}$'),
  validation_status text NOT NULL CHECK (validation_status IN ('valid', 'rejected')),
  validation_errors jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(validation_errors) = 'array' AND octet_length(validation_errors::text) <= 16000),
  definition jsonb NOT NULL CHECK (jsonb_typeof(definition) = 'object' AND octet_length(definition::text) <= 128000),
  endpoint_mappings jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(endpoint_mappings) = 'array' AND octet_length(endpoint_mappings::text) <= 32000),
  trust_plan_id char(64),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id, project_id, id)
);
CREATE INDEX g05_workflows_created ON guard.g05_workflow_imports (workspace_id, project_id, created_at DESC);

-- Generated previewable DAST / Auth / Integrity test plans
CREATE TABLE guard.g05_test_plans (
  workspace_id text NOT NULL,
  project_id text NOT NULL CHECK (project_id ~ '^github-[1-9][0-9]*$'),
  id char(64) NOT NULL CHECK (id ~ '^[a-f0-9]{64}$'),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  target_id text NOT NULL,
  target_revision integer NOT NULL CHECK (target_revision > 0),
  trust_plan_id char(64),
  workflow_import_id char(64),
  profile text NOT NULL CHECK (profile IN ('dast_baseline', 'auth_matrix', 'integrity_suite', 'full_g05')),
  categories jsonb NOT NULL CHECK (jsonb_typeof(categories) = 'array' AND octet_length(categories::text) <= 4000),
  cases jsonb NOT NULL CHECK (jsonb_typeof(cases) = 'array' AND octet_length(cases::text) <= 256000),
  plan_digest char(64) NOT NULL CHECK (plan_digest ~ '^[a-f0-9]{64}$'),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id, project_id, id)
);
CREATE INDEX g05_test_plans_created ON guard.g05_test_plans (workspace_id, project_id, created_at DESC);

-- Durable G05 execution runs (paired 1:1 with platform.jobs kind='guard.g05.verify')
CREATE TABLE guard.g05_runs (
  workspace_id text NOT NULL,
  project_id text NOT NULL CHECK (project_id ~ '^github-[1-9][0-9]*$'),
  id char(64) NOT NULL CHECK (id ~ '^[a-f0-9]{64}$'),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 128),
  fingerprint char(64) NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  test_plan_id char(64) NOT NULL,
  target_id text NOT NULL,
  target_revision integer NOT NULL CHECK (target_revision > 0),
  grant_id char(64) NOT NULL,
  trust_plan_id char(64),
  workflow_import_id char(64),
  retest_of_run_id char(64),
  retest_case_ids jsonb,
  status text NOT NULL CHECK (status IN ('draft', 'pending_authorization', 'queued', 'running', 'completed', 'completed_partial', 'failed', 'timed_out', 'cancelled', 'not_configured', 'not_applicable')),
  scanner_version text NOT NULL CHECK (length(scanner_version) BETWEEN 1 AND 128),
  scope_digest char(64) NOT NULL CHECK (scope_digest ~ '^[a-f0-9]{64}$'),
  evidence_digest char(64),
  executed_requests integer NOT NULL DEFAULT 0 CHECK (executed_requests >= 0),
  max_requests integer NOT NULL CHECK (max_requests > 0),
  cleanup_status text NOT NULL DEFAULT 'pending' CHECK (cleanup_status IN ('not_needed', 'pending', 'verified', 'failed')),
  summary jsonb NOT NULL DEFAULT '{}' CHECK (octet_length(summary::text) <= 32000),
  coverage jsonb NOT NULL DEFAULT '{}' CHECK (octet_length(coverage::text) <= 32000),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  started_at timestamptz,
  finished_at timestamptz,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  retention_until timestamptz NOT NULL DEFAULT (clock_timestamp() + interval '90 days'),
  PRIMARY KEY (workspace_id, project_id, id),
  UNIQUE (workspace_id, project_id, idempotency_key)
);
CREATE INDEX g05_runs_history ON guard.g05_runs (workspace_id, project_id, created_at DESC);
CREATE INDEX g05_runs_active ON guard.g05_runs (created_at) WHERE status IN ('queued', 'running');

-- Per-case observations, pre/post state, and cleanup verification
CREATE TABLE guard.g05_case_results (
  workspace_id text NOT NULL,
  project_id text NOT NULL CHECK (project_id ~ '^github-[1-9][0-9]*$'),
  run_id char(64) NOT NULL CHECK (run_id ~ '^[a-f0-9]{64}$'),
  case_id text NOT NULL CHECK (length(case_id) BETWEEN 1 AND 128),
  category text NOT NULL CHECK (category IN (
    'dast_header', 'dast_tls', 'dast_auth', 'dast_cors', 'dast_session', 'dast_authz', 'dast_response',
    'auth_matrix',
    'integrity_ownership', 'integrity_workflow_bypass', 'integrity_state_transition', 'integrity_replay', 'integrity_unauthorized_modification'
  )),
  invariant_family text CHECK (invariant_family IS NULL OR invariant_family IN ('ownership', 'workflow_bypass', 'state_transition', 'replay', 'unauthorized_modification')),
  actor_role text NOT NULL,
  http_method text NOT NULL,
  request_path text NOT NULL,
  status text NOT NULL CHECK (status IN ('VERIFIED_PASS', 'VERIFIED_FAIL', 'INCONCLUSIVE', 'NOT_EXECUTED', 'CANCELLED', 'CLEANUP_FAILED')),
  severity text NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
  expected_behavior jsonb NOT NULL CHECK (octet_length(expected_behavior::text) <= 16000),
  observed_behavior jsonb NOT NULL CHECK (octet_length(observed_behavior::text) <= 16000),
  pre_state jsonb,
  post_state jsonb,
  cleanup_status text NOT NULL CHECK (cleanup_status IN ('not_needed', 'verified', 'failed')),
  cleanup_receipt jsonb,
  evidence_digest char(64) NOT NULL CHECK (evidence_digest ~ '^[a-f0-9]{64}$'),
  executed_requests integer NOT NULL DEFAULT 0 CHECK (executed_requests >= 0),
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, project_id, run_id, case_id)
);
CREATE INDEX g05_case_results_run ON guard.g05_case_results (workspace_id, project_id, run_id);

-- Normalized redacted G05 findings with triage and retest lineage
CREATE TABLE guard.g05_findings (
  workspace_id text NOT NULL,
  project_id text NOT NULL CHECK (project_id ~ '^github-[1-9][0-9]*$'),
  id char(64) NOT NULL CHECK (id ~ '^[a-f0-9]{64}$'),
  run_id char(64) NOT NULL,
  case_id text NOT NULL,
  engine text NOT NULL CHECK (engine IN ('dast', 'api', 'integrity')),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 400),
  severity text NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
  confidence text NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
  status text NOT NULL DEFAULT 'verified' CHECK (status IN ('potential', 'under_review', 'verified', 'fix_pending_retest', 'verified_fixed', 'false_positive', 'risk_accepted')),
  endpoint text NOT NULL CHECK (length(endpoint) BETWEEN 1 AND 512),
  invariant_family text,
  summary text NOT NULL CHECK (length(summary) BETWEEN 1 AND 4000),
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'array' AND octet_length(evidence::text) <= 32000),
  retest_of_finding_id char(64),
  triage_reason text CHECK (triage_reason IS NULL OR length(triage_reason) <= 1000),
  triaged_by text,
  triaged_at timestamptz,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id, project_id, id)
);
CREATE INDEX g05_findings_run ON guard.g05_findings (workspace_id, project_id, run_id);

-- Persisted exact-revision G05 reports
CREATE TABLE guard.g05_reports (
  workspace_id text NOT NULL,
  project_id text NOT NULL CHECK (project_id ~ '^github-[1-9][0-9]*$'),
  id char(64) NOT NULL CHECK (id ~ '^[a-f0-9]{64}$'),
  run_id char(64) NOT NULL,
  run_revision integer NOT NULL CHECK (run_revision > 0),
  target_id text NOT NULL,
  target_revision integer NOT NULL CHECK (target_revision > 0),
  report_digest char(64) NOT NULL CHECK (report_digest ~ '^[a-f0-9]{64}$'),
  body jsonb NOT NULL CHECK (jsonb_typeof(body) = 'object' AND octet_length(body::text) <= 512000),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id, project_id, id)
);
CREATE INDEX g05_reports_run ON guard.g05_reports (workspace_id, project_id, run_id, created_at DESC);

-- Append-only redacted audit log
CREATE TABLE guard.g05_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id text NOT NULL,
  project_id text NOT NULL CHECK (project_id ~ '^github-[1-9][0-9]*$'),
  at timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor text NOT NULL,
  action text NOT NULL CHECK (length(action) <= 80),
  subject text CHECK (subject IS NULL OR length(subject) <= 200),
  detail jsonb NOT NULL DEFAULT '{}' CHECK (octet_length(detail::text) <= 8000),
  retention_until timestamptz NOT NULL DEFAULT (clock_timestamp() + interval '180 days')
);
CREATE INDEX g05_audit_project ON guard.g05_audit (workspace_id, project_id, id DESC);

-- Row-level security: same scope contract as guard.scans
DO $g05$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'g05_targets',
    'g05_target_revisions',
    'g05_execution_grants',
    'g05_test_accounts',
    'g05_trust_plans',
    'g05_workflow_imports',
    'g05_test_plans',
    'g05_runs',
    'g05_case_results',
    'g05_findings',
    'g05_reports',
    'g05_audit'
  ] LOOP
    EXECUTE format('ALTER TABLE guard.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE guard.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY g05_scope ON guard.%I USING (
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
    )$p$, t);
    EXECUTE format('CREATE POLICY g05_owner ON guard.%I USING (current_user = %L) WITH CHECK (current_user = %L)', t, 'wetscan_guard_migrator', 'wetscan_guard_migrator');
  END LOOP;
END $g05$;

GRANT SELECT ON guard.g05_schema_migrations TO wetscan_guard_app, wetscan_guard_worker;
GRANT SELECT, INSERT, UPDATE ON
  guard.g05_targets,
  guard.g05_execution_grants,
  guard.g05_test_accounts,
  guard.g05_runs,
  guard.g05_findings
  TO wetscan_guard_app, wetscan_guard_worker;
GRANT SELECT, INSERT ON
  guard.g05_target_revisions,
  guard.g05_trust_plans,
  guard.g05_workflow_imports,
  guard.g05_test_plans,
  guard.g05_case_results,
  guard.g05_reports,
  guard.g05_audit
  TO wetscan_guard_app, wetscan_guard_worker;
-- No DELETE grant anywhere: retention deletion is operator-owned.

-- Least-privilege cross-scope work discovery for worker only (returns scope + run id keys, never credentials or payloads)
CREATE FUNCTION guard.g05_pending_scopes(p_limit integer)
RETURNS TABLE(workspace_id text, project_id text, run_id char(64))
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, guard AS $$
  SELECT r.workspace_id, r.project_id, r.id
  FROM guard.g05_runs r
  WHERE r.status IN ('queued', 'running')
  ORDER BY r.created_at, r.id
  LIMIT least(greatest(p_limit, 1), 50)
$$;
REVOKE ALL ON FUNCTION guard.g05_pending_scopes(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION guard.g05_pending_scopes(integer) TO wetscan_guard_worker;
