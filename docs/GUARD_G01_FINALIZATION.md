> Verified offline continuation: [16-case readiness, current test evidence, approval packets and remaining blockers](GUARD_CONTINUATION_VERIFICATION_20261116.md). Overall G01 remains PARTIALLY COMPLETE; no new live case ran.

> Current instruction, 16 November 2026: owner/Codex owns G02-G06 on `feat/guard-g01-s03-integration`, PR #7. Publication to this existing branch is authorized after verification. Runtime cases still require fresh exact-case approval. See [active continuation and actual audit](GUARD_DEVELOPMENT_CONTINUATION.md) and [executable remaining-gate packages](acceptance/guard-g01/remaining-gates-v2/README.md). Earlier dated restrictions and assignments below are historical where superseded; preservation and runtime safety constraints remain.

# Current continuation: remaining G01 acceptance plans; no new runtime/publication approval

The owner requested four separate remaining-gate plans and fresh specific approvals before runtime mutations. Connected Worker/Auth prepare_only and the old exact-job evidence stay PASS/frozen; its 2 enqueue + 1 launch budget is consumed and must not be repeated. Plans and 16 inactive review intents are in [remaining-gates-v1](acceptance/guard-g01/remaining-gates-v1/README.md). They do not activate permits or authorize jobs/containers/faults. Runtime composition, exact specs, case-scoped controls and final artifact hashes must be completed before final execution approval.

Scope is existing localhost:5432/wetscan_s01_test_guardg01 only. Owner confirms external Sentinel NOT_VERIFIED / TARGET_NOT_IDENTIFIED; never probe historical127.0.0.1:55432, create another DB or change Sentinel. Successful down/up on retained rows is blocked by this preservation constraint; source-orphan reaping needs real one-hour age and a new cleanup-only approval window. These limits are not PASS or an automatic G01 waiver. Overall remains PARTIALLY COMPLETE. Publication will require new explicit permission after the final gate decision; historical permission statements below do not authorize commit/push now. G02-G06 not started.

---

# Guard G01 finalization - 15 November 2026 (Asia/Jakarta)

## Current Live-acceptance continuation - 15 November 2026

Read [GUARD_G01_LIVE_ACCEPTANCE.md](GUARD_G01_LIVE_ACCEPTANCE.md) and [PostgreSQL configuration audit](GUARD_G01_POSTGRES_CONFIG_AUDIT.md) first. Latest source adds Guard-only branch/SHA validation and an authenticated preparation UI/approval route using existing Auth/Canvas selection; no new OAuth/onboarding/repository picker.776units/typecheck/lint/build/Guard7/Auth21/Canvas17/legacy6/S025PASS; S035PASS/1knownbaselineFAIL. Status PARTIALLY COMPLETE; actual GitHub/DB/RLS/worker/sandbox gates remain BLOCKED. PostgreSQL inspection was configuration-only, no connection/SQL; target/marker/role/approval/expiry UNKNOWN. The historical record below is preserved.


Status: **PARTIALLY COMPLETE**. Local G01 foundation implementation and fixture regressions are verified; mandatory Live acceptance is still BLOCKED. No G02 work, scanner execution, real SQL, migration, actual GitHub source retrieval, connected runtime worker, container operation, merge or deployment is claimed.

This is the current record. The user's G01 FINALIZATION instruction explicitly authorizes candidate commit/push after relevant checks, and supersedes the earlier publication hold. The known baseline Sentinel failure must remain unchanged and is not the sole publication blocker. Earlier records below/elsewhere retain their historical results and permissions; they are not current authorization.

## Git audit and preservation

