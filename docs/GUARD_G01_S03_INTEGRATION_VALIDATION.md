# Guard G01 + S03 integration candidate - validation and blocker

## Current finalization status - 15 November 2026

See [GUARD_G01_FINALIZATION.md](GUARD_G01_FINALIZATION.md) for the current audit, implementation, test results and exact remaining approval checklist. Overall **PARTIALLY COMPLETE**, real acceptance **BLOCKED**. Latest user explicitly authorizes candidate commit/push despite the known baseline Sentinel failure; the earlier publication hold below is historical and superseded. No Sentinel fix/assertion edit, G02, real SQL/provider/worker/container operation, merge or deploy is performed. Current old Guard HEAD is92ee6fa, preserved; do not restore historical7207a16 state. New producer is prepare_only, lease getter is now forwarded, snapshot request mismatch/concurrency and sandbox identity/evidence boundaries are fixed; earlier descriptions of missing implementations describe their historical phase.


15 November 2026 (Asia/Jakarta). **CANDIDATE PREPARED / PUBLICATION BLOCKED.** Overall G01 remains PARTIALLY_VERIFIED. The user's latest decision is: "Jangan ubah Sentinel; tahan commit/push dan laporkan blocker." Therefore no Sentinel fix, staging, commit, push, PR, merge or deployment is performed. G02 is not started. No .env, credential or operator approval file is read; no actual database/provider/sandbox/connected-worker operation occurs.

## Candidate and preservation

- Candidate: C:/laragon/www/wetscan-2/wetscan-guard-g01-s03-candidate, branch feat/guard-g01-s03-integration.
- Exact base/current HEAD: f7bfeef29488c3f997e9444555039514f55fa0a3. **No new implementation commit exists.** The HEAD SHA identifies the baseline, not a committed candidate delta.
- Old Guard worktree: C:/laragon/www/wetscan-2/wetscan-guard-g01 remains feat/guard-g01-live-integration at7207a16ad3a7640d48bd67719188642b27fb9be2, with exactly the same28 modified/untracked file bytes and Git status captured before candidate creation. Nothing was stashed/reset/deleted/rebased there.
- Original master remains unmodified. Source candidate was made with git worktree add -b feat/guard-g01-s03-integration <new-path> f7bfeef29488c3f997e9444555039514f55fa0a3. No merge/cherry-pick.
- Before copying, all28 reviewed tracked/untracked Guard delta files were backed up with SHA-256 manifest and a binary-capable tracked patch outside Git/OneDrive. Every backup and candidate copy was rehashed. Tracked base blobs matched on both old HEAD and f7bfeef; no untracked path collision. Only those28 files were copied; G01 already in master was not reapplied.
- In addition to the copied delta, this phase adds seven Guard compatibility test cases, a sanitized S03 detection runner option, actual plan JSON and Guard documentation. No shared Auth/Canvas/platform/Sentinel source, SQL, dependency or dashboard file is changed.

## Actual combined checks

Windows/PowerShell, Node24.17.0/npm11.13.0, Edge browser. Dependencies installed from unchanged lockfile with lifecycle scripts disabled. All fixtures exclude dotenv and runtime Guard/Sentinel/Auth/GitHub/PG configuration; Auth fixture keys are generated synthetic values, never operator keys.

| Exact command | Dependencies | Actual result |
| --- | --- | --- |
| npm.cmd ci --ignore-scripts --no-audit --no-fund | Existing lockfile; candidate node_modules only |457 packages installed,33s; no dependency/lockfile changes |
| Initial combined unit run before new compatibility cases | Current combined S03+Guard source, no Live targets |700/700 PASS,54files |
| npm.cmd run typecheck | Actual candidate TS source |PASS |
| npm.cmd run lint | Existing ESLint config |PASS, no lint errors/warnings |
| node --require ./tests/auth/skip-dotenv.cjs ./node_modules/vitest/vitest.mjs run | Actual combined domain/contract code; SQL/source/container doubles and trusted subprocess fixtures |**707/707 PASS**,55files,6.99s |
| Focused shared queue/executor/isolation run | s03-compatibility, Guard persistence/worker, Sentinel runtime-isolation; recording SQL/queue |**42/42 PASS**,4files,1.80s |
| node tests/guard/run-e2e.mjs | Next production build + existing Auth fixture + Guard browser tests |**Build PASS;5/5 browser PASS**,21.1s |
| node tests/guard/g01/run-regression.mjs auth | Existing Auth/onboarding/account/GitHub/Canvas provider fixtures |**21/21 PASS**,1.5m |
| node tests/guard/g01/run-regression.mjs canvas | Existing Canvas/layout fixture |**17/17 PASS**,1.5m |
| node tests/guard/g01/run-regression.mjs legacy | Original walkthrough/interaction fixture |**6/6 PASS**,1.1m |
| node tests/guard/g01/run-regression.mjs sentinel | Existing S02 telemetry fixture |**5/5 PASS**,13.4s |
| node tests/guard/g01/run-regression.mjs detection | Original S03 detection fixture/assertions/timeouts, unchanged |**5 PASS,1 FAIL**,34.3s |
| node --import tsx worker/guard/plan.ts | Guard/platform migration SOURCE reads only |PASS; three-version actual plan, databaseMutation NOT_EXECUTED |

