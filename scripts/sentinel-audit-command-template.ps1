# REVIEW ONLY. Requires a fresh owner grant before this live-only command.
$ErrorActionPreference='Stop'
$s04NativeExit=$null
try {
  $s04Package='__S04_PACKAGE_PATH__'
  $s04Procedure=Join-Path $s04Package 'reviewed-owner-procedure.ps1'
  $s04Manifest=Join-Path $s04Package 'reviewed-audit-input-pins.private.json'
  if((Get-FileHash -LiteralPath $s04Procedure -Algorithm SHA256).Hash.ToLowerInvariant() -cne '__S04_PROCEDURE_SHA256__'){throw 'owner_procedure_hash_STOP'}
  if((Get-FileHash -LiteralPath $s04Manifest -Algorithm SHA256).Hash.ToLowerInvariant() -cne '__S04_MANIFEST_SHA256__'){throw 'owner_manifest_hash_STOP'}
  $s04ReplyText=(& 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -NoProfile -NonInteractive -File $s04Procedure -ManifestSha256 '__S04_MANIFEST_SHA256__' -ExecuteLive -OwnerAuthorization 'Owner authorized one S04 DEV read-only audit after container and exit-code repair' | Out-String)
  $s04NativeExit=$LASTEXITCODE
  if($null -eq $s04NativeExit -or $s04NativeExit -isnot [int] -or $s04NativeExit -ne 0){throw 'owner_process_exit_STOP'}
  $s04Reply=$s04ReplyText|ConvertFrom-Json
  if($s04Reply.status -cne 'PASS' -or $s04Reply.primaryFailure -or @($s04Reply.cleanupFailures).Count -ne 0){throw 'owner_process_evidence_STOP'}
  Write-Output $s04ReplyText
  exit 0
} catch {
  @{status='NOT_VERIFIED';firstFailedStage='outer_owner_command';failureCode='owner_process_or_evidence_failed';childExitCode=$s04NativeExit;retry=$false}|ConvertTo-Json
  exit 1
}
