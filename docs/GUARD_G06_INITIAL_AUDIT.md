# WetScan Guard G06 — Initial Repository Audit & Execution Plan

**Date:** 20 November 2026  
**Branch:** `feat/guard-g06-full-integration`  
**Worktree:** `C:\Users\sheil\OneDrive\Dokumen\Wildhan\projects\wetscan-guard-g06`  
**Base Commit (`origin/master`):** `4e33fed23a5825af1103d403a7cbc4568d9c3d96` (`feat(guard-g05): integrate DAST and Integrity with merged G04 (#22)`)  
**Product Scope Authority:** Owner decision — **GitHub repository connections ONLY**. `GRD-002` (GitLab Repository Reader) and ZIP upload / source archive scanning are **`OUT_OF_SCOPE_BY_OWNER_DECISION`**.

---

## 1. Git, Worktree & Baseline Verification

1. **Ancestry verified**:
   - G04 CI/CD merge commit `bc003a2f4804e98b3061ac98861f62d3fbf908ba` (`#20`) is an ancestor of `origin/master`.
   - G05 DAST & Integrity merge commit `4e33fed23a5825af1103d403a7cbc4568d9c3d96` (`#22`) is HEAD of `origin/master`.
   - Independent G03 (`feat/guard-g03-remediation`, PRs, or `HANDOFF_GUARD_G03.md`) is **NOT** merged into `master` (`git log --all --grep="g03"` and PRs `#1`–`#22` contain no G03 implementation). Only partial rule-metadata guidance and recorded-scan diffing from G02 PR `#17` exist (`src/features/guard/live/{product-remediation,remediation-provider,product-artifacts}.ts`).
2. **Existing environments preserved (untouched)**:
   - G02 PG `55434`, G04 PG `55435`, G05 PG `55436`, G05 synthetic staging `4115`, Sentinel PG `55432` containers, and sibling worktrees (`wetscan-prototype`, `wetscan-canvas-full`, `wetscan-guard-g04`, `wetscan-guard-g05`, `Wetscan-Hackathon`).
   - G06 uses free port **`55437`** (`wetscan_dev_guardg06`, container `wetscan-g06-local-pg`).
3. **Baseline static & test checks on `feat/guard-g06-full-integration` at `4e33fed23a5825af1103d403a7cbc4568d9c3d96`**:
   - `npm run typecheck`: PASS (`tsc --noEmit`, 0 errors).
   - `npm run lint`: PASS (`0` errors, `2` pre-existing unused-var warnings in `worker/guard/installation/persistence-fixture.ts`).
   - `npm run sentinel:secret-scan`: PASS (`1420` files, `1379` scanned, `41` binary skipped, `0` findings).
   - `npm test`: `193/194` files passed (`2783` tests); `tests/sentinel/audit-deadline.test.ts` had 1 timing flake under parallel CPU saturation and passed `30/30` when run isolated.

---

## 2. Module-by-Module Implementation State (G01–G05 + Canvas + Intelligence + Sentinel)

