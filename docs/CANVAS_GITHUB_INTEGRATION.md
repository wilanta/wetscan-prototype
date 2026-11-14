# Local GitHub Canvas integration

Integration branch: `integration/canvas-github-live`. Integrated locally from `origin/master@1ed8457` and `origin/feat/canvas-full-module@0696879` with merge commit `0eeaf0f`. Both fetched on 14 November 2026. The existing checkout was clean; the existing sibling Canvas worktree was left untouched. No push, master merge, database or Vercel deployment is part of this work.

## Source reading and authorization

The existing OAuth, encrypted auth store, onboarding repository selection, profile projection and proxy remain authoritative. The only change to `src/lib/auth/github.ts` exports its existing App JWT helper for the server reader; OAuth is not replaced. Dashboard links consume the existing `DashboardAccountProvider` repository list. Client profile data never authorizes source access.

`/app/projects/github-<numeric-repository-id>/canvas` resolves the cookie, unexpired session and completed profile on the server. The reader checks the user/workspace scope and saved selection, revalidates the actual GitHub user, installation membership, App ownership, suspension and Contents/Metadata permissions. It checks repository access using the user token and a newly issued installation token restricted to that repository ID with Contents/Metadata read permissions. The profile is user-owned in the existing auth design; shared workspace membership is not implemented here.

The current GitHub default branch is resolved to an exact commit and tree SHA. Optional `?revision=<40-character-sha>` must equal that current HEAD; historical commits and arbitrary branches are not supported in this phase. Blob content is read only by SHAs from that tree and checked against the Git blob hash and declared size. Path exclusions reuse the existing discovery safety policy. Symlinks/submodules, credentials, environment values, binary/invalid UTF-8 and unsafe paths are excluded. No source is cloned, built, executed or sent to an LLM.

Retrieval uses a fixed GitHub API origin, no redirects, no fetch cache, streamed byte limits, 4 concurrent blobs, at most 200 allowlisted files, 256,000 bytes/file, 8,000,000 bytes total, depth 16, a 12 MB tree response limit and a 45-second source deadline. Individual source requests time out after 15 seconds. Existing auth helpers retain their existing 20-second limits. User installation enumeration stops after 20 pages. At most 4 snapshot jobs and one per session run at once; authorization mutations use the existing auth queue. This is local single-process coordination, not distributed rate limiting.

Tree truncation, omitted files, binary data and partial blob API limits produce explicit diagnostics. Oversized tree responses, malformed metadata and hash/revision mismatches fail safely. Local session/selection and provider grants are checked again before returning source output. The installation token is revoked on exit with a 5-second best-effort cleanup; failed cleanup does not retain a token locally, but GitHub's issued token can remain valid until its provider expiry. Browser output contains only a validated serializable graph. No tokens, source texts or server functions cross the RSC boundary. Error messages use controlled text. Denied repositories/installations render the existing 404 boundary; missing sessions redirect to login.

`SnapshotCanvasSource` calls the existing `analyzeSnapshot` engine. Reader diagnostics extend its coverage; the parser is reused unchanged. IDs include user/project identity and preserve semantic stability across commits; graph and evidence revisions identify the exact analyzed commit. A manifest dependency alone does not create a database/service relationship. Source observations, inferred relationships and manual context remain distinct; none prove runtime behavior.

## UI and persistence

Overview and Projects show the saved repository list with **Open Canvas**. Links disable prefetch to avoid background source reads. Real project pages receive `initialGraph`, use all existing lenses, hide demo source switching and expose a separate **Open Orderly Demo** navigation action. `/app/projects/orderly-demo/canvas` retains its demo selector and synthetic behavior.

Real Guard is **Not yet scanned**, Sentinel is **Monitoring not connected**, Trust is **Not tested**, and workflow plans are **Not executed**. Real projects receive no synthetic findings, incidents or verified test results. Guard, Sentinel, Intelligence and scanners were not implemented. Real edits are held in page memory and are lost on reload/navigation. Demo annotations retain their browser-only storage. No graph/source cache or database was added; there is no cross-session/device persistence promise.

