# Guard integration checkpoint ? 19 November 2026

Branch: feat/guard-g02-g06-integration. Base: d13de08aa54ed6dd317a37357a149969c781ef41.
The existing worktree directory retains its original name. This is the main prototype, not another application. The old local branch ref is preserved at the original base; neither old nor new integration branch existed remotely during pre-push inspection.

## Selective G01 synchronization

The shared base already supplies Auth/GitHub authorization, pinned snapshots, broker/executor, sandbox contracts, PostgreSQL/RLS and the prototype. Both worktrees and their uncommitted deltas were audited. The outstanding product-relevant G01 change was the supported Webpack/tracing boundary: next.config.ts was selectively synchronized, its regression adapted to the operational validation runner, and the already-equivalent Webpack package build retained.

The acceptance-only beforeClaim hook, launcher diagnostics, N01/N04 recovery, packets, SQL approvals, permits, evidence and private state were not copied/cherry-picked. All 399 G01 candidate file hashes matched the pre-operation manifest. G01 branch/HEAD/index were not changed.

G01 remains PARTIALLY_COMPLETE, 2/16 PASS. Full G01 checkpoint remains HOLD with the previously reported three regression failures and 390/391 artifact match. These were not repaired, suppressed or republished. N01 historical STOP and window-2 transaction UNKNOWN remain unresolved. No acceptance was replayed.

Shared container inspection compares memory with the validated immutable spec. Legacy G01 remains 256MiB; only qualified operational OSV permits 2048MiB. No historical authority is imported.

## Implemented and still blocked

- Selected GitHub authorization and pinned revision API; atomic scan/queue admission for normal guard.scan.repository jobs.
- Original-session in-memory broker, bounded scheduler, dedicated worker role, fencing/heartbeat, renewed authorization at boundaries, one attempt, timeout/cancellation and normal owned cleanup.
- Qualified real CLI adapters for Opengrep/OSV/Gitleaks/Trivy IaC; validated findings, provenance, inventory and coverage; PostgreSQL persistence/report/triage interfaces.
- Six canonical Live tabs consume scoped stored API data. Missing configuration remains blocked/incomplete, with no fixture or G01-database fallback.
- Existing Demo Mode and its inventory/findings/triage/remediation preview/policy/integrity/reports/history remain clearly separate. The legacy /local-demo URL redirects into the existing prototype. Demo-specific filenames are intentionally retained.
- Neutral full-prototype startup is npm run guard:dev. The sanitized mvp-check runner remains a test/demo harness.
- Real G03 AI/retest, G04 provider enforcement, G05 authorized staging DAST and G06 external delivery/GitLab/ZIP are incomplete. Mocks prove none of these integrations.

A real owner-repository scan has NOT_RUN. Prior real CLI installation checks used controlled synthetic files only. The 18 November qualification is expired and must be remeasured, never extended, before enabling Live execution. Operational resource limits remain separate from G01 acceptance windows.

Owner READ ONLY catalog evidence (18 November17:50:21 WIB, ROLLBACK confirmed) reports wetscan_dev_guardg02 absent and the restricted Guard login roles present. Provisioning needs separate approval. Actual target schema/RLS, app/worker authentication, legitimate process references and owner provider selection on this worktree are not proven by offline tests. Never copy credentials/Auth state from G01.

## Validation

Final validation used an isolated temporary Git-index export with an existing dependency junction. No .env/.local/Auth store/runtime approval SQL was copied; test environments disable dotenv and strip provider/DB configuration. No dependency version changed.

| Check | Result |
| --- | --- |
| Guard Live/foundation/prototype unit-integration | PASS 284/284;25 files |
| Platform/Auth/Canvas/Sentinel/demo contracts | PASS 516/516;34 files |
| Browser Live with isolated API/Auth fixtures | PASS 4/4 |
| Browser existing prototype/demo | PASS 5/5 |
| Typecheck / ESLint / production Webpack build | PASS |
| Production boundaries | PASS;six Live routes protected,API401,canonical demo Auth redirect |
| Build tracing | PASS;36 manifests,zero private env/state references |
| Diff whitespace and staged security review | PASS |

SQL/Docker/provider doubles and browser API fixtures are not live DB/scanner evidence.

Initial browser startup in the worktree was refused by another existing Next dev instance; it was preserved and QA moved to the isolated export. Startup diagnostics emit safe enum/code only. A cold fixture callback exceeded the old 5-second assertion; it now uses the same20-second checkpoint wait as Live tests, without changing Auth/assertions. All final browser tests passed. Typecheck initially raced regenerated Next dev types; it passed after browser shutdown. Do not run typecheck concurrently with Next dev type regeneration.

Staged review found no actual provider tokens, credential URLs, private paths, dumps or generated approval SQL. One private-key-header match is the literal synthetic-only redaction test. .local/env/test output remain ignored; installation binaries/advisory DB/measured config/proposed provisioning SQL remain unpublished.

## Publication manifest