- Candidate: `feat/guard-g01-s03-integration` in `C:/laragon/www/wetscan-2/wetscan-guard-g01-s03-candidate`, based on `f7bfeef29488c3f997e9444555039514f55fa0a3`. The candidate already contained 33 uncommitted reviewed Guard paths at this audit start. Original G01 already in master was not replayed.
- Old worktree now has HEAD `92ee6fa742d275c5349e698cd111533a69d80704` on `feat/guard-g01-live-integration` and was clean at audit start. This was an external change since the old 7207a16 snapshot; it was not reverted or overwritten. Old worktree is retained.
- Master was clean at `f7bfeef29488c3f997e9444555039514f55fa0a3`. No branch switch, merge, reset or write occurs there.
- Fresh prechange Git/status and public candidate hashes were saved outside the repository in `wetscan-g01-finalization-1bdec7ae-275b-4620-9c5b-0545969c0611/prechange-state.json` under the Windows temporary directory. No ignored/private file was opened.
- The publication commit itself is the authoritative implementation SHA; this record does not invent a SHA before commit. Remote publication is verified separately and reported to the user. No PR or merge is authorized.

## Feature audit and implementation

| Area | Production implementation / changes | Evidence and remaining gate |
| --- | --- | --- |
| GitHub | Reuses existing Auth/Canvas authorization and fixed-origin bounded provider transport. Revalidates current actor/user/installation/repository/name/branch before minting a repository-scoped Metadata/Contents read token. Validates exact repository identity and SHA40/tree/blob hashes. Snapshot bounds, exclusions, partial coverage, provenance/digest and private cleanup remain. | Provider-negative and private-repository-shaped responses are synthetic tests. Actual private repository access, revocation, token cleanup and timeout acceptance require an approved repository/current SHA/account. No Live request made. |
| PostgreSQL/RLS | Existing Guard-only approved roles/pool, FORCE RLS proposal, scoped store/CAS/fencing/retention checks and atomic scan+queue transaction reused. Exact expected DB target is checked before purpose-specific credential access. Both platform and Guard ledgers verified by common Guard readiness helper. | Recording SQL and approval/ledger tests pass. No database was connected; roles, RLS enforcement, durable recovery, migration up/up/down and Sentinel preservation need explicit operator target/action approval. No SQL/schema changes in this candidate. |
| Producer | New server-only `enqueueApprovedGuardPreparation` validates a distinct `guard-preparation` permit, exact immutable actor/repo/commit/profile/engines/job binding, independent app-role target approval, actual current HEAD, fresh authorization and both ledgers before atomic enqueue. Worker permits cannot enqueue. | Six synthetic integration cases cover enqueue, permit isolation, binding mismatch, stale HEAD, revocation and schema failure/pool cleanup. No public route activates this producer and no actual enqueue was performed. |
| Worker/Auth | Concrete Auth-owner private IPC broker and bounded one-job launcher/child bootstrap exist. No second Auth store/writer, no credentials/source paths in child or durable jobs. Fresh scoped grants, session/repo/lease revalidation, cancellation/disconnect, permit expiry, cleanup and fixed safe errors remain. Worker and enqueue permits are distinct, total validity <=1h. Concurrent snapshot acquisition now reserves its one-handle budget before waiting. | Real inherited Node child IPC and default-deny child entry tests run with synthetic authority/provider. Connected PostgreSQL worker crash/restart/retry/cancel/outage/revocation acceptance NOT RUN. Existing single Auth-process limitation remains. |
| Job preparation | Fixed a real contract mismatch: worker previously spread the entire ScanJob into SnapshotPort.acquire, while broker required exact ScanRequest. Now passes only mode/workspace/project/repository/profile/idempotency/engines. Guard lifecycle forwards S03 latest-lease getter; bootstrap/prepare revalidate it before resolving/writing. | New chain test runs production prepare -> IPC -> broker -> snapshot -> PostgreSQL store code with real private temporary source and synthetic Auth/provider/SQL. Covers source cleanup, persisted coverage, renewed lease, revocation/cancellation and replaced token. It is not a real DB/provider/worker acceptance. |
| Sandbox | Existing bounded Docker CLI implementation retained. Production factory now pins an explicit local Unix socket/named pipe, ignores ambient Docker context, binds expiring operator evidence to daemon ID/version/kernel, spec digest, image ref and actual image ID; container image ID must match. Concrete trusted operator-evidence adapter requires SHA256 artifact references for every distinct required control. Pre-aborted work never touches driver. | Driver/evidence tests are doubles. No default image, runtime proof or host fallback. Actual non-root source readability/Windows ACL, resource/egress limits, crash/orphan cleanup need approved enforcing Linux daemon/image/probe and real evidence. An evidence record is a trusted operator attestation, not cryptographic verification of artifact contents or automatic enforcement proof. |
| S03 compatibility | Guard queue retains its own exact-job filter; S03 timestamp/admission parameters stay Sentinel-only. Uses shared executor with current lease getter and inherited scoped heartbeat/complete/retry/cancel. No shared source edits. | Compatibility tests and original Sentinel regressions retained. S03 form-error race is a known baseline defect, detailed below. |
| Approval/migration/preservation | Exact target/actor/repository/commit/action/expiry and plan binding; app/worker/migrator credentials remain purpose-specific operator inputs. Plan regenerated from unchanged SQL with three S03 versions. | Source hashes are not migration approval. Actual role/RLS/preservation/rollback observations remain BLOCKED. No .env/secret/operator credential or approval record opened. |

