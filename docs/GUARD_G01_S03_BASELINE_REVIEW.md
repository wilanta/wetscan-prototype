# G01 / S03 baseline audit and integration recommendation

## Current finalization status - 15 November 2026

See [GUARD_G01_FINALIZATION.md](GUARD_G01_FINALIZATION.md) for the current audit, implementation, test results and exact remaining approval checklist. Overall **PARTIALLY COMPLETE**, real acceptance **BLOCKED**. Latest user explicitly authorizes candidate commit/push despite the known baseline Sentinel failure; the earlier publication hold below is historical and superseded. No Sentinel fix/assertion edit, G02, real SQL/provider/worker/container operation, merge or deploy is performed. Current old Guard HEAD is92ee6fa, preserved; do not restore historical7207a16 state. New producer is prepare_only, lease getter is now forwarded, snapshot request mismatch/concurrency and sandbox identity/evidence boundaries are fixed; earlier descriptions of missing implementations describe their historical phase.


## Integration recommendation executed as candidate - 15 November 2026

User explicitly authorized a new candidate worktree fromf7bfeef. It was created without changing the old Guard tree or master and received only the28audited Guard local delta files, not a replay of G01. Its actual migration plan matches the static previewb63e1e... below.707unit/typecheck/lint/build/42focused checks pass; original browser59/60pass. One unchanged S03validation race blocks publication, and the user expressly declined Sentinel changes and held commit/push. See [actual integration validation](GUARD_G01_S03_INTEGRATION_VALIDATION.md). No source/SQL/branch change is made to the old worktree; historical proposal-only text below describes the earlier audit, not current candidate absence.


15 November 2026 (Asia/Jakarta). **AUDIT_COMPLETE_STATIC / INTEGRATION_NOT_EXECUTED.** Overall G01 remains PARTIALLY_VERIFIED. Scope is the pinned Git comparison Guard `7207a16ad3a7640d48bd67719188642b27fb9be2` -> master `f7bfeef29488c3f997e9444555039514f55fa0a3`, including the current local Guard resolver/launcher changes. No source/SQL/test change is made by this audit. No branch change, merge, rebase, checkout, commit, push, PR, deployment, database connection, live worker/provider/sandbox operation or G02 is performed. No .env, credential or private approval file is read.

## Evidence and preservation

Local feature HEAD is7207a16 on feat/guard-g01-live-integration. At audit start27 existing modified/new paths were present, including untracked resolver/tests/preflight; all are preserved. Git diff7207a16..f7bfeef reports51 changed upstream paths. Comparing exact and ancestor/descendant paths found **zero path collisions** with those27. This is not proof of semantic compatibility and is not a merge dry-run. No merge/index operation was used.

Relevant changed shared paths: src/platform/queue.ts, new src/platform/job-admission.ts, worker/sentinel/executor.ts, worker/sentinel/lifecycle.ts, src/platform/migrations.ts, new migrations/sentinel/0003_detection.{up,down}.sql. Sentinel runtime/main/acceptance also changed; Guard imports neither their runtime scheduler nor handlers. Shared database/config/identity, frozen platform-contracts, Auth, Canvas, Guard committed paths, Guard SQL and dependency/lock files are unchanged between the two pinned commits. No additional package is required.

Read-only commands included:

- `git diff 7207a16..f7bfeef -- src/platform/queue.ts worker/sentinel/executor.ts worker/sentinel/lifecycle.ts src/platform/migrations.ts`
- `git show f7bfeef:src/platform/job-admission.ts` and the reviewed executor/migration/test source paths.
- `git ls-tree -r --name-only f7bfeef -- migrations/sentinel`
- `git diff --name-only` plus `git ls-files --others --exclude-standard` for local tracked/untracked path collision checks.
- Reads of local Guard source/tests and the G01 handoff/preflight.
 Hashes below were reproduced from normalized public SQL blobs with SHA-256, not by importing a database runner. No unreviewed commit code was executed and no database instance inspected.

## Queue audit

