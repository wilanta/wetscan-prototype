# Scanner installation and remaining owner setup - 18 November 2026

On feat/guard-mvp-local-demo, the four pinned real CLIs now pass controlled-source installation tests and production normalizers: Opengrep2.0.0 (1 finding, six official JS/Python rules), OSV2.7.1 (5 findings, npm-only offline database), Gitleaks8.30.1 (1 finding, fake credential), Trivy0.76.2 (3 IaC findings). Official binaries/rules/data integrity was verified; local image content ID3608834fae5f966e6380af0c7b2acf71a46af2ac2bac8591be2b0851d501fa51. Physical Docker restrictions, timeout/output/cancellation/OOM and exact-owned cleanup/absence PASS. These are installation fixtures, NOT a real GitHub/DB/UI acceptance.

Normal scanning remains disabled until the isolated operational DB, target-bound app/worker configuration and owner Auth/provider selection in the correct MVP process are actually verified. A READ ONLY catalog observer and NOT_APPROVED new-database SQL are prepared; no SQL/connection/role/password/database change was executed. No G01 credential/private state was copied. The owner port3000 process was untouched. See the [single operator procedure](GUARD_G02_LIVE_OPERATOR.md); do not reinstall scanners manually or create a G01 acceptance packet.

OSV's official npm offline database exceeded the old256MiB limit; operational OSV alone now supports a measured2048MiB bound. Other engines and G01 remain256MiB. All engines passed the45-second bound (OSV16.3s on the fixture). The Trivy normalizer rejects unbound/root findings, but skips the exact explicitly clean directory aggregate. Trusted image entrypoints normalize Windows line endings. Failed installation attempts remain in ignored local reports.

**G01 publication HOLD:** the candidate's398 checkpoint hashes still match. The four-file build/tools subset passed clean-export typecheck/lint/build, but Guard regression was351/352: tests/guard/evidence-retention.test.ts requires ignored test-results/guard-g01-unblock/deadlines-candidate-unit.json in a fresh export. The full checkpoint's prior3 failures and390/391 historical artifact mismatch remain disclosed and unchanged. No staging, commit or push was performed; no PR7 metadata change. Do not copy private/ignored runtime artifacts into Git to force a pass. G01 remains2/16; N01 STOP and old transaction UNKNOWN.

---

# Active G02 operational wiring checkpoint - 18 November 2026

The normal request -> after-response scheduler -> owner-session broker -> scoped queue/worker -> scanner -> persistence composition is now implemented. The earlier missing-wiring note below is historical. Code remains on feat/guard-mvp-local-demo, uncommitted; no current app process was replaced or scanner activated.

New files: live/product-{deployment,host,preflight}.ts and worker/guard/product-{scheduler,broker}.ts. Normal HTTP carries server-owned current Auth context. Production reads/review/cancellation use the app role independently of scanner readiness. Normal scanning and explicit resume require an enabled, qualified host. Resume permits only normal queued/attempt0 jobs after fresh pin/owner verification; it does not enqueue, retry a used attempt or adopt G01. Full snapshot coverage is durably updated with its worker fence; the Live UI opens the actual returned scan ID and polls read-only state. No G01 approval time window/permit is accepted by product wiring.

Operational database: wetscan_dev_guardg02, explicitly loopback/purpose/marker/owner bound. Configuration rejects both G01 fixture and Sentinel targets before credentials. The regular website cannot fall back to G01 credentials/reader through a legacy flag. Provisioning and actual connections remain unverified, not inferred from the test doubles.

Actual infrastructure observation: Docker Server Linux29.7.2 is reachable (16CPU/about8GB, seccomp/cgroupns). Two local images, no known scanner-name matches. No verified scanner installation/rules/offline advisory data or physical qualification exists in this work. No container was run. App/worker reference names are absent from the tool Process/User/Machine metadata; the owner's existing application environment is a separate process and remains unobserved. No secret was read.

Remaining external setup is specific: approve/provision the isolated operational DB and role access, supply/qualify reviewed pinned scanner images/rules, configure legitimate purpose-specific references and the non-secret deployment file in the process that will run this branch. The single [operator procedure](GUARD_G02_LIVE_OPERATOR.md) explains safe startup with scanning off, one authenticated READ ONLY preflight, and a first real scan proposal only after all readiness is proven. No approval window or formal G01 package is created for ordinary code iterations.

