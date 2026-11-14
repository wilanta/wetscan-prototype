# S00 validation and handoff

14 November 2026 (Asia/Jakarta). Baseline `master@3f05e3cb70aaa7c21246dd6ae902635e57f463fb` matched remote before changes. Branch `feat/sentinel-s00-contract-alignment`; all 14 changes are additive Sentinel files. S01 NOT STARTED; **H10 APPROVED**. Owner approval and owner-reported confirmation of Daud's approval, both dated 14 November 2026 (Asia/Jakarta) with no amendments, are recorded in both required H10 documents. Source for Daud: **Owner-reported confirmation of Daud's approval.** No direct message from Daud was independently verified.

The results below were rerun after recording H10 and committing S00 as `4f1eb658e445d656b8fb33bece10872cb866d177`, on 14 November 2026 (Asia/Jakarta). `git fetch origin master` confirmed `origin/master` remained `3f05e3cb70aaa7c21246dd6ae902635e57f463fb`, an ancestor of this feature branch; no rebase or merge was needed. All required local checks passed. A subsequent documentation-only commit records this evidence; source/tests, package manifest and lockfile remain identical to the validated implementation commit. H10 acceptance does not authorize S01 or PostgreSQL migration creation/application.

## Results

| Check                                          | Result / limits                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm.cmd run typecheck`                        | PASS                                                                                                                                                                                                                                                                                                                   |
| `npm.cmd run lint`                             | PASS                                                                                                                                                                                                                                                                                                                   |
| `npm.cmd test`                                 | PASS: 316 tests / 17 files, no skips/failures; includes 53 S00 contract tests and existing Guard/Canvas/auth/demo tests. Provider behavior is fixture/double based.                                                                                                                                                    |
| `npm.cmd run build`                            | PASS: Next 16.4.6 production build; dotenv loading disabled using existing preload. No new route in build output. Build is not a running production-service acceptance test.                                                                                                                                           |
| Existing browser regression                    | PASS: 6/6 scenarios in Microsoft Edge, final direct rerun 1.8 min and `PLAYWRIGHT_EXIT_CODE=0`, existing Canvas isolated UI host on `127.0.0.1:3218`; unchanged walkthrough/interaction specs. Fixture server disposed by Playwright.                                                                                  |
| Browser coverage                               | Primary Canvas/Guard -> Sentinel incident -> separate verification -> archive/draft/approval -> Ghost -> notifications -> reset; pending/failure never claim neutralization; existing onboarding error behavior, all declared demo screens, staging form validation, keyboard/modal/navigation, mobile and dark theme. |
| Accessibility / responsive fixture checks      | PASS: tested axe WCAG 2A/AA/2.1AA scopes had zero violations; no tested viewport overflow at 1440/1280/390. Interaction report has no browser page errors. Screenshots/reports in ignored `test-results/canvas-regression/`; these are synthetic UI evidence, not live monitoring.                                     |
| Formatting / whitespace                        | PASS: Prettier checks for all new source/tests/docs and Git diff whitespace checks. LF/CRLF conversion notices are repository configuration, not whitespace defects.                                                                                                                                                   |
| Ownership verification                         | PASS: no changes to Guard, worker/guard, Canvas, auth, demo provider/reducer/data, original UI/router/app-shell, package manifest or lockfile. Existing `docs/INTEGRATION_BACKLOG.md` is unchanged.                                                                                                                    |
| DB/worker/real-provider/production integration | NOT RUN / not implemented in S00. No migration, DB connection, source telemetry, worker durability, real scan/inventory/event/overlay delivery, provider notification, advisory sync, response enforcement or deployment acceptance claimed.                                                                           |

During original S00 validation, browser launch initially failed because a relative `NODE_OPTIONS` dotenv preload could not resolve from Next's CSS subprocess directory. The first retry encountered that owned test server's lock. Stopped only that run's known server process, used the absolute preload path and unused port 3218, and all six scenarios passed. In the post-H10 rerun, all six scenarios passed, but PowerShell's `Tee-Object` logging wrapper returned a nonzero status after warning output; rerunning directly with explicit propagation of Playwright's exit code confirmed six passes and exit 0. No application code was changed for these command-launch/logging issues. Existing React Flow attribution / smooth-scroll and Node color-env warnings remain; they did not fail tests and are outside this contract-only packet.

Ignored local logs for the post-H10 checks are in `test-results/sentinel-handoff/` (`typecheck.log`, `lint.log`, `unit-tests.log`, `production-build.log`, and the first browser-run log). The final direct browser run's explicit exit 0 was observed in the tool output. Generated accessibility/interaction reports confirm zero tested axe violations and zero browser page errors. These files are local fixture evidence and are not committed as live integration proof.

## Reproduce in PowerShell

Run from the repository root with existing installed dependencies. Commands do not read dotenv through Next when the preload is set. The absolute path matters because subprocesses change directories. Port 3218 must be free; the isolated UI host must not already be running. Do not run two browser hosts against the same fixture build directory simultaneously.

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npx.cmd vitest run tests/sentinel

$preload = (Resolve-Path -LiteralPath 'tests/auth/skip-dotenv.cjs').Path.Replace('\', '/')
$priorNodeOptions = $env:NODE_OPTIONS
$priorNextTelemetry = $env:NEXT_TELEMETRY_DISABLED
$priorCanvasPort = $env:CANVAS_TEST_PORT
try {
  $env:NODE_OPTIONS = '--require "' + $preload + '"'
  $env:NEXT_TELEMETRY_DISABLED = '1'
  npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw 'Production build failed' }
  $env:CANVAS_TEST_PORT = '3218'
  npx.cmd playwright test --config tests/sentinel/playwright.config.ts
  if ($LASTEXITCODE -ne 0) { throw 'Demo regression failed' }
} finally {
  $env:NODE_OPTIONS = $priorNodeOptions
  $env:NEXT_TELEMETRY_DISABLED = $priorNextTelemetry
  $env:CANVAS_TEST_PORT = $priorCanvasPort
}
```

