# WetScan Guard G05 Validation Record

**Classification:** `REAL_LOCAL_SYNTHETIC_VERIFIED`  
**Branch:** `feat/guard-g05-dast-integrity`  
**Isolated Worktree:** `C:\Users\sheil\OneDrive\Dokumen\Wildhan\projects\wetscan-guard-g05` (branched from `origin/master` `d2ef683`)

## 1. Environments Used (Zero Shared Mutation)

| Component | Identifier / Endpoint | Purpose |
|---|---|---|
| Guard G05 PostgreSQL 18 | Container `wetscan-g05-local-pg` on `127.0.0.1:55436`, DB `wetscan_dev_guardg05` | Isolated schema (`0002_g05`), 12 FORCE RLS tables, separate `wetscan_guard_app` / `wetscan_guard_worker` / `wetscan_guard_migrator` roles |
| Synthetic Staging Target | Container `wetscan-g05-synthetic-staging` (`wetscan-g05-staging:local`) on `127.0.0.1:4115` | Hardened vs runtime fault-toggled DAST, Auth Matrix, and 5-Invariant Integrity target |
| Preserved Sibling Environments | `wetscan-g02-local-pg` (`55434`), `wetscan-g04-local-pg` (`55435`), local app `3000` | Untouched throughout G05 execution |

## 2. Executed Checks & Verified Results

| Suite / Command | Scope | Observed Result |
|---|---|---|
| `npm run typecheck` (`tsc --noEmit`) | All source & test TypeScript | Passed (`0` errors) |
| `npm run lint` (`eslint .`) | ESLint + React 19 rules | Passed (`0` errors, `2` pre-existing warnings in `worker/guard/installation/persistence-fixture.ts`) |
| `npm run sentinel:secret-scan` | 1320 repo files (1279 scanned, 41 binary) | Passed (`0` findings, `0` incomplete) |
| `npm audit --audit-level=high` | Dependency audit | Passed (`0` vulnerabilities) |
| `npx vitest run tests/guard/g05/http.test.ts tests/guard/g05/vault.test.ts tests/guard/g05/egress.test.ts tests/guard/g05/engine.test.ts` | Vault encryption/AAD/redaction, DNS/IP/rebinding/redirect/cap egress controls, Canvas Trust/Workflow import contracts, DAST/Auth Matrix/5-Invariant engine (including `falseErrorWithMutation`), Route auth/CSRF/HTML XSS escaping | Passed: `4` test files, `16/16` tests |
| `npm run test:guard:g05:postgres` | Real PostgreSQL `55436` schema/FORCE RLS/`0002_g05.down.sql` refusal, cross-workspace/project isolation, worker vs app role boundaries, real worker loop vs Docker staging container (`4115`) failing 6 cases in vulnerable mode, targeted retest -> `verified_fixed` + PASS report, grant revocation & cancellation | Passed: `3` test files, `7/7` tests |
| `node tests/guard/g05/browser/run.mjs` | Production `next build --webpack` + `next start` (`127.0.0.1:3119`) + standalone `scripts/guard-g05-worker.ts --loop` + Docker staging (`4115`) + Playwright (`tests/guard/g05/browser/g05.spec.ts`): target/grant/accounts/Canvas/preview, vulnerable scan -> reload survival -> targeted retest -> PASS -> report download -> cross-project 403/404 -> Demo isolation -> Axe WCAG light & dark (`0` violations inside G05 workbench) -> 400px mobile width (`overflow === false`) | Passed: `1/1` E2E flow (`52.9s`), output artifact `test-results/guard-g05/browser.result.json` |
| `npm run test:guard:live` | Existing Guard Live + G01 + G02 + MVP unit suites | Passed: `44` test files, `439/439` tests |
| `node scripts/guard-live-check.mjs browser` (`live-ui.spec.ts`) | Existing Guard Live 7-tab UI Playwright checks (after earlier single 20s cold-compile timeout under dev contention) | Passed: `9/9` browser specs (`3.2m`) |
| `npx vitest run --maxWorkers=2` | Full repo offline test suite | `187/188` files passed (`2707/2708` tests passed); `1` unrelated Sentinel PowerShell 5000ms timeout (`tests/sentinel/owner-reauth.test.ts:415` under multi-worker load, which passed `58/58` cleanly when executed in `task-614`) |
| `node tests/mvp/run-integrated-e2e.mjs tests/mvp/playwright.config.ts` | Legacy Orderly Demo Playwright suite (`tests/mvp/local-guard.spec.ts`) | `4/5` passed cleanly (including Test 4 `live project navigation uses live Guard and never inherits demo findings`); Test 2 (`one prototype workflow`) timed out during cold `next dev` `/onboarding` OAuth callback compilation on Windows (`55s`–`60s`) |

## 3. Physical Execution Evidence Summary

- Vulnerable Docker staging run (`70c6c2eac51f...`): `status: completed_partial` (`NOT_EXECUTED` on HTTP loopback `dast_tls`), `summary.decision: FAIL`, `cleanupStatus: verified`, all 5 integrity invariants caught (`ownership`, `workflow_bypass`, `state_transition`, `replay`, `unauthorized_modification`), Docker container `orderCount` restored cleanly to baseline (`2`).
- Hardened targeted retest run (`10be2c7d49ab...`): `status: completed`, `summary.decision: PASS`, `cleanupStatus: verified`, prior open findings promoted to `verified_fixed`.
- Persisted JSON & escaped HTML reports match PostgreSQL rows verbatim with zero leaked credentials in DOM, HTTP responses, case results, or audit trails.
