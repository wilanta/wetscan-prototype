# Sentinel S03 handoff

## Current S03 final publication review - PASS on Guard G01 baseline, 15 November 2026

Owner authorization: attachment `eb8e2d77-ac7a-49be-9778-5b3e117a5abc`, integrating only the exact approved Guard G01 master and publishing the reviewed S03 branch/PR. This supersedes the earlier concurrency stop solely for that commit. The earlier blocked publication preflight and all phase failures below are retained historical records, not the current status. No merge, S04, database connection/migration/fixture replay, live worker/emitter/scanner activation or manual deployment is authorized or performed during this finalization.

### Preservation and exact fast-forward

Verified existing branch `feat/sentinel-s03-detection-alerts`, old HEAD `cd313ce29aeac865e15cea9abd9c412cb9c2c3cc`, exactly 51 modified/new public S03 files, zero staged. Before branch mutation, every file was copied byte-for-byte with SHA-256 manifest plus the tracked binary-capable patch into a NEW restricted private recovery directory outside Git/OneDrive. All 51 copied files were independently rehashed. The fetched approved master `12b843e2dfda82b3d806625983836fe2ada9ce0f` contains Guard G01 PR #5 / implementation `7207a16ad3a7640d48bd67719188642b27fb9be2`. Old HEAD is its ancestor; no exact or ancestor-path collision exists between its 56 changed paths and any tracked/untracked S03 path.

`git merge --ff-only 12b843e2dfda82b3d806625983836fe2ada9ce0f` succeeded without a merge commit, rebase, reset, stash, forced checkout or lost work. Immediately afterward HEAD equaled that approved master, all 51 original fingerprints matched exactly, all 56 Guard paths matched master and zero files were staged. That is the publication base, not the eventual S03 implementation commit. Guard changes are already in the PR base and must not appear as S03 changes again. Subsequent changes are only the two reviewed S03 compatibility files and these Sentinel reports; recovery copies remain intact privately.

### Combined compatibility audit and minimal fix

Guard G01 adds optional snapshot/source-coverage fields and an optional AbortSignal to SnapshotPort; it preserves Scope/Mode and SentinelPort/InventoryItem shapes imported by frozen Sentinel contracts. Existing Auth/Canvas derivation, workspace/project mapping, repository authorization and Demo separation remain. Guard uses its own module/role/queue admission, proposed schema/role/platform SQL and worker entrypoint. Sentinel migrationPlan remains fixed to migrations/sentinel and unchanged Sentinel role provisioning; Guard proposed SQL cannot silently enter its approved plan. No Guard role, migration, sandbox, source acceptance or scanner integration was activated.

Guard's queue subclass inherits normal lease/complete/retry operations with no Sentinel acceptance admission. S03 admission is optional, Sentinel-only, exact-target/marker/plan/project constrained, 1-12 sealed new IDs, disjoint eight protected IDs, explicit opt-in and expiry <=10 minutes, with real DB pre-start identity checks, SQL ID/expiry claim/mutation predicates and stop-on-expiry. It skips all retention only in that approved local acceptance; normal defaults retain maintenance. It does not grant privileges, change RLS or expose a browser toggle. The previously consumed local approval records remain closed and opt-in flags disabled; no live activation was rerun here.

Fresh combined typecheck initially failed at `worker/guard/runtime.ts(56,53)`, TS2554: S03 had added a required third callback argument to the exported JobHandler type, while Guard's existing tracking wrapper calls it with two arguments. The smallest fix is confined to `worker/sentinel/executor.ts`: preserve JobHandler's original `(job, signal)` signature; add LeaseAwareJobHandler `(job, signal, currentLease)` for executeLease. Two-argument handlers remain assignable, while S03's handler receives the mandatory latest lease getter. Runtime executor behavior is unchanged: it already supplies that getter. No optional unsafe getter, cast, authorization relaxation, Guard edit or frozen-contract change.

Two new cases in the existing `tests/sentinel/runtime-isolation.test.ts` compile and execute a Guard-style two-argument wrapper and verify that the lease-aware callback sees a renewed heartbeat revision. A narrow test-double annotation initially failed TS2322 because the helper inferred module='sentinel'; explicitly typing the new fixture as the existing JobLease contract corrected that test-only error. Both failed typecheck logs are retained. No test assertion, deadline or security requirement was weakened. Focused executor/Guard worker/isolation tests passed 34/34. Full suites pass below. No migration SQL/hash or executable detection/queue behavior changed, so real PostgreSQL suites were intentionally not rerun.

### Fresh combined validation - actually executed

| Check | Fresh observed result |
| --- | --- |
| Full unit/contract suite | 680/680 PASS, 49 files, 8.04s, exit 0; includes Guard G01 and all existing Auth/Canvas/Guard/Sentinel/platform suites |
| Focused executor/worker/isolation regression | 34/34 PASS, 4 files, 1.75s, exit 0 |
| Typecheck | PASS exit 0 after the documented interface/test-fixture correction |
| ESLint | PASS exit 0 after the final source/test formatting |
| Production build | PASS exit 0; normal Next compilation/typechecking with private dotenv excluded; Guard browser runner also rebuilt the same combined source successfully |
| S03 detection browser fixtures | 6/6 PASS, 23.2s, exit 0 |
| S02 telemetry browser fixtures | 5/5 PASS, 28.5s, exit 0 |
| Original application browser fixtures | 6/6 PASS, 2.5min, exit 0 |
| Canvas map/layout/browser regressions | 17/17 PASS, 2.8min, exit 0 |
| Auth/onboarding/GitHub/Canvas provider fixtures | 21/21 PASS, 1.3min, exit 0 |
| Guard original/G01-readiness browser fixtures | 5/5 PASS, 35.0s, exit 0 |
| Total browser regressions | 60/60 PASS, no retries, no changed test expectations/timeouts |
| Offline migration plan | Same c3e39f6fd43ee6eb2fbf5b244778955aab4cabb8a11ed3c66d791cf99a252a94, databaseConnections=0 |

Commands: `node node_modules/vitest/vitest.mjs run`, `node node_modules/typescript/bin/tsc --noEmit`, `node node_modules/eslint/bin/eslint.js .`, `node node_modules/next/dist/bin/next build`; standard Playwright CLI with configs tests/sentinel/detection.playwright.config.ts, telemetry.playwright.config.ts, playwright.config.ts and tests/guard/g01/canvas-regression.config.ts. Auth and Guard suites use reviewed private copies of the existing runners with only repository-root resolution and output paths redirected; tests/fixtures/assertions are unchanged. Existing skip-dotenv behavior and environment scrubbing exclude private Auth/GitHub/Sentinel/Guard/PG configuration. Original screenshots run from a private CWD with absolute module resolution. Private logs/artifacts/results and the recovery copy stay outside repository and synchronized directories. No code/source change followed the passing final build/type/lint/full-suite results except documentation. Ephemeral fixture servers/processes are distinct from live application/worker activation and use provider/SQL/queue doubles. No real scanner, PostgreSQL or external notification was invoked.

The first combined unit run passed 678/678 before adding the two new compatibility tests. Preserve both original TS2554 and test-fixture TS2322 failures alongside the passing final runs. A separate read-only GitHub metadata helper initially wrote current sanitized metadata to an old ignored S02 evidence filename; the original 391-byte S02 record was recovered from its original execution evidence, with current metadata retained privately. Helper output now uses new exclusive private filenames. No public code/data/credential changed through this logging error. GitHub CLI was unavailable; read-only protection metadata used the existing credential helper in memory, never exposing or committing its token.

### Retained database/runtime evidence - not freshly rerun

Actual private H03B case-results/execution records were read from disk and agree with the reports: 24 PASS, 0 FAIL, 0 SKIPPED, runner exit 0. H03C-1 DEV applied the reviewed 0003 up/up idempotently. H03C-2 retained proof shows six controlled events/jobs completed once, two actual persisted alerts and real authenticated UI, two graceful worker exits 0 (22ms/20ms), all 33 historical rows unchanged and all 58 added rows attributed, with roles/grants/RLS/catalog/ledger unchanged. Its cleanup proof records revoked credential HTTP 401, source/rules disabled, new heartbeats stopped, closed approvals and disabled isolation flags. Those real PostgreSQL/authenticated observations remain historical. Fresh combined validation proves safe code/fixture compatibility, not new live Guard or DB acceptance. No historical queued job was processed in publication.

Known limitations remain: actor-based authentication correlation unsupported; source-scoped fixed UTC windows rather than actor/sliding correlation; no native credential TTL (the acceptance credential was explicitly revoked); legacy platform-health labels; no new Linux-signal, forced-crash, second-account or deliberately induced real-outage UI acceptance. No S04 incident pipeline, external notification, automated response or production monitoring is implemented/activated by S03. Guard G01's merged code and passing fixture suites do not establish its separate real database/sandbox/scanner acceptance.

### Publication and owner decision boundary

All 51 public candidates remain in S03 scope relative to the approved master; exact manifest follows in the handoff. Auth, Guard G01, Canvas, Guard worker, shared dispatcher, original Demo body, frozen S00 contracts, 0001/0002 SQL and role provisioning are unchanged. Before commit, whole-file and staged-blob real-secret/pattern, operator-path, ignore, whitespace and private build-trace checks must pass, with only explicit manifest paths staged. The recovery copy includes all original public files, never credentials/private runtime records.

Read-only GitHub metadata at 2026-11-15T05:16:04Z: master equals the approved base, protected=false; protection endpoint 404; active branch rules empty. No required checks/reviews were advertised by those endpoints. PR check-runs/statuses/mergeability must be read after publication; no pending/missing check is a pass and Vercel preview cannot prove PostgreSQL security. No manual deployment or cloud/local DB configuration is authorized. Actual implementation commit SHA, PR URL, head/base SHAs and final CI observations are recorded in the PR and final publication response once they exist; this pre-commit handoff cannot name its own future commit SHA. Do not make extra commits solely to insert that metadata.

Current gate: ready for reviewed staging/commit/push/PR under the owner's explicit authorization, conditional on final safety checks and master remaining exactly the approved base. Do not merge the PR, deploy or begin S04. Subsequent reader should resolve the actual PR/commit from GitHub or the final response, not treat this pre-commit status as proof of publication.

## Historical phase records (retained verbatim)

All statuses below describe their named earlier phase. The current publication review above supersedes earlier pending or blocked summaries.

## Final publication preflight ? BLOCKED by concurrent master change, 15 November 2026

Owner authorization was received from attachment `6c7742f5-96d7-4e5c-9a4f-a9c663831dde` for review, fresh non-destructive checks, commit/push and a PR only. It explicitly requires: "If an unrelated concurrent change or conflict is found, stop publication and report it." No merge, database operation, runtime activation, deployment or S04 work is authorized.

Fresh `git fetch origin master` succeeded. Local feature branch remains `feat/sentinel-s03-detection-alerts` at `cd313ce29aeac865e15cea9abd9c412cb9c2c3cc`; fetched master is now `12b843e2dfda82b3d806625983836fe2ada9ce0f`, merge PR #5 for Guard G01 (`7207a16ad3a7640d48bd67719188642b27fb9be2`). That concurrent integration changes 56 paths, including Guard contracts, live persistence/queue/database code, proposed Guard SQL and worker implementation. There is no direct path overlap with the exact 51-file S03 manifest. No merge/conflict test or combined-baseline validation was performed; disjoint paths alone do not prove integration compatibility.

All 51 S03 candidates match the previous exact manifest. Every non-document source checksum matches H03C-2 final review. Original work is preserved, zero files staged. The feature branch was not advanced, reset, rebased or merged; no commit, push, PR or deployment occurred. No database connection, migration, acceptance suite, worker, emitter, scanner or live app was started in this publication phase.

Fresh typecheck/lint/unit/build/browser validation was NOT RUN after the concurrency gate blocked publication. The earlier 620/620 units, 17/17 fixture browsers, 24/24 H03B PostgreSQL cases and genuine H03C-2 DEV acceptance remain historical evidence, not freshly verified against Guard G01 master. The S03 final review/publication is incomplete; no CI/mergeability status is claimed for a nonexistent S03 PR.

Proposed next step, requiring owner confirmation of the changed baseline: review the Guard G01 integration boundary, advance the existing S03 branch to the fetched master with a fast-forward only if it remains safe and preserves all 51 changes, then complete the full S03 review and fresh non-destructive regression gates before staging/commit/push/PR. Do not infer this confirmation from the earlier authorization or automatically integrate the concurrent change. No database/runtime or S04 permission is implied.


