> Latest N04 review repair: [revision3 offline verification and inactive approval packet](acceptance/guard-g01/remaining-gates-v3/N04_REPAIR_REVIEW.md). DESIGN_REVIEW_ACCEPTED / RUNTIME_NOT_AUTHORIZED;913 offline tests pass. Revision2 packets are retained historical artifacts; changed implementation hashes require a new exact runtime approval.

## G02 completion campaign — 19 November 2026

**G02 PARTIAL.** Engines (SAST, SCA, Secrets, IaC, SBOM) are REAL_SCANNER_VERIFIED on a real private GitHub repository (vulnerable vs fixed commit) with real worker lease and isolated PostgreSQL 18; Container is FIXTURE_VERIFIED on a digest-bound OCI fixture; failed-scan Retry is implemented. NOT_RUN: scan through the product Auth session and operational database, and Live UI over that real data. Guard remains disabled by default. See [handoff](G02_HANDOFF.md), [release readiness](GUARD_G02_RELEASE_READINESS.md), [validation](GUARD_G02_VALIDATION.md). G03-G06 not started.

> Verified offline continuation: [16-case readiness, current test evidence, approval packets and remaining blockers](GUARD_CONTINUATION_VERIFICATION_20261116.md). Overall G01 remains PARTIALLY COMPLETE; no new live case ran.

> Current instruction, 16 November 2026: owner/Codex owns G02-G06 on `feat/guard-g01-s03-integration`, PR #7. Publication to this existing branch is authorized after verification. Runtime cases still require fresh exact-case approval. See [active continuation and actual audit](GUARD_DEVELOPMENT_CONTINUATION.md) and [executable remaining-gate packages](acceptance/guard-g01/remaining-gates-v2/README.md). Earlier dated restrictions and assignments below are historical where superseded; preservation and runtime safety constraints remain.

> Current continuation (16 November 2026): all G02-G06 work is owned by repository owner/Codex on `feat/guard-g01-s03-integration`, PR #7. See [actual feature audit and preserved constraints](GUARD_DEVELOPMENT_CONTINUATION.md). Historical statuses below are not claims that the interrupted acceptance implementation or live scanners are complete.

# Current continuation: remaining G01 acceptance plans; no new runtime/publication approval

The owner requested four separate remaining-gate plans and fresh specific approvals before runtime mutations. Connected Worker/Auth prepare_only and the old exact-job evidence stay PASS/frozen; its 2 enqueue + 1 launch budget is consumed and must not be repeated. Plans and 16 inactive review intents are in [remaining-gates-v1](acceptance/guard-g01/remaining-gates-v1/README.md). They do not activate permits or authorize jobs/containers/faults. Runtime composition, exact specs, case-scoped controls and final artifact hashes must be completed before final execution approval.

Scope is existing localhost:5432/wetscan_s01_test_guardg01 only. Owner confirms external Sentinel NOT_VERIFIED / TARGET_NOT_IDENTIFIED; never probe historical127.0.0.1:55432, create another DB or change Sentinel. Successful down/up on retained rows is blocked by this preservation constraint; source-orphan reaping needs real one-hour age and a new cleanup-only approval window. These limits are not PASS or an automatic G01 waiver. Overall remains PARTIALLY COMPLETE. Publication will require new explicit permission after the final gate decision; historical permission statements below do not authorize commit/push now. G02-G06 not started.

---

# Current G01 decision: connected Worker/Auth PASS prepare_only; overall PARTIALLY COMPLETE

Verified15November2026: two owner-authenticated enqueue HTTP200 responses produce exactly one durable job; one real worker attempt42.005s completed with fence1, observed lease renewals, running?stopped heartbeat, released lease, matching foundation_prepared audit/coverage and fresh final Auth response. Coverage82/90files,175159bytes, partial; scan failed is the truthful G02-unconfigured result, scanner/sandbox NOT_RUN. Post-run SQL18 preservation passes with matching45e7...1095d hashes, differences[],3retained scans/0active leases; actual full target marker independently verified. Old permit bytes/markers and staging preserved. Runtime budget2enqueue+1launch is consumed; no additional action is authorized. Overall G01 remains PARTIALLY COMPLETE: integrated sandbox, live security-negative and real crash/restart/recovery gates remain open.

