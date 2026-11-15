# Guard G01 acceptance preflight - follow-up review

## Current finalization status - 15 November 2026

See [GUARD_G01_FINALIZATION.md](GUARD_G01_FINALIZATION.md) for the current audit, implementation, test results and exact remaining approval checklist. Overall **PARTIALLY COMPLETE**, real acceptance **BLOCKED**. Latest user explicitly authorizes candidate commit/push despite the known baseline Sentinel failure; the earlier publication hold below is historical and superseded. No Sentinel fix/assertion edit, G02, real SQL/provider/worker/container operation, merge or deploy is performed. Current old Guard HEAD is92ee6fa, preserved; do not restore historical7207a16 state. New producer is prepare_only, lease getter is now forwarded, snapshot request mismatch/concurrency and sandbox identity/evidence boundaries are fixed; earlier descriptions of missing implementations describe their historical phase.


## Current actual integration candidate - 15 November 2026

Candidate feat/guard-g01-s03-integration was explicitly authorized and created fromf7bfeef in a new worktree. Only28audited local Guard delta files were copied; the old7207a16Guard worktree and all its changes remain untouched. Actual combined checks:707units/typecheck/lint/build/42focused contracts PASS; existing browser gates59/60PASS,1S03 invalid-JSON UI race FAIL. Read [integration validation](GUARD_G01_S03_INTEGRATION_VALIDATION.md) for exact commands/evidence and the updated B01-B08 checklist.

**Current publication blocker:** user instructed "Jangan ubah Sentinel; tahan commit/push dan laporkan blocker." No proposed Sentinel patch is applied and no staging/commit/push occurs. The candidate HEAD remainsf7bfeef; there is no new implementation commit. Prior conditional publication permission is on hold. G02 not started.

Actual candidate aggregate:b63e1e8568babcf8d7811fe0fa735ecbec11ade64df19bdea78deb030a85869d, saved in GUARD_G01_S03_MIGRATION_PLAN.json. This now replaces the static-preview status FOR THIS CANDIDATE only; old Guard worktree still has its old plan. SQL/role/source/runtime approvals and all Live acceptance remain open; the plan grants no DB permission.


## Latest pinned S03 baseline audit - 15 November 2026

Read [GUARD_G01_S03_BASELINE_REVIEW.md](GUARD_G01_S03_BASELINE_REVIEW.md) for the current B01-B08 blocker checklist and safe candidate-worktree recommendation. Static audit of7207a16 ->f7bfeef found no local path collisions or mandatory Guard queue/executor signature rewrite. Concrete S03 queue admission remains Sentinel-only; keep Guard's overrides/exact-job filter. Fresh-lease getter forwarding is a recommended Guard-only follow-up, not an already implemented change.

Five Guard SQL hashes and the Guard up/down pair stay unchanged. Because0003_detection changes the platform plan, static candidate Guard aggregate is b63e1e8568babcf8d7811fe0fa735ecbec11ade64df19bdea78deb030a85869d; current executable local aggregate remains444596c4628d94f0824f98afcc960148662f55c691155e1092e0a11698101dfc. The candidate is NOT applied/approved/combined-tested. No source/SQL/Git integration/runtime operation is performed; existing work remains local and intact. Overall PARTIALLY_VERIFIED; G02 not started.


## Latest continuation after reported Wil approval - 15 November 2026

User reports "Approve mas, aman." Code/review continuation is authorized; no database/infrastructure/source-target/runtime permission is inferred. A concrete Auth-process private-IPC resolver and bounded one-job prepare-only launcher are now implemented and fixture-tested; they are not activated. Read [GUARD_G01_WORKER_AUTH_REVIEW.md](GUARD_G01_WORKER_AUTH_REVIEW.md) for exact permit/actions, transport/security model, tests and limits. Direct CLI/general approval is denied before DB config; no secret/DB/provider/container access occurred.

567 units/typecheck/lint/build and Guard5/Auth21/Sentinel5 fixture browsers pass on Guard HEAD7207a16 plus local changes. Overall remains PARTIALLY_VERIFIED. Actual DB/RLS/preservation, GitHub, connected-worker and sandbox acceptance are open. The historical interface-only worker descriptions below predate this continuation and are preserved.

