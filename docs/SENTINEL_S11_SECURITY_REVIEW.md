# Sentinel S11 security review

Scope: S01-S10 as merged at `master@0ab9256` plus the S11 candidate. Method: code reading of every project-scoped route and
server-side outbound call, catalog inspection of a database carrying migrations 0001-0009, a 298-case route matrix, a
catalog-driven PostgreSQL isolation matrix, repository secret scan, `npm audit`, and live checks against the owner
development database. Severity = impact x exploitability **in the current deployment (local/dev; no production)**.
Findings are never silently dismissed; each has a disposition. Evidence IDs refer to the
[evidence register](SENTINEL_S11_EVIDENCE_REGISTER.md).

## 1. Findings

| ID | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| S11-F1 | **Medium** (false readiness) | `platformHealth` returned the constant `schema: "0001_foundation"` and `ready` whenever migration 0001 existed. A database at `0004`, or with an edited/mismatched migration, looked healthy. | **FIXED** in S11: ledger compared version+checksum with the plan; worker health is 503 unless `current`. Tests `tests/platform/schema-status.test.ts`; verified on the dev DB (`0009 / current`). |
| S11-F2 | **Medium** | No HTTP security headers on any response (clickjacking of authenticated pages, MIME sniffing, referrer leakage). | **FIXED**: `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `base-uri/form-action/object-src`. Verified on a production server. **Residual**: no script-restricting CSP (needs nonces), HSTS must come from the edge. |
| S11-F3 | **Medium** (operational) | The reviewed notifier role SQL creates the role but never grants database `CONNECT`; on a database with `CONNECT` revoked from `PUBLIC` the credential-isolated sender cannot start. Found on the real dev DB, invisible on harness DBs (default `PUBLIC` CONNECT). | **MITIGATED** by documented one-line grant (applied on `wetscan_dev`). The SQL file is part of the plan hash, so it was deliberately not edited; fixing it needs a reviewed new plan hash (owner decision O-3). |
| S11-F4 | **Low-Medium** | `/api/sentinel/ingest` admits at most 1500 requests/minute process-wide **before** authentication. A shape-valid flood can starve legitimate ingestion for up to one minute (availability only; no data exposure, no write). | **ACCEPTED RISK pending owner (R-4)**: mitigate at the edge/WAF by IP; a per-credential pre-auth bucket is a recommended follow-up. Not changed in S11 to avoid altering S02 acceptance semantics. |
| S11-F5 | Info | No CI existed; green unit tests and a Vercel build were the only signals. | **FIXED**: `.github/workflows/ci.yml` (4 enforced jobs + 1 advisory). Execution status is recorded separately; configured != executed. |
| S11-F6 | Info | The unit suite contains Windows-only tests (`powershell.exe`), so a Linux-only CI would fail or skip them. | Handled: unit job runs on `windows-2025` (ADR-1). |
| S11-F7 | Info | Health JSON still reports `telemetry: "not_implemented"` (S01 label; telemetry shipped in S02). | Documented in the runbook; asserted by an existing test, left to avoid contract churn. |
| S11-F8 | Info | `scripts/sentinel-worker-smoke.ts` hardcodes the S01 plan hash and cannot run against later plans. | Historical; real worker start/stop was verified with `main.ts --once` instead (DB-12). |
| S11-F9 | Info (operational hazard) | The persistent dev database at `127.0.0.1:55432` is served by a **clone-volume container** (`wetscan-sentinel-s04-postgres-...`, volume `..._dev_clone_20261117_...`). The original container `wetscan-sentinel-local-postgres-1` (older volume) is stopped and claims the same port. | Documented. The original volume was not touched. Do not start both. Owner decision O-4. |
| S11-F10 | Info | 8 queued + 1 failed `sentinel.telemetry.accepted` jobs from S02-S04 acceptance (~4 days old) remain on the dev DB. | Preserved as history (no activation, so they are not drained). |

No Critical or High finding was identified. Nothing was weakened to obtain a pass.

## 2. Verified controls (what the evidence proves)

| Control | Proof |
| --- | --- |
| Tenant isolation | Every tenant table (37 in migrations 0001-0009) has `ENABLE` + `FORCE` RLS and a policy; the 8 unscoped tables form an **exact** allowlist (7 with forced RLS; `schema_migrations` is the ledger). An unscoped app-role session reads **0 rows** from every tenant table; each of three scopes (two projects in one workspace, one project in another) sees only itself; forged workspace/project/mode combinations read nothing; foreign-scope UPDATE/DELETE changes **0 rows** in every table. |
| Least privilege | No runtime role is superuser/createrole/createdb/replication/BYPASSRLS; no `PUBLIC` ACL on any Sentinel/platform table; no runtime role has CREATE on `sentinel`/`platform`/`public` or `TRUNCATE/TRIGGER/REFERENCES`; no SECURITY DEFINER functions. Live: the notifier reads only `notification_channels/deliveries`, `project_bindings`, `jobs`, `notification_outbox`, ledger and limits; DDL denied for app and notifier. |
| Append-only audit | App role cannot update/delete the seven audit/timeline tables even inside its own scope. |
| AuthN/AuthZ on routes | 12 route modules x GET/POST: malformed/demo ids -> 404 before identity or storage; unauthenticated -> 401 before storage; foreign project (403 or 404) -> indistinguishable `404 {error:"not_found"}`; cross-origin/`null`/cross-site POST -> 403 before identity, storage or body parsing; unknown query -> 4xx with **no SQL issued**; no PUT/PATCH/DELETE exported. |
| Error hygiene | A storage failure carrying a password/host/SQL is a generic 503 with none of it in the body; every response is `no-store` + `nosniff`. |
| Replay/forgery | Replayed batch is a duplicate (no second event); a credential cannot ingest for another project; unknown and revoked credentials are rejected; no row is written by any rejected request. |
| Fail-closed activation | Detection, incidents, response, external intelligence and notifications are all off with no approval block; nothing created a response action, notification or case in the pipeline test. |
| SSRF/redirects | Every server-side `fetch` targets a fixed host or an owner-configured loopback target and uses `redirect: "error"` (feeds: `"manual"` with bounded handling). |
| Output rendering | No `dangerouslySetInnerHTML`, `innerHTML`, `eval` or `new Function` in `src`. |
| Secrets | Secret scan: 0 findings across all tracked files (five reviewed synthetic fixtures allowlisted by exact file+rule); no tracked dotenv; `.env*` ignored. Scan output prints no values. |
| Supply chain | `npm audit`: 0 vulnerabilities at the S11 candidate. Dependency-review job is advisory (needs GitHub Advanced Security on private repos). Actions are pinned by commit SHA. |
| CI posture | `permissions: contents: read`, no secrets, no `pull_request_target`, disposable loopback service DB only, 7-day bounded failure artifacts. |

## 3. Not proven (do not read as safe)

Real GitHub-session E2E; real Telegram/Resend delivery; real response target; production database; load/DoS limits beyond the
documented caps; third-party penetration test; browser-side CSP; GitHub Actions *execution* until the PR run reports.
