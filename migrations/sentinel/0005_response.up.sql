-- Additive S05. Controlled response records. No S01-S04 edits, no backfill, no queue replay, no role provisioning.
-- Incident tables/timeline/verification_status are intentionally untouched: a response is a separate, append-only record.
CREATE TABLE sentinel.response_targets (
 mode text NOT NULL CHECK(mode='live'),workspace_id text NOT NULL,project_id text NOT NULL,target_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind='local_fixture'),
 origin text NOT NULL CHECK(origin ~ '^http://(127\.0\.0\.1|\[::1\]):[1-9][0-9]{3,4}$'),
 max_ttl_seconds integer NOT NULL CHECK(max_ttl_seconds BETWEEN 10 AND 600),
 approver_actor_ids text[] NOT NULL CHECK(cardinality(approver_actor_ids) BETWEEN 1 AND 10),
 allow_self_approval boolean NOT NULL DEFAULT false,
 h03_proof_id text NOT NULL CHECK(length(h03_proof_id) BETWEEN 3 AND 128),
 enabled boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(mode,workspace_id,project_id,target_id),
 FOREIGN KEY(mode,workspace_id,project_id) REFERENCES sentinel.project_bindings ON DELETE RESTRICT
);
CREATE TABLE sentinel.response_actions (
 mode text NOT NULL CHECK(mode='live'),workspace_id text NOT NULL,project_id text NOT NULL,action_id uuid NOT NULL,
 incident_id uuid NOT NULL,target_id uuid NOT NULL,
 incident_origin text NOT NULL CHECK(incident_origin IN ('runtime','controlled_test')),
 operation text NOT NULL CHECK(operation='temporary_rate_limit'),
 ttl_seconds integer NOT NULL CHECK(ttl_seconds BETWEEN 10 AND 600),
 status text NOT NULL CHECK(status IN ('awaiting_approval','approved','denied','applying','applied','apply_failed','verification_pending','verified','failed','inconclusive','rolled_back','expired')),
 proposed_by text NOT NULL CHECK(length(proposed_by) BETWEEN 1 AND 256),
 approved_by text CHECK(approved_by IS NULL OR length(approved_by) BETWEEN 1 AND 256),
 approved_at timestamptz,approval_expires_at timestamptz,applied_at timestamptz,expires_at timestamptz,
 rollback_requested_by text CHECK(rollback_requested_by IS NULL OR length(rollback_requested_by) BETWEEN 1 AND 256),
 rollback_requested_at timestamptz,
 policy_reasons jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(policy_reasons)='array' AND octet_length(policy_reasons::text)<=2048),
 idempotency_key char(64) NOT NULL CHECK(idempotency_key ~ '^[a-f0-9]{64}$'),
 revision integer NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 1000),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(status IN ('awaiting_approval','denied') OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND approval_expires_at IS NOT NULL)),
 CHECK(status NOT IN ('applied','verification_pending','verified','failed','inconclusive') OR (applied_at IS NOT NULL AND expires_at IS NOT NULL)),
 PRIMARY KEY(mode,workspace_id,project_id,action_id),
 UNIQUE(mode,workspace_id,project_id,idempotency_key),
 FOREIGN KEY(mode,workspace_id,project_id,incident_id) REFERENCES sentinel.incidents ON DELETE RESTRICT,
 FOREIGN KEY(mode,workspace_id,project_id,target_id) REFERENCES sentinel.response_targets ON DELETE RESTRICT
);
-- One live limit per target: failed/inconclusive still hold enforcement until rolled back or expired.
CREATE UNIQUE INDEX response_one_active_per_target ON sentinel.response_actions(mode,workspace_id,project_id,target_id)
 WHERE status IN ('approved','applying','applied','verification_pending','verified','failed','inconclusive');
