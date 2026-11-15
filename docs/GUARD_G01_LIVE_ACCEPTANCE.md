# G01 GitHub / PostgreSQL Live acceptance continuation

15 November 2026 (Asia/Jakarta). **PARTIALLY COMPLETE**. Candidate `feat/guard-g01-s03-integration`, base/current published input `7eb6bfefe15aefc5a362dc33bcf74aa9db8dad25`. Latest implementation SHA is the candidate Git HEAD after this reviewed local delta is committed; remote SHA is independently checked during publication. No merge/master/deployment/G02.

This record supersedes earlier implementation/status descriptions for this continuation. The owner explicitly confirms existing real GitHub account and Canvas repository integration works and requires reuse, not a second OAuth/onboarding/picker. We preserve it. Their separate PostgreSQL instruction authorizes configuration/approval inspection without any DB connection, migration or mutation. No exact active target/action approval was discovered in reviewed sources.

## What changed and why

- Guard now has an authenticated project page at `/app/projects/<existing Canvas projectId>/guard`. Uses `authorizeGuardProject -> authorizeCanvasProject` and the current selected repository/installation/session. Page receives only repository metadata. No second Auth, GitHub repository picker or credential manager, and no edits to Auth/Canvas/dashboard/Sentinel/shared platform/dependency/SQL files.
- User can enter a branch and optional full SHA. New same-origin POST `/api/guard/projects/<projectId>/repository` returns verified metadata and a **REVIEW_REQUIRED** preparation request. Unknown owner/installation/repository fields and malformed refs/SHAs are rejected. No DB pool, source snapshot or job is created by this verification/draft.
- Explicit branches are resolved by GitHub `/branches/<encoded name>`. Exact selected SHA is resolved in that repository; if different from branch head, `/compare/<SHA>...<head SHA>` must prove ahead/identical with exact base and merge-base SHA. An arbitrary known commit on another branch is insufficient. User-specified SHA is immutable; it may be an ancestor of the selected branch, rather than only current default-branch HEAD.
- Existing default-source callers keep their strict default-HEAD behavior. Approved producer and worker pass the selected branch/commit through the same Guard source adapter; current user/App/installation/repository access is rechecked before a repo-scoped `metadata:read, contents:read` token and before effects. Closed/expired provider leases cannot read again; close is idempotent. Shared fixed-origin bounded transport and existing token refresh/revocation helpers are reused. No token appears in the client, draft, job/IPC payload or logs.
- Draft contains server-derived actor/workspace/project/repository/commit/profile/engines/job binding, request idempotency key, repository name and **actual migration-plan hash**, with no target or authorization invented. Downloading a draft grants nothing. It lets operator review one concrete request. Retrying enqueue from the same verified draft reuses the idempotency key; changing/reverifying the revision creates a new reference and requires a matching approval.
- Same-origin POST `/preparation` composes existing producer/launcher. Enqueue requires an operator-owned `GUARD_PREPARATION_APPROVAL_FILE`, independent app DB approval and exact job/target/actions/expiry; launch requires a different `GUARD_WORKER_APPROVAL_FILE`, matching stored job and independent worker DB approval. JSON approval inputs are server-configured, regular bounded .json files; no client path or dotenv read. No approval means a safe503 before DB/worker effects.
- Worker acknowledgement/exit0 is insufficient: launch waits for the existing bounded child, revalidates current Auth, reloads persisted job and requires `foundation_prepared` audit plus coverage. Revocation or missing preparation evidence rejects success. Cancellation/timeout stops the owned child. G01 is prepare_only: persisted scan remains explicitly failed because G02 engines are unconfigured; UI never says a scanner completed.
- Next production build initially warned about bundling the separate raw worker entry. Launcher now resolves its trusted project entry through the server filesystem before fork; the final build has no such warning. Target runtime is Node with the full reviewed checkout/tsx, not an unreviewed standalone/serverless deployment.
- Source-only acceptance supports exact approved selected branch/commit and request cancellation; old commit-only approval remains compatible for default-HEAD requests. Branch-specific requests require matching branch approval. Validity/action uniqueness is tightened without changing SQL/hash. Existing token revocation helper is best-effort; `cleanup:verified` means temporary source removal, not proof that GitHub acknowledged token revocation. Actual token/revocation acceptance is still open.

