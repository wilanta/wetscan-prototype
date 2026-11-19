# Sentinel S11 test matrix

Result column = outcome on the S11 code candidate `1e446cd` unless stated (see the
[evidence register](SENTINEL_S11_EVIDENCE_REGISTER.md) for commands, times and receipts). `PASS` only where a test
**executed** and asserted the stated outcome; coverage by an older package's test is named as such and was **re-executed** in
the final matrix. `NOT_RUN`/`BLOCKED` are literal. Levels: unit, Postgres (disposable), API (route modules, mocked storage),
worker (real worker loop), browser (Playwright, mocked transport), E2E (production build, provider-substituted identities),
DEV-PG (owner persistent database).

## S11-A1 - reproducible build and tests
| ID | Level | Given / When / Then | Result |
| --- | --- | --- | --- |
| A1-1 | static | clean tree / `npm run typecheck` / exit 0 | PASS |
| A1-2 | static | clean tree / `npm run lint` / exit 0 | PASS |
| A1-3 | unit | clean tree / `vitest run` / every test passes (counts: register E-A1-3) | PASS |
| A1-4 | build | clean tree / `npm run build` / exit 0 (no dotenv needed) | PASS |
| A1-5 | repeat | each gate ran on the clean master baseline, on the candidate locally, and on GitHub-hosted runners / identical counts (see register sections B, F and H) | PASS (CI repeat executed; two failures that looked flaky were diagnosed as a hydration race and a teardown error, see register F) |

## S11-A2 - PostgreSQL and two-project isolation
| ID | Level | Given / When / Then | Result |
| --- | --- | --- | --- |
| A2-1 | Postgres | 0001-0009 applied / ledger vs plan; second `up` / ledger identical (idempotent) | PASS |
| A2-2 | Postgres | every table in `sentinel`,`platform` / catalog / every tenant table has tenant columns, `ENABLE`+`FORCE` RLS and a policy | PASS |
| A2-3 | Postgres | unscoped tables / catalog / equals the exact 8-entry allowlist (new unscoped table fails) | PASS |
| A2-4 | Postgres | 4 roles / `pg_roles` / no super/createrole/createdb/replication/bypassrls | PASS |
| A2-5 | Postgres | all tables / ACL + `has_*_privilege` / no PUBLIC ACL; no runtime CREATE/TRUNCATE/TRIGGER/REFERENCES | PASS |
| A2-6 | Postgres | functions / `pg_proc` / zero SECURITY DEFINER | PASS |
| A2-7 | Postgres | 3 tenants seeded via real stores + worker / app role **without scope** / 0 rows in every tenant table | PASS |
| A2-8 | Postgres | scope A, A2, B / `SELECT DISTINCT workspace,project` per table / only own pair; forged (ws B + project A, ws A + project B, unknown project, `demo`, `controlled_test`) read nothing | PASS |
| A2-9 | Postgres | scope B / `DELETE`/`UPDATE` rows of project A in every table / 0 rows affected, row counts unchanged | PASS |
| A2-10 | Postgres | scope A / `DELETE`/`UPDATE` on 7 audit/timeline tables / denied or 0 rows, counts unchanged | PASS |
| A2-11 | Postgres | S01 platform suite (queue, leases, fencing, outbox, RLS, retention) | PASS (register E-A2-8) |
| A2-12 | Postgres | S05/S06/S07/S08/S09/S10 module suites (RLS, forged scope, demo mode, wrong role, populated-`down` refusal) | PASS (register E-A2-1 to E-A2-6) |
| A2-13 | DEV-PG | `wetscan_dev` 0004 -> 0009 / pre vs post snapshots / pre-existing tables identical except the ledger (register E-DB-10) | PASS |
| A2-14 | DEV-PG | backup restored on another container / per-table count+md5 / identical | PASS |