**New baseline gate:** master advanced externally to f7bfeef (S03), changing shared queue/executor and adding0003_detection. No merge/rebase is performed. The two-version local plan/hash below must not be used on an S03 target. Baseline alignment needs explicit owner instruction, reviewed compatibility, regenerated hashes and renewed exact-target approvals before runtime. G02 is not started.

## Preserved earlier preflight


15 November 2026 (Asia/Jakarta). Status **PARTIALLY_VERIFIED / LIVE ACCEPTANCE BLOCKED**. This is G01 preparation only. G02 has not been supplied/started; a merge is not acceptance authorization. No .env, credentials or ignored approval/secret records were opened. No database connection/mutation, real GitHub repository request, worker startup, image pull/container/scanner execution, commit/push/PR/merge/deploy was performed in this review.

## Verified Git state

| Worktree | Branch | HEAD | State at review start |
| --- | --- | --- | --- |
| C:/laragon/www/wetscan-2/wetscan-prototype | master | 12b843e2dfda82b3d806625983836fe2ada9ce0f | Clean |
| C:/laragon/www/wetscan-2/wetscan-guard-g01 | feat/guard-g01-live-integration | 7207a16ad3a7640d48bd67719188642b27fb9be2 | Clean |

Local Git history records 7207a16 (feat(guard): implement G01 live integration) and merge12b843e (Merge pull request #5). The two HEAD trees are identical (`git diff --stat 7207a16..12b843e` returned no changes). These changes occurred after the original implementation handoff; this agent did not publish them. No rebase/merge/switch/reset/clean is needed. Continue in the Guard worktree. The old handoff's uncommitted cd313ce statements describe its historical implementation phase and are not current Git state.

## Acceptance gates

| Gate | Current evidence | Still required |
| --- | --- | --- |
| Authorized GitHub snapshot | Source adapter and source-only approval gate exist; exact-identity/expiry gate tests pass using synthetic inputs | Explicit approved repository/account/workspace/project/actor/origin/current SHA, bounded source-read/temp-write/cleanup scope; actual integrity/partial-coverage/cleanup and revoked/unauthorized results |
| PostgreSQL/RLS | Five migration artifacts and aggregate hash still match the reviewed plan | New exact target/environment/port/marker and artifact/role/platform-owner approval; real migration up/up, role/RLS, rollback, durable state/leases; no historical populated test DB reset |
| Sentinel preservation | Shared Auth/Canvas/platform/Sentinel source unchanged in G01; H01 documents past Sentinel acceptance | Owner-reviewed read-only before/after observer around any approved Guard database operation; no Sentinel records/policies/budgets changed |
| Worker + resolver | WorkerAuthorizationResolver is an interface; main.ts still refuses activation; lifecycle fixture tests pass | Trusted resolver/broker design review and concrete process bindings, then approved real queue claim/crash/restart/fencing/retry/cancel/outage and preservation evidence |
| Real sandbox | Docker CLI found; read-only server-version probes on default Windows and Desktop Linux named pipes both exited1 | Operator-managed enforcing daemon, reviewed digest-pinned trusted probe image/spec, attestation, private source readability/ACL/UID, actual isolation/resource/network/cleanup tests |

No new Guard Live acceptance evidence was found in the reviewed G01 documents. docs/SENTINEL_H01_ACCEPTANCE.md is historical Sentinel-only evidence; its earlier approvals, real PostgreSQL tests and worker lifecycle success neither authorize nor verify Guard. Its older Docker evidence also does not establish current sandbox availability.

## Checks performed now

- `git status --short`, `git branch --show-current`, `git rev-parse HEAD`, `git worktree list`, local `git log`, and Guard-vs-master tree comparison: clean starts and isolated branch confirmed. No remote access/fetch.
- `node --import tsx worker/guard/plan.ts`: PASS, PREPARATION_ONLY/databaseMutation NOT_EXECUTED. Guard aggregate remains `444596c4628d94f0824f98afcc960148662f55c691155e1092e0a11698101dfc`; platform plan remains `9ceabe57b696fbe59bd51fb5939a197a378abed9c3084802850c4e9d632270f9`. All five file hashes match GUARD_G01_MIGRATION_REVIEW.md.
- `node --require ./tests/auth/skip-dotenv.cjs ./node_modules/vitest/vitest.mjs run tests/guard/g01/security.test.ts tests/guard/g01/source-acceptance.test.ts tests/guard/g01/sandbox.test.ts tests/guard/g01/worker.test.ts`: **16 passed,4files,0failed/skipped**,743ms. SQL/provider/Docker/control dependencies are synthetic doubles; this is not real acceptance. Tests do not start connected workers or containers.
- Read-only Docker probes used the observed absolute docker.exe, an isolated nonexistent --config directory, explicit npipe:////./pipe/docker_engine and npipe:////./pipe/dockerDesktopLinuxEngine, `version --format {{.Server.Version}}`, sanitized environment and8s timeout each. Both returned exit1 with no server version. No stderr/config/credentials were exposed. This proves those endpoints were unavailable to these probes; it does not enumerate every possible Docker endpoint or prove no other engine exists.
- The initial sandboxed Python launch was denied and tsx failed at uv_os_get_passwd/ENOMEM before the plan ran. Rerunning the same read-only preparation outside the sandbox succeeded through tool approval; no application code was changed to bypass checks.
- Prior 547-unit/typecheck/lint/build/browser results are historical implementation evidence. They were not all rerun for this documentation-only follow-up. No runtime PASS is inferred from them.

## Concrete approval packet to complete before execution

The following are required non-secret fields, **not a granted approval**. Do not invent values or treat this checklist as authorization.

1. Database: operator/environment, exact loopback host/port/new database/marker, fresh-target creation permission if needed, PostgreSQL version/baseline, reviewed five hashes and aggregate, purpose-specific role bootstrap/platform extension/schema-up/runtime/integration_test operations and expiry. Suggested fresh acceptance database: wetscan_s01_test_guardg01. Existing populated wetscan_s01_test and old Sentinel approvals are excluded. No automatic down/reset/delete. Role credentials are provisioned privately by the operator, not sent in chat or read by the agent.
2. Preservation: owner-approved read-only Sentinel schema/ledger/rows/budget/role observer, exact pre/post comparisons and failure stop conditions. The Guard-specific acceptance script alone does not establish full preservation.
3. GitHub: exact repository ID/name, existing server-derived project/workspace/actor and origin, current authorized40-character HEAD, approval window <=1hour, limits1,000files/65,536bytes per file/20,000,000bytes/depth16, only snapshot_read/temporary_artifact_write/cleanup. Use the existing session; do not request cookie/token/key values. Source acceptance is separate from scan creation.
4. Auth/platform handoff: review a mechanism that reuses the existing Auth process for current user/session/repository revalidation and gives the worker only narrowly scoped, expiring, lease/actor/project/repository/commit-bound authority. No raw browser cookie/OAuth/installation token in queue persistence; no second-process direct refresh of the Auth filesystem store. Specify revocation, logout, retries, transport trust and cleanup before implementation. Identify any shared files requiring explicit owner approval; do not invent a second Auth implementation.
5. Sandbox/platform handoff: operator-approved daemon endpoint, reviewed probe image digest/spec/executable/arguments, service UID/private source ACL and mount mapping, mandatory expiring proof of controls and bounded acceptance operations. No arbitrary source/build/hooks, image pull, daemon changes or host fallback without their applicable authorization.

## Execution order after the applicable explicit approvals

Complete independent GitHub source-only acceptance and worker-authorization review as authorized. On the exact fresh approved database: verify target/marker/roles and baseline first, capture Sentinel observer baseline, apply only reviewed operations, verify migration idempotence/RLS/leases/rollback/durability and compare preservation observer. Stop the affected operation if any identity/hash/preservation check fails; do not reset data to obtain a pass. Prove actual sandbox controls with trusted fixtures before untrusted source, then verify the approved connected Guard worker with its concrete resolver. Record actual evidence and update acceptance status. G01 can be accepted only after its gates close; G02 additionally needs the user's actual Markdown and explicit start instruction.

## Files changed in this follow-up

Documentation only, all in the Guard worktree:

- docs/GUARD_G01_ACCEPTANCE_PREFLIGHT.md (this file)
- docs/GUARD_G01_VALIDATION.md (add follow-up evidence link, preserve prior results)
- docs/GUARD_IMPLEMENTATION_STATUS.md (add current Git/acceptance note)
- docs/agent-handoffs/HANDOFF_GUARD_G01.md (add current Git/acceptance note, preserve historical handoff)

No source, tests, dependencies, SQL, Auth, Canvas, dashboard or Sentinel file changes.
