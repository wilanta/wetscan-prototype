# S04 independently gated DEV preservation audit

Overall status: **IMPLEMENTED_PENDING_ACCEPTANCE**. The authorized live database verifier returned PASS, while its original final controller receipt remains NOT_VERIFIED. The subsequent offline correction and separate reconciliation are described in [SENTINEL_S04_AUDIT_CONTROLLER_DIAGNOSIS.md](SENTINEL_S04_AUDIT_CONTROLLER_DIAGNOSIS.md). No live rerun is authorized. The candidate below requires a new owner review and grant before any live execution.

## Entrypoints and authorization boundary

- Owner runner: `scripts/Invoke-S04ReadOnlyAudit.ps1`.
- Audit CLI and bounded read-only connection: `scripts/sentinel-readonly-audit.ts` (`offline` by default; explicit `audit` is independently gated).
- Pure authorization contract: `scripts/sentinel-readonly-audit-contract.ts`.
- Approval cleanup: `scripts/sentinel-readonly-audit-common.ps1`.
- Independent two-minute watchdog: `scripts/sentinel-readonly-audit-watchdog.ps1`.

The exact full phase-start verifier, `verifyProvisionStart`, is reused unchanged. `loadPreservationInputs` was extracted from the original filesystem-only provision input loader. The original provision loader still performs its existing discovery/exclusions and requires all remaining approvals closed. Its live gate, mutation budgets, API sequence and cleanup were not relaxed. Historical discovery now also recognizes the separate audit authorization, under unexpected filenames, and blocks unresolved audit approvals. Reports with an audit phase are not mistaken for authorizations.

The new authorization has `kind=wetscan-s04-dev-preservation-audit`, `phase=preservation-audit`, and exactly `actions=[read_only_audit]`. It binds the exact DEV host, port, database and marker; reviewed migration-plan checksum; reviewed input-manifest checksum; fresh run ID; exact private output directory; owner; approval time; and expiry. TTL is at most **120 seconds**. Unknown metadata, missing fields, wrong phase/target, widened actions, future/expired approval time, or mismatched bindings fail closed before connecting.

It carries no `h04cB2` provisioning metadata and cannot satisfy generic runtime, worker, migrate-up/down or integration-test authorization. The audit explicitly rejects provisioning/handoff/emergency execution opt-ins and ambient application/worker/bootstrap/TEST credentials. No web/runtime approval is created. Existing `CLOSED_H04C_B2_READONLY_PREFLIGHT` terminal approvals remain valid historical closed records; they are neither reopened nor rewritten.

## PostgreSQL confinement and lifecycle

The login is the existing `wetscan_migrator`, needed for the complete cross-table historical snapshot. This account owns broader database capabilities; this change does **not** claim that its database grants became read-only. No role or grant is changed. Instead, the dedicated pool:

- Pins `127.0.0.1:55432/wetscan_dev`, marker `wetscan-s01:26b6b537-c016-4dc7-8007-4e839e8b838f`, expected role and PostgreSQL **17.12**.
- Verifies no superuser, BYPASSRLS, CREATEDB, CREATEROLE or inherited role membership, and verifies SELECT access to the 25 expected tables.
- Starts the connection with `default_transaction_read_only=on`, verifies both session read-only settings, and reuses the explicit `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY` capture.
- Allows only the fixed reviewed SELECT statements and the exact BEGIN/COMMIT/ROLLBACK statements. Unknown SQL, DML, DDL and attempts to enable writes are rejected before driver execution. Dynamic table SELECTs are limited to the pinned 25-table inventory.
- Uses one pool slot and at most **one connection attempt**, with no retry. Connection timeout is 3 seconds; statement timeout 5 seconds; query timeout 6 seconds; idle-transaction timeout 5 seconds; lock timeout 1 second. Normal capture uses 42 SELECTs and transaction boundaries.
- Enforces approval expiry on every query, including an on-disk authorization hash check. A monotonic timer destroys an owned client at the deadline; release is idempotent and the pool is closed in `finally` on success/failure, including pre-connect denial. Cleanup failure cannot produce PASS.