**H03C-2 PASS — bounded real DEV acceptance, 15 November 2026.** Actual Auth/Canvas-authorized HTTP ingestion, PostgreSQL queue/detection/alerts, isolated worker, authenticated Alerts UI, restart, cleanup and historical preservation passed. This is controlled synthetic telemetry, not an observed attack or active production monitoring. S03 remains uncommitted/unpublished; final publication requires separate owner authorization. H03B 24/24 TEST acceptance is prior evidence, not rerun here. No S04.

Base and current HEAD: `cd313ce29aeac865e15cea9abd9c412cb9c2c3cc`. PR #4 was independently verified merged through GitHub; last H03C-1 fetched `origin/master` equaled this SHA; H03C-2 did not fetch and does not claim a fresh remote state. Branch `feat/sentinel-s03-detection-alerts` was created in the existing clean checkout. No worktree, clone, commit, push, PR, merge or deployment was created for S03. Existing remote `origin/modul-guard` and the Canvas worktree were inspected by identity only and left untouched. Parallel unpushed Guard work is unknown.

Owner source: attached **WETSCAN SENTINEL — S03: DETERMINISTIC DETECTION RULES & DURABLE ALERTS**, attachment `83c5cd22-2898-4f7d-b6f0-23e9ba68e452`. This explicitly authorizes code/SQL/review and independent testing, and requires separate database mutation, worker/runtime and publication approvals. Historical S02 approval is not S03 permission.

## Historical evidence preservation

Read `HANDOFF_S02.md` and its reports. Prior S02 local target was owner-approved `wilanta/portfolio`, project `github-998736528`, workspace `github-user-187839747:test`. Eight controlled events, six receipts and eight queued jobs remain historical evidence. Keys revoked/source disabled/app-worker-emitter stopped. No replay, cleanup, reactivation or database connection has occurred during S03 preparation. Prior PostgreSQL and real Auth/HTTP/UI results are not new S03 acceptance.

## Design and reuse

Reuse the existing PostgreSQL approval/pool/transactions, S01 queue leases/fencing/retries/executor/lifecycle, S02 redacted events and fresh Auth/Canvas project authorization. New Sentinel-owned rule definitions and versions, audit, evaluation, alerts/evidence/cooldown/suppressed evidence use composite keys and FORCE RLS. Immutable versions retain exact historical definitions. Drafts are seeded only by an explicit authorized API operation; nothing auto-enrolls or backfills.

UTC tumbling windows are start-inclusive/end-exclusive; ingestion deadline is window end + 300 seconds inclusive. Processing delay never substitutes local time for event occurrence. Correlation is per source/project/provenance. **Actor-based authentication rule is an unsupported draft** because S02 discards even supplied hashes. No unrelated actors are grouped. Other examples: explicit suspicious-path reason, accepted decoy wire event with controlled provenance, repeated normalized HTTP >=400 responses.

Explicit suppression uses event-time anchor windows; cooldown uses recorded database processing time. Suppressed matches have audited outcomes and real linked evidence; no incident or notification is generated. Evaluation history and alert deduplication persist across retries. Worker writes lock binding and active job, validate owner/token/expiry/cancellation before and after effects, commit atomically, then let the existing executor acknowledge separately. A crash in between retries against durable evaluation identities.

Default detection processing is off. New private runtime approval must contain an exact live project and cutoff no earlier than approval; `SENTINEL_DETECTION_ENABLED=1` alone is insufficient. Queue eligibility and expired-lease housekeeping honor that cutoff. The eight old jobs must not be processed without a separate reviewed replay plan.

## Persistence, retention and integration inventory

- Rule definitions/commands: `detection/model.ts`, `validation.ts`, `seeds.ts`. Schema1;25rules/project;100immutable versions/rule;25rule bulk processing cap; draft/enabled/disabled transitions and optimistic revision. Unsupported actor hashes cannot be enabled. Seed API is idempotent/opt-in only. S00 reserved `Alert`/`RuleRef` types remain frozen; concrete S03 `SecurityAlert`/`DetectionRule` are additive.
- Pure evaluator/time: `evaluator.ts`, `time.ts`. Fixed UTC buckets, exact activation/late database microseconds, stable scoped/versioned match identity and evidence ordering, bounded500candidates,8ANDconditions, cancellation and explicit overflow failure. Missing/unavailable fields are not invented. Source/provenance separation is not actor attribution; boundaries can split a pattern that a future rolling-window policy would join.
- Durable store: `store.ts` manages definitions/audit, exact fixed-window alert cursors, redacted details and fenced evaluation/alerts. Full source/event composite FKs; alert dedupe is per rule-version/source/correlation/bucket. Rule/cooldown/suppressed state persists, never in an in-process detector array. Current enabled versions apply only after activation; disabling/editing/enabling creates fresh version identity/cooldown.
- Schema: eight Sentinel tables and16FORCERLS policies. All proposed runtime grants are to existing dedicated roles, no role changes. App cannot insert/update alerts/evidence; worker cannot mutate rules/audit or read source credentials. New detection RLS requires exact scope/module; existing worker maintenance access to S01/S02 remains intentionally trusted module-wide. It is not a tenant-facing credential.18new indexes, including one event-time index on S02; no historical SQL rewrite.
- Retention:30days derived records, legal hold, pending-job pins, restrictive event links, bounded100-evaluation/100-alert/100-cooldown passes; versions/audit retained. Suppressed evidence released before expired evaluations; alert links before expired alerts. S02 cleanup skips alert/evaluation/suppressed references. No live cleanup ran; approved H03B fixture writes are recorded below. Future S04 must extend evidence pins for incident ownership before activating incident retention.
- Worker: existing separate Sentinel process, current-lease callback, explicit Sentinel module/kind/subject checks, binding/job locks, active token/owner/expiry/cancellation before and after effects, then acknowledgment by existing executor. Commit-before-ack replay is idempotent. Leases/attempts persist in S01; failed detection rolls back and becomes a redacted handler failure/retry, not a no-match. No Guard framework, scanner or external delivery.
- Activation: environment flag defaults0 and cannot substitute for an exact-target runtime approval extension `{mode:"live",workspaceId,projectId,notBefore,processNewTelemetry:true}`. Cutoff must be >=approval timestamp; only approved scope/new jobs can be claimed/aged. Old eight H02 jobs remain queued. Main worker has not been started. Health distinguishes enabled/disabled detection and unprobed web ingestion; legacy platform telemetry field remains documented.
- APIs/UI: fresh existing Auth/Canvas authority; no new auth flow or shared dispatcher. `/rules` GET/POST includes details/history/audit; `/alerts` GET includes source/rule/severity/time filters, exact cursors and evidence. Same-origin writes/8KiB limit/no-store/sanitized failures. Narrow Sentinel live route/view adds rules/alerts; original Demo body is preserved. No incident/response/provider UI or fabricated live rows.
- Shared changes: optional queue creation-time eligibility was necessary because original kind-only claims would consume old jobs; cutoff applies to expired-attempt housekeeping too. Migration runner adds empty-only0003 reversal without weakening0001/0002. `.local/sentinel/**` ESLint ignore excludes private evidence, preserves old helper files and checks all public files.

## Final migration review and actual approval state

Plan `c3e39f6fd43ee6eb2fbf5b244778955aab4cabb8a11ed3c66d791cf99a252a94`; 0003 pair  `4f0ee1cebdbdc81b835f719ef13c9cb703dfb5f440193765dfa0a61635fb6168`;upSHA `25c2820e7b50501c3358486bb6c4520a2d17fb5343635ee3a173424bcb01a83e`;downSHA `bfe2857310b8f7d1c6f1743cfc99c5bbfc28a110159c43510e73736671423234`. Existing Node offline command and independent Python calculation match with zero DB connections.0001pair `dd061a60b123284882f154c438de3a171d60967b7b07a4e07200b6693f4eb778`,0002pair `d1b67dc680f5bf3c2cbe585dca2427abf9d7ba9f29479c69b851f66b91c1f5a3` remain unchanged.

Original preparation gate (now superseded only by the completed H03A read-only authorization below): new read-only TEST preflight/private backup authorization for PG17.12,127.0.0.1:55432/wetscan_s01_test/marker wetscan-s01:9f3560a6-127f-42a6-abaf-9f45951e6bd5, existing container wetscan-sentinel-local-postgres-1/volume wetscan_sentinel_s01_dev_20261114. Current actual ledger/backup/fixture UUID cannot be claimed verified before this preflight. Historical ledger is exactly0001+0002 with the checksums above. Proposed `s03ReadOnlyPreflight:true` record authorizes only `scripts/sentinel-detection-preflight.ts --read-only`; it cannot migrate or launch detection. Details/commands/actions/budgets are in the migration review.

Original TEST proposal, subsequently executed once under H03B below: after preflight/backup, obtain separate exact-baseline TEST mutation approval before `scripts/sentinel-detection-test.ts`: up/up plus24new isolated acceptance cases, no actual destructive down/reset/old fixture cleanup or main worker. Approval extension binds a new UUID workspace, baseline/backup fingerprints and exact operations; backup outside repository/OneDrive and symlink-resolved path, hash checked by streaming. A file hash is not proof of backup restorable format; operator must verify it. All committed fixtures are retained; original rows/grants/roles/policies/ledger prefix must compare unchanged. No acceptance is inferred from the skipped suite.

Original DEV proposal, completed under H03C-1 below; no new permission: wetscan_dev/marker wetscan-s01:26b6b537-c016-4dc7-8007-4e839e8b838f, same endpoint,0003up/up only after TEST passes. Actual H02-style Auth/HTTP→PG→worker→alert→UI needs a new approved project/source/key/runtime/cutoff and bounded restart/shutdown plan. Do not reuse revoked H02 keys or consumed approvals. Historical queued-job replay requires a separate explicit plan. Publication/merge/deploy and S04 remain unauthorized.

## Preparation validation and preserved failures (H03B evidence below)

Final preparation checks: **599/599 unit/contract tests in38files,7.22s,exit0** after explicit Guard-module handle denial was added to both detection processing and retention; standalone typecheck/ESLint and final production build PASS(exit0). S03 browser6/6PASS; S02browser5/5PASS; originalbrowser6/6PASS. Real PostgreSQL **0executed/0failed/24skipped**, gate-only run; actual S03 authenticated E2E NOT RUN. No existing acceptance is represented as freshly rerun. Preparation made no PostgreSQL connection. H03A subsequently read/backed up TEST only; its exact pre/post data matches historical S02. DEV and its H02 evidence were not accessed; no database was mutated.

Fresh browser checks: S03 initially3PASS/3FAIL due ambiguous error locator matching Next's route announcer; page snapshots confirmed correct app errors. Preserve run1 traces. Narrow main-content locator and complete unchanged-expectation rerun6/6PASS(1.8min). Standalone S02browser5/5PASS(21.9s), original6/6PASS(1.8min), no timeout increases/retries. All are fixtures/mocks, distinct from historical real H02. Earlier typecheck Badge/literal/ProcessEnv/extension errors were corrected. Existing ignored S02 helper lint error prompted the narrow private-artifact ignore. Database and runtime verification remain blocked, not failed or simulated.

The validation report records final unit/typecheck/lint/build counts and timestamps. Historical PostgreSQL14S01/all18S02case-area passes, prior DEV migration/idempotency and real H02twelve areas are not rerun. S03 actor rule unsupported, fixed buckets rather than rolling windows, bounded history/capacity and processing-clock cooldown are explicit limitations. No second real account, real new worker restart or Linux signals were tested. Before declaring COMPLETE, retain the completed H03B24-case evidence and separately verify DEV migration, actual authenticated pipeline/negative paths/restart/UI and source/key/process closure, preserving old evidence. Do not rerun the consumed TEST fixture suite.

## Git, preservation and copy-ready continuation

Current branch `feat/sentinel-s03-detection-alerts`, HEAD/base `cd313ce29aeac865e15cea9abd9c412cb9c2c3cc`; all S03 source/docs remain uncommitted, nothing staged. Final fetched remote master unchanged. `origin/modul-guard` refreshed at `73deba900429ed83964fb60a71920949831e12ee`, no commits ahead of master; unpushed work is unknown. The existing Canvas worktree was untouched. H03B changed only approved TEST schema/new fixtures; H03C-1 added only the reviewed DEV schema and ledger row, with all old rows unchanged; database identity/markers/roles/volumes/credential contents outside new fixture hashes are unchanged, no historical telemetry/old queued job was processed, no workers/scanners/sender/real app remain running. Original Auth/Guard/Canvas/Guard-worker/shared dispatcher/Demo data and body/frozen contracts/historical SQL/role provisioning are protected by the final audit. Private env/approvals/evidence remain ignored; no S03 secrets belong in public files.

