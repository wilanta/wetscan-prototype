> Latest N04 review repair: [revision3 offline verification and inactive approval packet](acceptance/guard-g01/remaining-gates-v3/N04_REPAIR_REVIEW.md). DESIGN_REVIEW_ACCEPTED / RUNTIME_NOT_AUTHORIZED;913 offline tests pass. Revision2 packets are retained historical artifacts; changed implementation hashes require a new exact runtime approval.

# G01 continuation verification, 16 November 2026

Overall: **PARTIALLY COMPLETE**. Owner: repository owner/Codex. Branch `feat/guard-g01-s03-integration`, existing PR #7, baseline `4bfcbece610453ada121057e1ae6dafe2f06bc48`. All new live cases remain NOT_RUN. No new runtime approval, permit activation, DB/Auth/GitHub-source connection, enqueue, actual worker or scanner was performed. Publication is separately authorized to this same branch.

## Implemented and verified offline

The interrupted acceptance composition was repaired and hardened: exact packet/artifact/runtime authority, private capability broker/resolver and child lifecycle, enforcing sandbox ownership/physical registry, true denial/timeout/cleanup checkpoints, independent row/resource/preservation observers, immutable one-shot quotas, actual expiry timestamps, scoped rescue, read-only lifecycle branches, and a two-window orphan materializer. Source age stays at least 3600000ms. Historical evidence and the consumed old job remain untouched.

A new scanner adapter has separate authority, fixed engine/image/command/rules/install provenance, manifest-bound/redacted four-engine normalization and shared sandbox ownership. It is offline-tested with a Docker driver double. The generic orchestrator now waits for cleanup before success, rejects mismatched scanner provenance, stops on cleanup failure and preserves partial source coverage. Durable live scanner dispatch is still an implementation gap; no customer pipeline or real scanner acceptance is claimed.

## Validation evidence

- Full offline unit suite: 880/880, 81 files, exit0. Includes a real 45-second partial source deadline and a native owned Windows sharing-lock cleanup failure/rescue, using isolated fake provider data. Latest Q00 fixture-retention assertion and all 33 historical hashes were then checked in 18/18 targeted tests.
- Typecheck and lint: exit0. Build: exit0, 33 NFT metadata files checked, sensitive local references0. Before the tracing fix, an earlier build had85 sensitive path references; the retained earlier result is superseded by build.123860ce-b889-417c-8136-e69b79de68ee.json. No sensitive contents were read.
- Isolated browser Auth/onboarding/session/Canvas authorization:21/21; existing UI walkthrough/interactions/accessibility:6/6. Canvas responsive/layout/accessibility:17/17. These use generated fixture credentials and dotenv suppression, not the owner browser session.
- Frozen packet review: all6 final non-Docker packets validated against all236 raw-byte artifacts; all10 templates retain matching digests and are rejected for execution. See [review result](acceptance/guard-g01/remaining-gates-v2/validation/packet-review.json).

The full source/spec/SQL set is bound to artifact-set SHA256 `89bd1d5f1c178b819d26ed281e3e94f8b9950b4a23f382aff041c0b86f8eddb6`. See [approval index](acceptance/guard-g01/remaining-gates-v2/approval-index.json) and [execution procedure](acceptance/guard-g01/remaining-gates-v2/README.md). A verified packet is not a live Auth/DB/daemon readiness result. Real Docker/DB crash recovery, revocation and expiry still need actual approved evidence.

## Each mandatory case

