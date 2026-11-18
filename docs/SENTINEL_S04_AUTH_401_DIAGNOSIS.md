# S04 H04C-B2 HTTP 401 investigation

Investigation: 15-16 November 2026 (Asia/Jakarta). Status remains **IMPLEMENTED_PENDING_ACCEPTANCE**.

## Repository and authorization boundary

- Actual branch: `feat/sentinel-s04-incidents`; HEAD `f7bfeef29488c3f997e9444555039514f55fa0a3`, zero commits ahead of local `master`.
- Initial working tree: 18 modified tracked files and 35 individual untracked files, zero staged files. The older 50-file handoff inventory is historical. Existing S04 work was retained.
- Work performed: source/artifact inspection, read-only local authentication-record diagnostics, synthetic loopback HTTP tests, offline prerequisite checks, and a PowerShell client fix. No DEV/TEST PostgreSQL connections, live GitHub requests, production Next.js startup, database approvals, ingestion, workers, migrations, or rule mutations were performed. No Git publication occurred.

## Failed-execution safety evidence

The second failed execution directory, `C:\Users\sheil\.wetscan-sentinel\s04-h04c-b2-contain-retry-14ad56d619ca4c9d859ba5e734dfb715`, contains only its approval and two Next.js logs. Sanitized inspection confirmed:

- Approval status `CLOSED`, `actions: []`, closure timestamp present, phase `contain-rule`, and the expected migration plan hash.
- No `containment.json` or postcheck artifact. There is no observed successful POST from this attempt. The original wrapper throws on GET 401 before invoking the mutating acceptance CLI.
- No port-3000 listener or matching Next.js/Sentinel-worker/acceptance process was found during inspection.
- The recovery snapshot's embedded hash matches `198c67e08647f12fbde99c72d01bb50b2f8d2cb4238bd88d854f89f6d550af2e`. Its prior-attempt jobs remain recorded as completed/1 attempt and failed/5 attempts; the existing incident ID is present.
- Before/after SHA-256 comparison verified all 24 inspected private files unchanged, including auth records, cookie captures, the original runner, recovery artifacts, and failed-execution artifacts.

These are local artifact observations. The current database rule revision and database preservation state were **not re-queried**. The intended `ENABLED r2 -> DISABLED r3` transition remains unverified.

## Root cause and authentication trace

**Windows PowerShell 5.1 silently omits the supplied Cookie when using the wrapper's `Invoke-RestMethod -Headers @{ Cookie = $cookieRaw }` construction.** A synthetic loopback server observed no Cookie header. The regression fixture, using the actual Next.js cookie parser and encrypted authentication store, reproduces HTTP 401 with that construction and HTTP 200 with `-WebSession` / `CookieContainer` using the same session.

The source path explains the failure before any database access:

1. [`detection-http.ts`](../src/features/sentinel/server/detection-http.ts) obtains `requestToken(request)` and calls `canvasIdentity(token)` before project authorization or `telemetryStore()`.
2. [`session.ts`](../src/lib/auth/session.ts) reads `wetscan_session` from `NextRequest.cookies`, requires 64 lowercase hexadecimal characters, hashes the token into its encrypted session-record key, and checks expiry. Missing cookies immediately return no session.
3. [`github-reader.ts`](../src/features/canvas/server/github-reader.ts) returns `AuthError("unauthenticated", 401)` when the session/profile is missing or their GitHub identities differ. Incomplete onboarding is 403; Sentinel masks project/onboarding access denials as 404 through [`telemetry-http.ts`](../src/features/sentinel/server/telemetry-http.ts).
4. Valid local identity then reaches [`project-context.ts`](../src/features/sentinel/server/project-context.ts) and `authorizeCanvasProject`, which verify selected repository, current GitHub user access, and app installation before database access. GitHub user-token absence/expiry can independently return 401; app credential failures return 503. These live checks were not called in this investigation.
5. [`config.ts`](../src/lib/auth/config.ts) requires `APP_URL`, a secret of at least 32 bytes, and an absolute auth directory outside the checkout. [`store.ts`](../src/lib/auth/store.ts) encrypts records with AES-256-GCM keyed from `AUTH_SECRET`; missing files resolve to no record, while a wrong encryption key or corruption throws and produces a sanitized 503 on the Sentinel route.
6. Sessions are durable files, not process memory. A restart with the same effective directory/key retains them. The OAuth callback rotates the cookie/session; a previously rotated token can become invalid. [`github.ts`](../src/lib/auth/github.ts) refreshes an expired user access token when a refresh token exists, and repository authorization persists the updated session. Restart alone is not evidence that another login is required.

Read-only private diagnostics used the installed Next environment loader in production mode. Only `.env.local` loaded; the current diagnostic process had no inherited `APP_URL`, `AUTH_SECRET`, `AUTH_DATA_DIR`, or `NODE_ENV` overrides. The original runner starts `next start` from the repository root, sets `APP_URL` explicitly, and otherwise inherits auth configuration; the historical child environment cannot be reconstructed from its startup logs alone.

Both the previous cookie capture and the current cookie map to existing records that decrypt with the currently loaded secret, remain unexpired, and contain GitHub identity/user tokens. The current profile decrypts, matches the session identity, has completed onboarding, and includes the expected repository/workspace. Diagnostics performed raw read/decrypt operations only; they did not call `getSession` against private records because that function can delete expired records. No credentials, token hashes, raw sessions, or user profiles were printed.

The current GitHub access token is expired and a refresh token exists. Its ability to refresh, and current provider/repository authorization, remain **NOT RUN**. The cookie transport defect is proven independently; live endpoint success is not yet established.

## Smallest fix and reviewable runner

