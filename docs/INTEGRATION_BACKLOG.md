# Canvas integration register

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

No external issues created. Dependencies require owner handoffs. G01 adds Guard-only implementation and proposed, UNAPPLIED schema/role/platform-access artifacts; no Auth/shared platform/Sentinel source or applied schema changes. See GUARD_G01_MIGRATION_REVIEW.md for the explicit approval gate.

## GRD-001 - Authorized GitHub snapshot and project grants

- State: PARTIALLY_VERIFIED / WAITING_ON_ACCEPTANCE (G01 update below); historical port-only baseline retained in earlier commits.
- Owner/dependency: Daud / Auth owner.
- Contract: SnapshotPort, Grant: actor/workspace/project/mode/operations/expiry; exact commit/file hashes.
- Source (relative to src/features/guard unless explicitly prefixed): contracts.ts (Grant/SnapshotPort), security.ts (authorize); Auth owner handoff; worker/guard/orchestrator.ts.
- Safety/storage/environment: Server verifies installation/user access and project ownership; token server-only. Existing selected repository is insufficient.
- Tests / acceptance / definition of done: Cross-workspace/expired grants denied; exact permitted commit fetched with file limits and cleanup.
- Issue reference: not created.

- G01 update (15 November 2026): Implementation added in src/features/guard/live/{project,github-source,snapshot,source-acceptance}.ts. Existing Auth/Canvas authorization and transport reused; bounded immutable snapshots, integrity and partial coverage tested with provider doubles/local files. PARTIALLY_VERIFIED; real GitHub acceptance remains BLOCKED pending exact repository/current commit/operator approval. Worker authorization broker is still a cross-owner dependency. See docs/agent-handoffs/HANDOFF_GUARD_G01.md and docs/GUARD_G01_VALIDATION.md.

## GRD-002 - GitLab repository reader

- State: PORT_READY / WAITING_ON_DEPENDENCY. Fixture verification never enables live.
- Owner/dependency: Auth/integrations owner.
- Contract: SnapshotPort; gitlab, immutable commit, repository ID.
- Source (relative to src/features/guard unless explicitly prefixed): contracts.ts (SnapshotPort/RepositoryRef).
- Safety/storage/environment: Existing integration/explicit handoff only; no second Auth system.
- Tests / acceptance / definition of done: Unauthorized repository denied; commit snapshot disposed.
- Issue reference: not created.

## GRD-003 - Durable Guard persistence

- State: PARTIALLY_VERIFIED / WAITING_ON_ACCEPTANCE (G01 update below); historical port-only baseline retained in earlier commits.
- Owner/dependency: Backend/storage owner.
- Contract: PersistencePort; scoped job/finding/evidence/audit/idempotency/version.
- Source (relative to src/features/guard unless explicitly prefixed): contracts.ts (PersistencePort), pipeline.ts (DemoMemoryStore demo-only).
- Safety/storage/environment: Schema requires owner approval; encrypted evidence and retention; demo memory is not durable.
- Tests / acceptance / definition of done: Restart/multi-instance persistence; tenant isolation and optimistic concurrency tested.
- Issue reference: not created.

- G01 update (15 November 2026): PostgresGuardStore and independent Guard ledger/schema/RLS/role proposals prepared. Atomic scan+queue admission, CAS/active-lease fencing, evidence/audit immutability and rollback tested using SQL doubles. IMPLEMENTED_PENDING_ACCEPTANCE; no database connected or migration applied. Exact target/hash/platform-owner approval plus real RLS/preservation tests required. See docs/agent-handoffs/HANDOFF_GUARD_G01.md and docs/GUARD_G01_VALIDATION.md.

## GRD-004 - Production queue and worker

- State: PARTIALLY_VERIFIED / WAITING_ON_ACCEPTANCE (G01 update below); historical port-only baseline retained in earlier commits.
- Owner/dependency: Platform owner.
- Contract: QueuePort; scoped job ID/lease/attempts/cancel/dedupe.
- Source (relative to src/features/guard unless explicitly prefixed): contracts.ts (QueuePort), worker/guard/orchestrator.ts.
- Safety/storage/environment: No scanner in Next request; bounded concurrency/backoff/resources/cleanup; no queued secrets.
- Tests / acceptance / definition of done: Duplicate requests yield one job; crash retry and cancel tested.
- Issue reference: not created.

- G01 update (15 November 2026): GuardPostgresQueue reuses S01 durable contracts and lease methods, overrides only admission/claim; separate lifecycle/IPC/prepare handler and real empty-queue child-process restart fixture added. PARTIALLY_IMPLEMENTED: concrete trusted Auth resolver/process composition missing; main launcher refuses activation. Real queue/lease/crash acceptance and orphan supervisor remain unverified. See docs/agent-handoffs/HANDOFF_GUARD_G01.md and docs/GUARD_G01_VALIDATION.md.