Overall existing browser gates: **59 PASS,1 FAIL out of60;0skipped**. No pass was obtained by removing/changing the failing assertion, increasing its15s expectation timeout, adding sleeps, accepting a retry or modifying Sentinel source. No unchanged-suite retry was used to hide the race.

The focused command selected tests/guard/g01/s03-compatibility.test.ts, persistence.test.ts, worker.test.ts and tests/sentinel/runtime-isolation.test.ts. Its additional tests/platform/executor.test.ts filter matched no file and is not included in the4-file/42-case result. The actual executor is exercised by the runtime-isolation cases; no fifth file or separate executor suite is claimed.

## Shared queue/executor compatibility

Seven added cases in tests/guard/g01/s03-compatibility.test.ts verify Guard's own onlyJobId does not enter the S03 timestamp/admission slots; Sentinel-only admission rejects Guard before pool access; ordinary inherited heartbeat/complete/retry/cancel retain scoped Guard fencing and no Sentinel acceptance SQL parameters; old two-version aggregate is rejected before migration connect; exact three-version readiness accepts, legacy readiness rejects without DDL. Existing S03 tests prove legacy two-argument Guard handlers and latest-heartbeat callback behavior; all existing tests remain.

No required queue/executor source compatibility fix was needed. Optional latest-lease getter forwarding in Guard remains a follow-up, not silently implemented. Guard still has the bounded prepare-only IPC launcher and existing Auth ownership constraints; no production daemon or real worker acceptance is implied.

## Blocking S03 browser failure and diagnosis

Failure: tests/sentinel/detection.spec.ts:228, "invalid advanced conditions fail locally without sending a write". At line238, the unchanged15-second assertion could not find main's alert containing "valid JSON". The original context and trace.zip were copied outside Git before any possible rerun, and remain preserved. Test had not reached its final writes assertion; that original assertion is not reported as passing.

Source src/features/sentinel/components/live-detection.tsx exactly matches f7bfeef. The initial loading effect schedules a150ms callback that sets loading and clears error. Form JSON.parse failure writes the same error state. An invalid submission before that callback can display and then erase its error while the invalid input remains. This is a pre-existing Sentinel UI ordering race, not a Guard queue/executor failure.

A separate trusted browser diagnostic held the initial150ms callback, submitted invalid JSON, observed the error, released the callback and observed that the error disappeared while input remained invalid and POST count stayed0. Diagnostic:1/1 PASS,6.7s, meaning the BUG was reproduced; it is **not** added to the60 regression passes. It uses only mocked APIs/local fixture and no Live targets. Two preliminary diagnostic setup attempts failed before execution (Windows preload path escaping, then CJS requiring an ESM/import.meta config); a standalone equivalent fixture config fixed the diagnostic launcher without changing product/source tests. Those are setup failures, not application acceptance.

A complete proposed one-file UI diff is documented in GUARD_G01_S03_DETECTION_RACE_REVIEW.md. It separates form error from loading/API errors. **It was never applied.** User explicitly declined the Sentinel scope exception and instructed commit/push to be held. Consequently publication remains blocked even though the Guard code/type/build/unit and other browser groups pass. Only Sentinel owner/user review or an authorized upstream fix can unblock this gate; repeated flaky passes do not resolve it.

## Actual migration plan

Artifact: GUARD_G01_S03_MIGRATION_PLAN.json, generated by the actual candidate plan command, not just a static preview.

