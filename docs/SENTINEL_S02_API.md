# S02 telemetry wire/API contracts

## S02 final review and publication authorization - 15 November 2026

The owner explicitly approved final S02 review, commit, push and a PR targeting master in this conversation. No merge, migration, deployment, production change, worker activation or S03 is authorized. All55reviewed files remain in approved S02 scope: authenticated telemetry/source lifecycle, strict ingestion/redaction/idempotency, additive0002SQL, isolated maintenance retention, opt-in sender, existing-UI integration and scoped test/documentation evidence. Existing Auth/Guard/Canvas, frozen contracts, original shared dispatcher and Demo body remain unchanged; the reviewed AppShell links and Sentinel wrapper are the narrow S02 integration. Latest origin/master fetched at e39b01da167052b8ef9b0ebe369a757fdea729bf, identical to branch base; no conflict or unrelated change found. No dependency/lockfile change.

Fresh finalization checks: typecheck PASS; ESLint PASS; complete unit/contract suite489/489PASS in33files,10.27s; production build PASS with private dotenv loading disabled; unchanged original browser regressions6/6PASS in one standalone3.3minute run; unchanged mocked-transport telemetry browser suite5/5PASS in23.1s. All exits0; no retries, timeout changes or assertion weakening. Original first case59.1s against60s remains a timing limitation; Next reported slow OneDrive filesystem. Browser evidence is fixture-based and separate from prior genuine H02. Existing PostgreSQL TEST suites, H02 HTTP/DB/UI/credential/restart and worker lifecycle were NOT RERUN. No DB connection/migration or main worker/emitter/scanner started in finalization. Existing H02 keys remain revoked/source disabled/runtime approvals closed.

Review corrected one documentation overstatement: the production Load older events button has not been browser-tested; actual API cursor pagination passed and remains distinct. No implementation, migration SQL or permission change, so prior PostgreSQL/H02 acceptance remains applicable. Retained helper/date-input failures stay visible. No raw private database snapshots, credentials, passwords, tokens, local approval/env files or runtime artifacts are included. Final private-argument scans and staged-manifest/whitespace checks precede commit; raw evidence remains ignored.

GitHub read-only checks: master unprotected, protection endpoint404, active branch rules empty; no configured required status checks. No GitHub Actions workflow directory exists in this checkout. Available PR/commit checks will be queried after push/PR; do not interpret absence of enforced checks as independent review approval. No manual Vercel deployment or cloud PostgreSQL configuration is permitted. Commit SHA/PR URL and live check results are reported in the final publication response and PR, not invented in this pre-commit document.

## Prior H02 acceptance and approval-gate record (historical)

**Current H02, 15 November 2026 (Asia/Jakarta): COMPLETE for bounded local controlled-test integration.** Owner explicitly changed the approved target from wilanta/wetscan-prototype to owned wilanta/portfolio (github-998736528). Real interactive GitHub login and fresh existing Auth/Canvas authority verified; workspace github-user-187839747:test. Exact approved wetscan_dev/marker/plan and unchanged prior catalog/data/roles verified before activation. One local/controlled_test source,8persisted events,6receipts and8queued accepted-job references retained. Real HTTP, PostgreSQL, Event Explorer, credential lifecycle, isolation and app-restart evidence passed. Both keys revoked, source disabled, emitter opt-ins zero, runtime approval consumed/closed; app/main-worker/emitter/capture/scanner processes stopped, listeners3000/3112/3113 zero. No migrations, TEST access, production, S03 or publication. Prior489units/typecheck/lint/build,6original-browser/5telemetry-browser and PG-suite evidence are historical, NOT RERUN. S02 is ready for final review; commit/push/PR requires separate owner approval. [Actual H02 evidence](SENTINEL_S02_VALIDATION.md), [handoff](agent-handoffs/HANDOFF_S02.md).

## Earlier status and preparation evidence (historical)

Implementation is prepared; real PostgreSQL/GitHub-project end-to-end acceptance remains BLOCKED. All API responses are private/no-store, no-referrer and nosniff. No permissive CORS or cookie-based ingest is added.

## Control plane

`GET /api/sentinel/projects/github-<id>/sources` -> `{sources: SourceView[]}`. `GET /api/sentinel/projects/github-<id>/events` -> `{items: StoredSecurityEvent[], nextCursor: string|null, window:{from,to}}`. Both use existing session/onboarding/current repository authority on every request. Unknown/forbidden projects are masked 404. No existing plaintext credential is returned.

`POST /api/sentinel/projects/github-<id>/sources`, JSON, same-origin existing Auth protection:

```json
{"action":"create","ownedApplicationConfirmed":true,"source":{"name":"Owned local app","environment":"local","origin":"controlled_test","retentionDays":7,"rateLimit":1000}}
```

