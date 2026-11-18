param([Parameter(Mandatory=$true)][string]$OutputDir, [Parameter(Mandatory=$true)][string]$DeadlineUtc)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'sentinel-provision-common.ps1')
Assert-ProvisionPrivateDirectory $OutputDir
$deadline = [DateTime]::Parse($DeadlineUtc).ToUniversalTime()
if ($deadline -gt [DateTime]::UtcNow.AddMinutes(10)) { throw 'deadline_invalid' }
$remainingMs = [Math]::Max([double]0, [Math]::Min([double]600000, [double](($deadline - [DateTime]::UtcNow).TotalMilliseconds)))
$deadlineClock = [Diagnostics.Stopwatch]::StartNew()
while ([DateTime]::UtcNow -lt $deadline -and $deadlineClock.Elapsed.TotalMilliseconds -lt $remainingMs) {
  if (Test-Path -LiteralPath (Join-Path $OutputDir 'controller-cleanup-complete.json')) {
    $errors=@(Complete-ProvisionCleanup $OutputDir)
    try {
      $r=[IO.File]::ReadAllText((Join-Path $OutputDir 'controller-cleanup-complete.json')) | ConvertFrom-Json
      if ($r.outputDirectory -cne $OutputDir -or $r.deadlineUtc -cne $DeadlineUtc) { throw 'handshake_binding' }
    } catch { $errors+=@('cleanup_handshake_invalid') }
    $status=if ($errors.Count) { 'NOT_VERIFIED' } else { 'CLEANUP_COMPLETE' }
    Write-ProvisionReceipt (Join-Path $OutputDir 'watchdog-cleanup.sanitized.json') @{status=$status;outputDirectory=$OutputDir;deadlineUtc=$DeadlineUtc;cleanupErrors=$errors}
    if ($errors.Count) { exit 1 }
    return
  }
  Start-Sleep -Milliseconds 200
}
# Independent of the controller and Next.js parser. Both actions are attempted.
$errors=@(Complete-ProvisionCleanup $OutputDir)
$failed = $errors.Count -ne 0
try { Write-ProvisionReceipt (Join-Path $OutputDir 'deadline-expired.json') @{status='NOT_VERIFIED';reason='deadline_expired';outputDirectory=$OutputDir;deadlineUtc=$DeadlineUtc;cleanupFailed=$failed;cleanupErrors=$errors} } catch { $failed=$true }
if ($failed) { exit 1 }
