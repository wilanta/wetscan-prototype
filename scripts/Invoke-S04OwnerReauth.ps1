# Default OFFLINE. Future live auth only; no provisioning/database approval path.
param([Parameter(Mandatory=$true)][string]$ManifestFile,[Parameter(Mandatory=$true)][string]$ManifestSha256,
 [switch]$ExecuteOwnerLogin,[string]$OwnerAuthorization='')
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$repo=Split-Path $PSScriptRoot -Parent
$grant='OWNER APPROVED ONE S04 AUTH ONLY WINDOW NO REFRESH NO PROVISIONING'
$run=$null;$app=$null;$watchdog=$null;$primary=$null;$cleanupErrors=New-Object Collections.Generic.List[string]
$stage='manifest';$lastCompleted='none';$appStopped=$false;$verified=$false
$checkerCode=$null;$checkerClassification=$null
function Assert-NoAuthRuntime {
 if((Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) -or
 @(Get-CimInstance Win32_Process | Where-Object {$_.Name -match '^(node|tsx)(\.exe)?$' -and $_.CommandLine -match 'worker[\\/](sentinel|guard)|next[\\/]dist[\\/]|next-server|sentinel-owner-reauth-app|sentinel-provision-owner'}).Count){throw 'auth_runtime_conflict'}
}
function Invoke-OfflineCheck([string]$Mode) {
 $arguments=@('--import','tsx',(Join-Path $PSScriptRoot 'sentinel-owner-reauth.ts'),$Mode,"--manifest=$ManifestFile","--sha256=$ManifestSha256")
 if($Mode -ne 'preflight'){$arguments+=@("--run=$run","--grant=$grant")}
 $text=(& node @arguments | Out-String);$code=$LASTEXITCODE
 $script:checkerCode=$code
 $result=$null;try{$result=$text|ConvertFrom-Json}catch{throw 'checker_output_invalid'}
 if($result.PSObject.Properties['classification']){$script:checkerClassification=$result.classification}
 if($run){Write-ProvisionReceipt (Join-Path $run ($Mode+'.sanitized.json')) $result}
 if($code -ne 0 -or -not $result -or $result.status -ceq 'NOT_VERIFIED'){throw 'offline_checker_failed'}
 if($Mode -eq 'preflight' -and $result.status -cne 'OFFLINE_READY'){throw 'preflight_result_invalid'}
 if($Mode -eq 'verify' -and $result.status -cne 'PASS_LOCAL_SESSION_WITH_APPROVED_ARCHIVE_DISPOSITION'){throw 'verify_result_invalid'}
 return $result
}
try {
 if($PSVersionTable.PSVersion.Major -ne 5){throw 'windows_powershell_5_1_required'}
 Set-Location -LiteralPath $repo
 if($ManifestSha256 -cnotmatch '^[a-f0-9]{64}$' -or (Get-FileHash -LiteralPath $ManifestFile -Algorithm SHA256).Hash.ToLowerInvariant() -cne $ManifestSha256){throw 'manifest_hash_changed'}
 # Verify trust-sensitive helpers before dot-sourcing them or invoking the checker.
 $m=[IO.File]::ReadAllText($ManifestFile)|ConvertFrom-Json
 foreach($name in @('Invoke-S04OwnerReauth.ps1','sentinel-owner-reauth.ts','sentinel-owner-reauth-app.mjs','sentinel-owner-reauth-watchdog.ps1','sentinel-provision-common.ps1','sentinel-provision-private.ps1')){
  $p=Join-Path $PSScriptRoot $name;$pin=$m.files.PSObject.Properties[$p]
  if(-not $pin -or (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant() -cne $pin.Value){throw 'bootstrap_binding_changed'}
 }
 # Verify all executable loader dependencies before invoking the checker. The
 # checker then verifies the COMPLETE manifest with native filesystem hashing.
 if(-not $m.PSObject.Properties['bootstrapFiles']){throw 'bootstrap_set_missing'}
 foreach($pin in $m.bootstrapFiles.PSObject.Properties){if($m.files.PSObject.Properties[$pin.Name].Value -cne $pin.Value -or (Get-FileHash -LiteralPath $pin.Name -Algorithm SHA256).Hash.ToLowerInvariant() -cne $pin.Value){throw 'reviewed_bootstrap_changed'}}
 . (Join-Path $PSScriptRoot 'sentinel-provision-common.ps1')
 $null=Assert-ProvisionPrivatePath $ManifestFile $repo;Assert-ProvisionPrivateFile $ManifestFile
 foreach($key in @([Environment]::GetEnvironmentVariables('Process').Keys)){
  if($key -match '^(AUTH_|GITHUB_|SENTINEL_|PG|DATABASE_|DB_|POSTGRES_)|^(APP_URL|DIRECT_URL|NODE_OPTIONS|WETSCAN_OWNER_AUTH_GRANT)$'){throw 'ambient_configuration_forbidden'}
 }
 $stage='offline_preflight';$null=Invoke-OfflineCheck 'preflight';$lastCompleted=$stage
 if(-not $ExecuteOwnerLogin){Write-Output 'OFFLINE_READY; OAuth=NOT_RUN; databaseConnections=0; authenticationWrites=0';exit 0}
 if($OwnerAuthorization -cne $grant){throw 'fresh_owner_authorization_required'}
 $stage='runtime_isolation';Assert-NoAuthRuntime
 Write-Host 'Close existing WetScan tabs/private windows WITHOUT signing out. No old-session background requests may remain.'
 if((Read-Host 'Type AUTH_TABS_CLOSED') -cne 'AUTH_TABS_CLOSED'){throw 'owner_isolation_not_confirmed'}
 $lastCompleted=$stage
 $run=Join-Path 'C:\Users\sheil\.wetscan-sentinel' ('s04-owner-reauth-'+[Guid]::NewGuid().ToString('N'))
 New-ProvisionPrivateDirectory $run
 foreach($dir in @('archive','archive\auth-store','candidate')){New-ProvisionPrivateDirectory (Join-Path $run $dir)}
 Write-ProvisionExclusive (Join-Path $run 'owned-processes.jsonl') ''
 $stage='backup_snapshot';$null=Invoke-OfflineCheck 'snapshot';$lastCompleted=$stage
 $deadline=Format-ProvisionUtc ([DateTime]::UtcNow.AddMinutes(15))
 $stage='app_startup'
 $watchdog=Start-Process powershell.exe -ArgumentList @('-NoProfile','-NonInteractive','-File',('"'+(Join-Path $PSScriptRoot 'sentinel-owner-reauth-watchdog.ps1')+'"'),'-OutputDir',('"'+$run+'"'),'-DeadlineUtc',$deadline) -WindowStyle Hidden -PassThru
 $null=$watchdog.Handle
 # Only the auth child receives this capability. No acceptance/DB credentials are loaded.
 $oldCapability=[Environment]::GetEnvironmentVariable('WETSCAN_OWNER_AUTH_GRANT','Process')
 $oldTelemetry=[Environment]::GetEnvironmentVariable('NEXT_TELEMETRY_DISABLED','Process')
 try {
  $env:WETSCAN_OWNER_AUTH_GRANT=$grant;$env:NEXT_TELEMETRY_DISABLED='1'
  $app=Start-Process node -ArgumentList @(('"'+(Join-Path $PSScriptRoot 'sentinel-owner-reauth-app.mjs')+'"'),('"'+$run+'"')) -WorkingDirectory $repo -WindowStyle Hidden -PassThru
  $null=$app.Handle;Add-ProvisionProcess $run $app.Id
 } finally {
  [Environment]::SetEnvironmentVariable('WETSCAN_OWNER_AUTH_GRANT',$oldCapability,'Process')
  [Environment]::SetEnvironmentVariable('NEXT_TELEMETRY_DISABLED',$oldTelemetry,'Process')
 }
 $readyClock=[Diagnostics.Stopwatch]::StartNew()
 while(-not (Test-Path -LiteralPath (Join-Path $run 'app-ready.sanitized.json'))){
  if($app.HasExited -or $watchdog.HasExited -or $readyClock.Elapsed.TotalSeconds -gt 60){throw 'auth_app_not_ready'}
  Start-Sleep -Milliseconds 200
 }
 $ready=[IO.File]::ReadAllText((Join-Path $run 'app-ready.sanitized.json'))|ConvertFrom-Json
 $listeners=@(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction Stop)
 if($ready.status -cne 'READY' -or $ready.pid -ne $app.Id -or -not $listeners.Count -or @($listeners|Where-Object{$_.OwningProcess -ne $app.Id}).Count){throw 'listener_identity_mismatch'}
 $lastCompleted=$stage;$stage='owner_oauth'
 Write-Host 'Use a NEW private browser window: http://localhost:3000/login'
 Write-Host 'Click Continue with GitHub once. Use owner 187839747. Do not navigate elsewhere, sign out, or retry.'
 Write-Host 'The callback completion page replaces the full /app shell during this window.'
 if((Read-Host 'Type DONE after the completion page, or ABORT') -cne 'DONE'){throw 'owner_aborted'}
 if($app.HasExited -or $watchdog.HasExited -or [DateTime]::UtcNow -ge [DateTime]::Parse($deadline).ToUniversalTime() -or (Test-Path -LiteralPath (Join-Path $run 'window-failure.sanitized.json'))){throw 'oauth_failed_or_timed_out'}
 $oauth=[IO.File]::ReadAllText((Join-Path $run 'oauth-window.sanitized.json'))|ConvertFrom-Json
 if($oauth.status -cne 'CALLBACK_COMPLETE'){throw 'oauth_callback_unverified'}
 $lastCompleted=$stage;$stage='app_cleanup'
 Stop-ProvisionOwnedProcesses $run
 if(-not $app.HasExited){throw 'owned_app_survived'}
 Write-ProvisionReceipt (Join-Path $run 'server-stopped.sanitized.json') @{status='STOPPED';outputDirectory=$run}
 $appStopped=$true
 if(-not $watchdog.WaitForExit(5000) -or (Get-ProvisionExitCode $watchdog) -ne 0){throw 'watchdog_cleanup_failed'}
 $wd=[IO.File]::ReadAllText((Join-Path $run 'watchdog-finished.sanitized.json'))|ConvertFrom-Json
 if($wd.status -cne 'CLEANUP_COMPLETE' -or $wd.expired){throw 'watchdog_receipt_failed'}
 Assert-NoAuthRuntime;$lastCompleted=$stage;$stage='candidate_capture'
 Write-Host 'App stopped. In DevTools > Application/Storage > Cookies > http://localhost:3000, copy ONLY the wetscan_session Value.'
 $secure=Read-Host 'Paste the 64 lowercase hex value (hidden; never paste into chat)' -AsSecureString
 $bstr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
 try {
  $token=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr).Trim()
  if($token -cnotmatch '^[a-f0-9]{64}$'){throw 'candidate_cookie_format'}
  $candidate=Join-Path $run 'candidate\owner-session.cookie'
  Write-ProvisionExclusive $candidate ('wetscan_session='+$token)
  Write-ProvisionExclusive ($candidate+'.meta.json') (@{schemaVersion=1;origin='http://localhost:3000';callbackUrl='http://localhost:3000/api/auth/github/callback';recordedAt=(Format-ProvisionUtc ([DateTime]::UtcNow))}|ConvertTo-Json)
  Assert-ProvisionPrivateFile $candidate;Assert-ProvisionPrivateFile ($candidate+'.meta.json')
 } finally { $token=$null;[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr);$secure.Dispose() }
 $lastCompleted=$stage;$stage='offline_session_validation';$result=Invoke-OfflineCheck 'verify';$verified=$true;$lastCompleted=$stage
 Write-Host ('Validated candidate path: '+$candidate)
 Write-Host ('Recovery token minutes remaining: '+$result.tokenMinutesRemaining+'; provisioning entry lifetime eligible: '+$result.provisioningEntryLifetimeEligible)
 Write-Host 'Close the private window WITHOUT signing out. STOP. Provisioning is not authorized.'
} catch {
 # Fixed classifications only: raw messages may contain OS paths or private arguments.
 $primary=@{stage=$stage;classification='auth_recovery_NOT_VERIFIED';errorType=$_.Exception.GetType().Name;checkerExitCode=$checkerCode;checkerClassification=$checkerClassification}
} finally {
 if($run){
  try {Stop-ProvisionOwnedProcesses $run;if($app -and -not $app.HasExited){Stop-Process -InputObject $app -Force;if(-not $app.WaitForExit(5000)){throw 'app_survived'}}} catch {$cleanupErrors.Add('owned_app_cleanup_failed')}
  if(-not $appStopped -and $cleanupErrors.Count -eq 0){try{Write-ProvisionReceipt (Join-Path $run 'server-stopped.sanitized.json') @{status='STOPPED';outputDirectory=$run}}catch{$cleanupErrors.Add('stopped_receipt_failed')}}
  if($watchdog -and -not $watchdog.HasExited){if(-not $watchdog.WaitForExit(5000)){try{Stop-Process -InputObject $watchdog -Force;if(-not $watchdog.WaitForExit(3000)){throw 'watchdog_survived'}}catch{$cleanupErrors.Add('watchdog_cleanup_failed')}}}
  try {Assert-NoAuthRuntime} catch {$cleanupErrors.Add('runtime_cleanup_unverified')}
  try {Write-ProvisionReceipt (Join-Path $run 'recovery-finished.sanitized.json') @{status=$(if($verified -and -not $primary -and $cleanupErrors.Count -eq 0){'PASS_LOCAL_AUTH_RECOVERY'}else{'NOT_VERIFIED'});lastCompletedStage=$lastCompleted;failure=$primary;cleanupErrors=@($cleanupErrors.ToArray());databaseConnections=0;provisioningExecuted=$false;authenticationStateRollbackAttempted=$false;outputDirectory=$run}} catch {$cleanupErrors.Add('finished_receipt_failed')}
 }
}
if($primary -or $cleanupErrors.Count -or -not $verified){Write-Output ('NOT_VERIFIED; stage='+$stage+'; no retry');exit 1}
exit 0
