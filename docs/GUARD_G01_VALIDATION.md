# G01 validation evidence

## Current finalization status - 15 November 2026

See [GUARD_G01_FINALIZATION.md](GUARD_G01_FINALIZATION.md) for the current audit, implementation, test results and exact remaining approval checklist. Overall **PARTIALLY COMPLETE**, real acceptance **BLOCKED**. Latest user explicitly authorizes candidate commit/push despite the known baseline Sentinel failure; the earlier publication hold below is historical and superseded. No Sentinel fix/assertion edit, G02, real SQL/provider/worker/container operation, merge or deploy is performed. Current old Guard HEAD is92ee6fa, preserved; do not restore historical7207a16 state. New producer is prepare_only, lease getter is now forwarded, snapshot request mismatch/concurrency and sandbox identity/evidence boundaries are fixed; earlier descriptions of missing implementations describe their historical phase.


## Actual G01 + S03 candidate results - 15 November 2026

[Integration validation](GUARD_G01_S03_INTEGRATION_VALIDATION.md):707/707units,55files;42focused contracts; typecheck/lint/build PASS. Guard5/Auth21/Canvas17/legacy6/S02telemetry5 PASS. S03detection5PASS/1FAIL, so total existing browser59/60PASS. No overall combined acceptance PASS is claimed. Initial failure trace/context preserved; separate diagnostic deterministically reproduces loading erasing form validation and is not counted as a regression pass. Tests/expectation deadlines/Sentinel source remain unchanged.

User declined Sentinel source changes and ordered commit/push held. No staging/publication. Actual candidate planb63e1e... saved in JSON; no DB/Live worker/provider/sandbox operation, no secret read. Earlier567unit and static-only paragraphs below are historical and superseded for this actual candidate's measured checks. Overall G01 remains PARTIALLY_VERIFIED.


## Static baseline-audit evidence - 15 November 2026

[GUARD_G01_S03_BASELINE_REVIEW.md](GUARD_G01_S03_BASELINE_REVIEW.md) records scoped git diff/show/ls-tree review and independent SHA-256 reproduction from public SQL Git blobs.27 existing local paths vs51 upstream paths:zero exact/ancestor collisions. Old444596... aggregate reproduced; unchanged Guard SQL composed withf7bfeef yields previewb63e1e8568babcf8d7811fe0fa735ecbec11ade64df19bdea78deb030a85869d. No checkout/merge/candidate creation or target code execution/DB connection. Only documentation changes this turn; prior source/test changes retained byte-for-byte. No unit/build/browser rerun or combined PASS is claimed for this audit; the567-case run below is prior evidence on the existing Guard baseline.


## Latest resolver/launcher validation - 15 November 2026

See [worker Auth review](GUARD_G01_WORKER_AUTH_REVIEW.md) for full commands, failure history and scope. Full unit567/567 across48files (G01 subset78/78); typecheck/lint without warnings, production build, Guard5/5, Auth21/21 and Sentinel5/5 fixture browsers PASS. New tests include actual private IPC subprocess exchange and production-entry denial, with synthetic Auth/source/store/pool dependencies and no Live services/credential reads. Initial IPC result-filter failure and typing/lint corrections are preserved in that review.

These results apply to isolated Guard HEAD7207a16 plus local changes, not master S03. Master advanced externally to f7bfeef; no baseline integration or combined S03+new-resolver validation occurred. Local migration hash remains unchanged for the two-version baseline, not approved for an S03 database. Runtime acceptance remains open; G02 not started. Older counts below are preserved historical runs.


## Follow-up preflight - 15 November 2026

See [GUARD_G01_ACCEPTANCE_PREFLIGHT.md](GUARD_G01_ACCEPTANCE_PREFLIGHT.md) for the latest review. Current Guard HEAD `7207a16`, master merge `12b843e`, identical trees and clean starts. The read-only migration plan matches;16/16 focused approval/source/sandbox/worker fixture tests pass. Both explicitly tested Docker named-pipe endpoints returned exit1. No PostgreSQL connection, GitHub Live read, connected-worker/container/scanner execution, or new acceptance is claimed. Full547-unit/build/browser results below are preserved historical implementation evidence, not rerun in this documentation-only follow-up.

## Preserved implementation validation