G01 is preparation infrastructure. Its successful preparation records `foundation_prepared` plus source coverage and an explicit failed scan status because G02 execution is unconfigured; it never manufactures completed engines, findings or a successful scan. The ordinary full-scan POST remains fail-closed. Enqueue and worker seams are explicit server-only operations requiring applicable separate permits, not automatically activated endpoints or daemons.

## Reproducible checks

All commands run in the candidate worktree. Existing lockfile/dependencies, shared Auth/platform/Sentinel/dashboard source and original E2E assertions are unchanged. Browser fixtures run on local temporary test servers, not the user's live localhost session. No dotenv is read. Test-only generated keys/credentials are synthetic and never operator secrets.

| Status | Check | Result / boundary |
| --- | --- | --- |
| PASS | `npm.cmd run typecheck` | Actual candidate TypeScript; no errors. |
| PASS | `npm.cmd run lint` | Existing ESLint config; no lint errors/warnings. |
| PASS | `node --require ./tests/auth/skip-dotenv.cjs ./node_modules/vitest/vitest.mjs run` | 737/737 cases, 59 files. Includes Guard/Auth/Sentinel regressions, GitHub transport/provider doubles, DB approval/RLS SQL contracts, queue/executor, worker/private IPC and sandbox doubles. |
| PASS | `node tests/guard/run-e2e.mjs` | Production Next build passes; original Guard browser tests 5/5. Uses synthetic Auth/provider fixture. |
| PASS | `node tests/guard/g01/run-regression.mjs auth` | 21/21, 45.9s. Existing Auth/onboarding/session/logout/installation suites unchanged. |
| PASS | `node tests/guard/g01/run-regression.mjs canvas` | 17/17, about 1.5m. |
| PASS | `node tests/guard/g01/run-regression.mjs legacy` | 6/6, 59.2s. |
| PASS | `node tests/guard/g01/run-regression.mjs sentinel` | S02 telemetry 5/5, 12.9s. |
| FAIL - known baseline | `node tests/guard/g01/run-regression.mjs detection` | S03 5 PASS / 1 FAIL, 32.2s; unchanged invalid-JSON assertion. No retry, delay or assertion change to hide it. |
| PASS | `node --require ./tests/auth/skip-dotenv.cjs --import tsx worker/guard/plan.ts` | Pure source plan calculation; databaseMutation NOT_EXECUTED. |
| BLOCKED | Real GitHub/private source, DB/role/RLS/migrations/preservation, connected worker and sandbox acceptance | Exact targets/action approvals and operator provisioning/evidence absent. Not substituted by fixtures. |
| NOT TESTED | Production worker/deployment, scanner execution, real crash recovery/ACL/enforcement/physical retention cleanup | Not authorized/configured; G02 scanners are outside G01. |

Existing browser total: **59 PASS / 1 FAIL of 60**. Runtime Gate status is not inferred from these browser passes. Initial new-test development errors (spy ordering, missing test import and required AbortSignal argument) were corrected; no original test was removed/overwritten.

## Known baseline Sentinel failure

`tests/sentinel/detection.spec.ts:228` fails at line 238 waiting for the main alert containing `valid JSON`. Initial loading's 150ms callback clears the same error state used by local JSON validation. `live-detection.tsx` and all Sentinel assertions remain byte-identical to baseline. The issue originates in `a7a0998d110a2abf46d7d123d2140eb9a77879fb`.