## Copy-ready H03C-2 proposal — NOT AUTHORIZED BY THIS HANDOFF

The owner must explicitly review/send the following scope before any implementation or activation described here. Current H03C-1 approval is closed and does not grant runtime permission.

```text
WETSCAN SENTINEL S03 — H03C-2: Strictly Bounded Local Runtime Acceptance

Owner decision: APPROVED for the narrow acceptance-maintenance control described below, its offline regression validation, and bounded local authenticated runtime acceptance ONLY after every safety gate passes. No further migration, TEST access, cleanup, historical replay, publication, production or S04.

Continue feat/sentinel-s03-detection-alerts at base cd313ce29aeac865e15cea9abd9c412cb9c2c3cc; preserve 46 uncommitted files, all prior private artifacts and all DB rows. Read the latest HANDOFF_S03 and S03 architecture/API/migration/validation plus H02 history. H03B 24/24 and H03C-1 DEV up/up are preserved prior evidence, not a substitute for actual E2E.

Only target: PG17.12,127.0.0.1:55432/wetscan_dev,marker wetscan-s01:26b6b537-c016-4dc7-8007-4e839e8b838f,existing desktop-linux container wetscan-sentinel-local-postgres-1/volume wetscan_sentinel_s01_dev_20261114. Verify exact three-version ledger and original times/checksums, combined plan c3e39f6fd43ee6eb2fbf5b244778955aab4cabb8a11ed3c66d791cf99a252a94, actual current historical fingerprints matching H03C-1, unchanged roles/credentials/container/budgets and no unexpected runtimes/consumers. Never connect TEST or a substitute DB. Existing DEV backup 59,222 bytes / SHA-256 ecfc51029a680a8d7b96b78f4f43c68fa09c9bb783b2a1431bebc28a241952e9 is pre-0003; preserve it, do not restore. Stop on drift; no repair/reset/retry/SQL changes.

First implement ONLY the reviewed acceptance-only maintenance guard: strict private s03RuntimeAcceptance.skipMaintenance=true plus expiry/deadline bound to exact DEV/plan/detection scope/notBefore. Suppress global heartbeat cleanup and scoped infrastructure/detection/telemetry retention in this bounded mode, preserving original binding last_cleanup_at and every historical row. Environment opt-in alone is insufficient. Retain standard behavior when absent, dedicated worker role, health/fences/cancellation/retries/ACK and new/stopped heartbeat persistence. Health must report acceptance retention paused. No queue/RLS/grant relaxation. Add/run meaningful offline regressions for defaults/approval/expiry/scope/cutoff/Guard and maintenance skip; run typecheck/lint/full units/build and relevant browser checks. Record exact source diff and new counts; do not present old 599/17 as freshly run. Do not rerun mutating PostgreSQL suites. If broader changes are required, stop for review before activation.

Use existing Auth/Canvas only. Owner-approved proposed scope is owned wilanta/portfolio,live/github-user-187839747:test/github-998736528. Verify it through an actual current authenticated browser session before source/key/rule writes; request owner sign-in if needed, never request secrets/cookies. If actual identity differs, stop for a new exact scope decision; never spoof/rename to match. Inspect existing port owners; stop for unexpected services, never kill an unapproved process.

Record a NEW private runtime-only approval/config; no migration/integration_test/down actions, no consumed approval reuse. Create exactly 1 new local controlled_test source with rate100/min/retention7days and fresh key stored privately outside repo/OneDrive via an explicitly bounded local capture mechanism, no secrets in tool/log/source output. Existing H02 source stays disabled and 2 credentials revoked. Permit at most 2 new rule definitions, 12 unique controlled events / 12 jobs,normal version/audit/evaluation/evidence/alert writes for those fixtures, 2 active jobs, 2 worker starts and 10 minutes overall. Preserve all committed new evidence; no DB deletion. Explicitly permit closing only the new source/key after testing. No external network sender/providers/Guard scanners or production monitoring.

Keep web and worker processes separate. Web receives app credentials only; worker receives dedicated wetscan_sentinel_worker credentials only. Loopback web localhost:3000, health127.0.0.1:3112; optional capture127.0.0.1:3113 must be origin/path-limited, one-use/bounded and stopped afterward. Worker V8 old-space 256 MiB is not hard RSS; preserve 1 GiB / 2 CPU / 128 PID / 40 connection PG budgets and module concurrency 2.

Freeze/protect all 8 H02 job IDs/full row fingerprints privately. Set detection approval mode/workspace/project/processNewTelemetry=true and exact notBefore >= actual NEW runtime approvedAt, strictly after every old job created_at; choose from verified DB time, and wait until that cutoff before ingestion. Pass it unchanged into claims AND expired job/attempt/outbox housekeeping. Before/throughout the bounded run verify only the approved new source/expected subjects are eligible and no concurrent producer/other new eligible job exists; current queue has no source/job-ID allowlist. If that cannot be assured, stop and request separately reviewed allowlist/isolation change; never process unexpected work. No general maintenance-mode fallback, old source re-enable, synthetic aging or historical job mutation.

Run actual authenticated HTTP→PostgreSQL→scoped queue→deterministic rule→durable alert/evidence→real UI. Pin the approved rule/window/provenance and inspect generated IDs; test matching/nonmatching, duplicate/idempotency, suppression and wrong-project/workspace denial without expanding budgets. Verify health, dedicated role, ledger readiness, fresh heartbeats, queue lag/leases and no unexpected failed work. Test bounded restart and graceful shutdown using existing reviewed lifecycle/IPC harness approach; Windows PTY Ctrl+C is not established proof, Linux signals remain untested. Verify exact processed IDs belong only to new approved events and all 8 old jobs retain identical attempts/fence/lease/state/timestamps; compare every old event/receipt/source/revoked credential/binding/heartbeat fingerprint too. Do not claim a complete E2E pass from mocked browser or fresh-pool tests.

Stop all temporary app/worker/emitter/capture processes, disable/revoke only newly approved source/key, close the runtime approval and preserve old/new evidence. On first failure stop and report actual error; no automatic mutating retest or data repair. Update migration review/validation/neutral handoff with source diff, actual HTTP/DB/UI/worker observations, limits, exact IDs privately, Git manifest and next gate. No commit/push/PR/merge/deploy/S04. Stop after H03C-2 report for owner review.
```


> Future S04 continuation, ONLY AFTER separate explicit S04 authorization: first verify S03 publication/merge and genuinely passing PostgreSQL/authenticated worker/alert/UI acceptance, not merely this implementation or browser fixtures. If still pending, stop S04 and finish only separately authorized S03 work. Fetch/verify current master and owner-approved S03 merge SHA; preserve all existing work. Read the exact S04 packet/playbook and latest S03 handoff/contracts. Reuse durable versioned alerts/evidence, existing identity/auth, scoped transactions/queue, worker isolation and original UI; prepare the narrow incident/timeline schema/query/UI integration and incident-linked retention pins under a new migration review. Never auto-open incidents from demo fixtures, imply neutralization, add S05responses/S06providers, process old jobs or apply new SQL without target-specific approval. Follow the S04 packet's tests and agent-neutral handoff, stop at human gates, and never publish/merge/deploy automatically.

## Review references

Final safety audit: **46reviewed changed/new files**,0 staged. Nine actual existing private secret values (plus normalized/escaped forms) checked in memory against all public candidates,0matches; credential patterns0findings. Existing Auth/Guard/Canvas/shared dispatcher/frozen contracts/0001/0002/role provisioning unchanged; original Demo body byte-identical after newline normalization. All-file whitespace and git diff checks PASS. Private S03 env/approval paths remain ignored; existing H02 approval files remain closed. Five production API traces have176/176/176/177/177files and0private artifacts. Final listener check found0on3000/3112/3113/3214 and no Sentinel main-worker/emitter/Guard-main-worker process; no such runtime was started. Full ignored audit files are `.local/sentinel/s03-final-review-*.json`.

- [Architecture](../SENTINEL_S03_ARCHITECTURE.md)
- [API](../SENTINEL_S03_API.md)
- [Migration review and exact approvals](../SENTINEL_S03_MIGRATION_REVIEW.md)
- [Fresh validation, failures and limitations](../SENTINEL_S03_VALIDATION.md)

H03A/H03B and H03C-1 DEV up/up passed. TEST fixtures and all historical DEV rows remain retained; bounded authenticated HTTP → worker → alert → UI runtime remains pending, with strict maintenance isolation still requiring review. Never reuse closed S01/S02 approval files, run old empty-database fixtures on populated TEST, modify markers/roles/volumes, process old jobs, or declare COMPLETE from fixture tests.

## Continuation

Continue this S03 feature branch, preserving all uncommitted work/private evidence and all prior DB records. Static/unit/browser/build preparation and H03A read-only backup are verified; the next step is separate owner review/approval of H03C-2 maintenance control and bounded authenticated runtime, not another migration or TEST execution. Do not connect for mutation, start a live worker, commit/push/open a PR, merge/deploy or begin S04 without the required separate permission. S04 is blocked until genuine S03 acceptance and separate owner authorization; the conditional future prompt above grants no permission.

## H03A observed result — PASS, 15 November 2026

Owner authorization: **Read-Only PostgreSQL Preflight and Private Backup**, attachment `a76f930b-6dd6-4477-a23d-bfc14cea0f0e`. This permitted only exact-TEST read-only verification and a private logical backup. It did not authorize migration, fixture writes, a restore, DEV access, worker startup, historical-job processing or publication. The new private runtime-action record also required `s03ReadOnlyPreflight:true` and separately recorded backup permission; it is now **COMPLETED_H03A_READONLY_BACKUP**, with no active actions. Earlier approvals/configuration/password files were preserved. No mutation approval has been created.

### Fresh target and preservation evidence

Verified branch `feat/sentinel-s03-detection-alerts`, HEAD/base `cd313ce29aeac865e15cea9abd9c412cb9c2c3cc`, all 46 public S03 files preserved and0 staged. Existing second worktree was not modified. No main Sentinel/Guard worker, emitter or migration process was running; no app/worker/helper listener on3000/3112/3113/3214. Only approved PostgreSQL loopback55432 was present.

Exact connected TEST target: **127.0.0.1:55432 / wetscan_s01_test**, shared-object marker **wetscan-s01:9f3560a6-127f-42a6-abaf-9f45951e6bd5**. Actual PostgreSQL **17.12 (Debian17.12-1.pgdg12+1),170012**. Database owner and baseline/dump role **wetscan_migrator**. Actual read-only identity connections for all 3 roles succeeded; all are LOGIN/NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOBYPASSRLS with no memberships. PUBLIC has no database privileges; runtime roles have CONNECT only at database level and no CREATE in platform/sentinel. Effective table/column privileges and existing ACLs were captured privately and matched the retained S02 evidence. No role/password/grant/marker was changed. Runtime RLS remains active even for the migrator; its existing SELECT policies allow complete read coverage, without BYPASSRLS.

Docker context **desktop-linux**; unchanged container **wetscan-sentinel-local-postgres-1**, ID `0220e86e719aa43c30dfd3ba371e290de0fe9141d8d1fe7f7fc6a58accb8961f`; data volume **wetscan_sentinel_s01_dev_20261114** at `/var/lib/postgresql/data`; only mapping 127.0.0.1:55432→5432/tcp. Image digest `sha256:99d1a998c76487d3abb48b141505bda5dcf8089c0c4cd7be40f75de314fa32f0`, PostgreSQL17.12 Bookworm/linux-amd64. Limits remain 1 GiB / 2 CPUs / 128 PIDs / 40 connections. No Docker object was created, started, deleted or reconfigured.

| Applied migration | Exact pair checksum | Actual applied_at (UTC) |
| --- | --- | --- |
| 0001_foundation | `dd061a60b123284882f154c438de3a171d60967b7b07a4e07200b6693f4eb778` | 2026-11-14 12:24:59.556942+00 |
| 0002_telemetry | `d1b67dc680f5bf3c2cbe585dca2427abf9d7ba9f29479c69b851f66b91c1f5a3` | 2026-11-14 20:03:28.380091+00 |

Exactly these 2 ledger entries; **no 0003 entry, detection table or telemetry_detection_window index**. User schema inventory platform/public/sentinel; 12 tables, 21 indexes, 11 ENABLE + FORCE RLS tables and 22 policies. Public has no application objects; no extra user tables/views/sequences/foreign tables or large objects. Existing migrator default-ACL overrides 0.