## Local run and verification (PowerShell)

Use Node.js 22.20+ in the existing repository. Stop this checkout's Next server before `npm ci` on Windows, because its SWC binary can be locked. Leave other worktrees' servers alone.

```powershell
Copy-Item .env.example .env.local # only for a new setup; preserve an existing .env.local
# Edit .env.local with the existing GitHub App credentials and local auth values.
npm ci
npm run dev
```

Open `http://localhost:3000`, log in using the existing GitHub App, complete onboarding and select repositories. The App needs Metadata and Contents read access. Its OAuth callback remains `http://localhost:3000/api/auth/github/callback`; retain the existing installation Setup URL configuration. Open `/app`, then `/app/projects`, and **Open Canvas** for a selected repository. Inspect its pinned revision and source evidence. An unselected numeric ID must show 404; a request without a session must redirect to login. The demo remains separately accessible after login. For a production preview use `npm run build` followed by `npm start`; do not run dev/start on the same port together.

```powershell
npm run typecheck
npm run lint
npm test
npm run build
$env:CANVAS_TEST_PORT = '3216'
npm run test:e2e -- --config tests/canvas/playwright.config.ts
Remove-Item Env:CANVAS_TEST_PORT
node tests/auth/run-github-e2e.mjs
```

The Auth runner builds without developer dotenv, starts isolated servers on 3107/3108/3109 with generated test credentials and test-only provider preloads, runs Auth/Dashboard/Canvas integration scenarios, then cleans up its own temporary records. Its output is under `test-results/auth`, isolated from `test-results/canvas`. The Canvas UI host has no real authentication and is only a fixture; it must not be treated as actual provider proof. Its configurable port prevents accidentally reusing the sibling worktree's host.

Separately, with a current completed local login and the normal local server running:

```powershell
$env:WETSCAN_LIVE_BROWSER = '1'
npx vitest run --config tests/canvas/live.config.ts --reporter=verbose --disableConsoleIntercept
Remove-Item Env:WETSCAN_LIVE_BROWSER
```

This opt-in check uses real GitHub APIs, never provider fixtures. It reads an existing unexpired local auth record, requires a still-current user token, creates a short-lived verification session from that identity, checks up to two already selected repositories, and deletes only that verification session afterward. It never revives expired sessions, selects another repository or modifies the original profile/session. Browser mode uses local `APP_URL` and headless Edge to follow Projects → Open Canvas, inspect a component and check unavailable security coverage. Results and screenshot are local ignored artifacts under `test-results/github-live`; source and credentials are not written there. An absent eligible session is a failed/unavailable live check, never a simulated pass.

## Validation and review status

Final verification on 14 November 2026 (Asia/Jakarta):

| Check                                                     | Actual result                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci`                                                  | PASS; 531 packages installed, audit reports 0 vulnerabilities. First attempt hit a locked SWC binary; stopped only this checkout's confirmed server and retried successfully.                                                                                                    |
| `npm run typecheck`                                       | PASS                                                                                                                                                                                                                                                                             |
| `npm run lint`                                            | PASS                                                                                                                                                                                                                                                                             |
| `npm test`                                                | PASS: 178 tests in 10 files, including 22 authorized-reader integration cases. No skipped tests.                                                                                                                                                                                 |
| `npm run build` and isolated Auth runner production build | PASS; Next compilation, TypeScript, static generation and protected dispatcher retained.                                                                                                                                                                                         |
| Canvas Playwright on this checkout's own host, port 3216  | PASS: 7/7, including demo, source evidence, editor/inspector, Trust/Workflows, responsive and scoped axe checks. No skipped tests.                                                                                                                                               |
| `node tests/auth/run-github-e2e.mjs`                      | PASS: 19/19, including all existing Auth/Dashboard cases and the new selected GitHub source flow. No skipped tests. Providers in this suite are test-only fixtures.                                                                                                              |
| Opt-in actual GitHub API + local Edge browser check       | PASS: 1/1; repository ID `998736528`, commit `36f78ca8bc4b5c287d272775d116262786a704de`, 9 nodes, 6 edges and 53 evidence records. Followed Projects ? Open Canvas, rendered all 9 nodes, selected a component in the inspector and checked unavailable Guard/Sentinel coverage. |
| Local running production preview                          | `http://localhost:3000`, HTTP 200. No deployment.                                                                                                                                                                                                                                |