Latest verification:263/263 unit/integration,4/4 browser,typecheck,lint,production Webpack build and Auth/tracing smoke PASS. CLI/DB integration uses doubles; actual GitHub -> real CLI -> PostgreSQL -> UI is NOT_RUN. See [validation](MVP_VALIDATION.md). Next priority is infrastructure qualification and one actual authorized repository run; G03-G06 live provider/consumer work follows that outcome. Completion by20 November remains at risk until these concrete infrastructure prerequisites are resolved.

G01 remains PARTIALLY_COMPLETE2/16; historical N01 remains STOP and transaction UNKNOWN.398 hashed G01 checkpoint paths remain unchanged. No commit/push/master/staging/Sentinel/PR7/merge/deployment or recovery.

---

## Previous Live implementation record

# Guard Live priority ? 18 November 2026

This is the active instruction and status; the earlier prototype-integration record below is retained as history. Work remains uncommitted on `feat/guard-mvp-local-demo`, HEAD `d13de08`. The official G02-G06 source specifications remain in `docs/specs/guard`.

The target for 20 November is an authorized real-repository pipeline. Demo integration is paused except regression. G01 is PARTIALLY_COMPLETE, 2/16 PASS; N01 remains STOP and its terminalization window-2 transaction outcome UNKNOWN. No recovery, old permit, historical packet edit, external scanner/provider operation or database connection occurred in this change.

## Implemented product code in this slice

- Normal pin lookup: POST `/api/guard/projects/:project/revision` reuses current GitHub selection/installation authorization and source metadata, closes the provider lease, returns no acceptance nonce/preparation/job.
- `live/product-admission.ts` validates a server-owned repository/branch/engine policy, current actor/provider binding and exact commit. Admission calls the existing transactional store with a new `guard.scan.repository` queue kind and `g02-live-` idempotency namespace. It never acquires source or runs a CLI in the HTTP request.
- `live/product-policy.ts` and `product-composition.ts` separate website authority from G01 acceptance authority. Normal use has operational 1-10 minute job timeouts and one attempt, not a 30-minute acceptance window. The host factory requires current schema/RLS, broker/worker readiness and independently measured physical sandbox identity. No client-supplied flag, image, command or qualification can activate it.
- `worker/guard/product-{handler,runtime}.ts` compose one bound durable lease with the existing executor, heartbeat, fencing, cancellation and owner-authorization callbacks. Claim/maintenance SQL restricts both kind and exact normal job ID, preventing any historical G01/N01 adoption or expiry sweep.
- `operationalRepositoryScanner` reuses the existing qualified Docker execution for Opengrep, OSV, Gitleaks and Trivy IaC. It requires image/rules/installation hashes, current daemon/spec/physical controls and private immutable source capability. It returns normalized findings, raw-output digest, run provenance and verified container cleanup; OSV also returns package inventory. The scanner source is never executed by the host. Container/SBOM execution is not yet implemented.
- The broker can renew authorization for its own immutable source capability between engines; it verifies manifest/file hashes and current source authorization, invalidates the old capability, and leaves the old grant TTL unchanged. No orphan can be adopted. Minimum orphan age remains one hour.
- For normal repository scans, orchestration waits for scanner-owned cleanup before releasing source. Cleanup rejection/unknown remains an error and preserves source; no automatic manual/orphan cleanup is invoked. Terminal success requires completed provenance and source cleanup. Missing/partial source, failed engines and unknown advisory severity remain INCOMPLETE for release evaluation.
- `live/product-{view,artifacts}.ts` implement scope-checked stored DTOs, terminal-job finding review and persistent JSON/HTML report records using the existing Guard JSONB row and transaction/revision checks. No schema migration was added. Manual `verified_fixed` is refused. These storage paths are tested with database doubles, not an actual connection.
- Existing Guard Live route has six tabs: Overview, Scan History, Findings, Logic & Workflows, Remediation, Release Status. They fetch actual scoped Guard APIs with no demo fallback. Findings/evidence/coverage, review, inventory, release evaluation and persisted report UI are connected. Historical preparation is view-only for normal product actions. Deterministic guidance is based on a stored finding; AI/retest/HTTP invariants/CI enforcement display unavailable rather than fabricated success.

