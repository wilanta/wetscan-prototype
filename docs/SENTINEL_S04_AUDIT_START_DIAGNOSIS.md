# S04 H04C-B2 audit-start diagnosis

Status: **IMPLEMENTED_PENDING_ACCEPTANCE**. This review was offline/read-only except for diagnostic source changes, tests, and new private diagnostic artifacts. No DEV/TEST connection, infrastructure startup, approval mutation, provisioning retry, migration, worker, Next.js, emergency containment or Git publication was performed. The preceding one-attempt live grant is consumed.

## Finding and evidentiary limit

**Exact original exception/failing validator: NOT_CONFIRMED. Infrastructure prerequisite failure: CONFIRMED.**

The failed run used runner SHA-256 `a5f68ca53da1e74d2a48098846f131727d75663f328d368f98367dee0f9d52bc`. Its private directory is `C:\Users\sheil\.wetscan-sentinel\s04-h04c-b2-provision-d8b56da374e248969ac36c56520e7cdc`.

- `audit-start.stderr.log` contains only `{"status":"NOT_VERIFIED","reason":"provision_validation_failed"}`; stdout is empty. This is the CLI's fallback classification, not an original driver error class/message.
- `runner-finished.json` records NOT_VERIFIED, one attempt, no active handoff and no cleanup errors. The sanitized execution summary records audit-start failure, zero provisioning INSERT/UPDATE, no authenticated GET, phase-start snapshot, resource journal or new resources.
- The prior CLI discarded every exception except ProvisionError/ApprovalHistoryError codes. PlatformError, socket errors, SQLSTATE failures, missing-file/JSON errors and other exceptions could all produce the same fallback. The parent PowerShell runner reduced child failure to `phase_operation_failed`, then omitted the failure stage from its receipt.
- Therefore neither a particular validator nor an actual connection attempt/result, including ECONNREFUSED, can be recovered from those logs. No new connection was made to resolve this uncertainty. The failed phase could have stopped before `ApprovedPool.connect()`.

Independent Docker metadata provides a timeline, beyond the later port observation:

| Observation                                                          | UTC                            | WIB      |
| -------------------------------------------------------------------- | ------------------------------ | -------- |
| Expected PostgreSQL container FinishedAt                             | 2026-11-16 01:07:12.248757694Z | 08:07:12 |
| Recorded audit child process start, from owned-processes.jsonl ticks | 2026-11-16 02:13:08.0952881Z   | 09:13:08 |
| Existing execution summary recorded                                  | 2026-11-16 02:15:55.744Z       | 09:15:55 |

The expected container had exited approximately 65 minutes 56 seconds before the audit child, and has not restarted. Its stopped state would prevent a connection to that instance if the connection gate were reached. This supports database unavailability as the leading explanation, but does not prove the historical socket result or rule out an earlier validation failure. Exit code 255 does not identify why PostgreSQL stopped; OOMKilled is false and State.Error is empty.

## Actual execution path

`Invoke-H04CB2ProvisionAndIngest.ps1` runs historical closure checks and offline prerequisites, then (only with live opt-ins) creates a protected fresh output, watchdog and two runtime approvals. With only controller migration-role credentials, it invokes `sentinel-provision-owner.ts audit-start` before starting Next.js.

Audit-start validates output ACL/path; execution opt-ins; paired runtime approval phase, target and ten-minute lifetime; credential separation and approved database configuration; immutable recovery/containment/baseline/backup/migration inputs and historical approval closure; absence of workers. It then constructs ApprovedPool, which does not connect in its constructor.

`captureReadOnlyDevState` performs two pure query-shape checks, then calls `ApprovedPool.connect()`. That call first establishes a driver connection, then validates database, role, shared-catalog marker, privilege flags and PostgreSQL version. Only afterward does the audit begin its repeatable-read **READ ONLY** transaction. Capture reads identity, migration ledger, tables, jobs, leases, heartbeats, sessions, sources, rules, incidents, orphan evidence and row hashes, then commits. The owner checks the migration ledger, then `verifyProvisionStart` checks preservation and expected containment state. Only full success writes the input manifest and phase-start snapshot.

Existing successful containment artifacts verify the historical preservation result and recovery linkage. Their offline pins remain valid, but they cannot establish current database contents or sessions. There is no contemporaneous phase-start snapshot for this failed attempt. Credential validity against PostgreSQL, current marker, role grants, migration state and live historical preservation remain NOT_VERIFIED.

## PostgreSQL infrastructure

Repository sources: `infra/sentinel/compose.yaml`, whitelisted non-secret settings in `.env.sentinel.local`, `docs/SENTINEL_H01_SETUP.md`, and `docs/agent-handoffs/HANDOFF_S01_BASELINE.md`. Docker context is `desktop-linux`; the engine is running.

