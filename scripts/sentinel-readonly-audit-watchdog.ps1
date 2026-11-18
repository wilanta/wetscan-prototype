param([Parameter(Mandatory=$true)][string]$OutputDir,[Parameter(Mandatory=$true)][string]$RunId,[Parameter(Mandatory=$true)][string]$DeadlineUtc)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'sentinel-readonly-audit-common.ps1')
Assert-ProvisionPrivateDirectory $OutputDir
$deadline=[DateTime]::Parse($DeadlineUtc).ToUniversalTime()
if ($deadline -gt [DateTime]::UtcNow.AddSeconds(120)) { throw 'audit_deadline_invalid' }
$duration=[Math]::Max([double]0,[Math]::Min([double]120000,[double](($deadline-[DateTime]::UtcNow).TotalMilliseconds)))
$clock=[Diagnostics.Stopwatch]::StartNew()
while ([DateTime]::UtcNow -lt $deadline -and $clock.Elapsed.TotalMilliseconds -lt $duration) {
  if (Test-Path -LiteralPath (Join-Path $OutputDir 'audit-controller-cleanup-complete.json')) {
    # A controller receipt never substitutes for independent revocation checks.
    $controllerErrors=@()
    try { $null=Read-ReadOnlyAuditReceipt $OutputDir $RunId 'audit-controller-cleanup-complete.json' }
    catch { $controllerErrors=@('audit_controller_receipt_invalid') }
    $errors=@(Complete-ReadOnlyAuditCleanup $OutputDir $RunId)+$controllerErrors
    $status=if ($errors.Count) { 'NOT_VERIFIED' } else { 'CLEANUP_COMPLETE' }
    Write-ReadOnlyAuditReceipt (Join-Path $OutputDir 'audit-watchdog-cleanup.sanitized.json') @{status=$status;runId=$RunId;outputDirectory=$OutputDir;cleanupErrors=$errors}
    if ($errors.Count) { exit 1 }
    return
  }
  Start-Sleep -Milliseconds 100
}
$errors=@(Complete-ReadOnlyAuditCleanup $OutputDir $RunId)
Write-ReadOnlyAuditReceipt (Join-Path $OutputDir 'audit-deadline-expired.sanitized.json') @{status='NOT_VERIFIED';runId=$RunId;outputDirectory=$OutputDir;reason='audit_deadline';cleanupErrors=$errors}
if ($errors.Count) { exit 1 }
