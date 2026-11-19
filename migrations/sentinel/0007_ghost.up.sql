-- Additive S07. Ghost Lite harmless decoy configuration and append-only audit. No S01-S06 edits, no automatic decoy activation, no duplicate telemetry/detection/incident tables.
CREATE TABLE sentinel.ghost_decoys (
 mode text NOT NULL CHECK(mode='live'),workspace_id text NOT NULL,project_id text NOT NULL,decoy_id uuid NOT NULL,
 source_id uuid NOT NULL,name text NOT NULL CHECK(length(name) BETWEEN 1 AND 60),
 environment text NOT NULL CHECK(environment IN ('local','staging','production')),
 origin text NOT NULL CHECK(origin IN ('runtime','controlled_test')),
 target_ref text NOT NULL CHECK(length(target_ref) BETWEEN 2 AND 120),
 decoy_path text NOT NULL CHECK(decoy_path ~ '^/(__wetscan|\.well-known)/[a-z0-9-]{3,40}$'),
 enabled boolean NOT NULL DEFAULT false,
 owned_app_confirmed boolean NOT NULL CHECK(owned_app_confirmed),
 response_status integer NOT NULL DEFAULT 200 CHECK(response_status IN (200,204,404)),
 rate_limit_per_min integer NOT NULL DEFAULT 30 CHECK(rate_limit_per_min BETWEEN 1 AND 120),
 h07_proof_id text CHECK(h07_proof_id IS NULL OR length(h07_proof_id) BETWEEN 1 AND 80),
 false_positive_notice text NOT NULL DEFAULT 'A decoy hit is a suspicious signal, never proof of compromise. Benign scanners or crawlers can trigger this endpoint.' CHECK(length(false_positive_notice) BETWEEN 10 AND 280),
 revision integer NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 1000),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(mode,workspace_id,project_id,decoy_id),
 UNIQUE(mode,workspace_id,project_id,source_id),
 UNIQUE(mode,workspace_id,project_id,decoy_path),
 FOREIGN KEY(mode,workspace_id,project_id) REFERENCES sentinel.project_bindings ON DELETE RESTRICT,
 FOREIGN KEY(mode,workspace_id,project_id,source_id) REFERENCES sentinel.telemetry_sources ON DELETE RESTRICT
);
CREATE INDEX ghost_decoys_project ON sentinel.ghost_decoys(mode,workspace_id,project_id,created_at,decoy_id);
CREATE TABLE sentinel.ghost_audit (
 mode text NOT NULL CHECK(mode='live'),workspace_id text NOT NULL,project_id text NOT NULL,
 audit_id uuid NOT NULL,decoy_id uuid NOT NULL,sequence integer NOT NULL CHECK(sequence BETWEEN 1 AND 1000),
 action text NOT NULL CHECK(action IN ('created','updated','enabled','disabled')),
 actor_id text NOT NULL CHECK(length(actor_id) BETWEEN 1 AND 256),
 revision integer NOT NULL CHECK(revision BETWEEN 1 AND 1000),
 summary text NOT NULL CHECK(length(summary) BETWEEN 3 AND 280),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(mode,workspace_id,project_id,audit_id),
 UNIQUE(mode,workspace_id,project_id,decoy_id,sequence),
 FOREIGN KEY(mode,workspace_id,project_id,decoy_id) REFERENCES sentinel.ghost_decoys ON DELETE RESTRICT
);
CREATE INDEX ghost_audit_decoy ON sentinel.ghost_audit(mode,workspace_id,project_id,decoy_id,sequence DESC);
REVOKE ALL ON sentinel.ghost_decoys,sentinel.ghost_audit FROM PUBLIC;
GRANT SELECT,INSERT ON sentinel.ghost_decoys TO wetscan_app;
GRANT UPDATE(name,target_ref,decoy_path,enabled,response_status,rate_limit_per_min,h07_proof_id,revision,updated_at) ON sentinel.ghost_decoys TO wetscan_app;
-- Audit is append-only: never updated or deleted by any runtime role.
GRANT SELECT,INSERT ON sentinel.ghost_audit TO wetscan_app;
GRANT SELECT ON sentinel.ghost_decoys,sentinel.ghost_audit TO wetscan_sentinel_worker;
DO $policies$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['ghost_decoys','ghost_audit'] LOOP
  EXECUTE format('ALTER TABLE sentinel.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE sentinel.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format($policy$CREATE POLICY ghost_scope ON sentinel.%I USING(mode='live' AND current_user IN ('wetscan_app','wetscan_sentinel_worker')
    AND current_setting('wetscan.module',true)='sentinel' AND mode=current_setting('wetscan.mode',true)
    AND workspace_id=current_setting('wetscan.workspace',true) AND project_id=current_setting('wetscan.project',true))
    WITH CHECK(mode='live' AND current_user='wetscan_app' AND current_setting('wetscan.module',true)='sentinel'
    AND mode=current_setting('wetscan.mode',true) AND workspace_id=current_setting('wetscan.workspace',true) AND project_id=current_setting('wetscan.project',true))$policy$,t);
  EXECUTE format('CREATE POLICY ghost_migration_read ON sentinel.%I FOR SELECT USING(current_user=''wetscan_migrator'')',t);
 END LOOP;
END;
$policies$;