## GRD-005 - Hardened scanner sandbox

- State: PARTIALLY_VERIFIED / WAITING_ON_ACCEPTANCE (G01 update below); historical port-only baseline retained in earlier commits.
- Owner/dependency: Platform/security owner.
- Contract: SandboxPort; readonly/nonroot/egress/cpu/memory/pids/timeout.
- Source (relative to src/features/guard unless explicitly prefixed): contracts.ts (SandboxPort), security.ts, worker/guard/README.md.
- Safety/storage/environment: Docker daemon unavailable. No host credentials/socket; tenant isolation and DNS/IP enforcement required.
- Tests / acceptance / definition of done: Host/path/metadata/network escape tests; OOM/timeout/cancel cleanup verified.
- Issue reference: not created.

- G01 update (15 November 2026): DockerGuardSandbox now requires digest-pinned spec, nonroot/read-only/network-none/resource controls, actual configuration inspection and external attestation; no host fallback. Adapter/driver-double tests pass. BLOCKED for real enforcement: daemon unavailable, production attestor/probe image/private source ACL+UID/Desktop mount proof needed. No scanner/container ran. See docs/agent-handoffs/HANDOFF_GUARD_G01.md and docs/GUARD_G01_VALIDATION.md.

## GRD-006 - Opengrep SAST worker

- State: REAL_VERIFIED for controlled CLI fixture; REAL_PARTIAL / WAITING_ON_DEPENDENCY for Live. Fixture verification never enables live.
- Owner/dependency: Guard/platform owner.
- Contract: ScannerPort, normalizeOpengrep; version/rule hash.
- Source (relative to src/features/guard unless explicitly prefixed): evidence.ts (normalizeOpengrep), worker/guard/fixture-runner.ts, tests/guard/evidence/opengrep-verification.json.
- Safety/storage/environment: Trusted fixture verification only until GRD-001/004/005; review LGPL/rule rights.
- Tests / acceptance / definition of done: Actual vulnerable/fixed fixture CLI output, provenance/digest; no target scripts.
- Issue reference: not created.

## GRD-007 - OSV SCA and inventory

- State: REAL_VERIFIED for controlled CLI fixture; REAL_PARTIAL / WAITING_ON_DEPENDENCY for Live. Fixture verification never enables live.
- Owner/dependency: Guard/Intelligence owner.
- Contract: normalizeOSV, InventoryItem; ecosystem/name/version/license/sourcePath.
- Source (relative to src/features/guard unless explicitly prefixed): evidence.ts (normalizeOSV/normalizeOSVInventory), worker/guard/additional-fixtures.ts, tests/guard/evidence/osv-verification.json.
- Safety/storage/environment: Pinned fixture binary and public advisory query verified; production advisory cache, CVSS mapping, license enrichment and enforcing egress not configured.
- Tests / acceptance / definition of done: Pinned database, real lockfile scan and validated advisory inventory.
- Issue reference: not created.

## GRD-008 - Gitleaks secret detection

- State: REAL_VERIFIED for controlled CLI fixture; REAL_PARTIAL / WAITING_ON_DEPENDENCY for Live. Fixture verification never enables live.
- Owner/dependency: Guard/platform owner.
- Contract: normalizeGitleaks; rule/location, no matched value.
- Source (relative to src/features/guard unless explicitly prefixed): evidence.ts (normalizeGitleaks), worker/guard/gitleaks-fixture.ts, tests/guard/evidence/gitleaks-verification.json.
- Safety/storage/environment: Redact before storage/log/UI; pinned binary/rules license review.
- Tests / acceptance / definition of done: Controlled match/clean CLI run; matched value never retained.
- Issue reference: not created.

## GRD-009 - Trivy IaC

- State: REAL_VERIFIED for controlled CLI fixture; REAL_PARTIAL / WAITING_ON_DEPENDENCY for Live. Fixture verification never enables live.
- Owner/dependency: Guard/platform owner.
- Contract: normalizeTrivy iac; target/rule/severity/provenance.
- Source (relative to src/features/guard unless explicitly prefixed): evidence.ts (normalizeTrivy), worker/guard/additional-fixtures.ts, tests/guard/evidence/trivy-verification.json.
- Safety/storage/environment: Pinned binary/rule/database versions; no target execution.
- Tests / acceptance / definition of done: Actual bad/good IaC fixtures and partial-failure coverage.
- Issue reference: not created.

## GRD-010 - Container and SBOM

