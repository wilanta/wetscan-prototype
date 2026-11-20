void (async () => {
  if (location.origin !== 'http://localhost:3000') throw new Error('wrong_origin_stop');
  if (Date.now() >= Date.parse('2026-11-15T16:54:19.000Z')) throw new Error('approval_expired_stop');
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
  if (Date.now() >= Date.parse('2026-11-15T16:54:19.000Z')) throw new Error('approval_expired_stop');
  console.log(JSON.stringify({phase: 'worker_launch_started', scanId: '2c18db662dcf8fec6052e05d02ed1362802facd839fca81a71a888c37b09ee18', at: new Date().toISOString()}));
  const response = await fetch('/api/guard/projects/github-839286157/preparation', {
    method: 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({"action":"launch","scanId":"2c18db662dcf8fec6052e05d02ed1362802facd839fca81a71a888c37b09ee18"})
  });
  const value = await response.json();
  console.log(JSON.stringify({
    phase: 'worker_launch_result', httpStatus: response.status,
    scanId: value.scanId, status: value.status, preparation: value.preparation,
    execution: value.execution, scannerExecution: value.scannerExecution,
    coverage: value.coverage ? {
      status: value.coverage.status, retrievedFiles: value.coverage.retrievedFiles,
      eligibleFiles: value.coverage.eligibleFiles, bytes: value.coverage.bytes,
      treeTruncated: value.coverage.treeTruncated
    } : undefined,
    exactJobMatches: value.scanId === '2c18db662dcf8fec6052e05d02ed1362802facd839fca81a71a888c37b09ee18',
    error: /^[a-z_]{1,64}$/.test(value.error ?? '') ? value.error : undefined
  }));
})().catch(() => console.log('worker_request_stopped_or_response_unavailable; preserve evidence; do not retry_or_relaunch'));
