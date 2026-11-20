# WetScan Guard G05 Release Readiness

**Current Classification:** `REAL_LOCAL_SYNTHETIC_VERIFIED`  
**Default Runtime Posture:** Disabled (`GUARD_G05_ENABLED !== "1"`)

## 1. Feature Completeness Matrix

| Backlog ID | Capability | Status | Evidence Basis |
|---|---|---|---|
| `GRD-011` | Scoped Staging DAST | `REAL_LOCAL_SYNTHETIC_VERIFIED` | Enforcing DNS/IP/redirect/cap client + header/CORS/auth/session/redirect checks verified against Docker synthetic staging & PostgreSQL 18 |
| `GRD-012` | Authenticated DAST Accounts | `REAL_LOCAL_SYNTHETIC_VERIFIED` | AES-256-GCM AAD-bound credential sealing (`vault.ts`), least-privilege worker-only unsealing, masked browser views, verified session revocation cleanup |
| `GRD-014` | Canvas Trust Plans | `REAL_LOCAL_SYNTHETIC_VERIFIED` | Confirmed Trust Plan consumption & evaluation (`canvas-bridge.ts`), cross-project / stale / unconfirmed / expired fail-closed rejection |
| `GRD-015` | Canvas Workflow Import | `REAL_LOCAL_SYNTHETIC_VERIFIED` | Acyclic state-graph validation, endpoint mapping checks, protected fields & replay policy enforcement |
| `GRD-016` | Live Integrity Runner | `REAL_LOCAL_SYNTHETIC_VERIFIED` | All 5 invariant families (`ownership`, `workflow_bypass`, `state_transition`, `replay`, `unauthorized_modification`) + `falseErrorWithMutation` pre/post persisted diff verification & verified order cleanup |

## 2. External Staging Requirements (`LIVE_VERIFIED` Gate)

G05 is ready for merge on `feat/guard-g05-dast-integrity` with default-off gating. Promoting a customer or shared **external staging environment** to `LIVE_VERIFIED` additionally requires:
1. Dedicated HTTPS staging deployment owned by the customer/workspace with valid TLS 1.2+ certificates.
2. Signed, time-bounded target authorization record + owner proof uploaded before activating a `staging` target.
3. Dedicated synthetic non-production test accounts provisioned on that staging environment (no real user/billing records).
4. Enabling `GUARD_G05_ENABLED=1`, `GUARD_G05_DB_*` least-privilege approvals, and `GUARD_G05_VAULT_KEY_FILE` alongside the running `scripts/guard-g05-worker.ts` daemon.

## 3. Rollback & Preservation Safety

- Additive schema `migrations/guard/g05/0002_g05.up.sql` preserves Guard `0001_guard` plan hashes and G02/G04 databases untouched.
- `0002_g05.down.sql` refuses destructive drop (`g05_refuses_rollback_over_retained_rows`) if any retained rows exist in `guard.g05_*`.
- Leaving `GUARD_G05_ENABLED` unset immediately disables mutating DAST/Integrity routes (`503 g05_disabled`) and displays `NOT CONFIGURED` in UI without disturbing Guard `Overview`/`Scans`/`Findings`/`Remediation`/`Releases`.