- State: PORT_READY / WAITING_ON_DEPENDENCY. Fixture verification never enables live.
- Owner/dependency: Guard/Intelligence owner.
- Contract: ScannerPort container/sbom; InventoryItem/artifact digest.
- Source (relative to src/features/guard unless explicitly prefixed): contracts.ts (ScannerPort/InventoryItem), evidence.ts (normalizeTrivy container parser only).
- Safety/storage/environment: No host socket or arbitrary builds; authorized immutable image and license provenance.
- Tests / acceptance / definition of done: Digest-pinned image scan/SBOM and honest unsupported coverage.
- Issue reference: not created.

## GRD-011 - Scoped staging DAST

- State: PORT_READY / WAITING_ON_DEPENDENCY. Fixture verification never enables live.
- Owner/dependency: Platform/security owner.
- Contract: DastScope, EgressPort, ScannerPort dast.
- Source (relative to src/features/guard unless explicitly prefixed): security.ts (allowDast), dast-scope-form.tsx, contracts.ts (DastScope/EgressPort).
- Safety/storage/environment: Disabled; origin/path/method/consent/window/rate restrictions; DNS/IP/rebind/redirect enforcement at socket layer.
- Tests / acceptance / definition of done: Private/metadata/rebind/redirect denied; authorized synthetic baseline executed.
- Issue reference: not created.

## GRD-012 - Authenticated DAST accounts

- State: PORT_READY / WAITING_ON_DEPENDENCY. Fixture verification never enables live.
- Owner/dependency: Security/test owner.
- Contract: DastScope syntheticAccounts; encrypted expiring handles.
- Source (relative to src/features/guard unless explicitly prefixed): contracts.ts (DastScope/TestPlan), dast-scope-form.tsx.
- Safety/storage/environment: No real users/payment/production mutations; no account secrets in reports.
- Tests / acceptance / definition of done: Dummy account rotation/cleanup, approved scope and safe stop verified.
- Issue reference: not created.

## GRD-013 - Canvas risk overlays

- State: PORT_READY / WAITING_ON_DEPENDENCY. Fixture verification never enables live.
- Owner/dependency: Canvas owner.
- Contract: CanvasPort.publish; nodeId/findingIds/scope/commit.
- Source (relative to src/features/guard unless explicitly prefixed): contracts.ts (CanvasPort/CanvasOverlay), adapters.ts (unavailableCanvas).
- Safety/storage/environment: No graph/discovery/shared routes edits; stable component mapping required.
- Tests / acceptance / definition of done: Correct commit/node mapping; scoped authorization.
- Issue reference: not created.

## GRD-014 - Canvas Trust plans

- State: PORT_READY / WAITING_ON_DEPENDENCY. Fixture verification never enables live.
- Owner/dependency: Canvas owner.
- Contract: CanvasPort.plans; InvariantPlan confirmedBy/kind/expectedStatus.
- Source (relative to src/features/guard unless explicitly prefixed): contracts.ts (TestPlan/InvariantPlan/CanvasPort), adapters.ts.
- Safety/storage/environment: User confirmation required; AI does not authorize execution.
- Tests / acceptance / definition of done: Unconfirmed/mismatched plans denied; ownership tests.
- Issue reference: not created.

## GRD-015 - Canvas Workflow import

- State: PORT_READY / WAITING_ON_DEPENDENCY. Fixture verification never enables live.
- Owner/dependency: Canvas owner.
- Contract: InvariantPlan; workflow version/transitions.
- Source (relative to src/features/guard unless explicitly prefixed): contracts.ts (TestPlan), integrity.ts (synthetic only).
- Safety/storage/environment: No invented graph inference; explicit versioned handoff required.
- Tests / acceptance / definition of done: Confirmed transitions trace to source workflow/version.
- Issue reference: not created.

## GRD-016 - Live Integrity runner

- State: PORT_READY / WAITING_ON_DEPENDENCY. Fixture verification never enables live.
- Owner/dependency: Guard/security owner.
- Contract: InvariantPlan, IntegrityResult, RetestResult.
- Source (relative to src/features/guard unless explicitly prefixed): integrity.ts, contracts.ts (TestPlan), tests/guard/core.test.ts.
- Safety/storage/environment: Only in-memory fixtures now; GRD-005/011/012 required for live.
- Tests / acceptance / definition of done: Five invariants on approved staging dummy resources; expected/observed evidence and cleanup.
- Issue reference: not created.

## GRD-017 - AI provider/privacy opt-in

