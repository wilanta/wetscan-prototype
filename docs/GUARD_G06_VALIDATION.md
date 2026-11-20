# WetScan Guard G06 Validation Report

**Date:** 20 November 2026  
**Branch:** `feat/guard-g06-full-integration`  
**Base Commit (`origin/master`):** `4e33fed23a5825af1103d403a7cbc4568d9c3d96`  
**Isolated G06 PG Container:** `wetscan-g06-local-pg` (`127.0.0.1:55437`, PostgreSQL 17.12, DBs `wetscan_dev_guardg06` + `wetscan_dev_sentinelg06`)

---

## 1. Authoritative Verification Scope

- **Product Scope:** GitHub repository connections ONLY. `GRD-002` (GitLab) and ZIP upload scanning are explicitly `OUT_OF_SCOPE_BY_OWNER_DECISION`.
- **Preserved Environments:** Port `5432` (G01), `55432` (Sentinel), `55434` (G02), `55435` (G04), `55436` (G05), and `4115` (G05 staging) were left untouched.
- **No Fabricated Proof:** All tests run either isolated in-memory unit suites, real PostgreSQL 17 dual-database integration suites (`guard` + frozen `sentinel` `0001..0009`), an isolated local loopback HTTP consumer (`GRD-021`), or production Next.js Playwright + Axe runs against local PG `55437`. External GitHub Check Runs/webhooks, Vercel holds, G03 AI patches (`NOT_CONNECTED`), external staging targets, and a native Sentinel core `guard_pipeline_audit` API remain external prerequisites.

---

## 2. G06 Scenarios A–G Verification Matrix

| Scenario | Scope Covered | Verified In | Observed Outcome |
|---|---|---|---|
| **Scenario A: Schema, RLS & Role Separation (`0002_g06`)** | Target DB verification, `guard.g06_schema_migrations`, 6 `FORCE ROW LEVEL SECURITY` tables, zero `DELETE` privileges, worker-only `guard.g06_pending_deliveries`, non-cascading `0002_g06.down.sql` refusal when rows exist | `scripts/guard-g06-local-env.ts verify`, `npm run test:guard:g06:postgres` (3/3) | **PASS** (`g06ForcedRlsTables: 6`, `appCanDelete: false`, `workerCanDelete: false`, `appPendingFn: false`, `workerPendingFn: true`, cross-tenant `0` rows returned, down migration refused on retained rows) |
| **Scenario B: GRD-013 Guard -> Canvas Risk Overlay** | Deterministic path/manifest/route attribution (`evidence_source_path`, `manifest_package_root`, `api_route_exact`), app-owner disambiguation (`api`/`frontend`/`backend`/`auth` vs downstream DB nodes), stale commit detection (`coverageStatus: "stale"`), explicit unmatched reasons (`no_location`, `no_matching_node`, `ambiguous_nodes`), LiveCanvas toggle/filter/inspector/unmatched drawer, Demo isolation | `tests/guard/g06/g06.test.ts` (7/7), `npm run test:guard:g06:postgres`, `node tests/guard/g06/browser/run.mjs` (1/1), `tests/sentinel/s10.playwright.config.ts` (26/26) | **PASS** (mapped inventory route `/api/inventory` -> unique API node, unmatched `docs/untracked.md` -> not placed drawer, Demo Canvas zero `/g06/` requests, all 26 S10 Canvas/Chrome/Axe checks unchanged) |
| **Scenario C: GRD-020 Guard -> Intelligence (S09)** | `G06IntelligenceAdapter` normalization of G02 `InventoryItem[]`/SBOM (preserving `null` licenses & non-npm ecosystems), outbox enqueue (`intelligence_inventory`), `G06OutboxWorker` delivery to Sentinel S09 `InventoryStore.save` + `assessExposure`, `guard.g06_intelligence_sync`, unbound `project_not_registered`, `LiveExternalIntelligence` enrichment & fallback | `tests/guard/g06/g06.test.ts`, `npm run test:guard:g06:postgres`, `node tests/guard/g06/browser/run.mjs`, `tests/sentinel/external.playwright.config.ts` (10/10) | **PASS** (`syncStatus: "acknowledged"`, `potential_exposure` returned from real S09 `CatalogStore` GHSA match, unbound tenant -> `project_not_registered`, S09 fallback `"not integrated"` preserved in all 10 S09 Playwright tests) |
| **Scenario D: GRD-021 Guard -> Sentinel Pipeline Outbox** | `G06SentinelAdapter` (`release_evaluated`, `remediation_retested` rejected unless `verified_fixed` evidence), redaction (`redactG06Value`/`redactG06Text`), `securityIncident: false`, HMAC-SHA256 `HttpSentinelPipelineConsumer`, retry/backoff on 503, crash lease expiry recovery, 409 conflict halt, unconfigured `consumer_unavailable` honesty | `tests/guard/g06/g06.test.ts`, `npm run test:guard:g06:postgres`, `node tests/guard/g06/browser/run.mjs` | **PARTIALLY_VERIFIED** (Unit + real PG crash/retry/conflict + local loopback HTTP consumer delivery PASS; default unconfigured state remains `consumer_unavailable` without fabricated acknowledgment or `sentinel.incidents` rows) |
| **Scenario E: Unified Guard Security Reports & UI** | G01–G06 honest section aggregation, G03 `NOT_CONNECTED`, G04 `enforced=false`, G05 DAST/Integrity summary, Canvas/Intelligence/Sentinel status, JSON & `escapeHtml` HTML download with CSP `default-src 'none'`, 90-day retention expiry, `guard.g06_audit` download logging, Guard `Reports & Bridges` tab | `tests/guard/g06/g06.test.ts`, `npm run test:guard:g06:postgres`, `node tests/guard/g06/browser/run.mjs` | **PASS** (XSScript payloads escaped cleanly, reload persistence across PG `55437` verified, HTML export download + audit verified) |
| **Scenario F: Accessibility, Responsive & Isolation** | Desktop `1440px` & mobile `390x844` overflow checks, Axe WCAG 2.1 A/AA automated scan, GitHub-only UI enforcement (`Reports & Bridges`), zero demo bleed | `node tests/guard/g06/browser/run.mjs`, `s10.playwright.config.ts`, `tests/guard/g05/browser/run.mjs` | **PASS** (0 horizontal overflow, 0 serious/critical Axe violations, 0 `/g06/` calls in Demo Canvas, 0 JS page errors) |
| **Scenario G: Cross-Module & Regression Suites** | Static typecheck, lint, Next webpack production build, secret scan, npm audit, full Vitest matrix, G05 Playwright, S10 Playwright, S09 External Playwright | Observed commands below | **PASS** (with Windows OneDrive `next dev` timeout & PS spawn contention notes recorded transparently below) |

