# Restore existing G02 process references ? no password setup

Actual owner preflight19November18:37:12 WIB verified Auth/provider/binding/policy/sandbox, but all four DB references were absent in THIS process. No DB authentication was attempted. The installer sets only PowerShell Process environment; package guard:dev runs Next directly and does not strip references. The exact reason the terminal lost references is not independently known. Existing password files have NOT been declared missing.

The helper below is metadata-only and has7 regression cases. It accepts exactly one existing .local/wetscan-g02-runtime-db-UUID directory; validates private root ACL, non-symlink file metadata and non-secret role/target/expiry/migration approval JSON. It NEVER opens password files, writes files, creates credentials, changes roles/database, or connects to PostgreSQL. Missing/multiple/invalid candidates STOP; do not rerun password setup or choose another role. The agent has not run this against owner credentials.

In the SAME legitimate owner terminal, stop only your identified integration server with Ctrl+C, then run this WHOLE block once. Do not print or send g02ExistingReferenceText/g02ExistingReferenceResult/refs or private paths.

```powershell
Set-Location 'C:\laragon\www\wetscan-2\wetscan-guard-mvp-local-demo'
$env:GUARD_PRODUCT_ENABLED = '0'
$g02ExistingReferenceText = node --conditions=react-server --import tsx scripts/guard-live-reattach.ts
if ($LASTEXITCODE -ne 0) { throw 'G02_EXISTING_REFERENCE_STOP_NO_RETRY' }
$g02ExistingReferenceResult = $g02ExistingReferenceText | ConvertFrom-Json
if ($g02ExistingReferenceResult.error -or -not $g02ExistingReferenceResult.refs) { throw 'G02_EXISTING_REFERENCE_STOP_NO_RETRY' }
foreach ($g02ExistingReference in $g02ExistingReferenceResult.refs.PSObject.Properties) {
  if ($g02ExistingReference.Name -notin @('GUARD_DB_APP_APPROVAL_FILE','GUARD_DB_APP_PASSWORD_FILE','GUARD_DB_WORKER_APPROVAL_FILE','GUARD_DB_WORKER_PASSWORD_FILE')) { throw 'G02_REFERENCE_NAME_STOP' }
  [Environment]::SetEnvironmentVariable($g02ExistingReference.Name, [string]$g02ExistingReference.Value, 'Process')
}
$g02ExistingReferenceResult.safe | ConvertTo-Json -Depth 8 -Compress
npm.cmd run guard:dev
```

GUARD_PRODUCT_CONFIG_FILE remains the reviewed SAST-only reference you just configured (SHA77e007dbcac3be120f61d9df25f6aa36bcb437da1cd0fcd4579df4c5c92a7635); it is not reset to target-only. After server ready, run the ENTIRE existing test-results/g02-next-preflight.READONLY.js once on the existing localhost owner session. This is a NEW process-readiness observation after restoring references, not retrying a scan. Send only helper safe JSON and the actual preflight/pin JSON. Expected both DB observations READONLY_TARGET_ROLE_SCHEMA_RLS_VERIFIED, then metadata pin. On error/unknown/blocked Console STOP without retry/bypass/login reset. No Start/Resume/snapshot/worker/scanner/cancellation/database mutation.

Qualification ends19November19:20:33 WIB. This is not runtime scan approval; do not activate GUARD_PRODUCT_ENABLED=1. No DB/password provisioning is needed by this procedure.