Date: 15 November 2026, Asia/Jakarta. Overall PARTIALLY_VERIFIED. All commands below run in C:/laragon/www/wetscan-2/wetscan-guard-g01, feat/guard-g01-live-integration at cd313ce29aeac865e15cea9abd9c412cb9c2c3cc plus uncommitted G01 changes. Host Windows/PowerShell, Node v24.17.0, npm11.13.0, existing lockfile/dependencies. npm.cmd avoids PowerShell script policy. No .env/secret file was read. No G02 file was read or started.

## Executed checks

| Exact command | Dependencies / environment | Actual result |
| --- | --- | --- |
| `npm.cmd ci --ignore-scripts --no-audit --no-fund` | Existing unchanged lockfile, isolated worktree node_modules; package lifecycle scripts disabled | 457 packages installed; no dependency/lockfile edit |
| Baseline `npm.cmd test` | Original unit suite before G01 | 489 passed, 33 files |
| Final `npm.cmd test` | Vitest; real domain code + real local temporary filesystem; provider/SQL/Docker drivers are doubles; actual child-process lifecycle test | **547 passed, 43 files; 0 failed/skipped** (58 added test cases) |
| `npm.cmd run typecheck` | Existing strict TypeScript config | PASS |
| `npm.cmd run lint` | Existing ESLint config | PASS |
| `node tests/guard/run-e2e.mjs` | Builds Next production then launches isolated fixture server127.0.0.1:3109 and Edge Playwright, existing Auth fixture unchanged; no real GitHub/PG | **Build PASS; 5 passed, 0 failed/skipped, 30.5s** |
| `node tests/guard/g01/run-regression.mjs auth` | Existing Auth production fixture tests; prior successful production build; generated ephemeral keys only | **21 passed**, 42s |
| `node tests/guard/g01/run-regression.mjs canvas` | Existing Canvas and layout tests through Guard-owned config; real browser, mocked provider | **17 passed**, 1.5m |
| `node tests/guard/g01/run-regression.mjs legacy` | Original six application browser regressions; no assertion/timeout changes | **6 passed**, 1min |
| `node tests/guard/g01/run-regression.mjs sentinel` | Existing telemetry browser fixture tests; no real Sentinel DB | **5 passed**, 12.8s |
| `node --import tsx worker/guard/plan.ts` | Reads only proposed Guard/existing platform migration source | PASS; PREPARATION_ONLY, databaseMutation NOT_EXECUTED; hashes in migration review |
| `git diff --check` | Tracked changes only, followed by owned-file/secret-literal inspection | PASS; Guard-only manifest and Canvas backlog-prefix preservation PASS; limited credential-literal scan PASS (not a complete secret audit) |

The 547 unit cases include all original tests, not a replacement suite. The real-process test runs two independent Node start/stop cycles and rejects Sentinel shutdown IPC. Its queue is a double and empty: durable restart/crash recovery is NOT proven. Snapshot tests create/read/remove actual synthetic local files; they do NOT read a GitHub repository. SQL RecordingClient tests prove command/transaction/fencing code paths and static policy intent, not PostgreSQL syntax or RLS enforcement. Driver tests inspect Docker requests/replies supplied by doubles, not runtime isolation.

The new fifth Guard E2E covers existing authenticated repository authorization, hidden unrelated project, blocked readiness, no fake202, forged workspace rejection, and source-only acceptance blocked without new operator approval. Original four Guard tests and fixtures remain. Source-acceptance success has not run against a real provider. Auth/Canvas/Sentinel configs/source were not edited. The Guard-owned regression wrapper removes Guard/Sentinel/Auth/GitHub/PG/DB ambient configuration and uses existing skip-dotenv preload. The production runner similarly disables dotenv and generates ephemeral synthetic Auth secrets; it never prints them.

## Artifacts and warning history

Playwright uses existing output locations (ignored test-results/playwright reports) including guard-integrity-mobile.png and retained failure screenshots when generated. These are local artifacts, not committed evidence. Historical tests/guard/evidence scanner files remain unchanged; their old CLI verification is not G01 acceptance. Do not interpret a fresh local screenshot as proof of real GitHub/DB/scanner activity.

Observed benign warnings: NO_COLOR ignored when FORCE_COLOR is set; existing ReactFlow attribution/scroll-behavior warnings; an initial development-server slow-filesystem benchmark (~1,215ms). No test was marked flaky/retried to obtain the final pass. This is a single Windows environment, not cross-platform certification.

