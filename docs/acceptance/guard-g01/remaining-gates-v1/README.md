# Remaining mandatory G01 acceptance - review revision 1

Status: PLAN PREPARED, NO NEW RUNTIME APPROVAL OR EXECUTION. Overall G01 remains PARTIALLY COMPLETE. The existing exact job is terminal and its two-enqueue/one-launch budget is consumed. Do not use its permits for any case here. This revision prepares the four requested acceptance areas; it does not mark them passed or authorize G02-G06/publication.

## Verified baseline and scope

Candidate/root C:/laragon/www/wetscan-2/wetscan-guard-g01-s03-candidate; branch feat/guard-g01-s03-integration; HEAD 1b28fb88ae65a29902e0f1f314efdce44ed3c643; user index SHA256 40d77c02186b074dacfd2fe3a6f2816d89a7e59d5f279cbe8be8c75c9c716c4f. The previous 41 approved implementation hashes and 33 completed evidence files were checked, without rerunning their successful tests. No runtime connection, source read, container, worker, grant, permit activation or Git-index/publication mutation occurred in this preparation.

Only existing target localhost:5432/wetscan_s01_test_guardg01, owner wetscan_guard_migrator, marker wetscan-s01:aa8b15a6-7ed3-4f19-81f0-07d9759ec62f, may be proposed. Existing pgAdmin is owner-confirmed. No additional database may be created. Sentinel external is NOT_VERIFIED / TARGET_NOT_IDENTIFIED by explicit owner statement; historical 127.0.0.1:55432 must not be accessed or assumed active. This is an identified scope/input blocker, not proof that an endpoint is down and not a preservation pass.

Read [code audit](code-gap-audit.json), [owner scope](owner-scope-record.json), [case registry](case-registry.json) and [approval index](approval-index.json). Proposed job identities are computed offline with the existing identity algorithm; they are not current grants, verified HEADs, created jobs or replacements for the completed job. Fresh backend identity and HEAD checks remain required at activation. Changing any bound input requires a new final packet and approval.

## Four separate plans

1. [Integrated worker + enforcing sandbox](10-integrated-worker-sandbox.md).
2. [Live security-negative acceptance](20-live-security-negative.md).
3. [Crash/restart, fencing and orphan cleanup](30-crash-restart-orphans.md).
4. [Fixture preservation and schema lifecycle](40-preservation-schema-lifecycle.md).

## Planned hard ceilings per case

|Case|Purpose|New jobs|Worker launches|Containers|Max minutes|Review packet|
|---|---|---:|---:|---:|---:|---|
|Q00|Qualify changed exact sandbox contract|0|0|6|55|[intent](approval-intents/Q00.json)|
|I01|One real job to enforcing sandbox|1|1|1|55|[intent](approval-intents/I01.json)|
|N00|Fail closed on invalid enforcement evidence|0|0|0|20|[intent](approval-intents/N00.json)|
|N01|Normal owner session revocation|1|1|0|30|[intent](approval-intents/N01.json)|
|N02|Live in-flight cancellation|1|1|1|20|[intent](approval-intents/N02.json)|
|N03|Actual permit expiry during work|1|1|1|25|[intent](approval-intents/N03.json)|
|N04|Actual short-lived grant expiry|1|1|0|20|[intent](approval-intents/N04.json)|
|N05|Integrated container timeout|1|1|1|20|[intent](approval-intents/N05.json)|
|N06|Source-timeout partial cleanup|1|1|0|20|[intent](approval-intents/N06.json)|
|N07|Container cleanup failure and rescue|1|1|1|25|[intent](approval-intents/N07.json)|
|N08|Actual Windows source-delete refusal and rescue|1|1|0|25|[intent](approval-intents/N08.json)|
|C01|Child crash, natural reclaim and stale fencing|1|2|2|40|[intent](approval-intents/C01.json)|
|C02A|Parent crash, physical overlap denial and recovery|1|3|2|55|[intent](approval-intents/C02A.json)|
|C02B|Real-aged source orphan cleanup only|0|0|0|20|[intent](approval-intents/C02B.json)|
|L01|Real already_applied schema path, zero DDL|0|0|0|20|[intent](approval-intents/L01.json)|
|L02|Read-only retained-data down-refusal guard|0|0|0|10|[intent](approval-intents/L02.json)|

Total plan ceiling is 11 new case jobs, 11 enqueue calls, 14 worker launches and 15 sequential container creations, spread across independent future approvals. These are maxima, not blanket permission; no case may borrow quota from another. At most one Guard container may execute at a time, including surviving old-attempt containers. Proposed rows are retained, so an all-case run would add at most 11 scans to the three existing retained scans. No repeat of the old successful two-call idempotency or 42-second prepare_only proof is requested.

## Execution and approval sequence

First complete/review the local prerequisites in the code audit: explicit foundation-probe authority, private source-owner composition, trusted exact probe spec/program, strict owned-resource registry/cleanup, deterministic case-scoped pause/fault controls and real observers. Do not wire Docker into prepare_only or give old permits extra powers. Unit/type/lint and affected integration checks must run after those actual changes; preserve original assertions. This task has not changed application implementation or pretended those prerequisites are finished.

Then materialize FINAL per-case packets from actual built artifacts/specs and measured daemon/image identity, with exact case job/PID ownership protocol, counts, time and rescue effects. Intent hashes here are review hashes only; they are intentionally not understood by runtime permit loaders. Final packet hashes change when placeholders are filled, so this review is not an execution approval. No final execution permission is requested prematurely.

Run Q00 -> I01 -> N00/N01-N08 sequentially -> C01 -> C02A. C02B requires a NEW cleanup-only approval after real source age >=1 hour. L01 is an independent zero-DDL runner check requiring its own narrow runtime approval. L02 is a prepared owner READ ONLY operator step on the same target; it requires no new mutation permission or permit activation and remains unexecuted. Capture preservation before/after every phase; after an unexpected failure stop further mutation and retain all records. Only an explicitly budgeted rescue is allowed after the deliberate expected fault; no silent retry.

## Reuse and blocker rules

Reuse actual PostgreSQL25 checks, initial/final isolated projection hash45e7cfe26767e26ad96ceda0dd2a53649a10ea7a5453844ac50ee30867e1095d, Docker6 synthetic controls, positive Worker/Auth, NTFS hardening and 798 units/build/Guard7/Auth21/Canvas17 where their exact code/environment scope still applies. Repeat a control only for a measured changed artifact/spec/daemon or a missing composition/failure boundary, and record that technical delta. Old evidence cannot be relabeled as new attestations or G02 scanner results.

Use separate statuses PASS, FAIL, NOT_RUN, LOCAL_IMPLEMENTATION_GAP, BLOCKED_BY_PRESERVATION_CONSTRAINT and NOT_VERIFIED/TARGET_NOT_IDENTIFIED. A static missing implementation is not an external blocker. A scope/real-time blocker needs its concrete source/owner constraint, attempted-safe scope (if any), effect and decision owner; it is not a waived mandatory gate or a COMPLETE claim. See [decision/publication rules](50-decision-publication.md).