| Case | Implementation readiness | Runtime prerequisite | Live result |
| --- | --- | --- | --- |
| Q00 | Offline implementation/probe/spec/runner/regression present | DOCKER_VERSION_UNAVAILABLE | NOT_RUN |
| I01 | Offline implementation/probe/spec/runner/regression present | DOCKER_VERSION_UNAVAILABLE | NOT_RUN |
| N00 | Offline implementation/probe/spec/runner/regression present | DOCKER_VERSION_UNAVAILABLE | NOT_RUN |
| N01 | Offline implementation/probe/spec/runner/regression present | Verified; new exact approval required | NOT_RUN |
| N02 | Offline implementation/probe/spec/runner/regression present | DOCKER_VERSION_UNAVAILABLE | NOT_RUN |
| N03 | Offline implementation/probe/spec/runner/regression present | DOCKER_VERSION_UNAVAILABLE | NOT_RUN |
| N04 | Offline implementation/probe/spec/runner/regression present | Verified; new exact approval required | NOT_RUN |
| N05 | Offline implementation/probe/spec/runner/regression present | DOCKER_VERSION_UNAVAILABLE | NOT_RUN |
| N06 | Offline implementation/probe/spec/runner/regression present | Verified; new exact approval required | NOT_RUN |
| N07 | Offline implementation/probe/spec/runner/regression present | DOCKER_VERSION_UNAVAILABLE | NOT_RUN |
| N08 | Offline implementation/probe/spec/runner/regression present | Verified; new exact approval required | NOT_RUN |
| C01 | Offline implementation/probe/spec/runner/regression present | DOCKER_VERSION_UNAVAILABLE | NOT_RUN |
| C02A | Offline implementation/probe/spec/runner/regression present | DOCKER_VERSION_UNAVAILABLE | NOT_RUN |
| C02B | Offline implementation/probe/spec/runner/regression present | ACTUAL_WINDOW_A_AND_ONE_HOUR_REQUIRED | NOT_RUN |
| L01 | Offline implementation/probe/spec/runner/regression present | Verified; new exact approval required | NOT_RUN |
| L02 | Offline implementation/probe/spec/runner/regression present | Verified; owner READ ONLY SQL | NOT_RUN |

Q00/I01 qualify the trusted Python foundation probe, not a scanner. N00 covers three invalid evidence records. N01-N08 cover revocation, cancellation, permit/grant expiry, source/container timeout and both cleanup faults. C01 is child crash/lease/fencing; C02A is parent crash/physical fence/recovery; C02B is exact source cleanup after the real hour. L01 is the actual schema runner already-applied branch over a dedicated READ ONLY session; L02 is the canonical down-refusal READ ONLY predicate. Neither lifecycle check permits schema down.

## Measured blockers and evidence limits

The pinned Docker CLI exists; a normal-host read-only probe on the explicit local Linux-engine pipe failed at version. Daemon/image identity is NOT_OBSERVED. No daemon start/restart, image pull or container operation is authorized or attempted. Nine templates cannot become executable until actual readonly daemon/image measurements supply a new final digest and a new exact approval. C02B additionally requires actual completed C02A evidence, the unchanged source marker, real age>=one hour, and a NEW cleanup-only approval after notBefore.

Connected Worker/Auth prepare_only remains historical PASS for job2c18db66; do not repeat it. Isolated fixture preservation remains supported by the historical SQL18 result, not a new DB observation. External Sentinel remains **NOT_VERIFIED / TARGET_NOT_IDENTIFIED**. Full schema-down remains **BLOCKED_BY_PRESERVATION_CONSTRAINT**. These are unwaived evidence limits, not completed gates. Do not probe55432, create a DB, delete fixtures/markers or change Sentinel.

## Next specific review request

N04 can be proposed independently while Docker is blocked: [case sheet](acceptance/guard-g01/remaining-gates-v2/cases/N04.md), request SHA256 `10c6ea9d0ea669c9e85920c96703c7f156f0a2e28036a043f9fa2e2e7743345d`, exact new job `c1d4e02983ce7b7ccd005051f1d839a3dea6eca55d9714acbb103e5c11b5d246`. Maximum20 minutes from a new approval; at most1 enqueue,1 durable job,1 worker launch,0 snapshots,0 containers and1 explicit cancellation. Target only the existing localhost:5432/wetscan_s01_test_guardg01 fixture and its frozen repository/actor/project/commit/idempotency binding. Obtain fresh normal Auth/HEAD and zero-job BEFORE preservation, mint a real full60-second grant, hold until actual expiry, prove authorization denial before source/probe/foundation work, cancel only after that expected denial, then observe exact retained rows, lease/heartbeat and before/after preservation. Changes are only the new Guard queue/scan/attempt/audit/heartbeat and fenced cancellation; retain every row. No permit is active and no timestamp is invented. Approval must name this digest/job/scope and permit the independent non-Docker sequence explicitly.

## Ownership and continuation

All G02-G06 work belongs to owner/Codex. The two obsolete recipient handoff files were removed from docs/agent-handoffs after the active audit/backlog preserved their decisions; byte-identical historical copies and relocation hashes are retained. All33 accepted-evidence artifacts verify through this relocation map. No implementation, specification, successful test result, fixture, old permit/used marker or old source evidence was deleted. Stage-specific G02-G06 acceptance Markdown remains absent; existing feature classifications and dependencies are recorded in [active continuation](GUARD_DEVELOPMENT_CONTINUATION.md) and [integration backlog](INTEGRATION_BACKLOG.md). Do not assign a recipient or silently waive G01 to promote G02-G06.
