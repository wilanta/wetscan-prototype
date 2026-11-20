## Closure confirmed: deactivation and post-restart persistence

## G02 completion — 19 November 2026

GRD-006..GRD-010: REAL_SCANNER_VERIFIED on a real private GitHub revision (Container FIXTURE_VERIFIED; no owner image). Retry for failed scans implemented as a new linked scan. NOT_RUN: product Auth session → operational DB → Live UI with a stored positive finding. CAN-006 (Guard SAST/SCA/secrets overlay on Canvas) is unchanged by this work. G03 AI/patch/retest, G04 provider enforcement, G05 HTTP invariants and G06 delivery are not started. See [G02 handoff](G02_HANDOFF.md).

Owner supplied actual terminal JSON productEnabled=0, confirmed server Ready, and authenticated GET HTTP200 after restart for e30251691f7c628804b1cdce99fe9afbc87c121ba6fa83131ec92ef13d366e5b. The stored result remains completed_partial/revision7, Opengrep completed/11 files,0 findings, release INCOMPLETE, matching pre-restart API and PostgreSQL. Deactivation and post-restart API persistence are now VERIFIED. Earlier pending reports are retained as historical checkpoints. Evidence: test-results/g02-live-sast-e3025169.CLOSURE.json. No replay or new runtime authority. No independent visual browser/DB observation by agent is claimed. G02 remains PARTIAL; zero finding rows do not establish positive finding persistence or repository safety. G01 remains2/16 PASS.

## G02 actual repository SAST result ? 19 November19:00 WIB

One approved real GitHub SAST run e3025169 reached Docker and PostgreSQL; authenticated Live API and owner SQL agree: completed_partial,82 retrieved files,11 SAST files,0 findings. Agent verified normal physical resource cleanup. Positive finding/evidence persistence is NOT_VERIFIED (zero rows); dedicated worker-heartbeat row absent; actual deactivation and post-restart UI confirmation remain pending. See [validation checklist](GUARD_G02_VALIDATION.md). This is scoped pipeline proof, not G02 COMPLETE. Other engine live runs remain unapproved; container image target absent; transient retry remains unfinished. Do not replay the failed historical job or begin G03 from fixture data.

## G02 physical handoff and coverage checkpoint ? 19 November 2026

Real Docker handoff tests now cover SAST, recursive npm SCA, Secrets, IaC and repository CycloneDX SBOM from OSV inventory, with explicit provider/lease doubles and memory storage. Live UI profiles, severity filters, inventory/SBOM download and durable JSONB metadata are implemented. See [complete requirement checklist](GUARD_G02_VALIDATION.md). Container Live remains blocked: owner has no authorized digest image, and image ingress/vulnerability DB are not qualified. Automatic transient retry remains unimplemented under the maxAttempts1 operational policy. Successful real GitHub?scanner?PostgreSQL?UI acceptance still requires a new approved run; historical scan4e1e38b5 remains failed/STOP. G01 remains2/16 PASS. Older checkpoints below are historical, not current runtime authority.

# Scanner installation and remaining owner setup - 18 November 2026

## First live SAST offline repair - 19 November 2026

G02's first real repository trial failed before source handoff/scanner execution; database persistence and queue/attempt terminal metadata were observed, but live scanning remains NOT_VERIFIED. Keep its exact job and all evidence. The owner disabled scanning again. The proven observability gap is fixed; timeout is an offline-reproduced risk, not a proven historical root cause.

Snapshot acquisition now uses a trusted3-wide limit only in the operational broker, with unchanged45-second budget/60-second grants and existing resource/hash/auth/cleanup controls. Safe source/broker/sandbox/scanner diagnostics are stored for NEW failed jobs; no historical reason is reconstructed. Fencing loss, revocation, output validation and unknown cleanup remain fail-closed.

Current validation:390 Guard tests +516 shared contracts PASS, Live browser6/6, existing prototype/demo browser5/5, typecheck/lint/production build/smoke PASS. The integration source files are fixtures and the Docker/provider interfaces are doubles. Runtime baseline311 files: f80b6b9b9904139d61ec070a1ea5fb43534ae4db204b464dfa03087bd74d1520. [Operator checkpoint](GUARD_G02_LIVE_OPERATOR.md) records the affected files and remaining live prerequisites. No additional G01 case is closed; G01 remains2/16 PASS.

Next integration dependency: fresh qualification of the existing image, current authorized repository/pin and app/worker readiness, then explicit approval for ONE NEW job. No new DB/password provisioning is needed. G03-G06 consumer/AI/provider features must wait for actual findings, not fixture-derived completion claims.


## Guard Live implementation checkpoint â€” 19 November 2026

Owner/Codex continues on feat/guard-g02-g06-integration (base3918f02). No commit/push is implied by this checkpoint. G01 remains PARTIALLY_COMPLETE,2/16 PASS; N01 historical STOP and unresolved recovery transaction are preserved.

| Module | Actual implementation | Remaining live proof / dependency |
|---|---|---|
| G02 | Normal Auth-bound repository admission, pinned source, durable PostgreSQL queue, fenced worker, measured container adapters, persisted scanner results and Live UI. Owner provisioned the separate G02 database and actual app/worker READ ONLY authentication/schema/RLS passed. Controlled synthetic scanner isolation tests passed. | Full policy/sandbox/pin preflight and explicit approval for the first real repository scan. No real repository scanner success is claimed. |
| G03 | Persisted finding-bound deterministic advice, optional consented server-only OpenAI rule-metadata adapter, durable provider-call reservation, advice review, actual recorded-scan comparison, JSON/escaped HTML reports. Fresh Auth is required after provider completion. | No AI credential/provider call verified. Source-bound patch proposal, syntax/test validation, approved GitHub write and verified behavioral retest remain incomplete. Recorded comparison never assigns verified_fixed. |
| G04 | Actual findings drive persisted release evaluation and producer event with enforced=false. | Signed webhook ingress/scheduling, GitHub Checks permissions and writes, required-check enforcement and Vercel integration still unavailable; no enforcement claim. |
| G05 | Existing authorization/target contracts and fail-closed unavailable states remain. | No authorized staging/egress-qualified DAST or HTTP Integrity run; no live proof. |
| G06 | Persisted actual-result producer bundles, dependency inventory, exact-source Canvas mapping with explicit unmatched/ambiguous outcomes. | Delivery remains PENDING_CONSUMER_NOT_CONFIGURED/acknowledged=false. Consumer integration, GitLab and secure ZIP still require implementation/authorization. Sentinel implementation is unchanged. |

The new remediation/report/producer paths are exercised with isolated test records, not presented as live repository evidence. Runtime SQL, password files, application sessions and scanner installation state stay outside Git. Normal operational policy/configuration is separate from historical G01 permits and their acceptance windows.