The owner wrapper clears unrelated credential/permission environment variables before the child and restores the caller's environment afterward. An independent watchdog can stop only the tracked audit process tree and close only this run's bound audit approval. Approval closure and process cleanup are attempted independently. Closure uses an atomic replacement, preserves a create-only before copy and hash receipt, and ends CLOSED/actions empty. Already closed files retain their original closedAt. Closure corruption/access failure is reported as NOT_VERIFIED, never repaired by broadening scope. There is no second connection for cleanup verification.

All database mutation budgets are **zero**. No Next.js, session cookie, bearer, source/rule creation, ingestion, job claim, worker, emergency containment, migration or reset path is available in this runner.

## Preservation checks

Before a future connection, the audit checks the canonical H04C-A baseline/digest and backup, canonical pre-recovery snapshot, four successful-containment pins and recovery linkage, migration source plan, all historical approval closure states and the reviewed manifest. The executed original manifest pinned **487 existing private files plus 17 implementation files**, 504 entries total. The corrected candidate below adds newer historical artifacts, for 560 entries. The live audit additionally snapshots the private tree excluding only its fresh owned output and verifies those hashes again afterward.

The reused verifier checks exact row-hash multisets, paired snapshot rows and historical ID sets, rather than counts alone:

- All 91 original rows and all pre-recovery committed rows, allowing only the reviewed rule-pointer transition and the one corresponding version/audit insertion.
- All 16 jobs: eight protected queued jobs, six original non-queued jobs, and both earlier acceptance jobs, including the exhausted failed job. No admitted jobs are allowed; the exact job ID union is checked.
- Eight historical heartbeats; Incident `8e8cc956-88cf-585f-ae59-6d47eb6996dc` and all prior incident/evidence/timeline rows.
- Three contained sources with zero active credentials, unchanged prior source/credential rows, three DISABLED rules, and rule `7ad1deb8-e555-44ec-be98-b7def574781d` at DISABLED revision 3 with its expected version/audit semantics.
- The four migration versions/checksums, 25-table inventory, six expected S04 indexes, project binding and owner/workspace/project identity.
- No unexpected new rows in any table, including jobs, incidents, evaluations or events; no missing/modified historical rows, orphan timeline evidence, active/expired leases or unexpected runtime sessions. OS worker/application checks run before and after capture.

The historical before hashes are exact. The authorized containment pointer/version/audit delta is verified using the existing reviewed phase-start semantics; the old containment receipt does not supply an independent after-hash for every newly inserted containment field. The new audit saves the resulting row hashes without overwriting original recovery evidence.

Raw rows exist only transiently in memory for validation. New persisted evidence contains sanitized results, exact ID sets and SQL-text-derived SHA-256 row hashes, plus private file-hash manifests and the necessary audit authorization/closure records. No telemetry body, raw session/auth record, database password or bearer is saved or printed by the audit.

## Original offline verification

| Check                                        | Result                                  |
| -------------------------------------------- | --------------------------------------- |
| Typecheck / lint                             | PASS / PASS                             |
| Focused tests                                | 238/238 PASS, 8 files                   |
| Full Vitest                                  | 992/992 PASS, 61 files                  |
| Three new PowerShell parsers                 | Zero errors                             |
| Actual default-off runner with reviewed pins | OFFLINE_READY, executionPerformed=false |
| Instrumented PostgreSQL / TCP / fetch calls  | 0 / 0 / 0                               |
| Existing private artifacts                   | 487 unchanged                           |
| Existing provisioning PowerShell runner      | Unchanged SHA below                     |

Regression coverage includes target/marker/role/read-only settings, exact preservation and authorized delta, missing/changed rows, extra jobs/incidents/evaluations, separate/widened/wrong/expired authorization, manifest drift/boundaries, connection refusal/timeout with no retry, rollback/pool cleanup, timer expiry, atomic closure and independent cleanup failures, historical audit discovery and default-off execution. File-based approval fixtures are expired since 2020 and cannot authorize live access; other approvals are in-memory doubles.

Private offline evidence and reviewed input manifest:

`C:\Users\sheil\.wetscan-sentinel\s04-audit-controller-diagnosis-24fae561fec74aa18ca4df52f180ac9c`