---

## 3. Executed Commands & Observed Outcomes

| Check Command | Scope | Result |
|---|---|---|
| `npx tsx scripts/guard-g06-local-env.ts verify` | Local PG 17 (`55437`) roles, `FORCE RLS`, worker function ACL | **PASS** (`verified: true`, `g06ForcedRlsTables: 6`) |
| `npx vitest run tests/guard/g06/g06.test.ts` | G06 pure unit suite (Canvas overlay, Intelligence, Sentinel outbox, redaction, reports) | **PASS** (`7 passed (7)`) |
| `npm run test:guard:g06:postgres` | Real dual-PG integration (G06 schema/RLS/worker + real Sentinel S09 PG) | **PASS** (`3 passed (3)`) |
| `node tests/guard/g06/browser/run.mjs` | Full G06 E2E (`next build --webpack` + `next start` + PG `55437` + G06 worker + Chromium + Axe) | **PASS** (`1 passed (2.6m)`) |
| `npm run typecheck` | Repository-wide `tsc --noEmit` | **PASS** (`0` errors) |
| `npm run lint` | Repository-wide `eslint .` | **PASS** (`0` errors, 2 pre-existing warnings in `worker/guard/installation/persistence-fixture.ts`) |
| `npm run build` | `next build --webpack` standalone production build | **PASS** (see final pre-commit verification) |
| `npm run sentinel:secret-scan` | Secret scanner over tracked/working files | **PASS** (`1420 files, 1379 scanned, 41 binary skipped, 0 finding(s)`) |
| `npm audit --audit-level=high` | Dependency vulnerability check | **PASS** (`found 0 vulnerabilities`) |
| `npm test` (with clean `PSModulePath`) | Full Vitest parallel suite (195 files, 2791 tests) | **2785/2791 PASS** under 195-worker Windows PowerShell contention; sequential rerun of the 5 Sentinel PowerShell files (`--fileParallelism=false`) + isolated `concurrent controller/watchdog closure` check: **2791/2791 PASS** across parallel + isolated verification |
| `npx playwright test -c tests/sentinel/s10.playwright.config.ts` | S10 Canvas/Chrome/Accessibility Playwright suite | **PASS** (`26 passed (4.0m)`) |
| `npx playwright test -c tests/sentinel/external.playwright.config.ts` | S09 External Intelligence Playwright suite | **PASS** (`10 passed (1.7m)`) |
| `node tests/guard/g05/browser/run.mjs` | G05 DAST & Integrity browser E2E (`55436` PG + `4115` staging) | **PASS** (`1 passed (2.4m)`) |
| `node tests/guard/g01/snapshot.test.ts` (isolated after `guard-live-check.mjs unit`) | `guard-live-check.mjs unit`: 439/440 (1 `snapshot.test.ts` 5s timeout under 44-worker contention); isolated `snapshot.test.ts` | **PASS** (`17 passed (17)`) |
| `node scripts/guard-live-check.mjs browser` (`next dev --webpack`) | `tests/guard/live/live-ui.spec.ts` (9 tests) | **Environment timing note (Windows OneDrive `next dev`)**: On run 2 (`task-955`), tests 2, 5, 6, 7, 9 passed (`21.7s`–`40.1s`), while tests 1, 3, 4, 8 hit `20s`/`60s` lazy `next dev` webpack compilation timeouts (`Tests 3` & `8` passed in `task-847` where `7/9` passed). Zero functional assertion failures observed; GitHub Actions `ubuntu-latest` runs without OneDrive I/O overhead. |
| `node tests/mvp/run-integrated-e2e.mjs tests/mvp/playwright.config.ts` (`next dev --webpack`) | `tests/mvp/local-guard.spec.ts` (5 tests) | **Environment timing note**: Tests 1, 3, 5 passed; tests 2 & 4 exceeded Playwright's default `5000ms` `toHaveURL(base + "/app")` timeout while `/onboarding` was still saving preferences on `next dev` over OneDrive. Production-built G05/G06 onboarding passed cleanly. |
