# Agent Handoff: WetScan Guard G06 Full Integration

**Date:** 20 November 2026  
**Branch:** `feat/guard-g06-full-integration`  
**Worktree:** `C:\Users\sheil\OneDrive\Dokumen\Wildhan\projects\wetscan-guard-g06`  
**Base Commit (`origin/master`):** `4e33fed23a5825af1103d403a7cbc4568d9c3d96`

---

## 1. What Was Built in G06

1. **Authoritative GitHub-Only Alignment**:
   - Updated `docs/specs/guard/G06.md`, `docs/GUARD_IMPLEMENTATION_STATUS.md`, `docs/INTEGRATION_BACKLOG.md`, and created `docs/GUARD_G06_INITIAL_AUDIT.md`.
   - `GRD-002` (GitLab Repository Reader) and ZIP archive scanning are formally recorded as `OUT_OF_SCOPE_BY_OWNER_DECISION`.
2. **Additive Schema, RLS & Local Environment (`migrations/guard/g06/`)**:
   - `0002_g06.up.sql` / `0002_g06.down.sql` with ledger `guard.g06_schema_migrations`, 6 `FORCE ROW LEVEL SECURITY` tables (`g06_canvas_overlays`, `g06_outbox`, `g06_delivery_attempts`, `g06_intelligence_sync`, `g06_reports`, `g06_audit`), zero `DELETE` grants for `wetscan_guard_app` and `wetscan_guard_worker`, and worker-only `SECURITY DEFINER` discovery (`guard.g06_pending_deliveries`).
   - Isolated local PostgreSQL 17 environment provisioned via `scripts/guard-g06-local-env.ts` (`127.0.0.1:55437`, container `wetscan-g06-local-pg`, `wetscan_dev_guardg06` + `wetscan_dev_sentinelg06`), leaving ports `5432`, `55432`, `55434`, `55435`, `55436`, and `4115` untouched.
3. **Core Backend Services (`src/features/guard/g06/`)**:
   - `contracts.ts`, `db.ts`, `migrations.ts`, `redaction.ts`, `store.ts`
   - `canvas-overlay.ts` (`GRD-013`: deterministic file/manifest/endpoint attribution with `APP_OWNER_KINDS` disambiguation, stale commit guard, unmatched classifications)
   - `intelligence-bridge.ts` (`GRD-020`: normalized OSV/CycloneDX inventory -> `guard.g06_outbox` -> real S09 `InventoryStore.save` + `assessExposure` -> `guard.g06_intelligence_sync`)
   - `sentinel-bridge.ts` (`GRD-021`: `GuardPipelineEventV1` validation, secret redaction, `securityIncident: false`, signed `HttpSentinelPipelineConsumer` / honest `consumer_unavailable` fallback)
   - `worker.ts` & `scripts/guard-g06-worker.ts` (lease fencing with `SKIP LOCKED`, expired-lease crash recovery, exponential retry backoff, `409` conflict halt)
   - `unified-report.ts` & `service.ts` & `runtime.ts` & `http.ts` (`src/app/api/guard/projects/[projectId]/g06/[resource]/route.ts`: G01–G06 unified report, `escapeHtml` HTML export with CSP `default-src 'none'`, 90-day retention, download auditing).
4. **UI Integrations**:
   - Guard `Reports & Bridges` tab (`src/features/guard/g06/panel.tsx`, wired as tab #9 in `src/features/guard/live/live-workspace.tsx`, `src/app/app/projects/[projectId]/guard/[[...section]]/page.tsx`, `src/components/app-shell.tsx`).
   - Live Canvas Security Lens (`src/features/canvas/adapters/sentinel-overlay.ts`, `src/features/canvas/components/{guard-coverage,graph,graph-node,inspector}.tsx`, `src/components/views/canvas.tsx`, `src/app/globals.css`).
   - Sentinel External Intelligence (`src/features/sentinel/components/live-external.tsx` optional `g06/intelligence` card preserving `"not integrated"` fallback when G06 is disabled).
5. **CI & Tests**:
   - Added `tests/guard/g06/g06.test.ts`, `tests/guard/g06/g06.postgres.integration.ts`, `tests/guard/g06/postgres.config.ts`, `tests/guard/g06/pg-env.ts`, `tests/guard/g06/browser/*`, and CI step in `.github/workflows/ci.yml`.

---

## 2. How to Run Local G06 Verification

```bash
# Verify isolated PG 17 container & least-privilege roles (port 55437)
npx tsx scripts/guard-g06-local-env.ts verify

# Run G06 unit tests
npx vitest run tests/guard/g06/g06.test.ts

# Run G06 dual-DB PostgreSQL + S09 Intelligence integration tests
npm run test:guard:g06:postgres

# Run G06 production Next.js + PG + Worker + Playwright + Axe end-to-end suite
node tests/guard/g06/browser/run.mjs

# Run continuous G06 outbox worker against local PG 55437
npm run guard:g06:worker -- --once
```

---

## 3. Open External Dependencies (Not Mocked or Bypassed)

1. **Independent G03 AI Remediation PR**: Not yet merged into `master`. When merged, connect G03 remediation/retest readers to `buildUnifiedGuardReport` in `src/features/guard/g06/unified-report.ts` and drop `NOT_CONNECTED`.
2. **Sentinel Core `guard_pipeline_audit` Consumer (`GRD-021`)**: Frozen Sentinel `0001..0009` migrations were intentionally untouched. When Sentinel core exposes a dedicated pipeline audit HTTP/storage consumer, configure `GUARD_G06_SENTINEL_CONSUMER_URL` + shared HMAC secret.
3. **External Provider / Staging Gates (G04/G05)**: GitHub App `checks:write`, live webhooks, Vercel hold tokens, and external staging targets remain governed by `HANDOFF_GUARD_G04.md` and `HANDOFF_GUARD_G05.md`.