## S11-A3 - controlled development E2E and worker restart
| ID | Level | Given / When / Then | Result |
| --- | --- | --- | --- |
| A3-1 | worker+PG | 3 sources (2 projects, 2 workspaces), enabled rules / ingest one batch each, run real worker per scope / exactly 1 incident, 1 alert, 1 evidence link, >=2 timeline entries per project | PASS |
| A3-2 | worker+PG | same data / run worker again (restart) / identical snapshot (no duplicate, no loss) | PASS |
| A3-3 | worker+PG | pipeline complete / count response actions, notifications, cases / all 0 (fail-closed by default) | PASS |
| A3-4 | Postgres | replay same batch / ingest twice / second is `duplicate`, event count +1 only | PASS |
| A3-5 | Postgres | credential of A sends project B / ingest / rejected, no row | PASS |
| A3-6 | Postgres | garbage or revoked credential / ingest / rejected, no row | PASS |
| A3-7 | Postgres | S07 end-to-end decoy hit -> telemetry -> rule -> incident -> overview, duplicate suppression, benign scanner classification | PASS (S07 suite) |
| A3-8 | Postgres | S10 CAN-008 overlay + live report scoped per project | PASS (S10 suite) + report excludes other tenants' incident ids (A5-12) |
| A3-9 | Postgres | S08 archive keeps provenance, never changes the incident; candidates are DRAFT only | PASS (S08 suite) |
| A3-10 | Postgres | S09 inventory -> catalog -> potential exposure; "no inventory" = cannot assess; advisory creates no alert/incident | PASS (S09 suite) |
| A3-11 | DEV-PG | `wetscan_dev` 0009 / worker `--once` without activation / clean lifecycle, exit 0, job table unchanged | PASS |

## S11-A4 - recovery and provider failures (all FIXTURE/loopback; no real provider)
| ID | Level | Given / When / Then | Result |
| --- | --- | --- | --- |
| A4-1 | Postgres | S06 429/5xx/timeout then accept | bounded jittered backoff, one attempt row per try, no phantom delivery - PASS (S06 suite) |
| A4-2 | Postgres | S06 exhausted retries / ambiguous end | dead letter after 5, `unknown` not `failed` - PASS |
| A4-3 | Postgres | S06 worker crash after `attempted`, lease-expiry poison | re-send once / swept to `unknown`, never delivered - PASS |
| A4-4 | Postgres | S06 quiet hours, consent, floor, throttle, controlled-test exclusion, revocation | suppressed with accurate reason, no outbox/job - PASS |
| A4-5 | worker | S05 TTL expiry | limit removed, `expired`; early job refuses - PASS |
| A4-6 | worker | S05 target unavailable / collateral damage / unclean baseline | `apply_failed` / `failed` / `inconclusive`, never `verified` - PASS |
| A4-7 | worker | S05 crash between PUT and commit, duplicate apply, concurrent approvals | reconcile adopts; one apply - PASS |
| A4-8 | Postgres | S09 outage, 429 block window, malformed payload, stale catalog | last-known-good kept, health degraded, freshness from last success - PASS |
| A4-9 | Postgres | S09 crashed lease holder, shutdown mid-sync | recovered / lease released - PASS |
| A4-10 | Postgres | S07 false positives (benign scanner), disabled decoy/source, revoked credential | classified safely, fail closed - PASS |
| A4-11 | unit | S11 health: ledger behind / checksum mismatch / unknown version | `degraded` (503), never `ready` - PASS |

