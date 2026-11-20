-- WetScan Guard G04 (CI/CD security gate). Applied by wetscan_guard_migrator AFTER guard 0001. Own ledger: guard 0001 plan hash is untouched.
CREATE TABLE guard.g04_schema_migrations(version text PRIMARY KEY, checksum char(64) NOT NULL, applied_at timestamptz NOT NULL DEFAULT clock_timestamp());

-- Project security policy (current) + immutable revision history
CREATE TABLE guard.g04_policies(
 workspace_id text NOT NULL, project_id text NOT NULL CHECK(project_id ~ '^github-[1-9][0-9]*$'),
 repository_id text NOT NULL CHECK(project_id='github-'||repository_id), repository_name text NOT NULL CHECK(repository_name ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'),
 installation_id bigint NOT NULL CHECK(installation_id>0), installation_state text NOT NULL DEFAULT 'active' CHECK(installation_state IN('active','suspended','deleted','repository_removed')),
 owner_actor text NOT NULL, owner_user_id bigint NOT NULL CHECK(owner_user_id>0),
 policy jsonb NOT NULL CHECK(jsonb_typeof(policy)='object' AND octet_length(policy::text)<=16000), policy_digest char(64) NOT NULL,
 revision integer NOT NULL CHECK(revision>0), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_by text NOT NULL,
 PRIMARY KEY(workspace_id,project_id));
-- Exactly one workspace may automate a repository; otherwise a webhook could not be routed unambiguously.
CREATE UNIQUE INDEX g04_one_automation_per_repository ON guard.g04_policies(repository_id) WHERE (policy->>'enabled')='true';
CREATE TABLE guard.g04_policy_revisions(
 workspace_id text NOT NULL, project_id text NOT NULL, revision integer NOT NULL, policy jsonb NOT NULL, policy_digest char(64) NOT NULL,
 changed_by text NOT NULL, changed_at timestamptz NOT NULL DEFAULT clock_timestamp(), reason text NOT NULL CHECK(length(reason)<=500),
 PRIMARY KEY(workspace_id,project_id,revision));

-- Webhook deliveries (intake is unscoped until a project is resolved) and redacted audit
CREATE TABLE guard.g04_deliveries(
 delivery_id text PRIMARY KEY CHECK(delivery_id ~ '^[0-9a-f-]{36}$'), event text NOT NULL, action text, payload_sha256 char(64) NOT NULL,
 repository_id text, installation_id bigint, workspace_id text, project_id text,
 outcome text NOT NULL CHECK(outcome IN('received','accepted','duplicate','ignored','rejected','failed')), reason text CHECK(length(reason)<=200),
 attempts integer NOT NULL DEFAULT 1 CHECK(attempts BETWEEN 1 AND 20),
 received_at timestamptz NOT NULL DEFAULT clock_timestamp(), retention_until timestamptz NOT NULL DEFAULT(clock_timestamp()+interval '90 days'));
CREATE INDEX g04_deliveries_project ON guard.g04_deliveries(workspace_id,project_id,received_at DESC);
CREATE TABLE guard.g04_audit(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, workspace_id text, project_id text, at timestamptz NOT NULL DEFAULT clock_timestamp(),
 actor text NOT NULL, action text NOT NULL CHECK(length(action)<=80), subject text CHECK(length(subject)<=200), detail jsonb NOT NULL DEFAULT '{}' CHECK(octet_length(detail::text)<=8000),
 retention_until timestamptz NOT NULL DEFAULT(clock_timestamp()+interval '180 days'));
CREATE INDEX g04_audit_project ON guard.g04_audit(workspace_id,project_id,id DESC);

-- Durable scan triggers (the queue handed to the dispatcher)
CREATE TABLE guard.g04_triggers(
 workspace_id text NOT NULL, project_id text NOT NULL, id char(64) NOT NULL CHECK(id ~ '^[a-f0-9]{64}$'),
 source text NOT NULL CHECK(source IN('pull_request','push','manual','schedule','check_rerun')), delivery_id text, schedule_id text,
 repository_id text NOT NULL, installation_id bigint NOT NULL, branch text NOT NULL, protect_branch text NOT NULL, commit_sha char(40) NOT NULL CHECK(commit_sha ~ '^[a-f0-9]{40}$'), pr_number integer,
 policy_revision integer NOT NULL, status text NOT NULL CHECK(status IN('pending','running','completed','failed','superseded','skipped','cancelled')),
 scan_id char(64) CHECK(scan_id IS NULL OR scan_id ~ '^[a-f0-9]{64}$'), attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 10),
 next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(), lease_until timestamptz, last_error text CHECK(length(last_error)<=120), note text CHECK(length(note)<=200),
 idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 8 AND 128), actor text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(), retention_until timestamptz NOT NULL DEFAULT(clock_timestamp()+interval '90 days'),
 PRIMARY KEY(workspace_id,project_id,id), UNIQUE(workspace_id,project_id,idempotency_key));
