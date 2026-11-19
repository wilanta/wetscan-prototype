# G02 existing-password setup on Windows

This is the owner-requested installation of the two EXISTING Guard-role passwords. The agent does not inspect Notepad, clipboard, password values, credential files or .env. No password is generated/reset; no role/database change, connection, enqueue or scanner is performed by the installer.

The operational DB was owner-confirmed provisioned on19November12:24:41 WIB: localhost:5432/wetscan_dev_guardg02; owner wetscan_guard_migrator; marker wetscan-s01:f0927e49-0e70-4b90-913f-6cd6984df9d8. Ledger/platform3/Guard1, FORCE RLS3, app/worker privileges and zero scans/jobs were observed through postgres. That is not direct password authentication by app/worker. Do not rerun CREATE/schema.

## Before starting

Use the owner PowerShell terminal normally configured for the integration website. If that terminal is running the identified integration dev server, stop that server normally with Ctrl+C before the setup. Do not stop an unknown process, Sentinel worker or any pgAdmin/N01 connection.

Enter ONLY each role's existing password at its hidden prompt, with no role label, quotes or extra whitespace. Values must match the existing PostgreSQL role exactly. Do not paste them into chat, source code, command arguments or environment variables. The input is consumed only by the local installer through stdin. UTF-8/base64 is a transport representation, not encryption; it is captured in memory and never printed.

The helper creates one fresh ignored .local/wetscan-g02-runtime-db-UUID directory, verifies owner+SYSTEM-only ACL, and exclusively creates two separate password files plus non-secret app/worker exact-target configuration and a target-only runtime file. Existing files/G01 state are not read or overwritten.

Database configuration expires22November2026 00:00 WIB, explicitly chosen in the command. This is ordinary connection-configuration validity, not a G01 acceptance window or website scan quota. The target-only config has no repository policies/scanner deployments and cannot enable scanning; GUARD_PRODUCT_ENABLED stays0. No G01 permit is generated/reused.

## Run this whole block once in your own terminal

```powershell
Set-Location 'C:\laragon\www\wetscan-2\wetscan-guard-mvp-local-demo'
$g02AppSecure = $null
$g02WorkerSecure = $null
$g02AppPtr = [IntPtr]::Zero
$g02WorkerPtr = [IntPtr]::Zero
try {
  $g02AppSecure = Read-Host 'EXISTING wetscan_guard_app password (hidden)' -AsSecureString
  $g02WorkerSecure = Read-Host 'EXISTING wetscan_guard_worker password (hidden)' -AsSecureString
  $g02AppPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($g02AppSecure)
  $g02WorkerPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($g02WorkerSecure)
  $g02Json = @{
    app = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($g02AppPtr)
    worker = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($g02WorkerPtr)
  } | ConvertTo-Json -Compress
  $g02Encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($g02Json))
  $g02SetupText = $g02Encoded | node --conditions=react-server --import tsx scripts/guard-live-setup.ts --existing-passwords-base64-stdin --expires-at '2026-11-22T00:00:00+07:00'
  if ($LASTEXITCODE -ne 0) { throw 'G02 setup STOP: do not retry or delete files' }
  $g02Setup = $g02SetupText | ConvertFrom-Json
  if ($g02Setup.error -or -not $g02Setup.refs) { throw 'G02 setup STOP: preserve files' }
  foreach ($g02Ref in $g02Setup.refs.PSObject.Properties) {
    [Environment]::SetEnvironmentVariable($g02Ref.Name, [string]$g02Ref.Value, 'Process')
  }
  $env:GUARD_PRODUCT_ENABLED = '0'
  $g02Setup.safe | ConvertTo-Json -Compress
} finally {
  if ($g02AppPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($g02AppPtr) }
  if ($g02WorkerPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($g02WorkerPtr) }
  if ($g02AppSecure) { $g02AppSecure.Dispose() }
  if ($g02WorkerSecure) { $g02WorkerSecure.Dispose() }
  Remove-Variable g02Json,g02Encoded,g02AppSecure,g02WorkerSecure -ErrorAction SilentlyContinue
}
node --import tsx scripts/guard-live-references.ts
```

The commands use standard Read-Host and Node; do not change PowerShell execution policy or use ExecutionPolicy Bypass. The Node helper does not run an unsigned PS1 file.

Keep the raw g02Setup/g02SetupText/refs object local. Send only the safe JSON printed by the block and the metadata-only reference probe. They contain no password or private path.

On any error/unknown result: STOP without retry, overwriting, deleting, or resetting anything. Preserve the new directory. Partial files can exist; report only the fixed safe error and whether the safe completion JSON appeared.

## Start the same prototype with these process references

After successful setup, in the SAME terminal with the existing legitimate Auth/GitHub configuration:

```powershell
npm.cmd run guard:dev
```

Use npm.cmd on Windows to invoke the installed Node tool directly. Do not start on an occupied port3000 or kill another process. No .env/Auth store is copied. Use the existing owner session; do not log out.

On /app/projects/github-839286157/guard, click ?Check runtime readiness (read only)? once after the server is ready. Send its safe JSON. Expected: authenticated/provider verified; configuration TARGET_VERIFIED; appDatabase and workerDatabase READONLY_TARGET_ROLE_SCHEMA_RLS_VERIFIED; runtimeOperations0. This reads credentials internally only through the existing purpose-specific runtime loader and opens BEGIN READ ONLY/ROLLBACK for each role; values are never returned.

policyBinding NOT_VERIFIED and sandbox CONFIGURATION_QUALIFICATION_OR_IMAGE_NOT_READY are expected for this deliberate target-only config. Repository policy, fresh sandbox measurement and pinned commit resolution follow direct-role proof, before any separately approved repository scan.

The real controlled-source scanner measurement from19November expires12:32:32 WIB. Do not extend/re-date it. Refresh the same controlled-source qualification near activation; owner repository scanning is still not approved.
