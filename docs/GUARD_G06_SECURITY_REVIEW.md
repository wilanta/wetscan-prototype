# WetScan Guard G06 Security Review

**Date:** 20 November 2026  
**Scope:** G06 Integrations (`GRD-013`, `GRD-020`, `GRD-021`, Unified Guard Reports, `0002_g06` schema)

---

## 1. Authentication, Authorization & Tenant Isolation

- **Server-side project identity only:** Every G06 API call (`/api/guard/projects/[projectId]/g06/[resource]`) validates `^github-[1-9]\d{0,15}$`, requires same-origin on `POST` via `requireOrigin(request)`, extracts session cookie via `requestToken(request)`, and derives workspace/project/repository identity exclusively via `authorizeGuardProject(token, projectId)`. Client-supplied workspace or repository headers/fields are ignored.
- **Database `FORCE RLS` & dual-role least privilege:**
  - Web handlers execute exclusively as `wetscan_guard_app` inside `PlatformDatabase.scoped({ module: 'guard', mode: 'live', workspaceId, projectId }, ...)`.
  - Background delivery sweeps run exclusively as `wetscan_guard_worker`.
  - Neither `wetscan_guard_app` nor `wetscan_guard_worker` holds `DELETE`, `SUPERUSER`, `BYPASSRLS`, or `CREATEDB`.
  - `guard.g06_pending_deliveries(integer)` `SECURITY DEFINER` function (`SET search_path = pg_catalog, guard`) is granted **only** to `wetscan_guard_worker` and explicitly revoked from `PUBLIC` and `wetscan_guard_app`.
- **Fail-closed defaults:** `GUARD_G06_ENABLED` defaults to disabled (`!== "1"`), throwing `G06DisabledError` (`503`) on operational routes while rendering explicit `NOT_CONFIGURED` status in the UI.
- **Demo vs Live isolation:** Demo Canvas (`/app/demo/canvas` and `orderly-demo`) uses static demo adapters and makes zero calls to `/api/guard/projects/*/g06/*`, verified by Playwright network monitoring.

## 2. Outbox Integrity, Idempotency & Consumer Boundaries

- **Advisory lock & digest verification:** `G06PostgresStore.enqueueOutbox` takes a per-idempotency advisory transaction lock on `(workspaceId, projectId, topic, idempotencyKey)`. Exact replays return `{ duplicate: true }` without resetting acknowledged deliveries; conflicting payloads with the same idempotency key reject with HTTP `409` (`outbox_idempotency_digest_mismatch`).
- **Worker lease fencing & crash recovery:** `claimDeliveryWorker` acquires rows with `FOR UPDATE SKIP LOCKED`, checks active/expired leases, logs `lease_expired` attempts when recovering stale crashed leases, and verifies matching `(lease_owner, lease_token, lease_until > clock_timestamp())` before transitioning outbox rows to `acknowledged` or `retry_scheduled`.
- **URL transport security:** `HttpSentinelPipelineConsumer` enforces `https://` for all non-loopback targets, attaches HMAC-SHA256 signature (`X-WetScan-Signature-256`) when shared secret is configured, and enforces a strict 5-second timeout.
- **No fabricated security state:**
  - `publishSentinelEvent(..., { type: "remediation_retested" })` rejects with `400` unless persisted `verified_fixed` evidence exists.
  - Guard pipeline events explicitly enforce `securityIncident: false` and never insert rows into `sentinel.telemetry_events` or `sentinel.incidents`.
  - Unbound Sentinel projects fail explicitly with `project_not_registered` and never fabricate Sentinel snapshots or exposure assessments.
  - `cicdPolicy.enforced` remains `false` unless persisted deployment/evaluation evidence explicitly proves enforcement.

## 3. Injection, Secret Leakage & XSS Defenses

- **Secret redaction before persistence & delivery:** `redactG06Value` / `redactG06Text` strips GitHub tokens (`ghp_`, `gho_`, `ghs_`, `github_pat_`), JWTs, AWS keys, PEM private keys, `Bearer`/`Basic` tokens, URL credentials, and sensitive keys (`authorization`, `cookie`, `secret`, `token`, `password`, `credentials`) prior to DB insertion in `g06_outbox`, `g06_canvas_overlays`, `g06_reports`, `g06_delivery_attempts`, and `g06_audit`.
- **Bounded request bodies & headers:** `handleG06Request` enforces `application/json` identity content-type, 64 KiB body cap, `Cache-Control: private, no-store`, `Referrer-Policy: no-referrer`, and `X-Content-Type-Options: nosniff`.
- **XSS-safe HTML report export:** `renderUnifiedReportHtml` passes every field through `escapeHtml` and serves HTML responses with `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` and safe download disposition.
- **Link href sanitization:** Canvas overlay validation (`safeActionHref`) restricts finding links strictly to safe internal `/app/projects/<id>/(guard|sentinel)/...` paths.

## 4. Residual Security Risks & Operational Notes

- Until Sentinel core implements a dedicated `guard_pipeline_audit` ingestion endpoint (beyond frozen `0001..0009`), `GRD-021` relies on an externally configured `GUARD_G06_SENTINEL_CONSUMER_URL` + shared HMAC secret in production, remaining durably pending/`consumer_unavailable` by default.
- External GitHub App webhook/checks permissions and Vercel promotion hold enforcement remain subject to owner-configured provider credentials (`HANDOFF_GUARD_G04.md`).