Candidate input manifest: `candidate-input-pins.private.json`, 560 entries (543 pre-existing private files and 17 runtime source files). This is a new review candidate, not an approved replacement for the original manifest. All original manifests and execution receipts are preserved; stale pins reject the changed runtime.

Candidate input-manifest SHA-256: `b862f73f78378a94e0aa81c66a17be7738308a5f10eda944560a0d791f5ca1f0`.

**Corrected audit runner SHA-256:** `fc557d8360ab179d560bafef9a8861cca6f78eb7ed2fe0350b416604f27bb1d2`. The executed original runner hash was `05c79054461e30b655a247b2455e8aebf9c111d1457cd6a7f501a76423dc02e5`.

Existing provisioning runner SHA remains `e52d2a62ebc23e0008300b34ffce8d3ca4122f78d281fbbac43ecc8531fd9505`. Its shared input/history dependencies changed; any future provisioning review must include those dependencies and requires a fresh owner grant. No prior provisioning authorization applies.

## Proposed owner execution — NOT EXECUTED

After a separate explicit grant for **ONE live read-only audit only**, run as the existing private-file owner. The new output must not already exist. No other phase is authorized by this command.

```powershell
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath 'C:\Users\sheil\OneDrive\Dokumen\Wildhan\projects\wetscan-prototype'
$auditRunner = Join-Path $PWD 'scripts\Invoke-S04ReadOnlyAudit.ps1'
if ((Get-FileHash -LiteralPath $auditRunner -Algorithm SHA256).Hash.ToLowerInvariant() -cne 'fc557d8360ab179d560bafef9a8861cca6f78eb7ed2fe0350b416604f27bb1d2') { throw 'audit_runner_hash_mismatch' }
$auditOutput = Join-Path 'C:\Users\sheil\.wetscan-sentinel' ('s04-dev-preservation-' + [Guid]::NewGuid().ToString('N'))
& powershell.exe -NoProfile -NonInteractive -File $auditRunner `
  -InputManifestFile 'C:\Users\sheil\.wetscan-sentinel\s04-audit-controller-diagnosis-24fae561fec74aa18ca4df52f180ac9c\candidate-input-pins.private.json' `
  -InputManifestSha256 'b862f73f78378a94e0aa81c66a17be7738308a5f10eda944560a0d791f5ca1f0' `
  -MigrationPasswordFile 'C:\Users\sheil\.wetscan-sentinel\s01-20261114\secrets\migration.password' `
  -OutputDir $auditOutput `
  -ExecuteLive `
  -OwnerAuthorization 'OWNER APPROVED ONE READ ONLY DEV AUDIT' `
  -ConfirmScope 'wetscan_dev:preservation-audit:read-only:1attempt'
if ($LASTEXITCODE -ne 0) { throw 'audit_NOT_VERIFIED_STOP_NO_RETRY' }
```

For default-off review, use the same manifest/credential arguments with **no ExecuteLive, OwnerAuthorization, ConfirmScope or OutputDir**. This checks files and OS isolation only and creates no authorization/output or database connection. Missing/changed manifest or input pins fail closed. Do not regenerate pins merely to bypass a mismatch; investigate and obtain another review.

Expected live outputs: `audit-result.sanitized.json`, `row-hashes.sanitized.json`, `input-hashes.private.json`, `authorization-closure.sanitized.json`, `audit-watchdog-cleanup.sanitized.json`, and final `audit-runner-finished.json`, with sanitized child/watchdog logs and tracked process IDs. The final receipt waits for independent watchdog revocation verification, including when the controller already reports completion. PASS requires that final receipt and closure checks, not just the inner snapshot result. Failure stops without retry; preserve all evidence and report connection/closure cleanup status. No original historical artifact is overwritten.

The prior live snapshot establishes historical connectivity, identity, schema and preservation at that run; its original controller receipt remains NOT_VERIFIED. The corrected runner is offline-only until newly reviewed and authorized. No further live audit is needed merely to reconcile the saved evidence. Any future audit and every provision-and-ingest or later phase require their own review and authorization.
