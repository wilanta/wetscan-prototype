param(
  [string]$RecoveryDir = 'C:\Users\sheil\.wetscan-sentinel\s04-h04c-b2-recovery-b3ecaac2-a04c-417f-83e9-64fcdd3cab41',
  [string]$ContainmentDir = 'C:\Users\sheil\.wetscan-sentinel\s04-h04c-b2-contain-codex-f1862fad0fd1475d86cd39b2badba1cb',
  [string]$CookieFile = 'C:\Users\sheil\.wetscan-sentinel\s01-20261114\secrets\owner-session.cookie',
  [string]$AppPasswordFile = 'C:\Users\sheil\.wetscan-sentinel\s01-20261114\secrets\app.password',
  [string]$MigrationPasswordFile = 'C:\Users\sheil\.wetscan-sentinel\s01-20261114\secrets\migration.password',
  [string]$OutputDir = '',
  [switch]$ExecuteLive,
  [string]$OwnerAuthorization = '',
  [string]$ConfirmScope = '',
  [switch]$ApproveActiveHandoff,
  [switch]$ApproveEmergencyContainment
)
$ErrorActionPreference = 'Stop'
# Retired live entrypoint: stop before reading inputs or creating approvals.
# Its preserved offline diagnostics remain available; live use requires the package.
if ($ExecuteLive) { throw 'legacy_live_entrypoint_retired_USE_REVIEWED_PACKAGE_STOP' }
. (Join-Path $PSScriptRoot 'sentinel-provision-common.ps1')
. (Join-Path $PSScriptRoot 'sentinel-provision-auth.ps1')
$repoRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $repoRoot
$ownerScript = Join-Path $PSScriptRoot 'sentinel-provision-owner.ts'
$inputArgs = @("--pre-recovery=$(Join-Path $RecoveryDir 'pre-recovery-baseline.json')", "--containment=$(Join-Path $ContainmentDir 'containment.json')", "--cookie-file=$CookieFile", "--app-password-file=$AppPasswordFile", "--migration-password-file=$MigrationPasswordFile")

# NO output directory, approval, server or DB operation exists above this gate.
# Discover metadata in every verified historical H04C-B2 private directory,
# including unexpected filenames. This is read-only and cannot close approvals.
$historyText = (& node --import tsx $ownerScript approvals-check | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'historical_approval_precheck_failed' }
$history = $historyText | ConvertFrom-Json
if ($history.status -cne 'CLOSED' -or $history.databaseConnections -ne 0 -or $history.executionPerformed -ne $false) { throw 'historical_approval_precheck_failed' }
$offlineText = (& node --import tsx $ownerScript offline @inputArgs | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'offline_prerequisites_failed' }
$offline = $offlineText | ConvertFrom-Json
if ($offline.status -cne 'OFFLINE_READY' -or $offline.databaseConnections -ne 0 -or $offline.executionPerformed -ne $false) { throw 'offline_prerequisites_failed' }
if (-not $ExecuteLive) { $offline | ConvertTo-Json; return }

if ($OwnerAuthorization -cnotmatch '\A[A-Za-z0-9 _:.\/-]{3,160}\z' -or
    $ConfirmScope -cne 'github-998736528:1source:1rule:1event:1job' -or
    -not $ApproveActiveHandoff -or -not $ApproveEmergencyContainment) { throw 'separate_owner_opt_in_required' }
$output = Assert-ProvisionPrivatePath $OutputDir $repoRoot
foreach ($path in @($RecoveryDir, $ContainmentDir, $CookieFile, $AppPasswordFile, $MigrationPasswordFile)) { $null = Assert-ProvisionPrivatePath $path $repoRoot }
if ((Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) -or
    @(Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'node|tsx' -and $_.CommandLine -match 'worker[\\/](sentinel|guard)|next[\\/]dist[\\/]bin[\\/]next|next-server|sentinel-dev-acceptance|sentinel-provision-owner' }).Count) { throw 'runtime_conflict' }