| Module / Sub-system | Status on `master` | Real Persistent Stores & Entrypoints | Notes for G06 |
|---|---|---|---|
| **G01 Guard Foundation** | Implemented | `src/features/guard/live/{persistence,service,runtime,database-config}.ts`, `migrations/guard/0001_guard.up.sql` | Project auth via `authorizeGuardProject(token, projectId)` -> `github-<id>`, PG schemas `guard.scans`, `guard.audit_logs`, `platform.jobs`. |
| **G02 Security Scanning** | Implemented | `worker/guard/*`, `src/features/guard/live/{product-host,product-artifacts,product-remediation}.ts` | Real Opengrep/OSV/Gitleaks/Trivy/SBOM persistence in `guard.scans` (`kind = 'guard.scan.repository'`), filter historical preps via `operationalJob(job)`. |
| **G03 AI Remediation** | **NOT MERGED** (only G02 guidance partial exists) | `src/features/guard/live/{product-remediation,remediation-provider}.ts` (`configured: false`) | G06 must NOT build a duplicate AI engine. Unified reports integrate existing G02/G03 records if present and mark full G03 boundary `NOT_CONNECTED`. |
| **G04 CI/CD Gate** | Implemented | `src/features/guard/g04/{store,service,runtime,http}.ts`, `migrations/guard/g04/0002_g04.up.sql` | Real webhooks, triggers, deterministic evaluations, GitHub Check Runs, deployments (`enforced` false without Vercel evidence). |
| **G05 DAST & Integrity** | Implemented (flag-gated `GUARD_G05_ENABLED=1`) | `src/features/guard/g05/{store,service,runtime,http}.ts`, `migrations/guard/g05/0002_g05.up.sql` | Real `guard.g05_runs`, `guard.g05_findings` (incl. `endpoint`, `engine`, `status`, `invariant_family`), `guard.g05_targets`, `guard.g05_reports`. |
| **Canvas (S09/CAN-008)** | Implemented | `src/features/canvas/server/project-service.ts`, `src/features/canvas/components/{live-canvas,graph,graph-node,inspector}.tsx`, `src/components/views/canvas.tsx`, `src/features/sentinel/canvas/mapping.ts` | Live Canvas currently mounts `sentinelOverlaySource(projectId, graphRevision)` only (`SecurityOverlay` supports `findings[]` + `incidents[]`). `GraphNode` renders `data.findingCount` (`review` priority) and `inspector.tsx` renders node findings. |
| **Sentinel External Intelligence (S09)** | Implemented (schema frozen `0001..0009`) | `src/features/sentinel/external/{inventory-store,exposure,catalog-store,service,model}.ts`, `src/features/sentinel/components/live-external.tsx` | `InventoryStore.save` persists `ext_inventory_snapshots` (`source_kind='repository_lockfile'`, `ecosystem IN ('npm')`); `assessExposure` computes real `potential_exposure | no_match_within_coverage | cannot_assess` against `CatalogStore`. Frozen migration checksum `94f99d99...831c` MUST NOT be altered. |
| **Sentinel Core & Pipeline Telemetry** | Implemented for runtime telemetry ONLY (`0001..0009` frozen) | `src/features/sentinel/{contracts,integrations}.ts`, `telemetry/validation.ts` | Defines `GuardPipelineEventV1`, `GuardInventoryV1`, `validateGuardHandoff`, `redact`, `EvidenceRef` (`observed_scan | controlled_test`). `telemetry_events.kind` only allows runtime kinds (`auth.failed`, `http.suspicious_path`, `http.request`, `ghost.decoy_triggered`) — no `guard_pipeline_audit` table exists in Sentinel core yet. |

---

## 3. Seam Audit & Architectural Decisions

### 3.1 Frozen Migrations & Role Boundaries
- `migrations/sentinel/0001..0009`, `migrations/guard/0001_guard.*`, `migrations/guard/g04/*`, and `migrations/guard/g05/*` have pinned plan/checksum tests (`tests/platform/migrations.test.ts`, `tests/sentinel/approval-history.test.ts`, `tests/sentinel/external-migrations.test.ts`). **None of these existing migrations will be modified.**
- G06 introduces additive `migrations/guard/g06/0002_g06.up.sql` and `0002_g06.down.sql` with ledger `guard.g06_schema_migrations`, `FORCE ROW LEVEL SECURITY` on all G06 tables for `('wetscan_guard_app', 'wetscan_guard_worker')`, zero `DELETE` grants, and a safe non-cascading down migration refusing rollback when durable rows exist.
- Existing Sentinel regression tests (`tests/sentinel/live-report.test.ts`, `tests/sentinel/contracts.test.ts`, `tests/sentinel/s10.spec.ts`, `tests/sentinel/external.spec.ts`, `tests/sentinel/s11-route-matrix.test.ts`, `tests/sentinel/external.postgres.integration.ts`) pin Sentinel's internal `futureGuardBridgePorts`, `guardInventoryPort`, `live-report.ts` output, and `/api/sentinel/projects/[projectId]/*` route list. Preserving Sentinel's internal contracts untouched while integrating G06 via Guard routes (`/api/guard/projects/[projectId]/g06/...`), Canvas `LiveCanvas` merged overlay composition, and additive non-breaking UI enhancements keeps all existing S09/S10/S11 contracts green while enabling full real cross-module operation.