CREATE INDEX g04_triggers_runnable ON guard.g04_triggers(next_attempt_at) WHERE status IN('pending','running');
CREATE INDEX g04_triggers_history ON guard.g04_triggers(workspace_id,project_id,created_at DESC);

CREATE TABLE guard.g04_evaluations(
 workspace_id text NOT NULL, project_id text NOT NULL, id char(64) NOT NULL CHECK(id ~ '^[a-f0-9]{64}$'), trigger_id char(64) NOT NULL, scan_id char(64) NOT NULL,
 commit_sha char(40) NOT NULL, branch text NOT NULL, policy_revision integer NOT NULL, decision text NOT NULL CHECK(decision IN('PASS','WARN','BLOCK','INCOMPLETE')),
 evaluation jsonb NOT NULL CHECK(octet_length(evaluation::text)<=64000), enforcement jsonb NOT NULL DEFAULT '{}' CHECK(octet_length(enforcement::text)<=16000),
 superseded_by char(40), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(workspace_id,project_id,id), UNIQUE(workspace_id,project_id,trigger_id,scan_id));
CREATE INDEX g04_evaluations_commit ON guard.g04_evaluations(workspace_id,project_id,commit_sha,created_at DESC);

-- One GitHub check run per (project, commit): create/update is idempotent and durable across restarts
CREATE TABLE guard.g04_check_runs(
 workspace_id text NOT NULL, project_id text NOT NULL, commit_sha char(40) NOT NULL, external_id text NOT NULL, github_check_run_id text, html_url text,
 status text NOT NULL CHECK(status IN('queued','in_progress','completed')), conclusion text CHECK(conclusion IS NULL OR conclusion IN('success','neutral','failure','action_required','cancelled')),
 decision text CHECK(decision IS NULL OR decision IN('PASS','WARN','BLOCK','INCOMPLETE')), trigger_id char(64), evaluation_id char(64),
 attempts integer NOT NULL DEFAULT 0, last_error text CHECK(length(last_error)<=120), next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(), published boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(workspace_id,project_id,commit_sha));
CREATE INDEX g04_check_runs_retry ON guard.g04_check_runs(next_attempt_at) WHERE published=false;

-- Deployment provider mapping (NO credentials: only a reference) and verified deployment evidence
CREATE TABLE guard.g04_provider_mappings(
 workspace_id text NOT NULL, project_id text NOT NULL, provider text NOT NULL CHECK(provider IN('vercel')),
 config jsonb NOT NULL CHECK(octet_length(config::text)<=4000 AND NOT (config::text ~* '(token|secret|password|authorization)')), enabled boolean NOT NULL DEFAULT true,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_by text NOT NULL, PRIMARY KEY(workspace_id,project_id,provider));
CREATE TABLE guard.g04_deployments(
 workspace_id text NOT NULL, project_id text NOT NULL, provider text NOT NULL, deployment_id text NOT NULL CHECK(length(deployment_id) BETWEEN 1 AND 255),
 environment text NOT NULL, commit_sha char(40), state text NOT NULL, evaluation_id char(64), decision text, info jsonb NOT NULL CHECK(octet_length(info::text)<=8000),
 enforcement jsonb NOT NULL DEFAULT '{}' CHECK(octet_length(enforcement::text)<=16000), provider_error text CHECK(length(provider_error)<=60),
 verified_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(workspace_id,project_id,provider,deployment_id));

CREATE TABLE guard.g04_schedules(
 workspace_id text NOT NULL, project_id text NOT NULL, id text NOT NULL CHECK(id ~ '^[a-z0-9-]{4,40}$'), enabled boolean NOT NULL DEFAULT false,
 cadence jsonb NOT NULL, branch text NOT NULL, profile text NOT NULL CHECK(profile IN('quick','standard','full')),
 next_run_at timestamptz NOT NULL, last_run_at timestamptz, last_status text CHECK(last_status IS NULL OR length(last_status)<=40), last_trigger_id char(64),
 consecutive_failures integer NOT NULL DEFAULT 0, revision integer NOT NULL DEFAULT 1, created_by text NOT NULL, updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(workspace_id,project_id,id));
CREATE INDEX g04_schedules_due ON guard.g04_schedules(next_run_at) WHERE enabled;