On feat/guard-mvp-local-demo, the four pinned real CLIs now pass controlled-source installation tests and production normalizers: Opengrep2.0.0 (1 finding, six official JS/Python rules), OSV2.7.1 (5 findings, npm-only offline database), Gitleaks8.30.1 (1 finding, fake credential), Trivy0.76.2 (3 IaC findings). Official binaries/rules/data integrity was verified; local image content ID3608834fae5f966e6380af0c7b2acf71a46af2ac2bac8591be2b0851d501fa51. Physical Docker restrictions, timeout/output/cancellation/OOM and exact-owned cleanup/absence PASS. These are installation fixtures, NOT a real GitHub/DB/UI acceptance.

Normal scanning remains disabled until the isolated operational DB, target-bound app/worker configuration and owner Auth/provider selection in the correct MVP process are actually verified. A READ ONLY catalog observer and NOT_APPROVED new-database SQL are prepared; no SQL/connection/role/password/database change was executed. No G01 credential/private state was copied. The owner port3000 process was untouched. See the [single operator procedure](GUARD_G02_LIVE_OPERATOR.md); do not reinstall scanners manually or create a G01 acceptance packet.

OSV's official npm offline database exceeded the old256MiB limit; operational OSV alone now supports a measured2048MiB bound. Other engines and G01 remain256MiB. All engines passed the45-second bound (OSV16.3s on the fixture). The Trivy normalizer rejects unbound/root findings, but skips the exact explicitly clean directory aggregate. Trusted image entrypoints normalize Windows line endings. Failed installation attempts remain in ignored local reports.

**G01 publication HOLD:** the candidate's398 checkpoint hashes still match. The four-file build/tools subset passed clean-export typecheck/lint/build, but Guard regression was351/352: tests/guard/evidence-retention.test.ts requires ignored test-results/guard-g01-unblock/deadlines-candidate-unit.json in a fresh export. The full checkpoint's prior3 failures and390/391 historical artifact mismatch remain disclosed and unchanged. No staging, commit or push was performed; no PR7 metadata change. Do not copy private/ignored runtime artifacts into Git to force a pass. G01 remains2/16; N01 STOP and old transaction UNKNOWN.

---

## G02 operational wiring update - 18 November 2026

Normal product host/broker/scheduler wiring is implemented and isolated from the G01 fixture/legacy reader. App-role result reads, review and cancellation remain available without scanner readiness. Normal enqueue schedules a bound worker after response; explicit resume only reauthorizes queued/attempt0 normal jobs and never creates another job. Actual current provider grants, DB lease fencing and normal cleanup remain enforced. Full source coverage, engine provenance, inventory and normalized findings use existing Guard storage and Live tabs.

263/263 offline/isolated regression,4/4 browser,typecheck,lint and production build PASS. Docker Server metadata is actually reachable, but scanner installations/physical qualification and operational PostgreSQL/Auth-process connectivity are NOT_VERIFIED. No real repository scan ran. The remaining blockers are infrastructure/configuration, not an unimplemented host callback: isolated wetscan_dev_guardg02 provisioning/role references, pinned scanner images/rules/qualification and legitimate app process startup. See [one operator procedure](GUARD_G02_LIVE_OPERATOR.md), [validation](MVP_VALIDATION.md) and [active plan](GUARD_MVP_THREE_DAY_PLAN.md). Do not substitute fixture success for these missing live observations. G03-G06 actual provider/consumer integrations remain pending; N01/G01 historical status is unchanged.

## Active Live priority ? 18 November 2026

The owner now prioritizes authorized real GitHub scans over further Demo development. The active implementation/remaining-work table and single owner prerequisites list are in [GUARD_MVP_THREE_DAY_PLAN.md](GUARD_MVP_THREE_DAY_PLAN.md). Normal product admission/queue/worker/scanner composition, stored findings/review/reports and six Live tabs are implemented and tested offline. The default runtime remains blocked: normal session-broker/scheduler wiring and measured scanner/DB qualification are still required. No actual CLI/provider/database result is claimed from doubles.

G02-G06 remain PARTIAL. G03 AI/patch/retest, G04 provider enforcement/webhooks, G05 actual HTTP tests and G06 cross-module delivery/GitLab/ZIP remain separate work; a DTO/contract is not a live integration. Current regression/build/browser results are in [MVP_VALIDATION.md](MVP_VALIDATION.md). No G01 packet was repaired; historical N01 STOP/UNKNOWN and G01 2/16 remain unchanged. No runtime approval or live effect is implied by ordinary offline development.

## Active prototype integration â€” 18 November 2026

The MVP now uses the existing authenticated /app/projects/orderly-demo/guard route family, AppShell, DemoProvider and Guard components. Inventory and remediation tools are integrated there; /local-demo/guard is a compatibility redirect only. Completed scans update the existing count once, and Reset demo clears Guard session controls/history. Real-project navigation stays on the selected Live project. Extra multi-engine fixtures retain their development/test production guard.

The [current plan](GUARD_MVP_THREE_DAY_PLAN.md) supersedes earlier standalone-preview instructions below. G01 synchronization is pending explicit checkpoint approval: full regression has 3 failures from one drifted historical observer; 38 protected evidence hashes match, G01 remains 2/16 PASS, and N01 recovery transaction state remains UNKNOWN. No acceptance artifact was repaired or refrozen.

## Active MVP scope â€” 18 November 2026

The owner's latest instruction authorizes G02â€“G06 offline/local development in the separate branch feat/guard-mvp-local-demo. This supersedes older continuation-only branch assignments below for MVP work. No commit/push, provider writes, database operations, G01 acceptance or N01 recovery is authorized. G01 stays PARTIALLY_COMPLETE (2/16 PASS); N01 stays STOP with old transaction outcome unresolved.

The five official G02â€“G06 specifications are preserved byte-for-byte in docs/specs/guard. The dependency map, actual/fixture/blocked classification, next integration steps and full-scope completion requirements are in [the active three-day plan](GUARD_MVP_THREE_DAY_PLAN.md). Owner/Codex owns G02â€“G06; historical assignments do not authorize another developer or external writes.

