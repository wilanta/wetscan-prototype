# G02 functional validation ? 19 November 2026

## Completion campaign — 19 November 2026 (branch `feat/guard-g02-completion`)

**PARTIAL.** Supersedes the "container BLOCKED" and "no positive findings persisted" rows below; all older sections stay as historical checkpoints. Full explanation: [G02 handoff](G02_HANDOFF.md); readiness per requirement: [release readiness](GUARD_G02_RELEASE_READINESS.md). Evidence files: `docs/acceptance/guard-g02/20261119/`.

| Requirement | Status now | Evidence |
|---|---|---|
| GRD-006/007/008/009 engines | REAL_SCANNER_VERIFIED | `scanner-installation.json` (Opengrep 2.0.0 / OSV 2.7.1 / Gitleaks 8.30.1 / Trivy 0.76.2 positive), `physical-broker-handoff.json` (10/10, vulnerable + clean), `github-acceptance.json` (real GitHub revision: SAST 3, SCA 5, Secrets 1, IaC 25). |
| GRD-010 SBOM | REAL_SCANNER_VERIFIED | CycloneDX component count 1 bound to commit; both fixtures and the GitHub run. |
| GRD-010 Container | FIXTURE_VERIFIED (was BLOCKED) | Digest-bound OCI archive, Trivy 0.76.2 offline DB: 6 findings; Full profile persists them (`postgres-persistence.json`). No real owner image. |
| Retry | IMPLEMENTED | New linked scan; `tests/guard/live/retry.test.ts`, browser test. |
| Real GitHub → PostgreSQL | REAL_SCANNER_VERIFIED | Private repo `wilanta/wetscan-g02-acceptance`: vulnerable `c1330c63` 34 findings, fixed `3c6a99ec` 0, isolated PostgreSQL 18, restart-persistent. |
| Product session → operational DB → Live UI | NOT_RUN | Needs owner interactive login and DB credentials. |