100 paths relative to base. No new G01 acceptance/recovery/evidence file.

```text
.gitignore
AGENTS.md
docs/GUARD_G02_LIVE_OPERATOR.md
docs/GUARD_INTEGRATION_CHECKPOINT.md
docs/GUARD_MVP_THREE_DAY_PLAN.md
docs/INTEGRATION_BACKLOG.md
docs/MVP_VALIDATION.md
docs/specs/guard/G02.md
docs/specs/guard/G03.md
docs/specs/guard/G04.md
docs/specs/guard/G05.md
docs/specs/guard/G06.md
docs/specs/guard/SOURCES.json
migrations/guard/g02-target.READONLY.sql
next.config.ts
package.json
scripts/guard-g02-db-plan.ts
scripts/guard-live-check.mjs
scripts/mvp-check.mjs
scripts/mvp-production-smoke.mjs
src/app/api/guard/projects/[projectId]/preflight/route.ts
src/app/api/guard/projects/[projectId]/revision/route.ts
src/app/api/guard/projects/[projectId]/scans/[jobId]/[resource]/route.ts
src/app/app/[...path]/page.tsx
src/app/app/projects/[projectId]/guard/[[...section]]/page.tsx
src/app/local-demo/guard/[[...section]]/page.tsx
src/components/app-shell.tsx
src/components/demo-provider.tsx
src/components/views/guard.tsx
src/features/guard/contracts.ts
src/features/guard/demo-session.ts
src/features/guard/evidence.ts
src/features/guard/live/database-config.ts
src/features/guard/live/http.ts
src/features/guard/live/live-workspace.tsx
src/features/guard/live/persistence.ts
src/features/guard/live/product-admission.ts
src/features/guard/live/product-artifacts.ts
src/features/guard/live/product-composition.ts
src/features/guard/live/product-deployment.ts
src/features/guard/live/product-host.ts
src/features/guard/live/product-policy.ts
src/features/guard/live/product-preflight.ts
src/features/guard/live/product-view.ts
src/features/guard/live/queue.ts
src/features/guard/live/repository.ts
src/features/guard/live/runtime.ts
src/features/guard/live/service.ts
src/features/guard/live/snapshot.ts
src/features/guard/local-artifact-tools.tsx
src/features/guard/local-artifacts.ts
src/features/guard/local-demo-access.ts
src/features/guard/local-fixtures.ts
src/features/guard/local-workspace.tsx
src/features/guard/release.ts
src/features/guard/workbench.tsx
tests/guard/core.test.ts
tests/guard/g01/http.test.ts
tests/guard/g01/repository.test.ts
tests/guard/g01/snapshot.test.ts
tests/guard/live/artifacts.test.ts
tests/guard/live/browser.config.ts
tests/guard/live/build-boundary.test.ts
tests/guard/live/db-plan.test.ts
tests/guard/live/deployment.test.ts
tests/guard/live/host-wiring.test.ts
tests/guard/live/installation.test.ts
tests/guard/live/live-ui.spec.ts
tests/guard/live/measured.test.ts
tests/guard/live/operational-fixture.ts
tests/guard/live/preflight.test.ts
tests/guard/live/product.test.ts
tests/guard/live/resume.test.ts
tests/guard/live/runtime-routing.test.ts
tests/guard/live/scheduler.test.ts
tests/guard/live/session-broker.test.ts
tests/guard/live/worker.test.ts
tests/guard/scanner-adapter.test.ts
tests/mvp/local-guard.spec.ts
tests/mvp/local-guard.test.ts
tests/mvp/playwright.config.ts
tests/mvp/prototype-integration.test.ts
tests/mvp/run-integrated-e2e.mjs
worker/guard/acceptance/inspection.ts
worker/guard/installation/.gitattributes
worker/guard/installation/Dockerfile
worker/guard/installation/README.md
worker/guard/installation/SOURCES.json
worker/guard/installation/commands.ts
worker/guard/installation/control.py
worker/guard/installation/entry.py
worker/guard/installation/measured.ts
worker/guard/installation/qualify.ts
worker/guard/orchestrator.ts
worker/guard/product-broker.ts
worker/guard/product-handler.ts
worker/guard/product-runtime.ts
worker/guard/product-scheduler.ts
worker/guard/sandbox.ts
worker/guard/scanner-adapter.ts
```

## Startup and next steps

Use the owner terminal legitimately configured for this prototype; coordinate an already occupied port3000 without killing an unknown process.

```powershell
Set-Location 'C:\laragon\www\wetscan-2\wetscan-guard-mvp-local-demo'
$env:GUARD_PRODUCT_ENABLED = '0'
npm run guard:dev
```

Use normal GitHub login and the selected real project's Guard route. Follow GUARD_G02_LIVE_OPERATOR.md for operational target/reference setup and READ ONLY preflight. Keep scanning disabled until target and operations are approved.

This publication authorization covers only the integration branch. No merge/master/staging/PR7/deployment/DB provisioning/N01 recovery/owner scanning is authorized.