| Boundary | S03 change | Effect on current Guard | Required action |
| --- | --- | --- | --- |
| Constructor | Adds optional createdAtOrAfter fourth argument and JobAdmission fifth argument | Guard calls super(db,scope,[guard.scan.prepare]) with three args, so both are unset | Preserve this call; do not pass Guard's own onlyJobId as the base fourth argument (that slot is an ISO timestamp) |
| Admission | Nonempty admission requires module sentinel, exactly sentinel.telemetry.accepted, scope and cutoff | Passing it for Guard throws scope_denied; the type name alone does not make concrete admission module-neutral | Keep Guard-owned exact-job restriction; no shared admission relaxation is necessary |
| Claim/enqueue | Concrete base paths still read sentinel.project_bindings and Sentinel-only claim routing | Guard still needs its narrow overrides | Retain Guard enqueue/claim; do not call the Sentinel scheduler/acceptance worker |
| Heartbeat/complete/retry/cancel | Adds optional admission SQL/expiry checks and normal parameter passthrough | With admission absent, inherited ordinary Guard lease operations keep prior semantics | Test normal Guard path after integration; do not copy Sentinel acceptance parameters |
| Local onlyJobId | Guard override uses its own $9job-ID parameter and $5 reconciliation predicates | S03 base claim uses $9for cutoff; these belong to different overridden SQL statements | Do not combine the parameter arrays or replace local claim SQL with base claim SQL |
| Isolation | Module/role/scoped transactions and lease ownership remain | Guard role/proposed RLS/budget and no-Sentinel consumption remain necessary | Keep roles/policies separate and test wrong-module and other-job denial |

src/platform/job-admission.ts contains structurally reusable sealedAdmission/assertAdmission helpers, but its concrete PostgresQueue integration is explicitly Sentinel-only. Reusing those helpers is optional after alignment and does not replace Guard's repository/actor/session/commit/target approvals. Generalizing shared admission would be a separate owner-reviewed change, not required for this integration.

## Executor and lifecycle audit

S03 preserves JobHandler(job,signal). Its added LeaseAwareJobHandler(job,signal,currentLease) is used by executeLease; ordinary two-argument functions remain assignable. S03 explicitly contains legacy Guard-style wrapper and renewed-heartbeat revision test cases. This audit read their source; it did not rerun them against a combined tree.

Guard runtime's trackedHandler still invokes input.handler with two arguments. This causes no required signature fix with the reviewed S03 contract. S03 executor tracks renewed leases internally and uses the latest revision for queue settlement. Guard result writes separately check actual DB owner/token/expiry/cancellation under lock and compare scan revision, so retaining the original handler lease does not disable its fencing.

The new local bootstrap captures the initial claim lease; its IPC resolver checks expiresAt. If future handlers exceed that initial deadline, they can fail closed despite a renewed lease. Current Guard handler timeout20s is below the30s initial lease. Forwarding the additive currentLease getter through Guard runtime/bootstrap is a **recommended follow-up**, especially before longer-running engines, not a demonstrated compilation blocker or permission bypass. If adopted after alignment, make it Guard-only/backward-compatible, preserve existing two-argument injected handlers and add renewed-lease/cancellation/stale-token tests. Do not weaken expiry checks to accommodate stale data. No such source adaptation is applied here.

S03 adds acceptance_expired/acceptance_failure shutdown reasons. Guard owns guard.shutdown and its bounded lifecycle; no channel/type change is required. Do not reuse Sentinel acceptance configuration or activate a Sentinel worker as Guard.

## Migration and RLS audit

S03 adds0003_detection and corresponding Sentinel down handling. The source migrationPlan algorithm still discovers sorted versions and hashes normalized up+NUL+down plus the password-free role provisioning SQL. Guard guardMigrationPlan composes ordered Guard artifact hashes with that platform plan. It will automatically include0003after an approved baseline integration; no hardcoded two-version source patch is required.

Guard schema-readiness and schema-runner compare the exact platform version/checksum list, separately from guard.schema_migrations. Keep this strict comparison. A two-version Guard build must reject a three-version target. Never drop0003, edit the platform ledger, remove validation, reset Sentinel data or reuse an old approval to make versions match.

