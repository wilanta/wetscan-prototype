# S04 Phase 0 owner adjudication

Owner decision recorded 17 November 2026 (Asia/Jakarta):
**ACCEPTED_BY_OWNER_ADJUDICATION_WITH_DIAGNOSTIC_EXCEPTION**.

This additive decision satisfies the Phase 0 database preservation prerequisite
using the saved audit and independently assessed cleanup evidence. It does not
change the historical overall execution result, **NOT_VERIFIED**, or establish
the database's current state after the recorded audit. No audit rerun is required
to adjudicate this specific diagnostic discrepancy.

Overall S04 remains **IMPLEMENTED_PENDING_ACCEPTANCE**. Offline authentication
remains **ACCEPTED_OFFLINE_WITH_DOCUMENTED_RESIDUAL_RISKS**, as recorded in
[the existing offline acceptance decision](SENTINEL_S04_OFFLINE_ACCEPTANCE.md).
The one-record archive disposition is not complete in-place preservation.

## Evidence bound to the decision

Successful read-only audit run: `03ebdaa1eba04abca18983856c5be620`.

Original execution summary, preserved as NOT_VERIFIED:

`C:\Users\sheil\.wetscan-sentinel\s04-single-audit-execution-7a6b219ca0a7467c86656c5a81f000da\execution-summary.sanitized.json`

SHA-256: `a9dc1670dffc97e0f6644e778de160984c6aaf721eb12d7c254f8371f5e7720e`.

Independent offline cleanup reconciliation:

`C:\Users\sheil\.wetscan-sentinel\s04-cleanup-reconciliation-7d4d1351ba444179a2f3b8458882175a\reconciliation-assessment.sanitized.json`

SHA-256: `b08d4f2e75006d919947ccf0c7f3741f2cc7c813c5b61433e84254f054a57622`.

Reviewed audit manifest SHA-256:
`473059b783837f15f1a73fd200fc1cd314b876830540965476e81b3ee66efdce`.
Its 1,969 file pins and 562 dependency bindings belong to that preserved package;
this decision does not repin or replace it.

The retained evidence supports database identity, marker, role, schema and
migrations; 91 original historical row hashes; all 16 jobs and eight heartbeats;
Incident #1 evidence and timeline; and historical containment invariants.
The run reported one connection attempt, no retry and zero database writes.
The 44-statement count in the execution summary is source-derived, not an
independent query log. Semantic containment-delta checks retain their documented
limits where complete historical after-hashes were unavailable.

Approval closure (CLOSED, actions=[]), awaited pool closure, successful watchdog
exit, and absence of owned audit processes have independent saved evidence.
The reconciliation verified the 60 original evidence-file hashes separately
from the package manifest. These are retained point-in-time findings; recording
this decision performs no new database, provider or process-cleanup operation.

## Explicit diagnostic exception

The final coordinator cleanup child exited 0 with 31 stdout bytes and 840 stderr
bytes. The mandatory stream guard classified that stage as `native_stderr`.
The original stderr payload and its hash were not retained; its exact content
remains **NOT_CONFIRMED**. Synthetic nonfatal PowerShell 5.1 CLIXML progress
reproduced the same exit code and byte counts but cannot prove historical byte
identity or conclusively classify the lost stream.

The owner accepts only this diagnostic uncertainty for Phase 0 adjudication,
based on the independent successful database and cleanup evidence. The original
NOT_VERIFIED receipt, failure classification, manifests, baselines, backups and
reconciliation remain unchanged. No unknown stderr is generally waived, and no
database, authentication, approval or provisioning requirement is relaxed.

## Additive decision record and current handoff

The private owner decision, preserved-input hashes, proposed next authorization
request and post-recording integrity verification are stored in:

`C:\Users\sheil\.wetscan-sentinel\s04-phase0-owner-adjudication-0e187837210c4a029fdce60a9dfb946b`

This document is an additive current Phase 0 handoff. Previously pinned handoff
and acceptance documents retain their historical bytes and results.

Next recommended phase: GitHub authentication recovery. Before an executable
login grant, reconcile and review the auth-only package offline against current
source, configuration, the exact archive-only exception and explicit candidate
selection. The older `s04-reauth-prep` helper moves the canonical cookie in its
archive stage and skips unreadable session records; it must not be used as the
current approved recovery procedure. Historical login procedures and consumed
authorizations must not be reused automatically.

The proposed next authorization is **offline auth-recovery package preparation
only**, followed by a separate hash-bound, owner-controlled login window if
needed. Preserve the original cookie and metadata; capture into a fresh protected
candidate path. Require complete before-state backups, the archived session to
remain absent, preservation of every other historical record, exact owner,
workspace, repository and localhost origin, a unique new session if logging in,
and at least 30 minutes of token validity. No old lifetime measurement or offline
identity result proves current validity or provider access.

Four authentication risks remain: unknown historical session deletion cause,
unverified GitHub access, absence of a permanent revocation ledger, and unresolved
refresh-persistence hazard. No credential refresh or authentication behavior
change is approved here. Any eventual auth-only startup must exclude database
credentials and approvals, stop only owned processes within 15 minutes, avoid
unrelated provider operations, and preserve sanitized failure evidence without
automatic retry. Provider validation beyond the login contract needs explicit
scope. A later provisioning manifest must review legitimate authentication
changes and bind the exact candidate; old manifests remain historical evidence.

No PostgreSQL connection, SQL, OAuth, provider access, credential refresh,
authentication mutation, application/worker startup, runtime approval,
provisioning, ingestion, migration or Git publication is authorized or performed
by recording this adjudication. No subsequent phase is authorized.