No new Next application is created: the browser config reuses the pre-existing `tests/canvas/fixture` host and the original `tests/e2e/walkthrough.spec.ts` and `interaction.spec.ts`. The UI fixture has no production auth proxy; it uses `mockDemoAccount`. Production auth/Canvas authorization code is covered separately by the existing unit/provider-fixture tests, not by this UI host. Guard real scanner integration suite and external GitHub acceptance were intentionally not invoked.

## Exact changed-file manifest

All 14 files are new:

| File                                              | Purpose                                                                                                                                                         |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/features/sentinel/types.ts`                  | Scoped/versioned project/source/evidence/event/alert/incident/timeline/response/verification/notification DTOs; explicit provenance.                            |
| `src/features/sentinel/contracts.ts`              | Guard signature/inventory aliases and v1 provenance envelopes; Canvas companion DTO/method seam; query/response/verifier/channel/feed/AI ports.                 |
| `src/features/sentinel/scope.ts`                  | Scope equality, collision-safe namespace/delivery keys and explicit Orderly demo namespace.                                                                     |
| `src/features/sentinel/server/project-context.ts` | Server-only additive mapping through existing Canvas project authorization/workspace function; no caching or new grants.                                        |
| `src/features/sentinel/integrations.ts`           | Typed internal Guard/Canvas preflight checks; original unavailable Guard publishers and explicitly unavailable Canvas source with per-call reauthorization.     |
| `src/features/sentinel/platform-contracts.ts`     | Design-only reusable transaction, module-specific durable lease/job/outbox interfaces; no infrastructure implementation.                                        |
| `tests/sentinel/scope.test.ts`                    | Identity compatibility; workspace/project/mode/route denial, authority failure/revocation and dedupe namespace fixtures.                                        |
| `tests/sentinel/contracts.test.ts`                | Compile-time owner contract compatibility; audit/inventory separation, provenance/commit/grant denial, licensing, unavailable ports and Canvas mapping denials. |
| `tests/sentinel/playwright.config.ts`             | Reuses existing isolated legacy UI fixture/specs with Edge and separate result output.                                                                          |
| `docs/SENTINEL_ARCHITECTURE.md`                   | Audited evidence, ownership, route/action inventory, proposed PostgreSQL/worker/outbox design and integration semantics.                                        |
| `docs/SENTINEL_COMPATIBILITY.md`                  | H10 review sheet: identity/ref matrix, schema/worker boundaries, reserved names and approval text.                                                              |
| `docs/SENTINEL_INTEGRATION_BACKLOG.md`            | S00 status; S01-S11 dependencies, cross-owner handoffs and explicit future acceptance.                                                                          |
| `docs/SENTINEL_HUMAN_ACTIONS.md`                  | H01-H10 owners, prerequisites, future provider/config steps, proposed env names, expected evidence/status and unresolved decisions.                             |
| `docs/SENTINEL_VALIDATION.md`                     | This evidence/command/manifest/handoff report.                                                                                                                  |

## Required next decision

Both [H10 approval records](SENTINEL_HUMAN_ACTIONS.md#h10---identitystorageworker-contract-sign-off) are documented with dates and no amendments; Daud's confirmation is explicitly owner-reported, not directly verified. S00 commit, latest-master compatibility verification, validation and a PR targeting master are authorized; no automatic merge. **Do not create migration files or begin S01.** Verified S00 acceptance into master, a separate S01 branch and explicit H01 instance/database configuration and initial migration application approval remain necessary. No third-party registration is needed for H10.