S03 creates Sentinel-owned detection tables/indexes/policies/grants; its reviewed up does not create a Guard schema/role, change Guard SQL or grant Guard access. No mandatory Guard DDL/RLS change was identified by this source audit. Effective privilege boundaries and preservation of detection rows still require real approved acceptance. Guard's independent0001_guard version/pair checksum does not need a new version merely because the platform baseline changed.

## Reproduced hashes: current vs static integration candidate

All hashes are lowercase SHA-256, UTF-8/LF normalization; JSON uses the same compact ordered property encoding as the reviewed source algorithms.

| Identity | Guard7207a16 baseline | Static candidate using platformf7bfeef + unchanged Guard SQL |
| --- | --- | --- |
| Platform versions | 0001_foundation,0002_telemetry | Same plus0003_detection |
| Platform plan | 9ceabe57b696fbe59bd51fb5939a197a378abed9c3084802850c4e9d632270f9 | c3e39f6fd43ee6eb2fbf5b244778955aab4cabb8a11ed3c66d791cf99a252a94 |
| Guard aggregate | 444596c4628d94f0824f98afcc960148662f55c691155e1092e0a11698101dfc | **b63e1e8568babcf8d7811fe0fa735ecbec11ade64df19bdea78deb030a85869d** |
| Guard up/down pair | 8bdea256cdd5ab79b1525f43bd40508acf25e57502a72162ae6b5233dd55693b | Unchanged |

New0003_detection pair checksum:4f0ee1cebdbdc81b835f719ef13c9cb703dfb5f440193765dfa0a61635fb6168. Existing0001/0002 pair checksums and provisioning roles are unchanged.

All five Guard file hashes remain unchanged:

| Guard artifact | SHA-256 |
| --- | --- |
| roles.proposed.sql | a0a4d924d8bd15ceb708f47ad9efff7e10df46ce0d99ff5c91a15077c6081645 |
| platform-access.proposed.sql | 1aa2d83eaba396d645e1ba684819a8999ab60eea49fb0bfc656eb175c5f7fb2d |
| platform-access.rollback.proposed.sql | d4025c6965fa1c23eac358d341a9bc51013090471e9403fcb22a08bd4332d52c |
| 0001_guard.up.sql | 542fa52a97c2b498b01ea06613a589c284e254ecd6de863574327d9780e18315 |
| 0001_guard.down.sql | 9e7b7f8f5b1f5bea5b53f9c8865695d20dfbf09769086e505bb3d1329edee3b3 |

The candidate is **not the current worktree's executable plan, migration approval, applied schema or integration result**. Reproduce it with the actual Guard plan command on the approved candidate tree before requesting exact-target approval. Any subsequent SQL/platform change invalidates the preview. Purpose-specific migration/app/worker approvals and launch permit must reference the final chosen aggregate; never silently edit existing approval records. This audit issues no real approval records.

## Changes needed on Guard

| Area | Mandatory for alignment? | Minimum next work |
| --- | --- | --- |
| queue.ts source | No confirmed required code rewrite | Preserve local overrides/exact-job filtering and three-argument base call; run inherited lease/settlement and isolation regressions on S03 |
| runtime.ts / bootstrap.ts | No required signature correction | Optionally forward the lease getter with backward-compatible tests; don't claim it is already forwarded |
| migrations.ts | No hardcoded algorithm change | Include the reviewed0003source through baseline alignment and regenerate actual plan |
| schema-readiness.ts / schema-runner.ts | Preserve current checks | Confirm exact three-version platform ledger plus independent Guard ledger; reject old-plan approvals before mutation |
| database-config.ts / approval.ts | Preserve strict gates | New actual target/action/role/expiry/aggregate approval packet; no credential inspection |
| tests/guard/g01 | Combined evidence required | Add/execute S03 constructor/default/admission denial, lease revision and old-plan rejection cases without removing existing tests |
| docs/approval packet | Yes | New expected ledger/aggregate, reviewed S03 preservation observer and actual combined results |
| Guard or Sentinel SQL/shared source | No mandatory edit found | Keep unchanged unless actual combined tests reveal an independently reviewed need |