## S11-A5 - browser and UI
| ID | Level | Given / When / Then | Result |
| --- | --- | --- | --- |
| A5-1 | browser | S10 suite: overview, no-source never "safe", unreadable module never healthy, retry w/o stale figures, foreign-project response rejected | PASS (register E-A5-1) |
| A5-2 | browser | Reports window/provenance/limitations, authorized export links, print hides chrome | PASS |
| A5-3 | browser | Canvas overlay: mapped incident with provenance, unmapped listed "not placed", revision/project mismatch discarded, coverage states honest | PASS |
| A5-4 | browser | no horizontal overflow at 1440/768/390 for Overview, Reports, Canvas | PASS |
| A5-5 | browser | dark theme contrast; keyboard reachability and labels; axe: no serious/critical | PASS |
| A5-6 | browser | demo routes issue zero live Sentinel/Canvas API calls; original demo chrome and Ghost/Intelligence nav intact | PASS |
| A5-7 | browser | S02-S09 module UIs (telemetry, detection, incident, response, notification, ghost, intelligence, external) | PASS (register E-A5-2 to E-A5-9) |
| A5-8 | browser | original Orderly Demo walkthrough + interaction suites unchanged | PASS (register E-A5-10) |
| A5-9 | E2E | production build; login/onboarding/installation/dashboard session/Canvas with provider-substituted identities | PASS (register E-A5-11 local, E-H-24 on a Linux CI runner) |
| A5-10 | HTTP | production server / `/demo`, `/login`, `/api/sentinel/ingest` | all carry the S11 headers - PASS (manual curl, run during development on the same code; unit asserts the config) |
| A5-11 | API | 12 routes x GET/POST: malformed/demo id 404, 401, foreign 404 `not_found`, CSRF 403, unknown query 4xx w/o SQL, generic 503 | PASS (route matrix, register E-A1-3 and section H) |
| A5-12 | Postgres | live report for A contains no incident id of A2 or B | PASS |
| A5-13 | E2E | **real GitHub session** against owner repository | **NOT_RUN** |
| A5-14 | browser | visual diff against historical screenshots (`evidence/`) | NOT_RUN (assertions, not pixel diff; historical files preserved unchanged) |

## S11-A6 - CI and secret protection
| ID | Level | Given / When / Then | Result |
| --- | --- | --- | --- |
| A6-1 | CI | `ci.yml` jobs static, build, postgres, browser (+ advisory dependency-review) on a real PR / pinned SHAs, minimal permissions | **PASS** all enforced jobs on hosted runners (register F, H); dependency review BLOCKED (repo setting) |
| A6-2 | unit | secret scan detects 5 credential shapes, ignores loopback/placeholder URLs, never echoes values, flags tracked dotenv | PASS (register E-A1-3) |
| A6-3 | static | secret scan over all tracked files / 0 findings (5 reviewed fixtures allow-listed by exact file+rule) | PASS |
| A6-4 | static | `npm audit` / 0 vulnerabilities | PASS |
| A6-5 | CI | CI never targets `wetscan_dev`: only two loopback disposable service containers; harnesses refuse non-loopback hosts; the CI approval is self-labelled and carries no authority | PASS (executed on a hosted runner) |

## S11-A7 - H09
| ID | Deliverable | Status |
| --- | --- | --- |
| A7-1 | evidence register, runbook, readiness matrix, security review, blockers | delivered |
| A7-2 | technical recommendation | `NO_GO` for production users; `GO` for controlled staging only after the owner actions in the H09 record |
| A7-3 | **owner decision** | `H09_OWNER_DECISION_PENDING` |
| A7-4 | production deployment authorization | **none** |

## Negative-authorization checklist requested by the owner
| Case | Where proven |
| --- | --- |
| Owner vs unrelated user; unauthorized repository; revoked GitHub access; stale/revoked session | route matrix (401, foreign 404); Auth/Canvas suites (`tests/auth*`, `tests/canvas/github-reader`), Auth E2E - existing, re-executed |
| Two projects / two workspaces; wrong project id; malformed id | A2-7..9, A5-11 |
| Revoked/disabled telemetry source; rotated key; revoked notification token | A3-6; S02/S06 suites (re-executed) |
| Wrong worker role / wrong DB identity / wrong plan hash / missing or expired approval | E-DB-05/06 (DEV-PG), `tests/platform/config.test.ts`, S01 suite |
| Wrong RLS variables / missing variables | A2-7, A2-8 |
| Oversized payload / flood | `readJson` limits + admission cap unit tests (existing); route matrix; flood beyond caps NOT_RUN |
| Forged provenance / replay / duplicates | A3-4, A3-5 |
