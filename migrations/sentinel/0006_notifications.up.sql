-- Additive S06. Per-project notification channels, a delivery ledger, an append-only config audit, and a dedicated
-- credential-isolated sender role (wetscan_sentinel_notifier, provisioned separately; GRANTs below fail closed if absent).
-- NO second outbox: delivery intents reuse platform.notification_outbox + platform.jobs(kind 'sentinel.outbox').
CREATE TABLE sentinel.notification_channels (
 mode text NOT NULL CHECK(mode='live'),workspace_id text NOT NULL,project_id text NOT NULL,
 channel text NOT NULL CHECK(channel IN ('telegram','email','whatsapp')),
 enabled boolean NOT NULL DEFAULT false,
 destination text CHECK(destination IS NULL OR length(destination) BETWEEN 3 AND 320),
 destination_hash char(64) CHECK(destination_hash IS NULL OR destination_hash ~ '^[a-f0-9]{64}$'),
 consent_at timestamptz,consent_by text CHECK(consent_by IS NULL OR length(consent_by) BETWEEN 1 AND 256),
 min_severity text NOT NULL DEFAULT 'high' CHECK(min_severity IN ('low','medium','high')),
 triggers text[] NOT NULL DEFAULT ARRAY['incident_opened']::text[] CHECK(triggers <@ ARRAY['incident_opened']::text[] AND cardinality(triggers)<=4),
 include_controlled_test boolean NOT NULL DEFAULT false,
 quiet_enabled boolean NOT NULL DEFAULT false,
 quiet_timezone text CHECK(quiet_timezone IS NULL OR length(quiet_timezone) BETWEEN 1 AND 64),
 quiet_start_minute smallint CHECK(quiet_start_minute IS NULL OR quiet_start_minute BETWEEN 0 AND 1439),
 quiet_end_minute smallint CHECK(quiet_end_minute IS NULL OR quiet_end_minute BETWEEN 0 AND 1439),
 throttle_per_hour smallint NOT NULL DEFAULT 10 CHECK(throttle_per_hour BETWEEN 1 AND 60),
 revision integer NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 100000),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(mode,workspace_id,project_id,channel),
 FOREIGN KEY(mode,workspace_id,project_id) REFERENCES sentinel.project_bindings ON DELETE RESTRICT,
 -- Enabled requires explicit consent + a destination; WhatsApp can never be enabled (H06 deferred).
 CHECK(NOT enabled OR (consent_at IS NOT NULL AND consent_by IS NOT NULL AND destination IS NOT NULL AND destination_hash IS NOT NULL)),
 CHECK(channel<>'whatsapp' OR NOT enabled),
 CHECK(NOT quiet_enabled OR (quiet_timezone IS NOT NULL AND quiet_start_minute IS NOT NULL AND quiet_end_minute IS NOT NULL AND quiet_start_minute<>quiet_end_minute))
);
CREATE TABLE sentinel.notification_deliveries (
 mode text NOT NULL CHECK(mode='live'),workspace_id text NOT NULL,project_id text NOT NULL,
 delivery_id text NOT NULL CHECK(length(delivery_id) BETWEEN 1 AND 256),
 channel text NOT NULL CHECK(channel IN ('telegram','email','whatsapp')),
 trigger text NOT NULL CHECK(trigger IN ('incident_opened','test','manual_retry')),
 subject_ref text NOT NULL CHECK(length(subject_ref) BETWEEN 1 AND 256),
 origin text NOT NULL CHECK(origin IN ('runtime','controlled_test')),
 dedup_key text NOT NULL CHECK(length(dedup_key) BETWEEN 1 AND 200),
 state text NOT NULL CHECK(state IN ('pending','attempted','provider_accepted','delivered','failed','unknown','suppressed')),
 reason text CHECK(reason IS NULL OR length(reason) BETWEEN 1 AND 64),
 destination_hash char(64) CHECK(destination_hash IS NULL OR destination_hash ~ '^[a-f0-9]{64}$'),
 payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=2048),
 attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 10),
 last_attempt_at timestamptz,next_attempt_at timestamptz,
 provider_message_id text CHECK(provider_message_id IS NULL OR length(provider_message_id) BETWEEN 1 AND 128),
 provider_accepted_at timestamptz,delivered_at timestamptz,
 delivery_evidence_ref text CHECK(delivery_evidence_ref IS NULL OR length(delivery_evidence_ref) BETWEEN 1 AND 256),
 dead_letter boolean NOT NULL DEFAULT false,
 retry_of text CHECK(retry_of IS NULL OR length(retry_of) BETWEEN 1 AND 256),
 created_by text NOT NULL CHECK(length(created_by) BETWEEN 1 AND 256),
 revision integer NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 1000),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 finished_at timestamptz,
 PRIMARY KEY(mode,workspace_id,project_id,delivery_id),
 UNIQUE(mode,workspace_id,project_id,channel,dedup_key),
 FOREIGN KEY(mode,workspace_id,project_id) REFERENCES sentinel.project_bindings ON DELETE RESTRICT,
 -- Provider acceptance is not delivery: `delivered` needs verified provider evidence, acceptance needs a provider message id.
 CHECK(state NOT IN ('provider_accepted','delivered') OR (provider_message_id IS NOT NULL AND provider_accepted_at IS NOT NULL)),
 CHECK(state<>'delivered' OR (delivered_at IS NOT NULL AND delivery_evidence_ref IS NOT NULL)),
 CHECK(state NOT IN ('suppressed','failed') OR reason IS NOT NULL)
);
CREATE INDEX notification_deliveries_project ON sentinel.notification_deliveries(mode,workspace_id,project_id,created_at DESC,delivery_id DESC);
CREATE INDEX notification_deliveries_throttle ON sentinel.notification_deliveries(mode,workspace_id,project_id,channel,created_at) WHERE state<>'suppressed';
CREATE INDEX notification_deliveries_retention ON sentinel.notification_deliveries(mode,workspace_id,project_id,finished_at) WHERE finished_at IS NOT NULL;
CREATE TABLE sentinel.notification_audit (
 mode text NOT NULL CHECK(mode='live'),workspace_id text NOT NULL,project_id text NOT NULL,
 audit_id uuid NOT NULL,channel text NOT NULL CHECK(channel IN ('telegram','email','whatsapp')),
 event_type text NOT NULL CHECK(event_type IN ('channel_configured','consent_granted','consent_revoked','channel_enabled','channel_disabled','destination_changed','test_requested','manual_retry_requested')),
 actor_id text NOT NULL CHECK(length(actor_id) BETWEEN 1 AND 256),
 summary text NOT NULL CHECK(length(summary) BETWEEN 3 AND 280),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(metadata)='object' AND octet_length(metadata::text)<=1024),
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(mode,workspace_id,project_id,audit_id),
 FOREIGN KEY(mode,workspace_id,project_id) REFERENCES sentinel.project_bindings ON DELETE RESTRICT
);
REVOKE ALL ON sentinel.notification_channels,sentinel.notification_deliveries,sentinel.notification_audit FROM PUBLIC;
-- Interactive app: configure channels, request tests/retries (inserts a `pending` ledger row only), read history.
GRANT SELECT,INSERT ON sentinel.notification_channels TO wetscan_app;
GRANT UPDATE(enabled,destination,destination_hash,consent_at,consent_by,min_severity,triggers,include_controlled_test,quiet_enabled,quiet_timezone,quiet_start_minute,quiet_end_minute,throttle_per_hour,revision,updated_at) ON sentinel.notification_channels TO wetscan_app;
GRANT SELECT,INSERT ON sentinel.notification_deliveries TO wetscan_app;
GRANT SELECT,INSERT ON sentinel.notification_audit TO wetscan_app;
-- Detection worker: producer only (reads config, writes pending/suppressed intents in the incident transaction) + retention.
GRANT SELECT ON sentinel.notification_channels TO wetscan_sentinel_worker;
GRANT SELECT,INSERT,DELETE ON sentinel.notification_deliveries TO wetscan_sentinel_worker;
-- Sender: reads config, finalizes ledger rows. Cannot write config, consent, destinations or audit.
GRANT USAGE ON SCHEMA platform,sentinel TO wetscan_sentinel_notifier;
GRANT SELECT ON platform.schema_migrations TO wetscan_sentinel_notifier;
GRANT SELECT ON sentinel.notification_channels TO wetscan_sentinel_notifier;
GRANT SELECT ON sentinel.notification_deliveries TO wetscan_sentinel_notifier;
GRANT UPDATE(state,reason,attempt_count,last_attempt_at,next_attempt_at,provider_message_id,provider_accepted_at,delivered_at,delivery_evidence_ref,dead_letter,revision,updated_at,finished_at) ON sentinel.notification_deliveries TO wetscan_sentinel_notifier;
GRANT SELECT,UPDATE(last_cleanup_at) ON sentinel.project_bindings TO wetscan_sentinel_notifier;
GRANT SELECT ON platform.jobs,platform.notification_outbox,platform.notification_attempts,platform.job_attempts,platform.module_limits TO wetscan_sentinel_notifier;
GRANT UPDATE(state,attempts,fence,revision,lease_owner,lease_token,lease_until,lease_ms,finished_at,last_error,available_at,cancel_requested) ON platform.jobs TO wetscan_sentinel_notifier;
GRANT INSERT,UPDATE(outcome,finished_at) ON platform.job_attempts TO wetscan_sentinel_notifier;
GRANT UPDATE(state,finished_at) ON platform.notification_outbox TO wetscan_sentinel_notifier;
GRANT INSERT ON platform.notification_attempts TO wetscan_sentinel_notifier;
GRANT UPDATE(max_running) ON platform.module_limits TO wetscan_sentinel_notifier; -- row lock only; WITH CHECK(false) forbids any write

