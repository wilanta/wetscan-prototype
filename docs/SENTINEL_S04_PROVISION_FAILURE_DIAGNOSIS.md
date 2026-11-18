# S04 provisioning authentication and finalization diagnosis

Status: **IMPLEMENTED_PENDING_ACCEPTANCE**. This work is offline diagnosis and
regression testing. The previous one-attempt authorization is consumed. No new
live audit, authenticated DEV GET, provisioning, emergency containment, service,
worker, migration or database connection is authorized or performed here.

Original execution evidence remains unchanged:

`C:\Users\sheil\.wetscan-sentinel\s04-h04c-b2-provision-1bb216cb99244ecfac7725158605737a`

New private diagnosis evidence:

`C:\Users\sheil\.wetscan-sentinel\s04-provision-failure-diagnosis-7aaa660569684171800942a457fcf4cd`

## Authenticated GET: original cause NOT_CONFIRMED

The exact intended request was GET
`http://localhost:3000/api/sentinel/projects/github-998736528/rules?ruleId=7ad1deb8-e555-44ec-be98-b7def574781d`.
The original runner's inner catch replaced every exception except a directly
typed WebException/ConnectFailure with `authenticated_get_failed`. Its outer
catch retained only `currentOperation`. Exceptions from readiness and scope
validation were also reduced to the same stage. Neither a request count, status,
response body nor exception classification was recorded. Empty Next.js stderr
and a Ready message do not prove that this request reached the server or received
a response. The original HTTP result is **unknown**, not an inferred HTTP 401.

CookieContainer was populated and supplied via WebRequestSession in the reviewed
helper. Its previous header omission defect was not reintroduced. The exact
historical child environment was not recorded. The runner clears AUTH_/GITHUB_
overrides before the APP-only Next child loads production dotenv, while the
successful containment runner allowed inherited auth values. Both use the same
repository, cookie-file path and localhost:3000 origin.

`auth-state.sanitized.json` reconstructs that production dotenv environment by
read/decrypt only; it does not call getSession, refresh tokens, or auth handlers.
There are currently no inherited APP_URL/AUTH_SECRET/AUTH_DATA_DIR overrides;
only .env.local loads. The cookie origin matches, the current secret decrypts
both existing records, the local session was unexpired at the attempted request
time and remains unexpired, and profile/workspace/repository/onboarding checks
match. The live invocation's own offline prerequisite check had also passed.
These observations are consistent with successful containment; they cannot
reconstruct unrecorded historical process variables or prove provider access.

The stored GitHub access token was expired at attempt time and a refresh token is
present. The project GET performs live user/repository/installation authorization
before database access; refresh or provider authorization can fail independently.
No provider request was made during diagnosis, so token refresh, repository
authorization, startup, readiness, redirects, network and response parsing remain
unconfirmed explanations of the original GET outcome.

The helper now attaches the same CookieContainer directly to HttpWebRequest,
disables redirects and retains status before JSON parsing. This also avoids the
PS 5.1 Invoke-WebRequest MaximumRedirectExceeded status loss reproduced during
regression development. Fixed diagnostics distinguish 401, 403, other HTTP
failure, refused redirect, timeout, connection-establishment failure, transport
failure and JSON/schema failure. The owner function separately records readiness
and exact rule/workspace/project/revision validation. Only pre-response
ConnectFailure may be polled within the existing 30-second readiness bound;
HTTP responses, timeout, parsing and authorization failures are never retried.
No arbitrary exception text, response body, cookie, token or private identity is
written to the create-only diagnostic receipts.

## Failure-end audit: demonstrated defects; historical exception NOT_CONFIRMED

The original catch called Stop-ProvisionOwnedProcesses before starting the audit
child, inside one try. No audit-failure-end stdout/stderr/process-result file
exists. Therefore the retained evidence places the error before that child's
log creation; it does not reveal the original exception. Both approvals were
closed later, and the watchdog exited zero after the cleanup handshake. There is
no evidence that approval closure, nullable exit code or early watchdog exit
caused this specific missing audit invocation.

An actual offline reproduction using six owned synthetic PowerShell sleep
processes produced five `owned_process_survived` errors and one null StartTime
error with the original cleanup function. Stop-Process returns before exit is
fully observable. The immediate census can still see a dying process, or lose
its StartTime between reads. This demonstrated race can skip the entire audit
call in the original sequence. Its occurrence in the historical run cannot be
proved because the catch discarded that exception.

