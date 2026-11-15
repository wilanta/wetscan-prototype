# S03 authenticated rule and alert API

All routes are additive under `/api/sentinel/projects/github-<repositoryId>`. Existing session, fresh Canvas/Sentinel project authorization and server-derived workspace apply on every request. Writes use existing same-origin protection; replies are private/no-store, no-referrer, nosniff. No internal worker endpoint or new OAuth. Unknown/forbidden projects are masked 404; database/approval failure is sanitized 503. Rule writes stream at most 8192 bytes, JSON only, five-second body deadline.

- `GET /rules` → `{rules: DetectionRule[]}` (at most 25).
- `GET /rules?ruleId=<UUID>` → `{rule,versions,audit,evaluations,suppressedEvidence}`. Immutable definitions/audit at most100 each, recent evaluations50, linked suppressed evidence500. No credentials or raw events returned.
- `POST /rules` with `{action:"create",definition}` → 201 `{ruleId,revision:1}`; always DRAFT.
- `POST /rules` with `{action:"update",ruleId,expectedRevision,definition}` → new DRAFT revision; an enabled rule must be disabled first.
- `POST /rules` with `{action:"enable"|"disable",ruleId,expectedRevision}` → `{ruleId,revision,status}`; append immutable version/audit. Stale revision409, invalid transition409, actor-based enable409 `actor_identity_not_persisted`.
- `POST /rules` with `{action:"seed"}` → idempotent opt-in example DRAFT IDs. Never auto-enables, rewrites existing drafts or replays old events.
- `GET /alerts` → `{items:SecurityAlert[],nextCursor,window:{from,to}}`. Optional `severity=low|medium|high`, `ruleId`, `sourceId`, UTC `from`,`to`, `limit=1..100` (default50), `cursor`. Default24h, max31days. Filters/scope/window bind the cursor; descending exact database `(detected_at,alert_id)` preserves PostgreSQL microseconds.
- `GET /alerts?alertId=<UUID>` → `{alert,definition,evidence}`. Evidence is actual redacted StoredSecurityEvent records with exact rule version, source and origin. Detail ID cannot be combined with list filters.

Unknown/repeated keys and unsupported fields/operators are rejected. Definitions require every field, schemaVersion1, name<=80, description<=400, category authentication/http/decoy, severity low/medium/high, confidence integer0..100, unique supported eventKinds1..4, conditions0..8, correlation source/actor_hash, windowSeconds1..3600, threshold1..500, cooldownSeconds0..86400 and suppressionWindows0..8. Each suppression window is `{from,to}` UTC with positive length <=7days. Drafts may record unsupported actor correlation; enable refuses it.

Conditions are AND-only: request.statusCode and attributes.durationMs support eq/gte/lte with bounded integer values; request.method and attributes.reasonCode support eq with the S02 allowlist. No IP, full path, user-agent, raw body, SQL, JavaScript or executable expression is available. Source/project fields are never producer-selected rule scope.

Alert severity/confidence come from the reviewed exact rule version, not sender severity hints. `origin=controlled_test` stays visible. Alert creation does not open an incident, execute a response or deliver notifications. Suppression outcomes are in rule evaluation history and retain genuine evidence links.

Rule names/descriptions are bounded operator-authored labels; do not put passwords, personal identifiers or other secrets in them. S03 does not infer actor identity from these labels or request metadata. Processing failures persist in the existing scoped queue/attempt ledger and degrade worker health; they are distinct from insufficient-evidence and not-applicable evaluation outcomes.