### 3.2 GRD-013 — Guard → Canvas Risk Overlay
- **Inputs**: Persisted operational G02 scans (`guard.scans`, excluding `historical_preparation`) + persisted G05 runs/findings (`guard.g05_runs`, `guard.g05_findings`, `guard.g05_targets`) + cached Canvas graph revision (`projectCanvasService(token, projectId).cached(revision)`).
- **Deterministic attribution (zero AI guessing / zero fuzzy label matching)**:
  1. G02 findings with file `path`: matched against `graph.evidence` entries (`sourcePath`, scoped to nodes in `graph.nodes`, normalized path) where scan commit SHA matches graph `sourceRevision` (or explicitly flagged `stale` if mismatched). Single candidate node -> mapped (`evidence_source_path`); `0` nodes -> `no_matching_node`; `>1` nodes -> `ambiguous_nodes`; missing path -> `no_location`.
  2. G02 dependency findings on manifest/lockfile paths (e.g., `package.json`, `package-lock.json`) where a `service_group` / manifest package root exists -> mapped only if unique single package/service match (`manifest_package_root`), otherwise `ambiguous_nodes` / `no_matching_node`.
  3. G05 findings with `endpoint`: matched deterministically against unique `api` node (`observed_in_source`, matching route template + method via strict segment comparison); `>1` nodes -> `ambiguous_nodes`; `0` -> `no_matching_node`.
  4. Deduplicated per logical finding across sources, with explicit `coverage` (`available | partial | stale | not_scanned | unavailable`), `staleReasons`, `unmatched[]`, scan ID, and commit SHA.
- **UI**: Merge Guard overlay (`GRD-013`) cleanly alongside Sentinel runtime incidents (`CAN-008`) in `LiveCanvas`, keeping demo mode isolated, adding severity badge styling (`critical/high/medium/low`), engine/risk filtering, risk overlay toggle, selected-node source evidence links (`/app/projects/[id]/guard/findings`), stale warnings, and unmatched findings drawer.

### 3.3 GRD-020 — Guard → Intelligence (S09 External Intelligence)
- **Producer & Outbox**: `G06IntelligenceAdapter` (`IntelligencePort`) normalizes operational G02 `InventoryItem[]` + SBOM metadata with exact commit SHA, digest (`inventoryDigest`), lockfile path, ecosystem, and license status (`unknown` explicit when absent) into `guard.g06_outbox` (`topic = 'intelligence_inventory'`) with idempotency key `(projectId, commitSha, inventoryDigest)`.
- **Consumer Integration**: G06 delivery worker invokes Sentinel S09's real `InventoryStore.save` + `assessExposure` (against configured `SENTINEL_DB_*` + project's `sentinel.project_bindings`), verifies returned `snapshotId` & `ExposureReport`, persists correlation (`snapshotId`, `assessment`, exposure count, unsupported ecosystems, catalog version/sync timestamp) into `guard.g06_intelligence_sync`, and marks outbox `acknowledged`. If Sentinel DB or project binding is absent, records explicit `consumer_unavailable` / `project_not_registered` with bounded exponential backoff retry.

### 3.4 GRD-021 — Guard → Sentinel Pipeline Event Outbox
- **Producer & Outbox**: `G06SentinelAdapter` (`SentinelPort`) emits versioned `GuardPipelineEventV1` (`release_evaluated` from G04/G02, `remediation_retested` ONLY when real persisted G02/G05 retest evidence exists — never fabricated) after redacting credentials/tokens and validating via `validateGuardHandoff(..., { securityIncident: false })`.
- **Durability & Honesty**: Durable PostgreSQL outbox (`guard.g06_outbox`, `guard.g06_delivery_attempts`) with advisory/lease fencing (`SKIP LOCKED`), crash lease recovery, bounded retries + jitter/backoff, conflict detection (HTTP `409` or digest mismatch), and never maps Guard events to runtime Sentinel `incidents`. Delivers over signed HTTPS/HTTP when `GUARD_G06_SENTINEL_CONSUMER_URL` is configured (verified end-to-end against an isolated HTTP consumer in tests); remains honestly in `pending` / `consumer_unavailable` (`PARTIALLY_VERIFIED — CONSUMER_ACKNOWLEDGMENT_BLOCKED` in release readiness) until Sentinel core exposes a native `guard_pipeline_audit` ingestion endpoint.

