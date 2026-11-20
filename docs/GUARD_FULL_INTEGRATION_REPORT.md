# WetScan Guard G06 Full Integration Report

**Date:** 20 November 2026  
**Repository:** `wilanta/wetscan-prototype`  
**Branch:** `feat/guard-g06-full-integration`  
**Base Commit (`origin/master`):** `4e33fed23a5825af1103d403a7cbc4568d9c3d96`

---

## 1. Executive Summary

WetScan Guard G06 completes the cross-module integration layer connecting persisted **GitHub-only** Guard scans (`G01`/`G02`), CI/CD release evaluations (`G04`), and Scoped Staging DAST/Integrity (`G05`) into **WetScan Canvas (`GRD-013`)**, **WetScan Intelligence / Sentinel S09 (`GRD-020`)**, **Sentinel Pipeline Audit Outbox (`GRD-021`)**, and **Unified Guard Security Reports (`GRD-022` / Unified Reports)**, while preserving the frozen `G03 NOT_CONNECTED` and Sentinel `0001..0009` schema boundaries.

Every integration state is reported strictly according to observed verification:

- **No fabricated scans, provider enforcement, AI patches, or consumer acknowledgments.**
- **`GRD-002` (GitLab Repository Reader) and ZIP upload scanning remain excluded** (`OUT_OF_SCOPE_BY_OWNER_DECISION`).

---

## 2. Module & Integration Classification Table

| Capability / Workstream | Classification | Verified Implementation & Evidence | Remaining Dependency / Note |
|---|---|---|---|
| **Authorized GitHub Source Acquisition (G01)** | `PARTIALLY_VERIFIED` | GitHub OAuth onboarding, `authorizeGuardProject`, commit-pinned snapshots, PG `0001_guard`, `FORCE RLS`, dual roles | Historical G01 production operational acceptance / quorum checks remain governed by G01 operational packets (`GUARD_IMPLEMENTATION_STATUS.md`). |
| **Gitleaks / OSV / Opengrep / Trivy / SBOM Scanners (G02)** | `COMPLETE` (local dev/scanner) | Real scanner normalization, SBOM CycloneDX metadata, persisted `guard.scans`, `Reports & Bridges` consumer integration | Production hosted scanner worker deployment requires owner infrastructure credentials. |
| **AI Remediation Engine (G03)** | `NOT_IMPLEMENTED` (`NOT_CONNECTED` boundary) | Preserved G02 guidance diffing (`product-remediation.ts`) and read-only `remediation` reporting; zero duplicate AI engine created in G06 | Independent G03 PR (`HANDOFF_GUARD_G03.md`) is not merged into `master`; Unified Report explicitly reports `g03Connected: false`. |
| **CI/CD Security Gate (G04)** | `PARTIALLY_VERIFIED` | Webhook HMAC intake, commit-pinned triggers, policy evaluations, Check Run/Deployment records; `enforced: false` preserved truthfully | External GitHub App `checks:write`/webhook installation & Vercel API token/promotion holds remain owner-configured (`HANDOFF_GUARD_G04.md`). |
| **Scoped DAST & Integrity Runner (G05)** | `COMPLETE` (local synthetic PG + Docker `4115`) | `GRD-011`..`GRD-016`, Playwright `1 passed (2.4m)`, integrated into G06 Canvas (`api_route_exact`) and Unified Guard Reports | External production-like staging authorization remains off by default (`GUARD_G05_ENABLED !== '1'`). |
| **GRD-002 GitLab Reader & ZIP Scanning** | `OUT_OF_SCOPE_BY_OWNER_DECISION` | Deliberately omitted from backend/UI/migrations/workers; specs and status docs updated to GitHub-only product scope | Legacy `RepositoryRef` TypeScript type union retained read-only to avoid breaking imports. |
| **GRD-013 Guard -> Canvas Risk Overlay** | `COMPLETE` | `G06CanvasAdapter`, `buildGuardCanvasOverlay` (`evidence_source_path`, `manifest_package_root`, `api_route_exact`, app-owner disambiguation, stale commit guard), `guard.g06_canvas_overlays`, `LiveCanvas` Security Lens toggle, severity counts, engine filter, `<GuardCoverage />` unmatched drawer, Demo isolation | Tested end-to-end across G06 unit (`7/7`), G06 PG (`3/3`), G06 Browser+Axe (`1/1`), and all S10 Canvas tests (`26/26`). |
| **GRD-020 Guard -> Intelligence (S09)** | `COMPLETE` | `G06IntelligenceAdapter`, `guard.g06_outbox` (`intelligence_inventory`), `G06OutboxWorker`, `SentinelS09IntelligenceConsumer` invoking real S09 `InventoryStore.save` + `assessExposure`, `guard.g06_intelligence_sync`, `LiveExternalIntelligence` panel enrichment with intact `"not integrated"` fallback | Tested end-to-end across dual-DB PG (`wetscan_dev_guardg06` + `wetscan_dev_sentinelg06`), Browser (`1/1`), and all S09 Playwright tests (`10/10`). |
| **GRD-021 Guard -> Sentinel Pipeline Outbox** | `PARTIALLY_VERIFIED` | `G06SentinelAdapter`, secret redaction (`redactG06Value`/`redactG06Text`), `securityIncident: false` invariant, crash lease recovery, exponential backoff retries, `409` conflict halt, `HttpSentinelPipelineConsumer` (HTTPS + HMAC-SHA256) | Verified against local loopback HTTP consumer in PG integration test; default `GUARD_G06_SENTINEL_CONSUMER_URL` unset state stays durably `pending`/`consumer_unavailable` until Sentinel core adds a dedicated `guard_pipeline_audit` endpoint. |
| **Unified Guard Security Reports & Retention** | `COMPLETE` | `buildUnifiedGuardReport`, `renderUnifiedReportHtml` (`escapeHtml` + CSP `default-src 'none'`), `guard.g06_reports` (90-day retention), `guard.g06_audit` download logging, Guard `Reports & Bridges` tab (JSON + HTML export) | Tested end-to-end against PG `55437` and Playwright browser download + XSS assertions. |
| **CI Matrix Parity (`ubuntu-latest` PG `55433`)** | `PARTIALLY_VERIFIED` (pending PR CI run) | `.github/workflows/ci.yml` updated to run `npm run test:guard:g06:postgres` alongside existing S11/G01-S10 suites | Local isolated PG 17 verified; CI runner verification completes upon PR creation. |

---

## 3. Cross-Module Integrity & Security Invariants Verified

1. **Tenant & Project Isolation:** Web handlers run strictly as `wetscan_guard_app` inside RLS transactions scoped by `authorizeGuardProject`; background sweeps run as `wetscan_guard_worker` with zero `DELETE` privileges on any `g06_*` table.
2. **Demo vs Live Separation:** Live G06 endpoints only accept `github-[1-9]\d{0,15}`; `/app/demo/canvas` issues zero requests to `/api/guard/projects/*/g06/*`.
3. **Frozen Schemas Preserved:** Sentinel `0001..0009`, Guard `0001_guard`, G04 `0002_g04`, and G05 `0002_g05` migrations remain byte-for-byte unchanged.
4. **Honest Status Representation:** Absent Sentinel consumer stays `consumer_unavailable`; absent G03 stays `NOT_CONNECTED`; unverified Vercel deployment enforcement keeps `enforced: false`; unknown SBOM/OSV licenses remain `null` (`unknownLicenseCount`).