| Work item | Current functionality / files | Missing integration and next step | Definition of Done |
|---|---|---|---|
| MVP-G02 (GRD-006â€“010) | local-artifacts.ts performs real bounded lockfile inventory; local-fixtures.ts drives four existing parsers with synthetic=true; demo-session.ts/workbench.tsx render coverage/review/history | Qualify existing scanner sandbox independently, wire actual scoped durable worker findings; container/SBOM not configured | Actual approved immutable repository scan with pinned provenance, normalized stored findings, redaction, failure/cleanup evidence and live UI. Inventory alone is not SCA findings. |
| MVP-G03 (GRD-017/018/022) | Local exact-text proposal and deterministic guidance; existing escaped JSON/HTML reports; retest contract refuses insufficient proof | Real consented AI provider, source-bound patch/syntax/test validation, authorized PR write, targeted real retest, scoped durable report downloads | Real finding/proposal/retest evidence at exact revisions; no verified_fixed from local preview; actual provider actions separately approved |
| MVP-G04 (GRD-019/023) | Existing release evaluation and truthful enforced=false reports | Signed/idempotent webhook ingress, durable events, current provider permissions, GitHub checks/required rules, verified Vercel enforcement capability, schedule | Exact-commit checks and actual proven enforcement, with stale/replay/failure handling; evaluation never labelled enforced |
| MVP-G05 (GRD-011/012/014â€“016) | Existing fail-closed DAST scope validation and five confirmed synthetic invariant models | Approved staging, dummy roles, enforcing outbound controls, actual confirmed Canvas plans and cleanup | Actual controlled request/state evidence and before/after invariants; model expectations never presented as live observations |
| MVP-G06 (GRD-002/013/020/021) | Shared workflow navigation; actual local inventory export; typed consumer ports return unavailable | Authorized GitLab/secure ZIP, exact graph-node mapping, Intelligence inventory delivery, versioned durable Sentinel producer and acknowledgement | Actual scoped consumer outcomes and two real repo/ZIP E2Es; unmatched/pending states truthful; no Sentinel implementation changes |

# Canvas and Guard integration register

## Guard ownership and continuation - 16 November 2026

All Guard-owned G02-G06 development now belongs to the repository owner/Codex. Continue the existing `feat/guard-g01-s03-integration` branch and PR #7 as confirmed by the owner; do not create another branch or PR. The [active continuation audit](GUARD_DEVELOPMENT_CONTINUATION.md) supersedes historical handoff assignments and records actual real/demo/missing boundaries. Canvas/Auth/Sentinel ownership and implementations remain preserved. G01 is PARTIALLY COMPLETE; remaining runtime acceptance needs fresh exact-case approval. G02-G06 offline implementation is authorized; no new live scanner, staging request, AI transmission or database mutation is implied.

Each GRD entry below retains the existing contract, file/interface, external dependency, safety limitation, next integration/acceptance work and definition of done. Earlier dated statements are historical scopes, not current live acceptance claims.

## Current G02 offline implementation - 16 November 2026

`worker/guard/scanner-adapter.ts` adds a separate exact-scanner-job authority, pinned image/installation/rule/command provenance, parent-owned immutable source capability, fresh Auth/lease checks, one-shot receipts and the shared one-physical-container registry. Four engine results are normalized, validated against the actual manifest, redacted and bound to provenance. Eight Docker-driver-double regression cases pass; no real scanner ran. `worker/guard/orchestrator.ts` now delays success until cleanup succeeds, preserves partial source coverage, rejects unrelated provenance and stops on cleanup failure.

G02 remains PARTIAL: this adapter still needs durable live worker dispatch integration, actual image/rule/database qualification, unwaived G01 runtime gates, and a fresh scanner-job approval. G03-G06 retain their existing core/demo contracts; DAST staging/egress, real Integrity runner, AI consent/provider, live retests, durable findings and release/Canvas producers remain pending. Local dispatch work is an implementation gap, not an external blocker. Current status and acceptance dependencies are in the active continuation audit; do not reinterpret fixture output as a customer scan.

## Master-preserving integration - 14 November 2026

Source discovery, selected repository authorization, pinned revisions, private caching, background revision checks, layout/grouping and Trust/workflow definition editors are reused inside the master Canvas view. The original Overview, demo reducer/fixtures, Guard/Sentinel workflows and auth/session/account provider remain intact. Projects consumes the existing account context; no second identity/repository store, OAuth flow, graph engine or equivalent Canvas route was added. See [CANVAS_MASTER_INTEGRATION.md](CANVAS_MASTER_INTEGRATION.md) and [CANVAS_VALIDATION.md](CANVAS_VALIDATION.md) for current evidence.

CAN-006/008/015 Guard/Sentinel/Intelligence results remain separate producer integrations; CAN-009 Trust verification remains Not tested and CAN-010 Integrity execution remains Not executed. CAN-004 durable/distributed persistence, CAN-012 source viewing and CAN-017 shared reset remain pending. No dependency is promoted to live verified because its editor or adapter exists. Earlier branch/worktree statements in the register below describe prior phases.

## Performance/cache update - 14 November 2026

Local generated graphs now have an encrypted private filesystem cache, with current GitHub authorization before access, revision checks and explicit refresh/reanalysis. Manual real-project overlays remain tab-memory-only but survive client navigation/revision swaps; they are lost on browser reload. See [CANVAS_PERFORMANCE.md](CANVAS_PERFORMANCE.md). PostgreSQL storage, distributed deduplication/quotas, shared workspace roles, durable overlays/collaboration and automated reanalysis remain future work. GitLab, Guard/Sentinel runners, runtime/deployment verification, Trust testing and Integrity execution remain unavailable.

## Local integration update - 14 November 2026

GitHub login/onboarding and the source-backed Canvas are now connected on `integration/canvas-github-live`. See [integration implementation, verification and limits](CANVAS_GITHUB_INTEGRATION.md). One already selected repository was read from actual GitHub; automated fixtures cover distinct selected repositories and denied access. A second real selection is still required for complete live acceptance.

Only architecture source analysis is connected. Real Guard is **Not yet scanned**, Sentinel is **Monitoring not connected**, Trust verification is **Not tested**, and Integrity/workflow execution is **Not executed**. Demo findings and runtime incidents remain scoped to Orderly Demo. Real edits are tab-memory-only and lost on browser reload/session end. Private generated graph caching is implemented; no database, scanner, LLM or deployment was added. All other backlog items below remain open unless explicitly marked.

Status date: 14 November 2026. Canvas core retains offline support. CAN-001 has local actual-provider evidence for one selected repository; other provider/scanner capabilities remain unverified. Status values describe integration, not UI completeness. Scope: GitHub/GitLab only, no ZIP onboarding. No database migrations or OAuth/session rewrites are included. Source root below is `src/features/canvas/` unless a full repository path is stated.

All external read/write endpoints must authorize workspace + project server-side, pin/attach revision, redact source/secrets, bound payloads and invalidate access after revocation. Integration tests must include a different workspace, unauthorized project, revoked repository and stale revision. Browser tokens are never an accepted handoff. `[ ]` items below are **future owner work**, not implemented claims.