- State: PORT_READY / WAITING_ON_DEPENDENCY. Fixture verification never enables live.
- Owner/dependency: Product/privacy owner.
- Contract: AIProviderPort configured=false; redactedSummary/untrusted output.
- Source (relative to src/features/guard unless explicitly prefixed): contracts.ts (AIProviderPort), adapters.ts (disabledAI), evidence.ts (guidance).
- Safety/storage/environment: Provider undecided; no raw source/secrets; consent/budget/retention required.
- Tests / acceptance / definition of done: AI-off guidance; opt-in/redaction/limits/provider failure tested.
- Issue reference: not created.

## GRD-018 - Safe patch and targeted retest

- State: PORT_READY / WAITING_ON_DEPENDENCY. Fixture verification never enables live.
- Owner/dependency: Guard/repository owner.
- Contract: RetestResult; before/after/targeted evidence/expected/observed.
- Source (relative to src/features/guard unless explicitly prefixed): evidence.ts (applyRetest/guidance), pipeline.ts (triage).
- Safety/storage/environment: No autonomous patch/PR/merge. Empty generic result is not verified fixed.
- Tests / acceptance / definition of done: Reproduced/not_detected/verified_fixed distinguished; reviewed patch/evidence.
- Issue reference: not created.

## GRD-019 - Actual CI release enforcement

- State: PORT_READY / WAITING_ON_DEPENDENCY. Fixture verification never enables live.
- Owner/dependency: GitHub/GitLab integrations owner.
- Contract: ReleaseEvaluation enforced=false; scan/commit/check-run provenance.
- Source (relative to src/features/guard unless explicitly prefixed): contracts.ts (ReleaseCheckPort), adapters.ts (unavailableCI), release.ts.
- Safety/storage/environment: Evaluation only until explicit provider permission and actual check.
- Tests / acceptance / definition of done: Real required check blocks intended commit with provider evidence.
- Issue reference: not created.

## GRD-020 - Intelligence inventory publishing

- State: PORT_READY / WAITING_ON_DEPENDENCY. Fixture verification never enables live.
- Owner/dependency: Intelligence owner.
- Contract: IntelligencePort.publish; scoped commit InventoryItem[].
- S09 consumer note (19 Nov 2026): Sentinel External Intelligence does NOT depend on this producer. It uses a repository-lockfile inventory (`repository_lockfile`, declared dependencies only) and keeps `guardInventoryPort.configured === false`; no Guard code was changed. A future GRD-020 producer needs a widened `source_kind` in a new migration and ecosystem mapping (see HANDOFF_S09).
- Source (relative to src/features/guard unless explicitly prefixed): contracts.ts (IntelligencePort), evidence.ts (normalizeOSVInventory), adapters.ts.
- Safety/storage/environment: No fictional advisories; unknown licenses explicit.
- Tests / acceptance / definition of done: Idempotent validated ingestion and tenant isolation.
- Issue reference: not created.

## GRD-021 - Sentinel remediation/release events

- State: PORT_READY / WAITING_ON_DEPENDENCY. Fixture verification never enables live.
- Owner/dependency: Sentinel owner.
- Contract: SentinelPort.publish; type/scanId/decision/scope.
- Source (relative to src/features/guard unless explicitly prefixed): contracts.ts (SentinelPort), adapters.ts (unavailableSentinel).
- Safety/storage/environment: No Sentinel implementation or mitigation claims; dedupe/scoped audit.
- Tests / acceptance / definition of done: Owner consumes authorized versioned events with retries/no secrets.
- Issue reference: not created.

## GRD-022 - Durable reports and retention

- State: PORT_READY / WAITING_ON_DEPENDENCY. Fixture verification never enables live.
- Owner/dependency: Backend/storage owner.
- Contract: report/reportHtml; version/coverage/evidence/audit/exclusions.
- Source (relative to src/features/guard unless explicitly prefixed): release.ts (report/reportHtml), contracts.ts (PersistencePort).
- Safety/storage/environment: Local download only; server authorization/retention/deletion/access audit required.
- Tests / acceptance / definition of done: Tenant download denial, XSS/redaction, expiry/deletion and restart tests.
- Issue reference: not created.

## GRD-023 - Schedules and webhooks

- State: PORT_READY / WAITING_ON_DEPENDENCY. Fixture verification never enables live.
- Owner/dependency: Platform/integrations owner.
- Contract: QueuePort + verified delivery/commit/idempotency.
- Source (relative to src/features/guard unless explicitly prefixed): contracts.ts (QueuePort), worker/guard/orchestrator.ts.
- Safety/storage/environment: Disabled; signature/replay/quota/access/branch validation required.
- Tests / acceptance / definition of done: Replay/dedupe/revoked-access tests; bounded audited jobs.
- Issue reference: not created.
