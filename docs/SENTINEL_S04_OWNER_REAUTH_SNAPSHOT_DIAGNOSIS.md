# S04 owner OAuth snapshot failure

Status: **IMPLEMENTED_PENDING_ACCEPTANCE**. Diagnosis and corrected-candidate
validation are offline only. No owner login procedure was retried.

## Confirmed cause and preserved evidence

The original procedure and inspector remain unchanged in:

`C:\Users\sheil\.wetscan-sentinel\s04-owner-reauth-review-8ec04da264d04310bf0750ca16923d34`

The procedure invokes `node --import tsx inspect-owner-session.mjs --mode=snapshot`.
The inspector sorts every entry of AUTH_DATA_DIR, then applies the flat
`session-<64 lowercase hex>.bin` / `user-<digits>.bin` allowlist to every name.
The legitimate `canvas-graphs-v1` directory sorts first and fails
`check(..., 'unexpected_auth_file')`. Its creation timestamp predates the failed
attempt. `src/features/canvas/server/graph-cache.ts` explicitly creates this
namespace under the authentication directory.

The resulting Error is swallowed by the inspector's redacting catch. It emits
`reauth_offline_validation_failed` and exits 1. Windows PowerShell 5.1 correctly
observes that child exit code and raises `backup_snapshot_failed_STOP` before
the timer/Next startup block. This was not an ACL, file collision, destination
reuse, PostgreSQL, GitHub, or Windows process-handle failure.

Failed output, preserved without alteration:

`C:\Users\sheil\.wetscan-sentinel\s04-owner-login-0b8b08a88c004968915185157904dc69`

It contains empty archive/auth-store/candidate directories and an empty
owned-processes journal. No backup, snapshot receipt, Next log, timer log, or
candidate cookie was created. No partial authentication backup exists. Preserve
the entire failed directory; do not reuse or delete it.

All five previously pinned authentication records and all 1600 original input
hashes match. The diagnosis also pins the complete existing six-file auth/cache
tree and 728 historical private files before changes. Current file checks do not
claim a live OAuth, provider-access, or database result.

## Correction

The original preparation/acceptance/recovery evidence is immutable. A separate
candidate exists at:

`C:\Users\sheil\.wetscan-sentinel\s04-owner-reauth-snapshot-fix-ed8e6f4614114a06b837ce5c1f2bf17a`

New repository module: `scripts/sentinel-owner-auth-snapshot.ts`.
Regression tests: `tests/sentinel/owner-auth-snapshot.test.ts`.

The candidate inspector reuses this module for backup and inventory validation.
It accepts only the established top-level record names plus the exact
`canvas-graphs-v1` directory. That directory may contain only the existing flat
`<64 hex>.<64 hex>.<40 hex>.bin` cache files. Unknown files/directories, nested
directories, rejected paths and links fail closed. Cache files are included in
the opaque byte-preserving backup and subsequent preservation verification;
they are not silently skipped. Empty recognized directories are inventoried too.

The snapshot inventories sources before copying, checks destinations, creates
protected cache archive directories, uses COPYFILE_EXCL, verifies both copied
and source hashes, rechecks the full source inventory, and publishes a create-only
schemaVersion 2 snapshot only after success. A create-only start marker prevents
reuse of either successful or incomplete output. Sources are never written.

On failure it retains all partial evidence and emits only a fixed classification
and copy count. It does not serialize OS/crypto messages, source records, tokens,
or filenames. The controller records the child exit code and stops before any
application/timer startup. No failed copy or login is retried. Open JSON handles
close in finally; partial backups are intentionally preserved rather than erased.

The default-off path now validates the source namespace as well as configuration.
The owner-operated prompt, new candidate cookie path, exact origin, required
fresh session and 30-minute token lifetime, independent 15-minute watchdog and
owned-process cleanup remain in place. Production authentication behavior and
the separately documented refresh-persistence defect are unchanged.

## Pins and offline validation

Candidate procedure SHA-256:

`3f063cd6a49fdd7b87cb35f71494c5b4fc91d13498dc965b8ff9193a8337ccc8`

Candidate manifest: `reviewed-snapshot-input-pins.private.json`, 1602 entries:
all 1600 original pins plus the new snapshot module and regression test.
SHA-256:

`580f2afba6898b98edc93789e425381c475ce133ff79a21d31b5af1274ca9e90`

The candidate controller guards the new manifest and inspector hashes, retaining
the unchanged environment, timer, cookie-helper and common-library pins.

Validation: 70 focused tests across four files, including 15 new snapshot tests;
11 synthetic encrypted-inspector cases including actual Windows private ACLs;
typecheck and lint; four PowerShell parser checks; default-off AUTH_PREPARED.
Fault cases cover missing/access-denied inputs, ACL/boundary failure, collision,
partial copy preservation, corruption, repeated invocation and real PowerShell
5.1 child exit propagation. Fixtures use isolated temporary paths and never the
owner's session. Test fixture cleanup is bounded to those temporary roots.
An offline network guard blocks PostgreSQL and non-fixture networking. Sanitized
results and counts are stored in the new review directory.
The guard recorded zero PostgreSQL-driver, TCP, and fetch attempts. It also
blocked local IPC probes; an isolated diagnostic identifies the two probes per
tsx inspector invocation as tsx-named control-pipe attempts, with zero other IPC
in that check. These blocked loader probes did not prevent offline validation
and are not GitHub or DEV connections. No IPC permission was widened.

## New command for review only

**A fresh authorization is required before execution.** The failed owner login
window must not be reused. Run only in an interactive Windows PowerShell 5.1
console after approval; never pass cookie input through chat or tool transcripts.

```powershell
$ErrorActionPreference='Stop'
$script='C:\Users\sheil\.wetscan-sentinel\s04-owner-reauth-snapshot-fix-ed8e6f4614114a06b837ce5c1f2bf17a\Invoke-OwnerGitHubLogin.ps1'
if((Get-FileHash -LiteralPath $script -Algorithm SHA256).Hash.ToLowerInvariant() -cne '3f063cd6a49fdd7b87cb35f71494c5b4fc91d13498dc965b8ff9193a8337ccc8'){throw 'reauth_procedure_hash_changed_STOP'}
& powershell.exe -NoProfile -File $script -ExecuteOwnerLogin -OwnerAuthorization 'OWNER APPROVED ONE AUTH ONLY LOGIN WITH PRIVATE BACKUPS AND NEW COOKIE'
if($LASTEXITCODE -ne 0){throw 'auth_recovery_NOT_VERIFIED_STOP_NO_RETRY'}
```

Authorization must cover one auth-only window, private byte-preserving backups
including the known cache namespace, expected OAuth profile/new-session writes,
manual hidden candidate-cookie capture, offline verification and owned-process
shutdown. Follow the unchanged browser isolation/login/capture instructions in
SENTINEL_S04_OWNER_REAUTH_PLAN.md. No database credentials, runtime approval,
Sentinel GET, provisioning, worker, migration or publication is authorized.
Stop after authentication; review expected file deltas before any future
provisioning manifest or separate acceptance authorization.