Defects found and fixed in this campaign (details in CHANGELOG_FIXES.md Fix #13–#18): Guard plan hash drift against master (platform baseline), IaC engine failing on nested Terraform modules (found only by the real repository), 6-engine measurement fixture, CI-unsafe evidence-retention test and CRLF drift, fixture portability and restart race.

Gates on the final candidate are recorded in [G02 handoff](G02_HANDOFF.md) and the PR description.

## Closure confirmed: deactivation and post-restart persistence

Owner supplied actual terminal JSON productEnabled=0, confirmed server Ready, and authenticated GET HTTP200 after restart for e30251691f7c628804b1cdce99fe9afbc87c121ba6fa83131ec92ef13d366e5b. The stored result remains completed_partial/revision7, Opengrep completed/11 files,0 findings, release INCOMPLETE, matching pre-restart API and PostgreSQL. Deactivation and post-restart API persistence are now VERIFIED. Earlier pending reports are retained as historical checkpoints. Evidence: test-results/g02-live-sast-e3025169.CLOSURE.json. No replay or new runtime authority. No independent visual browser/DB observation by agent is claimed. G02 remains PARTIAL; zero finding rows do not establish positive finding persistence or repository safety. G01 remains2/16 PASS.

Status: **PARTIAL / NEW OWNER-REPOSITORY RUN NOT AUTHORIZED**. Branch `feat/guard-g02-g06-integration`, base `3918f02`. Uncommitted code only. G01 remains PARTIALLY_COMPLETE, 2/16 PASS. N01 historical STOP and its unresolved transaction are untouched.

## Requirement checklist

DONE below means implemented and verified at the stated boundary; it is not a claim of live acceptance.

| Requirement | Status | Evidence and remaining gap |
|---|---|---|
| GRD-006 Opengrep | PARTIAL | Real 2.0.0 Docker execution, positive JS/TS/TSX and clean source, manifest-bound paths and line/rule/version evidence. Six official JS/Python subset rules, not comprehensive Next.js coverage. Successful authorized GitHub run and vulnerable/fixed repository pair remain unproved. |
| GRD-007 OSV | PARTIAL | Real 2.7.1, recursive npm monorepo lockfile fixture, official offline npm advisory data, no resolution or call analysis. Five real advisory matches; clean fixture zero. Alias/fix-milestone/CVSS-vector metadata retained; unknown severity/license stay unknown. Other ecosystem databases and compatibility/reachability are not verified. |
| GRD-008 Secrets | PARTIAL | Real Gitleaks 8.30.1, positive/negative controlled files, trusted config, redaction100; matched values excluded from normalized records. Owner repository and Git history scanning not proved. |
| GRD-009 IaC | PARTIAL | Real Trivy 0.76.2 embedded Terraform checks; three controlled matches. Zero reported targets yields not_applicable, not a clean coverage claim. Kubernetes/Dockerfile acceptance cases and owner repository proof remain. No apply/build. |
| GRD-010 repository SBOM | PARTIAL | CycloneDX1.6 generated from actual OSV inventory, bound to repository/commit/output digest. JSONB tampering test, report/view preservation and download implemented. npm scope only; no image SBOM or live PostgreSQL findings/SBOM acceptance yet. |
| GRD-010 Container | BLOCKED | Owner confirms no authorized digest-pinned target image. Image artifact ingress/Trivy image-vulnerability database qualification are not configured. IaC Dockerfile analysis is not container scanning. |
| Quick/Standard/Full | DONE | Separate operational profiles, deterministic canonical order, engine controls and profile UI. Quick=SAST/SCA/Secrets; Standard adds IaC/SBOM; Full requires Container. Missing/unselected coverage remains INCOMPLETE. Demo and DAST profiles preserved. |
| Authorized pinned source and broker | DONE offline | Real private snapshot filesystem through actual broker to Docker, 3 bounded blob reads, hashes/budget/fresh authorization preserved. Provider is an explicit controlled double in this run. Historical GitHub failure root cause is not proven. |
| Durable admission/queue/history | PARTIAL | Atomic PostgreSQL admission, fencing, cancellation and restart-safe recorded history implemented. First real historical job has durable1/attempt1 terminal metadata. Current normal policy maxAttempts1; transient automatic retry and authorized failed-job retry UI remain unfinished. No historical replay allowed. |
| Engine states and partial failures | DONE offline | Queued/running progress persisted before engine invocation; completed results require qualified execution/cleanup. Source/broker/sandbox/scanner diagnostics distinct. Missing files, parser errors, unsupported lockfiles and no targets cannot claim complete coverage. |
| Limits, timeout, cancellation, cleanup | DONE controlled | Real qualification enforces non-root/read-only/network/capability/socket/resource bounds; output/timeout/cancel/OOM and owned normal cleanup measured. Unit failures cover revocation/hash/fencing/unknown cleanup. Not live G01 acceptance. |
| Findings/evidence/dedup/triage/report persistence | PARTIAL | Existing scoped SQL/JSONB, optimistic revisions, dedup provenance, immutable commit/digests, advisory/inventory/SBOM/report fields and six Live tabs wired and regression tested. No successful real repository scanner findings persisted to PostgreSQL yet. |
| UI separation and shared contracts | DONE offline/browser | Six Live routes, history/details, severity/unknown filters, inventory/SBOM download, profiles. No synthetic fallback. Existing Demo, Auth, Canvas, Intelligence/Sentinel contracts retained. |
| Real GitHub ? scanner ? PostgreSQL ? UI acceptance | PARTIAL | New approved SAST job e3025169 completed_partial; actual container,82 retrieved files,11 SAST files and persisted results agree. Zero findings/evidence rows; positive finding persistence and post-restart UI/deactivation confirmation remain unverified. First job remains failed/STOP. |

## Physical scanner evidence

`test-results/g02-real-scanner-handoff-20261119.json` is a preserved metadata-only summary of 10 physical Docker handoff cases. Image `sha256:3608834fae5f966e6380af0c7b2acf71a46af2ac2bac8591be2b0851d501fa51`. Runner: `worker/guard/installation/handoff.ts`; qualification: `qualify.ts` and `measured.ts`.

Actual broker, immutable filesystem snapshot, operational scanner adapter, Docker driver, parsers and normal source/container disposal run. **Auth/provider and lease verification are explicit doubles; storage is memory only.** No owner repository, database connection or real durable queue claim occurs. Clean IaC fixture with no applicable checks is correctly not_applicable. Positive/clean fixture reports and earlier local STOP reports are preserved in their isolated runtime roots.

Each physical run records actual image, output SHA256, generated fixture commit, file/target counts, finding count, inventory/SBOM count and verified source/container absence. Qualification is short-lived setup evidence, not scan authority.

## Next live boundary

Use the existing operational DB/password references; do not repeat provisioning or reset passwords. A reviewed SAST-only non-secret preflight configuration is prepared separately; active configuration is unchanged. The owner must select it with GUARD_PRODUCT_ENABLED=0 in the legitimate application process and supply fresh read-only preflight/pin output. Only after that and final source checks may a proposal name one NEW job/idempotency and explicit target/limits. No expired approval or old job can be used. No SCA/Secrets/IaC/container/AI/provider writes are implied by a SAST proposal.

No claim of G02 COMPLETE, enforcement, vulnerability absence, live database findings or consumer acknowledgement follows from these controlled tests.

## Final QA and owner-process readiness

Final isolated QA:402/402 unit/integration,516/516 shared contracts,8/8 Live browser,5/5 existing prototype/Demo browser; typecheck/lint/production Webpack build and production boundary smoke PASS. Browser APIs/provider are test fixtures. Real Docker handoff10/10; provider/lease are explicit doubles and storage memory-only. Existing-role reference restoration also passed the actual Node CLI/Windows ACL synthetic-file test, without database access.

Owner-process18:47:47 WIB READ ONLY: Auth/provider, policy, target, both real app/worker role/schema/RLS connections and sandbox PASS.18:47:55 pin matches41861b14dbb3f329fe3b20aed59a008390ef0e2b / tree6742145fe7c45640fa9b5d1d2666ca9d45966c57. The earlier18:37 missing-process-reference STOP is preserved; it did not prove missing files or failed DB passwords. No provisioning/password reset was repeated.

314-file earlier checkpoint and all historical evidence remain preserved. Final source set adds the owner metadata reattachment CLI (315 files). Current source digest: cee6be3c94c0c683333e7e9368526bff82fa93672cb8d4e6383123d19dde7dce. Config SHA77e007dbcac3be120f61d9df25f6aa36bcb437da1cd0fcd4579df4c5c92a7635. Qualification expires19November19:20:33 WIB. These are readiness proofs only; no new owner scan has run and flag remains0 pending explicit new approval.

## Actual approved GitHub SAST run ? 19 November19:00 WIB

Classification: **LIVE_REPOSITORY_SAST_PIPELINE_VERIFIED_PARTIAL_SOURCE_ZERO_MATCHES**. This supersedes earlier statements that only controlled-fixture scanning has run; it does NOT mark G02 COMPLETE.

- Job e30251691f7c628804b1cdce99fe9afbc87c121ba6fa83131ec92ef13d366e5b; idempotency g02-live-cd342bf7-f3ce-4eff-8957-370eb8c3dae5; one owner normal UI POST202. Created19:00:19.987, finished19:00:58.749 WIB, within the explicitly approved18:55?19:15 window.
- GitHub inkAja/wdu/main at41861b14dbb3f329fe3b20aed59a008390ef0e2b. Source82 retrieved,90 eligible,175159bytes;9 exclusions (1 sensitive,4 oversize,4 binary), tree not truncated. Counters are separate; do not treat excluded files as clean.
- Actual Opengrep2.0.0, six-rule official subset, scanned11/11 eligible files **within retrieved source**; engine6795ms. Source was not executed. Other engines skipped.
- Output SHA2566a14ced3a73a2fdfc622bea528ec9a2d745747a278627fddf1d2d09772e7f49f; runIdf8af4ec4-e312-4d67-9526-c7dea31f4255. Image/spec/installation digest in authenticated stored API agrees with exact-job physical created/removed receipts.
- Owner READ ONLY PostgreSQL19:10:24 WIB: one new scan/job/attempt; queue completed, fence1, maxAttempts1, queue revision10, one finished/completed attempt, zero unfinished, no cancellation and no lease owner/token/until. ROLLBACK confirmed. Agent did not authenticate to PostgreSQL.
- Findings0; finding-evidence rows0. SQL evidenceBindingValid=true is vacuous for zero rows and is NOT positive finding-provenance/persistence proof. Release INCOMPLETE/enforced=false is correct for partial source and this limited engine selection. This is not a repository security PASS.
- Agent metadata-only observation: exact image container created and normally removed; Docker exact-job count0; explicit lstat ENOENT for confined source directory and lease file; active-container lock absent. No manual cleanup or source-content inspection by agent.
- Dedicated worker-heartbeat rows were empty. Do not claim an observed stopped heartbeat row. Terminal queue/attempt and cleared lease are the recorded lifecycle evidence; current operational worker uses lease heartbeat.
- Initial UI normalizing/Findings-visible notes were not used as terminal/positive-finding proof. Authenticated API and SQL both show completed_partial/zero. Deactivation response explicitly left serverReady and actual flag verification pending; post-restart UI consistency is NOT claimed yet.

Evidence summary: test-results/g02-live-sast-e3025169.RESULT.json plus immutable resource observations and owner preflight reports. First failed scan4e1e38b5 is preserved without replay. G01 remains2/16 PASS; N01 unchanged. No G03?G06, GitHub writes, commit/push, merge or PR7 change.
