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
  const response = await fetch('/api/guard/projects/github-839286157/preparation', {
    method: 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  });
  const value = await response.json();
  console.log(JSON.stringify({
    httpStatus: response.status, scanId: value.scanId, status: value.status,
    execution: value.execution, scannerExecution: value.scannerExecution,
    exactJobMatches: value.scanId === expectedJob,
    error: /^[a-z_]{1,64}$/.test(value.error ?? '') ? value.error : undefined
  }));
})().catch(() => console.log('recovery_stopped_or_response_unavailable; preserve evidence; do not retry'));
```