CREATE INDEX response_actions_incident ON sentinel.response_actions(mode,workspace_id,project_id,incident_id,created_at DESC,action_id DESC);
CREATE INDEX response_actions_expiry ON sentinel.response_actions(mode,workspace_id,project_id,status,expires_at);
CREATE TABLE sentinel.response_audit (
 mode text NOT NULL,workspace_id text NOT NULL,project_id text NOT NULL,action_id uuid NOT NULL,audit_id uuid NOT NULL,
 sequence integer NOT NULL CHECK(sequence BETWEEN 1 AND 200),
 event_type text NOT NULL CHECK(event_type IN ('response_proposed','human_approved','approval_denied','apply_started','mitigation_applied','apply_failed','verification_pending','verification_recorded','neutralization_verified','verification_failed','verification_inconclusive','rollback','expiry','reconcile_adopted','reconcile_cleanup')),
 actor_id text NOT NULL CHECK(length(actor_id) BETWEEN 1 AND 256),actor_type text NOT NULL CHECK(actor_type IN ('system','user')),
 from_status text,to_status text,
 summary text NOT NULL CHECK(length(summary) BETWEEN 3 AND 280),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(metadata)='object' AND octet_length(metadata::text)<=2048),
 idempotency_key char(64) NOT NULL CHECK(idempotency_key ~ '^[a-f0-9]{64}$'),
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(mode,workspace_id,project_id,action_id,audit_id),
 UNIQUE(mode,workspace_id,project_id,action_id,sequence),UNIQUE(mode,workspace_id,project_id,action_id,idempotency_key),
 FOREIGN KEY(mode,workspace_id,project_id,action_id) REFERENCES sentinel.response_actions ON DELETE RESTRICT
);
REVOKE ALL ON sentinel.response_targets,sentinel.response_actions,sentinel.response_audit FROM PUBLIC;
GRANT SELECT ON sentinel.response_targets,sentinel.response_actions,sentinel.response_audit TO wetscan_app,wetscan_sentinel_worker;
GRANT INSERT ON sentinel.response_actions TO wetscan_app;
GRANT UPDATE(status,approved_by,approved_at,approval_expires_at,rollback_requested_by,rollback_requested_at,revision,updated_at) ON sentinel.response_actions TO wetscan_app;
GRANT UPDATE(status,applied_at,expires_at,revision,updated_at) ON sentinel.response_actions TO wetscan_sentinel_worker;
-- Audit is append-only for every runtime role: never updated or deleted.
GRANT INSERT ON sentinel.response_audit TO wetscan_app,wetscan_sentinel_worker;
DO $policies$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['response_targets','response_actions','response_audit'] LOOP
  EXECUTE format('ALTER TABLE sentinel.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE sentinel.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format($policy$CREATE POLICY response_scope ON sentinel.%I USING(mode='live' AND current_user IN ('wetscan_app','wetscan_sentinel_worker')
    AND current_setting('wetscan.module',true)='sentinel' AND mode=current_setting('wetscan.mode',true)
    AND workspace_id=current_setting('wetscan.workspace',true) AND project_id=current_setting('wetscan.project',true))
    WITH CHECK(mode='live' AND current_user IN ('wetscan_app','wetscan_sentinel_worker') AND current_setting('wetscan.module',true)='sentinel'
    AND mode=current_setting('wetscan.mode',true) AND workspace_id=current_setting('wetscan.workspace',true) AND project_id=current_setting('wetscan.project',true))$policy$,t);
  EXECUTE format('CREATE POLICY response_migration_read ON sentinel.%I FOR SELECT USING(current_user=''wetscan_migrator'')',t);
 END LOOP;
 -- Only the owner-controlled migrator role provisions approved targets (H03); app/worker can never write targets.
 CREATE POLICY response_target_provision ON sentinel.response_targets FOR ALL TO wetscan_migrator USING(current_user='wetscan_migrator') WITH CHECK(mode='live' AND current_user='wetscan_migrator');
END;
$policies$;
