# N04 repair verification - 16 November 2026

**DESIGN_REVIEW_ACCEPTED / RUNTIME_NOT_AUTHORIZED**. Runtime N04: NOT_RUN. No permit activation, Auth/session inspection, database connection, enqueue, real worker, snapshot, Docker operation or scanner ran for this repair. Only offline tests, source/spec/hash preparation and verification were performed.

Branch feat/guard-g01-s03-integration, existing PR#7; baseline1ae505c65934b4135c402395936ff9d552b3d3cc. The old v2 artifacts are unchanged and retained. The active operator now reads revision3 because the shared code hashes changed; all proposed packets were rebound to that code without new case execution. Historical Docker prerequisite evidence is explicitly carried forward, not reprobed.

## Three closed offline gaps

1. Timer: proveN04Denial validates the server-issued TTL exactly60000ms and initial authorization, waits until issuedAt+61000ms, rechecks time after timer wakeup and rejects timestamp mutation/abort. The original TTL is never extended.
2. Authorization: the actual post-hold authorize() must throw an instance of GuardError with code forbidden. Only then does the resolver send the successful denial boundary. Unexpected authorization success and unknown/other errors cannot reach source/preparation or emit that boundary. The parent cross-checks the actual issuedAt/expiresAt captured from its broker response and durably records only selected evidence; record-write failure blocks a successful launch result. Both cancellation and finalization require the post-call denial proof, exact-job no-retry proof and completed child/parent closure. A checkpoint before authorize cannot satisfy these checks.
3. Retry: only the acceptance N04 queue callback is wrapped. It never calls the DB retry callback and refuses the executor retry acknowledgement, including unexpected failure, timeout/shutdown and proof-delivery errors. No enqueue, completion or lease-release is performed by this wrapper. The once-only worker stops, leaving the original retained row leased until the sole explicit cancellation (or natural lease expiry); no second claim/relaunch is authorized. The unchanged shared executor and all non-N04 acceptance/production callbacks retain their old behavior.

## Offline regression results

- 913/913 tests in84 files passed. This includes33 new cases:11 resolver/timer/authorization,8 retry/cancellation and14 independent-evidence/finalizer/quota regressions. Fake clocks are labelled CLOCK DOUBLE; SQL/queue/IPC inputs are isolated doubles. No live grant-expiry or database acceptance is claimed.
- Timer assertions at60000ms and60999ms observe no boundary; at61000ms the actual authorization function throws forbidden before proof publication. Original grant object is frozen/unchanged.
- Rejected paths include wrong TTL/missing issuedAt, unexpected authorization success, unknown exception, code-shaped forbidden object, different GuardError, abort, unknown IPC delivery, scheduled/missing retry proof, wrong job, unknown child result, premature/absent forbidden evidence, extra/unfinished attempts, remaining lease owner, coverage or missing cancellation.
- The actual shared executeLease function is exercised with an OFFLINE queue: no DB retry/enqueue/complete for any N04 failure. A non-N04 regression still schedules the normal retry. The actual cancellation store is exercised over SQL doubles for success and unknown failure: one cancellation update, no INSERT or retry scheduling; unknown SQL failure rolls back without retry.
- Typecheck exit0; final lint exit0 without warnings; build exit0. File tracing checked33 NFT metadata files with0 sensitive local references. The build preceded only the final test-only additions; app/worker code is unchanged since that build.
- All33 retained historical evidence artifacts still verify. No production/Sentinel/shared executor, Auth, Canvas or grant-issuance implementation was modified.

Latest summaries: [unit](validation/unit.3330def7-97b3-437f-88a1-20a6b92d8723.json), [typecheck](validation/typecheck.79c95b42-6a04-4324-b0a4-3ec77b170536.json), [lint](validation/lint.a8375dc9-0ebf-4d61-98a1-20168d452b99.json), [build](validation/build.4f1c8857-9317-42f1-b625-8c24c7350582.json), [packet review](validation/packet-review.json).

## Frozen approval package, inactive

New N04 request SHA256: `1e96dbf4c6a92af63e3e7e6af68d790f189d08edcd003fdc5fe739f38e406612`. Artifact-set SHA256: `e4637213720c1e3bda8328156e1e9639fc4413e21c3f25a18421ddd144e7199e`. All242 raw-byte code/spec/probe/runner/SQL/README artifacts match. The pure reviewer rejects old request10c6ea9d0ea669c9e85920c96703c7f156f0a2e28036a043f9fa2e2e7743345d. A design review or an earlier digest does not authorize revision3.

Exact proposed job remains `c1d4e02983ce7b7ccd005051f1d839a3dea6eca55d9714acbb103e5c11b5d246`; idempotencyKey g01-remain-v1-n04, actor github-user-145520313, workspace github-user-145520313:testing, project github-839286157, repository inkAja/wdu/main@41861b14dbb3f329fe3b20aed59a008390ef0e2b. Only the existing localhost:5432/wetscan_s01_test_guardg01 fixture with its frozen marker and owner wetscan_guard_migrator is in scope. Max20 minutes from a NEW explicit runtime approval;1 enqueue,1 job,1 worker,0 snapshots,0 containers,1 explicit cancellation. No approval timestamp is invented or activated.

[Case sheet](cases/N04.md), [packet](packets/N04.json), [spec](specs/N04.json), [frozen execution README](README.md). The packet and all source hashes are verified locally; fresh Auth/HEAD/DB marker/role, zero-job BEFORE and actual permit expiry remain future runtime preconditions.

Before first job effect: require explicit exact-digest/job/scope/time approval, validate all bound artifacts/runtime/binding, record target-checked SQL18 plus N04 READ ONLY BEFORE (ROLLBACK separately after each), verify zero scan/job count and fresh Auth/HEAD, reserve the one-shot quota before enqueue. Observe one durable job/zero attempts before launch. After the expected denied grant and no-retry/closed-child evidence, perform the sole explicit cancellation, then observe exact terminal rows/attempt/lease/heartbeat. Capture SQL18 and N04 READ ONLY POST, each with separate ROLLBACK; require unchanged Sentinel-fixture and all non-case Guard/schema/catalog/policy/grant projections. Do not send credentials, tokens, cookies or source data.

STOP on missing/expired authority, mismatch, unexpected/unknown response, absent denial/no-retry evidence, wrong counts, unfinished cleanup or preservation differences. Never retry, re-enqueue/relaunch, renew a grant to replace the tested grant, remove markers or reset fixtures to make the case pass. Preserve the original row and all receipts for readonly investigation.

G01 remains PARTIALLY COMPLETE. External Sentinel stays NOT_VERIFIED / TARGET_NOT_IDENTIFIED; full schema down stays BLOCKED_BY_PRESERVATION_CONSTRAINT. The consumed job2c18db66 is never repeated.