Prior controlled baseline/candidate comparison: original test five repetitions, no retries: baseline f7bfeef 4 PASS/1 FAIL, candidate 3 PASS/2 FAIL. Sentinel-only controlled host also reproduces the race without Guard/AppShell. Failed traces showed no Guard API or Sentinel POST. Evidence remains in the separately retained `wetscan-g01-s03-ab-e7147b12-3ed8-4d0e-b84b-9fb4ad18172d` temporary directory. That comparison was not rerun or reclassified as a regression pass here. This finalization run independently reproduced the same failure. Current trace/context are under `test-results/sentinel-s03/detection-invalid-advanced-835ae-lly-without-sending-a-write/` and are not committed.

Owner: Wil/Sentinel UI and E2E maintainer. Defer its fix until after G01 feature work as instructed. The earlier proposed patch remains unapplied. The latest user explicitly permits candidate publication despite this known baseline failure, but this does not close Live G01 acceptance.

## Actual migration plan (regenerated, not applied)

- Guard aggregate: `b63e1e8568babcf8d7811fe0fa735ecbec11ade64df19bdea78deb030a85869d`.
- Platform aggregate: `c3e39f6fd43ee6eb2fbf5b244778955aab4cabb8a11ed3c66d791cf99a252a94`.
- Guard up/down pair: `8bdea256cdd5ab79b1525f43bd40508acf25e57502a72162ae6b5233dd55693b`.
- Exact versions and five unchanged SQL hashes: [GUARD_G01_S03_MIGRATION_PLAN.json](GUARD_G01_S03_MIGRATION_PLAN.json). The old two-version aggregate is rejected before DB connection.

## Remaining acceptance checklist and approval owners

- [x] Isolated f7bfeef candidate; audited local Guard delta preserved; old Guard worktree retained.
- [x] Concrete producer, Auth-owner resolver/IPC launcher, strict snapshot request, fresh lease forwarding, sandbox target/image/evidence binding and regression coverage implemented locally.
- [x] Typecheck/lint/unit/build and Guard/Auth/Canvas/legacy/S02 browser checks pass. S03 baseline failure retained separately.
- [ ] **Database operator + Wil/platform owner:** approve exact loopback host/port/fresh target database/marker/PG version, separate app/worker/migrator roles, aggregate above, precise role bootstrap/platform extension/migrate_up/idempotence/runtime/integration_test actions and expiry. If rollback is needed, approve migrate_down separately with exact target/actions. Operator provisions credentials privately; never send keys/passwords in chat. No implicit approval for Live or historical populated Sentinel test DB reset.
- [ ] **Wil/Sentinel owner + DB operator:** approve read-only before/after observer for Sentinel S01/S02/S03 schema/ledgers/rows/roles/budget, retention and preservation stop conditions; then execute actual DB/RLS/persistence/recovery tests on the approved target. SQL contract tests do not prove RLS enforcement.
- [ ] **GitHub repository/account owner (user or Wil):** authorize exact repository ID/name, existing server-derived workspace/project/actor, installation/account, origin/current SHA and <=1h bounded snapshot_read/temp-write/cleanup operations. Operator supplies existing session/App config privately. Then verify private source/hash/partial coverage/revocation/timeout/cleanup against the actual provider.
- [ ] **Sandbox/infrastructure operator:** provide and approve exact enforcing local Linux daemon endpoint, reviewed digest-pinned trusted probe image/spec/command, UID/private-source ACL/mount mapping, bounded create/start/inspect/stop/cleanup and any separately needed image pull. Produce actual artifacts for every isolation/resource/egress/cancellation/crash/orphan-cleanup control. Trusted evidence adapter checks binding/expiry/completeness; it cannot create the missing proof.
- [ ] **User/Wil Auth owner + runtime/DB operator:** approve exact job/repository/commit/target/expiry and distinct enqueue + worker action sets. Run prepare-only worker with independent app/worker-role permissions; observe real lease, logout/revocation, retry, timeout/cancel/crash/restart/fencing/cleanup and Sentinel preservation. Parent restart requires fresh authenticated rebinding. No production daemon authorization is inferred.
- [ ] **Operator + Wil:** validate and schedule owned-artifact/container reapers and retention/evidence policy under explicitly approved operations; reaper implementations are not an installed supervisor. Confirm Windows ACL/source readability and physical cleanup on the actual runtime.
- [ ] **User:** review actual acceptance artifacts and accept G01 only after all mandatory gates above pass. G02 requires its separately supplied Markdown and explicit start instruction.

