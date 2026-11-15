# Two enqueues verified ? one durable job; worker launch pending

Both owner-supplied enqueue responses returned HTTP200 with exact scanId 2c18db662dcf8fec6052e05d02ed1362802facd839fca81a71a888c37b09ee18. Read-only observer at 2026-11-15 23:16:47 WIB confirms exactly one matching queued scan revision1 and queue row attempts0/fence0, no lease, attempt row or heartbeat. Scan/queue/audit are unchanged since the first enqueue; idempotent replay is LIVE_VERIFIED. No further enqueue is permitted under this two-call budget.

The four original purpose permits were rechecked and unchanged; 41 implementation hashes match. Approval expires 23:54:19 WIB. One prepare_only launch remains, through the existing authenticated preparation endpoint with body action launch plus the exact scanId. The owner executes OWNER_LAUNCH_WORKER_2c18db66.js only once when instructed; it performs fresh readiness/Auth and one launch POST, no enqueue or scanner. Keep the browser/server open while it awaits the backend result. Do not repeat on error or unknown outcome. Retain authenticated_readiness, worker_launch_started and worker_launch_result safe JSON; do not expose headers/cookies/tokens.

Read-only observers should capture the actual leased job and renewals, worker running/stopped heartbeat, attempt outcome, persisted foundation_prepared audit/coverage and cleanup evidence. HTTP200/childexit0 alone is insufficient. A G02-unconfigured failed scan is expected for prepare_only and must not be called scanner success. Integrated sandbox/security-negative/crash-restart gates remain open; G01 is PARTIALLY COMPLETE. See [actual idempotency evidence](worker-auth-second-enqueue-response.job-2c18db66.json).

---

# First enqueue verified ? one durable job; replay pending

Owner supplied actual readiness HTTP200 and first enqueue HTTP200 for exact-job 2c18db662dcf8fec6052e05d02ed1362802facd839fca81a71a888c37b09ee18. Read-only observer at 2026-11-15 23:14:19 WIB confirms bindingMatches true, one guard.scans record queued/revision1 and exactly one platform.jobs record queued/attempts0/fence0, no lease, attempts or heartbeat. Queued audit actor github-user-145520313 and subject/job match. This proves the first durable enqueue, not replay idempotency or worker preparation.

Remaining approval budget: one identical enqueue replay, then one prepare_only worker only after replay verification. Expiry unchanged: 23:54:19 WIB. Owner should execute only the prepared OWNER_SECOND_ENQUEUE_2c18db66.js once when instructed, retain its safe JSON, then await observer confirmation; do not repeat the first script or launch a worker. No scanner/G02/Sentinel/GitHub writes. See [actual first-enqueue evidence](worker-auth-first-enqueue-response.job-2c18db66.json). Earlier absent-job/first-request-pending entries are historical.

---

# Current recovery: resumed; awaiting existing-session Auth/enqueue result

Owner instructed continuation of the exact-job recovery. At 23:09:42?23:09:43 WIB, read-only DB state was empty, all 41 implementation hashes and original binding/nonce/export matched, and four unchanged permits were valid until 23:54:19 WIB. Scope/counts remain unchanged. The owner must run the prepared existing-session readiness GET then single exact enqueue; fresh backend Auth/HEAD/permit checks remain required before writing. No enqueue HTTP response or durable job is evidenced yet; worker remains NOT RUN. See [resumed recovery](DRAFT_RECOVERY_2c18db66.md). Earlier HOLD entries describe retained history.

---

# Current status: draft lost; exact job absent; recovery prepared

Owner reports server stop/page refresh with no subsequent Verify/enqueue/replay/worker. A fresh read-only observer at 2026-11-15 23:06:09 WIB confirms no scan, queue, attempt or heartbeat for exact-job 2c18db66...b09ee18. Original export, binding and nonce remain intact. Acceptance is HOLD_DRAFT_LOST_NO_DURABLE_JOB; no recovery request has been executed and permits were not changed. Existing expiry remains 23:54:19 WIB; changes of scope/artifacts/binding or expiry require fresh explicit approval. See [exact-job recovery procedure](DRAFT_RECOVERY_2c18db66.md). G01 remains PARTIALLY COMPLETE; earlier waiting-for-button instructions are superseded.

---

# Connected Worker/Auth Acceptance: exact job 2c18db66

State: **IN PROGRESS ? awaiting owner first enqueue response**. G01 remains PARTIALLY COMPLETE.

Owner explicitly approved request SHA256 7f014b026d5e83634f4a2f07b17ffc9a27aabfe5a50f6c7dd029c7d977a2145a and job 2c18db662dcf8fec6052e05d02ed1362802facd839fca81a71a888c37b09ee18 for at most 55 minutes, only WORKER_RECOVERY_2c18db66.md scope. First approval clock observation 2026-11-15T16:00:19Z (23:00:19 WIB); conservative expiry 2026-11-15T16:54:19Z (23:54:19 WIB), 54 minutes from observation and no extension.

Cwd/writable root candidate, branch feat/guard-g01-s03-integration, HEAD 1b28fb88ae65a29902e0f1f314efdce44ed3c643 and staged index SHA256 40d77c02186b074dacfd2fe3a6f2816d89a7e59d5f279cbe8be8c75c9c716c4f verified. All 41 approved implementation hashes and exported draft hash matched. No implementation changed for this execution.

Four purpose permits activated only after approval. Exact old permit bytes archived under the existing operator directory history-job-2c18db66-20261115T160019Z. Nineteen other existing files retained unchanged by size/mtime; source-only permit and markers were not changed. Restricted activation failed on directory ACL before any write; approved normal execution performed the activation once. No credential contents read/displayed by the agent; authorized observer consumed existing purpose files internally through the existing loader.

Pre-job observer at 2026-11-15T16:02:04.043Z: scan null, queue [], attempts [], heartbeats []; no worker/enqueue. Unauthenticated GET at 16:02:03?16:02:05Z returned HTTP401 application/json error unauthenticated, no cookie/token. These are preflight proofs; fresh authenticated operation response is still required.

Evidence:

- [Approval and archival hashes](worker-auth-execution-approval.job-2c18db66.json)
- [Pre-job observer](worker-auth-observer-before.job-2c18db66.json)
- [Unauthenticated denial](worker-auth-anonymous-check.job-2c18db66.json)
- [Progress state](worker-auth-acceptance.job-2c18db66.json)

Next: owner clicks Queue approved preparation exactly once through the retained localhost UI/session, without Verify/reload/reexport. Await safe HTTP/JSON response before the second identical enqueue. No worker launch before both responses and a matching single queued record. No automatic retry on error; preserve all evidence.

Scanner, Docker/integrated sandbox, G02, GitHub writes, Sentinel mutation, schema/role changes, credentials/.env changes and publication are outside scope. Remaining G01 gates include authenticated connected worker preparation/audit/coverage/lease/heartbeat/cleanup; integrated enforcing sandbox; live security-negative/revocation/cancel/timeout where not evidenced; crash/restart; and unobserved external Sentinel preservation. Prepare_only success does not close these other gates.