## Actual verification versus remaining integration

No actual CLI, Docker command, external GitHub request, owner-session operation or database query ran in these tests. Scanner adapters use Docker doubles; browser tests intercept stored scan APIs on the existing isolated Auth fixture. `docker.exe` is on PATH. Scanner executable lookup did not find host binaries, which says nothing about uninspected container images. Daemon availability, images/rules/offline advisory data, installation artifacts and physical qualification are NOT_VERIFIED.

**The default application still has no mounted qualified product admission/source broker/scheduler.** The host factory and worker composition are implemented; the actual existing-session authorization bridge, server deployment configuration and scheduler wiring remain internal implementation work. A callback contract or a successful unit test does not establish a running worker. The Live Start button remains disabled until that wiring and physical qualification are complete. `GUARD_LIVE_READ_ENABLED` alone never enables scanning. Port 3000's existing owner process was not replaced.

| Module | Current real-data-capable code | Remaining before actual live use |
|---|---|---|
| G02 | Authorized pin/admission, scoped queue/lease/store, four existing CLI adapters, inventory, provenance, cleanup and six Live tabs | Mount normal session broker/scheduler, verify actual role/RLS/DB configuration and isolated scanner installations, then real repository E2E. Container/SBOM is pending. |
| G03 | Stored finding guidance, terminal review and durable report implementation; existing safe text proposal primitive | Consent + redacted server AI provider, authorized original-file read, actual patch validation/apply workflow, real targeted retest. No AI/patch/retest live success claimed. |
| G04 | Actual stored engine/severity/coverage policy evaluation, explicit enforced=false | Signed/idempotent webhook and scheduler implementation, GitHub Checks permission/exact-commit publication, verified Vercel integration/enforcement. |
| G05 | Existing fail-closed staging scope/egress contracts | Authorized staging target and synthetic roles, socket-level DNS/IP controls, actual bounded DAST/Trust/Integrity request execution and evidence. No target is established. |
| G06 | Stored OSV inventory and actual finding DTOs for consumers; existing navigation/contracts | Revision-scoped Canvas node mapping, Intelligence delivery, approved Sentinel event producer/ack; GitLab authorization and secure ZIP ingestion. No consumer acknowledgement or Sentinel change was fabricated. |

## Single owner prerequisites list

1. Confirm the normal website's intended Guard database target and legitimate app/worker credential references are provisioned in the process that will run this branch. Do not send secret values or reuse a postgres/Sentinel credential. Runtime role/RLS verification must precede effects; no N01 job/state may be touched.
2. Provide/authorize the isolated scanner environment for verification: Linux Docker isolation, pinned scanner images/rules and OSV offline advisory data/installation artifacts. Physical no-network/non-root/readonly/resource/cancel/cleanup qualification is required. A Docker executable alone is insufficient.
3. Keep a normal authenticated GitHub owner session with selected repository, current App installation Contents:read access and an explicitly selected branch/commit. The existing-session source broker must be mounted and independently checked before the first scan; no browser token is accepted as configuration.
4. Later provider-specific prerequisites: explicit AI consent/server provider credential and budget; GitHub Checks/webhook permission; Vercel project mapping/credential; authorized staging/roles; GitLab access; approved Sentinel producer contract. These do not block independent G02 code and must not be silently substituted with mocks.

## Deadline priority

**18 Nov:** normal G02 components and Live API/UI slice implemented offline; complete broker/scheduler wiring and prepare infrastructure verification. **19 Nov:** prioritize one physically isolated real GitHub -> scanner -> stored evidence -> UI E2E; then G03 source/patch/retest and G04/G06 actual-result producers. **20 Nov:** failure-path/browser/build stabilization and actual evidence walkthrough. Full G02-G06 live completion is at risk while runtime isolation/broker/provider prerequisites remain unresolved; it is not justified by UI or fixture completion. Defer secondary scheduling/polish ahead of the core E2E.

