# S04 one-record archive-only authentication exception

## Current owner decision - 16 November 2026

**ACCEPTED_OFFLINE_WITH_DOCUMENTED_RESIDUAL_RISKS** for exactly one
archive-only historical authentication record. Overall S04 remains
**IMPLEMENTED_PENDING_ACCEPTANCE**. This is not complete in-place preservation
and grants no live or subsequent-phase authorization.

See the [owner acceptance and closure summary](SENTINEL_S04_OFFLINE_ACCEPTANCE.md)
for the four accepted residual risks, unchanged evidence, manifest implications,
and next-phase prerequisites. Earlier review receipts retain their original
results; no historical failure has been rewritten.

S04 status: **IMPLEMENTED_PENDING_ACCEPTANCE**. This implementation is authorized
for offline implementation, testing and verification only. It grants no live
acceptance, database, provisioning, application or worker permission.

## Additive implementation

- scripts/sentinel-owner-session-exception.ts: read-only verification core.
- scripts/sentinel-owner-session-audit.ts: fixed-policy offline executable.
- scripts/Invoke-S04OwnerSessionArchiveAudit.ps1: default-off owner-side wrapper.
- tests/sentinel/owner-session-exception.test.ts: synthetic regression cases.

Production authentication behavior, the provisioning runner, original inspector,
old baselines and every historical failed receipt remain unchanged. The new
executable imports neither the auth session/store API nor a database driver.
It decrypts records directly and never calls getSession, refresh or GitHub.

The executable freezes exactly one original record/path and the reviewed pins:

| Evidence | SHA-256 |
| --- | --- |
| Original recovery proposal | 2b29c5f4c41a89ca663a3f3a5e282ba2d6f92ee7db5b8a086e2bb546c4a37152 |
| Original encrypted backup | 44af3d9ea05ba53ed1592d96e064a400f4c811dc86a17aa882947eb556f7e945 |
| Reviewed exception design | 932f11cbdb0dc37cb09aa421fe7cecf22245867e064381014cbbce2d18670509 |
| Original snapshot | 4636a00c2b3aa82d23efe215cec3d42131f79549c37f5617022599c8c896780a |
| New explicit descriptor | f847fbab8bbfd48f78089170c3e764a0da121236aa43e1e9299267b5dffad147 |

New private implementation/evidence directory:

`C:\Users\sheil\.wetscan-sentinel\s04-auth-archive-exception-9c53ab2d86a94d0aa219d5a5535422e0`

archive-only-exception.descriptor.private.json is a new descriptor, not a runtime
database approval. The old design still records its historical proposal state;
it has not been rewritten. The owner grant authorizes this new offline use.

## Enforcement

The descriptor hash, fixed paths, one-record count, original proposal/design/
baseline hashes, expected owner, DEV scope, test workspace, repository and origin
must all agree. There is no CLI/environment override for a record, owner, hash
policy, wildcard omission, or exception count. The core accepts a trusted policy
for deterministic synthetic testing; the executable exposes only the single
frozen production policy and rejects unknown/duplicate arguments.

The missing active file must be absent before and after verification. Its archive
must match the exact pre-login hash and decrypt to the expected owner with the
original record-associated identity. The original cookie must hash to that exact
record name. No copy is restored to AUTH_DATA_DIR.

All eight backups, the original cookie/metadata, three other historical sessions,
existing cache and the permitted semantic profile update remain verified. The
reviewed design also pins all six currently existing auth/cache files, so a new
profile rewrite or current-record mutation is rejected. A second missing file,
unexpected added record/directory, changed backup, or reappearing old record
fails closed. Private boundaries, link/alias checks and Windows ACL checks apply.

The new cookie must match a unique final encrypted session absent from the
baseline, created during the login window, unexpired with no pending flow, with
expected owner/profile/workspace/repository bindings and exact origin metadata.
Access and refresh credentials must exist. At least 30 minutes of access-token
validity is required at the final decision time. Config/baseline hashes and
source inventory are rechecked; plaintext secrets and records never enter logs.

Success is explicitly labeled:

`PASS_WITH_APPROVED_AUTH_ARCHIVE_EXCEPTION`

The receipt reports one archive-only record, three preserved historical active
sessions and completeHistoricalActiveFilePreservation=false. It also states
liveAcceptanceAuthorized=false and providerCurrentAccess=NOT_TESTED. It never
retroactively labels a historical failure as complete in-place preservation.

## Interface and output

Default command from this checkout:

```powershell
powershell.exe -NoProfile -File scripts/Invoke-S04OwnerSessionArchiveAudit.ps1
```

This performs filesystem-only checks and returns OFFLINE_READY without creating
an output directory, receipt, approval, process service or connection pool. No
Next/worker/port-3000 conflict is allowed. Database environment variables are
rejected; existing production auth configuration is loaded without printing it.

To record an explicitly authorized offline verification, the real interface is:

```powershell
powershell.exe -NoProfile -File scripts/Invoke-S04OwnerSessionArchiveAudit.ps1 `
  -VerifyExistingCandidate -ManifestFile '<reviewed-private-manifest>' `
  -ManifestSha256 '<reviewed-manifest-sha256>' `
  -OutputDir 'C:\Users\sheil\.wetscan-sentinel\s04-auth-archive-validation-<fresh-32-lowercase-hex-id>'
```

The actual hash-guarded command and completed pin/count results are stored in the
new private implementation directory. Do not substitute placeholders to claim a
reviewed run. This is an offline command, not a live acceptance permission.

Verification requires the manifest with exact descriptor, source, baseline,
backup, candidate and metadata pins plus all four dotenv presence/hash entries
and the one expected absent path. The wrapper pins its implementation and shared
ACL dependencies. It creates an owner/SYSTEM-protected directory only under the
specified fresh validation prefix. The verifier accepts an empty owned output
directory, writes a create-only sanitized receipt, flushes and closes its handle,
and cannot write into an auth/input/old-run directory. No automatic retry or
overwrite exists. Failure output is redacted and cannot become a PASS receipt.

## Evidence and remaining boundaries

Tests use synthetic opaque/encrypted records in bounded temporary roots. No real
authentication data is changed by tests. Full results, manifest SHA/count,
validator/runner hashes, original private-file preservation and the actual
candidate result are recorded in implementation-verification.sanitized.json.

The reason the old file disappeared remains unknown. This audit checks absence
at verification time; it does not install a permanent application revocation
ledger or prevent an external actor from writing later. Such reappearance fails
future verification. Current GitHub authorization and the previously diagnosed
refresh-persistence hazard are not exercised or repaired here.

After final owner review, any future provisioning must explicitly select the new
candidate CookieFile, refresh the lifetime/input checks, use an independently
reviewed manifest and perform its mandatory DEV preservation audit under a new
single-attempt owner grant. STOP after offline verification in this task.