DO $policies$
DECLARE t text;
 scope_sql text := $s$mode='live' AND current_setting('wetscan.module',true)='sentinel' AND mode=current_setting('wetscan.mode',true)
  AND workspace_id=current_setting('wetscan.workspace',true) AND project_id=current_setting('wetscan.project',true)$s$;
BEGIN
 FOREACH t IN ARRAY ARRAY['notification_channels','notification_deliveries','notification_audit'] LOOP
  EXECUTE format('ALTER TABLE sentinel.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE sentinel.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY notification_migration_read ON sentinel.%I FOR SELECT USING(current_user=''wetscan_migrator'')',t);
 END LOOP;
 EXECUTE format($p$CREATE POLICY notification_scope ON sentinel.notification_channels USING(%1$s AND current_user IN ('wetscan_app','wetscan_sentinel_worker','wetscan_sentinel_notifier'))
  WITH CHECK(%1$s AND current_user='wetscan_app')$p$,scope_sql);
 -- Ledger rows: the app can only create `pending` requests, the producer only `pending`/`suppressed`; only the sender advances state.
 EXECUTE format($p$CREATE POLICY notification_scope ON sentinel.notification_deliveries USING(%1$s AND current_user IN ('wetscan_app','wetscan_sentinel_worker','wetscan_sentinel_notifier'))
  WITH CHECK(%1$s AND (current_user='wetscan_sentinel_notifier' OR (current_user='wetscan_app' AND state='pending' AND trigger IN ('test','manual_retry'))
   OR (current_user='wetscan_sentinel_worker' AND trigger='incident_opened' AND state IN ('pending','suppressed'))))$p$,scope_sql);
 EXECUTE format($p$CREATE POLICY notification_scope ON sentinel.notification_audit USING(%1$s AND current_user IN ('wetscan_app'))
  WITH CHECK(%1$s AND current_user='wetscan_app')$p$,scope_sql);
 -- Sender RLS on shared platform tables: one approved scope, outbox jobs only.
 EXECUTE format($p$CREATE POLICY notifier_scope ON platform.jobs USING(current_user='wetscan_sentinel_notifier' AND %1$s AND module='sentinel' AND kind='sentinel.outbox')
  WITH CHECK(current_user='wetscan_sentinel_notifier' AND %1$s AND module='sentinel' AND kind='sentinel.outbox')$p$,scope_sql);
 EXECUTE format($p$CREATE POLICY notifier_scope ON platform.notification_outbox USING(current_user='wetscan_sentinel_notifier' AND %1$s AND module='sentinel')
  WITH CHECK(current_user='wetscan_sentinel_notifier' AND %1$s AND module='sentinel')$p$,scope_sql);
 EXECUTE format($p$CREATE POLICY notifier_scope ON platform.notification_attempts USING(current_user='wetscan_sentinel_notifier' AND %1$s AND module='sentinel')
  WITH CHECK(current_user='wetscan_sentinel_notifier' AND %1$s AND module='sentinel')$p$,scope_sql);
 EXECUTE format($p$CREATE POLICY notifier_scope ON platform.job_attempts USING(current_user='wetscan_sentinel_notifier' AND %1$s AND module='sentinel'
  AND EXISTS(SELECT 1 FROM platform.jobs j WHERE j.module=job_attempts.module AND j.mode=job_attempts.mode AND j.workspace_id=job_attempts.workspace_id AND j.project_id=job_attempts.project_id AND j.job_id=job_attempts.job_id AND j.kind='sentinel.outbox'))
  WITH CHECK(current_user='wetscan_sentinel_notifier' AND %1$s AND module='sentinel')$p$,scope_sql);
 CREATE POLICY notifier_read ON platform.module_limits FOR SELECT USING(module='sentinel' AND current_user='wetscan_sentinel_notifier');
 CREATE POLICY notifier_lock ON platform.module_limits FOR UPDATE USING(module='sentinel' AND current_user='wetscan_sentinel_notifier') WITH CHECK(false);
 EXECUTE format($p$CREATE POLICY notifier_scope ON sentinel.project_bindings USING(current_user='wetscan_sentinel_notifier' AND %1$s)
  WITH CHECK(current_user='wetscan_sentinel_notifier' AND %1$s)$p$,scope_sql);
END;
$policies$;
