# Package creation substitutes only the two literal entrypoint bindings.
param([Parameter(Mandatory=$true)][string]$ManifestSha256,[switch]$ExecuteLive,[string]$OwnerAuthorization='')
$ErrorActionPreference='Stop'
$entryExit=$null
try {
  $entry='__S04_ENTRY_PATH__'
  if((Get-FileHash -LiteralPath $entry -Algorithm SHA256).Hash.ToLowerInvariant() -cne '__S04_ENTRY_SHA256__'){throw 'owner_entry_pin'}
  $childText=(& $entry -InputManifestFile (Join-Path $PSScriptRoot 'reviewed-audit-input-pins.private.json') -InputManifestSha256 $ManifestSha256 -ExecuteLive:$ExecuteLive -OwnerAuthorization $OwnerAuthorization -ConfirmScope 'wetscan_dev:preservation-audit:read-only:1attempt' | Out-String)
  # An exit in a nested .ps1 sets LASTEXITCODE but does not set this -File host's exit.
  $entryExit=$LASTEXITCODE
  if($null -eq $entryExit -or $entryExit -isnot [int] -or $entryExit -ne 0){throw 'owner_entry_failed'}
  $reply=$childText|ConvertFrom-Json
  $expected=if($ExecuteLive){'PASS'}else{'OFFLINE_READY'}
  if($reply.status -cne $expected -or $reply.primaryFailure -or @($reply.cleanupFailures).Count -ne 0){throw 'owner_entry_evidence_failed'}
  Write-Output $childText
  exit 0
} catch {
  # Never serialize raw ErrorRecords, streams, messages or invocation details.
  @{status='NOT_VERIFIED';firstFailedStage='owner_entry';failureCode='owner_entry_or_bootstrap_failed';childExitCode=$entryExit;overallS04Status='IMPLEMENTED_PENDING_ACCEPTANCE'}|ConvertTo-Json
  exit 1
}