Actual-provider coverage remains partial: diagnostics `dependency_usage_required` and `github_excluded_paths` were present. This does not establish complete discovery, deployment, service connectivity, scanning or runtime security. `test-results/github-live/results.json`, `browser.json` and `canvas.png` are ignored local evidence. The live acceptance check used a short-lived verification session derived from an existing unexpired authenticated local record; it did not perform a fresh live OAuth consent. Fresh login/onboarding browser regressions used the isolated provider fixture.

Earlier failures were corrected: new browser locators assumed a numeric 404 and exact standalone coverage labels, failed to distinguish Next's route-announcement alert, and looked for a workflow runner before defining a model. Existing Canvas tests had a hardcoded 3214 network allowlist; it now checks the configured origin. Concurrent test runners originally removed each other's trace artifacts; outputs are now isolated. A first attempted Canvas run reused a pre-existing sibling host and is not counted as current-checkout evidence. The final 7/7 run started this checkout's host on 3216. Next's responsive development fixture still emitted React Flow NaN attribute warnings during resize; interactions and scoped axe checks passed. No unresolved test failures remain in the commands listed above.

**Review status: ready for code review, not a complete live acceptance sign-off for merging into master.** A second selected real repository requires a second saved authorized selection; only one was present locally. Two distinct architectures and independent IDs were verified with automated provider fixtures. Fixture isolation alone does not prove the second-live-repository case. GitLab, shared workspace roles, durable edits, webhooks, source viewing, scanner/telemetry results and Trust/Integrity execution remain future work. No claim of cloud deployment or runtime security is made.

## Integration file inventory

The normal merge first imported the Canvas feature module, its standalone test fixtures and its documentation (53 changed files in merge `0eeaf0f`). The following are the additional integration changes relative to that merge. Full imported paths can be reviewed with `git show --stat 0eeaf0f` or `git diff --name-status origin/master..HEAD`.

Created:

- `.env.example`
- `docs/CANVAS_GITHUB_INTEGRATION.md`
- `src/components/repository-projects.tsx`
- `src/features/canvas/components/source-error.tsx`
- `src/features/canvas/server/github-api.ts`
- `src/features/canvas/server/github-reader.ts`
- `src/features/canvas/server/project-canvas.tsx`
- `tests/auth/canvas-source-fixture.mjs`
- `tests/canvas/github-live.check.ts`
- `tests/canvas/github-reader.test.ts`
- `tests/canvas/live.config.ts`
- `tests/e2e/github-canvas.spec.ts`

Modified:

- `README.md`
- `docs/CANVAS_ARCHITECTURE.md`
- `docs/CANVAS_VALIDATION.md`
- `docs/INTEGRATION_BACKLOG.md`
- `src/app/app/[...path]/page.tsx`
- `src/components/app-shell.tsx`
- `src/components/views/overview.tsx`
- `src/components/views/projects.tsx`
- `src/features/canvas/adapters/snapshot-source.ts`
- `src/features/canvas/components/canvas-page.tsx`
- `src/features/canvas/contracts.ts`
- `src/lib/auth/github.ts`
- `tests/auth/github-existing-fixture.mjs`
- `tests/auth/run-github-e2e.mjs`
- `tests/canvas/canvas.spec.ts`
- `tests/canvas/playwright.config.ts`