There was a second deterministic blocker: once Next had added a second line to
owned-processes.jsonl, loadProvisionInputs would parse the complete journal as a
single JSON document and fail `history_json_malformed` before opening a pool.
The corrected discovery recognizes and validates that journal explicitly.

Cleanup now retains matching PID/start-time handles, tolerates already-exited
processes and waits within a shared five-second bound. The failure lifecycle
independently attempts server termination and the mandatory existing audit,
records both outcomes, and cannot PASS if either fails. The audit still requires
the two live provision-ingest approvals and restricted wetscan_migrator role,
uses the existing read-only capture and verifyProvisionDelta implementation,
and awaits pool.end. There is no audit-only or runtime-gating bypass. A failure
before the first mutation can verify an unchanged snapshot with zero inserts;
historical row drift still fails. Approvals close in finally, after the audit
attempt; the independent watchdog still closes both even if the controller fails.

## Approval inventory: root cause CONFIRMED

The exact first failing file in the original post-run inventory was:

`C:\Users\sheil\.wetscan-sentinel\s04-h04c-b2-provision-1bb216cb99244ecfac7725158605737a\controller-runtime-approval.json.closure.sanitized.json`

Its filename contains "approval", so discovery treated the closure receipt as
an executable approval. historicalMetadata called object(a.target) and failed
`history_metadata`: a closure receipt intentionally has no target/h04cB2/actions
authorization contract. Both actual new CLOSED approvals have valid metadata;
the original 19 approvals are not the cause. The two .before-<guid>.bin files
were additionally counted as APPROVED/runtime authorities instead of immutable
closure evidence. Both this defect and the multiline journal issue were missing
from tests that exercised only the pre-runtime directory contents.

Discovery now recognizes only the two exact runtime approval artifact families.
A receipt/backup is evidence only if its same-directory links, exact schema,
canonical boundaries, hashes, original APPROVED/runtime metadata, final CLOSED
metadata, closedAt and unchanged remaining fields all verify. Orphan, forged,
modified, outside-path or extra backup artifacts fail closed. No broad filename
exclusion was added. All other approvals, including unexpected filenames and
the reviewed legacy terminal statuses, retain the existing closure requirement.
The two exact process/resource journal names have strict per-line schemas;
approval metadata hidden in either is rejected. No historical file was rewritten.
The actual filesystem inventory now contains **21 terminal approvals** with
empty actions; it performs zero database connections.

## Changed files and preserved contract

- scripts/Invoke-H04CB2ProvisionAndIngest.ps1: delegate authenticated-read
  diagnostics; retain sanitized controller failure; use independent failure audit.
- scripts/sentinel-provision-auth.ps1: functions-only authenticated read and
  failure-audit lifecycle with create-only sanitized receipts.
- scripts/sentinel-session-get.ps1: explicit CookieContainer transport, status
  capture, redirect refusal, bounded timeouts, parsing diagnostics and disposal.
- scripts/sentinel-provision-common.ps1: bounded, identity-scoped process-exit wait.
- scripts/sentinel-approval-history.ts: verified closure evidence and strict
  multiline journal classification without excluding unresolved approvals.
- scripts/sentinel-provision-owner.ts: protect the new helper in the phase's
  immutable code-input manifest; no database/provisioning algorithm change.
- tests/sentinel/session-powershell.test.ts, approval-history.test.ts,
  provision-failure.test.ts and provision-hardening.test.ts: synthetic transport,
  artifact discovery, cleanup/failure sequencing and unchanged-state verification.
- This diagnosis document.

The fixed DEV identity, approval phases/actions, ten-minute external watchdog,
private ACLs, sole credential file, historical checks, positive-ID emergency
scope, 10/12 insert budgets, no-worker rule and no failed-POST retry are retained.
The helper is part of the newly reviewed code pins. Existing manifests and
NOT_VERIFIED receipts remain immutable and must not be used as a new live grant.

## Validation and future execution boundary

The final private verification receipt records typecheck, lint, focused/full
Vitest results, PowerShell parser checks, default-off preflight, whitespace/diff
checks, all historical artifact hashes, changed workspace inputs, new runner SHA
and the fresh review manifest SHA/count. Network preloads deny PostgreSQL and
non-fixture connections. Synthetic loopback HTTP fixtures use temporary ports;
no DEV GET, Next.js, Docker or worker is started. Invalid/expired temporary
approval fixtures cannot grant runtime access.

Offline readiness does not recover the unknown historical HTTP result or prove a
future provider/database result. A new candidate needs owner review and a fresh
single-attempt authorization before live use. No old authorization is reused.
Stop after offline validation; retain IMPLEMENTED_PENDING_ACCEPTANCE.