Read [final Worker/Auth report](acceptance/guard-g01/WORKER_AUTH_ACCEPTANCE_2c18db66.md) and [active Guard continuation](GUARD_DEVELOPMENT_CONTINUATION.md) for exact evidence, provenance/cleanup limits and remaining work. All conflicting older pending/unknown statements below are retained historical checkpoints.

---

# Latest G01 continuation: deadline repair installed; runtime approval pending

G01 remains **PARTIALLY COMPLETE**. Candidate branch/SHA and writable root were verified; deadline v3 is installed and seven additive regressions preserve the original tests. Prior actual source-only success is carried forward from matching owner response/journal, without another snapshot. Current exact job 2c18db66...b09ee18 requires a new approval packet (SHA256 7f014b026d5e83634f4a2f07b17ffc9a27aabfe5a50f6c7dd029c7d977a2145a). No live enqueue/worker or private permit activation occurred. Integrated sandbox, security-negative and crash/restart gates remain open. See [current checkpoint and validation](acceptance/guard-g01/WORKER_RECOVERY_2c18db66.md); conflicting older statuses below are historical.

---

# Latest verified G01 checkpoint - 2026-11-15T21:03:07.884524+07:00

**Current decision: PARTIALLY COMPLETE.** Read [final acceptance](GUARD_G01_FINAL_ACCEPTANCE.md) first. The historical entries below are retained verbatim; their old UNKNOWN/permission/publication/S03-failure statements are superseded by this checkpoint.

Actual isolated PostgreSQL migration/ledger/FORCE RLS and role app/worker connections verified:14 persistence/queue +11 context/least-privilege checks PASS. After BOTH suites, owner18 observer confirms2retained Guard scans,0active leases; Sentinel fixture/catalog before/after hashes identical45e7cfe26767e26ad96ceda0dd2a53649a10ea7a5453844ac50ee30867e1095d, differences[]. Guard budget1/Sentinel2; canonical migration planb63...5869d unchanged. No existing external Sentinel DB was inspected or mutated. Docker real pinned Official Python control probes6/6 PASS, all6containers removed with ownership/filter verification. Synthetic controls are not connected worker/scanner acceptance.

New default-empty-temp ACL preflight found another account inherited read; Guard now verifies/hardens ONLY new empty snapshot roots before writing source (Windows owner+SYSTEM, POSIX0700). No Auth/Canvas/dashboard/dependency/canonicalSQL source change. Final affected checks:782/782units, typecheck/lint/build PASS; Guard7/Auth21/Canvas17 E2E PASS. S03 fix retained, original6/6 and race3/3 earlier same-sprint PASS; no weakened assertions. Initial new-helper path/mock compatibility failures fixed and recorded.

Owner supplied actual UI preparation draft for inkAja/wdu/main/41861b...0e2b; exact jobed1db523...ccee0c validated offline. Worker/source/preparation/DB-role templates stay WAITING_USER. Read acceptance/guard-g01/WORKER_AUTH_PLAN.md (path relative to docs) for current plan hash and safe single-app readiness/reexport step before any execution approval. NO live worker/enqueue/GitHub snapshot has run; no implicit source/worker/container permission. prepare_only does not execute Docker; integrated foundation composition and remaining live gates are still open. No G02, commit/push/PR/merge/deploy, reset, marker deletion or browser computer control. Existing.env.local remains unread/unmodified; owner-provisioned private purpose values were consumed only internally by the authorized Guard credential loader, never inspected/reported.

---

# Verified PostgreSQL/sandbox acceptance update ? 2026-11-15T20:06:18.619193+07:00