## Actual evidence and limits

| Gate | Status / actual observation |
| --- | --- |
| Existing GitHub Auth/Canvas Live | User reports working account name and selected-repository source. Not reimplemented; this alone does not accept Guard. |
| Public WetScan reachability | PASS: `http://localhost:3000/` returned HTTP200 with no cookie/header/body captured. Authenticated session NOT_CHECKED, DB connection NOT_PERFORMED. No restart/stop or second writer against the real Auth store. |
| GitHub Guard Live metadata/snapshot/private access/revocation | BLOCKED/NOT RUN here: browser access host reported unavailable; real session was not extracted or impersonated. No actual selected account/repo/installation/SHA was hardcoded from history. Exact snapshot-read/temp-write/cleanup permission/record is still needed for the selected real revision. |
| PostgreSQL Live | BLOCKED/NOT RUN. Configuration-only findings are in [G01 PostgreSQL audit](GUARD_G01_POSTGRES_CONFIG_AUDIT.md). No current target/marker/role/action/hash approval/expiry verified; no connection or SQL. |
| Worker/Auth Live | BLOCKED/NOT RUN: separate enqueue/worker and app/worker-role target approvals plus actual connected-queue acceptance absent. Node IPC fixture is not a real DB-connected worker. |
| Sandbox Live | BLOCKED/NOT RUN: exact operator endpoint, reviewed image digest/image ID, ACL/source mapping, actions/expiry and real control artifacts not supplied. No Docker probe/pull/container/scanner here. |
| Sentinel preservation | Source/API/assertions unchanged; regression evidence below. Actual schema/data/role/ledger before-after observer NOT RUN because no DB operation was authorized/performed. Historical Sentinel acceptance cannot substitute. |

## Final relevant checks

| Status | Command/group | Actual result |
| --- | --- | --- |
| PASS | npm.cmd run typecheck | No errors |
| PASS | npm.cmd run lint | No errors/warnings |
| PASS | `node --require ./tests/auth/skip-dotenv.cjs ./node_modules/vitest/vitest.mjs run --reporter=json --outputFile=test-results/guard-g01-live-unit.json` | 776/776 tests,62files. Guard/provider/DB SQL/worker/sandbox dependencies remain labeled doubles; real temporary filesystem/private Node IPC are distinct local evidence. |
| PASS | `node tests/guard/run-e2e.mjs` | Production build PASS; Guard7/7 PASS(40.2s). Original5 assertions/tests preserved;2new branch/SHA/approval-denial cases appended. |
| PASS | `node tests/guard/g01/run-regression.mjs auth` | Original21/21 PASS |
| PASS | same wrapper canvas | Original17/17 PASS |
| PASS | same wrapper legacy | Original6/6 PASS |
| PASS | same wrapper sentinel | S02 telemetry5/5 PASS |
| FAIL - known baseline | same wrapper detection | S03 5PASS/1FAIL(33.1s), unchanged valid-JSON assertion at tests/sentinel/detection.spec.ts:238 |
| PASS | `node --require ./tests/auth/skip-dotenv.cjs --import tsx worker/guard/plan.ts` | Actual aggregate unchanged; databaseMutation NOT_EXECUTED |
| BLOCKED | GitHub/PostgreSQL/RLS/connected-worker/sandbox Live suites | No eligible current runtime approval/target/evidence; not run, not passed by mocks |
| NOT TESTED | Production workers/deployments; actual source revocation, crash/recovery, enforcing resource/egress/ACL and physical retention/orphan cleanup | Not authorized/provisioned/accepted; G02 scanners out of scope |

Browser total: **61PASS/1FAIL of62**, not all E2E pass. Known Sentinel failure froma7a0998 is unchanged and separately deferred to Wil/Sentinel owner. No assertion removal/timeout extension/retry-to-hide-failure. Latest user explicitly permits candidate commit/push despite this baseline failure; it does not close Live gates. Initial development-only new-test arity/lint issues were fixed; no old Auth/Sentinel assertion weakened.