| ID / integration / owner                                              | Status / current UI                                                                                                              | Files, interface and contract                                                                                                                | Checklist and objective acceptance                                                                                                                                                                                                                                                                                                                   | Regression fixture / risk                                                                                                                        |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **CAN-001** Authorized GitHub snapshots — Daud / Auth & Project       | `LOCAL_LIVE_VERIFIED` for one selected GitHub repository; second repository fixture-verified, second live selection pending      | `server/github-reader.ts` implements the existing reader; existing auth/profile and GitHub App helpers; pinned snapshot -> existing analyzer | [x] Session/onboarding/selection checks; [x] revalidate user/App grants; [x] repository-scoped read token; [x] bounded SHA/tree/blob retrieval; [x] denial/revocation/revision/partial tests; [ ] second selected live repository. See CANVAS_GITHUB_INTEGRATION.md.                                                                                 | `tests/canvas/github-reader.test.ts`, `tests/e2e/github-canvas.spec.ts`; opt-in actual provider check in `tests/canvas/github-live.check.ts`.    |
| **CAN-002** GitLab reader / installation — Project integration        | `PORT_READY`; no GitLab OAuth promise; synthetic GitLab demo remains                                                             | Same snapshot reader and `sourceKind: gitlab`, repositoryRef, revision, branch, listFiles/readTextFile                                       | [ ] Implement authorized reader and provider revocation; [ ] pin commit; [ ] test group/project permissions. Done when real authorized GitLab source reaches Canvas with no browser token and denial tests pass.                                                                                                                                     | Snapshot adapter tests; provider behavior has not been exercised.                                                                                |
| **CAN-003** Real project route / workspace context — Daud / Dashboard | `LOCAL_LIVE_VERIFIED` for one source-backed route; selected GitHub repository links use the existing dashboard account selection | `/app/projects/github-<id>/canvas`; `server/project-canvas.tsx`; validated serializable `initialGraph`                                       | [x] Server session and project authorization; [x] server source analysis; [x] scoped graphs; [x] all lenses; [x] separate demo; [x] private authorized graph cache. Second live repository remains pending selected credentials.                                                                                                                     | Real route/onboarding browser test with isolated provider; separate actual GitHub acceptance check.                                              |
| **CAN-004** PostgreSQL snapshots / overlays — Platform / DB           | `PARTIALLY_INTEGRATED`; encrypted local generated-graph store; demo browser edits and real tab-memory edits                      | `server/graph-cache.ts`, `graph-service.ts`, `cache-contracts.ts`; `adapters/persistence.ts`                                                 | [x] Scoped versioned private generated-graph cache; [x] atomic writes/limits; [x] fresh authorization; [ ] PostgreSQL schema, durable edits, optimistic concurrency and cross-device access.                                                                                                                                                         | Cache isolation/restart-instance/version/single-flight tests and actual local restart acceptance; PostgreSQL remains future work.                |
| **CAN-005** Webhook reanalysis — Project integration                  | `PORT_READY`; internal fixture regeneration / local CLI only                                                                     | Snapshot reader + `discovery/analyzer.ts`; revision, analyzerVersion, evidence, orphan diagnostics                                           | [ ] Verify webhook signature; [ ] queue bounded pinned revision; [ ] reject replay/out-of-order downgrade; [ ] reconcile overlays. Done when valid change refreshes graph and manual notes survive, invalid webhook causes no analysis.                                                                                                              | deterministic fixture regeneration and orphan-annotation tests. No webhook route or worker.                                                      |
| **CAN-006** Guard SAST/SCA/secrets overlay — Guard                    | `DEMO_ONLY`; real/snapshot `Not yet scanned`; demo synthetic findings                                                            | `contracts.ts` `GuardFindingsOverlaySource`; `types.ts` `SecurityOverlay`, `FindingSummary`; `service.ts`, `adapters/overlay-validation.ts`  | [ ] Supply scoped findings with severity/status/source/evidenceType/evidence/nodeId/priority/simulated=false; [ ] revision/staleness policy; [ ] fail/empty/partial behavior. Done when pinned actual Guard results map to real graph IDs and synthetic data is rejected outside demo.                                                               | `models.test.ts` failed/stale/mode gates; `canvas.spec.ts` snapshot isolation. Scanners not implemented here.                                    |
| **CAN-007** Verified remediation / retest — Guard                     | `DEMO_ONLY`; legacy View evidence/example remediation links; no real retest action                                               | `adapters/demo-source.ts`, `components/inspector.tsx`; Guard finding href, finding status, revision and external retest evidence             | [ ] Actual authorized retest job/status/evidence contract; [ ] invalidate old result on new commit. Done when real runner evidence alone changes status, never clicking a link/model definition.                                                                                                                                                     | Legacy walkthrough + demo reducer tests. Example changes cannot be labeled production fixes.                                                     |
| **CAN-008** Sentinel incidents / telemetry — Sentinel                 | `DEMO_ONLY` for Orderly Demo; **live: Sentinel-backed overlay IMPLEMENTED (S10, DEV_ACCEPTED)**; `Monitoring not connected` when storage/sources are absent | `canvas/adapters/sentinel-overlay.ts`, `components/sentinel-coverage.tsx`, `components/live-canvas.tsx` (`ports.overlays`); server: `features/sentinel/canvas/{mapping,overlay-store}.ts`, `server/canvas-overlay-http.ts`, `GET /api/sentinel/projects/[projectId]/canvas?revision=` | [x] Scoped node-linked incidents with real source/timestamp/evidence; [x] distinguish not_monitored/stale/failed/partial/available; [x] authorized incident detail link; [ ] authenticated real-session acceptance (`NOT_RUN`). | `tests/sentinel/canvas-mapping.test.ts`, `canvas-overlay-http.test.ts`, `canvas-overlay-client.test.ts`, `s10.spec.ts`, `s10.postgres.integration.ts`. See SENTINEL_S10_INTEGRATION_MATRIX.md. |
| **CAN-009** Authorization test runner — Guard Trust                   | `PORT_READY`; expected matrix editable/exportable; Observed Not tested; Run verification disabled                                | `contracts.ts` `GuardTrustTestSource`; `TrustModel`, `TrustVerificationResult`; `trust/model.ts`, `components/trust-lens.tsx`                | [ ] Extend result contract with actual request/evidence refs, confirmed-policy hash, revision and testedAt; [ ] enforce authorized dummy scope; [ ] render real observed results only for matching policy. Done when a real runner reproduces a violation/retest and editing expected policy invalidates observation.                                | Trust model tests + Trust E2E. Current sample outcome is explicitly separate and simulated. No authorization requests sent.                      |
| **CAN-010** Guard Integrity workflow execution — Guard Integrity      | `PORT_READY`; models policy_defined; plans not_executed; Run workflow test disabled                                              | `contracts.ts` `GuardIntegrityTestSource`; `WorkflowModel`, `WorkflowTestResult`; `workflows/model.ts`, `components/workflow-lens.tsx`       | [ ] Bind endpoint/account placeholders to consented staging; [ ] return redacted request/response + state evidence, policy hash and revision; [ ] model real test_pending/test_failed/test_passed independently of definition. Done when runner enforces invariant and Canvas renders evidence-backed outcome; editing model invalidates old result. | Three template/export tests + workflow E2E request assertions. Plans do not run transactions/requests; results currently missing/simulated only. |
| **CAN-011** Deployment/environment metadata — Provider integration    | `PORT_READY`; Hosting configuration inferred; Production no map                                                                  | `discovery/analyzer.ts`, `ArchitectureGraph.environment`, `Evidence.kind:provider/runtime`                                                   | [ ] Authorized provider adapter with revision/environment/provider evidence; [ ] separate configured from deployed/reachable. Done when an actual provider read grounds displayed environment and disconnect yields unknown.                                                                                                                         | A/B config tests and production empty-state E2E. No cloud API calls.                                                                             |
| **CAN-012** Authenticated source viewer — Daud / Project              | `WAITING_ON_DEPENDENCY`; relative locations can be copied; no code browser                                                       | `components/evidence-panel.tsx`, `Evidence.sourcePath/startLine/sourceRevision`, snapshot reader                                             | [ ] Server authorizes exact commit+path on each request; [ ] safe path and secret exclusions; [ ] revoke/deny behavior. Done when clicking location opens correct authorized revision without token/source exposure to another workspace.                                                                                                            | Evidence E2E and unsafe-path tests. No raw source snippets in current UI/exports.                                                                |
| **CAN-013** Optional AI explanations — Optional AI layer              | `PORT_READY`; deterministic descriptions; no LLM selected or called                                                              | `ComponentNode.description`, `Evidence.summary`, future provider-agnostic explanation port                                                   | [ ] Explicit opt-in, redacted context, cost limit and provenance; [ ] keep explanation separate from observations/enforcement. Done when selected provider can be replaced and missing provider leaves discovery fully functional.                                                                                                                   | No-network workflow/discovery tests; no paid dependency or endpoint placeholder pretending to work.                                              |
| **CAN-014** Shared graph / collaboration — Workspace backend          | `PORT_READY`; single-browser demo / session-memory snapshot edits                                                                | `CanvasPersistencePort`, `UserCanvasOverlay`, history in `hooks/use-canvas.ts`                                                               | [ ] Workspace roles/authorization; [ ] revision conflicts, audit log and optimistic version; [ ] sharing revocation. Done when two authorized clients reconcile without silently overwriting and third workspace is denied.                                                                                                                          | Scope/collision/manual edit tests. Undo currently local manual history only, not external operations.                                            |
| **CAN-015** Knowledge / Intelligence overlay — Sentinel Intelligence  | `DEMO_ONLY`; legacy synthetic advisory links only; no real knowledge overlay                                                     | Future typed Intelligence overlay source; demo finding compatibility in `adapters/demo-source.ts`                                            | [ ] Scope inventory/advisory evidence + version ranges; [ ] distinguish advisory/potential exposure/reachable exploit/incident. Done when real inventory maps with provenance and no synthetic advisory reaches live graphs.                                                                                                                         | demo isolation tests. No advisory fetching/mapping engine added.                                                                                 |
| **CAN-016** Extended discovery adapters — Canvas                      | `PARTIALLY_INTEGRATED`; coverage lists generic frameworks/OpenAPI as partial/unsupported                                         | `discovery/{source-parser,analyzer}.ts`; `DiscoveryCoverage`, `AnalysisDiagnostic`                                                           | [ ] Framework-specific Express/Nest/Vite routes; [ ] OpenAPI endpoints; [ ] complete TS alias/extends/module/shadow analysis and additional schemas. Done per capability only after supported/malformed fixtures assert concrete evidence and no fabricated relationships.                                                                           | A–E + route/parser tests. Current general framework detection is manifest-only; monorepo/package grouping and simple wildcard aliases work.      |
| **CAN-017** Shared demo reset notification — App shell owner / Canvas | `WAITING_ON_DEPENDENCY`; existing Reset demo resets demo reducer; Reset Canvas edits separately clears annotation namespace      | Owner future reset event/context version; `hooks/use-canvas.ts` and `adapters/persistence.ts` consume it                                     | [ ] Agree cross-feature reset event; [ ] clear versioned Canvas annotations even while Canvas is unmounted; [ ] preserve dialog/focus behavior. Done when one shell reset clears both states, including after navigation/reload.                                                                                                                     | Canvas reset E2E + demo reducer tests. Shell is owned by Daud and unchanged; do not infer event authorization.                                   |