Current decision remains PARTIALLY COMPLETE, no G02/publication. PostgreSQL new target schema/ledger/FORCE RLS and isolated Sentinel fixture preservation are now LIVE_VERIFIED via actual owner18 pgAdmin result. Before/after45e7cfe26767e26ad96ceda0dd2a53649a10ea7a5453844ac50ee30867e1095d match, differences[]. Guard migration checksum8bdea?693b and planb63?5869d match; Guard budget1/Sentinel2. This supersedes pending17/COMMIT-only statuses below.17 session before hash was null and was not counted as preservation;18 uses recorded original06 catalog/data, not assumed source behavior. External Sentinel DB remains unobserved. Docker real isolated synthetic controls6/6 PASS; no connected worker/real GitHub-source execution is claimed. App/worker runtime tests still need manual private password provisioning and a valid renewed exact-target runtime/integration_test permit (old mutation window ended19:59WIB). Never read credentials, delete locks, replay migrations/reset, retry browser computer control, commit/push/merge/deploy or start G02. Read docs/GUARD_G01_FINAL_ACCEPTANCE.md and acceptance package for exact evidence/remaining steps.

---

# Latest G01 acceptance checkpoint ? 2026-11-15T19:53:11.945230+07:00

**This section supersedes historical statuses/publication instructions below.** Read [G01 final acceptance](GUARD_G01_FINAL_ACCEPTANCE.md) and its exact-target SQL/sandbox package. Branch feat/guard-g01-s03-integration remains1b28fb8 with local work; no commit/push/merge/deploy/G02 authorized. S03 is fixed and original6/6 PASS; do not report the historical failure as current.

Real Docker control probes6/6 PASS with pinned Official Python image, private ACL/read-only source, networknone/resource caps/timeout/cancel/OOM/orphan cleanup; filtered verification shows no remaining owned container. This is synthetic enforcement evidence, NOT connected worker/GitHub-source scanning or a production attestation. New G01 PostgreSQL database/roles/baseline/fixture were operator-provisioned under exact approval; original07 failed FORCE RLS for owner INSERT. Separate approved resume uses postgres only for Guard budget1; leaves policies/RLS/canonical migration hashb63?5869d unchanged. Operator13 verified rollback/exact marker/checksums. Owner14 reports COMMIT;17 read-only JSON is still required before accepting Guard migration/preservation. CLI login failure and EEXIST markers remain preserved. Both loopbacks share the PostgreSQL listener; no password reset or secret inspection. App/worker PostgreSQL tests still need manually provisioned guarded credentials. Mutation approval expires19:59WIB15November; no implicit renewal or destructive cleanup.

Overall PARTIALLY COMPLETE. Existing.env.local unchanged; ignored non-secret Guard sidecar prepared. Browser computer control is not retried. Do not rerun bootstrap/resume or delete markers before actual state verification. See the final report for exact commands/hashes/blockers and the gated G02 prompt.

---

# G01 current status - 15 November 2026

## Current finalization status - 15 November 2026

See [GUARD_G01_FINALIZATION.md](GUARD_G01_FINALIZATION.md) for the current audit, implementation, test results and exact remaining approval checklist. Overall **PARTIALLY COMPLETE**, real acceptance **BLOCKED**. Latest user explicitly authorizes candidate commit/push despite the known baseline Sentinel failure; the earlier publication hold below is historical and superseded. No Sentinel fix/assertion edit, G02, real SQL/provider/worker/container operation, merge or deploy is performed. Current old Guard HEAD is92ee6fa, preserved; do not restore historical7207a16 state. New producer is prepare_only, lease getter is now forwarded, snapshot request mismatch/concurrency and sandbox identity/evidence boundaries are fixed; earlier descriptions of missing implementations describe their historical phase.


## Actual integration candidate - 15 November 2026

G01 remains **PARTIALLY_VERIFIED / PUBLICATION BLOCKED**. New branch feat/guard-g01-s03-integration at basef7bfeef contains the reviewed Guard delta plus compatibility tests/docs. Old Guard worktree unchanged.707units/typecheck/lint/build/42focused contracts pass; existing browser59/60pass. S03validation-error race fails its original assertion. User declined Sentinel modification and instructed commit/push held; no Sentinel code fix or new commit/push exists. See [integration validation](GUARD_G01_S03_INTEGRATION_VALIDATION.md) and actual plan JSON (aggregateb63e1e...). All real DB/source/sandbox/connected-worker acceptance remains open. G02 not started.