Guard-only provider preload `tests/guard/g01/github-revision-fixture.mjs` imports the old Auth fixture unchanged and intercepts only synthetic Guard revision requests. It requires isolated APP_URL127.0.0.1:3109 plus explicit Guard flag, and is selected only by the Guard runner. The original Auth runner/fixtures/tests are untouched. Build and fixture servers disable private dotenv loading; no real cookies/Authorization/token/private key is captured or printed.

## Migration / database authorization

Guard aggregate: `b63e1e8568babcf8d7811fe0fa735ecbec11ade64df19bdea78deb030a85869d`; platform aggregate `c3e39f6fd43ee6eb2fbf5b244778955aab4cabb8a11ed3c66d791cf99a252a94`. SQL artifacts/three platform ledger versions are unchanged. This is a SOURCE hash, not approved migration permission. See [plan](GUARD_G01_S03_MIGRATION_PLAN.json) and [configuration audit](GUARD_G01_POSTGRES_CONFIG_AUDIT.md).

G01 host/port/database/ownership/marker/version/current roles/active approval document/allowed actions/approved hash/expiry remain UNKNOWN except historical Sentinel/example values clearly separated in the audit. `.local/sentinel` absent in the three reviewed worktrees and approval-path variables UNSET in agent process do not prove the real Next process has no configuration. Never read `.env` to resolve this uncertainty and never reuse closed Sentinel approvals.

## Operator configuration names (no values inferred)

Keep existing Auth/App configuration. Optional Guard runtime inputs are `GUARD_SOURCE_ACCEPTANCE_APPROVAL_FILE`, `GUARD_PREPARATION_APPROVAL_FILE`, `GUARD_WORKER_APPROVAL_FILE`, and independent `GUARD_DB_APP_APPROVAL_FILE/PASSWORD_FILE`, `GUARD_DB_WORKER_APPROVAL_FILE/PASSWORD_FILE`. Migration uses its independent `GUARD_DB_MIGRATION_APPROVAL_FILE/PASSWORD_FILE` only under separately approved schema operations. Operator supplies private absolute paths and credentials outside Git/chat. These names do not imply paths/files are currently provided.

`GUARD_LIVE_READ_ENABLED=1` is needed for existing scoped status/retrieval used by worker evidence verification, only after app-role/schema approval; the flag itself grants no permission. `GUARD_POSTGRES_ACCEPTANCE=1` selects the prepared isolated PostgreSQL acceptance runner only after exact runtime+integration_test approvals on a real approved G01 target. Do not run it as part of the present connection-free configuration audit. Do not run old Sentinel database scripts to populate a Guard target. Source-only approval is one attempt, including failure/cancellation; `.used` reserves it. Ref/reverification changes the draft binding and requires fresh matching approval.

## Concrete completion sequence / approval owners

