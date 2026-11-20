# WetScan Guard Release Readiness Assessment (G01–G06)

**Assessment Date:** 20 November 2026  
**Product Model:** GitHub Repository Security Scanning & Cross-Module Guard Integrations  
**Branch:** `feat/guard-g06-full-integration`  
**Owner Product Decisions:** GitHub-only acquisition; `GRD-002` (GitLab) & ZIP upload scanning are `OUT_OF_SCOPE_BY_OWNER_DECISION`.

---

## 1. Overall Go / No-Go Verdict

| Target Environment | Verdict | Rationale |
|---|---|---|
| **Local / Staging Integrated Demonstration (GitHub App + PG 17/18 + G06 Worker)** | **READY (with feature flags explicitly enabled)** | G01–G02, G04, G05 (`4115`), Canvas (`GRD-013`), S09 External Intelligence (`GRD-020`), Sentinel Outbox (`GRD-021`), and Unified Guard Reports (`GRD-022`) are integrated, built cleanly (`next build --webpack`), and verified end-to-end against PostgreSQL and real browser/Axe checks. |
| **Unflagged Default Runtime** | **SAFE / FAIL-CLOSED** | `GUARD_G06_ENABLED !== '1'` disables G06 routes (`503 g06_disabled`), preserves Sentinel S09 `"not integrated"` fallback, and maintains demo isolation. |
| **Full Unattended Production Release** | **CONDITIONAL / NO-GO ON EXTERNAL GATES** | Blocked only on external owner/provider dependencies listed in Section 3 (G03 merge/provider, G04 GitHub Checks/Vercel tokens, G05 external staging authorization, GRD-021 Sentinel core consumer endpoint). |

---

## 2. Gate-by-Gate Readiness Summary

| Phase | Gate Focus | Local / DB Proof Status | Production External Blockers |
|---|---|---|---|
| **G01** | GitHub auth, commit-pinned source grants, PostgreSQL RLS, worker fencing | Verified in G01 unit/PG & onboarding E2E | Production host/worker cluster secrets & GitHub App credentials |
| **G02** | Opengrep SAST, OSV SCA, Gitleaks Secrets, Trivy IaC, CycloneDX SBOM | Local scanner image `wetscan-g02-scanners:local` & PG persistence verified | Cloud worker container execution environment |
| **G03** | AI remediation proposals, patch validation, targeted retest | Preserved `NOT_CONNECTED` boundary cleanly | Independent G03 PR must be reviewed/merged separately; consented AI provider key |
| **G04** | Webhooks, deterministic policy gate, GitHub Check Runs, Vercel verification | Verified locally against PG + deterministic rules (`enforced=false`) | GitHub App `checks:write` permission + live webhook + Vercel token/project (`HANDOFF_GUARD_G04.md`) |
| **G05** | Scoped staging DAST, encrypted synthetic credentials, Canvas Trust/Workflow, 5-invariant runner | `REAL_LOCAL_SYNTHETIC_VERIFIED` (`55436` PG + Docker `4115` + Playwright `1/1`) | Owner-approved external staging URL + dummy credentials (`HANDOFF_GUARD_G05.md`) |
| **G06** | Canvas overlay (`GRD-013`), S09 Intelligence sync (`GRD-020`), Sentinel outbox (`GRD-021`), Unified Reports & audit | `COMPLETE` for Canvas / Intelligence / Reports; `PARTIALLY_VERIFIED` for GRD-021 HTTP delivery (`3/3` PG, `1/1` Browser+Axe, `26/26` S10, `10/10` S09) | Configure `GUARD_G06_SENTINEL_CONSUMER_URL` + HMAC secret when Sentinel core ships its `guard_pipeline_audit` ingestion endpoint |

---

## 3. Exact Production Activation Checklist

1. **Apply additive G06 migration** (`migrations/guard/g06/0002_g06.up.sql`) to the operational Guard PostgreSQL database as `wetscan_guard_migrator` (requires existing `guard` schema from `0001_guard`, `0002_g04`, `0002_g05` and roles `wetscan_guard_app`, `wetscan_guard_worker`).
2. **Set Guard & Sentinel DB environment bindings**:
   - `GUARD_G06_ENABLED=1` and `GUARD_LIVE_READ_ENABLED=1`
   - `GUARD_DB_APP_*` (connected strictly as `wetscan_guard_app`) and `GUARD_DB_WORKER_*` (connected strictly as `wetscan_guard_worker`)
   - `SENTINEL_DB_*` + `sentinel.project_bindings` rows so `G06OutboxWorker` can execute `SentinelS09IntelligenceConsumer` against S09.
3. **Run background outbox worker (`npm run guard:g06:worker`)**:
   - Configure `GUARD_G06_SENTINEL_CONSUMER_URL` (`https://...`) and HMAC secret once Sentinel core activates `guard_pipeline_audit` intake.
   - Without `GUARD_G06_SENTINEL_CONSUMER_URL`, pipeline audit events stay durably queued (`retry_scheduled` / `consumer_unavailable`) without data loss or false acknowledgment.
4. **Verify G04 & G05 prerequisites** per `docs/GUARD_G04_RELEASE_READINESS.md` and `docs/GUARD_G05_RELEASE_READINESS.md` before enabling CI enforcement (`enforced=true`) or live staging DAST (`GUARD_G05_ENABLED=1`).
