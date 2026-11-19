# Current G01 decision: connected Worker/Auth PASS prepare_only; overall PARTIALLY COMPLETE

Verified15November2026: two owner-authenticated enqueue HTTP200 responses produce exactly one durable job; one real worker attempt42.005s completed with fence1, observed lease renewals, running?stopped heartbeat, released lease, matching foundation_prepared audit/coverage and fresh final Auth response. Coverage82/90files,175159bytes, partial; scan failed is the truthful G02-unconfigured result, scanner/sandbox NOT_RUN. Post-run SQL18 preservation passes with matching45e7...1095d hashes, differences[],3retained scans/0active leases; actual full target marker independently verified. Old permit bytes/markers and staging preserved. Runtime budget2enqueue+1launch is consumed; no additional action is authorized. Overall G01 remains PARTIALLY COMPLETE: integrated sandbox, live security-negative and real crash/restart/recovery gates remain open.

Read [final Worker/Auth report](WORKER_AUTH_ACCEPTANCE_2c18db66.md) and [Will handoff](../../agent-handoffs/HANDOFF_WILL_G02_G06.md) for exact evidence, provenance/cleanup limits and remaining work. All conflicting older pending/unknown statements below are retained historical checkpoints.

---

# Two enqueues verified ? one durable job; worker launch pending

Both owner-supplied enqueue responses returned HTTP200 with exact scanId 2c18db662dcf8fec6052e05d02ed1362802facd839fca81a71a888c37b09ee18. Read-only observer at 2026-11-15 23:16:47 WIB confirms exactly one matching queued scan revision1 and queue row attempts0/fence0, no lease, attempt row or heartbeat. Scan/queue/audit are unchanged since the first enqueue; idempotent replay is LIVE_VERIFIED. No further enqueue is permitted under this two-call budget.

The four original purpose permits were rechecked and unchanged; 41 implementation hashes match. Approval expires 23:54:19 WIB. One prepare_only launch remains, through the existing authenticated preparation endpoint with body action launch plus the exact scanId. The owner executes OWNER_LAUNCH_WORKER_2c18db66.js only once when instructed; it performs fresh readiness/Auth and one launch POST, no enqueue or scanner. Keep the browser/server open while it awaits the backend result. Do not repeat on error or unknown outcome. Retain authenticated_readiness, worker_launch_started and worker_launch_result safe JSON; do not expose headers/cookies/tokens.

Read-only observers should capture the actual leased job and renewals, worker running/stopped heartbeat, attempt outcome, persisted foundation_prepared audit/coverage and cleanup evidence. HTTP200/childexit0 alone is insufficient. A G02-unconfigured failed scan is expected for prepare_only and must not be called scanner success. Integrated sandbox/security-negative/crash-restart gates remain open; G01 is PARTIALLY COMPLETE. See [single launch snippet](OWNER_LAUNCH_WORKER_2c18db66.js).

---

# First enqueue verified ? one durable job; replay pending

Owner supplied actual readiness HTTP200 and first enqueue HTTP200 for exact-job 2c18db662dcf8fec6052e05d02ed1362802facd839fca81a71a888c37b09ee18. Read-only observer at 2026-11-15 23:14:19 WIB confirms bindingMatches true, one guard.scans record queued/revision1 and exactly one platform.jobs record queued/attempts0/fence0, no lease, attempts or heartbeat. Queued audit actor github-user-145520313 and subject/job match. This proves the first durable enqueue, not replay idempotency or worker preparation.

Remaining approval budget: one identical enqueue replay, then one prepare_only worker only after replay verification. Expiry unchanged: 23:54:19 WIB. Owner should execute only the prepared OWNER_SECOND_ENQUEUE_2c18db66.js once when instructed, retain its safe JSON, then await observer confirmation; do not repeat the first script or launch a worker. No scanner/G02/Sentinel/GitHub writes. See [single second-request snippet](OWNER_SECOND_ENQUEUE_2c18db66.js). Earlier absent-job/first-request-pending entries are historical.

---

# Recovery resumed ? preflight passed; owner-session request pending

Owner instructed resumption with Auth verification before enqueue. At 23:09:42?23:09:43 WIB, exact DB state remained empty, original binding/nonce/export and 41 implementation hashes matched, and all four unchanged permits were valid until 23:54:19 WIB. Existing approval covers the same original payload/endpoint/job and remaining counts. The owner-session snippet now first performs the requested read-only authenticated readiness check, then at most one existing approved enqueue. No Verify, nonce generation or worker launch is added. Backend fresh actor/workspace/HEAD/permit checks remain mandatory before its DB write. This snippet has only been syntax-checked, not executed by the agent.

