# Sentinel S11 architecture - hardening, regression and operational readiness

S11 is **not a feature package**. It adds verification, enforcement and operational documentation around S01-S10 and fixes
only defects that affect correctness, security, availability or readiness. No migration, no new table, no new queue, no new
service, no change to the original Orderly Demo, Auth, Guard or Canvas modules.

## 1. What S11 adds

| Area | Artifact | Why it exists |
| --- | --- | --- |
| Independent gates | `.github/workflows/ci.yml` | The repository had no CI; a Vercel badge proves a build, not isolation, RLS or browser behaviour. |
| Cross-module DB matrix | `tests/sentinel/s11-hardening.postgres.integration.ts` (`npm run test:sentinel:s11:postgres`) | Per-module suites seeded their own data; nothing proved the *union* of 0001-0009 is isolated and least-privilege. The matrix is catalog-driven, so a table added by a future migration is audited automatically. |
| Route security matrix | `tests/sentinel/s11-route-matrix.test.ts` | One table drives every real route module with the same negative cases (demo/malformed id, 401, foreign project, CSRF, query hardening, error leakage). A new route directory fails the inventory test until added. |
| Secret scan | `scripts/sentinel-secret-scan.ts` + `tests/sentinel/s11-secret-scan.test.ts` | Credential-shaped values and tracked dotenv files; output is `file:line:rule` only. Reviewed fixture allowlist is exact. |
| Ledger-verified health | `src/platform/health.ts` (`schemaStatus`, `platformHealth(db, workerId, expected)`), call sites in `worker/sentinel/runtime.ts`, `scripts/sentinel-health.ts` | Health used to claim `schema: 0001_foundation` and `ready` whatever the ledger said. |
| Response headers | `next.config.ts` (`securityHeaders`) | No anti-framing / nosniff / referrer policy existed on page responses. |
| Runbook, evidence, H09 package | `docs/SENTINEL_S11_*.md`, `docs/agent-handoffs/HANDOFF_S11.md` | Reproducible release decision with honest `NOT_RUN` entries. |

## 2. Decisions (ADR)

**ADR-1 - Where the unit suite runs in CI.** Options: (a) Linux only, skipping Windows-only tests; (b) Windows only;
(c) Windows for the unit/contract job, Linux for build/PG/browser. **Chosen (c).** The S04 audit/provision suites execute
`powershell.exe` and Windows paths; skipping them would hide a regression class, and running everything on Windows triples
cost and slows PG service containers (not supported on Windows runners). Trade-off: Windows minutes bill at a multiplier on
private repositories.

**ADR-2 - How PG isolation is proven.** Options: (a) extend each module suite; (b) one generic catalog-driven suite;
(c) database dumps compared by hand. **Chosen (b)** over the same disposable harness the S08/S10 suites use. It asserts
*properties of the catalog* (`ENABLE`+`FORCE` RLS, policy present, tenant columns present, exact unscoped allowlist, no
`PUBLIC` ACL, no SECURITY DEFINER, no `TRUNCATE/TRIGGER/REFERENCES`) and *behaviour* (no-scope reads nothing, forged
workspace/project/mode reads nothing, foreign UPDATE/DELETE changes nothing, audit tables immutable, restart is idempotent).
Trade-off: it relies on the `wetscan.*` session variables contract in `src/platform/database.ts`; a change to that contract
must update the helper (`scopeSql`) and will fail loudly rather than silently pass.

**ADR-3 - Health honesty.** Options: (a) keep `schema` static; (b) always read the ledger and compare with the plan.
**Chosen (b), additively**: `schema` is now the latest applied version, `schemaStatus` is new, and callers that do not pass the
expected plan get `unverified` (S01 behaviour). Only the worker passes the plan, so unit fixtures and the legacy S01 smoke
script keep working.

**ADR-4 - Headers.** Options: (a) full nonce-based CSP; (b) non-script directives only; (c) nothing. **Chosen (b).** A
script-restricting CSP needs per-request nonces threaded through Next/React and a full visual regression, i.e. a separate
reviewed change; `frame-ancestors 'none'`, `base-uri`, `form-action`, `object-src 'none'` cannot break rendering.

**ADR-5 - Persistent dev database.** Options: (a) upgrade in place after backup; (b) upgrade only a restored clone. **Chosen (a)**
because the owner authorized it for that exact target and the backup + restore rehearsal proved recoverability first.

## 3. Interfaces with S01-S10

- S01 platform: `platformHealth` signature gained an optional third argument; `schema` value semantics changed from a constant
  to "latest applied". The legacy `sentinel-worker-smoke.ts` compares against `0001_foundation` and only works on an
  S01-only database (historical, bound to the S01 plan hash; not re-run).
- S02-S10: no code change. Their suites were **re-executed** against the S11 candidate.
- Canvas/Auth/Guard/Demo: untouched. `next.config.ts` headers apply to every route including Demo; verified on a production
  server (`/demo`, `/login`, `/api/sentinel/ingest`).

## 4. Trust and mode boundaries (re-verified, not changed)

DEMO (`orderly-demo`), LIVE and CONTROLLED_TEST remain distinct: demo/malformed ids are 404 before identity or storage
(298-case matrix); `mode` is server-derived and the database returns nothing for `demo`/`controlled_test` scope reads of live
rows (matrix `forged mode` case; write refusal is asserted by the S07/S08/S09 suites); controlled-test provenance is carried per source/incident and never promoted to runtime.
Advisories (S09) never create alerts, incidents, responses or notifications (S09-A2 test); `action_applied` is not
`neutralization_verified` (S05 suite); provider `accepted` is not `delivered` (S06 suite).

## 5. Out of scope (kept honest)

New Guard/Canvas/AI/WhatsApp features, cloud deployment, production database, real-provider traffic beyond what the owner
had already configured (none was used), WAF/firewall changes, NVD feed, CSP with script restrictions.
