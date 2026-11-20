# WetScan Guard G06 Architecture

**Branch:** `feat/guard-g06-full-integration`  
**Base Commit (`origin/master`):** `4e33fed23a5825af1103d403a7cbc4568d9c3d96`  
**Authoritative Source Scope:** **GitHub ONLY** (`User Authentication → GitHub App Connection → Repository Selection → Immutable Commit SHA → Existing Snapshot/Queue/Worker/Scanners`). `GRD-002` (GitLab) and ZIP upload scanning are `OUT_OF_SCOPE_BY_OWNER_DECISION`.

---

## 1. System Topology & Preservation Boundaries

Guard G06 connects persisted Guard execution state (`G01`/`G02`, `G04`, `G05`) to **Canvas**, **Sentinel External Intelligence (S09)**, **Sentinel Pipeline Audit**, and **Unified Guard Security Reports** strictly via additive modules and migrations without altering frozen `0001..0009` Sentinel migrations or breaking existing G01–G05 schemas.

```
[Authorized GitHub Commit Scan (G01/G02)] ──┐
[CI/CD Policy, Check Runs, Deployments (G04)]┼─► [G06Service & G06PostgresStore]
[Scoped Staging DAST & Integrity (G05)] ───┘            │
        │                                               ├──► GRD-013: Canvas Overlay (`guard.g06_canvas_overlays`) ──► LiveCanvas Security Lens
        │                                               │
        ├──► guard.g06_outbox ('intelligence_inventory')┴──► G06OutboxWorker ──► SentinelS09IntelligenceConsumer (`InventoryStore.save` + `assessExposure`) ──► `guard.g06_intelligence_sync`
        │
        ├──► guard.g06_outbox ('sentinel_pipeline') ───────► G06OutboxWorker ──► `HttpSentinelPipelineConsumer` / `UnconfiguredSentinelConsumer` (never fabricates incidents)
        │
        └──► guard.g06_reports + guard.g06_audit ──────────► Unified Guard Reports UI (`Reports & Bridges`) & JSON / XSS-safe HTML export
```

### Preserved Boundaries
- **G03 AI Remediation:** Independent G03 PR is not merged in this branch; G06 preserves G03 integration interfaces and explicitly reports `NOT_CONNECTED` (`g03Merged: false`) rather than duplicating an AI remediation engine.
- **Sentinel Core Schemas (`0001..0009`) & Reports:** Sentinel migrations (`94f99d99...831c`) and S10/S11 internal route contracts remain unmodified. Guard integrates cleanly via `/api/guard/projects/[projectId]/g06/[resource]` and additive UI enrichment (`LiveCanvas`, `LiveExternalIntelligence`).

---

## 2. Database Schema & Roles (`migrations/guard/g06/0002_g06.up.sql`)

Ledger: `guard.g06_schema_migrations` (`0002_g06`).  
All 6 tenant-scoped tables enforce `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` keyed on `(wetscan.module='guard', wetscan.mode='live', workspace_id, project_id)` for `wetscan_guard_app` and `wetscan_guard_worker`, with **zero `DELETE` privileges** granted to either role:

1. `guard.g06_canvas_overlays` — Pinned commit/graph-revision overlay snapshots with coverage status and stale/unmatched counts.
2. `guard.g06_outbox` — Durable dual-topic (`intelligence_inventory`, `sentinel_pipeline`) transactional outbox enforcing `UNIQUE (workspace_id, project_id, topic, idempotency_key)`, payload digest checks, lease owner/token/expiration, and retry backoff scheduling.
3. `guard.g06_delivery_attempts` — Append-only delivery & expired-lease recovery attempt ledger.
4. `guard.g06_intelligence_sync` — Correlated Guard → Sentinel S09 sync state (`snapshot_id`, `exposure_assessment`, `exposure_count`, unknown-license/unsupported ecosystem tracking).
5. `guard.g06_reports` — Append-only persisted Unified Guard Security Report snapshots with SHA-256 digest and 90-day retention window.
6. `guard.g06_audit` — Append-only audit log for overlay persistence, outbox enqueue/ack/retry, report generation, and JSON/HTML downloads.

Worker discovery uses `SECURITY DEFINER` function `guard.g06_pending_deliveries(integer)` granted exclusively to `wetscan_guard_worker` (revoked from `PUBLIC` and `wetscan_guard_app`).

---

## 3. Core Integration Modules

| Module | File(s) | Responsibility |
|---|---|---|
| Contracts & Error Types | `src/features/guard/g06/contracts.ts` | Strongly typed overlay, outbox, sync, unified report, and honest status taxonomy (`VERIFIED \| PARTIAL \| INCOMPLETE \| BLOCKED \| NOT_CONFIGURED \| STALE \| FAILED`). |
| DB & Migrations | `src/features/guard/g06/{db,migrations}.ts`, `scripts/guard-g06-local-env.ts` | Target-verified migrator, `GUARD_G06_DB_*`/`GUARD_DB_*` config, isolated PG 17 container (`55437`). |
| Secret Redaction | `src/features/guard/g06/redaction.ts` | Strips GitHub tokens, PATs, JWTs, AWS keys, Bearer headers, URL credentials, and sensitive header keys before persistence or export. |
| Store & Readers | `src/features/guard/g06/store.ts` | Sequential RLS-scoped readers for `guard.scans`, `guard.g04_*`, `guard.g05_*` plus CRUD for all 6 `g06_*` tables. |
| GRD-013 Canvas Overlay | `src/features/guard/g06/canvas-overlay.ts`, `src/features/canvas/{adapters/sentinel-overlay,components/guard-coverage,components/graph,components/graph-node,components/inspector}.tsx`, `src/components/views/canvas.tsx` | Deterministic file/manifest/endpoint mapping with app-owner disambiguation (`api`/`frontend`/`backend`/`auth` vs downstream DB nodes), stale commit detection, explicit unmatched classification, toggleable UI, severity dots, engine filter, and evidence navigation. |
| GRD-020 Intelligence Bridge | `src/features/guard/g06/intelligence-bridge.ts`, `src/features/sentinel/components/live-external.tsx` | Normalizes G02 inventory/SBOM, preserves unknown licenses as `null`, enqueues `GuardInventoryV1`, delivers to Sentinel S09 `InventoryStore.save` + `assessExposure`, and enriches `LiveExternalIntelligence`. |
| GRD-021 Sentinel Outbox | `src/features/guard/g06/sentinel-bridge.ts`, `src/features/guard/g06/worker.ts`, `scripts/guard-g06-worker.ts` | Validates `GuardPipelineEventV1` (`release_evaluated`, verified `remediation_retested` only), strips secrets, enforces `securityIncident: false`, and delivers via signed HTTPS/loopback consumer or preserves durable retry state. |
| Unified Report & UI | `src/features/guard/g06/{unified-report,service,runtime,http,panel}.ts*`, `src/app/api/guard/projects/[projectId]/g06/[resource]/route.ts` | Aggregates G01–G06 state honestly, exports JSON + `escapeHtml`-safe HTML with strict CSP, audits downloads, and integrates the `Reports & Bridges` tab inside `LiveGuardWorkspace`. |
