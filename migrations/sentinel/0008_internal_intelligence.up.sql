-- Additive S08. Internal Intelligence case library, human-reviewed rule candidates and append-only audit. No S01-S07 edits, no telemetry/incident replication, no backfill, no automatic rule enablement.
CREATE TABLE sentinel.intel_cases (
 mode text NOT NULL CHECK(mode='live'),workspace_id text NOT NULL,project_id text NOT NULL,case_id uuid NOT NULL,
 incident_id uuid NOT NULL,source_id uuid NOT NULL,rule_id uuid NOT NULL,rule_version integer NOT NULL CHECK(rule_version BETWEEN 1 AND 100),
 title text NOT NULL CHECK(length(title) BETWEEN 3 AND 160),
 category text NOT NULL CHECK(category IN ('authentication','http','decoy')),
 severity text NOT NULL CHECK(severity IN ('low','medium','high')),
 origin text NOT NULL CHECK(origin IN ('runtime','controlled_test')),
 incident_status_at_archive text NOT NULL CHECK(incident_status_at_archive IN ('open','investigating','closed')),
 incident_revision_at_archive integer NOT NULL CHECK(incident_revision_at_archive BETWEEN 1 AND 1000),
 incident_first_observed_at timestamptz NOT NULL,incident_last_observed_at timestamptz NOT NULL CHECK(incident_last_observed_at>=incident_first_observed_at),
 indicators jsonb NOT NULL CHECK(jsonb_typeof(indicators)='object' AND octet_length(indicators::text)<=4096),
 signature char(64) CHECK(signature IS NULL OR signature ~ '^[a-f0-9]{64}$'),
 grouping_version integer NOT NULL CHECK(grouping_version=1),
 tags text[] NOT NULL DEFAULT '{}' CHECK(cardinality(tags)<=10),
 status text NOT NULL DEFAULT 'draft_pending_review' CHECK(status IN ('draft_pending_review','reviewed','dismissed')),
 shelf_state text NOT NULL DEFAULT 'active' CHECK(shelf_state IN ('active','shelved')),
 archived_by text NOT NULL CHECK(length(archived_by) BETWEEN 1 AND 256),
 archived_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 revision integer NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 1000),
 PRIMARY KEY(mode,workspace_id,project_id,case_id),
 UNIQUE(mode,workspace_id,project_id,incident_id),
 FOREIGN KEY(mode,workspace_id,project_id) REFERENCES sentinel.project_bindings ON DELETE RESTRICT,
 FOREIGN KEY(mode,workspace_id,project_id,source_id) REFERENCES sentinel.telemetry_sources ON DELETE RESTRICT,
 FOREIGN KEY(mode,workspace_id,project_id,rule_id,rule_version) REFERENCES sentinel.detection_rule_versions ON DELETE RESTRICT
);
CREATE INDEX intel_cases_list ON sentinel.intel_cases(mode,workspace_id,project_id,archived_at DESC,case_id DESC);
CREATE INDEX intel_cases_signature ON sentinel.intel_cases(mode,workspace_id,project_id,origin,signature) WHERE signature IS NOT NULL;
-- Immutable references only (ids + coarse kind/time). Deliberately NO foreign key to telemetry_events: telemetry retention stays independent and missing evidence is reported honestly.
CREATE TABLE sentinel.intel_case_evidence (
 mode text NOT NULL,workspace_id text NOT NULL,project_id text NOT NULL,case_id uuid NOT NULL,source_id uuid NOT NULL,event_id uuid NOT NULL,
 event_kind text NOT NULL CHECK(event_kind IN ('auth.failed','http.suspicious_path','http.request','ghost.decoy_triggered')),
 occurred_at timestamptz NOT NULL,linked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(mode,workspace_id,project_id,case_id,source_id,event_id),
 FOREIGN KEY(mode,workspace_id,project_id,case_id) REFERENCES sentinel.intel_cases ON DELETE RESTRICT
);
CREATE TABLE sentinel.intel_candidates (
 mode text NOT NULL CHECK(mode='live'),workspace_id text NOT NULL,project_id text NOT NULL,candidate_id uuid NOT NULL,
 origin text NOT NULL CHECK(origin IN ('runtime','controlled_test')),
 signature char(64) NOT NULL CHECK(signature ~ '^[a-f0-9]{64}$'),grouping_version integer NOT NULL CHECK(grouping_version=1),
 definition jsonb NOT NULL CHECK(jsonb_typeof(definition)='object' AND definition->>'schemaVersion'='1'),
 basis jsonb NOT NULL CHECK(jsonb_typeof(basis)='object' AND octet_length(basis::text)<=8192),
 review_status text NOT NULL DEFAULT 'DRAFT' CHECK(review_status IN ('DRAFT','APPROVED','REJECTED')),
 reviewed_by text CHECK(reviewed_by IS NULL OR length(reviewed_by) BETWEEN 1 AND 256),reviewed_at timestamptz,
 review_reason text CHECK(review_reason IS NULL OR length(review_reason) BETWEEN 3 AND 280),
 validated_by text CHECK(validated_by IS NULL OR length(validated_by) BETWEEN 1 AND 256),validated_at timestamptz,
 promoted_rule_id uuid,promoted_by text CHECK(promoted_by IS NULL OR length(promoted_by) BETWEEN 1 AND 256),promoted_at timestamptz,
 proposed_by text NOT NULL CHECK(length(proposed_by) BETWEEN 1 AND 256),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 revision integer NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 1000),
 CHECK((review_status='DRAFT')=(reviewed_by IS NULL AND reviewed_at IS NULL AND review_reason IS NULL)),
 CHECK((validated_at IS NULL)=(validated_by IS NULL) AND (validated_at IS NULL OR review_status='APPROVED')),
 CHECK((promoted_rule_id IS NULL)=(promoted_at IS NULL) AND (promoted_at IS NULL)=(promoted_by IS NULL) AND (promoted_at IS NULL OR validated_at IS NOT NULL)),
 PRIMARY KEY(mode,workspace_id,project_id,candidate_id),
 UNIQUE(mode,workspace_id,project_id,origin,signature,grouping_version),
 FOREIGN KEY(mode,workspace_id,project_id) REFERENCES sentinel.project_bindings ON DELETE RESTRICT,
 FOREIGN KEY(mode,workspace_id,project_id,promoted_rule_id) REFERENCES sentinel.detection_rules(mode,workspace_id,project_id,rule_id) ON DELETE RESTRICT
);
CREATE INDEX intel_candidates_list ON sentinel.intel_candidates(mode,workspace_id,project_id,created_at DESC,candidate_id DESC);
CREATE TABLE sentinel.intel_candidate_cases (
 mode text NOT NULL,workspace_id text NOT NULL,project_id text NOT NULL,candidate_id uuid NOT NULL,case_id uuid NOT NULL,
 PRIMARY KEY(mode,workspace_id,project_id,candidate_id,case_id),
 FOREIGN KEY(mode,workspace_id,project_id,candidate_id) REFERENCES sentinel.intel_candidates ON DELETE RESTRICT,
 FOREIGN KEY(mode,workspace_id,project_id,case_id) REFERENCES sentinel.intel_cases ON DELETE RESTRICT
);
CREATE TABLE sentinel.intel_audit (
 mode text NOT NULL CHECK(mode='live'),workspace_id text NOT NULL,project_id text NOT NULL,audit_id uuid NOT NULL,
 case_id uuid,candidate_id uuid,CHECK((case_id IS NULL)<>(candidate_id IS NULL)),
 sequence integer NOT NULL CHECK(sequence BETWEEN 1 AND 1000),
 action text NOT NULL CHECK(action IN ('case_archived','case_tagged','case_annotated','case_status_changed','case_shelf_changed','candidate_proposed','candidate_approved','candidate_rejected','candidate_validated','candidate_promoted')),
 actor_id text NOT NULL CHECK(length(actor_id) BETWEEN 1 AND 256),revision integer NOT NULL CHECK(revision BETWEEN 1 AND 1000),
 summary text NOT NULL CHECK(length(summary) BETWEEN 3 AND 280),note text CHECK(note IS NULL OR length(note) BETWEEN 1 AND 500),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(mode,workspace_id,project_id,audit_id),
 FOREIGN KEY(mode,workspace_id,project_id,case_id) REFERENCES sentinel.intel_cases ON DELETE RESTRICT,
 FOREIGN KEY(mode,workspace_id,project_id,candidate_id) REFERENCES sentinel.intel_candidates ON DELETE RESTRICT
);
CREATE UNIQUE INDEX intel_audit_case_seq ON sentinel.intel_audit(mode,workspace_id,project_id,case_id,sequence) WHERE case_id IS NOT NULL;
CREATE UNIQUE INDEX intel_audit_candidate_seq ON sentinel.intel_audit(mode,workspace_id,project_id,candidate_id,sequence) WHERE candidate_id IS NOT NULL;
REVOKE ALL ON sentinel.intel_cases,sentinel.intel_case_evidence,sentinel.intel_candidates,sentinel.intel_candidate_cases,sentinel.intel_audit FROM PUBLIC;
GRANT SELECT,INSERT ON sentinel.intel_cases,sentinel.intel_candidates TO wetscan_app;
-- Provenance columns (incident/rule/indicators/signature) and candidate definition/basis are immutable: not updatable by any runtime role.
GRANT UPDATE(tags,status,shelf_state,revision,updated_at) ON sentinel.intel_cases TO wetscan_app;
GRANT UPDATE(review_status,reviewed_by,reviewed_at,review_reason,validated_by,validated_at,promoted_rule_id,promoted_by,promoted_at,revision,updated_at) ON sentinel.intel_candidates TO wetscan_app;
-- Evidence refs, candidate membership and audit are append-only: never updated or deleted by any runtime role.
GRANT SELECT,INSERT ON sentinel.intel_case_evidence,sentinel.intel_candidate_cases,sentinel.intel_audit TO wetscan_app;
-- Worker needs read access only so incident retention can pin incidents held by active cases.
GRANT SELECT ON sentinel.intel_cases TO wetscan_sentinel_worker;
DO $policies$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['intel_cases','intel_case_evidence','intel_candidates','intel_candidate_cases','intel_audit'] LOOP
  EXECUTE format('ALTER TABLE sentinel.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE sentinel.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format($policy$CREATE POLICY intel_scope ON sentinel.%I USING(mode='live' AND current_user IN ('wetscan_app','wetscan_sentinel_worker')
    AND current_setting('wetscan.module',true)='sentinel' AND mode=current_setting('wetscan.mode',true)
    AND workspace_id=current_setting('wetscan.workspace',true) AND project_id=current_setting('wetscan.project',true))
    WITH CHECK(mode='live' AND current_user='wetscan_app' AND current_setting('wetscan.module',true)='sentinel'
    AND mode=current_setting('wetscan.mode',true) AND workspace_id=current_setting('wetscan.workspace',true) AND project_id=current_setting('wetscan.project',true))$policy$,t);
  EXECUTE format('CREATE POLICY intel_migration_read ON sentinel.%I FOR SELECT USING(current_user=''wetscan_migrator'')',t);
 END LOOP;
END;
$policies$;