## Latest resolver/launcher continuation - 15 November 2026

Overall **PARTIALLY_VERIFIED**. GRD-004 now has a concrete Auth-process broker/private-IPC resolver and approved one-job prepare-only launcher/bootstrap, implemented but NOT Live-accepted/activated. Existing Auth remains the only session writer; child receives no Auth/GitHub credentials. No new Auth, dashboard, SQL/shared-source/dependency changes. No secret read or real target operation.

567-unit/typecheck/lint/build and Guard5/Auth21/Sentinel5 fixture browser checks pass. See [worker Auth review](GUARD_G01_WORKER_AUTH_REVIEW.md). GitHub/DB/RLS/Sentinel-preservation/connected-worker/sandbox acceptance remain open. In addition, master advanced externally to S03/f7bfeef, while Guard stays on7207a16. No merge/rebase; baseline alignment, refreshed migration hashes and combined validation are now prerequisite to runtime approval. Historical missing-resolver/interface-only statements below are superseded for implementation, not for acceptance. G02 not started.


## Latest follow-up review - 15 November 2026

Status remains **PARTIALLY_VERIFIED**. Local Git now records Guard commit `7207a16` merged to clean master `12b843e`; the isolated Guard worktree remains on `feat/guard-g01-live-integration`. Publication occurred after the implementation record below and was not performed by this follow-up. Merge does not establish real acceptance. Read [the current preflight](GUARD_G01_ACCEPTANCE_PREFLIGHT.md): GitHub/PostgreSQL/RLS/preservation, concrete worker resolver/launcher and enforcing sandbox remain open.16 focused fixture tests and the migration-plan check pass; both tested Docker endpoints are unavailable. No G02 or real runtime operation starts here.

## Preserved implementation status


**PARTIALLY_VERIFIED.** Worktree `wetscan-guard-g01`, branch `feat/guard-g01-live-integration`, baseline `cd313ce29aeac865e15cea9abd9c412cb9c2c3cc`. No commit/push/PR, DB connection/migration, real provider acceptance, connected worker or scanner execution. G02 has not started. The historical document below is preserved verbatim and does not describe new live acceptance.

| Capability | Implementation | Real acceptance |
| --- | --- | --- |
| GRD-001 snapshot/grants | Backend authorization reuse, bounded commit-pinned source adapter, integrity/coverage/cleanup; source-only approval gate | BLOCKED: exact authorized repository/commit acceptance not run |
| GRD-003 durable persistence | PostgreSQL scoped metadata/CAS/lease fencing/atomic queue admission, proposed roles/RLS/schema/independent ledger | IMPLEMENTED_PENDING_ACCEPTANCE: no DB target approved/connected; SQL doubles only |
| GRD-004 queue/worker | Narrow S01 Guard adapter, lifecycle and prepare handler; real child-process fixture | PARTIALLY_IMPLEMENTED: trusted authorization resolver and connected launcher missing; real durable recovery not verified |
| GRD-005 sandbox | Fail-closed Docker controls/spec/inspection/cleanup with mandatory external attestation | BLOCKED: daemon absent, no production attestor/runtime enforcement acceptance |

547 unit cases pass (489 original +58 added), typecheck/lint/build pass; browser Guard5/Auth21/Canvas17/legacy6/Sentinel5 pass. See [validation](GUARD_G01_VALIDATION.md), [architecture](GUARD_G01_ARCHITECTURE.md), [migration review](GUARD_G01_MIGRATION_REVIEW.md), and [agent-neutral handoff](agent-handoffs/HANDOFF_GUARD_G01.md) for exact commands, honest boundaries and required approvals. Existing Guard UI/Demo, Auth, Canvas, Sentinel, shared platform source/migrations, dependencies and lockfile remain unchanged. Proposed Guard platform-access SQL is a separately reviewed extension, not an applied migration.

---

## Preserved historical Guard implementation record

# Guard implementation status

Implemented on `modul-guard`, based on clean `master` at `1ed845757a9601d1ff25eabb7b05d7e82180d93e`. No reset to a historical commit. No Auth/session/onboarding, Canvas, Sentinel, dashboard, routing, dependency or database-schema changes. The only existing/shared presentation change is four added lines in `src/components/views/guard.tsx`.