Environment: `local|staging|production`; provenance: `runtime|controlled_test` and immutable. Create 201 -> `{sourceId,credentialId,credential,showOnce:true}`. Credential is a private server-side sender secret, never a `NEXT_PUBLIC_*` value. Name must begin with a letter, contain <=60 ASCII label characters and no uninterrupted 25-character opaque string. Retention 1–30 days; rate 1–6,000 events/minute. Unknown fields rejected.

Other actions use exactly `{action:"rotate"|"revoke"|"disable"|"enable",sourceId:"<UUID>"}`. Rotate 200 returns the same one-time credential response shape; all old active credentials are revoked immediately. Other actions 200 -> `{sourceId}`. Rotation of a disabled source is 409; enable does not undo revocations. No environment/provenance edit or destructive delete API is provided.

SourceView extends frozen TelemetrySource with `name,enabled,activeCredentials,lastContactAt,retentionDays,rateLimit`. Existing fields include `schemaVersion,revision,mode,workspaceId,projectId,sourceId,origin,environment,status,lastIngestedAt`. Status thresholds are in the architecture. Names and timestamps are actual persisted records, not demo rows.

Event query parameters: optional `sourceId` UUID, `eventId` UUID, `kind`, `severity` (`info|low|medium|high`), UTC ISO `from`,`to`, `limit` (1–100), `cursor`. Unknown/repeated parameters rejected. Default window 24 hours, maximum 31 days. Preserve the same filters/window when sending nextCursor; a cursor from another project/filter/window is rejected. Empty authorized result is `{items:[],nextCursor:null,window:...}`, not synthetic records.

## Ingest plane

`POST /api/sentinel/ingest`, JSON, `Authorization: Bearer <private ingest credential>`. No query parameters, cookies as authority, redirects or credentials in URL/body. Missing/malformed/revoked/disabled/wrong-scope credential -> generic 401. Credential routing fields merely select a candidate; the complete stored hash and enabled binding/source authenticate it.

```json
{
  "schemaVersion":1,
  "batchId":"00000000-0000-4000-8000-000000000001",
  "sentAt":"2026-11-14T08:00:00.000Z",
  "events":[{
    "schemaVersion":1,
    "eventId":"00000000-0000-4000-8000-000000000002",
    "projectId":"github-123",
    "occurredAt":"2026-11-14T08:00:00.000Z",
    "kind":"auth.failed",
    "severityHint":"info",
    "request":{"method":"POST","routeTemplate":"/api/auth/login","statusCode":401},
    "attributes":{"reasonCode":"invalid_credentials","durationMs":5}
  }]
}
```

This is an illustrative payload, not an actual accepted event; generate fresh UUIDs/timestamps. Allowed kinds are exactly `auth.failed`, `http.suspicious_path`, `http.request`, `ghost.decoy_triggered`. This last family is a wire type; S02 does not install a Ghost decoy. ProjectId is mandatory to match frozen v1 and must equal the authenticated source's stored project; sending another value cannot choose a tenant. Workspace/source/provenance/environment are never accepted from the payload.

Request methods: GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS; status 100–599. Allowlisted reasonCode values: invalid_credentials, unauthorized, forbidden, not_found, suspicious_path, controlled_probe, decoy_hit, request_completed. Other strings become `redacted`. Duration 0–3,600,000 ms. ActorHash, if present, must be lowercase 64-hex but is discarded. Attributes.controlled may be Boolean but is discarded. All other attributes and sensitive request/event fields are rejected. No free text/details object is accepted.

New batch: 202 -> `{batchId,duplicate:false,events:[{eventId,duplicate:boolean}]}`. Identical nonce retry: 200 with `duplicate:true` and the original event receipts. Event retry under new nonce: 202 with event duplicate true. All timestamps still must pass current DB-clock limits. Conflicting normalized event/nonce content -> 409; invalid shape/filter/time -> 400; too large -> 413; unsupported encoding/media -> 415; incomplete-body timeout -> 408; durable source, nonce, event or pending-processing cap -> 429. Missing operator approval, unavailable database or unmatched migration ledger -> 503, no driver details. The exact 503 code may distinguish `migration_not_ready`, `telemetry_not_configured` or `telemetry_unavailable`; UI reports these truthfully as unavailable.

## Reference sender

Server-only Node/Next code can explicitly call `referenceEmitter(options).prepare([{kind,...}])` then `.send(batch)`. No app is modified or instrumented automatically. Options must set `enabled:true`, `ownedApplicationConfirmed:true`, the loopback `/api/sentinel/ingest` endpoint and a private server-side credential. Prepare uses the credential's project routing hint for consistency; server storage remains authoritative. Reuse a prepared batch for bounded retry within the clock window; no automatic retry loop is installed. Transport has a five-second timeout, refuses redirects and sanitizes output/errors. The CLI emits one controlled batch of all four approved families only when both environment opt-ins are set. The owner-approved H02 execution and cleanup are recorded in SENTINEL_S02_VALIDATION.md and the handoff; the sender is currently disabled.
