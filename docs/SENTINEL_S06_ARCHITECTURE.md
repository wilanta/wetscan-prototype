# Sentinel S06 — Durable Notifications, Telegram First & Delivery Ledger

**Status: DEV accepted on an isolated throwaway PostgreSQL + loopback mock providers (19 Nov 2026). `live tested` against Telegram/Resend: NOT_RUN (no credentials were available; H04/H05 not yet exercised). WhatsApp: not integrated by design (H06).**
Brief: [CLAUDE_PLAN_S06_Notifications.md](../CLAUDE_PLAN_S06_Notifications.md). Validation evidence: [SENTINEL_S06_VALIDATION.md](SENTINEL_S06_VALIDATION.md). Migration review: [SENTINEL_S06_MIGRATION_REVIEW.md](SENTINEL_S06_MIGRATION_REVIEW.md).

## Answer to the architecture question
> *How should notification delivery reuse the S01 outbox while preserving the main worker's deliberate removal of provider environment variables?*

The S01 outbox is **storage + queue only** (`platform.notification_outbox` + `platform.jobs(kind='sentinel.outbox')`, claimed by nobody before S06). S06 keeps it as the single durable queue and splits the two halves across two processes:

| Half | Process / DB role | Provider secrets |
|---|---|---|
| **Produce** an intent, in the same transaction as the incident (`correlateAlertIncident` → `produceIncidentOpened`) | main Sentinel worker, `wetscan_sentinel_worker` | **none** — `worker/sentinel/main.ts` still deletes `AUTH_/GITHUB_/TELEGRAM_/RESEND_/WHATSAPP_/AWS_` env (unchanged, now test-guarded) |
| **Request** a test/manual retry (user action) | Next.js app, `wetscan_app` | none |
| **Deliver** (claim → lease → provider call → durable ack) | **`worker/notifier/main.ts`**, a separate process authenticating as the new **`wetscan_sentinel_notifier`** role | only here: `TELEGRAM_BOT_TOKEN[_FILE]`, `RESEND_API_KEY[_FILE]`, `NOTIFICATION_FROM_EMAIL` |

The notifier role can only see/claim `kind='sentinel.outbox'` jobs of **one approved project scope** (RLS), can update only ledger *progress* columns, and cannot write channels, consent, destinations, audit or any telemetry/detection/incident/response table. The main worker never imports `notifications/providers.ts` (static test).

### ADR-1 — where does delivery run?
| Option | Verdict |
|---|---|
| **A. Dedicated notifier process + dedicated DB role (chosen)** | Secrets and the ability to make outbound provider calls exist only in a process whose DB authority is nearly nil. A compromised worker/app can enqueue but not send or read secrets; a compromised notifier cannot alter detections, incidents, consent or destinations. Cost: one extra role (separate review file), one extra process/port (3113), module-wide `max_running=2` shared with the worker. |
| B. Separate process, *same* `wetscan_sentinel_worker` role | Smaller change, but the secret-holding, internet-facing process would carry full worker DB write authority. Rejected (least privilege). |
| C. Deliver inside the main worker, pass-through the env | Rejected: removes the deliberate protection the brief forbids relaxing. |

### ADR-2 — what is the unit of idempotency?
Ledger unique key `(project, channel, dedup_key)`; `dedup_key = incident:<incidentId>:opened` (producer) / `test:<client key>` / `retry:<id>:<client key>`. The outbox delivery id is a deterministic UUIDv5-style hash of `(scope, channel, dedup_key)` and its outbox idempotency key is `notif:<channel>:<dedup_key>`, so a replayed alert, a re-run correlation, a concurrent producer, or an `append` replay all converge on the same rows. Rejected alternative: per-alert fan-out (one message per alert) — violates "do not send one message per raw event".

### ADR-3 — at-least-once vs at-most-once provider calls
Chosen **at-least-once with an honest ledger**. State `attempted` is committed *before* the provider call. If the process dies in between, the reclaim records `reason=previous_attempt_outcome_unknown` and re-sends once (possible duplicate message, never a phantom "delivered"). Network timeouts are *ambiguous* (`unknown`), never reported as failure with certainty, and an exhausted ambiguous delivery ends as `unknown` + dead letter. Rejected: at-most-once (could silently lose a security alert).

