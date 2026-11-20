# WetScan Guard G05 Architecture — Scoped DAST, Authenticated API Testing, Canvas Integration & Live Integrity Verification

**Classification:** `REAL_LOCAL_SYNTHETIC_VERIFIED` (verified end-to-end against isolated G05 PostgreSQL 18 + standalone worker + Docker synthetic staging container; external staging remains gated on target-specific authorization)  
**Branch:** `feat/guard-g05-dast-integrity`  
**Base Commit:** `d2ef683` (`origin/master`, chosen over unmerged `feat/guard-g04-cicd` so G05 remains independently mergeable without cross-module coupling)

## 1. End-to-End Pipeline

```text
Authorized Project (authorizeGuardProject + CSRF requireOrigin)
  → Staging Target Scope (revisioned config + digest + routes/methods/rate/request caps)
  → Time-Bounded Execution Grant (targetRevision + targetDigest + category subset + proof/ref)
  → Sealed Synthetic Test Accounts (AES-256-GCM bound to workspace|project|target|account AAD)
  → Canvas Trust Plans (GRD-014) + Canvas Workflow Import (GRD-015) → TestPlan Preview
  → Durable Queue Admission (platform.jobs, kind='guard.g05.verify', idempotency_key)
  → Isolated G05 Worker (scripts/guard-g05-worker.ts, lease heartbeat + grant re-checks)
  → Enforced Egress Client (egress.ts: public DNS/IP pinning, private/metadata CIDR denial, local synthetic pin + health identity header check)
  → DAST & Auth Matrix Engine (dast-engine.ts) + 5-Invariant Integrity Runner (integrity-engine.ts)
  → Secret Redaction (vault.ts) + Guaranteed Session/Order Cleanup Verification
  → PostgreSQL 18 Persistence (12 FORCE ROW LEVEL SECURITY tables, guard.g05_schema_migrations)
  → Guard Live UI (/app/projects/[projectId]/guard/dast) + Persisted Reports (JSON & escaped HTML) + Targeted Retests
```

## 2. Module Map

| Component | Path | Responsibility |
|---|---|---|
| Domain contracts | `src/features/guard/g05/contracts.ts` | Shared types for targets, grants, accounts, Canvas Trust/Workflow imports, plans, runs, cases, findings, reports |
| Schema & migrations | `migrations/guard/g05/0002_g05.up.sql`, `0002_g05.down.sql`, `src/features/guard/g05/migrations.ts` | Additive `0002_g05` schema with independent `guard.g05_schema_migrations` ledger (preserves `0001_guard`), 12 `FORCE ROW LEVEL SECURITY` tables, worker discovery `guard.g05_pending_scopes`, no `DELETE` grants |
| DB pool loader | `src/features/guard/g05/db.ts` | Least-privilege `wetscan_guard_app` and `wetscan_guard_worker` `ApprovedPool` sessions via `GUARD_G05_DB_*` |
| Queue integration | `src/features/guard/g05/queue.ts` | `G05PostgresQueue` extending `PostgresQueue` (`guard.g05.verify`), expired lease recovery without blindly retrying state-changing runs (`maxAttempts=1`) |
| Credential vault & redaction | `src/features/guard/g05/vault.ts` | AES-256-GCM sealing/unsealing with context AAD and recursive secret redaction (`redactG05Text`, `redactHeaders`, `redactG05JsonValue`) |
| Enforcing HTTP client | `src/features/guard/g05/egress.ts` | DNS lookup + private/loopback/metadata CIDR blocklist + pinned socket lookup callback + local synthetic pin check + manual redirect inspection + request/concurrency/RPS/size/timeout/cancel controls |
| Canvas bridge & planner | `src/features/guard/g05/canvas-bridge.ts` | Strict `evaluateCanvasTrustPlan`, `importCanvasWorkflow` (acyclic state graph check), `validateTargetInput`, `buildG05TestPlan` |
| DAST & auth session engine | `src/features/guard/g05/dast-engine.ts` | Security headers, CORS reflection, auth boundaries, session expiry/revocation cleanup, open-redirect checks, Auth Matrix |
| Live Integrity Runner | `src/features/guard/g05/integrity-engine.ts` | Executes all 5 integrity invariant families (`ownership`, `workflow_bypass`, `state_transition`, `replay`, `unauthorized_modification`) with pre/post state comparison and verified cleanup |
| PostgreSQL store | `src/features/guard/g05/store.ts` | Scoped CRUD, revision conflict locking, worker fencing (`assertActiveLease`), `verified_fixed` retest promotion, audit logging |
| Application service & reports | `src/features/guard/g05/service.ts` | Target authorization validation (`verifyTargetAuthorization`), grant issuance/revocation, targeted retest builder, exact-revision JSON & escaped HTML reports |
| Worker loop & runtime | `src/features/guard/g05/worker.ts`, `src/features/guard/g05/runtime.ts`, `scripts/guard-g05-worker.ts` | Standalone queue worker with lease heartbeats and mid-flight grant/cancellation monitoring; runtime disabled by default (`GUARD_G05_ENABLED !== "1"`) |
| HTTP API route | `src/features/guard/g05/http.ts`, `src/app/api/guard/projects/[projectId]/g05/[resource]/route.ts` | Next.js App Router API (auth + CSRF + 128 KiB bounded JSON; never runs active DAST scans inline) |
| Guard Live UI tab | `src/features/guard/g05/panel.tsx`, `src/features/guard/live/live-workspace.tsx`, `src/app/app/projects/[projectId]/guard/[[...section]]/page.tsx`, `src/components/app-shell.tsx` | 7th Live Guard tab `DAST & Integrity` covering Targets & Grants, Sealed Accounts, Canvas & Test Plan Preview, Execution & Integrity Diffs, Findings Triage & Reports |
| Synthetic staging server | `worker/guard/g05-staging/server.ts`, `Dockerfile`, `scripts/guard-g05-staging.ts`, `scripts/guard-g05-local-env.ts` | Non-privileged Dockerized synthetic staging app (`127.0.0.1:4115`) with runtime fault toggles and isolated local PG 18 (`127.0.0.1:55436`) |

## 3. Lifecycle Separation

The implementation enforces strict state distinctions in both PostgreSQL schemas and UI badges:
- **Definition (`g05_test_plans`)** is never reported as an executed run.
- **Authorization (`g05_execution_grants` + `g05_target_revisions`)** binds every run to a specific target revision, digest, category subset, and unexpired window.
- **Execution & Observation (`g05_case_results`)** stores normalized HTTP observations plus persisted `preState` and `postState` snapshots.
- **Evaluation (`g05_runs.summary.decision`)** distinguishes `PASS`, `FAIL`, and `INCOMPLETE` — `INCONCLUSIVE`, `NOT_EXECUTED` (such as TLS on loopback synthetic HTTP), `CANCELLED`, and `CLEANUP_FAILED` can never produce `PASS`.
- **Verified Cleanup (`cleanupStatus`)** requires confirmed deletion of created synthetic records and revocation of synthetic login sessions before clearing state.