Initial G01 failures are preserved here:

- First 21-case run: two failures. SQL test double returned a valid row with rowCount=0, preventing claim, and a static rollback check accidentally matched CASCADE in a comment. The rowCount fixture and executable-SQL-only assertion were corrected, without weakening the required no-CASCADE operation.
- Sandbox tests initially failed because Windows realpath uses an 8.3 temp alias. A case-only comparison was insufficient. Canonical temp-parent plus owned root-prefix/non-symlink checks fixed the boundary; host fallback was never enabled.
- Migration-plan hashing initially referenced platform before initialization. Hashing was moved to the aggregate stage after platform loading; artifacts retain per-file and pair hashes.
- Initial lint unused imports were removed. A preparation script assertion failed after partial isolated writes; the missing changes were completed and all final checks rerun. No shared/user file was restored or overwritten.

No real acceptance failure was replaced with a mocked pass. No populated acceptance database was reset. Past fixture evidence remains historical.

## Runtime/approval gates (NOT RUN)

| Gate | Prepared evidence | Missing / exact next requirement |
| --- | --- | --- |
| GitHub provider | Current Auth/Canvas authorizer reused; bounded snapshot and one-attempt source acceptance gate; provider doubles | Explicit user approval for exact account/workspace/project/repository ID/name/pinned current HEAD/origin/time window/limits and snapshot temp writes+cleanup. No token values in chat. Then authorized source-only call, verify metadata/coverage/cleanup and real revoked/unauthorized denial. |
| PostgreSQL | Five hashed SQL artifacts; separate schema ledger; schema transaction/idempotence/rollback doubles; guarded acceptance script | Fresh exact loopback target/marker/roles/artifact hash/platform-owner approval and preservation observer. No connection has occurred. Run schema up/up and approved Guard acceptance, prove real RLS/privileges/no Sentinel mutation. |
| Connected worker | Queue/store adapters, injected lifecycle, real empty-queue Node process restart | Auth/platform-owner trusted resolver and process binding NOT_IMPLEMENTED; exact runtime DB approval, real competing claims/lease expiry/crash/retry/cancel/outage plus Sentinel observer. main.ts remains a refusing launcher. |
| Sandbox | Fail-closed adapter, safe command/inspection/cleanup fixtures | Docker CLI exists but daemon probe failed (docker_engine pipe absent); no daemon started/pull/container. Need operator-managed enforcing daemon, reviewed digest-pinned trusted probe image/spec, production attestation, private readable service UID/ACL/mount, actual network/resource/secret/socket/OOM/timeout/cancel/orphan tests. |
| Full Live scans | Honest unavailable API and unchanged Demo; release policy rejects missing/partial source coverage | G01 acceptance first, then actual user-supplied G02 prompt. No engine execution is configured by G01. |

## Remaining implementation / coverage gaps

- Auth worker resolver/broker and real process composition need a compatible owner handoff; direct filesystem-token refresh in a second process is unsafe. No second Auth is implemented.
- Source/container orphan reapers exist but are not wired to a production supervisor. Actual crash artifacts/children and concurrency during lease-loss cleanup remain unverified.
- Terminal queue exhaustion now appends a dedicated Guard audit event; SQL command intent is tested, actual PostgreSQL reconciliation remains unverified. Runtime operational health is an injected storage/lifecycle contract, not a deployed separate health HTTP listener.
- Per-file/depth/path/binary/truncation limits and the exact aggregate boundary are tested. Real synthetic filesystem cases retrieve 1,000 of 1,001 files and 305 of 306 files of 65,536 bytes, record one excluded path and never fetch its blob. These use provider doubles, not GitHub. Source policy remains partial for binaries/sensitive files and rejects stale default-branch commits.
- Metadata/evidence references are durable by design; no physical encrypted evidence object store or automatic retention purge is activated. Approval JSON files and credentials must be operator-owned/private; parser validation is not a substitute for filesystem trust.
- SQL remains unexecuted; Docker controls remain unproven; best-effort installation-token revocation is not a verified revocation guarantee. Windows POSIX modes alone are not an ACL sandbox.

Do not mark G01 COMPLETE or proceed to G02 using these fixture results alone.