- Added [`scripts/sentinel-session-get.ps1`](../scripts/sentinel-session-get.ps1): a GET-only local HTTP helper that constructs `WebRequestSession.Cookies`, validates exactly one lowercase session cookie, and refuses redirects.
- Added [`tests/sentinel/session-powershell.test.ts`](../tests/sentinel/session-powershell.test.ts): eight Windows PowerShell 5.1 transport regressions with temporary synthetic encrypted sessions. Tests exercise the actual cookie parser and `canvasIdentity`; no provider or PostgreSQL calls occur. Other operating systems skip this Windows-specific suite.
- Preserved `C:\Users\sheil\.wetscan-sentinel\Invoke-H04CB2ContainRule.ps1` byte-for-byte. Prepared a separate `Invoke-H04CB2ContainRule.AuthFixed.ps1` in the same directory, changing only the GET call to the repository helper and adding `-WindowStyle Hidden` to temporary server startup. All existing phase gates, rule pins, approval closure, historical-job protections, and owned-process cleanup remain in place.
- Corrected runner SHA-256: `3e4b2f7d4223ab079fdb4eb1e4d268b2563cf6db2217d62961f78651dd7903aa`. It has zero PowerShell parser errors. Its live path was not executed.

## Offline validation

| Check | Observed result |
| --- | --- |
| Focused PowerShell transport regression | 8/8 PASS |
| `npm.cmd run typecheck` | PASS |
| `npm.cmd run lint` | PASS |
| `npm.cmd test -- --maxWorkers=4` | 769/769 PASS, 55 files |
| `node --import tsx scripts/sentinel-dev-acceptance.ts plan` | PASS, `databaseConnections: 0`, unchanged plan hash `3438a56e778b30afdd6acf03600638fe31e26c55c2ae5bf63d224f909c429ae7` |
| Corrected wrapper without `-ExecuteLive`, fresh empty output directory | `READY_FOR_AUTHORIZATION`, `executionPerformed: false`, zero database connections, zero output files |

The first full run with default worker parallelism while lint/typecheck were running reported four timeouts: two PowerShell tests, an existing acceptance CLI test, and an existing Guard snapshot test. The bounded full rerun passed all tests. The transport suite now allows 15 seconds per test around a subprocess bounded to 10 seconds. Existing unrelated test limits and global test configuration were left intact.

The offline wrapper correctly refused reuse of the failed execution directory because approval/log files already exist. A fresh empty directory, `C:\Users\sheil\.wetscan-sentinel\s04-h04c-b2-authfix-offline-ca36a87c6ab34d94869da105e8e912a4`, was used for its successful offline prerequisite check. No approval or execution artifacts were written there.

No new application build or live browser acceptance was needed for the client-only fix; both remain **NOT RUN** in this investigation.

## Next owner authorization

Require separate authorization before running the corrected private wrapper with `-ExecuteLive`, a fresh output directory, and its exact rule pin. That scope includes temporary Next.js startup, authenticated GitHub/project checks (which may refresh and persist OAuth tokens), the bounded `runtime` approval for `contain-rule`, only rule `7ad1deb8-e555-44ec-be98-b7def574781d` from `ENABLED` revision 2 to `DISABLED` revision 3, read-only preservation postchecks, approval closure, and owned-server teardown. It excludes ingestion, workers, other acceptance phases, migrations, and changes to protected or previous-attempt jobs. Further acceptance phases require their own authorization.

S04 cannot be marked accepted until all remaining DEV phases pass.

## Owner-authorized contain-rule execution (16 November 2026)

**PASS: exactly one live attempt**, using the unchanged reviewed `Invoke-H04CB2ContainRule.AuthFixed.ps1`. The owner separately authorized this phase after the offline investigation above.

- Both previous containment approvals were CLOSED with zero actions. Offline prerequisites, plan/target pins, private session checks, the H04C-A backup checksum, and the H04C-B2 canonical recovery checksum passed before execution. The fresh output directory has a protected ACL granting the current user and SYSTEM access.
- The CookieContainer GET succeeded with HTTP 200 and passed exact owner/workspace/project/rule, `ENABLED`, revision 2, and version 2 checks. The CLI then issued its single disable POST with pinned `expectedRevision=2`, required HTTP 200, and verified `DISABLED`, revision 3. No POST retry or revision substitution occurred.
- Comprehensive read-only postcheck: all 91 original rows, 8 protected queued jobs, 6 historical non-queued jobs, both previous acceptance jobs, 8 historical worker heartbeats, and Incident #1 with all existing S04 evidence were preserved. All 22 non-containment tables had exact zero row-hash-multiset deltas against the recovery snapshot. Authorized deltas only: one rule updated, one rule version added, one audit record added.
- All 3 sources remain disabled with zero active credentials; all 3 rules are disabled. Active leases, expired leases, unexpected database sessions, and orphaned timeline evidence are all zero. No new jobs were admitted.
- The runner stopped only its temporary Next.js tree. Independent local inspection found no port-3000 listener or matching Next.js/worker/acceptance processes. The new approval ended CLOSED with `actions: []`; all 3 containment approvals are closed. All 19 snapshotted historical artifact/runner/helper files remain byte-identical, including both previous failed-attempt directories and all H04C-A files.
- Private output directory: `C:\Users\sheil\.wetscan-sentinel\s04-h04c-b2-contain-codex-f1862fad0fd1475d86cd39b2badba1cb`. Sanitized evidence: `execution-summary.sanitized.json`, `containment.json`, `contain-rule-postcheck.json`, and `dev-contain-rule-approval.json`. Raw runner/server logs stay private; server stderr is empty.

There is no remaining blocker for this phase. No subsequent acceptance phase, migration, worker, ingestion, Git publication, or deployment was executed. S04 remains **IMPLEMENTED_PENDING_ACCEPTANCE**. Stop after this phase; later phases require separate authorization.
