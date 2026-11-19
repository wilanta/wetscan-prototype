# Sentinel S11 validation summary

Authoritative execution counts, commands, times and receipts live ONLY in the
[evidence register](SENTINEL_S11_EVIDENCE_REGISTER.md); per-case expectations are in the [test matrix](SENTINEL_S11_TEST_MATRIX.md).
This page states outcomes and points to register IDs. `PASS` means executed and asserted; nothing here is `LIVE_TESTED`.

| Criterion | Result | Where to look |
| --- | --- | --- |
| **S11-A1** build and tests | **PASS** | typecheck, lint, unit, build: register E-A1-1..4 (merge candidate), E-H-1..4 (post-merge remediation) |
| **S11-A2** PostgreSQL + two-project isolation | **PASS** | forced RLS on every tenant table, unscoped sessions read nothing, three scopes see only themselves, foreign UPDATE/DELETE changes nothing, least-privilege roles, idempotent ledger: E-A2-1..8, E-H-5..; dev database upgrade, backup and restore rehearsal: section C |
| **S11-A3** controlled DEV event path + restart | **PASS** (disposable DB + dev DB lifecycle) | pipeline for two projects/two workspaces, worker restart changes nothing, no automatic response/notification/case: E-A2-7; real worker `--once` on `wetscan_dev`: E-DB-12 |
| **S11-A4** provider failures, false positives, TTL rollback | **PASS** (fixtures/loopback only; **no real provider**) | S05-S09 module suites inside E-A2-1..5 |
| **S11-A5** browser DEMO/LIVE, Canvas, Reports | **PASS** (mocked transport + provider-substituted production-build E2E). **Real GitHub session NOT_RUN** | E-A5-1..11, F, H |
| **S11-A6** CI and credential protection | **PASS with explicit gaps** | enforced jobs on hosted runners: section F and H. Gaps: no branch protection / required checks (owner O-5); optional dependency review needs GitHub Advanced Security (skipped unless `GHAS_ENABLED=true`) |
| **S11-A7** H09 decision package | **DELIVERED; decision pending** | [H09](SENTINEL_S11_H09_DECISION.md): production `NO_GO`, staging `DEFER`, `H09_OWNER_DECISION_PENDING`, release-gate matrix in section 2A, no production authorization |

## Defects found and their status
Merge candidate (PR #15): S11-F1 health false readiness (fixed), S11-F2 no response headers (fixed), S11-F3 notifier `CONNECT`
provisioning gap (mitigated; owner decision O-3), S11-F4 pre-auth ingest admission (accepted risk R-4), S11-F11 CRLF breaks
hash-pinned PowerShell (fixed), S11-F12 PG teardown errors (fixed). Post-merge review: all nine findings and the line-ending
question closed in the [security review](SENTINEL_S11_SECURITY_REVIEW.md) section 4. Test-authoring errors made along the way
are in register sections D and F and were fixed without weakening any assertion.

## How to reproduce
```
npm ci && npm run typecheck && npm run lint && npm test && npm run build && npm run sentinel:secret-scan && npm audit --audit-level=high
docker run -d --name s11-pg -e POSTGRES_PASSWORD=<throwaway> -p 127.0.0.1:55441:5432 --tmpfs /var/lib/postgresql/data postgres:17.12-bookworm
export SENTINEL_S05_PG_ADMIN_URL=postgres://postgres:<throwaway>@127.0.0.1:55441/postgres   # and S06..S09 the same
npm run test:sentinel:{response,notifications,ghost,intelligence,external,s10,s11}:postgres
npx playwright test -c tests/sentinel/<s10|telemetry|detection|incident|response|notification|ghost|intelligence|external>.playwright.config.ts --timeout=300000
npx playwright test -c tests/sentinel/playwright.config.ts --timeout=300000   # original demo
node tests/auth/run-github-e2e.mjs                                             # production build + provider-substituted identities
```
The S01 gated suite needs a throwaway approval for a database named `wetscan_s01_test_*`; CI generates one with
`scripts/sentinel-ci-s01-fixture.ts` (`SENTINEL_CI_S01_ADMIN_URL=postgres://postgres:<pw>@127.0.0.1:<port>/postgres`, then
`npm run test:platform:postgres`).
