# G01 current status - 15 November 2026

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
