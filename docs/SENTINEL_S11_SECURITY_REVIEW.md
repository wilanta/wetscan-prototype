# Sentinel S11 security review

Scope: S01-S10 as merged at `master@0ab9256` plus the S11 candidate. Method: code reading of every project-scoped route and
server-side outbound call, catalog inspection of a database carrying migrations 0001-0009, a route matrix, a
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
| S11-F5 | Info | No CI existed; green unit tests and a Vercel build were the only signals. | **FIXED**: `.github/workflows/ci.yml` (enforced jobs + 1 optional). Execution status is recorded separately; configured != executed. |
| S11-F6 | Info | The unit suite contains Windows-only tests (`powershell.exe`), so a Linux-only CI would fail or skip them. | Handled: unit job runs on `windows-2025` (ADR-1). |
| S11-F7 | Info | Health JSON still reports `telemetry: "not_implemented"` (S01 label; telemetry shipped in S02). | Documented in the runbook; asserted by an existing test, left to avoid contract churn. |
| S11-F8 | Info | `scripts/sentinel-worker-smoke.ts` hardcodes the S01 plan hash and cannot run against later plans. | Historical; real worker start/stop was verified with `main.ts --once` instead (DB-12). |
| S11-F9 | Info (operational hazard) | The persistent dev database at `127.0.0.1:55432` is served by a **clone-volume container** (`wetscan-sentinel-s04-postgres-...`, volume `..._dev_clone_20261117_...`). The original container `wetscan-sentinel-local-postgres-1` (older volume) is stopped and claims the same port. | Documented. The original volume was not touched. Do not start both. Owner decision O-4. |
| S11-F11 | **Medium** (integrity/portability) | The S04 audit/provision PowerShell scripts are pinned by SHA-256 over their **LF** bytes (`Invoke-S04AuditProcedure.ps1` pins `sentinel-provision-common.ps1`). Any CRLF checkout (Windows `autocrlf`, hosted runners) changes the bytes and the pin correctly fails closed - the owner procedure would be unusable on such a clone. Found by the first hosted CI run. | **FIXED**: `.gitattributes` `*.ps1 text eol=lf`. The pin mechanism itself was left unchanged. |
| S11-F12 | Low (test hygiene) | PG harness teardown (`DROP DATABASE ... FORCE`) terminated idle pooled connections; the unhandled pool `error` made an all-green job exit 1. | **FIXED** in test infrastructure (only `57P01/ECONNRESET/EPIPE` tolerated; any other pool error still throws). |
| S11-F13 | Info | Hosted Windows runners need `PSModulePath` and `TEMP` pinned for the owner-runner suites; `actions/dependency-review-action` needs GitHub Advanced Security / dependency graph (`Forbidden`). | Pinned in `ci.yml`; dependency review stays advisory and `BLOCKED` until O-5. |
| S11-F14 | Low-Medium (integrity) | Latent before S11: `Invoke-S04OwnerSessionArchiveAudit.ps1` pins `sentinel-owner-session-audit.ts` and `sentinel-owner-auth-snapshot.ts` over LF bytes, but no attribute protected them, so a CRLF clone fails that owner procedure. Found while auditing finding 10. | **FIXED**: `eol=lf` for both; enforced by `s11-pinned-script-bytes.test.ts`. |
| S11-F15 | Medium (regression introduced by S11 Fix #11) | The `*.ps1 text eol=lf` rule would have changed the checkout bytes of `Invoke-S04ProvisionPackage.ps1`, which a private S04 manifest pins in CRLF form. | **FIXED**: per-file `eol=crlf` exception; verified byte-exact in a fresh `autocrlf=true` clone. |
| S11-F16 | Medium (regression introduced by S11 Fix #11) | Fix #11 health treated a database newer than the code as `unknown_version` (503), contradicting the additive-rollback guidance. | **FIXED**: overlap-first comparison, `ahead_compatible` only with an operator attestation (section 4). |
| S11-F10 | Info | 8 queued + 1 failed `sentinel.telemetry.accepted` jobs from S02-S04 acceptance (~4 days old) remain on the dev DB. | Preserved as history (no activation, so they are not drained). |

No Critical or High finding was identified. Nothing was weakened to obtain a pass.

## 2. Verified controls (what the evidence proves)

| Control | Proof |
| --- | --- |
| Tenant isolation | Every tenant table (migrations 0001-0009) has `ENABLE` + `FORCE` RLS and a policy; the 8 unscoped tables form an **exact** allowlist (7 with forced RLS; `schema_migrations` is the ledger). An unscoped app-role session reads **0 rows** from every tenant table; each of three scopes (two projects in one workspace, one project in another) sees only itself; forged workspace/project/mode combinations read nothing; foreign-scope UPDATE/DELETE changes **0 rows** in every table. |
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
| CI posture | `permissions: contents: read`, no secrets, no `pull_request_target`, disposable loopback service DBs only, 7-day bounded failure artifacts. **Executed**: all four enforced jobs green on GitHub-hosted runners at PR head `cf61ff3` (register F). No production or `wetscan_dev` credential exists in CI. |

## 3. Not proven (do not read as safe)

Real GitHub-session E2E; real Telegram/Resend delivery; real response target; production database; load/DoS limits beyond the
documented caps; third-party penetration test; browser-side CSP; branch protection / required checks (the jobs run but nothing forces them yet); dependency review (blocked by repository settings).

## 4. Post-merge review remediation (branch `fix/s11-post-merge-hardening`)

A review of the merged S11 diff produced nine findings and one open compatibility question. Each is closed below with the proof;
execution counts are in the [register](SENTINEL_S11_EVIDENCE_REGISTER.md) section H.

| # | Review finding | Disposition |
| --- | --- | --- |
| 1 | Worker health went 503 whenever the database was ahead of the code, contradicting the rollback guidance | **FIXED.** Overlapping checksums are compared first (`checksum_mismatch`, `behind` stay unhealthy). A newer database is `ahead_compatible` (ready + `warnings`) only for a gap-free, well-formed suffix that the operator attested with `SENTINEL_SCHEMA_AHEAD_ACCEPTED_THROUGH`; anything else is `ahead_unverified` (503). Unit matrix plus a real-ledger PostgreSQL test. Runbook rollback rewritten to match. |
| 2 | Optional dependency-review job was a permanently red check | **FIXED.** Runs only with `vars.GHAS_ENABLED == 'true'`; `npm audit --audit-level=high` stays enforced. |
| 3 | POST error-hygiene case never reached storage | **FIXED.** Every route x method now gets a request that passes authentication and validation (route-specific minimal body where the route validates first; Canvas graph cache mocked), and the case asserts the failing dependency was called, status 503, the exact sanitized body, and no canary text. A mutation (removing two bodies) makes the test fail, proving it can no longer pass vacuously. |
| 4 | Secret scan skipped long lines / big files; exceptions were file+rule | **FIXED.** Long lines are scanned in overlapping 4096/512 windows; files are read to a 64 MiB hard cap and anything unreadable or larger FAILS the run as `incomplete`; binaries are counted. Exceptions are the SHA-256 of one exact trimmed line, so changed content, an extra credential line, or the same line in another file is a finding. Output still prints no values and no hashes. |
| 5 | Agent-written approvals said `approvedBy: Owner ...` | **CORRECTED.** The two private approvals now state they were recorded by Claude Code under the owner's authorization (`authoredBy`, `authorizedBy`, original text kept in `previousApprovedBy`, `provenanceCorrectedAt`). They still parse for their actions and the plan hash is untouched; no database access was needed. Convention added to the runbook. |
| 6 | Production-build E2E ran only locally | **ADDED** to the browser job (15-minute step timeout, failure artifacts kept 7 days, stubbed GitHub, no real credentials). Linux result: register H. |
| 7 | No explicit "minimum release gates" | **ADDED** (H09 section 2A, 19 gates, each with evidence, status, staging/production blocking, owner action). Verdicts unchanged. |
| 8 | S01 gated suite lacked the pool-error guard | **ADDED** to `tests/platform/postgres.config.ts`. That suite never drops its database, so it saw no teardown noise; the guard is parity. A unit test shows `57P01/ECONNRESET/EPIPE` are tolerated and every other pool error (e.g. `23505`, `42501`, `28P01`) still throws. |
| 9 | Counts copied into five documents | **CONSOLIDATED.** The register is the only place with execution counts; other documents reference its IDs. Historical results, failed attempts and timestamps were not removed. |
| 10 | Does the LF rule match hash pins? | **VERIFIED, two corrections.** See below. |

### 4.1 Line endings versus hash pins (finding 10)

Method: every 64-hex literal in executable repository code was matched to the SHA-256 of tracked files in LF and CRLF form
(5 pins), and the hashes of all 17 PowerShell scripts were searched for, read-only, in 1,900+ private owner manifest files
(names printed, contents never). Then a **fresh clone with `core.autocrlf=true`** was made and its raw bytes compared with every
pin.

- Repository pins: all over LF bytes; all five byte-exact in the CRLF-autocrlf clone after the fix.
- Private manifests: 16 of 16 PowerShell scripts that appear in them are byte-exact in that clone (15 pin LF; **one pins CRLF**).
- **Correction A (conflict):** `scripts/Invoke-S04ProvisionPackage.ps1` is pinned in CRLF form by a private S04 provision-package
  manifest, so the S11 rule `*.ps1 text eol=lf` would have broken that pin on the next checkout. It now has
  `eol=crlf` (its historical bytes), without rewriting the script.
- **Correction B (latent defect):** `scripts/sentinel-owner-session-audit.ts` and `scripts/sentinel-owner-auth-snapshot.ts` are
  pinned over LF bytes by `Invoke-S04OwnerSessionArchiveAudit.ps1` but no attribute covered them, so any CRLF clone would have
  failed that owner procedure. They are now `eol=lf`.
- `tests/sentinel/s11-pinned-script-bytes.test.ts` enforces: no repository code pins CRLF bytes; every LF-pinned file is `eol=lf`;
  every `*.ps1` is LF except the one CRLF exception. Removing the two TypeScript attributes makes it fail.
- **NOT_VERIFIED / informational:** private manifests also pin, in CRLF form, tracked files that no attribute covers
  (`sentinel-detection-preflight.ts`, `sentinel-detection-test.ts`, `sentinel-owner-reauth-app.mjs`,
  `sentinel-provision-package-check.ts`, `sentinel-worker-smoke.ts`, `worker/guard/*`, `migrations/guard/*`). They belong to closed
  historical procedures and S11 did not change their checkout behaviour; whether any is still executed is unknown. Re-verify
  with the procedure below before re-running one on a fresh clone.
- Procedure to re-verify an external manifest: (1) `git clone -c core.autocrlf=true <repo> <dir>`; (2) for each pinned file compute
  `sha256sum` of the file as checked out; (3) compare with the manifest value; (4) a mismatch means the manifest pins the other
  line-ending form - add a per-file `.gitattributes` rule rather than editing the script or the manifest.

