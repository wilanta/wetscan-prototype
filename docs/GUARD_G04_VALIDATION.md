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

## Real GitHub pipeline after the installation accepted the permissions (20 November 2026)

Installation `181791848` now reports `checks: write, contents: read, metadata: read, pull_requests: read` and events `check_run, pull_request, push`. Sandbox repository `wilanta/wetscan-g02-acceptance`, fresh scanner qualification, dispatcher running.

| Step | Real evidence |
| --- | --- |
| GitHub `push` (commit `0f8a929550143e91933989f97c322b858837a170` on `g04/webhook-probe`) | GitHub delivery log `push OK 202`; `guard.g04_deliveries` row; trigger `push` created |
| GitHub `pull_request opened` (sandbox PR #1, later closed) | delivery `OK 202`; trigger `pull_request` completed, reusing the same commit-bound scan (idempotent) |
| G02 scan | scan `96b2a5e400f2…` **`completed`**: sast, sca, secrets, iac, sbom all completed, source coverage complete |
| Policy | **BLOCK**: 6 high blocking, 13 medium, 15 low, 5 unknown-severity advisories (policy revision 1, commit-bound) |
| GitHub Check Run | id `136130925467`, `WetScan Guard / Security gate`, app `wetscan-local`, commit `0f8a9295`: `queued -> in_progress -> completed / failure`, summary + 4 annotations |
| Own check events | `check_run created/completed` deliveries answered `200` and ignored (no feedback loop) |
| `check_suite requested` | first answered 400 (not allow-listed) -> fixed, Fix #23 |
| Merge enforcement | **None observed, as designed:** PR #1 was `MERGEABLE / UNSTABLE` with the failing check; repository has 0 rulesets and `main` is unprotected |

Not yet real: a required-check rule blocking a merge (owner decision, no rule exists), a PASS/WARN verdict, the GitHub "Re-run" button path (the API token available here may not rerequest an App's check run; the signed `check_run.rerequested` handling is tested with synthetic deliveries), Vercel.

## Emergency completion run (20 November 2026, evening) - full five-engine verdicts, recovery, demo readiness

Everything below ran on the real sandbox `wilanta/wetscan-g02-acceptance` through real GitHub webhooks (production build of the app behind the Cloudflare tunnel, supervised dispatcher, real G02 scanners, isolated PostgreSQL on 55435). Default policy = critical+high block, medium warns, **all five engines required** (policy revision 8 is the restored default).

### Why the full-policy PASS was unreachable (measured)
| Measurement | Result |
| --- | --- |
| OSV standalone, sandbox-like container (`--cpus 1`, 2 GB, no network), clean lockfile, three runs on a quiet host | **27 s, 24 s, 33 s** (the scan itself reports 46 ms: the time is loading the 212 MB offline database) |
| SCA inside a real scan | **53 s** (limit was 45 s) |
| Host | 4-8 GB machine with 100-900 MB free RAM, Docker VM 3.9 GB |
| Consequence | with a 45 s budget SCA/SBOM timed out on most scans; with 60 s grants the engine after a slow one failed with `source_unavailable` |

### Verdicts (all five engines `completed`, source coverage complete)
| Case | Commit | Scan | Policy | Verdict | Check Run | GitHub merge state |
| --- | --- | --- | --- | --- | --- | --- |
| **PASS** | `34b084ee1bf59d97f2c06046bd71a661125c8bdd` (`g04/gate-clean`, clean Dockerfile as IaC target, one benign pinned dependency) | `0385045b13a1` (GitHub "Re-run"), `b12239751f10` (re-run after the chaos test) | default, revision 6 and 8 | **PASS**, 0 findings | id `136195282760` **success** | PR #3 `mergeable_state: clean` / `CLEAN` |
| **BLOCK** | `8259661da59599df0fadac4961333562c1d808ff` and (rehearsal) `694c6be81ea4f9508031fca44f4e3f70225edea3` (`g04/gate-vuln`) | `5ceb34b774a8` | default | **BLOCK** (6 blocking, 34 active) | failure (rehearsal id `136217555981`) | PR #2 `BLOCKED`; merge API **HTTP 405 "Required status check "WetScan Guard / Security gate" is failing"**; while the check was still `in_progress`: 405 "is in progress"; `merged: false` |
| **WARN** | `c904fb214796ae05ca6fc0b76825426dd9deb66e` (`g04/gate-warn`) | `e6d464f588b6` | revision 7: block=critical, warn=high+medium, unknown severity warns; all five engines required | **WARN** (0 blocking, 14 warnings) | id `136203152010` **neutral** | PR #4 `CLEAN` |

The full-policy PASS needs a repository where every engine has a target: a lockfile for SCA/SBOM and an IaC file Trivy fully reports (a single clean Dockerfile; earlier trees with several IaC files were reported "partial" by Trivy and stay INCOMPLETE, which is G02's honest coverage rule). Nothing was relaxed for these runs. No pull request was merged.

### GitHub check re-request (real)
App-token `POST .../check-runs/{id}/rerequest` -> 201 -> `check_run.rerequested` delivery -> **202** -> `check_rerun` trigger -> scan -> the SAME check run id updated in place to its final conclusion (`success`). Self-originated check events stay ignored. Several re-run requests for one commit while one is open are coalesced into one trigger (PostgreSQL test); GitHub redeliveries of the same delivery id are deduplicated; a different payload under the same id is a 409.

### Dispatcher recovery (chaos test, real)
09:36:34Z dispatcher killed while SCA was running (container left running). Restart: lock repair correctly refused ("deadline not reached"). 09:46:34Z (old 10 min lease) the trigger was reclaimed, the stranded scan `1de8338145c2` was **cancelled by G02's own cancel with its completed SAST run kept**, one replacement scan started; the lock was still held, the replacement failed instantly (`execution_not_ready`), the dispatcher reported the host unhealthy, **released the expired lock through G02's registry (removing the exited, owned container)** and exited 75; the supervisor restarted it; a fresh GitHub re-run completed with PASS at 09:54:48Z. Lease reduced to 3 min and the lock repair now also runs every minute so the replacement scan no longer meets the wedge.

### Tests (final run, quiet machine)
| Suite | Result |
| --- | --- |
| Full unit suite (`npx vitest run`) | **2768/2768** in 190 files. On a loaded machine (dispatcher, app, Docker running) 1-6 timing-sensitive tests (Windows ACL/Docker latency) fail and pass in isolation: run the release suite on a quiet host |
| G04 offline | 75 |
| PostgreSQL (`npm run test:guard:g04:postgres`) | **44/44** (store 11, pipeline 29, recovery 5, migration 2 ... see files) |
| G04 browser | **13/13** (production build) |
| Existing Guard Live browser | **9/9** (one run had a single timing flake in "database unavailable ..." which passed on rerun) |
| `tsc --noEmit`, `eslint .` | 0 errors (2 pre-existing warnings), build passes |

### Not verified
Vercel: **EXTERNALLY BLOCKED** (no token, project or CLI on this machine; nothing was changed in any Vercel project). Real-login browser acceptance of the CI/CD tab (an agent cannot complete a GitHub OAuth login).

## Merge-gate acceptance on a real GitHub ruleset (20 November 2026)

Sandbox `wilanta/wetscan-g02-acceptance` only. Ruleset id `27707416` "g04-gate-test-target (G04 acceptance)": `enforcement: active`, `ref_name.include = [refs/heads/g04/gate-test-target]`, one rule `required_status_checks` with context `WetScan Guard / Security gate` and `integration_id` 5753484 (the `wetscan-local` App). `main` has no rules (`GET rules/branches/main` returns 0); no plan restriction blocked ruleset creation. No PR was merged.

| Case | Head | Guard verdict | GitHub Check Run | GitHub merge state (evidence) |
| --- | --- | --- | --- | --- |
| **Vulnerable (PR #2)** | `g04/gate-vuln` `0b8aea79` (tree identical to the known vulnerable commit `c1330c63`) | **BLOCK** (6 high; SBOM timed out, BLOCK outranks) | `failure` | `mergeStateStatus: BLOCKED`, `mergeable_state: blocked`. `PUT /pulls/2/merge` returned **HTTP 405 "Repository rule violations found. Required status check "WetScan Guard / Security gate" is failing."**; `merged: false`. Re-confirmed at the end of the session |
| **Clean (PR #3)** | `g04/gate-clean` `a2bfa77d` | **PASS** (required engines `sast`, `secrets`; 0 findings; source coverage complete; policy revision 3) | id `136165171756`, `success`, `PASS: 0 blocking, 0 warning` | `mergeStateStatus: CLEAN`, `mergeable: true`, `mergeable_state: clean` (not merged) |
| **WARN (PR #4)** | `g04/gate-warn` `e968043e` (vulnerable tree) | **WARN** (policy revision 5: block=critical, warn=high+medium; 14 warnings, 0 blocking) | id `136171615495`, `neutral`, `WARN: 0 blocking, 14 warning` | `mergeStateStatus: CLEAN`, `mergeable_state: clean` (not merged). The same check run was updated in place from `action_required` (revision 4: unknown severity is INCOMPLETE) to `neutral` (revision 5) |

Limits of the PASS/WARN evidence, stated plainly:

* The scanner host was memory-starved (100-800 MB free RAM): OSV (SCA and SBOM) timed out on every clean-candidate scan although the same engines passed qualification minutes earlier. PASS therefore uses a **documented reduced policy** (`requiredEngines: [sast, secrets]`). The very same commit under the full required set was **INCOMPLETE** (policy revision 2: `sca` and `sbom` missing, `iac` not applicable). A PASS under the full five-engine policy was NOT obtained.
* IaC was `not_applicable` on the clean tree. A policy option `onNotApplicable: incomplete (default) | satisfy` was added; `satisfy` still requires at least one engine to have genuinely completed.
* PR #3's check later flipped to `action_required` (INCOMPLETE) because a GitHub-requested re-run of that check could not scan (below). The PASS and `CLEAN` observations above were made before that flip.
* PASS/WARN merge permission is GitHub's reported merge state; nothing was merged, as instructed.
* The default policy was restored afterwards (revision 6).

### Check re-request (real GitHub)
`POST /repos/.../check-runs/{id}/rerequest` with the App's own installation token (checks: write) returned **HTTP 201**; GitHub delivered `check_run rerequested` through the tunnel (**202**); a `check_rerun` trigger and a fresh commit-bound scan followed. (The earlier 404 came from the personal CLI token, which cannot rerequest an App's check run.) The re-run scans then hit G02's cleanup quarantine, so the final verdict of that re-run was INCOMPLETE: request, delivery, trigger and scan start are verified, a successful re-run verdict is not.

### Stranded scans and dispatcher restart (Fix #24)
Observed: `ddb0daf0` (dispatcher killed mid-scan), `955da2fd` and `78e4af1d` (session hung after an engine), `876b630f` (job `failed`, scan still `running`, never-started container left in `Created`). G04 now recovers such scans through G02's own cancel without deleting evidence (tested on real PostgreSQL) and starts one replacement scan. Not solved, by design: after `cleanup_failed` G02 quarantines its scheduler in-process and the private runtime root keeps an unresolved owned-resource record, so later sessions answer `execution_not_ready` until the dispatcher is restarted AND a fresh private root is measured (done twice here; removing the never-started container alone was not enough). Three of the four historical stranded scans were left untouched; `876b630f` was cancelled with its data intact.

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