| Property                    | Verified value                                                                                                    |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Compose project / service   | wetscan-sentinel-local / postgres                                                                                 |
| Container                   | wetscan-sentinel-local-postgres-1                                                                                 |
| Exact existing container ID | 0220e86e719aa43c30dfd3ba371e290de0fe9141d8d1fe7f7fc6a58accb8961f                                                  |
| Image                       | docker.io/library/postgres:17.12-bookworm@sha256:99d1a998c76487d3abb48b141505bda5dcf8089c0c4cd7be40f75de314fa32f0 |
| Published port              | 127.0.0.1:55432 -> 5432/tcp                                                                                       |
| External named volume       | wetscan_sentinel_s01_dev_20261114                                                                                 |
| Volume mount                | /var/lib/postgresql/data, writable                                                                                |
| Bootstrap file mount        | Existing private s01-20261114/secrets/bootstrap.password -> /run/secrets/bootstrap_password, read-only            |
| Current state               | exited, Running=false, exit 255, restart policy no, RestartCount=0                                                |
| Health metadata             | starting, stale because container is stopped; not proof of readiness                                              |
| Current listeners           | 55432: zero; 3000: zero                                                                                           |

Startup dependencies are the existing Docker Desktop Linux engine, pinned image, external existing volume and existing bootstrap secret bind. The Compose healthcheck is pg_isready. There is no application/worker dependency or automatic restart policy. The instance includes DEV/TEST infrastructure; its startup may perform PostgreSQL crash recovery and run its existing healthcheck. No volume contents were inspected.

Native Windows service `postgresql-x64-18` is running automatically; it is not the dedicated reviewed PostgreSQL 17 DEV instance. Other running Docker databases are unrelated. Do not redirect this workflow to those instances.

## Minimal diagnostic correction

Changed files:

- `scripts/sentinel-provision-diagnostics.ts`: allowlisted structured classification for connection refusal/timeout, authentication failure, missing database, permission denial, server not ready, connection loss and DNS errors. Records operation, stage, attempted-connect count and transport/identity facts. Unknown errors remain generic; raw driver messages, arbitrary names/codes, stacks, SQL, URLs, paths and credentials are not serialized.
- `src/platform/database.ts`: optional static diagnostic observer reports connect attempt, identity query, identity verification or exact identity rejection category (database, role, marker, privilege/version). The acceptance predicate, SQL, connection options, error behavior and connection destruction are unchanged. Observer failure cannot authorize or reject a connection.
- `scripts/sentinel-provision-owner.ts`: tracks the audit-start stages, emits the structured sanitized diagnostic, and includes both diagnostic module and pool implementation in future preserved code hashes.
- `scripts/Invoke-H04CB2ProvisionAndIngest.ps1`: records the failed parent operation in runner-finished and final output, before any recovery/audit cleanup can overwrite it. No retry, startup, approval or containment behavior changed.
- `tests/platform/identity.test.ts`, `tests/sentinel/provision-diagnostics.test.ts`: driver-double and pure regression coverage; no PostgreSQL connections.

Reviewed failure separation now includes connection refusal, timeout, authentication failure, wrong marker, incorrect role, historical preservation, migration identity, approval validation and pre-connection input/configuration failure. Identity-query failures remain sanitized target_denied with a distinct query stage; arbitrary server details are intentionally not exported. The historical exception cannot be reconstructed retroactively.

**New runner SHA-256:** `e52d2a62ebc23e0008300b34ffce8d3ca4122f78d281fbbac43ecc8531fd9505`.

This candidate and its changed dependencies require another review before any future live execution. No older authorization or hash may be reused.

## Offline validation and preservation

- Typecheck: PASS. Lint: PASS.
- Focused tests: **194/194 PASS**, seven files. Full Vitest: **928/928 PASS**, 59 files.
- PowerShell parser: zero errors. Git whitespace check: PASS.
- Actual default-off runner: **OFFLINE_READY**, executionPerformed=false. A temporary network guard blocked socket/pg/fetch access: zero pg pool connect calls, zero TCP connect calls, zero fetch calls in the classified run. Four blocked Windows named-pipe IPC attempts were loader/tooling activity, not TCP. The first guard pass counted these generically as socket calls; no connection was allowed.
- Historical discovery: **18 approvals in reviewed closed states, actions=[]**: 14 literal CLOSED and four existing CLOSED_H04C_B2_READONLY_PREFLIGHT. Both failed-attempt approvals are literal CLOSED. No approval was changed or created.
- Nine remediation before/after hashes and exact status-only bytes reverified against immutable backups; original closedAt values, receipt hash, inventory/preview pins and recovery/containment pins match.
- **462 pre-existing private files unchanged** in a fresh full-root SHA-256 comparison, including the prior failed attempt and recovery/containment evidence. All new private files are confined to the new diagnostic directory.
- Branch remains feat/sentinel-s04-incidents at f7bfeef29488c3f997e9444555039514f55fa0a3. Existing unrelated tracked/untracked work was preserved.

New protected, create-only diagnostic directory:
`C:\Users\sheil\.wetscan-sentinel\s04-audit-diagnosis-ac9a81535cdf4026be47e97a466bc8ea`

Sanitized evidence: `infrastructure.sanitized.json`, `offline-integrity.sanitized.json`, `diagnosis.sanitized.json`, default-off stdout/stderr and `offline-network-counts.jsonl`. No historical artifact was overwritten. Two local verification-helper issues (Windows ESM file URL and literal-versus-reviewed closed status handling) were corrected offline; they made no database or approval changes and do not establish a cause for the historical failure.