New-ProvisionPrivateDirectory $output
Write-ProvisionExclusive (Join-Path $output 'owned-processes.jsonl') ''
$deadline = [DateTime]::UtcNow.AddMinutes(10)
$deadlineText = Format-ProvisionUtc $deadline
$deadlineClock = [Diagnostics.Stopwatch]::StartNew()
$watchdog = $null; $watchdogRecord = $null; $normalSucceeded = $false; $contained = $false
$cleanupErrors = New-Object Collections.Generic.List[string]
$appPid = 0
$currentOperation = 'setup'; $failureStage = $null

function Assert-ProvisionDeadline {
  if ([DateTime]::UtcNow -ge $deadline -or $deadlineClock.Elapsed.TotalMilliseconds -ge 600000 -or (Test-Path -LiteralPath (Join-Path $output 'deadline-expired.json'))) { throw 'deadline_expired' }
  if ($watchdog -and $watchdog.HasExited) { throw 'watchdog_unavailable' }
  Assert-ProvisionNoWorkers
}
function Start-ProvisionTracked([string]$File, [string[]]$Arguments, [string]$LogName) {
  Assert-ProvisionDeadline
  foreach ($suffix in @('stdout.log','stderr.log')) { Write-ProvisionExclusive (Join-Path $output "$LogName.$suffix") '' }
  # Windows argument quoting; paths are validated and cannot contain double quotes.
  $quoted = @($Arguments | ForEach-Object { '"' + $_.Replace('"', '\"') + '"' })
  $proc = Start-Process -FilePath $File -ArgumentList $quoted -WorkingDirectory $repoRoot -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $output "$LogName.stdout.log") -RedirectStandardError (Join-Path $output "$LogName.stderr.log")
  $null = $proc.Handle # Retain the native handle before Windows PowerShell loses ExitCode.
  Add-ProvisionProcess $output $proc.Id
  return $proc
}
function Invoke-ProvisionNode([string]$Mode) {
  $script:currentOperation = $Mode
  Assert-ProvisionDeadline
  $arguments = @('--import','tsx',$ownerScript,$Mode) + $inputArgs + @("--artifact-dir=$output",'--origin=http://localhost:3000')
  if ($Mode -ceq 'execute') { $arguments = @('--import','tsx',(Join-Path $PSScriptRoot 'sentinel-dev-acceptance.ts'),'provision-and-ingest') + $inputArgs + @("--artifact-dir=$output",'--origin=http://localhost:3000') }
  $proc = Start-ProvisionTracked 'node' $arguments $Mode
  while (-not $proc.HasExited) { Assert-ProvisionDeadline; Start-Sleep -Milliseconds 150; $proc.Refresh() }
  $exitCode = Get-ProvisionExitCode $proc
  Write-ProvisionReceipt (Join-Path $output "$Mode.process-result.sanitized.json") @{operation=$Mode;exitCode=$exitCode;outputDirectory=$output}
  if ($exitCode -ne 0) { throw 'phase_operation_failed' }
}
function Set-ProvisionControllerEnvironment {
  foreach ($name in @('APP','WORKER','BOOTSTRAP','TEST')) { [Environment]::SetEnvironmentVariable("SENTINEL_DB_${name}_PASSWORD_FILE", $null, 'Process') }
  foreach ($name in @([Environment]::GetEnvironmentVariables('Process').Keys)) {
    if ($name -match '^(AUTH_|GITHUB_)') { [Environment]::SetEnvironmentVariable($name,$null,'Process') }
  }
  $env:SENTINEL_DB_APPROVAL_FILE = Join-Path $output 'controller-runtime-approval.json'
  $env:SENTINEL_DB_MIGRATION_PASSWORD_FILE = $MigrationPasswordFile
  $env:SENTINEL_H04C_B2_EXECUTION = '1'
  $env:SENTINEL_PROVISION_EXECUTION = '1'
  $env:SENTINEL_PROVISION_ACTIVE_HANDOFF = '1'
  $env:SENTINEL_PROVISION_EMERGENCY = '1'
}