1. **User + existing Auth process operator:** serve reviewed candidate with the existing supported single Auth writer/config/session at the intended origin. Do not start a second process sharing the Auth filesystem store. Keep the current working integration intact; no real server was stopped/restarted in this continuation. Browser-control access must be available for agent-driven real UI verification, or the user can perform the exact UI actions and share only non-secret metadata/results.
2. **Current GitHub repository/account owner (user/Wil):** open existing Canvas-selected project Guard route, choose real branch/SHA, verify metadata, download preparation draft. Review exact derived actor/workspace/project/repository/commit/origin, bounds1,000files/65,536bytes/file/20,000,000bytes, <=1h snapshot_read/temp-artifact-write/cleanup permission. Operator supplies the private non-secret approval record path, never session/token/key values. Run authorized positive/private and controlled denied/stale/revoked/removal/timeout checks without uninstalling/changing the working GitHub App casually.
3. **DB operator + Wil/platform owner:** supply actual provided target/environment/owner/marker/PG version and active non-secret approval document path with precise role bootstrap/platform extension/migrate_up/read-only preflight/runtime/integration_test actions, exact aggregate and expiry. Roles are independent Guard app/worker/migrator, provisioned privately. Fresh-target creation and migrate_down are separate permissions. Proposed database names are not a provided/approved target. No Live/production/populated Sentinel reset.
4. **Wil/Sentinel owner + DB operator:** approve a read-only Sentinel S01/S02/S03 catalog/data/ledger/role/RLS/budget observer, exact pre/post comparisons and concurrency/stop conditions. Verify target/roles/ledgers first; perform only approved migration idempotence/RLS/persistence/tenant/no-context/rollback/recovery tests, retain evidence and compare observer. Stop rather than reset on mismatch. Guard runtime roles must not gain broad Sentinel rights for observation.
5. **User/Wil Auth owner + runtime operator:** turn the reviewed draft into distinct operator-owned preparation/worker permits with exact target/worker/job/repo/commit/actions/expiry and matching app/worker role approvals. Only then use Queue approved preparation / Run approved preparation worker. Require persisted preparation+coverage+cleanup evidence, not HTTP200/303 or child exit0. Verify actual renewal/revocation/cancel/timeout/crash/restart/outage/fencing and source cleanup; no production worker permission inferred.
6. **Sandbox operator:** exact enforcing local Linux daemon endpoint, trusted image digest/ID/spec/command, UID/private source ACL/mount, bounded actions and expiry; actual isolation/resource/egress/cancel/crash/orphan cleanup artifacts and operator attestation. Prove controls before any untrusted source. No host execution fallback. Installed supervision/retention remains a separately approved operational gate.
7. **User:** accept G01 only after all mandatory Live artifacts pass. Defer known baseline Sentinel fix to its owner after G01 features; do not start G02 automatically. No merge/deploy.

Risks/recovery: wrong DB target/marker/hash/privilege can harm existing data; transaction rollback is required on failed operations. Never delete retained Guard/Sentinel rows to force rollback or passing tests. Guard down is separately approved and refuses retained data; preserve evidence and stop Guard-only activity on mismatch. Existing best-effort token revocation and real source ACL/enforcement/crash supervision still need runtime acceptance. No unresolved runtime gate is hidden by passing fixtures.

## Changed files since7eb6bfe

- `docs/GUARD_G01_ACCEPTANCE_PREFLIGHT.md`
- `docs/GUARD_G01_FINALIZATION.md`
- `docs/GUARD_G01_LIVE_ACCEPTANCE.md`
- `docs/GUARD_G01_POSTGRES_CONFIG_AUDIT.md`
- `docs/agent-handoffs/HANDOFF_GUARD_G01.md`
- `src/app/api/guard/projects/[projectId]/preparation/route.ts`
- `src/app/api/guard/projects/[projectId]/repository/route.ts`
- `src/app/app/projects/[projectId]/guard/[[...section]]/page.tsx`
- `src/features/guard/live/github-source.ts`
- `src/features/guard/live/http.ts`
- `src/features/guard/live/preparation-request.ts`
- `src/features/guard/live/preparation.ts`
- `src/features/guard/live/repository.ts`
- `src/features/guard/live/revision.ts`
- `src/features/guard/live/service.ts`
- `src/features/guard/live/source-acceptance.ts`
- `src/features/guard/live/workbench.tsx`
- `src/features/guard/live/worker-launcher.ts`
- `tests/guard/e2e/guard.spec.ts`
- `tests/guard/g01/github-provider.test.ts`
- `tests/guard/g01/github-revision-fixture.mjs`
- `tests/guard/g01/http.test.ts`
- `tests/guard/g01/preparation-request.test.ts`
- `tests/guard/g01/repository.test.ts`
- `tests/guard/g01/revision.test.ts`
- `tests/guard/g01/source-acceptance.test.ts`
- `tests/guard/run-e2e.mjs`
- `worker/guard/approval.ts`

Current S03 failing trace retained outside Git in the continuation recovery directory. SHA256 `bf08a305b83ce9988438f7b7142bf1a364d628091d452efdeaf03b4953fcf1f9`. Generated traces/private fixture state are not staged.