-- Row-level security: same scope contract as guard.scans
DO $g04$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['g04_policies','g04_policy_revisions','g04_triggers','g04_evaluations','g04_check_runs','g04_provider_mappings','g04_deployments','g04_schedules'] LOOP
  EXECUTE format('ALTER TABLE guard.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE guard.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format($p$CREATE POLICY g04_scope ON guard.%I USING(
   current_setting('wetscan.module',true)='guard' AND current_user IN('wetscan_guard_app','wetscan_guard_worker') AND current_setting('wetscan.mode',true)='live'
   AND workspace_id=current_setting('wetscan.workspace',true) AND project_id=current_setting('wetscan.project',true)
  ) WITH CHECK(current_setting('wetscan.module',true)='guard' AND current_user IN('wetscan_guard_app','wetscan_guard_worker') AND current_setting('wetscan.mode',true)='live'
   AND workspace_id=current_setting('wetscan.workspace',true) AND project_id=current_setting('wetscan.project',true))$p$,t);
  EXECUTE format('CREATE POLICY g04_owner ON guard.%I USING(current_user=%L) WITH CHECK(current_user=%L)',t,'wetscan_guard_migrator','wetscan_guard_migrator');
 END LOOP;
 -- Deliveries/audit: an UNSCOPED guard transaction (webhook intake) may write; a scoped transaction sees only its own project.
 FOREACH t IN ARRAY ARRAY['g04_deliveries','g04_audit'] LOOP
  EXECUTE format('ALTER TABLE guard.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE guard.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format($p$CREATE POLICY g04_intake_or_scope ON guard.%I USING(
   current_setting('wetscan.module',true)='guard' AND current_user IN('wetscan_guard_app','wetscan_guard_worker')
   AND (current_setting('wetscan.workspace',true)='' OR (workspace_id=current_setting('wetscan.workspace',true) AND project_id=current_setting('wetscan.project',true)))
  ) WITH CHECK(current_setting('wetscan.module',true)='guard' AND current_user IN('wetscan_guard_app','wetscan_guard_worker')
   AND (current_setting('wetscan.workspace',true)='' OR (workspace_id=current_setting('wetscan.workspace',true) AND project_id=current_setting('wetscan.project',true))))$p$,t);
  EXECUTE format('CREATE POLICY g04_owner ON guard.%I USING(current_user=%L) WITH CHECK(current_user=%L)',t,'wetscan_guard_migrator','wetscan_guard_migrator');
 END LOOP;
END $g04$;

GRANT SELECT ON guard.g04_schema_migrations TO wetscan_guard_app,wetscan_guard_worker;
GRANT SELECT,INSERT,UPDATE ON guard.g04_policies,guard.g04_triggers,guard.g04_evaluations,guard.g04_check_runs,guard.g04_provider_mappings,guard.g04_deployments,guard.g04_schedules,guard.g04_deliveries TO wetscan_guard_app,wetscan_guard_worker;
GRANT SELECT,INSERT ON guard.g04_policy_revisions,guard.g04_audit TO wetscan_guard_app,wetscan_guard_worker;
-- No DELETE anywhere: retention deletion is operator-owned, exactly like guard.scans.

-- Least-privilege cross-scope lookups (return routing keys only, never policy/job content)
CREATE FUNCTION guard.g04_route(p_repository_id text) RETURNS TABLE(workspace_id text,project_id text,installation_id bigint,installation_state text,revision integer) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,guard AS $$
 SELECT workspace_id,project_id,installation_id,installation_state,revision FROM guard.g04_policies WHERE repository_id=p_repository_id AND (policy->>'enabled')='true' LIMIT 2
$$;
CREATE FUNCTION guard.g04_installation_scopes(p_installation_id bigint) RETURNS TABLE(workspace_id text,project_id text,repository_id text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,guard AS $$
 SELECT workspace_id,project_id,repository_id FROM guard.g04_policies WHERE installation_id=p_installation_id LIMIT 200
$$;
CREATE FUNCTION guard.g04_work(p_limit integer) RETURNS TABLE(kind text,workspace_id text,project_id text,ref text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,guard AS $$
 (SELECT 'trigger'::text,t.workspace_id,t.project_id,t.id::text FROM guard.g04_triggers t WHERE (t.status='pending' AND t.next_attempt_at<=clock_timestamp()) OR (t.status='running' AND t.lease_until<clock_timestamp()) ORDER BY t.next_attempt_at LIMIT least(p_limit,50))
 UNION ALL
 (SELECT 'check'::text,c.workspace_id,c.project_id,c.commit_sha::text FROM guard.g04_check_runs c WHERE c.published=false AND c.next_attempt_at<=clock_timestamp() AND c.attempts<8 ORDER BY c.next_attempt_at LIMIT least(p_limit,50))
 UNION ALL
 (SELECT 'schedule'::text,s.workspace_id,s.project_id,s.id FROM guard.g04_schedules s JOIN guard.g04_policies p ON p.workspace_id=s.workspace_id AND p.project_id=s.project_id WHERE s.enabled AND s.next_run_at<=clock_timestamp() AND (p.policy->>'enabled')='true' AND p.installation_state='active' ORDER BY s.next_run_at LIMIT least(p_limit,20))
$$;
REVOKE ALL ON FUNCTION guard.g04_route(text),guard.g04_installation_scopes(bigint),guard.g04_work(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION guard.g04_route(text),guard.g04_installation_scopes(bigint) TO wetscan_guard_app,wetscan_guard_worker;
GRANT EXECUTE ON FUNCTION guard.g04_work(integer) TO wetscan_guard_worker;
