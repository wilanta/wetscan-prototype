# Current G01 decision: connected Worker/Auth PASS prepare_only; overall PARTIALLY COMPLETE

Verified15November2026: two owner-authenticated enqueue HTTP200 responses produce exactly one durable job; one real worker attempt42.005s completed with fence1, observed lease renewals, running?stopped heartbeat, released lease, matching foundation_prepared audit/coverage and fresh final Auth response. Coverage82/90files,175159bytes, partial; scan failed is the truthful G02-unconfigured result, scanner/sandbox NOT_RUN. Post-run SQL18 preservation passes with matching45e7...1095d hashes, differences[],3retained scans/0active leases; actual full target marker independently verified. Old permit bytes/markers and staging preserved. Runtime budget2enqueue+1launch is consumed; no additional action is authorized. Overall G01 remains PARTIALLY COMPLETE: integrated sandbox, live security-negative and real crash/restart/recovery gates remain open.

Read [final Worker/Auth report](WORKER_AUTH_ACCEPTANCE_2c18db66.md) and [Will handoff](../../agent-handoffs/HANDOFF_WILL_G02_G06.md) for exact evidence, provenance/cleanup limits and remaining work. All conflicting older pending/unknown statements below are retained historical checkpoints.

---

# Current status: draft lost; exact job absent; recovery prepared

Owner reports server stop/page refresh with no subsequent Verify/enqueue/replay/worker. A fresh read-only observer at 2026-11-15 23:06:09 WIB confirms no scan, queue, attempt or heartbeat for exact-job 2c18db66...b09ee18. Original export, binding and nonce remain intact. Acceptance is HOLD_DRAFT_LOST_NO_DURABLE_JOB; no recovery request has been executed and permits were not changed. Existing expiry remains 23:54:19 WIB; changes of scope/artifacts/binding or expiry require fresh explicit approval. See [exact-job recovery procedure](DRAFT_RECOVERY_2c18db66.md). G01 remains PARTIALLY COMPLETE; earlier waiting-for-button instructions are superseded.

---

# Current checkpoint: installed deadline repair; new-job approval pending

G01 remains **PARTIALLY COMPLETE**. Source-only acceptance is verified from matching owner-supplied HTTP200 and recovery journal carried forward in CONTINUE_G01.md; no source-only repeat. Deadline v3 is installed in the writable candidate; typecheck/lint/798 units/build/Guard7/Auth21/Canvas17 pass. Latest job is 2c18db662dcf8fec6052e05d02ed1362802facd839fca81a71a888c37b09ee18. New review packet SHA256 7f014b026d5e83634f4a2f07b17ffc9a27aabfe5a50f6c7dd029c7d977a2145a is NOT APPROVED; old permits expired and cannot authorize this different job. No enqueue/live worker/permit activation performed. See [worker recovery checkpoint](WORKER_RECOVERY_2c18db66.md) for actual hashes, validation, provenance, retained history and the concrete approval scope. All older statuses and old execution/UI steps below are historical and superseded where they conflict.

---

# Exact-job UI execution follow-up

Approved request SHA256 5b67e6ddeb0354447e199288bb028e4029c5241c7532d0034eb6e1c6f05f4960. Owner approved 55 minutes; active window 2026-11-15 21:40:34 to 22:35:34 WIB. No approval extension is implied. No restart, reload or repository re-verification is required.

1. Owner clicks Verify approved source snapshot once and supplies only safe Response/status metadata. Stop on failure.
2. After snapshot evidence is accepted, owner clicks Queue approved preparation once. Supply response status and scanId. The UI disables this button after success; do not reload or change the draft to work around it.
3. To test the SECOND identical enqueue already approved, the owner can execute the exact same-origin request below in their existing localhost browser DevTools Console, only when instructed. This uses the normal existing session automatically: it never reads/exports cookies, tokens or credentials. If the browser blocks console execution, do not bypass its protections; report that idempotency live replay is not tested. Do not retry after errors.

```javascript
void fetch('/api/guard/projects/github-839286157/preparation', {
  method: 'POST', credentials: 'same-origin', cache: 'no-store',
  headers: {'content-type': 'application/json'},
  body: JSON.stringify({
  "action": "enqueue",
  "branch": "main",
  "commit": "41861b14dbb3f329fe3b20aed59a008390ef0e2b",
  "profile": "quick",
  "engines": [
    "sast"
  ],
  "idempotencyKey": "19015d9d-9513-4307-9f85-3fb2f421ae6b"
})
}).then(async response => {
  const value = await response.json();
  console.log(JSON.stringify({httpStatus: response.status, scanId: value.scanId, status: value.status, execution: value.execution, scannerExecution: value.scannerExecution, error: /^[a-z_]{1,64}$/.test(value.error ?? '') ? value.error : undefined}));
}).catch(() => console.log('enqueue_response_unavailable; stop without retry'));
```

4. Operator READ ONLY observer must confirm one exact matching queued job before the owner clicks Run approved preparation worker ONCE. Capture its safe Response/status, then observer confirms durable audit/coverage/queue/heartbeat. Scanner and Docker execution are NOT RUN by prepare_only.
5. Owner runs only existing read-only SQL18 observer after activity, then ROLLBACK separately; retain all evidence and Guard rows.

Initial operator observer at 21:41:01 WIB verified no scan/queue/attempt/heartbeat for this exact job. Unauthenticated GET at 21:40:59 WIB returned HTTP401 application/json error unauthenticated, no redirect, no cookie/token sent. This proves unauthenticated denial and pre-job state only; no successful source/worker execution is inferred.