| Retained TEST records | Before | After |
| --- | ---: | ---: |
| Migration ledger / module limits | 2 / 1 | 2 / 1 |
| Project bindings / sources / credential hashes | 7 / 21 / 22 | 7 / 21 / 22 |
| Events / batch receipts | 26 / 20 | 26 / 20 |
| Jobs queued / leased / completed / failed / cancelled | 18 / 1 / 0 / 0 / 0 | 18 / 1 / 0 / 0 / 0 |
| Job attempts / outbox / notification attempts / worker heartbeats | 0 each | 0 each |

The one leased historical fixture is expired, not an active worker; active leases 0. It was not renewed, reclaimed, processed or repaired. Original retained S02 post-retention snapshot exactly matches the fresh snapshot, including every row fingerprint, ledger timestamp, catalog, roles, grants and policies. Canonical 12-table baseline digest before/after: **`15d09c6bf16415d8115b9034faf42cdf73d93eb0ebd29012fa3cd7cdb217601a`**. Extended inventory digest before/after: **`29939a832862d8c4683e8c453a25e9e34955b987cbf72150ba5bb5f7763933c3`**, including index/constraint/schema/column-ACL/effective-privilege inventories, role identity observations and job status counts. Both comparisons were exact; 0 database mutation statements. Separate DEV and its H02 records were **not accessed**.

### Private backup and archive inspection

Actual dump UTC **2026-11-15T03:31:26.996Z–03:31:27.988Z** (10:31WIB). Full unfiltered PostgreSQL custom archive, **66,522 bytes**. SHA-256, independently equal under Node and PowerShell Get-FileHash: **`a98a5c2ffced1d88e5012c2cd63658ee7e0aa7cc445871b5dea9b659a0003678`**.

No host pg_dump executable was available. Existing approved container's **pg_dump 17.12** connected with the unchanged migrator password-file credential to the same TEST database over container-local TCP 127.0.0.1:5432, behind the reverified host 127.0.0.1:55432 mapping. Explicit username/database and default_transaction_read_only=on; no bootstrap/superuser/role switching. Password entered only private child stdin, never command arguments, environment files, output or archive. Docker stdout streamed binary directly to a newly exclusively created private host file; no container filesystem dump copy, new container or network was used.