[Owner-session snippet](OWNER_FIRST_ENQUEUE_2c18db66.js). If readiness returns non-2xx or database/schema are not approved/verified, it stops before POST. The readiness response may truthfully report status BLOCKED and execution G02_NOT_CONFIGURED; that is not scanner readiness. Preserve both safe output lines. Do not repeat after error/unknown outcome.

---

# Exact-job draft recovery after UI refresh

Status: **PREPARED, NOT EXECUTED**. Acceptance is HOLD_DRAFT_LOST_NO_DURABLE_JOB; G01 remains PARTIALLY COMPLETE.

## Actual database finding

At 2026-11-15T16:06:09.189Z (23:06:09 WIB), the existing exact-job observer used BEGIN READ ONLY and ROLLBACK: scan null, queue [], attempts [], heartbeats []. Job 2c18db662dcf8fec6052e05d02ed1362802facd839fca81a71a888c37b09ee18 is not persisted in the approved target. [Actual observer JSON](worker-auth-observer-after-refresh.job-2c18db66.json) is retained. The same job was absent before the reported refresh too; no deletion or reset is inferred. Owner reports the server stopped, page refreshed and no Verify/enqueue/replay/launch followed. The cause of server termination has not been independently established.

## Retained identity and approval

- Request SHA256: 7f014b026d5e83634f4a2f07b17ffc9a27aabfe5a50f6c7dd029c7d977a2145a.
- Job: 2c18db662dcf8fec6052e05d02ed1362802facd839fca81a71a888c37b09ee18.
- Actor: github-user-145520313; workspace: github-user-145520313:testing; project: github-839286157.
- Repository: inkAja/wdu / repository839286157 / main / commit41861b14dbb3f329fe3b20aed59a008390ef0e2b.
- Profile quick, engines [sast], idempotencyKey fd1ddd5a-1b8a-4b02-9be7-6bf4eee71eda.
- Original export raw SHA256: fa36fdb116870de6fea0538bdd9fbc9ff6c802691bbaec9c818706145f04472e. [Retained recovery copy](draft-recovery.job-2c18db66.json) is byte-identical, and the original external export is unchanged.
- Active approval expires 2026-11-15T16:54:19.000Z (23:54:19 WIB, 15 November 2026). No renewal or new permit activation was performed during this recovery preparation.
- [Machine-readable plan](draft-recovery-plan.job-2c18db66.json) and [exact enqueue body](draft-recovery.enqueue.job-2c18db66.json) are non-secret review artifacts only.

## Why Verify does not restore the old draft

LiveGuardWorkbench keeps commit/verified/scanId only in React useState. It currently offers download but no import/restore action. verifyGuardRevision generates randomUUID for every verification. Entering the old commit and clicking Verify would therefore create a new nonce/job and would require another exact-job approval; it must not be used to recover this job.

This procedure recovers the original review request from its saved export and uses the existing normal authenticated preparation endpoint. It does not restore a verified React display, assert a live Auth grant, skip repository checks or create a new job identity. No UI/code change is installed; the 41 approved implementation hashes remain unchanged.

## Recovery sequence, not executed here

1. Keep acceptance paused. If the existing app is down, the owner restores the single existing app using [STARTUP_CMD.md](STARTUP_CMD.md) and the already configured sidecar; do not edit/read out .env, reset Auth/session data, start a second writer or kill unrelated processes. This agent has not started/restarted the app. Log in normally only if the existing session actually requires it; do not export any cookie/token. Do not press Verify or source-only snapshot.
2. Immediately before any mutation, recheck candidate cwd/root/branch/SHA/staging, canonical request digest, original export hash, all 41 implementation hashes, all four permit target/binding/expiry fields and remaining operation counts. An observer must still confirm the expected pre-job state. If records exist, inspect that exact state instead of assuming the first request is absent. Use only localhost:3000 and the approved DB/marker.
3. If the scope is unchanged and all permits are still valid, the existing approval applies only to the same exact job and the remaining two enqueue calls/one worker launch. A normal same-origin request can use the original exported payload even though the React buttons disappeared. The first enqueue snippet below is prepared for owner execution only when the paused acceptance is resumed. This is the FIRST enqueue, not the previously planned second replay.
4. Run exactly one first enqueue. Retain its safe status/response, then stop for inspection. Never automatically retry on timeout/network error/401/403/404/409/503, unknown outcome, wrong job ID, expiry, changed identity/HEAD or any mismatch. Inspect the database before deciding what remains. The server still performs fresh Auth, branch/commit, exact permit and target/role checks.
5. Only after a successful first response identifying the exact job, perform the single approved identical replay when instructed. Confirm one durable scan/queue job through the observer. No extra Verify/nonce, enqueue or different job.
6. Because the React scanId button was also lost, this recovery document does not authorize or automatically issue a launch request. Before launch, review the existing endpoint's exact action launch plus the original full scanId, confirm a single matching queued row and valid permits, and coordinate the owner action. The approved budget remains one worker launch; no auto-launch/CLI production worker. This preserves the remaining acceptance sequence rather than silently generating a replacement UI draft.
7. Require fresh authenticated final backend response plus persisted foundation_prepared audit/coverage, exact queue/attempt/lease/fence/heartbeat and owned cleanup evidence. Then perform the existing read-only preservation comparison. Scanner NOT_RUN; G02-unconfigured failed scan status is not scanner success. Preserve all rows, old permits and markers.

