# Guard G04 validation record (20 November 2026)

Written for: reviewers and the owner deciding what G04 may be called. Overall status: **`G04 PARTIALLY_VERIFIED`** — the pipeline is implemented and verified against real PostgreSQL, a real browser and the real G02 scanner pipeline; the four externally gated capabilities (real GitHub Check Runs, GitHub-originated signed deliveries, required-check enforcement, Vercel hold/release) are **BLOCKED** on owner actions listed in [GUARD_G04_RELEASE_READINESS.md](GUARD_G04_RELEASE_READINESS.md). Nothing here is `PRODUCTION_READY` or "enforced".

Base: `origin/master` `5e52ac2` (contains merged G02 PR #19). Branch `feat/guard-g04-cicd`. No G03 branch existed on the remote; no G03 file was read, merged or changed.

## Acceptance matrix

| Capability | Status | Evidence |
| --- | --- | --- |
| G04-A webhook ingestion (signature, limits, allowlist, dedupe, replay conflict, installation/repo/project binding, no self-trigger, durable audit) | **COMPLETE for Guard's handling**; GitHub-originated delivery **BLOCKED** | 18 unit + route tests, PostgreSQL pipeline tests, HTTP run through the real Next route (below). Deliveries were **self-signed** with a local secret: the GitHub App has no webhook configured |
| G04-B automatic scanning through the real G02 worker | **PARTIALLY_VERIFIED** | Real scan of the vulnerable commit through webhook → trigger → dispatcher → G02 Docker scanners → PostgreSQL → evaluation. SCA (OSV) timed out/hung on this machine, so coverage was incomplete (reported, not hidden). The fixed commit's scan stalled in SCA: no verdict recorded |
| G04-C configurable policy + deterministic evaluator + revisions/audit | **COMPLETE** | 17 evaluator/validation tests; real policy revisions/history in PostgreSQL; UI |
| G04-D GitHub Check Runs via the App | **Implemented; real publication BLOCKED** | Mapping/idempotency/retry/rate-limit/permission-denied covered with a doubled GitHub transport. Against real GitHub: the App's token request with `checks: write` is refused (App has `contents`,`metadata` read only) → `permission_denied`, check kept `published=false` and retried |
| Required-check enforcement on a test branch | **BLOCKED** | No Checks permission and no ruleset exist; Guard only *observes* rules and never edits them |
| G04-E Vercel provider adapter | **Implemented; real provider NOT_RUN** | 17 tests with recorded-shape doubles. No Vercel token/project was available. Official docs reviewed 20 Nov |
| G04-F deployment gate / enforcement assessment | **COMPLETE as logic**; provider evidence **BLOCKED** | `assessEnforcement` tests: BLOCK is not "enforced" without provider evidence; wrong commit, stale, outage, mismatch handled |
| G04-G scheduled scans | **COMPLETE (durable, bounded)** | Atomic slot claim, authorization re-check, auto-disable, 60-min floor, restart-safe; PostgreSQL tests. No schedule fired a real scan |
| G04-H G03 boundary | **COMPLETE (isolated)** | `remediation.g03 = NOT_CONNECTED` in API and UI; G04 runs without G03 |
| G04-I UI | **COMPLETE for fixture-auth browser acceptance**; real-login browser acceptance **NOT_RUN** | 13/13 Playwright tests (production build, fixture GitHub login, real G04 PostgreSQL), axe, 400 px, dark, isolation, Demo separation |
| Persistence / restart | **COMPLETE** | Row counts identical across a PostgreSQL container restart; dispatcher restarts resumed/reclaimed triggers |
| Authenticated, project-scoped APIs; RLS | **COMPLETE** | Cross-project 404 in browser; RLS tests including forged scope columns; no DELETE privilege |

## Test totals

| Layer | Command | Result |
| --- | --- | --- |
| G04 offline | `npx vitest run tests/guard/g04` | 5 files, 64 tests pass (policy/evaluator 17, webhook 13, webhook route 5, checks + schedules 12, Vercel + enforcement 17) |
| G04 PostgreSQL (real) | `npm run test:guard:g04:postgres` | 3 files, **32/32** pass (store 11, pipeline 19, migration preservation 2) |
| G04 browser | `node tests/guard/g04/browser/run.mjs` | **13/13** pass (one earlier run timed out in one test on a slow page load and passed on rerun; an earlier fixture bug and leftover-row isolation issue were test-harness defects, fixed) |
| Full repository unit suite | `npx vitest run` | 2756 tests in 189 files: 2755 pass; 1 failure (`g01/acceptance-boundaries N07`) and, in an earlier run under load, 6 timeouts in 5 files — **every one passes when run alone**; Windows ACL/Docker-metadata latency under a loaded machine, not a G04 change |
| Typecheck / lint | `npx tsc --noEmit`, `npx eslint .` | 0 errors; lint: 2 pre-existing warnings in `worker/guard/installation/persistence-fixture.ts` |
| Production build | `next build --webpack` (inside the browser runner) | passes |
| Existing Guard live browser suite | `node scripts/guard-live-check.mjs browser` | 9/9 pass after one deliberate assertion change (six Live tabs → seven: the additive "CI/CD Gate" tab); the other eight tests were unchanged |

## Real-run evidence (isolated G04 environment)

Environment: Docker PostgreSQL 18 `wetscan-g04-local-pg` (127.0.0.1:55435, volume `wetscan-g04-local-pg-data`), separate from the G02 environment on 55434. The database is named `wetscan_dev_guardg02` only because the frozen G02 validators pin that name; it is a different server, volume, marker and set of passwords. G04 migration `0002_g04` (checksum `fbfdd7f1…4195`) applied by the migrator role; re-apply is a no-op.

1. **GitHub App state read with the App JWT (read-only):** permissions `contents: read`, `metadata: read`; events `[]`; `GET /app/hook/config` → 404 (no webhook). One installation (`181791848`, selected repositories).
2. **HTTP deliveries through the real route** (`POST /api/guard/webhooks/github`, self-signed): valid push → `202 enqueued`; same delivery id → `200 duplicate`; same id with different bytes → `409 delivery_conflict`; wrong secret → `401`; one appended byte → `401`; unprotected branch → `200 policy_does_not_match`; wrong installation id → `202 installation_mismatch` (audited, nothing queued).
3. **Real GitHub reads by the dispatcher:** App JWT → repository-scoped installation tokens → repository identity check, branch head, source snapshot. `checks: write` token request → refused; recorded as `checks_permission_missing`, scan still runs, check `published=false`, `last_error=permission_denied`, retried with backoff (31 attempts accumulated over the session, all refused — expected).
4. **Real scan, vulnerable commit `c1330c63ef9bbe7fc0dcf435c6653488f269b827`** (branch `g04/vulnerable`, created in the owner's private test repository `wilanta/wetscan-g02-acceptance`): scan `8fa5a7061a0e…` `completed_partial` — sast, secrets, iac, sbom completed, **sca `timed_out`**. Evaluation (policy revision 1): **BLOCK**, 6 blocking (high), 8 warning (medium), 15 low; coverage `missing: [sca]`; reasons `engine_missing`, `blocking_findings`; check row `completed / failure / BLOCK`, unpublished because GitHub refused the Checks write. This is the real chain webhook → trigger → G02 scanners → persisted findings → policy → check intent.
5. **Defects the real run exposed (all fixed, Fix #21):** (a) checks permission coupled to scan permission; (b) waiting on a running scan consumed retry attempts; (c) exhausted `pending` trigger never failed. A restart of the dispatcher mid-scan strands the G02 job (`leased`, `max_attempts 1`); the G04 trigger then fails closed at its 45-minute bound.
6. **Not obtained:** a real PASS/WARN verdict; a real verdict for the fixed commit `3c6a99ec42b8259ab659a24c2f0d94822b389872` (its scan stalled in the SCA engine; scans `955da2fd…` and `78e4af1d…` stayed `running` with no worker heartbeat). G02's own acceptance (19–20 Nov) ran SCA to completion on a quieter machine; the OSV step is documented as load-sensitive (2 GB / 45 s budget).

## Webhook 404 repair and real GitHub delivery (20 November 2026, later session)

* **Root cause of the 404:** the process listening on port 3000 was `next dev` from the main worktree on `master` (no G04 route); the Cloudflare quick tunnel forwarded to it. See Fix #22.
* **Now:** the G04 worktree serves port 3000 (`GUARD_G04_ENABLED=1`, G04 database). Probes against `http://127.0.0.1:3000` and the public tunnel give identical results: GET 405; unsigned 401; wrong signature 401; signed ping 200; `workflow_run` 400; form-encoded 415; malformed JSON with valid signature 400; duplicate delivery 200; same id with different bytes 409.
* **Real GitHub delivery (verified):** GitHub redelivered its own `ping` (App webhook deliveries API) through the tunnel; GitHub's log shows `OK 200` and `guard.g04_deliveries` holds the delivery (`ping`, outcome `ignored`). The two earlier GitHub pings are recorded as `404`.
* **Webhook secret:** the secret on the App was not readable anywhere, so with the owner's approval it was rotated (App API `PATCH /app/hook/config`, URL unchanged) and stored only in the git-ignored `.env.local` of the G04 worktree.
* **Still blocked (owner click):** the App definition now has Checks: write, Pull requests: read and events check_run/pull_request/push, but installation `181791848` still reports `contents: read, metadata: read` and `events: []`: the permission update has not been accepted. A real branch creation (`g04/webhook-probe` at the vulnerable commit) produced **no** push delivery for that reason. Real push / pull_request / check_run deliveries, real Check Runs and the scan-to-check pipeline therefore remain unverified. Accept the pending request under GitHub → Settings → Applications → Installed GitHub Apps → wetscan-local → Review request.

## Security-negative coverage (selected)

Signature: missing/malformed/sha1/wrong secret/one-byte change/rotation secret; secret unset ⇒ 503 (no unauthenticated fallback). Limits: 413 on declared and on lying Content-Length; 415; event allowlist 400. Replay: duplicate no-op, conflict 409. Authorization: installation mismatch, suspended installation, removed repository, unprotected branch, disabled policy, fork pull request (never fetched), Guard's own check events ignored. Policy: unknown fields, severity overlap, engines outside the profile, `onMissingCoverage: pass` rejected. Checks: `INCOMPLETE`/`BLOCK` never map to a passing conclusion; token without `checks: write` refused; late `in_progress` cannot downgrade `completed`. Vercel: other-project/other-repo deployment refused; 401/403/404/429/5xx/network mapped; missing token ⇒ nothing called. RLS: cross-project read/write, forged scope columns, app role cannot call `g04_work`, no DELETE, no credential-looking provider config. Enforcement: wrong commit, stale, outage, missing commit metadata, promoted-while-BLOCK mismatch.

## Reproduce

```
GUARD_LOCAL_ENV=g04 node --conditions=react-server --import tsx scripts/guard-g02-local-env.ts provision --port 55435
npm run guard:g04:migrate          # (set GUARD_LOCAL_ENV=g04)
npm run test:guard:g04:postgres
node tests/guard/g04/browser/run.mjs
# real scanner run: see docs/GUARD_G04_ARCHITECTURE.md "Operating it" and scripts/guard-g04-e2e.ts
```
