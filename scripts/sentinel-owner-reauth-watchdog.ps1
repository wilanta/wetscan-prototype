param([Parameter(Mandatory=$true)][string]$OutputDir,[Parameter(Mandatory=$true)][string]$DeadlineUtc)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'sentinel-provision-common.ps1')
$status='NOT_VERIFIED';$expired=$false
try {
 $null=Assert-ProvisionPrivatePath $OutputDir (Split-Path $PSScriptRoot -Parent)
 if($OutputDir -cnotmatch '^C:\\Users\\sheil\\\.wetscan-sentinel\\s04-owner-reauth-[a-f0-9]{32}$'){throw 'watchdog_output_scope'}
 Assert-ProvisionPrivateDirectory $OutputDir
 $deadline=[DateTime]::Parse($DeadlineUtc).ToUniversalTime()
 if($deadline -le [DateTime]::UtcNow -or $deadline -gt [DateTime]::UtcNow.AddMinutes(15)){throw 'watchdog_deadline'}
 while(-not (Test-Path -LiteralPath (Join-Path $OutputDir 'server-stopped.sanitized.json'))){
  if([DateTime]::UtcNow -ge $deadline){$expired=$true;break}
  Start-Sleep -Milliseconds 200
 }
 if($expired){Write-ProvisionReceipt (Join-Path $OutputDir 'deadline-expired.sanitized.json') @{status='NOT_VERIFIED';classification='oauth_window_timeout'}}
 Stop-ProvisionOwnedProcesses $OutputDir
 $status='CLEANUP_COMPLETE'
} catch { $status='NOT_VERIFIED' }
try {Write-ProvisionReceipt (Join-Path $OutputDir 'watchdog-finished.sanitized.json') @{status=$status;expired=$expired;deadlineUtc=$DeadlineUtc}} catch {exit 1}
if($status -cne 'CLEANUP_COMPLETE' -or $expired){exit 1}
exit 0