## When new approval is mandatory

- Any permit has expired: stop. Prepare a new reviewed time window with real approvedAt/expiresAt and obtain explicit approval before activation or mutation; never edit/extend the old window.
- Any actor/workspace/project/repository/branch/commit/profile/engines/nonce/job, database/marker, actions, counts or execution mode changes: new exact scope/job review and approval. Never rebind an old permit.
- Implementation hashes change, including adding a UI import/persistence feature: retest, rehash the review packet, and obtain new approval for the changed artifact set before live work.
- The exact saved payload and same remaining scope do not require a different job or a nonce reset. This document is preparation, not a new approval, and has executed zero enqueue/worker operations.

No marker deletion, database reset, schema/role changes, Sentinel mutation, source-only repeat, Docker/scanner, GitHub writes, G02 or publication is included.

## Prepared first enqueue snippet

This mutates the approved Guard database if accepted. Execute only after the recovery checks and an instruction to resume; before expiry, in the owner's normal same-origin session. If browser console protections block it, do not bypass them; retain this step as untested. The deadline/origin/hash checks are additional guards, not substitutes for backend authorization. It performs only one request and never reads/exports credentials.

```javascript
void (async () => {
  const expectedJob = '2c18db662dcf8fec6052e05d02ed1362802facd839fca81a71a888c37b09ee18';
  if (location.origin !== 'http://localhost:3000') throw new Error('wrong_origin');
  if (Date.now() >= Date.parse('2026-11-15T16:54:19.000Z')) throw new Error('approval_expired_stop');
  const body = {
  "action": "enqueue",
  "branch": "main",
  "commit": "41861b14dbb3f329fe3b20aed59a008390ef0e2b",
  "profile": "quick",
  "engines": [
    "sast"
  ],
  "idempotencyKey": "fd1ddd5a-1b8a-4b02-9be7-6bf4eee71eda"
};
  const identity = JSON.stringify(['github-user-145520313:testing', 'github-839286157', 'live', body.idempotencyKey]);
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity));
  const actualJob = Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
  if (actualJob !== expectedJob) throw new Error('job_binding_mismatch_stop');
  const authResponse = await fetch('/api/guard/projects/github-839286157/readiness', {
    method: 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error'
  });
  const readiness = await authResponse.json();
  console.log(JSON.stringify({
    phase: 'authenticated_readiness', httpStatus: authResponse.status,
    status: readiness.status, database: readiness.database, schema: readiness.schema,
    execution: readiness.execution, scanAccepted: readiness.scanAccepted,
    error: /^[a-z_]{1,64}$/.test(readiness.error ?? '') ? readiness.error : undefined
  }));
  if (!authResponse.ok || readiness.database !== 'approved' || readiness.schema !== 'verified')
    throw new Error('authenticated_readiness_failed_stop');
  // HTTP200 with status BLOCKED / G02_NOT_CONFIGURED is expected for prepare_only.
  if (Date.now() >= Date.parse('2026-11-15T16:54:19.000Z')) throw new Error('approval_expired_stop');
  const response = await fetch('/api/guard/projects/github-839286157/preparation', {
    method: 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  });
  const value = await response.json();
  console.log(JSON.stringify({
    phase: 'first_enqueue', httpStatus: response.status, scanId: value.scanId, status: value.status,
    execution: value.execution, scannerExecution: value.scannerExecution,
    exactJobMatches: value.scanId === expectedJob,
    error: /^[a-z_]{1,64}$/.test(value.error ?? '') ? value.error : undefined
  }));
  if (!response.ok || value.scanId !== expectedJob) throw new Error('enqueue_failed_or_job_mismatch_stop');
})().catch(() => console.log('recovery_stopped_or_response_unavailable; preserve evidence; do not retry'));
```
