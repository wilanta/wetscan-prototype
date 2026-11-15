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
    phase: 'second_enqueue', httpStatus: response.status, scanId: value.scanId, status: value.status,
    execution: value.execution, scannerExecution: value.scannerExecution,
    exactJobMatches: value.scanId === expectedJob,
    error: /^[a-z_]{1,64}$/.test(value.error ?? '') ? value.error : undefined
  }));
  if (!response.ok || value.scanId !== expectedJob) throw new Error('enqueue_failed_or_job_mismatch_stop');
})().catch(() => console.log('recovery_stopped_or_response_unavailable; preserve evidence; do not retry'));
