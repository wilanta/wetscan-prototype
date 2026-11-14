# Guard integration backlog

No external issues created. Dependencies require owner handoffs. No Auth, schema or other module changes are included.

## GRD-001 - Authorized GitHub snapshot and project grants

- State: PORT_READY / WAITING_ON_DEPENDENCY. Fixture verification never enables live.
- Owner/dependency: Daud / Auth owner.
- Contract: SnapshotPort, Grant: actor/workspace/project/mode/operations/expiry; exact commit/file hashes.
- Source (relative to src/features/guard unless explicitly prefixed): contracts.ts (Grant/SnapshotPort), security.ts (authorize); Auth owner handoff; worker/guard/orchestrator.ts.
- Safety/storage/environment: Server verifies installation/user access and project ownership; token server-only. Existing selected repository is insufficient.
- Tests / acceptance / definition of done: Cross-workspace/expired grants denied; exact permitted commit fetched with file limits and cleanup.
- Issue reference: not created.

## GRD-002 - GitLab repository reader

- State: PORT_READY / WAITING_ON_DEPENDENCY. Fixture verification never enables live.
- Owner/dependency: Auth/integrations owner.
- Contract: SnapshotPort; gitlab, immutable commit, repository ID.
- Source (relative to src/features/guard unless explicitly prefixed): contracts.ts (SnapshotPort/RepositoryRef).
- Safety/storage/environment: Existing integration/explicit handoff only; no second Auth system.
- Tests / acceptance / definition of done: Unauthorized repository denied; commit snapshot disposed.
- Issue reference: not created.

## GRD-003 - Durable Guard persistence

- State: PORT_READY / WAITING_ON_DEPENDENCY. Fixture verification never enables live.
- Owner/dependency: Backend/storage owner.
- Contract: PersistencePort; scoped job/finding/evidence/audit/idempotency/version.
- Source (relative to src/features/guard unless explicitly prefixed): contracts.ts (PersistencePort), pipeline.ts (DemoMemoryStore demo-only).
- Safety/storage/environment: Schema requires owner approval; encrypted evidence and retention; demo memory is not durable.
- Tests / acceptance / definition of done: Restart/multi-instance persistence; tenant isolation and optimistic concurrency tested.
- Issue reference: not created.

## GRD-004 - Production queue and worker

- State: PORT_READY / WAITING_ON_DEPENDENCY. Fixture verification never enables live.
- Owner/dependency: Platform owner.
- Contract: QueuePort; scoped job ID/lease/attempts/cancel/dedupe.
- Source (relative to src/features/guard unless explicitly prefixed): contracts.ts (QueuePort), worker/guard/orchestrator.ts.
- Safety/storage/environment: No scanner in Next request; bounded concurrency/backoff/resources/cleanup; no queued secrets.
- Tests / acceptance / definition of done: Duplicate requests yield one job; crash retry and cancel tested.
- Issue reference: not created.

## GRD-005 - Hardened scanner sandbox

- State: PORT_READY / WAITING_ON_DEPENDENCY. Fixture verification never enables live.
- Owner/dependency: Platform/security owner.
- Contract: SandboxPort; readonly/nonroot/egress/cpu/memory/pids/timeout.
- Source (relative to src/features/guard unless explicitly prefixed): contracts.ts (SandboxPort), security.ts, worker/guard/README.md.
- Safety/storage/environment: Docker daemon unavailable. No host credentials/socket; tenant isolation and DNS/IP enforcement required.
- Tests / acceptance / definition of done: Host/path/metadata/network escape tests; OOM/timeout/cancel cleanup verified.
- Issue reference: not created.

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