Validation commands: `node scripts/guard-live-check.mjs unit|typecheck|lint|build|browser` (one task per invocation). Build and typecheck/browser must run sequentially because Next regenerates `.next/types`. `node scripts/mvp-check.mjs prod-smoke` checks owned production server boundaries. Current results and limits: [MVP_VALIDATION.md](MVP_VALIDATION.md).

No commit/push, master/staging/PR7/Sentinel change or deployment. Eventual integration to master requires separately approved tested commits; full G01 checkpoint remains HOLD. Minimal snapshot/queue/store/scanner changes exist only on the MVP branch and need separate diff review before publication. No private runtime state was copied.

---

## Historical prototype integration record

# WetScan prototype — G01 synchronization and G02–G06 integration

Active decision: 18 November 2026. Owner/Codex owns G02–G06. Work stays on feat/guard-mvp-local-demo; G01 remains on feat/guard-g01-s03-integration. Neither branch has been committed/pushed by this work.

## One application, one existing Demo Mode

The canonical UI is **/app/projects/orderly-demo/guard**, inside the existing AppShell, Auth/onboarding, DemoProvider, design components and GuardTabs. Inventory, Findings/triage, Remediation preview, Integrity, scan history, policy and reports use this route family.

The former /local-demo/guard route is a compatibility redirect only. It does not render another application, define a second identity, exempt /app from Auth, or contain another job store. An unauthenticated browser reaches the existing login.

GuardDemoWorkspace is a thin adapter over GuardWorkbench and the existing DemoProvider. Completed Guard demo jobs notify the prototype scan count once; triage does not increment scans. The global Reset demo action clears Guard history and remounts document/proposal controls. The original Orderly examples remain explicitly collapsed examples. Their scan button delegates to the same Guard workflow rather than incrementing another scan system.

Real bounded lockfile inventory, source SHA256, safe text proposal preview, review/audit, policy evaluation and JSON/HTML exports are browser functions. Scanner-format findings remain synthetic=true / mode=demo. The extra four-engine JSON fixture workflow remains gated to development/test; its default=false and production check were retained. Existing production SAST demonstration behavior is not promoted to live scanning.

Real-project Guard/Canvas navigation stays on the selected github project. The LiveGuardWorkbench is distinct from the synthetic workbench and continues to enforce current repository authorization and fail-closed backend readiness. No live job was started.

## G01 checkpoint audit and synchronization

The G01 worktree still has HEAD d13de08. Its new checkpoint review enumerates **399 proposed paths**: A build sync 4; B acceptance implementation/tests 69; C historical docs/evidence 321; D audit tools/review 5.

- No unresolved real-secret finding was found in eligible candidates. Three pattern hits are explicitly synthetic test values; .env, credentials, private runtime state, ignored result/APPROVED SQL files and dumps were excluded before reads.
- G01 Guard regression: **687/690 PASS, 3 FAIL**; typecheck/lint/production build PASS.
- Protected historical evidence: **38/38 match**.
- N01 retest packet: **390/391 match**. The historical revocation observer has a pre-existing extra ROLLBACK token. The frozen file, requests, hashes and evidence were not restored/refrozen.
- N01 historical status stays STOP; window-2 transaction outcome stays UNKNOWN. G01 stays PARTIALLY_COMPLETE, 2/16 PASS.

Full G01 checkpoint is not represented as green. The four-file build/tracing group can be approved independently. The complete manifest, review and exact commit/push proposal live on the G01 branch at docs/checkpoints/G01_CHECKPOINT_20261118.{md,json,files.txt}.

After explicit checkpoint approval, preserve/checkpoint MVP's overlapping uncommitted work with separate owner permission before cherry-picking the approved build commit. Retain MVP scripts while incorporating Webpack build/tracing constraints. No whole-worktree copy, stash/reset, evidence overwrite or private-state transfer is proposed. Acceptance queue hooks/diagnostics stay a coherent acceptance-only group if selected later, not a normal product dependency.

A future normal push to the existing G01 branch updates PR #7's diff automatically and needs explicit publication approval; Draft metadata and merge remain untouched.