Safe local implementation is complete for the reviewed foundation boundaries; operational activation and the mandatory real acceptance gates remain open. No claim of overall COMPLETE is made.

## Changed-file manifest

Relative to candidate base f7bfeef, including the previously reviewed uncommitted delta and this finalization:

- `docs/GUARD_G01_ACCEPTANCE_PREFLIGHT.md`
- `docs/GUARD_G01_ARCHITECTURE.md`
- `docs/GUARD_G01_FINALIZATION.md`
- `docs/GUARD_G01_MIGRATION_REVIEW.md`
- `docs/GUARD_G01_S03_BASELINE_REVIEW.md`
- `docs/GUARD_G01_S03_DETECTION_RACE_REVIEW.md`
- `docs/GUARD_G01_S03_INTEGRATION_VALIDATION.md`
- `docs/GUARD_G01_S03_MIGRATION_PLAN.json`
- `docs/GUARD_G01_VALIDATION.md`
- `docs/GUARD_G01_WORKER_AUTH_REVIEW.md`
- `docs/GUARD_IMPLEMENTATION_STATUS.md`
- `docs/INTEGRATION_BACKLOG.md`
- `docs/agent-handoffs/HANDOFF_GUARD_G01.md`
- `src/features/guard/live/database-config.ts`
- `src/features/guard/live/github-source.ts`
- `src/features/guard/live/preparation.ts`
- `src/features/guard/live/queue.ts`
- `src/features/guard/live/runtime.ts`
- `src/features/guard/live/schema-readiness.ts`
- `src/features/guard/live/worker-launcher.ts`
- `tests/guard/g01/auth-broker.test.ts`
- `tests/guard/g01/broker-fixture.ts`
- `tests/guard/g01/broker-process.fixture.ts`
- `tests/guard/g01/broker-process.test.ts`
- `tests/guard/g01/database-target.test.ts`
- `tests/guard/g01/github-provider.test.ts`
- `tests/guard/g01/ipc.test.ts`
- `tests/guard/g01/launcher.test.ts`
- `tests/guard/g01/persistence.test.ts`
- `tests/guard/g01/preparation.test.ts`
- `tests/guard/g01/prepare-chain.test.ts`
- `tests/guard/g01/run-regression.mjs`
- `tests/guard/g01/s03-compatibility.test.ts`
- `tests/guard/g01/sandbox-evidence.test.ts`
- `tests/guard/g01/sandbox.test.ts`
- `tests/guard/g01/worker.test.ts`
- `worker/guard/approval.ts`
- `worker/guard/auth-broker.ts`
- `worker/guard/bootstrap.ts`
- `worker/guard/ipc.ts`
- `worker/guard/main.ts`
- `worker/guard/prepare.ts`
- `worker/guard/runtime.ts`
- `worker/guard/sandbox-evidence.ts`
- `worker/guard/sandbox.ts`

## Final frozen-source verification

Final JSON unit report confirms737PASS/0FAIL/0PENDING,59files. Guard GitHub provider9, producer6, prepare-chain3, sandbox8+evidence8, Guard worker5, broker8 all PASS. Shared queue/executor focused set totals43passing cases (Guard compatibility7 + persistence8 + worker5 + Sentinel runtime-isolation23), included in the737, not added again. Final source production build and Guard5/5 PASS(22.1s), typecheck/lint PASS. S03 known failure trace was copied outside Git to the finalization recovery directory; trace SHA256 `4430852272c77c21c81910366eb3ce4ebf36a6b8617d5a38c0ff1e1cf229165d`. No trace/auth data is staged.