try {
  # Independent watchdog remains live even if controller or web parser stalls.
  foreach ($suffix in @('stdout.log','stderr.log')) { Write-ProvisionExclusive (Join-Path $output "watchdog.$suffix") '' }
  $watchdog = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-NonInteractive','-File',('"'+(Join-Path $PSScriptRoot 'sentinel-provision-watchdog.ps1')+'"'),'-OutputDir',('"'+$output+'"'),'-DeadlineUtc',$deadlineText) -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $output 'watchdog.stdout.log') -RedirectStandardError (Join-Path $output 'watchdog.stderr.log')
  $null = $watchdog.Handle
  $watchdogRecord = Get-ProvisionProcessRecord $watchdog.Id
  $approvedAt = Format-ProvisionUtc ([DateTime]::UtcNow)
  foreach ($name in @('web-runtime-approval.json','controller-runtime-approval.json')) {
    $approval = @{schemaVersion=1;status='APPROVED';approvedBy=$OwnerAuthorization;approvedAt=$approvedAt;actions=@('runtime');target=@{host='127.0.0.1';port=55432;database='wetscan_dev';marker='wetscan-s01:26b6b537-c016-4dc7-8007-4e839e8b838f'};migrationPlanSha256='3438a56e778b30afdd6acf03600638fe31e26c55c2ae5bf63d224f909c429ae7';h04cB2=@{phase='provision-ingest';expiresAt=$deadlineText}}
    Write-ProvisionExclusive (Join-Path $output $name) ($approval | ConvertTo-Json -Depth 10)
  }
  $env:SENTINEL_DB_HOST='127.0.0.1'; $env:SENTINEL_DB_PORT='55432'; $env:SENTINEL_DB_NAME='wetscan_dev'; $env:SENTINEL_DB_MARKER='wetscan-s01:26b6b537-c016-4dc7-8007-4e839e8b838f'
  Set-ProvisionControllerEnvironment
  Invoke-ProvisionNode 'audit-start'

  # Next.js loads existing auth dotenv; controller never receives auth secrets.
  foreach ($name in @('MIGRATION','WORKER','BOOTSTRAP','TEST')) { [Environment]::SetEnvironmentVariable("SENTINEL_DB_${name}_PASSWORD_FILE", $null, 'Process') }
  $env:SENTINEL_DB_APP_PASSWORD_FILE=$AppPasswordFile; $env:SENTINEL_DB_APPROVAL_FILE=Join-Path $output 'web-runtime-approval.json'; $env:APP_URL='http://localhost:3000'
  foreach ($name in @('SENTINEL_H04C_B2_EXECUTION','SENTINEL_PROVISION_EXECUTION','SENTINEL_PROVISION_ACTIVE_HANDOFF','SENTINEL_PROVISION_EMERGENCY','SENTINEL_ACCEPTANCE_ISOLATION','SENTINEL_DETECTION_ENABLED','SENTINEL_INCIDENTS_ENABLED')) { [Environment]::SetEnvironmentVariable($name,$null,'Process') }
  $next = Start-ProvisionTracked 'node' @((Join-Path $repoRoot 'node_modules\next\dist\bin\next'),'start','-H','localhost','-p','3000') 'next'
  $appPid = $next.Id
  Set-ProvisionControllerEnvironment
  $currentOperation = 'authenticated-get'
  Invoke-ProvisionAuthenticatedGet -CookieFile $CookieFile -OutputDir $output -Guard { Assert-ProvisionDeadline } -ServerRunning { -not $next.HasExited }
  Invoke-ProvisionNode 'execute'
  Stop-ProvisionOwnedProcesses $output
  $appPid = 0
  Invoke-ProvisionNode 'audit-end'
  $normalSucceeded = $true
} catch {
  $failureStage = $currentOperation
  try { Write-ProvisionReceipt (Join-Path $output 'controller-failure.sanitized.json') (Get-ProvisionControllerFailure $failureStage $_) } catch { $cleanupErrors.Add('failure_diagnostic_NOT_VERIFIED') }
  # Never restart Next.js or retry provisioning. Recovery has a separate journal
  # operation and may target only acknowledged, audited new IDs while time remains.
  if ($appPid -gt 0 -and [DateTime]::UtcNow -lt $deadline -and (Test-Path -LiteralPath (Join-Path $output 'resource-journal.private.jsonl'))) {
    try { Set-ProvisionControllerEnvironment; Invoke-ProvisionNode 'recover'; $contained=$true } catch { $cleanupErrors.Add('emergency_NOT_VERIFIED') }
  }
  try {
    if (Test-Path -LiteralPath (Join-Path $output 'phase-start.private.json')) {
      Invoke-ProvisionFailureFinalAudit -OutputDir $output -StopOwned { Stop-ProvisionOwnedProcesses $output } -Audit { Set-ProvisionControllerEnvironment; Invoke-ProvisionNode 'audit-failure-end' }
    } else { Stop-ProvisionOwnedProcesses $output }
    $appPid=0
  } catch { $cleanupErrors.Add('failure_audit_NOT_VERIFIED') }
} finally {
  # Independent cleanup attempts: a process failure never prevents revocation.
  try { Close-ProvisionApprovals $output } catch { $cleanupErrors.Add('approval_closure_failed') }
  try { Stop-ProvisionOwnedProcesses $output } catch { $cleanupErrors.Add('owned_process_cleanup_failed') }
  try { if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) { throw 'port_still_listening' }; Assert-ProvisionNoWorkers } catch { $cleanupErrors.Add('runtime_cleanup_NOT_VERIFIED') }
  foreach ($name in @([Environment]::GetEnvironmentVariables('Process').Keys)) {
    if ($name -match '^SENTINEL_(DB_|H04C_B2_EXECUTION|PROVISION_)' -or $name -eq 'APP_URL') { [Environment]::SetEnvironmentVariable($name,$null,'Process') }
  }
  try { Assert-ProvisionApprovalsClosed $output } catch { $cleanupErrors.Add('approval_closure_NOT_VERIFIED') }
  try { Write-ProvisionReceipt (Join-Path $output 'controller-cleanup-complete.json') @{outputDirectory=$output;deadlineUtc=$deadlineText;cleanupErrors=@($cleanupErrors)} } catch { $cleanupErrors.Add('cleanup_handshake_failed') }
  $watchdogExitCode=$null
  if ($watchdog -and $watchdogRecord) {
    try {
    $waitMilliseconds=[int][Math]::Max(0,[Math]::Min(5000,600000-$deadlineClock.Elapsed.TotalMilliseconds))
    $watchdog.WaitForExit($waitMilliseconds) | Out-Null
    if (-not $watchdog.HasExited) {
      $cleanupErrors.Add('watchdog_cleanup_timeout')
      $proc=Get-Process -Id $watchdog.Id -ErrorAction SilentlyContinue
      if ($proc -and $proc.StartTime.ToUniversalTime().Ticks.ToString() -ceq $watchdogRecord.startTicks) { Stop-Process -Id $watchdog.Id -Force }
    } else {
      $watchdogExitCode=Get-ProvisionExitCode $watchdog
      Assert-ProvisionWatchdogCleanup $output $deadlineText $watchdogExitCode
    }
    } catch { $cleanupErrors.Add('watchdog_cleanup_NOT_VERIFIED') }
  } else { $cleanupErrors.Add('watchdog_cleanup_NOT_VERIFIED') }
  if ([DateTime]::UtcNow -ge $deadline -or $deadlineClock.ElapsedMilliseconds -ge 600000) { $cleanupErrors.Add('deadline_expired') }
  $finalStatus = if ($cleanupErrors.Count) { 'NOT_VERIFIED' } elseif ($normalSucceeded) { 'PASS' } elseif ($contained) { 'FAIL_CONTAINED' } else { 'NOT_VERIFIED' }
  try {
    Write-ProvisionReceipt (Join-Path $output 'runner-finished.json') @{status=$finalStatus;attempts=1;phase='provision-ingest';s04Status='IMPLEMENTED_PENDING_ACCEPTANCE';cleanupErrors=@($cleanupErrors);failureStage=$failureStage;watchdogExitCode=$watchdogExitCode;outputDirectory=$output;deadlineUtc=$deadlineText;activeHandoff=($normalSucceeded -and $cleanupErrors.Count -eq 0)}
  } catch { $finalStatus='NOT_VERIFIED' }
}
@{status=$finalStatus;phase='provision-ingest';attempts=1;failureStage=$failureStage;outputDirectory=$output;s04Status='IMPLEMENTED_PENDING_ACCEPTANCE'} | ConvertTo-Json
if ($finalStatus -cne 'PASS') { exit 1 }
