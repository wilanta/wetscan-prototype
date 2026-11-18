# Functions only. No credential read or request occurs when this file is loaded.
function Invoke-ProvisionAuthenticatedGet(
  [string]$CookieFile, [string]$OutputDir,
  [scriptblock]$Guard, [scriptblock]$ServerRunning,
  [scriptblock]$Request = { param($uri,$cookie) & (Join-Path $PSScriptRoot 'sentinel-session-get.ps1') -Uri $uri -CookieHeader $cookie -WithDiagnostic }
) {
  $uri = 'http://localhost:3000/api/sentinel/projects/github-998736528/rules?ruleId=7ad1deb8-e555-44ec-be98-b7def574781d'
  $clock=[Diagnostics.Stopwatch]::StartNew(); $observations=New-Object Collections.Generic.List[object]
  $cookie=$null; $diagnostic=@{status='NOT_VERIFIED';stage='credential_read';category='request_not_started';httpStatus=$null;transportStatus=$null}
  try {
    $cookie=[IO.File]::ReadAllText($CookieFile).Trim()
    $live=$null
    while ($clock.Elapsed.TotalSeconds -lt 30) {
      & $Guard
      if (-not (& $ServerRunning)) { $diagnostic=@{status='NOT_VERIFIED';stage='readiness';category='temporary_server_exited';httpStatus=$null;transportStatus=$null}; throw 'temporary_server_exited' }
      try {
        $response=& $Request $uri $cookie
        $diagnostic=$response.diagnostic; $observations.Add($diagnostic); $live=$response.data
        break
      } catch {
        if ($_.Exception.Data.Contains('S04SessionDiagnostic')) { $diagnostic=$_.Exception.Data['S04SessionDiagnostic'] }
        else { $diagnostic=@{status='NOT_VERIFIED';stage='request';category='request_failed';httpStatus=$null;transportStatus=$null} }
        $observations.Add($diagnostic)
        # Only a pre-response connection establishment failure may be polled.
        if ($diagnostic.category -cne 'connection_refused' -or $null -ne $diagnostic.httpStatus) { throw }
        Start-Sleep -Milliseconds 200
      }
    }
    if (-not $live) { $diagnostic=@{status='NOT_VERIFIED';stage='readiness';category='readiness_timeout';httpStatus=$null;transportStatus=$null}; throw 'authenticated_readiness_timeout' }
    $diagnostic=@{status='NOT_VERIFIED';stage='scope_validation';category='response_scope_failed';httpStatus=200;transportStatus=$null}
    if ($live.rule.ruleId -cne '7ad1deb8-e555-44ec-be98-b7def574781d' -or $live.rule.workspaceId -cne 'github-user-187839747:test' -or $live.rule.projectId -cne 'github-998736528' -or $live.rule.mode -cne 'live' -or $live.rule.status -cne 'DISABLED' -or $live.rule.revision -ne 3 -or $live.rule.version -ne 3) { throw 'authenticated_scope_failed' }
    $diagnostic=@{status='PASS';stage='complete';category='success';httpStatus=200;transportStatus=$null}
  } finally {
    $cookie=$null
    Write-ProvisionReceipt (Join-Path $OutputDir 'authenticated-get.sanitized.json') @{diagnostic=$diagnostic;observations=$observations.ToArray();attempts=$observations.Count;elapsedMilliseconds=$clock.ElapsedMilliseconds}
  }
}

function Get-ProvisionControllerFailure([string]$Stage, $Failure) {
  $known=@('deadline_expired','watchdog_unavailable','worker_activity','temporary_server_exited','authenticated_readiness_timeout','authenticated_scope_failed','phase_operation_failed','owned_process_survived','process_identity_unverified','failure_end_not_verified')
  $code=if ($Failure.Exception.Message -cin $known) { $Failure.Exception.Message } else { 'controller_operation_failed' }
  # Never persist arbitrary exception messages, target invocation text or stack.
  return @{status='NOT_VERIFIED';stage=$Stage;category=$code}
}

function Invoke-ProvisionFailureFinalAudit([string]$OutputDir, [scriptblock]$StopOwned, [scriptblock]$Audit) {
  $stopFailure=$null; $auditFailure=$null
  try { & $StopOwned } catch { $stopFailure=Get-ProvisionControllerFailure 'failure_server_stop' $_ }
  try { & $Audit } catch { $auditFailure=Get-ProvisionControllerFailure 'audit-failure-end' $_ }
  $status=if ($stopFailure -or $auditFailure) { 'NOT_VERIFIED' } else { 'PASS' }
  Write-ProvisionReceipt (Join-Path $OutputDir 'failure-end.lifecycle.sanitized.json') @{status=$status;serverStopFailure=$stopFailure;auditFailure=$auditFailure;auditCompleted=($null -eq $auditFailure)}
  if ($status -cne 'PASS') { throw 'failure_end_not_verified' }
}