- Guard aggregate:b63e1e8568babcf8d7811fe0fa735ecbec11ade64df19bdea78deb030a85869d.
- Platform aggregate:c3e39f6fd43ee6eb2fbf5b244778955aab4cabb8a11ed3c66d791cf99a252a94.
- Platform ledger expectation:0001_foundation,0002_telemetry,0003_detection, each exact checksum recorded in JSON.
- Guard0001 up/down pair:8bdea256cdd5ab79b1525f43bd40508acf25e57502a72162ae6b5233dd55693b.
- All five Guard SQL file hashes match the audit/old worktree; no SQL was changed/applied. The old444596... aggregate is obsolete for this candidate and is tested as rejected.
- A source plan is not migration/runtime approval. Database target/marker/role/actions/expiry and source/sandbox acceptance are still unapproved; no operator record is invented/edited/read.

## Updated blocker checklist

- [x] B01: explicitly authorized candidate worktree from exactf7bfeef; audited delta only, old Guard tree retained.
- [x] Actual combined typecheck/lint/707unit/build and42focused queue/executor cases pass.
- [x] Actual three-version migration plan reproduced and saved; five Guard artifacts unchanged.
- [ ] **B02 / PUBLICATION BLOCKER:** S03 invalid-JSON UI race;59/60original E2E pass. User declined Sentinel changes and ordered commit/push held. No publication until an authorized fix and fresh affected gates pass plus user instruction permits publication.
- [ ] B03: exact database/marker/role/action/expiry and preservation approval for the new aggregate; no old Sentinel approval reuse.
- [ ] B04: approved real PostgreSQL/RLS/migration idempotence/durability/fencing and before-after preservation, including S03 detection rows.
- [ ] B05: explicitly authorized repository/user/workspace/project/commit and real GitHub snapshot/coverage/revocation/cleanup evidence.
- [ ] B06: operator-approved sandbox runtime/image/private source access and actual enforcing controls; no host fallback.
- [ ] B07: approved real Auth-owner launcher/worker invocation, lease/retry/cancel/crash/restart/cleanup acceptance; one-job preparation is not a daemon.
- [ ] B08: orphan supervision/retention/evidence operational review, final actual evidence and user's G01 acceptance. No G02 without a separately supplied prompt/start instruction.

## Publication and evidence boundaries

Origin was checked in memory against credential-free wilanta/wetscan-prototype GitHub URL; read-only ls-remote found the candidate branch absent before publication. No token/helper value was displayed. User's later hold decision supersedes earlier conditional commit/push authorization. No Git staging/commit/push/PR/merge/deploy occurred. HEAD remainsf7bfeef; report that baseline separately from the nonexistent new commit.

Ignored Playwright outputs are under test-results; the first failed S03 trace/context and recovery copies are preserved outside Git. No private file/recovery path or synthetic runtime approval is required in a published commit. Known inherited warnings: pinned ESLint deprecation, NO_COLOR/FORCE_COLOR, ReactFlow attribution and Next smooth-scroll warning. No dependency/UI cleanup outside scope was attempted.

## Exact candidate delta manifest relative to f7bfeef

- `docs/GUARD_G01_ACCEPTANCE_PREFLIGHT.md`
- `docs/GUARD_G01_ARCHITECTURE.md`
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
- `src/features/guard/live/queue.ts`
- `src/features/guard/live/runtime.ts`
- `src/features/guard/live/schema-readiness.ts`
- `src/features/guard/live/worker-launcher.ts`
- `tests/guard/g01/auth-broker.test.ts`
- `tests/guard/g01/broker-fixture.ts`
- `tests/guard/g01/broker-process.fixture.ts`
- `tests/guard/g01/broker-process.test.ts`
- `tests/guard/g01/database-target.test.ts`
- `tests/guard/g01/ipc.test.ts`
- `tests/guard/g01/launcher.test.ts`
- `tests/guard/g01/persistence.test.ts`
- `tests/guard/g01/run-regression.mjs`
- `tests/guard/g01/s03-compatibility.test.ts`
- `worker/guard/approval.ts`
- `worker/guard/auth-broker.ts`
- `worker/guard/bootstrap.ts`
- `worker/guard/ipc.ts`
- `worker/guard/main.ts`
- `worker/guard/prepare.ts`