### 3.5 Unified Guard Security Reports
- Aggregates persisted G01/G02 scans/findings/coverage/inventory/SBOM, G02/G03 remediation/retest status (`NOT_CONNECTED` for absent full G03), G04 policy/checks/deployments (`enforced=false` without real Vercel proof), G05 DAST/Integrity runs/findings, G06 Canvas overlay coverage, Intelligence exposure assessment, and Sentinel event delivery status.
- Persisted in `guard.g06_reports` with digest, retention expiry, tenant-isolated GET/POST/export (JSON + XSS-safe escaped HTML), and mandatory download audit entries in `guard.g06_audit`.

---

## 4. Security Risks & Guardrails Identified

1. **Cross-tenant data bleed via Canvas graph cache or API path**: All G06 routes derive workspace/project exclusively from `authorizeGuardProject(token, projectId)` + DB `FORCE RLS` transaction variables (`wetscan.workspace`, `wetscan.project`, `wetscan.module`, `wetscan.mode`), never trusting client workspace headers or `body.workspaceId`.
2. **Demo vs Live contamination**: Demo Canvas (`/app/demo/canvas` or `mode === "demo"`) never fetches G06 live routes; Live Canvas only queries G06 for verified GitHub project IDs (`github-[1-9]\d{0,15}`).
3. **HTML report XSS**: All strings in HTML export pass through `escapeHtml` (`release.ts`) and serve with `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'` and `X-Content-Type-Options: nosniff`.
4. **Secret leakage in outbox payloads, logs, and errors**: Shared `redact` helpers strip tokens (`ghp_`, `ghs_`, `github_pat_`, Bearer, URL userinfo, DAST headers/cookies) before persisting outbox payloads, report snapshots, and audit/error fields.
5. **Dual-role PG separation**: App routes connect strictly as `wetscan_guard_app`; delivery worker connects strictly as `wetscan_guard_worker`.

---

## 5. Exact G06 Work Plan & Acceptance Matrix

| Workstream | Key Deliverables | Primary Verification Tier |
|---|---|---|
| 1. Audit & GitHub-only scope alignment | `GUARD_G06_INITIAL_AUDIT.md`, `G06_PROGRESS.md`, docs update (`G06.md`, `GUARD_IMPLEMENTATION_STATUS.md`, `INTEGRATION_BACKLOG.md`) | Document audit |
| 2. G06 Schema, Roles & Local PG (`55437`) | `migrations/guard/g06/0002_g06.{up,down}.sql`, `src/features/guard/g06/{db,migrations,contracts}.ts`, `scripts/guard-g06-local-env.ts`, `database-config.ts` update | Real PG 18 migrations, `FORCE RLS`, role isolation tests |
| 3. GRD-013 Guard → Canvas Overlay & UI | `src/features/guard/g06/canvas-overlay.ts`, `G06CanvasAdapter`, merged overlay in `LiveCanvas`, risk badges/counts/toggles/filters/inspector/unmatched UI | Unit deterministic mapping + real PG integration + Playwright + Axe |
| 4. GRD-020 Guard → Intelligence Outbox & Consumer | `src/features/guard/g06/{outbox,intelligence-bridge,worker}.ts`, `G06IntelligenceAdapter`, real S09 `InventoryStore`/`assessExposure` consumer delivery, Intelligence & Guard UI sync | Unit + dual-DB PG integration (Guard PG + Sentinel S09 PG) + Playwright |
| 5. GRD-021 Guard → Sentinel Pipeline Outbox | `src/features/guard/g06/{sentinel-bridge,worker}.ts`, `G06SentinelAdapter`, secret redaction, retry/backoff/crash recovery, HTTP consumer adapter | Unit + PG crash/retry/conflict tests + local HTTP consumer test |
| 6. Unified Guard Reports & UI | `src/features/guard/g06/{unified-report,service,http,runtime,panel}.ts*`, `/api/guard/projects/[projectId]/g06/[resource]`, Guard `"Reports & Bridges"` tab | Unit XSS/status honesty + PG persistence/download audit + Playwright |
| 7. Full Regressions, Build & Draft PR | Full Vitest, G04/G05/G06 PG tests, S09/S10/S11 & Guard E2E Playwright, `next build --webpack`, `npm audit`, docs, commit, push, draft PR, CI watch | Full CI matrix |