## Recommended next action and authorization boundaries

The smallest infrastructure remediation is to start **only the existing pinned container**, preserving its image, bindings and named volume. No credential/configuration/migration correction is demonstrated by current evidence. Infrastructure startup alone does not verify database identity or make provisioning ready.

The following owner-side PowerShell procedure is **proposed, not executed**, and requires separate authorization for infrastructure startup. It never invokes Compose up/down, creates storage, migrates, provisions or starts an application/worker. Stop if any identity assertion differs; do not recreate anything or substitute another container.

```powershell
$ErrorActionPreference = 'Stop'
$dockerExe = 'C:\Users\sheil\AppData\Local\Programs\DockerDesktop\resources\bin\docker.exe'
$containerId = '0220e86e719aa43c30dfd3ba371e290de0fe9141d8d1fe7f7fc6a58accb8961f'
$expectedImage = 'docker.io/library/postgres:17.12-bookworm@sha256:99d1a998c76487d3abb48b141505bda5dcf8089c0c4cd7be40f75de314fa32f0'
$inspectText = & $dockerExe --context desktop-linux inspect $containerId
if ($LASTEXITCODE -ne 0) { throw 'container_inspection_failed' }
$items = @($inspectText | ConvertFrom-Json)
if ($items.Count -ne 1) { throw 'container_count_mismatch' }
$volumeText = & $dockerExe --context desktop-linux volume inspect wetscan_sentinel_s01_dev_20261114
if ($LASTEXITCODE -ne 0) { throw 'existing_volume_missing' }
$existingVolumes = @($volumeText | ConvertFrom-Json)
if ($existingVolumes.Count -ne 1 -or
    $existingVolumes[0].Name -cne 'wetscan_sentinel_s01_dev_20261114' -or
    $existingVolumes[0].Driver -cne 'local' -or
    $existingVolumes[0].CreatedAt -cne '2026-11-14T11:55:03Z') { throw 'existing_volume_identity_mismatch' }
if (-not (Test-Path -LiteralPath 'C:\Users\sheil\.wetscan-sentinel\s01-20261114\secrets\bootstrap.password' -PathType Leaf)) {
  throw 'bootstrap_file_missing'
}
$dbContainer = $items[0]
$bindings = @($dbContainer.HostConfig.PortBindings.'5432/tcp')
$volumes = @($dbContainer.Mounts | Where-Object { $_.Destination -ceq '/var/lib/postgresql/data' })
$secrets = @($dbContainer.Mounts | Where-Object { $_.Destination -ceq '/run/secrets/bootstrap_password' })
if ($dbContainer.Id -cne $containerId -or
    $dbContainer.Name -cne '/wetscan-sentinel-local-postgres-1' -or
    $dbContainer.Config.Image -cne $expectedImage -or
    $dbContainer.Image -cne 'sha256:99d1a998c76487d3abb48b141505bda5dcf8089c0c4cd7be40f75de314fa32f0' -or
    $dbContainer.Config.Labels.'com.docker.compose.project' -cne 'wetscan-sentinel-local' -or
    $dbContainer.Config.Labels.'com.docker.compose.service' -cne 'postgres' -or
    $dbContainer.State.Status -cne 'exited' -or $dbContainer.State.Running -or
    $bindings.Count -ne 1 -or $bindings[0].HostIp -cne '127.0.0.1' -or $bindings[0].HostPort -cne '55432' -or
    $volumes.Count -ne 1 -or $volumes[0].Type -cne 'volume' -or
    $volumes[0].Name -cne 'wetscan_sentinel_s01_dev_20261114' -or -not $volumes[0].RW -or
    $secrets.Count -ne 1 -or $secrets[0].Type -cne 'bind' -or $secrets[0].RW -or
    $secrets[0].Source -cne 'C:/Users/sheil/.wetscan-sentinel/s01-20261114/secrets/bootstrap.password') {
  throw 'container_identity_mismatch'
}
if (Get-NetTCPConnection -LocalPort 55432 -State Listen -ErrorAction SilentlyContinue) {
  throw 'port_conflict'
}
# Sole mutating command; execute only under separate infrastructure authorization.
& $dockerExe --context desktop-linux start $containerId
if ($LASTEXITCODE -ne 0) { throw 'container_start_failed_no_retry' }
# Inspect metadata only; readiness and database identity still require separate review.
& $dockerExe --context desktop-linux inspect --format '{{.State.Status}} {{.State.Health.Status}}' $containerId
if ($LASTEXITCODE -ne 0) { throw 'post_start_inspection_failed_no_retry' }
```

After separately authorized startup, obtain separate permission for any DEV read-only identity/preservation audit. Do not connect under this diagnosis grant. Then review the changed candidate and obtain a **new, explicit, bounded live provision-and-ingest authorization**, including active-resource handoff and emergency bounds if still desired. Neither infrastructure remediation nor offline diagnostic hardening authorizes that live attempt.