## Safe integration recommendation (proposal only)

Prefer a **new isolated integration candidate worktree/branch rooted at exactf7bfeef** after the user explicitly authorizes candidate creation and the exact file-copy/application method. Preserve the current dirty Guard worktree unchanged. Before copying anything, capture an explicit tracked+untracked Guard manifest/hashes and a recoverable patch/copy for all local work; exclude env/private records. Apply only the reviewed local Guard delta on the candidate. Master already contains7207a16; do not replay/cherry-pick the entire original G01 implementation, overwrite S03 shared files, stash/reset the dirty tree or replace its directories wholesale.

This is recommended over an immediate merge/rebase inside the dirty Guard tree. **No candidate worktree/branch, Git integration, backup, copy or cherry-pick is created by this audit.** Current no-merge/no-publication restrictions remain. If a future master differs, re-audit its exact SHA rather than treatingf7bfeef as permanently current.

On an authorized candidate, inspect actual combined source, then execute existing safe unit/typecheck/lint/production build plus Guard/Auth/Canvas/Sentinel browser fixtures using dotenv-disabled/sanitized launchers. Include S03-specific non-DB tests, Guard exact-job claim/failed-reconciliation filtering, inherited normal heartbeat/retry/complete/cancel, wrong-module denial, latest-lease and cleanup behavior. Add an old-aggregate approval rejection test with a recording pool that must not connect. Keep assertions, original test cases and fixture evidence; no destructive database suite.

Run `node --import tsx worker/guard/plan.ts` from that actual candidate to reproduce the final three-version plan. Compare all five unchanged Guard artifact hashes and review unexpected differences. Refresh documentation/approval packet; obtain separate exact target/environment/marker/actions/role/expiry and preservation approval. Only then may the specifically approved Guard DB/source/worker/sandbox acceptance operations proceed. Add before/after comparisons for S03 detection tables and protected historical jobs without giving Guard broad Sentinel rights. Never mutate a populated historical acceptance DB or downgrade its ledger.

## Updated G01 blocker checklist

- [x] Audit pinned7207a16 vsf7bfeef queue/executor/migration contracts and local path overlap (static only).
- [x] Calculate old and candidate migration hashes without checking out/executing target code or opening a DB.
- [x] Record preservation strategy and minimum Guard changes; retain all current local implementation/tests.
- [ ] **B01 Owner instruction:** approve an isolated candidate creation/alignment method and exact baseline; no merge/master modification is currently authorized.
- [ ] **B02 Combined verification:** actual S03+local Guard tree, affected regression tests/typecheck/lint/build/browser results; prior567tests do not prove this.
- [ ] **B03 Final plan/approvals:** regenerate candidate's actual plan and obtain new exact target/marker/operations/role/expiry approvals and S03-aware preservation observer.
- [ ] **B04 PostgreSQL/RLS:** approved fresh target provisioning/migration idempotence/role boundaries/transaction durability/lease fencing and Sentinel before-after preservation; no historical DB reset.
- [ ] **B05 GitHub:** explicit repository/account/workspace/project/actor/current commit source-read approval and real integrity/coverage/revocation/cleanup evidence.
- [ ] **B06 Sandbox:** operator-approved enforcing runtime/image/spec/private source permissions and actual no-network/secret/socket/resource/timeout/cleanup proof.
- [ ] **B07 Connected worker:** actual private Auth-owner invocation with approved independent app/worker roles and exact job, real lease/retry/cancel/crash/restart/cleanup evidence; one-job composition is not a daemon or durable Auth binding.
- [ ] **B08 Operations:** approved orphan supervision/retention/evidence decisions, final evidence/handoff and user's explicit G01 acceptance. G02 requires a separately supplied prompt/start instruction.

## Validation limit

This turn performs scoped source review, static checksum reproduction, local path-collision analysis and whitespace/preservation checks only. No combined build/test or real acceptance was run. Prior567unit/Guard5/Auth21/Sentinel5 results remain evidence of the existing7207a16-based worktree, not of S03+new local changes. Compilation/runtime compatibility remains a gate until the actual candidate is validated.