## Data model (`migrations/sentinel/0006_notifications.{up,down}.sql`, additive; no second outbox)
- `sentinel.notification_channels` — per project × channel (`telegram|email|whatsapp`): enabled, destination (+hash), `consent_at/by`, `min_severity`, trigger filter (`incident_opened`), `include_controlled_test`, quiet hours (IANA timezone, start/end minute, may cross midnight), `throttle_per_hour`, revision. CHECKs: **enabled ⇒ consent+destination**; **WhatsApp can never be enabled**; quiet hours need tz and start≠end.
- `sentinel.notification_deliveries` — the **ledger**: `pending | attempted | provider_accepted | delivered | failed | unknown | suppressed`, reason code, attempts, next attempt, provider message id, `dead_letter`, `retry_of`, redacted payload (≤2 KB: severity/title/incident id/origin). CHECKs: `provider_accepted` needs a provider message id; **`delivered` needs `delivery_evidence_ref`** (no S06 code path sets it); suppressed/failed need a reason. UI-only `preview` is never stored.
- `sentinel.notification_audit` — append-only (app INSERT+SELECT only): channel configured, consent granted/revoked, enable/disable, destination changed, test requested, manual retry.
- All three: `mode='live'`, `FORCE ROW LEVEL SECURITY`, scope policy on `wetscan.{module,mode,workspace,project}`; `WITH CHECK` makes the **app able to create only `pending` test/retry requests, the worker only `pending`/`suppressed` incident intents, and only the notifier able to advance state**.
- RLS/GRANTs added for the notifier on `platform.{jobs(kind outbox only),job_attempts,notification_outbox,notification_attempts,module_limits(lock only, WITH CHECK false),project_bindings}`.
- Retention: worker deletes *terminal* ledger rows after 30 days (`retainNotifications`, no row lock — the worker has no UPDATE); `pending/attempted` rows are never deleted. Outbox/job retention is the existing S01 `retainInfrastructure`.

## Flow
```mermaid
sequenceDiagram
  participant W as Sentinel worker (worker role)
  participant DB as PostgreSQL
  participant N as Notifier (notifier role + provider secrets)
  participant P as Telegram / Resend
  W->>DB: tx: incident created → produceIncidentOpened (SAVEPOINT)
  Note over W,DB: per channel: filters, consent, severity, throttle, quiet hours → ledger row (+ outbox + job only if pending)
  N->>DB: sweep dead letters; claim sentinel.outbox job (lease, fence, heartbeat)
  N->>DB: prepare: re-check consent/enabled/destination hash/quiet hours; state=attempted (committed)
  N->>P: sendMessage / POST /emails (timeout 8 s, bounded response, no redirects)
  alt accepted
    N->>DB: ledger provider_accepted (+id); recordAttempt(accepted) completes job
  else 429 / 5xx / timeout
    N->>DB: attempted|unknown + reason; jittered backoff ≥ retry-after (cap 15 min); max 5 attempts
  else 400/401/403/no secret
    N->>DB: failed + dead_letter; job cancelled (manual retry only)
  end
```

## Behavior rules
- **Producer** (`notifications/store.ts` `produceIncidentOpened`): only `runtime` and `controlled_test` incidents; demo/fixture/observed-scan origins never produce. Reasons recorded for suppression: `channel_disabled`, `consent_missing`, `channel_unavailable`, `trigger_filtered`, `controlled_test_excluded`, `severity_below_minimum`, `throttled`, `enqueue_failed`; quiet hours **defer** (`deferred_quiet_hours`, availability = window end, capped at 12 h). Savepoint-isolated: a notification fault can never fail detection/incident creation.
- **Send-time re-check** (fail closed): consent revoked, channel disabled, WhatsApp, or destination hash ≠ the intent's ⇒ `suppressed` (job cancelled, provider never called); quiet hours re-evaluated.
- **Enablement gate**: consent *and* a provider-accepted **test** to the *current* destination (derived from the ledger, not a forgeable column). Changing/removing the destination clears consent, enablement and verification.
- **Manual retry**: only `failed`/`unknown` non-test deliveries, only while the channel is enabled+consented, one in flight, idempotent by client key, creates a *new* linked delivery (history is preserved); audited.
- **Message**: plain text (no parse mode ⇒ nothing to escape), ≤1000 chars, control characters stripped, token/bearer/key/long-hex/URL-credential redaction, no links, states "provider acceptance is not a read receipt". Recipients come only from owner-configured destinations; telemetry never supplies one.
- **Providers**: Telegram `sendMessage` (200 ⇒ `provider_accepted` with `message_id`; 429 ⇒ retry-after; 5xx ⇒ retry; 401/403/400/404 ⇒ permanent codes; network/timeout ⇒ ambiguous). Resend adapter behind the same `SenderPort` (Idempotency-Key = delivery id; **no delivery webhooks ⇒ email never reaches `delivered`**). WhatsApp: no adapter; UI shows `Requires business setup · Not configured`.
- **Secrets**: file-based (`*_FILE`, absolute path) or env; re-read every `SENTINEL_NOTIFIER_SECRET_TTL_MS` (default 15 s) so rotation/revocation needs no restart; never logged, stored, or returned; error text is reduced to fixed codes; `TELEGRAM_API_BASE_URL`/`RESEND_API_BASE_URL` overrides are honoured only for a loopback `http://127.0.0.1:<port>` mock.