## Actual functionality and next live integration

| Module | Working independent functions | Fixture boundary | Remaining live dependency / next implementation |
|---|---|---|---|
| G02 / GRD-006–010 | Bounded npm v2/v3 inventory, exact versions/unknown license, normalizers, triage, evidence/coverage rendering, reports | Four scanner JSON formats in development/test; no CLI invocation | Connect existing authorized immutable source/queue/sandbox contracts to normal product scanner dispatch and durable results. Qualify pinned images/rules/egress and cancellation/cleanup before actual repository scans. Do not require all 16 G01 cases for unrelated offline code. |
| G03 / GRD-017/018/022 | Deterministic guidance, source-digest/base/finding-bound text preview, sensitive/stale/ambiguous refusal, JSON/HTML download | Initial source and lockfile are labelled examples | Consent/redacted AI provider with budgets/provenance; exact-source minimal patch validation; approved PR writes; actual targeted before/after scanner retest; durable scoped reports. Preview never applies a fix or marks verified_fixed. |
| G04 / GRD-019/023 | Required-engine/severity/coverage evaluation with INCOMPLETE and enforced=false | Provider-event integration can be tested offline | Signed/idempotent webhooks, exact-commit GitHub Checks, authorized Vercel mapping/enforcement capability and bounded schedules. Policy result is not enforcement. |
| G05 / GRD-011/012/014–016 | Confirmed five-invariant model, expected/observed distinction, fail-closed scope validation | Models are synthetic, not HTTP tests | Authorized staging/synthetic accounts and socket-level DNS/IP/redirect egress enforcement; actual confirmed Canvas plans; resource limits and cleanup. No staging permission/isolation has been established. |
| G06 / GRD-002/013/020/021 | Common prototype navigation and local inventory export; existing typed consumer contracts | No fake consumer acknowledgement or live Canvas security overlay | Scope/revision/path mapping to actual Canvas nodes, inventory delivery to Intelligence, durable versioned Sentinel producer/ack, authorized GitLab and secure ZIP acquisition. Do not modify Sentinel implementation or its database. |

The full five official specifications are preserved in specs/guard with source SHA256. These partial implementations do not satisfy their full live completion criteria.

## Three-day priority

1. **18 Nov:** consolidate the existing prototype (implemented); protect live/demo boundaries; prepare the minimal G01 build sync checkpoint. Next code focus: G02 normal-product dispatch/evidence contracts and G03 source-bound proposal/retest workflow.
2. **19 Nov:** wire revision-scoped G06 producers/consumers and G04 policies/webhook/check lifecycles using isolated fixtures; test failure/staleness/dedup/revocation boundaries. Connect actual providers only when permissions and dependencies are available.
3. **20 Nov:** stabilize shared workflow, browser/accessibility regression, build, error handling and demo walkthrough. Prioritize core scope above advanced scheduling/report polish. Report remaining live blockers explicitly.

G01 acceptance windows/quotas are not normal website usage limits. No new 30-minute permit restriction was added to product workflows. Operational authorization, timeouts, RLS, isolation and cancellation remain mandatory.

## Running and verification

Use the prototype's existing normal Auth/provider configuration when the owner later switches its development process to this branch. Do not copy .env, credentials or private runtime state from G01; do not stop/change the owner's localhost:3000 process as part of this audit.

The integration was tested through the real Auth/onboarding/shell routes using the repository's **existing isolated Auth provider fixture**, not the owner session. The test runner uses a temporary test-only Auth store, blocks external providers and owns only its loopback server. It does not create database roles or credentials.

Offline commands:
- node scripts/mvp-check.mjs unit
- node scripts/mvp-check.mjs typecheck
- node scripts/mvp-check.mjs lint
- node scripts/mvp-check.mjs build
- node scripts/mvp-check.mjs e2e
- node scripts/mvp-check.mjs prod-smoke

The initial unauthenticated port-3118 preview was stopped after identity verification because that separate UI is retired. The existing port-3000 process was not replaced. G01 recovery and live acceptance remain paused; no permit, database operation, scanner, commit/push, deployment or PR write occurred.