## Integration order

1. CAN-001 + CAN-003 are implemented for local GitHub source reading. See [CANVAS_GITHUB_INTEGRATION.md](CANVAS_GITHUB_INTEGRATION.md) for current evidence and the remaining second-live-repository acceptance check. CAN-002 (GitLab) remains separate.
2. Platform agrees storage/concurrency for CAN-004 before any migration. Private graph access is permission-checked on every request.
3. Guard and Sentinel supply CAN-006/008 result adapters. They cannot replace generated architecture; `loadCanvas` validates graph/source scope and rejects demo results outside demo.
4. Trust and Integrity runners need expanded evidence-bearing result contracts (CAN-009/010) and user-confirmed policies. Until then test plans remain unexecuted.
5. Remaining provider metadata, source viewer, webhook and collaboration integrations require their own permission-aware acceptance tests. No item becomes LIVE_VERIFIED solely because a UI port exists.


------


# Guard integration backlog

Current G01 finalization: see [GUARD_G01_FINALIZATION.md](GUARD_G01_FINALIZATION.md). Local producer/resolver/launcher, strict request/latest-lease forwarding and daemon/image evidence binding verified. Status PARTIALLY COMPLETE; Live GitHub/DB/RLS/worker/sandbox acceptance still BLOCKED. Latest user permits candidate publication despite known Sentinel baseline failure; prior hold below is superseded. No Sentinel/G02 work or runtime permission inferred.


No external issues created. Dependencies require owner handoffs. G01 adds Guard-only implementation and proposed, UNAPPLIED schema/role/platform-access artifacts; no Auth/shared platform/Sentinel source or applied schema changes. See GUARD_G01_MIGRATION_REVIEW.md for the explicit approval gate.

## GRD-001 - Authorized GitHub snapshot and project grants

