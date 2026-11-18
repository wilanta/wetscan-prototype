param(
  [string]$MigrationPasswordFile='C:\Users\sheil\.wetscan-sentinel\s01-20261114\secrets\migration.password',
  [string]$InputManifestFile='', [string]$InputManifestSha256='',
  [string]$OutputDir='', [switch]$ExecuteLive, [string]$OwnerAuthorization='', [string]$ConfirmScope='',
  [long]$OuterDeadlineUnixMs=0
)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'sentinel-readonly-audit-common.ps1')
$repoRoot=Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $repoRoot
$scriptPath=Join-Path $PSScriptRoot 'sentinel-readonly-audit.ts'
$inputArgs=@("--migration-password-file=$MigrationPasswordFile","--input-manifest=$InputManifestFile","--input-manifest-sha256=$InputManifestSha256")
$offlineText=(& node --import tsx $scriptPath offline @inputArgs | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'audit_offline_preflight_failed' }
$offline=$offlineText | ConvertFrom-Json
if ($offline.status -cne 'OFFLINE_READY' -or $offline.databaseConnections -ne 0 -or $offline.executionPerformed -ne $false) { throw 'audit_offline_preflight_failed' }
if (-not $ExecuteLive) { $offline | ConvertTo-Json; return }
if ($OwnerAuthorization -cnotmatch '\A[A-Za-z0-9 _:.\/-]{3,160}\z' -or $ConfirmScope -cne 'wetscan_dev:preservation-audit:read-only:1attempt') { throw 'audit_separate_owner_authorization_required' }
# Check after this runner's offline validation, before output/approval creation.
# This is the coordinator's existing deadline, never a fresh outer deadline.
$outerRemainingMs=$OuterDeadlineUnixMs-[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
if ($OuterDeadlineUnixMs -le 0 -or $outerRemainingMs -lt 140000 -or $outerRemainingMs -gt 210000) { throw 'audit_outer_deadline_reserve' }
$output=Assert-ProvisionPrivatePath $OutputDir $repoRoot
if (-not $output.StartsWith('C:\Users\sheil\.wetscan-sentinel\',[StringComparison]::Ordinal)) { throw 'audit_output_boundary' }
$null=Assert-ProvisionPrivatePath $MigrationPasswordFile $repoRoot
Assert-ProvisionPrivateFile $MigrationPasswordFile
New-ProvisionPrivateDirectory $output
Write-ProvisionExclusive (Join-Path $output 'owned-processes.jsonl') ''
$runId=[Guid]::NewGuid().ToString('N')
$approved=[DateTime]::UtcNow; $deadline=$approved.AddSeconds(120); $deadlineText=Format-ProvisionUtc $deadline
if (([DateTimeOffset]$deadline).ToUnixTimeMilliseconds()+20000 -gt $OuterDeadlineUnixMs) { throw 'audit_outer_deadline_reserve' }
$clock=[Diagnostics.Stopwatch]::StartNew()
$watchdog=$null; $watchdogRecord=$null
$auditExitCode=$null; $watchdogExitCode=$null; $stage='watchdog_start'; $failedStage=$null
$savedEnvironment=@{}
$cleanupErrors=New-Object Collections.Generic.List[string]
try {
  foreach ($name in @([Environment]::GetEnvironmentVariables('Process').Keys)) {
    if ($name -match '^(SENTINEL_|AUTH_|GITHUB_|PG)') { $savedEnvironment[$name]=[Environment]::GetEnvironmentVariable($name,'Process'); [Environment]::SetEnvironmentVariable($name,$null,'Process') }
  }
  foreach ($suffix in @('stdout.log','stderr.log')) { Write-ProvisionExclusive (Join-Path $output "watchdog.$suffix") '' }
  $watchdog=Start-ReadOnlyAuditProcess @{FilePath='powershell.exe';ArgumentList=@('-NoProfile','-NonInteractive','-File',('"'+(Join-Path $PSScriptRoot 'sentinel-readonly-audit-watchdog.ps1')+'"'),'-OutputDir',('"'+$output+'"'),'-RunId',$runId,'-DeadlineUtc',$deadlineText);RedirectStandardOutput=(Join-Path $output 'watchdog.stdout.log');RedirectStandardError=(Join-Path $output 'watchdog.stderr.log')}
  $watchdogRecord=Get-ProvisionProcessRecord $watchdog.Id
  $stage='approval_creation'
  $authorization=@{schemaVersion=1;kind='wetscan-s04-dev-preservation-audit';phase='preservation-audit';status='APPROVED';approvedBy=$OwnerAuthorization;approvedAt=(Format-ProvisionUtc $approved);expiresAt=$deadlineText;actions=@('read_only_audit');target=@{host='127.0.0.1';port=55432;database='wetscan_dev';marker='wetscan-s01:26b6b537-c016-4dc7-8007-4e839e8b838f'};migrationPlanSha256='3438a56e778b30afdd6acf03600638fe31e26c55c2ae5bf63d224f909c429ae7';inputManifestSha256=$InputManifestSha256;runId=$runId;outputDirectory=$output}
  Write-ProvisionExclusive (Join-Path $output 'dev-readonly-audit-approval.json') ($authorization | ConvertTo-Json -Depth 6)
  $env:SENTINEL_READONLY_AUDIT_EXECUTION='1'
  foreach ($suffix in @('stdout.log','stderr.log')) { Write-ProvisionExclusive (Join-Path $output "audit.$suffix") '' }
  $arguments=(@('--import','tsx',$scriptPath,'audit')+$inputArgs+@("--artifact-dir=$output","--run-id=$runId")) | ForEach-Object { '"'+$_+'"' }
  if ($watchdog.HasExited -or [DateTime]::UtcNow -ge $deadline) { throw 'audit_watchdog_unavailable' }
  $stage='audit_child'
  $auditProcess=Start-ReadOnlyAuditProcess @{FilePath='node';ArgumentList=$arguments;WorkingDirectory=$repoRoot;RedirectStandardOutput=(Join-Path $output 'audit.stdout.log');RedirectStandardError=(Join-Path $output 'audit.stderr.log')}
  Add-ProvisionProcess $output $auditProcess.Id
  while (-not $auditProcess.HasExited) {
    if ([DateTime]::UtcNow -ge $deadline -or $clock.Elapsed.TotalMilliseconds -ge 120000 -or $watchdog.HasExited -or (Test-Path -LiteralPath (Join-Path $output 'audit-deadline-expired.sanitized.json'))) { throw 'audit_deadline_or_watchdog_failed' }
    Start-Sleep -Milliseconds 100; $auditProcess.Refresh()
  }
  $auditExitCode=Get-ReadOnlyAuditExitCode $auditProcess
  if ($auditExitCode -ne 0) { throw 'audit_NOT_VERIFIED' }
  $stage='audit_result'
  $result=Read-ReadOnlyAuditReceipt $output $runId 'audit-result.sanitized.json'
  if ($result.status -cne 'PASS' -or $result.databaseMutations -ne 0 -or $result.provisioningExecuted -ne $false) { throw 'audit_result_invalid' }
} catch {
  $failedStage=$stage
  $cleanupErrors.Add('audit_NOT_VERIFIED')
} finally {
  foreach ($failure in @(Complete-ReadOnlyAuditCleanup $output $runId)) { $cleanupErrors.Add($failure) }
  $env:SENTINEL_READONLY_AUDIT_EXECUTION=$null
  foreach ($name in $savedEnvironment.Keys) { [Environment]::SetEnvironmentVariable($name,$savedEnvironment[$name],'Process') }
  try { Write-ReadOnlyAuditReceipt (Join-Path $output 'audit-controller-cleanup-complete.json') @{runId=$runId;outputDirectory=$output;cleanupErrors=@($cleanupErrors)} } catch { $cleanupErrors.Add('audit_cleanup_handshake_failed') }
  if ($watchdog -and $watchdogRecord) {
    try {
      $waitMilliseconds=[int][Math]::Max(0,[Math]::Min(5000,120000-$clock.Elapsed.TotalMilliseconds))
      $watchdog.WaitForExit($waitMilliseconds) | Out-Null
      if (-not $watchdog.HasExited) {
        $cleanupErrors.Add('audit_watchdog_cleanup_timeout')
        $liveWatchdog=Get-Process -Id $watchdog.Id -ErrorAction SilentlyContinue
        if ($liveWatchdog -and $liveWatchdog.StartTime.ToUniversalTime().Ticks.ToString() -ceq $watchdogRecord.startTicks) { Stop-Process -Id $watchdog.Id -Force }
      } elseif (($watchdogExitCode=Get-ReadOnlyAuditExitCode $watchdog) -ne 0 -or (Test-Path -LiteralPath (Join-Path $output 'audit-deadline-expired.sanitized.json'))) { $cleanupErrors.Add('audit_watchdog_cleanup_failed') }
      else {
        $watchdogCleanup=Read-ReadOnlyAuditReceipt $output $runId 'audit-watchdog-cleanup.sanitized.json'
        if ($watchdogCleanup.status -cne 'CLEANUP_COMPLETE' -or $watchdogCleanup.cleanupErrors.Count -ne 0) { $cleanupErrors.Add('audit_watchdog_cleanup_failed') }
      }
    } catch { $cleanupErrors.Add('audit_watchdog_cleanup_NOT_VERIFIED') }
  }
  if ([DateTime]::UtcNow -ge $deadline -or $clock.ElapsedMilliseconds -ge 120000) { $cleanupErrors.Add('audit_deadline') }
  $final=Get-ReadOnlyAuditFinalResult $output $runId $auditExitCode $watchdogExitCode @($cleanupErrors)
  if ([DateTime]::UtcNow -ge $deadline -or $clock.ElapsedMilliseconds -ge 120000) { $final.status='NOT_VERIFIED'; $final.cleanupErrors=@($final.cleanupErrors)+@('audit_deadline') }
  $final.failedStage=$failedStage
  $status=$final.status
  try { Write-ReadOnlyAuditReceipt (Join-Path $output 'audit-runner-finished.json') $final } catch { $status='NOT_VERIFIED' }
}
@{status=$status;phase='preservation-audit';outputDirectory=$output;attempts=1;auditExitCode=$auditExitCode;watchdogExitCode=$watchdogExitCode;cleanupErrors=$final.cleanupErrors;s04Status='IMPLEMENTED_PENDING_ACCEPTANCE'} | ConvertTo-Json -Depth 4
if ($status -cne 'PASS') { exit 1 }
