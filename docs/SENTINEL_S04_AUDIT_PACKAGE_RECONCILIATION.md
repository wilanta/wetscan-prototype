# S04 standalone preservation audit package reconciliation

Prepared offline on 17 November 2026. This is package preparation, not database
acceptance or permission to connect. Overall S04 remains
`IMPLEMENTED_PENDING_ACCEPTANCE`; the authentication milestone remains
`ACCEPTED_OFFLINE_WITH_DOCUMENTED_RESIDUAL_RISKS`.

## Historical evidence and reconciled source

The corrected owner runner is `scripts/Invoke-S04ReadOnlyAudit.ps1`, SHA-256
`fc557d8360ab179d560bafef9a8861cca6f78eb7ed2fe0350b416604f27bb1d2`.
It already preserves native PowerShell child handles and validates independently
bound audit, controller, watchdog and closure evidence. The earlier executed
runner and original NOT_VERIFIED controller receipts remain historical inputs.

The previous candidate manifest has 560 entries and SHA-256
`b862f73f78378a94e0aa81c66a17be7738308a5f10eda944560a0d791f5ca1f0`.
Its private artifacts remain unchanged. Six source pins require reconciliation:
the shared provisioning owner/common/watchdog, retired provisioning PowerShell
runner, historical approval scanner and CookieContainer diagnostic helper.
Their current bytes are bound to the preserved later package/enforcement repair
evidence. This task adds the audit-package validator and changes only the audit
CLI's package validation boundaries. Exact before/after hashes and provenance
are separate create-only artifacts; no historical manifest or receipt is edited.

## Current package confinement

The new manifest retains every old candidate path, all pre-existing private
evidence, migration sources, transitive local source dependencies and complete
installed runtime package directories. A generated dependency inventory records
the resolved paths. The owner procedure, infrastructure verifier, tests, package
configuration, migration credential-file hash and fresh configuration bindings
are pinned as inputs. Final manifest/command/completion outputs are kept out of
their own input set to avoid checksum self-reference.

The required `audit-package-bindings.private.json` binds the exact audit phase,
zero-write limits, target container/image/volume, credential file, four dotenv
presence/hash states, runtime binaries, parent manifest, explicit source
reconciliations, historical inventory, reviewed procedure and PostgreSQL recovery
receipt. Missing/different metadata or required dependency pins fail closed.
No command-line option permits skipping this check. It runs during default-off
preflight and before connection; configuration/authentication integrity is checked
again after the pool closes and before successful evidence is published.

The six current encrypted auth/cache files are hash-only preservation inputs.
The exact archived historical session remains required absent. No cookie is used,
no session is decrypted and no token is refreshed. The expired OAuth candidate
does not prevent this database-only audit; it remains unusable for provisioning.
This is archive-only preservation, not complete in-place auth preservation.

## Read-only SQL, role and cleanup

The existing snapshot/preservation algorithm is reused unchanged. The audit's
`wetscan_migrator` role has broader capabilities than SELECT; no grants are changed
and no claim is made that its database privileges are intrinsically read-only.
Actual role flags/membership and SELECT access must pass on the sole future
connection. This package confines that connection with:

- Exact `127.0.0.1:55432/wetscan_dev`, marker
  `wetscan-s01:26b6b537-c016-4dc7-8007-4e839e8b838f`, PostgreSQL 17.12 and role identity.
- Session `default_transaction_read_only=on`, verified read-only settings, and
  `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`.
- Fixed SQL SELECT allowlist and exact transaction controls; no DML/DDL,
  arbitrary SQL, migrations, provisioning or provider permission.
- One pool slot, maximum one connection attempt, no reconnect/retry, maximum
  120-second approval/deadline, 3-second connection timeout, 5-second statement
  timeout, 6-second query timeout, 5-second idle-transaction timeout and 1-second
  lock timeout.
- Expiry and authorization-hash checks on queries, deadline-triggered client
  destruction, idempotent release and awaited pool closure in `finally`.
- Independent bounded watchdog, exact owned-process identity, independently
  attempted cleanup and one temporary audit-only approval closed with empty actions.

No runtime approval is used. The future authorization is solely
`kind=wetscan-s04-dev-preservation-audit`, `phase=preservation-audit`,
`actions=[read_only_audit]`, bound to manifest/run/output/owner and a maximum
120-second lifetime. Unknown, stale, widened or mismatched approvals fail closed.
Any connection, timeout, identity, permission, preservation, package or cleanup
failure stops the attempt without retry. Keep all failed receipts; never repair
the database or widen permissions to obtain PASS.

## Preservation and evidence limits

The verifier checks all 91 original rows and the canonical pre-recovery snapshot,
16 exact job IDs (eight protected queued, six original non-queued, two prior
acceptance jobs), eight heartbeats, Incident #1 and evidence/timeline, three
contained sources with no active credentials, all three disabled rules, and the
contained rule DISABLED at revision 3. It verifies four migration checksums,
25-table inventory, six S04 indexes, binding/scope, no unexpected records,
leases, orphan evidence or application/worker sessions. It uses paired row data
and exact row-hash multisets, not counts alone.

The already-authorized containment delta uses the reviewed semantic checks where
complete historical after-hashes do not exist. No new byte-level proof is invented.
Raw rows remain transient in memory; persisted audit results contain sanitized
findings, ID sets and row hashes. No credentials or raw authentication/telemetry
records are written to reports.

The infrastructure receipt proves the previously restored container identity,
healthy startup and existing volume, not historical row preservation. A future
owner procedure must independently recheck the same existing container ID,
image, restart policy, mounts, healthy state and loopback publication without
starting services. Live database identity, permissions and preservation remain
NOT_VERIFIED until separately authorized execution succeeds.

## Next owner decision

Review the new private manifest, bindings, dependency inventory, reconciliation,
procedure, validation results and completion receipt. Authorize exactly ONE
standalone read-only preservation audit using those exact reviewed hashes, a
fresh create-only private output, maximum one connection attempt, maximum 120
seconds, zero database writes and guaranteed connection/approval cleanup.
No provider requests, OAuth, application/worker startup, provisioning, ingestion,
migrations, resets or later phase are included. No consumed authorization applies.

This offline task creates no live approval and makes no PostgreSQL connection.
All acceptance states remain unchanged; stop after package review.