- State: PARTIALLY_VERIFIED / WAITING_ON_ACCEPTANCE (G01 update below); historical port-only baseline retained in earlier commits.
- Owner/dependency: owner/Codex (Guard implementation). External integration dependency: Daud / Auth owner.
- Contract: SnapshotPort, Grant: actor/workspace/project/mode/operations/expiry; exact commit/file hashes.
- Source (relative to src/features/guard unless explicitly prefixed): contracts.ts (Grant/SnapshotPort), security.ts (authorize); Auth owner handoff; worker/guard/orchestrator.ts.
- Safety/storage/environment: Server verifies installation/user access and project ownership; token server-only. Existing selected repository is insufficient.
- Tests / acceptance / definition of done: Cross-workspace/expired grants denied; exact permitted commit fetched with file limits and cleanup.
- Issue reference: not created.

- G01 update (15 November 2026): Implementation added in src/features/guard/live/{project,github-source,snapshot,source-acceptance}.ts. Existing Auth/Canvas authorization and transport reused; bounded immutable snapshots, integrity and partial coverage tested with provider doubles/local files. PARTIALLY_VERIFIED; real GitHub acceptance remains BLOCKED pending exact repository/current commit/operator approval. Worker authorization broker is still a cross-owner dependency. See docs/agent-handoffs/HANDOFF_GUARD_G01.md and docs/GUARD_G01_VALIDATION.md.

## GRD-002 - GitLab repository reader

- State: PORT_READY / WAITING_ON_DEPENDENCY. Fixture verification never enables live.
- Owner/dependency: owner/Codex (Guard implementation). External integration dependency: Auth/integrations owner.
- Contract: SnapshotPort; gitlab, immutable commit, repository ID.
- Source (relative to src/features/guard unless explicitly prefixed): contracts.ts (SnapshotPort/RepositoryRef).
- Safety/storage/environment: Existing integration/explicit handoff only; no second Auth system.
- Tests / acceptance / definition of done: Unauthorized repository denied; commit snapshot disposed.
- Issue reference: not created.

## GRD-003 - Durable Guard persistence

- State: PARTIALLY_VERIFIED / WAITING_ON_ACCEPTANCE (G01 update below); historical port-only baseline retained in earlier commits.
- Owner/dependency: owner/Codex (Guard implementation). External integration dependency: Backend/storage owner.
- Contract: PersistencePort; scoped job/finding/evidence/audit/idempotency/version.
- Source (relative to src/features/guard unless explicitly prefixed): contracts.ts (PersistencePort), pipeline.ts (DemoMemoryStore demo-only).
- Safety/storage/environment: Schema requires owner approval; encrypted evidence and retention; demo memory is not durable.
- Tests / acceptance / definition of done: Restart/multi-instance persistence; tenant isolation and optimistic concurrency tested.
- Issue reference: not created.

- G01 update (15 November 2026): PostgresGuardStore and independent Guard ledger/schema/RLS/role proposals prepared. Atomic scan+queue admission, CAS/active-lease fencing, evidence/audit immutability and rollback tested using SQL doubles. IMPLEMENTED_PENDING_ACCEPTANCE; no database connected or migration applied. Exact target/hash/platform-owner approval plus real RLS/preservation tests required. See docs/agent-handoffs/HANDOFF_GUARD_G01.md and docs/GUARD_G01_VALIDATION.md.

## GRD-004 - Production queue and worker

- State: PARTIALLY_VERIFIED / WAITING_ON_ACCEPTANCE (G01 update below); historical port-only baseline retained in earlier commits.
- Owner/dependency: owner/Codex (Guard implementation). External integration dependency: Platform owner.
- Contract: QueuePort; scoped job ID/lease/attempts/cancel/dedupe.
- Source (relative to src/features/guard unless explicitly prefixed): contracts.ts (QueuePort), worker/guard/orchestrator.ts.
- Safety/storage/environment: No scanner in Next request; bounded concurrency/backoff/resources/cleanup; no queued secrets.
- Tests / acceptance / definition of done: Duplicate requests yield one job; crash retry and cancel tested.
- Issue reference: not created.

- G01 update (15 November 2026): GuardPostgresQueue reuses S01 durable contracts and lease methods, overrides only admission/claim; separate lifecycle/IPC/prepare handler and real empty-queue child-process restart fixture added. PARTIALLY_IMPLEMENTED: concrete trusted Auth resolver/process composition missing; main launcher refuses activation. Real queue/lease/crash acceptance and orphan supervisor remain unverified. See docs/agent-handoffs/HANDOFF_GUARD_G01.md and docs/GUARD_G01_VALIDATION.md.

- G01 resolver follow-up (15 November 2026): concrete Auth-process private-IPC broker/resolver and bounded exact-job prepare-only launcher/bootstrap added;567-unit/Guard5/Auth21/Sentinel5 fixture checks pass. No Live activation/target acceptance. Existing Auth unchanged; no credential in queue/child. Master S03 drift now requires approved baseline alignment, new plan hashes and combined validation before runtime. See GUARD_G01_WORKER_AUTH_REVIEW.md. Earlier interface-only notes are historical.

- G01+S03 candidate (15 November 2026): authorized isolated f7bfeefcandidate prepared with old worktree unchanged;707units/typecheck/lint/build/42focused contracts pass. Existing browser59/60pass; unchanged S03form/loading validation race fails. User declined Sentinel changes and held commit/push. Actual Guard aggregateb63e1e...; real runtime/DB/source/sandbox acceptance still unapproved. See GUARD_G01_S03_INTEGRATION_VALIDATION.md.

## GRD-005 - Hardened scanner sandbox

- State: PARTIALLY_VERIFIED / WAITING_ON_ACCEPTANCE (G01 update below); historical port-only baseline retained in earlier commits.
- Owner/dependency: owner/Codex (Guard implementation). External integration dependency: Platform/security owner.
- Contract: SandboxPort; readonly/nonroot/egress/cpu/memory/pids/timeout.
- Source (relative to src/features/guard unless explicitly prefixed): contracts.ts (SandboxPort), security.ts, worker/guard/README.md.
- Safety/storage/environment: Docker daemon unavailable. No host credentials/socket; tenant isolation and DNS/IP enforcement required.
- Tests / acceptance / definition of done: Host/path/metadata/network escape tests; OOM/timeout/cancel cleanup verified.
- Issue reference: not created.

- G01 update (15 November 2026): DockerGuardSandbox now requires digest-pinned spec, nonroot/read-only/network-none/resource controls, actual configuration inspection and external attestation; no host fallback. Adapter/driver-double tests pass. BLOCKED for real enforcement: daemon unavailable, production attestor/probe image/private source ACL+UID/Desktop mount proof needed. No scanner/container ran. See docs/agent-handoffs/HANDOFF_GUARD_G01.md and docs/GUARD_G01_VALIDATION.md.

