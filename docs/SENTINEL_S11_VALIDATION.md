# Sentinel S11 validation summary

Candidate `1e446cd` on `master@0ab9256`. Details, commands and receipts: [evidence register](SENTINEL_S11_EVIDENCE_REGISTER.md);
per-case results: [test matrix](SENTINEL_S11_TEST_MATRIX.md). `PASS` means executed and asserted; nothing here is `LIVE_TESTED`.

| Criterion | Result | One-line evidence |
| --- | --- | --- |
| **S11-A1** build and tests | **PASS** | typecheck 0; lint 0; unit **2098/2098** (112 files, baseline 1780/108); build 0 |
| **S11-A2** PostgreSQL + two-project isolation | **PASS** | 37 tenant tables forced RLS; unscoped = 0 rows; 3 scopes see only themselves; foreign UPDATE/DELETE = 0 rows; roles least-privilege; ledger idempotent; S01 14/14, S05-S10 115/115, S11 13/13; **dev DB 0004->0009 with 24/25 tables identical**, restore rehearsal identical |
| **S11-A3** controlled DEV event path + restart | **PASS** (disposable DB + dev DB lifecycle) | telemetry -> rule -> alert -> incident -> evidence for 2 projects/2 workspaces; worker restart changes nothing; no automatic response/notification/case; real worker `--once` on `wetscan_dev` clean |
| **S11-A4** provider failures, false positives, TTL rollback | **PASS** (fixtures/loopback only) | S05 23 cases incl. TTL/rollback/crash reconcile; S06 retries/dead-letter/unknown; S07 benign classification; S09 outage/stale/crash recovery; no false success states. **No real provider** |
| **S11-A5** browser DEMO/LIVE, Canvas, Reports | **PASS** (mocked transport + provider-substituted E2E) | 77 browser tests + 21 production-build E2E; 3 viewports, dark theme, keyboard, axe, print; demo makes zero live calls. **Real GitHub session NOT_RUN** |
| **S11-A6** CI and credential protection | **PASS with one explicit gap** | the four enforced jobs are **green on GitHub-hosted runners** (PR #15, run `44483248275`, head `cf61ff3`) after four diagnosed failures preserved in register F; secret scan 776 files / 0 findings; `npm audit` 0. **Gap:** advisory dependency review is `BLOCKED` (no GHAS/dependency graph) and no required-check/branch protection exists (owner O-5) |
| **S11-A7** H09 decision package | **DELIVERED; decision pending** | technical recommendation `NO_GO` (production) / `DEFER` (staging); `H09_OWNER_DECISION_PENDING`; no production authorization |

## Defects found and their status
S11-F11 CRLF breaks hash-pinned PowerShell (fixed), S11-F12 PG teardown errors (fixed), S11-F1 health false readiness (fixed), S11-F2 no response headers (fixed), S11-F3 notifier `CONNECT` provisioning gap
(mitigated, owner decision O-3), S11-F4 pre-auth ingest admission (accepted risk R-4). Historical test-authoring errors made
during S11 (E-B-3, E-B-6, E-B-7, E-B-8) are in the register and were fixed without weakening any assertion.

## How to reproduce
```
npm ci && npm run typecheck && npm run lint && npm test && npm run build && npm run sentinel:secret-scan && npm audit
docker run -d --name s11-pg -e POSTGRES_PASSWORD=<throwaway> -p 127.0.0.1:55441:5432 --tmpfs /var/lib/postgresql/data postgres:17.12-bookworm
export SENTINEL_S05_PG_ADMIN_URL=postgres://postgres:<throwaway>@127.0.0.1:55441/postgres   # and S06..S09 the same
npm run test:sentinel:{response,notifications,ghost,intelligence,external,s10,s11}:postgres
npx playwright test -c tests/sentinel/<s10|telemetry|detection|incident|response|notification|ghost|intelligence|external>.playwright.config.ts --timeout=300000
npx playwright test -c tests/sentinel/playwright.config.ts --timeout=300000   # original demo
node tests/auth/run-github-e2e.mjs                                             # production build + provider-substituted identities
```
The S01 gated suite needs a generated throwaway approval for a database named `wetscan_s01_test_*` (see register E-A2-8).
