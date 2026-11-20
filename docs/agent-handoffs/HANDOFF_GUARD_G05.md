# Hand-Off Document — WetScan Guard G05 (Scoped DAST, Authenticated API, Canvas Trust/Workflows & Live Integrity)

**Date:** 2026-11-20  
**Worktree:** `C:\Users\sheil\OneDrive\Dokumen\Wildhan\projects\wetscan-guard-g05`  
**Branch:** `feat/guard-g05-dast-integrity`  
**Base Commit:** `d2ef683` (`origin/master`)  
**Classification:** `REAL_LOCAL_SYNTHETIC_VERIFIED` (external staging remains gated on explicit target-specific HTTPS approval)

---

## 1. Delivered Scope

All five official G05 backlog items are implemented end-to-end across database schema, backend services, enforcing egress client, worker queue, Guard API routes, Live UI tab, and Docker synthetic staging acceptance:
- **`GRD-011` — Scoped Staging DAST:** Target configuration with immutable revisions/digests, time-bounded consent grants (`g05_execution_grants`), pre-connect DNS/IP validation, DNS-rebinding pinned socket lookup + `remoteAddress` check, manual redirect inspection, method/route allowlists, request/concurrency/RPS/size/timeout caps, and DAST header/CORS/auth/session/redirect verification.
- **`GRD-012` — Authenticated DAST Accounts:** AES-256-GCM AAD-bound synthetic account credential sealing (`src/features/guard/g05/vault.ts`), least-privilege worker-only unsealing (`loadSealedAccountsForWorker`), masked UI/API projections (`credentialConfigured` + fingerprint), session creation/expiration/revocation verification & logout cleanup (`G05SessionManager`).
- **`GRD-014` — Canvas Trust Plans:** Validation & ingestion (`evaluateCanvasTrustPlan`), cross-project/workspace denial (`NOT_AUTHORIZED`), stale revision/expiry rejection (`STALE`), unconfirmed rule denial, and confirmed rule compilation into executable Auth Matrix cases.
- **`GRD-015` — Canvas Workflow Import:** Versioned workflow validation (`importCanvasWorkflow`), acyclic progression enforcement, transition endpoint/method validation, and `TestPlan` preview generation before enqueueing.
- **`GRD-016` — Live Integrity Runner:** Real HTTP + persisted state (`preState`/`postState`) verification across all 5 invariant families (`ownership`, `workflow_bypass`, `state_transition`, `replay`, `unauthorized_modification`), detection of lying HTTP responses (`falseErrorWithMutation`), guaranteed synthetic record deletion + verification, and targeted finding retests promoting `verified` findings to `verified_fixed`.

## 2. Database & Infrastructure State

- Isolated local G05 PostgreSQL 18 container: `wetscan-g05-local-pg` on `127.0.0.1:55436` (`wetscan_dev_guardg05`).
- Isolated Docker synthetic staging container: `wetscan-g05-synthetic-staging` (`wetscan-g05-staging:local`) on `127.0.0.1:4115`.
- Preserved environments (untouched): `wetscan-g02-local-pg` (`55434`), `wetscan-g04-local-pg` (`55435`), local dev app (`3000`).
- Local runtime secrets/pins/approvals live exclusively under `%LOCALAPPDATA%\WetScanGuardG05\` (zero secrets committed).

## 3. Shared / Minimal Core Edits

Minimal backward-compatible edits outside `src/features/guard/g05/` and `tests/guard/g05/`:
1. `src/features/guard/live/database-config.ts`: added `"wetscan_dev_guardg05"` to allowed Guard database names.
2. `src/app/app/projects/[projectId]/guard/[[...section]]/page.tsx`: added `"dast"` route section.
3. `src/components/app-shell.tsx`: included `dast` in `realProject` regex so sidebar preserves live project navigation on `/guard/dast`.
4. `src/features/guard/live/live-workspace.tsx`: added `"DAST & Integrity"` tab rendering `<G05Workbench projectId={projectId} />` + navigation link from `"Logic & Workflows"`.
5. `tests/guard/live/live-ui.spec.ts`: updated live Guard nav link assertion `6` -> `7`.
6. `package.json`: added `"test:guard:g05:postgres"` script.

## 4. Recommended Next Work for G06

G06 (`GRD-002`, `GRD-013`, `GRD-020`, `GRD-021`) can now consume G05 outputs directly without modifying G05 internals:
- Map `guard.g05_findings` (DAST, Auth Matrix, and 5-Invariant Integrity findings) onto Canvas component risk overlays (`GRD-013`).
- Publish G05 verified runs, invariant coverage, and critical integrity violations to Sentinel ingestion (`GRD-021`) and cross-module reports (`GRD-002`).
- Incorporate G05 PASS/FAIL decisions into G04/release summaries while preserving G05's strict `PASS`/`FAIL`/`INCOMPLETE` semantics.

### Copy-Ready Continuation Prompt for G06 Agent

```text
You are continuing WetScan Guard development for G06 (Cross-Module Delivery: Canvas Risk Overlays GRD-013, Intelligence Inventory GRD-020, Sentinel Events GRD-021, and GitLab/ZIP Support GRD-002) in repository wilanta/wetscan-prototype.

Before writing code:
1. Read docs/agent-handoffs/HANDOFF_GUARD_G05.md, docs/GUARD_G05_ARCHITECTURE.md, docs/INTEGRATION_BACKLOG.md, and docs/specs/guard/G06.md.
2. Check which of feat/guard-g04-cicd and feat/guard-g05-dast-integrity are merged into origin/master and base cleanly. Preserve existing G02 (55434), G04 (55435), and G05 (55436 / 4115) local environments untouched.
3. Consume existing Guard G02 findings/SBOM and Guard G05 DAST/Integrity findings (guard.g05_findings, guard.g05_runs, guard.g05_reports) via typed adapters without running active DAST in Next route handlers or modifying Sentinel core tables.
```
