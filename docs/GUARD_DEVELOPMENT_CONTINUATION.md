> Latest N04 review repair: [revision3 offline verification and inactive approval packet](acceptance/guard-g01/remaining-gates-v3/N04_REPAIR_REVIEW.md). DESIGN_REVIEW_ACCEPTED / RUNTIME_NOT_AUTHORIZED;913 offline tests pass. Revision2 packets are retained historical artifacts; changed implementation hashes require a new exact runtime approval.

# Guard development continuation

Owner: repository owner / Codex. Updated 16 November 2026 (Asia/Jakarta). All G02-G06 implementation, review and acceptance work now belongs to the owner/Codex. There is no active assignment or delivery to Will. This is a continuation of the existing implementation, including the incomplete G01 acceptance implementation committed before this session.

The owner confirmed the actual existing branch `feat/guard-g01-s03-integration` and [PR #7](https://github.com/wilanta/wetscan-prototype/pull/7). The requested historical name `modul-guard` still exists but is an ancestor 18 commits behind the continuation HEAD. Do not create a replacement branch/PR or change master. Remote audit found head `4bfcbece610453ada121057e1ae6dafe2f06bc48`; PR merge object's parents identify base master `f7bfeef29488c3f997e9444555039514f55fa0a3` and this head. The continuation contains three commits over that base: `7eb6bfe`, `1b28fb8`, `4bfcbec`. The worktree was clean at this audit. Publication to the same branch is now authorized after verification; no merge or Ready-for-Review transition is authorized by an incomplete implementation.

`WetScan_Guard_Full_Module_Development_Prompt.md` was not found among repository files. The owner's continuation message supplies the current full-module scope. The historical handoff did not include stage-specific G02-G06 acceptance Markdown; do not invent earlier requirements or represent the remaining stages as accepted.

## Actual feature audit

These classifications distinguish implementation from live integration. Historical test/scanner records remain scoped to their exact fixtures and code. Current-session verification is recorded separately; a file/interface/button is not acceptance evidence.

| Feature | Classification | Actual implementation and missing boundary |
| --- | --- | --- |
| Architecture and API contracts | IMPLEMENTED_AND_TESTED | Scoped contracts, job transitions, normalized evidence, release evaluation, authorized Guard routes, denied unconfigured execution; existing unit/API regressions. |
| Scan orchestrator and job state | PARTIAL | Generic orchestrator and durable Guard queue/store exist. Real connected acceptance reached preparation only; live scanner dispatch remains disabled. |
| Repository snapshot | IMPLEMENTED_AND_TESTED | Existing Auth/Canvas authority, pinned commit/tree/blob integrity, exclusions, private NTFS snapshots and cleanup; actual GitHub source/connected worker evidence retained. This does not prove scanner integration. |
| SAST / Opengrep | PARTIAL | Real trusted vulnerable/fixed CLI fixture evidence, parser and provenance checks. No accepted customer-job container execution. |
| SCA / OSV | PARTIAL | Trusted lockfile/advisory fixture verification, advisory/inventory normalization. Production database/cache, severity enrichment and approved offline image still missing. |
| Secret scanning | PARTIAL | Trusted Gitleaks fixture verification and redacted normalization. Live image/rules and job authority remain unavailable. |
| IaC / Trivy | PARTIAL | Trusted IaC fixture verification and normalization. Live isolated dispatch and pinned rule/database provenance remain unaccepted. |
| DAST / ZAP | BLOCKED | Scope validation and disabled UI/ports exist. No authorized staging target, dummy-account scope, actual socket-level egress boundary or ZAP acceptance. |
| Findings / evidence / dedup / triage | PARTIAL | Typed normalization, scope/provenance checks, deterministic deduplication and audited demo triage. Durable customer findings/triage have no accepted live producer. |
| Integrity runner | DEMO_ONLY | Five confirmed in-memory invariant models; expected/observed results explicitly synthetic. No actual staging requests or transactions. |
| AI explanation/remediation | NOT_STARTED | Deterministic guidance and disabled provider port exist; they are not AI. No provider, privacy/budget consent or source transmission. |
| Retesting | PARTIAL | Before/after/targeted evidence validation and controlled fixture retests. No accepted authorized live retest job or automatic patch/PR operation. |
| Release policy / reports | PARTIAL | Deterministic evaluation, redacted JSON/escaped HTML export, coverage and evidence. `enforced=false`; no actual provider check or durable report lifecycle. |
| Canvas / Intelligence integration | PARTIAL | Existing source-backed Canvas is preserved; Guard overlay/inventory producer ports return unavailable. No synthetic findings may enter a live graph. |
| Tests / documentation | PARTIAL | Broad existing unit/browser and fixture evidence retained. Current 880 unit tests, typecheck/lint/build and executable packet materialization pass; actual approved runs and live scanner integration remain outstanding. See the current verification report. |

## Preserved G01 evidence and constraints

The old Worker/Auth job `2c18db662dcf8fec6052e05d02ed1362802facd839fca81a71a888c37b09ee18` is terminal. Its two enqueue calls and one worker launch are consumed. Its nonce and permit must never be recycled. Request digest: `7f014b026d5e83634f4a2f07b17ffc9a27aabfe5a50f6c7dd029c7d977a2145a`. The historical approval expired on 15 November 2026. Reuse the successful evidence, never rerun the job to exercise a new failure path.

Actual evidence includes one durable job after identical enqueue/replay, 42.005s connected preparation, fence 1, sampled lease renewals, running-to-stopped heartbeat, cleared lease, persisted `foundation_prepared` audit and partial coverage. Source was `inkAja/wdu/main` at `41861b14dbb3f329fe3b20aed59a008390ef0e2b`, 82/90 files, 175159 bytes, nontruncated tree and sensitive/size/binary exclusions. Final scan `failed`/revision 3 truthfully means G02 execution was unconfigured. Scanner and integrated sandbox were NOT_RUN.

The only identified DB is `localhost:5432/wetscan_s01_test_guardg01`, owner `wetscan_guard_migrator`, marker `wetscan-s01:aa8b15a6-7ed3-4f19-81f0-07d9759ec62f`. SQL18 proved isolated fixture preservation with before/after SHA256 `45e7cfe26767e26ad96ceda0dd2a53649a10ea7a5453844ac50ee30867e1095d`, no changed sections, three retained Guard scans, no active lease, Guard/Sentinel budgets 1/2, FORCE RLS and unchanged policies/grants. External Sentinel remains **NOT_VERIFIED / TARGET_NOT_IDENTIFIED**. Do not probe historical port 55432, create a DB or alter Sentinel to fill this gap.

Full schema down/up remains **BLOCKED_BY_PRESERVATION_CONSTRAINT**. The three retained scans/jobs cannot be deleted to satisfy the down guard. Separate safe `already_applied` and read-only down-refusal checks do not prove destructive lifecycle recovery. Source-orphan acceptance requires actual age >= 3600000ms, two independent windows and a fresh cleanup-only approval after the real hour; no backdating or shorter age.

Earlier PostgreSQL25 checks, Docker6 synthetic control probes, source recovery, NTFS privacy and timeout-v3 regressions are historical evidence within their recorded scopes. They are not integrated scanner, fresh sandbox attestation, crash/restart or remaining-negative proof. New G01 cases remain NOT_RUN until their implementation/spec/artifact hashes and actual environment identity are frozen and the owner grants fresh exact-case runtime approval. Development permission is not runtime permission.

Never read `.env`, credentials, private keys/tokens or Auth session records. Runtime purpose loaders may consume purpose credentials internally only after fresh target/action/job/artifact/expiry validation. Keep the existing single Auth/session/onboarding/Canvas flow. No host execution of customer code, scanner on an external target, private source transmission to AI, database reset, marker deletion or fixture deletion is authorized by this continuation.

## Dependency order and active backlog

Continue the unfinished G01 offline composition and regression fixes first. G02 implementation may proceed offline under the owner's new development instruction, reusing the existing snapshot, queue, store, normalizers and demo. Live activation still depends on unwaived G01 acceptance and a new exact scanner-job approval. Continue later features in dependency order, with unavailable external adapters explicitly disabled or Demo Mode; do not duplicate completed demo/core functionality.

Use [INTEGRATION_BACKLOG.md](INTEGRATION_BACKLOG.md), GRD-001 through GRD-023, as the active per-feature contract/dependency/Definition-of-Done register. All Guard-owned G02-G06 tasks belong to owner/Codex; Canvas/Auth/Intelligence/Sentinel owners remain integration dependencies, not assignments to modify their implementations. Preserve Daud's Canvas and Auth/session behavior. No other developer needs to receive a handoff.

The original dedicated Will handoffs are obsolete as active task files. Their technical decisions, evidence, limits, retention and release prerequisites are preserved here and in the linked G01/backlog documents. Byte-identical historical copies plus checksums are retained in [the ownership archive](acceptance/guard-g01/history-ownership-20261116/README.md). Historical evidence is not an active instruction or assignment.

## Current offline delivery

See [verification report and all16 case readiness](GUARD_CONTINUATION_VERIFICATION_20261116.md). G01 new runtime cases remain NOT_RUN, with six verified non-Docker packets, nine Docker identity blockers and one two-window prerequisite. G02 is PARTIAL: a new scoped scanner adapter and stricter orchestration have offline regression evidence, while durable dispatch and live qualification are pending. G03, G04, G05 and G06 each remain BLOCKED for stage acceptance by the unaccepted live producer/dependencies and missing stage-specific acceptance contracts; their existing feature cores/demos are classified above and are preserved. The owner/Codex implements all future stages. No assignment or delivery to another developer remains active.