## Activation (fail-closed)
The notifier starts only with `SENTINEL_NOTIFIER_ENABLED=1` **and** an owner approval (sealed to the migration-plan hash and DB marker) containing
`"notifications": {"mode":"live","workspaceId":…,"projectId":…,"notBefore":…,"channels":["telegram"|"email"],"approvedUse":"owner_controlled_notifications"}` (WhatsApp can never be listed). No block ⇒ `not_configured`, exit 2, no DB connection. Env names (names only): `SENTINEL_NOTIFIER_ENABLED`, `SENTINEL_DB_NOTIFIER_PASSWORD_FILE`, `SENTINEL_NOTIFIER_HEALTH_PORT` (3113), `SENTINEL_NOTIFIER_SECRET_TTL_MS`, `TELEGRAM_BOT_TOKEN`/`_FILE`, `RESEND_API_KEY`/`_FILE`, `NOTIFICATION_FROM_EMAIL`; plus the usual `SENTINEL_DB_*`. Template: `infra/sentinel/notifier.env.example`. Start: `npm run sentinel:notifier`.

## API & UI
`GET /api/sentinel/projects/[projectId]/notifications?view=channels|deliveries`; `POST` commands `save_channel | test | retry` (≤4 KB, same-origin, strict keys; scope, recipients, free text and secrets are rejected). There is deliberately **no** endpoint that sends arbitrary text/recipients. UI: `/app/projects/github-<id>/sentinel/notifications` (live projects only; nav link from Telegram/Incident pages). **Orderly Demo is unchanged**: `/app/notifications` and `/app/integrations` remain local previews and make no API/provider request (browser-asserted).

## Interfaces with other packages
S01 outbox/queue reused unchanged; S03/S04 gain one in-transaction call in `correlateAlertIncident`; S05 untouched except a one-token route guard fix (see below); S07+ may add triggers by extending `trigger` CHECK + `produce*` (e.g. `mitigation_applied`, `neutralization_verified` map to existing `NotificationMessage` triggers; not enabled in S06).

## Incidental fix
The live project route guard (`src/app/app/projects/[projectId]/sentinel/[[...section]]/page.tsx`) did not list `responses`, so the S05 live Responses page returned 404 for real projects (browser specs use a fixture route, so it was never caught). `responses` and `notifications` are now allowed. S05 live-application testing remains `NOT_RUN`.

## Residual risks / limitations
1. **No live provider proof**: Telegram/Resend were exercised only against mocks/loopback (A5 `NOT_RUN`).
2. At-least-once: a crash between provider acceptance and ledger commit can produce a duplicate message (recorded as `previous_attempt_outcome_unknown`).
3. Telegram/Resend acceptance never becomes `delivered`; Resend webhooks (signed) are not implemented.
4. Notifier and worker share `module_limits.max_running=2`; a saturated worker delays notifications.
5. One approved project scope per notifier process; multi-project needs several approvals/processes.
6. Dev DB upgrade (0005+0006, role provisioning, new approval hash) is a human step (H-S06-ROLE); not run against the owner dev database.
7. A compromised app role could create `pending` test/retry intents (bounded: needs consent+verified destination, ≤5 tests/hour/channel, throttled) but cannot change state, destination hash history, or send arbitrary text.
