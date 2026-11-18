# S04 preflight diagnostic repair

Prepared offline on 17 November 2026. Overall S04 remains
`IMPLEMENTED_PENDING_ACCEPTANCE`. The authentication milestone remains
`ACCEPTED_OFFLINE_WITH_DOCUMENTED_RESIDUAL_RISKS`.

## Findings and limits

The single historical owner procedure stopped after 57.108 seconds, before
creating an audit output or approval. It made zero database connections. Its
two redirected invocation logs are empty. The exact failed preflight check is
**NOT_CONFIRMED**; database unavailability, infrastructure drift and a timeout
must not be inferred from elapsed time or missing logs.

Two defects are independently reproducible offline:

1. The outer PowerShell 5.1 wrapper redirected native streams under
   `ErrorActionPreference=Stop`, then replaced its caught ErrorRecord with a
   generic marker. A synthetic native stderr/exit-17 fixture reproduces the
   generic catch and empty redirected error file. The original error was not
   retained. No historical receipt is reclassified as PASS.
2. The old infrastructure helper can compute a fractional remaining timeout.
   Node rejects a fractional `execFileSync` timeout with `ERR_OUT_OF_RANGE`.
   The new calculation floors the remaining budget, retains the five-second
   command / twenty-second infrastructure bounds and fails closed on expiry.
   There is no evidence that this defect caused the historical stop.

## Additive implementation

- `scripts/sentinel-audit-diagnostics.mjs` collects native streams in memory,
  records exact exit codes separately from startup OS errors, bounds output,
  enforces timeouts and performs no retry. Timeout termination targets only
  its just-spawned child process tree. Receipts allow only fixed stage/error
  codes, numeric exit codes, byte counts and timeout flags. Raw streams,
  messages, commands, environment values and ErrorRecords are never persisted.
- `scripts/sentinel-audit-infrastructure.mjs` retains the original container,
  image, health, restart-policy, mount, volume, loopback port, full inventory
  and application/worker-conflict checks. Imports perform no OS/Docker calls.
  Each check has a distinct stage; tests inject metadata and native operations.
- `scripts/sentinel-audit-procedure.mjs` verifies the manifest and all inputs,
  package/configuration bindings and default-off audit before any live
  infrastructure preflight. It records create-only, fsynced STARTED/completed
  stage receipts. The last durable completed and first failed stages are
  explicit. Any error or diagnostic write failure prevents later stages.
  Live admission additionally requires explicit owner/scope opt-in. Exactly
  one invocation of the unchanged standalone audit runner is permitted.
- `scripts/Invoke-S04AuditProcedure.ps1` replaces PowerShell native stream
  redirection with retained .NET process handles and asynchronous in-memory
  stdout/stderr reads. It records the actual coordinator exit code, checks its
  result receipt, catches PowerShell errors and prints only a sanitized summary.
  Bootstrap failures remain failures; missing coordinator/result evidence can
  never become PASS. A launcher receipt points to the detailed child receipt.
  Primary failure metadata and cleanup failures are separate.
- `scripts/sentinel-audit-package.ts` additionally requires all four new
  execution/diagnostic files to be pinned. Existing preservation logic is unchanged.

The legacy private owner procedure, command, helper, manifests and failed
execution evidence remain immutable historical inputs. The new private package
uses a new procedure and new manifest with an explicit old-to-new source
reconciliation. No old manifest is silently repinned.

## Execution and cleanup boundaries

Default invocation is offline: no Docker, provider or database operation; no
approval, audit-output directory or application/worker is created. Private
diagnostic evidence is create-only and owner/SYSTEM protected.

Future live infrastructure commands remain read-only metadata inspection only.
The checker uses a twenty-second shared budget and at most five seconds per
command. Default-off audit validation is bounded to thirty seconds. The existing
database audit retains its maximum one connection attempt and 120-second audit
deadline, read-only session and transaction, fixed SQL allowlist, pool closure,
watchdog and independently closed audit-only approval. No database role/grant,
SQL, preservation algorithm or existing audit runner is changed.

The native collector allows 150 seconds for the audit runner's offline startup
plus its existing 120-second audit/cleanup window. The outer launcher has a
210-second emergency process bound; this does not extend the database audit's
120-second deadline. On abnormal exit, both coordinator and launcher independently
attempt the existing scoped approval/process cleanup. Only the newly generated,
positively identified audit output/run ID may be cleaned up. Cleanup failures
cannot overwrite the primary error or produce PASS.

No raw diagnostics are retained even privately. This deliberately limits
postmortem detail to approved error classes, stage IDs and process metadata.
Unknown errors fail closed with an unclassified code; collecting additional
sensitive diagnostics would require separate review.

## Verification and next decision

Deterministic fixtures cover every preflight stage, manifest/dependency errors,
PowerShell terminating/non-terminating errors, native exit/start/empty-output/
timeout cases, failed diagnostic storage, primary-plus-cleanup failure and
redaction. Default-off validation is additionally run with PostgreSQL/provider
calls blocked by an offline guard. Historical private/authentication hashes are
checked before and after. Failed development-test logs are preserved.

The new package, hashes and test evidence require owner review. A fresh grant
must bind the new owner procedure, launcher, diagnostic modules, manifest and
the unchanged database runner/core. It must authorize exactly one bounded
read-only DEV audit, with zero writes and no retry, provisioning, OAuth,
services, workers, migrations, publication or later phase. The unresolved
historical preflight cause must remain explicit.