## Capability matrix

| Capability                                                                                | Status                                                                   | Evidence / limit                                                                                                                                           |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scoped domain, state machine, path validation, normalization, audit, retest and policy    | REAL_VERIFIED                                                            | Unit tests; these are domain rules, not a deployed security service                                                                                        |
| Opengrep SAST                                                                             | REAL_VERIFIED (controlled fixtures); PORT_READY (Live)                   | v1.33.1, checksum pin, actual positive/negative CLI output                                                                                                 |
| Gitleaks                                                                                  | REAL_VERIFIED (controlled fixtures); PORT_READY (Live)                   | v8.30.1, synthetic custom rule, real match/clean control, no matched value stored                                                                          |
| OSV SCA / inventory                                                                       | REAL_VERIFIED (controlled fixtures); REAL_PARTIAL (integration)          | v2.7.1, public minimist lockfile, actual advisory query, version inventory; severity defaults medium pending CVSS review; licenses unknown unless returned |
| Trivy IaC                                                                                 | REAL_VERIFIED (targeted fixture checks); REAL_PARTIAL (integration)      | v0.76.2, static Terraform only, embedded checks, public-access controls; other findings remain visible                                                     |
| Process-independent worker orchestration                                                  | REAL_PARTIAL                                                             | Injected-port tests exercise grants/snapshots, timeout/cancel/cleanup/partial states; no production daemon, queue leases or cross-instance limits          |
| Guard workbench, history, filters, triage, downloads                                      | DEMO_ONLY                                                                | Browser runtime, synthetic Orderly fixture only, resettable, last 20 jobs; reload clears history honestly                                                  |
| Five Integrity invariants                                                                 | REAL_VERIFIED (in-memory fixtures); DEMO_ONLY (UI)                       | Ownership, workflow bypass, state transition, replay and modification tests; no HTTP or customer mutation                                                  |
| Release evaluation and JSON/HTML evidence                                                 | REAL_VERIFIED (domain); DEMO_ONLY (UI)                                   | PASS/WARN/BLOCK/INCOMPLETE, required coverage, escaped/redacted export, no certification or deployment enforcement                                         |
| DAST scope draft                                                                          | REAL_PARTIAL                                                             | Preview and explicit disabled result, no network request, draft not persisted                                                                              |
| Live DAST/API and authenticated Integrity                                                 | WAITING_ON_DEPENDENCY                                                    | No approved staging proof, test accounts or enforcing outbound sandbox; disabled                                                                           |
| AI guidance                                                                               | REAL_VERIFIED (deterministic fallback); WAITING_ON_DEPENDENCY (provider) | No provider, model, paid API, source export, patch or PR activation                                                                                        |
| Container / SBOM                                                                          | PORT_READY                                                               | No image scan/build or SBOM generation executed                                                                                                            |
| Canvas, Intelligence, Sentinel and CI                                                     | PORT_READY                                                               | Typed unavailable adapters return not_integrated with backlog IDs; no delivery or enforcement claimed                                                      |
| Authorized snapshots, durable storage, queue, production sandbox, schedules and retention | WAITING_ON_DEPENDENCY                                                    | GRD-001..005/022/023 require owner handoff                                                                                                                 |

## What is available in the application

After normal existing Auth/onboarding, open `/app/projects/orderly-demo/guard`. The new workbench uses existing UI and scoped CSS. Quick/Standard/Full select requested engines; only the synthetic SAST parser simulation is available in the browser. Missing engines remain not_configured/skipped, never passed. The separate CLI verification below is not invoked by the web UI.

Start/cancel/reset the workbench simulation, inspect engine coverage/history, filter and review a finding with a reason and actor audit, mark fix pending retest, choose a strict review policy, and download JSON or printable standalone HTML. Generic empty scans never promote verified_fixed. Integrity executes five confirmed in-memory fixture models and displays expected/observed values. AI is off with deterministic guidance. The original Simulate scan, FIND-102 remediation/retest, original reducer and navigation remain operational below the workbench.