## GRD-006 - Opengrep SAST worker

- State: REAL_VERIFIED for controlled CLI fixture; REAL_PARTIAL / WAITING_ON_DEPENDENCY for Live. Fixture verification never enables live.
- Owner/dependency: owner/Codex (Guard implementation). External integration dependency: Guard/platform owner.
- Contract: ScannerPort, normalizeOpengrep; version/rule hash.
- Source (relative to src/features/guard unless explicitly prefixed): evidence.ts (normalizeOpengrep), worker/guard/fixture-runner.ts, tests/guard/evidence/opengrep-verification.json.
- Safety/storage/environment: Trusted fixture verification only until GRD-001/004/005; review LGPL/rule rights.
- Tests / acceptance / definition of done: Actual vulnerable/fixed fixture CLI output, provenance/digest; no target scripts.
- Issue reference: not created.

## GRD-007 - OSV SCA and inventory

- State: REAL_VERIFIED for controlled CLI fixture; REAL_PARTIAL / WAITING_ON_DEPENDENCY for Live. Fixture verification never enables live.
- Owner/dependency: owner/Codex (Guard implementation). External integration dependency: Guard/Intelligence owner.
- Contract: normalizeOSV, InventoryItem; ecosystem/name/version/license/sourcePath.
- Source (relative to src/features/guard unless explicitly prefixed): evidence.ts (normalizeOSV/normalizeOSVInventory), worker/guard/additional-fixtures.ts, tests/guard/evidence/osv-verification.json.
- Safety/storage/environment: Pinned fixture binary and public advisory query verified; production advisory cache, CVSS mapping, license enrichment and enforcing egress not configured.
- Tests / acceptance / definition of done: Pinned database, real lockfile scan and validated advisory inventory.
- Issue reference: not created.

## GRD-008 - Gitleaks secret detection

- State: REAL_VERIFIED for controlled CLI fixture; REAL_PARTIAL / WAITING_ON_DEPENDENCY for Live. Fixture verification never enables live.
- Owner/dependency: owner/Codex (Guard implementation). External integration dependency: Guard/platform owner.
- Contract: normalizeGitleaks; rule/location, no matched value.
- Source (relative to src/features/guard unless explicitly prefixed): evidence.ts (normalizeGitleaks), worker/guard/gitleaks-fixture.ts, tests/guard/evidence/gitleaks-verification.json.
- Safety/storage/environment: Redact before storage/log/UI; pinned binary/rules license review.
- Tests / acceptance / definition of done: Controlled match/clean CLI run; matched value never retained.
- Issue reference: not created.

## GRD-009 - Trivy IaC

- State: REAL_VERIFIED for controlled CLI fixture; REAL_PARTIAL / WAITING_ON_DEPENDENCY for Live. Fixture verification never enables live.
- Owner/dependency: owner/Codex (Guard implementation). External integration dependency: Guard/platform owner.
- Contract: normalizeTrivy iac; target/rule/severity/provenance.
- Source (relative to src/features/guard unless explicitly prefixed): evidence.ts (normalizeTrivy), worker/guard/additional-fixtures.ts, tests/guard/evidence/trivy-verification.json.
- Safety/storage/environment: Pinned binary/rule/database versions; no target execution.
- Tests / acceptance / definition of done: Actual bad/good IaC fixtures and partial-failure coverage.
- Issue reference: not created.

## GRD-010 - Container and SBOM

- State: PORT_READY / WAITING_ON_DEPENDENCY. Fixture verification never enables live.
- Owner/dependency: owner/Codex (Guard implementation). External integration dependency: Guard/Intelligence owner.
- Contract: ScannerPort container/sbom; InventoryItem/artifact digest.
- Source (relative to src/features/guard unless explicitly prefixed): contracts.ts (ScannerPort/InventoryItem), evidence.ts (normalizeTrivy container parser only).
- Safety/storage/environment: No host socket or arbitrary builds; authorized immutable image and license provenance.
- Tests / acceptance / definition of done: Digest-pinned image scan/SBOM and honest unsupported coverage.
- Issue reference: not created.

## GRD-011 - Scoped staging DAST

- State: PORT_READY / WAITING_ON_DEPENDENCY. Fixture verification never enables live.
- Owner/dependency: owner/Codex (Guard implementation). External integration dependency: Platform/security owner.
- Contract: DastScope, EgressPort, ScannerPort dast.
- Source (relative to src/features/guard unless explicitly prefixed): security.ts (allowDast), dast-scope-form.tsx, contracts.ts (DastScope/EgressPort).
- Safety/storage/environment: Disabled; origin/path/method/consent/window/rate restrictions; DNS/IP/rebind/redirect enforcement at socket layer.
- Tests / acceptance / definition of done: Private/metadata/rebind/redirect denied; authorized synthetic baseline executed.
- Issue reference: not created.

## GRD-012 - Authenticated DAST accounts

- State: PORT_READY / WAITING_ON_DEPENDENCY. Fixture verification never enables live.
- Owner/dependency: owner/Codex (Guard implementation). External integration dependency: Security/test owner.
- Contract: DastScope syntheticAccounts; encrypted expiring handles.
- Source (relative to src/features/guard unless explicitly prefixed): contracts.ts (DastScope/TestPlan), dast-scope-form.tsx.
- Safety/storage/environment: No real users/payment/production mutations; no account secrets in reports.
- Tests / acceptance / definition of done: Dummy account rotation/cleanup, approved scope and safe stop verified.
- Issue reference: not created.

## GRD-013 - Canvas risk overlays

- State: PORT_READY / WAITING_ON_DEPENDENCY. Fixture verification never enables live.
- Owner/dependency: owner/Codex (Guard implementation). External integration dependency: Canvas owner.
- Contract: CanvasPort.publish; nodeId/findingIds/scope/commit.
- Source (relative to src/features/guard unless explicitly prefixed): contracts.ts (CanvasPort/CanvasOverlay), adapters.ts (unavailableCanvas).
- Safety/storage/environment: No graph/discovery/shared routes edits; stable component mapping required.
- Tests / acceptance / definition of done: Correct commit/node mapping; scoped authorization.
- Issue reference: not created.

## GRD-014 - Canvas Trust plans

- State: PORT_READY / WAITING_ON_DEPENDENCY. Fixture verification never enables live.
- Owner/dependency: owner/Codex (Guard implementation). External integration dependency: Canvas owner.
- Contract: CanvasPort.plans; InvariantPlan confirmedBy/kind/expectedStatus.
- Source (relative to src/features/guard unless explicitly prefixed): contracts.ts (TestPlan/InvariantPlan/CanvasPort), adapters.ts.
- Safety/storage/environment: User confirmation required; AI does not authorize execution.
- Tests / acceptance / definition of done: Unconfirmed/mismatched plans denied; ownership tests.
- Issue reference: not created.