Dump options: `--format=custom --inserts --enable-row-security --no-password --lock-wait-timeout=5s`, explicit host/port/user/database. **RLS stayed ON**. All 11 protected tables have an existing unrestricted migrator SELECT policy and no restrictive policy; SELECT privilege exists for every table. No filter, exclusion, --clean, --create, role elevation or bypass option. [PostgreSQL17 documentation](https://www.postgresql.org/docs/17/app-pgdump.html) explains that this RLS option preserves access policies and recommends INSERT output for subsequent RLS-aware loading. All 12 archive INSERT counts were independently compared in memory with the complete baseline counts above, not merely assumed from policy names.

Dump exit 0, stderr 0 bytes. PGDMP magic/nonempty file verified. Matching **pg_restore 17.12 --list** exit 0: 12 table definitions and 12 TABLE DATA entries, platform/sentinel schemas,22 policies, 11 row-security entries, 17 ACL entries, 7 standalone indexes (the other 14 indexes are constraint-backed). All table data, schema definitions and relevant owner/privilege references are covered; no unexplained exclusion. Complete offline `pg_restore --file=-` decode exit 0, no database connection or SQL execution; INSERT counts exactly match every baseline table. No decoded rows/payloads/credential hashes were printed or written to public files.

Archive, TOC, before/after redacted fingerprints, readiness evidence and backup report are in a new ACL-restricted private local directory **outside the checkout and OneDrive**, no reparse point. Directory inheritance disabled; only current operator and SYSTEM have access; every artifact's effective ACL was checked. Resolve its location through ignored `.local/sentinel/s03-h03a-private-directory.txt`; do not publish the archive, TOC or private inventories. The separately ignored env contains file paths only; new read-only approval is private and closed.

**Not restore-tested.** Archive listing and full offline decode do not prove a successful restore. Cluster roles/passwords/tablespaces are outside a database-level dump; role names must exist for owner/ACL replay. The installed plpgsql extension definition/version reference is included, not its server binaries. Without --create, database creation, database-level marker/ACL/settings need separately reviewed provisioning. A restore rehearsal requires a new explicit target-specific approval for a fresh isolated disposable database; neither existing TEST nor DEV may be used for that rehearsal.

### Static migration readiness and next approval

The existing Node offline plan and an independent Python implementation reproduced **`c3e39f6fd43ee6eb2fbf5b244778955aab4cabb8a11ed3c66d791cf99a252a94`**. Both historical SQL pairs and role provisioning match HEAD exactly. 0003 up/down/pair identities remain the reviewed hashes above. No SQL, runner, source, tests or configuration template changed during H03A.

Final static review: 8 additive Sentinel tables; immutable runtime version/audit grants; deferred current-version FK; exact versioned alerts and real event/source evidence; scoped composite PK/FKs; deduplication/correlation uniqueness; 7 explicit indexes plus 11 constraint-backed new indexes; 16 FORCE RLS policies; PUBLIC revoked and narrow app/worker grants. Versions/audit have no runtime UPDATE/DELETE, app cannot write derived alerts, worker cannot write rules or read credentials. This is runtime-role immutability, not protection against the trusted database owner altering its own schema. S02 retention gains scoped evidence pins and restrictive FKs; derived retention preserves hold/pending references. Default-off scoped activation and new-job cutoff preserve historical queues. Ordered advisory-locked up/up checksums and empty-only down refusal were inspected; no applied ledger rewrite, destructive SQL or historical data mutation is proposed. Additive event index/DDL can acquire locks during future acceptance. Actual PostgreSQL DDL/constraint behavior remains unexecuted, and 24 acceptance cases remain **NOT RUN**.

**Ready to request separate TEST migration/acceptance approval**, not permission to execute it now. Proposed new unused fixture UUID **`237b6b3d-da98-4b38-8b14-6b7c15811be6`**; workspace `github-user-7:s03-237b6b3d-da98-4b38-8b14-6b7c15811be6`, projects github-123/github-456; -other workspace only a read-denial probe. Fresh read-only absence confirmed, active leases 0 and other Sentinel sessions 0. Future execution must recheck identity, baseline, exact archive bytes/ACL and unused scope immediately; stop on drift. New approval binds actual baseline/backup/fixture, exact plan and actions integration_test/migrate_up/migrate_down **only for a firewall-protected populated-down refusal**, never successful reversal. Explicit operations: up_up,new_fixtures,process_fixture_jobs,expire_fixture_lease,fixture_hold_transitions,negative_dml_rollback,populated_down_refusal. Budget <=20 new sources/credentials, <=25 events/receipts/jobs, <=25 rules with <=100 versions/rule and documented derived caps. Preserve every old row and retain new committed fixtures; no successful deletes/cleanup, old-suite reset or main worker. DEV up/up, actual app/worker/emitter integration, historical replay, restore rehearsal, publication and S04 each remain outside this approval.

One supplemental read-only inventory helper initially referenced jobs.status instead of the existing jobs.state (SQLSTATE42703). Transaction rolled back; no snapshot or backup was produced by that attempt. Correcting only its private SELECT to state/lease_until yielded the passing inventory above. This was a helper error, not migration/schema drift; application/SQL/checks unchanged. Unit/typecheck/lint/build/browser counts elsewhere are prior verified preparation evidence, **not rerun for H03A**. The 24 mutating cases were not launched, even as a skipped suite.

H03A final Git/security audit: exactly 46 public changed/new files, 0 staged; only this migration review, S03 validation and HANDOFF_S03 changed during H03A. The other 43 public candidates remain byte-identical to the initial H03A manifest. Nine actual private secret values (including escaped/normalized forms) were checked in memory: 0 matches in public files; credential-pattern, protected Auth/Guard/Canvas/Demo/frozen-contract/historical-SQL and whitespace checks PASS. Ignored evidence: .local/sentinel/s03-h03a-final-review-*.json. No source/SQL/test edit, broad-suite rerun or publication occurred.

## H03B observed result — PASS, 15 November 2026

Owner source: **H03B: TEST Migration and PostgreSQL Acceptance**, attachment `23eaad65-6bbb-4dba-9432-c008f9aadb12`. This separately authorized exact-TEST 0003 up/up, the previously reviewed 24 cases/new fixture scope, private evidence and independent read-only preservation checks. No DEV connection, main worker, historical-job processing, runtime activation, publication or S04 permission. A NEW outside-repository/OneDrive private approval/env bound the existing H03A fixture/baseline/archive and exact operation allowlist; earlier consumed records were not reopened. The H03B record is now **COMPLETED_H03B_TEST_ACCEPTANCE**, original owner decision/actions retained, active actions empty. Never rerun using it.

### Immediate preflight and backup — PASS

Exact target **PostgreSQL 17.12 / 170012, 127.0.0.1:55432/wetscan_s01_test**, shared marker **wetscan-s01:9f3560a6-127f-42a6-abaf-9f45951e6bd5**. Identity connections for `wetscan_app`, `wetscan_sentinel_worker`, `wetscan_migrator` passed using existing password files; all remain restricted LOGIN/NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOBYPASSRLS, no memberships. Database owner/migrator unchanged. Docker context desktop-linux, existing container wetscan-sentinel-local-postgres-1 / ID 0220e86e719aa43c30dfd3ba371e290de0fe9141d8d1fe7f7fc6a58accb8961f, volume wetscan_sentinel_s01_dev_20261114, immutable image sha256:99d1a998c76487d3abb48b141505bda5dcf8089c0c4cd7be40f75de314fa32f0 and loopback mapping unchanged.

Ledger before writes was exactly 0001/0002 with H03A checksums/timestamps. No 0003 objects/index; fixture UUID `237b6b3d-da98-4b38-8b14-6b7c15811be6` and its approved workspace/projects unused. Active leases 0, other TEST sessions 0; historical expired lease preserved. Entire H03A row/catalog/role/grant/policy snapshot matched, not just counts: canonical baseline **15d09c6bf16415d8115b9034faf42cdf73d93eb0ebd29012fa3cd7cdb217601a**, extended baseline **29939a832862d8c4683e8c453a25e9e34955b987cbf72150ba5bb5f7763933c3**. Independent Python hashing and existing offline Node plan both reproduced **c3e39f6fd43ee6eb2fbf5b244778955aab4cabb8a11ed3c66d791cf99a252a94**. Historical migration SQL/provisioning matched HEAD byte-equivalently after newline normalization.

Existing H03A archive, resolved from the real private report, remained **66,522 bytes**, SHA-256 **a98a5c2ffced1d88e5012c2cd63658ee7e0aa7cc445871b5dea9b659a0003678**. Outside repository/OneDrive, no reparse point, protected directory with only operator/SYSTEM access. File hash/size/magic and matching pg_restore 17.12 --list reverified, exit 0; all 12 expected table-data entries present. No substitute, copy into checkout, upload or restore. Prior full offline decode evidence preserved; no restore rehearsal claimed. Archive covers pre-S03TEST, not DEV or current post-H03B fixtures.

### Actual reviewed runner — one execution, exit 0

Command: `node --env-file=.env.sentinel.s03.test.local --import tsx scripts/sentinel-detection-test.ts`.

Actual wall window **2026-11-15T10:44:07.0143277+07:00–10:44:12.3268115+07:00**. Vitest reported **3.72s**,1 passed file, **24PASS / 0FAIL / 0SKIPPED**. Runner code, assertions, configuration, SQL and expectations were unchanged. No retry/cleanup/reset or old S01/S02 runner. The reviewed manifest performs migration checks as01–02, schema/grant check03, and begins fixture writes at04; it was not preceded by a replacement migration runner that would invalidate its two-entry baseline.

| Migration check | Actual result |
| --- | --- |
| Case01 first up | PASS; existing gated/advisory-locked transaction applies only pending 0003; old rows/catalog/grants/ledger prefix preserved |
| Case02 second up | PASS; no duplicate migration, same three-entry ledger including exact applied_at; no replay of SQL |
| Case02 altered-checksum probe | Expected target_denied; transaction rollback, no edited ledger or persistent SQL change |
| Case03 schema/least-privilege check | PASS; eight new FORCE-RLS tables verified; prohibited runtime grants absent |

Current ledger after both runs and after all 24 cases:

| Migration | Pair checksum | applied_at (UTC) |
| --- | --- | --- |
| 0001_foundation | `dd061a60b123284882f154c438de3a171d60967b7b07a4e07200b6693f4eb778` | 2026-11-14 12:24:59.556942+00 |
| 0002_telemetry | `d1b67dc680f5bf3c2cbe585dca2427abf9d7ba9f29479c69b851f66b91c1f5a3` | 2026-11-14 20:03:28.380091+00 |
| 0003_detection | `4f0ee1cebdbdc81b835f719ef13c9cb703dfb5f440193765dfa0a61635fb6168` | 2026-11-15 03:44:09.392677+00 |

0003 up SHA 25c2820e7b50501c3358486bb6c4520a2d17fb5343635ee3a173424bcb01a83e; down SHA bfe2857310b8f7d1c6f1743cfc99c5bbfc28a110159c43510e73736671423234; final combined plan unchanged. No actual down executed: case19's SQL allowlist allowed only lock/read/rollback and verified refusal before any destructive statement.

### Actual 24-case manifest

| Case | Reviewed case | Result |
| --- | --- | --- |
| 01 | applies only additive0003 to the approved populated TEST | PASS |
| 02 | second up is idempotent and checksum-enforced | PASS |
| 03 | verifies eight FORCE-RLS tables, narrow grants and immutable versions | PASS |
| 04 | creates only opt-in drafts and rejects actor-rule enable | PASS |
| 05 | persists immutable rule history and rejects optimistic conflicts | PASS |
| 06 | processes actual stored events into real referenced alerts | PASS |
| 07 | duplicate delivery and crash-after-persistence do not duplicate alerts | PASS |
| 08 | concurrent claims/evaluations produce one threshold alert | PASS |
| 09 | active cancellation refuses stale effects | PASS |
| 10 | expired/reclaimed fencing rejects the old worker | PASS |
| 11 | injected post-alert driver failure rolls back actual PostgreSQL effects | PASS |
| 12 | fresh pools preserve alerts and acknowledged processing | PASS |
| 13 | wrong project and workspace cannot read real alert rows | PASS |
| 14 | actual other-project event cannot link to this project's alert | PASS |
| 15 | disabled rules yield no new alert and no-match jobs complete | PASS |
| 16 | legal hold and real evidence links prevent S02 retention deletion | PASS |
| 17 | Guard/unregistered job kinds cannot be claimed | PASS |
| 18 | scoped new-job cutoff preserves earlier fixture jobs | PASS |
| 19 | populated0003 reversal is refused before any destructive statement | PASS |
| 20 | all original S01/S02 rows, roles, policies and ledger prefix survive | PASS |
| 21 | explicit suppression retains real match evidence without an alert | PASS |
| 22 | database cooldown suppresses a second distinct event-time window | PASS |
| 23 | nonmatching normalized statuses complete without a fabricated alert | PASS |
| 24 | real alert cursor traversal uses stable filters and rejects foreign cursors | PASS |

These are **real PostgreSQL controlled fixture results**, with scoped executor/queue functions rather than the persistent daemon. Case12 proves fresh-pool persistence, not a real worker-process restart. Injected driver failure in11 is deliberate; actual PostgreSQL effects roll back and the reviewed new-fixture retry completes. Actor rule enable correctly refuses unavailable identity. Existing 599 unit/contract and 17 browser results plus typecheck/lint/build are historical preparation evidence, **not rerun for H03B**. No actual authenticated HTTP→worker→alert→UI E2E, signal/lifecycle test, production telemetry or provider integration occurred.

### Independent postflight and retained fixtures — PASS

Independent read-only audit at **2026-11-15T03:46:20.590Z** verified every pre-existing row fingerprint, old 0001/0002 ledger timestamps, roles, memberships, policies, owner/ACL/column-grant/effective-privilege inventory, indexes and constraints unchanged. The only addition on an old table is the reviewed sentinel.telemetry_detection_window index. New schema: 20 total tables, 39 indexes, 38 policies; eight new owner-correct ENABLE+FORCERLS tables and 14 validated composite FKs starting mode/workspace/project. App has only approved rule inserts/metadata-column updates and derived SELECT; worker has approved derived writes, no rule-version mutation or credential SELECT; neither runtime role gains schema CREATE/TRUNCATE. No default-ACL/role changes, other consumers or main-worker heartbeat.

All persistent new rows are confined to the approved workspace `github-user-7:s03-237b6b3d-da98-4b38-8b14-6b7c15811be6`, projects github-123/github-456; -other workspace remains a read-denial probe with no rows. Individual generated source/key/event/batch/job/rule identities are saved privately. No existing UUID was substituted or historical row targeted. All 14 new sources have controlled_test provenance. Actual fixture additions remain under reviewed caps (20 sources/credentials, 25 events/receipts/jobs/rules, 100 versions/rule and derived caps).

| Historical table group | H03A before | Approved additions retained | H03B total |
| --- | ---: | ---: | ---: |
| Bindings | 7 | 2 | 9 |
| Sources | 21 | 14 | 35 |
| Credential hashes | 22 | 14 | 36 |
| Events | 26 | 15 | 41 |
| Batch receipts | 20 | 13 | 33 |
| Jobs | 19 | 15 | 34 |
| Job attempts | 0 | 16 | 16 |
| Outbox / notification attempts / heartbeats | 0 each | 0 each | 0 each |

The 19 historical jobs remain 18 queued / 1 expired-leased, exact old lease fields retained. New jobs: 13 completed / 1 cancelled / 1 queued (secondary-project isolation witness);0 new leased/failed. New derived state retained: 14 rules, 26 versions, 26 audit rows, 33 alerts, 41 alert-evidence links, 130 evaluations, 33 cooldowns, 6 suppressed-evidence links. Credential plaintext lived only in the test process; hash-only fixture credential records remain as reviewed. Nothing was deleted/revoked/reset as post-test cleanup. No DEV/H02 access or modification.

Two independent audit-helper errors were preserved privately: initial object filtering omitted historical indexes; after correcting the filter, an inventory query wrongly assumed project-scope columns on module-wide worker_heartbeats (42703). Both READ ONLY transactions rolled back. Correct only the private audit comparison/query, then complete the independent read-only audit successfully. These were not acceptance failures or application/schema fixes; no test expectation or mutating suite rerun. Original failed helper versions/diagnostics retained.

Private evidence outside repository/OneDrive: locate through ignored `.local/sentinel/s03-h03b-private-directory.txt`; contains closed test-approval.json, backup-verification.json, before.json, acceptance.log, execution.json, case-results.json, after.json, fixture-identities.json and preserved comparator failures. Passwords/raw payloads/hash maps are not public report content. Ignored `.env.sentinel.s03.test.local` has paths/config only; do not reopen the consumed record. The 46-file manifest remains preserved,0 staged, HEAD cd313ce29aeac865e15cea9abd9c412cb9c2c3cc. Only the three requested docs changed during H03B; source/SQL/tests unchanged.

**H03B complete; overall S03 remains IMPLEMENTED_PENDING_ACCEPTANCE.** Separate exact-target DEV up/up and bounded actual authenticated HTTP/worker/alert/UI approval are still required. The original TEST runner now intentionally refuses its populated/applied target and reused fixture scope; no repeat, cleanup, down, fresh mutation fixture or source fix without renewed review. Do not declare S03 complete from PostgreSQL fixtures alone. No commit/push/PR/merge/deploy/S04.

H03B final safety audit: all 46 public changed/new files remain preserved and unstaged; only the three requested S03 reports changed during this phase, with the other 43 candidates byte-identical to the initial H03B manifest. Nine real private secret values and normalized/escaped forms had 0 public matches; protected ownership/Demo, credential patterns, whitespace and private-artifact tracing checks PASS. All 15 H03B private evidence files retain operator/SYSTEM-only ACLs. Final process/listener check: 0 main-worker/emitter/acceptance processes and 0 application/worker/helper listeners. Evidence: ignored .local/sentinel/s03-h03b-final-review-*.json. No publication occurred.

## H03C-1 observed result — PASS, 15 November 2026

Owner source: **DEV Database Preflight, Private Backup and Controlled Migration**, attachment `5673c6d7-4d39-413f-ab8a-635d54d82744`. Authorized only exact DEV read-only preflight/backup, reviewed 0003 up/up and read-only postflight/documentation. A NEW private approval bound exact DEV/plan, actions **migrate_up only**, plus the bounded read-only/backup operations; no runtime, integration_test or migrate_down permission. It is now **COMPLETED_H03C1_DEV_MIGRATION**, original decision/actions retained, active actions empty. No consumed H02/H03 approval was reopened. No TEST connection, fixture execution, main worker, emitter, queue processing, cleanup or publication occurred.

### Exact DEV identity and baseline — PASS

Verified **PostgreSQL 17.12 / 170012, 127.0.0.1:55432 / wetscan_dev**, shared-object marker **wetscan-s01:26b6b537-c016-4dc7-8007-4e839e8b838f**. Current observer/migrator and database owner wetscan_migrator; app/worker identity checks used their existing dedicated roles in READ ONLY transactions. All 3 principals remain LOGIN/NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOBYPASSRLS, existing memberships/grants unchanged. RLS active on old runtime tables; no role/grant/credential escalation.

Docker desktop-linux; unchanged container **wetscan-sentinel-local-postgres-1**, ID `0220e86e719aa43c30dfd3ba371e290de0fe9141d8d1fe7f7fc6a58accb8961f`; unchanged volume **wetscan_sentinel_s01_dev_20261114** at /var/lib/postgresql/data; only host 127.0.0.1:55432→5432 mapping; approved PG 17.12 Bookworm image digest **sha256:99d1a998c76487d3abb48b141505bda5dcf8089c0c4cd7be40f75de314fa32f0**. No Docker lifecycle/configuration operation. PostgreSQL max_connections 40; existing container budgets retained. Other DEV sessions 0; no interfering consumer/migration.

Before backup and immediately before up, complete historical H02 audit matched **ac02318931e86e10807362ba20f65e7819da663a5cdf7c53c7073f82737b6f38** exactly, including all row fingerprints, OIDs/columns/constraints/indexes/policies/ACLs/grants/memberships/roles, ledger times, source/credential states and historical heartbeats. Not merely aggregate counts. Initial ledger exactly 0001+0002; no 0003 table/index/ledger entry. Original S01 module seed 1 and three historical heartbeats retained, including the stale running label (not an active worker).

Protected H02 evidence: live / github-user-187839747:test / github-998736528, owner-approved historical wilanta/portfolio. One controlled_test source **3b67f63a-f67e-4fa4-96b9-2fecd9a6feba** remains disabled; 2 credential hashes retain exact revocation times; 8 events / 6 receipts / 8 queued accepted-job rows unchanged. Actual job IDs/full lease/revision/attempt/fence/timestamp metadata captured privately. No actor/source identity invented or old approval reused.

### New DEV backup — VERIFIED ARCHIVE, NOT RESTORE-TESTED

Separate full custom-format DEV archive, UTC **2026-11-15T04:01:49.368Z–04:01:50.199Z** (11:01WIB), **59,222 bytes**. SHA-256, independently equal under Node and PowerShell Get-FileHash:

`ecfc51029a680a8d7b96b78f4f43c68fa09c9bb783b2a1431bebc28a241952e9`

Stored outside repository/OneDrive in a new non-reparse private directory, inheritance disabled, only operator/SYSTEM ACLs. Existing approved container's pg_dump 17.12 used explicit DEV/migrator/TCP5432 behind the verified host55432 mapping; unchanged password-file credential entered child stdin only, never arguments/output. Direct binary stdout to exclusive new private host file. default_transaction_read_only=on, RLS ON (`--enable-row-security --inserts`), no filter/exclusion/--clean/--create/privilege bypass. Existing unconditional migrator SELECT policies on all 11 protected tables and SELECT privileges were verified before dumping.

Dump exit 0, stderr 0 bytes; PGDMP header/nonempty file verified. Matching pg_restore 17.12 --list exit 0: all 12 table definitions/data entries, expected schemas, 22 policies, 11 row-security and 17 ACL entries. Full offline decode exit 0; all 12 INSERT row counts independently match the pre-migration baseline. No restore/database connection was made by archive inspection. Coverage is complete for current DEV database objects/data under existing RLS read coverage, including historical credential hashes privately. No archive/raw rows/hash maps/TOC uploaded or included in public source.

Limitations: no restore rehearsal, hence no claim of proven restoration. Database-level dumps do not create global roles/passwords/tablespaces; ownership/ACL replay needs the existing role names. Extension definitions refer to installed server extensions, not binaries. Without --create, database provisioning/marker/database ACL/settings require separately reviewed provisioning. Archive is pre-0003 DEV, not the populated TEST backup and not a post-migration archive.

### Actual migration commands and ledger — PASS

Independent Python SHA-256 and existing Node plan command reproduce combined plan **c3e39f6fd43ee6eb2fbf5b244778955aab4cabb8a11ed3c66d791cf99a252a94**. Historical 0001/0002 SQL and role provisioning match HEAD unchanged; no S03 SQL/runner/test edits. 0003 up SHA 25c2820e7b50501c3358486bb6c4520a2d17fb5343635ee3a173424bcb01a83e; down SHA bfe2857310b8f7d1c6f1743cfc99c5bbfc28a110159c43510e73736671423234.

Actual command, executed exactly twice with independent first postflight before second:

```text
node --env-file=.env.sentinel.s03.dev.local --import tsx scripts/sentinel-db.ts up --approve-plan=c3e39f6fd43ee6eb2fbf5b244778955aab4cabb8a11ed3c66d791cf99a252a94
```

First up **exit 0**: existing advisory-locked gated runner applies only pending 0003 and one ledger row. Independent fresh-pool READ ONLY audit passed before second up. Second identical command **exit 0**: no new migration/duplicate objects/replayed SQL; complete snapshot byte-equivalent under canonical hashing to first result, including 0003 applied_at. No down/reset/repair/retry/fixtures.

| Version | Pair checksum | DEV applied_at (UTC) |
| --- | --- | --- |
| 0001_foundation | `dd061a60b123284882f154c438de3a171d60967b7b07a4e07200b6693f4eb778` | 2026-11-14 12:36:51.243758+00 |
| 0002_telemetry | `d1b67dc680f5bf3c2cbe585dca2427abf9d7ba9f29479c69b851f66b91c1f5a3` | 2026-11-14 22:17:24.288225+00 |
| 0003_detection | `4f0ee1cebdbdc81b835f719ef13c9cb703dfb5f440193765dfa0a61635fb6168` | 2026-11-15 04:02:14.211905+00 |

First/second complete audit digest **4b288c9def842b52c577f44f640a2848993cd3e660d417139c722d3a013f4f8b**. Original 0001/0002 checksums/application times and every historical row remain exact. Approved differences ONLY: new 0003 ledger entry, eight empty S03 tables and their reviewed constraints/indexes/RLS/grants, plus telemetry_detection_window on old events. Tables 12→20; indexes 21→39; policies 22→38. New 14 validated composite FKs all begin mode/workspace/project; eight owner-correct ENABLE+FORCERLS tables. Runtime app derived writes/rule-version UPDATE/DELETE and worker rule mutations/credential SELECT stay forbidden by exact effective/column privilege inspection. Only app rule metadata columns current_version/updated_at have UPDATE. No runtime schema CREATE/TRUNCATE. Actual active RLS observed on all 8 new tables under all 3 principals: 24 read-only checks. No mutating RLS denial fixtures were run on DEV.

### Full historical preservation — PASS

| DEV data | Before | After first | After second |
| --- | ---: | ---: | ---: |
| Migration ledger | 2 | 3 | 3 |
| Module limits / old heartbeats | 1 / 3 | 1 / 3 | 1 / 3 |
| Project binding / source | 1 / 1 | 1 / 1 | 1 / 1 |
| Revoked credential hashes | 2 | 2 | 2 |
| Telemetry events / receipts | 8 / 6 | 8 / 6 | 8 / 6 |
| Queued historical jobs | 8 | 8 | 8 |
| Attempts / outbox / notification attempts | 0 each | 0 each | 0 each |
| Each of eight new detection tables | absent | 0 | 0 |

Independent original-row/structure comparisons were performed in new read-only sessions after both commands, not inferred from successful DDL. Old table definitions/OIDs/indexes/constraints/policies/privileges remain unchanged, excluding the explicitly approved new event index. No historical lease field, state, timestamp, source setting, revoked hash or heartbeat changed. Backup interval snapshot also matched baseline exactly.

### H03C-2 static readiness and required controls

No worker startup/claim/queue function/emitter/API write took place. Static code review: worker/main uses only dedicated worker credential, exact target/ledger checks and detectionActivation. A new runtime approval must bind mode/live workspace/project, processNewTelemetry=true and notBefore>=its actual approvedAt; flag alone fails. Runtime enumerates only the approved detection scope, uses module sentinel/kind sentinel.telemetry.accepted, passes notBefore into PostgresQueue; both claim and expired-job/attempt/outbox housekeeping filter creation cutoff and scope. Guard module is rejected. Read-only observation: 8 old queued jobs, latest old creation before observation, 0 jobs created at/after observation, 0 other sessions. Thus a fresh future cutoff strictly later than every historical created_at excludes all 8 old jobs. Source selection alone is insufficient, and no source/job-ID allowlist currently exists. Future activation must verify no unrelated eligible jobs/producers and inspect exact processed IDs afterward.

**Maintenance caveat:** runtime.ts also calls module-wide retainWorkerHeartbeats and scoped retainInfrastructure/retainDetection/retainTelemetry before claim. Claim cutoff does not cover those calls. retainInfrastructure can update the existing binding's last_cleanup_at even when deleting 0 rows; receipt cleanup can later expire historical receipts. Current old binding last_cleanup_at is NULL, so default startup could alter it. No queued old job is terminal-retention eligible, but full historical evidence preservation requires more than a claim cutoff. Do not activate default worker and silently accept this change.

Smallest proposed strict-preservation change for separately approved H03C-2: an explicit, expiring private runtime-approval extension (for example s03RuntimeAcceptance.skipMaintenance=true) bound to exact DEV/plan/detection scope/cutoff; skip the global heartbeat-retention call and all three scoped retention calls during that bounded acceptance run. Keep normal worker defaults, per-lease fences/retries, new worker heartbeat writes/stopped state, health and dedicated role unchanged; expose paused retention honestly in health. An environment flag alone must not bypass approval. Gate expiry/deadline and add meaningful offline regressions for unchanged defaults, missing approval, skipped maintenance, exact scope/cutoff/Guard denial. No such source change was made or approved under H03C-1.

Alternative requires an explicit owner-reviewed allowance for exact metadata/retention effects or a separately approved isolated environment; never change holds/binding timestamps/job states to manufacture safety. Before actual runtime, fresh Auth/Canvas must still authorize wilanta/portfolio/github-998736528/github-user-187839747:test; mismatch requires a new exact identity decision, not spoofing or renaming. New controlled_test source/key only; old disabled source and revoked keys remain untouched. Propose max 2 rules, 12 unique controlled events/jobs, 2 active jobs, 2 worker starts within 10 minutes, loopback web 3000 / health 3112 and optional temporary capture 3113, 256 MiB V8 old-space limit (not RSS). Record final source/eligible-job identities/cutoff, no concurrent producers; stop on unexpected eligible work. Future approved restart/health/UI observations must preserve all8historical job IDs, old event/receipt/source/credential/binding fingerprints,3 old heartbeat rows, 0 old attempts. New acceptance heartbeats are expected, historical deletion is not.

### Evidence, validation and stop state

No failures occurred in H03C-1 commands/audits/backup verification. Independent plan, exact historical baseline, archive TOC/full offline decode, both gated CLI up operations, first/second read-only audits and 24 active-RLS checks PASS. Existing 599 unit/contracts, 17 browser cases/typecheck/lint/build and H03B 24/24 are **previously verified, not rerun**. H03B evidence was read only from private files; no TEST connection or TEST suite ran. No actual HTTP→worker→alert→UI acceptance, new daemon/lifecycle test or production operational claim.

Private evidence outside checkout/OneDrive: resolve ignored .local/sentinel/s03-h03c1-private-directory.txt; contains closed dev-approval.json, before/premigration/first/second.json, DEVdump/archive.toc.txt, backup-report/independent verification, first/second-up logs/execution records and runtime-readiness.json (including protected job identities). All use restrictive local storage; no passwords/raw rows/hash maps/backup content in public docs. Ignored .env.sentinel.s03.dev.local contains target and file paths only. Branch feat/sentinel-s03-detection-alerts, HEAD cd313ce29aeac865e15cea9abd9c412cb9c2c3cc, 46 uncommitted / 0 staged; only the three required reports changed this phase. Source/SQL/tests remain byte-identical to the H03B audit. No other worktree/Guard/Auth/Canvas/Demo work altered, no commit/push/PR/merge/deploy/S04. **H03C-1 complete; stop for H03C-2 review/authorization.**

H03C-1 final safety audit: 46 public changed/new files preserved, 0 staged; only these three requested reports changed during this phase, and all 43 other candidates remain byte-identical to the initial H03C-1 manifest. Nine actual private secret values/normalized forms had 0 public matches; credential-pattern, protected Auth/Guard/Canvas/Demo/frozen-contract/SQL, whitespace and private-artifact build-trace checks PASS. All 17 new private evidence files have operator/SYSTEM-only ACLs; DEV approval closed with no active actions. Final main-worker/emitter/acceptance processes0 and app/worker/helper listeners0. Container remains healthy at unchanged1GiB/2CPU/128PID budgets. Evidence: ignored .local/sentinel/s03-h03c1-final-review-*.json. No TEST connection, new fixture, runtime activation or publication occurred.

## H03C-2 observed acceptance — PASS, 15 November 2026

Owner source: attachment `21c4ae8f-54a6-4f86-a688-4d0ef7ffaa8a`, controlled real end-to-end acceptance. Authorization covered isolated local DEV runtime and NEW controlled-test records only. No TEST connection, migration, grant/role/container/volume/marker change, historical replay, scanner, emitter, external delivery, publication or S04 operation occurred. Earlier phase reports below retain their original time-specific status; this section is the current result.

### Isolation and preflight

Phase A completed before runtime writes: default-off acceptance mode requires agreement between the private approval extension and `SENTINEL_ACCEPTANCE_ISOLATION=1`, detection opt-in, exact DEV identity/plan/worker role/project/source, eight protected job identities, 1–12 distinct new admitted job IDs, a historical baseline fingerprint and an expiry no later than ten minutes after approval. Missing, malformed, contradictory or expired opt-in fails closed. Scope and IDs are cloned/frozen. Before even a new heartbeat, actual read-only PostgreSQL verifies all admitted/protected rows, state, module/kind, exact source, cutoff, DB clock expiry, and heartbeat-ID noncollision.

The queue appends exact-ID and database-clock expiry predicates to claims, lease-expiration housekeeping, attempt insertion and settlement, heartbeat, retry, cancellation and related outbox updates. Existing scope, module, kinds, fencing, token, revision, lease and role checks remain. Acceptance cannot enqueue. All acceptance retention is skipped, including global old-heartbeat retention, infrastructure/outbox, detection/telemetry and binding cleanup. Normal mode retains normal maintenance. Failure or expiry requests shutdown. A parent watchdog also bounded each real worker start to 180 seconds.

Source creation revealed an additional historical write path: re-enrolling the identical enabled actor previously incremented the existing binding revision/updated_at. The conflict UPDATE now runs only when enabled state or actor actually differs, preserving the existing row for identical identity while retaining the lock. Actual DEV source/rule creation and final full-row comparisons verified the original binding, revision and NULL cleanup timestamp unchanged. This changes Sentinel enrollment only; Auth/Canvas authority remains unchanged.

Read-only preflight matched the entire H03C-1 snapshot: PostgreSQL 17.12/170012, `desktop-linux`, container `wetscan-sentinel-local-postgres-1` (ID `0220e86e719aa43c30dfd3ba371e290de0fe9141d8d1fe7f7fc6a58accb8961f`), approved immutable 17.12 Bookworm image, volume `wetscan_sentinel_s01_dev_20261114`, loopback `127.0.0.1:55432`, database `wetscan_dev`, marker `wetscan-s01:26b6b537-c016-4dc7-8007-4e839e8b838f`. All three ledger entries/checksums/timestamps, 20 tables, 39 indexes, 38 policies, restricted roles/grants and FORCE RLS matched. Independent offline Node/Python hashing reproduced plan `c3e39f6fd43ee6eb2fbf5b244778955aab4cabb8a11ed3c66d791cf99a252a94`; no SQL changed. The existing DEV backup was read from its actual private record, remained 59,222 bytes / `ecfc51029a680a8d7b96b78f4f43c68fa09c9bb783b2a1431bebc28a241952e9`, and offline archive listing returned 12 TABLE DATA entries. No restore occurred. No unexpected listeners or consumers preceded startup.

### Actual Auth, HTTP, rules and PostgreSQL

Existing controlled Chrome was genuinely authenticated: `/api/onboarding` returned authenticated=true and the real sources/rules APIs returned 200 after fresh Auth/Canvas/GitHub project authorization. No cookies/tokens were extracted or authentication mocked. Exact live scope: workspace `github-user-187839747:test`, project `github-998736528`, repository `wilanta/portfolio`.

One NEW source: `806e6444-2d44-449d-9495-43feb08f15a2`, local environment, controlled_test origin, retention 7 days, rate limit 30 events/minute. One new credential `373e9508-51cd-4ad5-a30e-a89f9ca62d27` was captured directly to an ACL-restricted private file without returning/logging its value. Budget: at most 12 unique events/jobs and two worker starts; actual 6 unique events/jobs. The existing credential API has no time-expiry field; this key was explicitly revoked after 373.264754 seconds, within the ten-minute acceptance bound. Do not describe it as a natively expiring token.

Two rules were created as DRAFT version 1 and enabled as immutable version 2 through actual authenticated POSTs:

| Rule ID | Definition | Actual alert |
| --- | --- | --- |
| `9dfd4ef7-b92f-4721-9829-42bf7cfdd636` | H03C2 controlled suspicious paths; http.suspicious_path + controlled_probe; source correlation; 300s fixed bucket; threshold 2; cooldown 300s | `ed81bab7-1126-49b3-8d92-78cda3ed643c`; high; confidence 85; 2 evidence events; version 2 |
| `ff8275f9-293e-43c3-aaec-bcdd2eaeb162` | H03C2 controlled HTTP errors; http.request status >=500; source correlation; 300s fixed bucket; threshold 1; cooldown 300s | `e6f68a5c-a786-42b9-9b22-cb3d6ed8c10a`; medium; confidence 70; 1 evidence event; version 2 |

First actual ingest: HTTP 202 for five events (two suspicious paths, normalized HTTP 503, HTTP 200, harmless decoy). Exact nonce retry: HTTP 200 duplicate=true. New nonce/same events: HTTP 202, every event duplicate=true; no new event/job/alert. Invalid key: HTTP 401. Three new receipts total include this duplicate-event batch and the later disabled-rule event. Before worker startup actual PostgreSQL stored exactly five new events and five queued jobs; provenance and route/query/fragment redaction passed. No raw canary was retained.

The HTTP-error rule was then disabled by authenticated API, creating immutable version 3. A sixth HTTP 503 event returned HTTP 202 and one new job; its actual version-3 evaluation was `rule_not_applicable / rule_inactive`, matched=false. No new alert/evidence was created. The unmatched decoy produced no alert. The HTTP 200 was not evidence; because another 503 was already present in its source/window, its aggregate evaluation could deduplicate the existing window alert. This is source/window correlation, not a claim that HTTP 200 itself met the predicate. All persisted evidence references only the three genuinely matching events.

### Real worker and restart

Only `wetscan_sentinel_worker` credentials were supplied to the worker; app/migration/Auth/GitHub/provider credentials were excluded. The existing `worker/sentinel/main.ts` entrypoint was launched directly under Node/tsx with 256 MiB V8 old-space, max concurrency 2, pool 3, 200ms poll and 1s heartbeat. App used only `wetscan_app`, pool 5, loopback port 3000. PostgreSQL retained 1GiB/2CPU/128PID/40-connection budgets. V8 old-space is not a hard RSS limit.

First worker `b8134a82-c018-4e41-ae05-6058e7de40f9`: startup 59ms; completed exactly five admitted jobs, each one attempt; idle with eight historical jobs untouched; parent IPC stop completed in 22ms, exit 0. Second worker `59d743fc-d0aa-4e2a-a648-8cf1b74a9cee`: startup 70ms; same original cutoff/expiry, sealed five completed IDs plus the sixth queued ID; completed only the sixth, never reclaimed the completed five; stop in 20ms, exit 0. Both new final heartbeats are stopped. Alerts, definitions/version-2 references and evidence IDs survived restart without duplicates.

Both health probes returned HTTP 200, database connected, worker running, detection `enabled_for_approved_new_jobs`, maintenance `paused_for_expiring_local_acceptance`, admission `sealed_job_ids`, no failed/leased/expired jobs, no outbox items. Aggregate queue correctly retained 8 old queued jobs and their ~13,500-second lag. `schema:"0001_foundation"` and `telemetry:"not_implemented"` are legacy platform-health labels, not evidence of missing applied 0002/0003 or failed HTTP ingestion; the separately verified actual ledger contains all three, and `telemetryIngestion:"web_runtime_not_probed"` accurately limits what worker health alone proves. This label inconsistency remains a limitation; no unrelated health rewrite was made.

### Authenticated UI and negative checks

Actual `/app/projects/github-998736528/sentinel/alerts` displayed the two PostgreSQL-backed controlled-test alerts, severity/confidence, observed times, source and immutable version. Inspect alert showed real redacted evidence and the exact rule definition. High-severity filter returned only the suspicious rule; low-severity filter showed the empty state. After worker restart, both original alert/evidence IDs and counts persisted. Real Demo route `/app/projects/orderly-demo/sentinel/activity` retained demo interactions and contained none of the new source/rule data. The shared shell still says Demo mode while the nested live-project page explicitly labels its live data; that pre-existing shell was preserved.

| Negative check | Executed evidence and boundary |
| --- | --- |
| Wrong project alert read / rule edit | Real authenticated HTTP 404 for github-1 GET alerts and POST disable; no writes |
| Wrong project/workspace database read | Real app-role PostgreSQL FORCE RLS SELECT returned zero alert rows in both scopes; no second account used |
| Revoked key | Real ingest HTTP 401 after new-key revoke; native token expiry not implemented |
| Duplicate telemetry/alerts | Actual nonce and event deduplication above; final six events/jobs and two stable alerts |
| Repeated handler | Two actual DetectionStore calls with a completed NEW job's previous token rejected `lease_lost` before evaluation; no new effects. Completed-job replay is not a forced crash/retry test; crash atomicity remains prior H03B evidence |
| Disabled rule | Sixth real event recorded inactive version-3 evaluation, no new match/alert |
| Nonmatching event | Harmless decoy has only not-applicable evaluations; HTTP 200 absent from evidence; no extra alert |
| Provenance/secrets | All six new events source-controlled_test; both alerts controlled_test; read-only scan of all 91 persisted application rows found zero new raw-key or redaction-canary matches |
| Demo separation | Actual Demo page has no new live source/rules; 17 fixture browser regressions also passed |
| Guard exclusion | Actual configured queue adapter rejected module=guard with scope_denied; no Guard fixture/scanner/job was created. Module/kind checks and unit SQL tests remain additional evidence |
| Historical jobs/maintenance | Real SQL claim returned zero while all eight old jobs stayed queued; all 33 historical full-row fingerprints unchanged after both workers, including three old heartbeats and binding cleanup timestamp |
| No incidents/notifications/actions | No incident integration implemented or invoked; notification outbox/attempts remain zero; no provider configured, scanner, deployment or response action |

Actual UI error handling during a deliberately induced outage was NOT RUN; error states passed the separate fixture browser suite. Windows parent IPC delivery is verified; Linux signals and forced process crashes were not exercised here. Actor-hash authentication rule remains unsupported/uncreated. Fixed windows are not sliding windows; source correlation is not actor attribution. Alert confidence is a deterministic configured score, not attack confirmation.

### Independent preservation and cleanup

Fresh read-only sessions after all runtime shutdown matched all 33 historical rows by full-row SHA-256, including every value/timestamp/state of the disabled H02 source, two revoked hashes, six receipts, eight events, eight queued jobs, original binding, three heartbeats, module seed and three ledger rows. Exact catalog/OIDs/columns/indexes/constraints/grants/roles/memberships/default ACL/routines/RLS also match. No historical mutation, deletion or repair occurred. Counts alone were not used as proof.

Baseline `4b288c9def842b52c577f44f640a2848993cd3e660d417139c722d3a013f4f8b`; final independent snapshot `34e2307592281b742908dc2c1d1d7bb6e8511fe2cea068d10bd1228cedbabca5`. Every one of 58 added rows was independently attributed to the exact new source, six captured job/event IDs, two new rule IDs, and two new stopped heartbeat IDs. Added rows: 6 jobs, 6 attempts, 2 heartbeats, 1 source, 1 revoked credential hash, 3 receipts, 6 events, 2 rules, 6 immutable versions, 6 audit entries, 2 alerts, 2 cooldowns, 12 evaluations, 3 evidence links. No added binding, module limit, outbox, notification attempt or suppressed evidence. DEV has zero remaining other sessions. TEST was not accessed.

Cleanup: only NEW credential revoked and source disabled (both authenticated HTTP 200); both NEW rules retained as disabled version 3; all events/jobs/alerts/evidence retained. Both workers exited 0 via graceful IPC. Owned Next app was stopped with SIGTERM; Windows Next graceful signal semantics were not independently proved. Capture listener closed first; its idle inherited IPC kept the helper alive, so its exact verified owned parent was terminated and the child exited on disconnect. No helper, app, worker, emitter, scanner or listeners remain on 3000/3112/3113/3214. Five NEW private approval records are CLOSED_H03C2_ACCEPTANCE with original decisions/actions preserved and active actions empty; worker environment detection/isolation flags are 0. The original runtime expiry was 2026-11-15T04:52:47.583Z; no indefinite pause remains. Existing consumed historical approvals were not reopened.

Private raw logs, credentials, approval/config records, baseline/final snapshots and browser facts are outside the repository and OneDrive with operator/SYSTEM-only ACLs. Ignored helpers contain no credential values. Evidence includes preflight.json, sealed-readiness1/2.json, http-phase1/2-results.json, both worker lifecycle/health/exit logs, negative-results.json, browser-sanitized-evidence.json, browser-demo-evidence.json, cleanup-verification.json and final-independent-proof.json. Do not copy raw snapshots, token hashes, email/session details or approval files into Git.

### Current validation and preserved failures

Executed for this H03C-2 implementation: `npm.cmd run typecheck` PASS exit0; `npm.cmd run lint` PASS exit0; `npm.cmd test` **620/620 PASS, 39 files, 8.86s**, exit0, including **21 runtime-isolation cases**. Production build PASS exit0 using `node --require <private absolute dotenv-isolation preload> node_modules/next/dist/bin/next build`; preload prevents loading private dotenv into the offline build and does not disable compilation/lint/type checks. Existing private Auth configuration was loaded normally by the actual runtime. No source changed after these final checks; only documentation/private acceptance helpers changed during runtime acceptance.

Browser fixture commands: `node --require <private preload> node_modules/@playwright/test/cli.js test --config tests/sentinel/detection.playwright.config.ts --output <private directory>` **6/6 PASS,24.2s**; corresponding telemetry config **5/5 PASS,31s**; original `tests/sentinel/playwright.config.ts` **6/6 PASS,2.0min**, standalone from private CWD with absolute CLI/config/preload paths to keep artifacts private. Total **17/17**. These fixtures are separate from the genuine Auth/HTTP/PG/worker/UI observations above. No populated TEST suite was rerun; H03B remains 24/24 prior PostgreSQL evidence.

Initial failures retained: three type errors corrected; one isolation assertion corrected to expect synchronous cancellation denial; a parallel unit health-CLI test hit its unchanged 5000ms timeout and passed standalone; initial browser CLI output-argument parsing ran zero cases; first original browser run 5 pass/1 unchanged 60000ms timeout, complete standalone rerun 6/6; first private-CWD preload could not resolve repo dependencies, fixed with absolute resolution; one final expiry test safely stopped but reported acceptance_failure in a timer/poll race, corrected to acceptance_expired and final 620/620 passed. No expectations/timeouts were weakened.

Runtime helper failures also retained without replay/reset: read-only evidence queries initially used nonexistent derived suppression_status and nonjoined event origin (42703); corrected only private read queries. Five HTTP events were already persisted before the second read-query failure; recovery sealed those existing IDs without re-ingesting. The first prepared expiry exceeded ten minutes by 11ms due to separately sampled clocks; the gate correctly rejected it before startup. A separate corrected private record reduced expiry by 11ms, retaining identical target/IDs/cutoff. No validation bypass occurred. One combined shell preparation/start command was automatically blocked; separate file preparation, read-only validation and startup succeeded within the same authorization.

Diff/whitespace, real-secret/pattern scans, protected ownership/Demo comparisons, private-artifact tracing and exact file preservation are recorded by the final review. No credentials belong in the 51 public changed/new candidates; no files are staged, committed, pushed or published.


### Exact NEW controlled identities

| Event ID | Kind / status | Durable job ID |
| --- | --- | --- |
| `54ba3757-f25c-441b-b892-f0e69605ea03` | http.suspicious_path / 404 | `61794766-3c4b-4ef9-988e-59fa1463a497` |
| `e0c9e0ee-4127-4a10-9f04-b220595695d5` | http.suspicious_path / 404 | `93bc59af-cd2d-4929-931e-a0f466800370` |
| `c7239601-ccdd-4680-91ef-9960de769d75` | http.request / 503 | `77a53c0d-bb66-4ddb-8b30-76db0b639c21` |
| `42fb1f75-e9a2-4079-9580-d0c98c8d9707` | http.request / 200 | `7a368700-3854-4e01-801d-92164a25def2` |
| `77f13aad-701e-473c-b4da-52e94b8390eb` | ghost.decoy_triggered / 404 | `e7ed8719-6c73-49eb-a6a4-5ede36f99e26` |
| `75b82bf6-8c3e-492b-bc7a-0ceb2614d55f` | http.request / 503 | `fc87e73c-4ad6-4cfc-b39c-74f120909465` |

All six new jobs are completed, attempts=1. Exact protected historical IDs and complete before/after row fingerprints remain in private preflight and independent audit records; none were processed.

## H03C-2 Git and preservation

Branch `feat/sentinel-s03-detection-alerts`; HEAD `cd313ce29aeac865e15cea9abd9c412cb9c2c3cc`; all original 46 changed/new files preserved, zero staged. Five additional public candidates bring the manifest to 51. H03C-2 altered only approved Sentinel/platform isolation/enrollment/lifecycle source, its new tests and requested reports; no Auth/Guard/Canvas/shared routing/Demo body or frozen contract changes. No fetch, commit, push, PR, merge or deployment occurred during H03C-2.

## Copy-ready S03 finalization prompt — requires explicit future owner authorization

```text
Owner authorization: APPROVED for final S03 review, commit, push and PR creation only, subject to successful review. Do not merge.

Continue the existing wetscan-prototype checkout on feat/sentinel-s03-detection-alerts. Preserve every uncommitted change; do not reset, stash, clean or overwrite unrelated work. Read docs/agent-handoffs/HANDOFF_S03.md completely, plus S03 architecture, API, validation, migration review and compatibility documents. Historical HEAD is cd313ce29aeac865e15cea9abd9c412cb9c2c3cc; expect the exact 51-file reviewed manifest and zero staged files unless owner work has changed it.

H03B passed 24/24 real TEST PostgreSQL acceptance previously; H03C-1 applied reviewed DEV 0003 up/up; H03C-2 now passed actual Auth-authorized portfolio HTTP -> PostgreSQL -> exact six admitted jobs -> real worker -> two persisted controlled_test alerts -> authenticated UI and restart/cleanup. Preserve all initial failure evidence. H03C-2 has zero historical changes across 33 rows and catalog/grants/RLS, all 58 added rows attributed, old eight jobs queued, new six completed, new source disabled/key revoked/rules disabled/both new heartbeats stopped. All five new private approvals closed and runtime opt-ins disabled. These are historical observations, not permission to reconnect or restart.

Fetch latest origin/master without overwriting work. Review the entire diff, migrations, RLS/privileges, queue ID/expiry predicates, acceptance configuration, enrollment no-op and lifecycle. Confirm Auth, Guard, Guard worker, Canvas, shared routing, Demo body, frozen S00 contracts and 0001/0002 SQL/provisioning remain untouched. Verify no sensitive raw artifacts, credentials, password files, approvals or DB content are included; inspect .gitignore and production dependency traces. Stop on security issues, unrelated changes or conflicts before publication.

Rerun typecheck, ESLint, complete unit/contracts, production build and 6 S03 + 5 S02 + 6 original browser regressions using private artifact directories and safe offline build environment. Record exact executed counts separately from the historical 24/24 PostgreSQL and H03C-2 runtime evidence. Do not rerun populated database suites, migrations or runtime without separate permission. Preserve honest limitations: native credential TTL absent (revocation bounded lifetime); fixed source windows, unsupported actor correlation; legacy health labels; fixture-only outage UI; no second account, Linux signals or new forced-crash test.

Once review passes, stage only reviewed S03 source/tests/config templates/SQL/docs, conventional commit such as feat(sentinel): add deterministic detection rules and durable alerts, push the existing feature branch, and create a PR to latest master. Include architecture/migration/isolation, real acceptance versus fixtures, all validation evidence, limitations and handoff/report links. Check GitHub mergeability and every available CI/preview status, fix only S03 regressions, and report exact commit SHA/PR URL/check statuses/manifest/risks. Do not manually deploy, change PostgreSQL services/data, start processes, activate scanners, merge or begin S04. Wait for explicit merge approval.
```

The text above is a future owner prompt template. It does not grant publication permission in the current H03C-2 session.


### Final H03C-2 file and process verification

At 2026-11-15T04:55:21Z all owned app/worker/helper parent and child PIDs were absent, with zero listeners on 3000/3112/3113/3214. Final review passed for 51 public candidates: all original 46 preserved, 38 byte-identical, eight modified only within authorized source/docs, plus five intended added candidates. Nothing is staged. Ten real private secret values (including the NEW revoked key), normalized/escaped variants and credential patterns had zero public hits. Five production Sentinel API dependency traces contain zero private env/approval/credential artifacts; local files remain ignored. Protected ownership/frozen contracts, original Demo body and whitespace checks passed. No publication or migration occurred.

Current H03C-2 source checksums (SHA-256, LF-normalized UTF-8):

| File | SHA-256 |
| --- | --- |
| `src/features/sentinel/storage/projects.ts` | `eced0cbb2f73756d7fab40ffce528b0e92058e43574a10a4230a744a7f965a3b` |
| `src/platform/job-admission.ts` | `a9fc92a737892ca6cee9354818ed2e174a4d1e9ac680ee91d25f9203566a3251` |
| `src/platform/queue.ts` | `433c808a8784958076a5ab5347afd809cc7dfb604023f7daa453e0a77a854571` |
| `worker/sentinel/acceptance.ts` | `a5601451ab176373d3785f25e52696c6110aaad9829eb7a70e754b4df540c571` |
| `worker/sentinel/lifecycle.ts` | `10c40946e9f563bf7535895dfdea79475535249cf5198a9d8732094a4035d131` |
| `worker/sentinel/main.ts` | `8c3c1a2f45faa6e51e2cd40de4b0c22e904b810b11db8d78c5a0887fb7639035` |
| `worker/sentinel/runtime.ts` | `20dffa09720dd4d29ce16ee7f83234577f433f492088051f7f93fd5449e70a38` |
| `tests/sentinel/runtime-isolation.test.ts` | `428363af7ff57bc8c2ccc00c9197e0b312227c6dad83a52d570939a36f09c3df` |


## Copy-ready S04 continuation prompt - requires separate explicit owner authorization

```text
Continue WetScan Sentinel only after the owner explicitly authorizes S04. This handoff and successful S03 publication do not grant that permission.

Use the existing wilanta/wetscan-prototype checkout. Read docs/agent-handoffs/HANDOFF_S03.md completely, S03 architecture/API/migration/validation, SENTINEL_COMPATIBILITY.md, the exact S04 playbook/request and current owner boundaries. Verify the actual S03 PR URL, implementation SHA, CI/checks, owner merge approval and merged master SHA from GitHub; the S03 branch was based on Guard G01 master 12b843e2dfda82b3d806625983836fe2ada9ce0f. If S03 remains unmerged or significant regressions/check failures remain, stop S04 and report them. Never merge S03 by inference.

Fetch current master, inspect every working-tree change and preserve all existing work. Create/use a separate Sentinel S04 feature branch only within the existing checkout and the owner's branch instructions; no new clone/application/worktree unless separately authorized. Do not reset, clean, stash, force checkout/push or overwrite unrelated Guard/Auth/Canvas work. Concurrent unreviewed changes require a compatibility review.

S03 historical acceptance: H03B 24/24 real TEST cases; DEV 0003 up/up; H03C-2 real Auth-authorized portfolio HTTP -> PostgreSQL -> six admitted jobs -> two controlled_test alerts -> authenticated UI/restart/cleanup. All 33 old rows and catalog/grants/RLS were preserved; 58 new rows attributed. Old eight H02 jobs remain protected; new six completed. New acceptance source/key/rules disabled/revoked, heartbeats stopped, five approvals closed, runtime opt-ins disabled. Do not reopen consumed approvals, enable credentials, replay historical jobs or rerun populated acceptance fixtures. Final combined non-DB validation: 680 unit/contracts and 60 browser fixtures; real DB/runtime evidence was not rerun after the type-only executor compatibility fix. Legacy JobHandler remains two-argument; LeaseAwareJobHandler supplies current fencing lease.

Implement only the explicitly approved S04 incident/correlation/timeline/query scope. Reuse immutable versioned alerts and their real evidence, existing identity/Auth/Canvas authorization, shared transactions/queue/outbox and separate Sentinel worker. Preserve Guard ownership/process/roles/migration plans and unchanged original UI/Demo boundaries. No Guard pipeline audit or fixture finding becomes an observed runtime attack. Controlled_test provenance stays visible; source correlation is not actor attribution. Review S04 incident-to-alert/evidence ownership, durable idempotency, scope-aware RLS/FKs, cancellation/fencing, lifecycle and retention pins before coding any new migration. Existing S03 retention must not delete evidence referenced by a future incident.

Prepare additive reversible SQL and an exact migration review/plan under new target-specific approval gates; do not connect/provision/migrate TEST or DEV, alter roles/markers/volumes, start live workers/emitters/scanners, process queues or run mutating fixtures without fresh explicit target/scope permission. Guard G01 live integration acceptance remains separately gated. No S05 response/TTL, S06 notification provider/send, Ghost activation, Intelligence feed sync, production monitoring or deployment is implied by S04. Do not invent incident field/state semantics missing from the exact S04 request; progress with independent review and request only necessary owner decisions.

Run authorized non-destructive unit/contract, type/lint/build and original/Guard/Auth/Canvas/Sentinel fixture browser regressions with private artifacts and no live credentials. Keep fixture checks distinct from new real PostgreSQL/runtime acceptance and preserve initial failures. Update an agent-neutral HANDOFF_S04 with exact manifest, branch/HEAD, implementation/contracts/migration plan, actual executed evidence versus NOT RUN, human decisions, limitations, cleanup and a complete continuation prompt. Do not commit/push/open a PR, merge, deploy or advance beyond S04 without the owner's explicit scope. Stop at the next human gate.
```

## Exact changed-file manifest (51 files)

- docs/SENTINEL_INTEGRATION_BACKLOG.md
- docs/SENTINEL_S03_API.md
- docs/SENTINEL_S03_ARCHITECTURE.md
- docs/SENTINEL_S03_MIGRATION_REVIEW.md
- docs/SENTINEL_S03_VALIDATION.md
- docs/agent-handoffs/HANDOFF_S03.md
- eslint.config.mjs
- infra/sentinel/detection.env.example
- migrations/sentinel/0003_detection.down.sql
- migrations/sentinel/0003_detection.up.sql
- scripts/sentinel-detection-preflight.ts
- scripts/sentinel-detection-test.ts
- src/app/api/sentinel/projects/[projectId]/alerts/route.ts
- src/app/api/sentinel/projects/[projectId]/rules/route.ts
- src/app/app/projects/[projectId]/sentinel/[[...section]]/page.tsx
- src/components/views/sentinel.tsx
- src/features/sentinel/components/live-detection.tsx
- src/features/sentinel/components/live-telemetry.tsx
- src/features/sentinel/detection/activation.ts
- src/features/sentinel/detection/evaluator.ts
- src/features/sentinel/detection/model.ts
- src/features/sentinel/detection/retention.ts
- src/features/sentinel/detection/seeds.ts
- src/features/sentinel/detection/store.ts
- src/features/sentinel/detection/time.ts
- src/features/sentinel/detection/validation.ts
- src/features/sentinel/server/detection-http.ts
- src/features/sentinel/storage/projects.ts
- src/features/sentinel/telemetry/store.ts
- src/platform/job-admission.ts
- src/platform/migrations.ts
- src/platform/queue.ts
- tests/canvas/fixture/app/app/detection-fixture/page.tsx
- tests/platform/migrations.test.ts
- tests/sentinel/detection-acceptance-safety.test.ts
- tests/sentinel/detection-acceptance-safety.ts
- tests/sentinel/detection-evaluator.test.ts
- tests/sentinel/detection-fixtures.ts
- tests/sentinel/detection-http.test.ts
- tests/sentinel/detection-migrations.test.ts
- tests/sentinel/detection-postgres.config.ts
- tests/sentinel/detection-store.test.ts
- tests/sentinel/detection.playwright.config.ts
- tests/sentinel/detection.postgres.integration.ts
- tests/sentinel/detection.spec.ts
- tests/sentinel/runtime-isolation.test.ts
- worker/sentinel/acceptance.ts
- worker/sentinel/executor.ts
- worker/sentinel/lifecycle.ts
- worker/sentinel/main.ts
- worker/sentinel/runtime.ts