Live readiness explains missing integrations and exposes only a staging-scope draft. No user-facing ZIP/local filesystem/arbitrary repository input exists. No Guard API route was added: existing selected GitHub repositories are not an authorized immutable snapshot or a project/job ownership contract. The current shared router exposes Orderly Demo only and was deliberately left unchanged. A real selected repository does not automatically gain Guard results.

## Boundaries that remain

- Demo browser history is not durable and is not synchronized with the legacy walkthrough reducer. Use Reset Guard demo for workbench history and the existing Reset demo for the original walkthrough.
- Fixture harnesses run trusted files on the developer host, not untrusted customer code. Docker daemon is unavailable. OS CPU/PID/network/memory isolation, production leases/retries/rate limits, concurrency accounting and durable cancellation/retention remain platform work. JavaScript target code, npm scripts and Terraform are never executed.
- Snapshot and integration grants must be constructed by a trusted backend after ownership checks. No grant or installation ID supplied by a browser is trusted by a new endpoint; no such endpoint exists.
- DAST defaults disabled. URL validation is not SSRF enforcement; actual DNS answers, connection IPs and redirects require a real egress boundary. No scan of localhost, metadata, internal hosts, unrelated third parties or production was performed.
- Reports store normalized redacted metadata. Temporary raw scanner outputs are disposed, not retained as a forensic artifact store. Recorded artifact digests reference actual temporary CLI output. Fixture content SHA256 is used as evidence version, not represented as a real repository Git commit.
- Online OSV advisories vary over time; real CVSS severity/reachability and license inventory enrichment remain GRD-007/020. Trivy fixed fixture still contains unrelated findings; only targeted public-access checks are asserted absent.
- No automatic patch, PR, CI/deployment check, live evidence persistence, AI provider, notification or Canvas graph implementation is included.

## Owned file manifest

- `docs/GUARD_ARCHITECTURE.md`
- `docs/GUARD_IMPLEMENTATION_STATUS.md`
- `docs/GUARD_TESTING.md`
- `docs/INTEGRATION_BACKLOG.md`
- `src/components/views/guard.tsx`
- `src/features/guard/adapters.ts`
- `src/features/guard/contracts.ts`
- `src/features/guard/dast-scope-form.tsx`
- `src/features/guard/demo-session.ts`
- `src/features/guard/evidence.ts`
- `src/features/guard/integrity.ts`
- `src/features/guard/pipeline.ts`
- `src/features/guard/release.ts`
- `src/features/guard/security.ts`
- `src/features/guard/workbench.module.css`
- `src/features/guard/workbench.tsx`
- `tests/guard/adapters.test.ts`
- `tests/guard/core.test.ts`
- `tests/guard/e2e/guard.spec.ts`
- `tests/guard/evidence/gitleaks-verification.json`
- `tests/guard/evidence/opengrep-verification.json`
- `tests/guard/evidence/osv-verification.json`
- `tests/guard/evidence/trivy-verification.json`
- `tests/guard/fixtures/gitleaks/clean.js`
- `tests/guard/fixtures/gitleaks/exposed.js`
- `tests/guard/fixtures/gitleaks/rules.toml`
- `tests/guard/fixtures/osv/fixed/package-lock.json`
- `tests/guard/fixtures/osv/vulnerable/package-lock.json`
- `tests/guard/fixtures/sast/fixed.js`
- `tests/guard/fixtures/sast/rules.yml`
- `tests/guard/fixtures/sast/vulnerable.js`
- `tests/guard/fixtures/trivy/fixed/main.tf`
- `tests/guard/fixtures/trivy/vulnerable/main.tf`
- `tests/guard/playwright.config.ts`
- `tests/guard/run-e2e.mjs`
- `tests/guard/scanner.config.ts`
- `tests/guard/scanner.integration.ts`
- `tests/guard/setup-tools.ps1`
- `tests/guard/worker.test.ts`
- `worker/guard/additional-fixtures.ts`
- `worker/guard/fixture-runner.ts`
- `worker/guard/gitleaks-fixture.ts`
- `worker/guard/orchestrator.ts`
- `worker/guard/README.md`