## GRD-015 - Canvas Workflow import

- State: PORT_READY / WAITING_ON_DEPENDENCY. Fixture verification never enables live.
- Owner/dependency: owner/Codex (Guard implementation). External integration dependency: Canvas owner.
- Contract: InvariantPlan; workflow version/transitions.
- Source (relative to src/features/guard unless explicitly prefixed): contracts.ts (TestPlan), integrity.ts (synthetic only).
- Safety/storage/environment: No invented graph inference; explicit versioned handoff required.
- Tests / acceptance / definition of done: Confirmed transitions trace to source workflow/version.
- Issue reference: not created.

## GRD-016 - Live Integrity runner

- State: PORT_READY / WAITING_ON_DEPENDENCY. Fixture verification never enables live.
- Owner/dependency: owner/Codex (Guard implementation). External integration dependency: Guard/security owner.
- Contract: InvariantPlan, IntegrityResult, RetestResult.
- Source (relative to src/features/guard unless explicitly prefixed): integrity.ts, contracts.ts (TestPlan), tests/guard/core.test.ts.
- Safety/storage/environment: Only in-memory fixtures now; GRD-005/011/012 required for live.
- Tests / acceptance / definition of done: Five invariants on approved staging dummy resources; expected/observed evidence and cleanup.
- Issue reference: not created.

## GRD-017 - AI provider/privacy opt-in

- State: PORT_READY / WAITING_ON_DEPENDENCY. Fixture verification never enables live.
- Owner/dependency: owner/Codex (Guard implementation). External integration dependency: Product/privacy owner.
- Contract: AIProviderPort configured=false; redactedSummary/untrusted output.
- Source (relative to src/features/guard unless explicitly prefixed): contracts.ts (AIProviderPort), adapters.ts (disabledAI), evidence.ts (guidance).
- Safety/storage/environment: Provider undecided; no raw source/secrets; consent/budget/retention required.
- Tests / acceptance / definition of done: AI-off guidance; opt-in/redaction/limits/provider failure tested.
- Issue reference: not created.

## GRD-018 - Safe patch and targeted retest

- State: PORT_READY / WAITING_ON_DEPENDENCY. Fixture verification never enables live.
- Owner/dependency: owner/Codex (Guard implementation). External integration dependency: Guard/repository owner.
- Contract: RetestResult; before/after/targeted evidence/expected/observed.
- Source (relative to src/features/guard unless explicitly prefixed): evidence.ts (applyRetest/guidance), pipeline.ts (triage).
- Safety/storage/environment: No autonomous patch/PR/merge. Empty generic result is not verified fixed.
- Tests / acceptance / definition of done: Reproduced/not_detected/verified_fixed distinguished; reviewed patch/evidence.
- Issue reference: not created.

## GRD-019 - Actual CI release enforcement

- State: PORT_READY / WAITING_ON_DEPENDENCY. Fixture verification never enables live.
- Owner/dependency: owner/Codex (Guard implementation). External integration dependency: GitHub/GitLab integrations owner.
- Contract: ReleaseEvaluation enforced=false; scan/commit/check-run provenance.
- Source (relative to src/features/guard unless explicitly prefixed): contracts.ts (ReleaseCheckPort), adapters.ts (unavailableCI), release.ts.
- Safety/storage/environment: Evaluation only until explicit provider permission and actual check.
- Tests / acceptance / definition of done: Real required check blocks intended commit with provider evidence.
- Issue reference: not created.

## GRD-020 - Intelligence inventory publishing

- State: PORT_READY / WAITING_ON_DEPENDENCY. Fixture verification never enables live.
- Owner/dependency: owner/Codex (Guard implementation). External integration dependency: Intelligence owner.
- Contract: IntelligencePort.publish; scoped commit InventoryItem[].
- S09 consumer note (19 Nov 2026): Sentinel External Intelligence does NOT depend on this producer. It uses a repository-lockfile inventory (`repository_lockfile`, declared dependencies only) and keeps `guardInventoryPort.configured === false`; no Guard code was changed. A future GRD-020 producer needs a widened `source_kind` in a new migration and ecosystem mapping (see HANDOFF_S09).
- Source (relative to src/features/guard unless explicitly prefixed): contracts.ts (IntelligencePort), evidence.ts (normalizeOSVInventory), adapters.ts.
- Safety/storage/environment: No fictional advisories; unknown licenses explicit.
- Tests / acceptance / definition of done: Idempotent validated ingestion and tenant isolation.
- Issue reference: not created.

## GRD-021 - Sentinel remediation/release events

- State: PORT_READY / WAITING_ON_DEPENDENCY. Fixture verification never enables live.
- Owner/dependency: owner/Codex (Guard implementation). External integration dependency: Sentinel owner.
- Contract: SentinelPort.publish; type/scanId/decision/scope.
- Source (relative to src/features/guard unless explicitly prefixed): contracts.ts (SentinelPort), adapters.ts (unavailableSentinel).
- Safety/storage/environment: No Sentinel implementation or mitigation claims; dedupe/scoped audit.
- Tests / acceptance / definition of done: Owner consumes authorized versioned events with retries/no secrets.
- Issue reference: not created.

## GRD-022 - Durable reports and retention

- State: PORT_READY / WAITING_ON_DEPENDENCY. Fixture verification never enables live.
- Owner/dependency: owner/Codex (Guard implementation). External integration dependency: Backend/storage owner.
- Contract: report/reportHtml; version/coverage/evidence/audit/exclusions.
- Source (relative to src/features/guard unless explicitly prefixed): release.ts (report/reportHtml), contracts.ts (PersistencePort).
- Safety/storage/environment: Local download only; server authorization/retention/deletion/access audit required.
- Tests / acceptance / definition of done: Tenant download denial, XSS/redaction, expiry/deletion and restart tests.
- Issue reference: not created.

## GRD-023 - Schedules and webhooks

- State: PORT_READY / WAITING_ON_DEPENDENCY. Fixture verification never enables live.
- Owner/dependency: owner/Codex (Guard implementation). External integration dependency: Platform/integrations owner.
- Contract: QueuePort + verified delivery/commit/idempotency.
- Source (relative to src/features/guard unless explicitly prefixed): contracts.ts (QueuePort), worker/guard/orchestrator.ts.
- Safety/storage/environment: Disabled; signature/replay/quota/access/branch validation required.
- Tests / acceptance / definition of done: Replay/dedupe/revoked-access tests; bounded audited jobs.
- Issue reference: not created.
