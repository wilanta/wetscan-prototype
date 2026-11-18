param(
  [Parameter(Mandatory=$true)][string]$InputManifestFile,
  [Parameter(Mandatory=$true)][string]$InputManifestSha256,
  [switch]$ExecuteLive,
  [string]$OwnerAuthorization='',
  [string]$ConfirmScope=''
)
$ErrorActionPreference='Stop'
$stage='bootstrap_common'; $lastCompleted=$null; $process=$null; $record=$null; $controller=$null; $primary=$null; $cleanup=@(); $exitCode=$null; $status='NOT_VERIFIED'
try {
  $repo=Split-Path $PSScriptRoot -Parent
  $common=Join-Path $PSScriptRoot 'sentinel-provision-common.ps1'
  if((Get-FileHash -LiteralPath $common -Algorithm SHA256).Hash.ToLowerInvariant() -cne '2d3eae6ae28e497fa06dd590f9598873cc1feac0a89f44a3b2d19cff19e9e6d1'){throw 'bootstrap_dependency'}
  . $common
  $lastCompleted=$stage; $stage='private_evidence'
  $controller='C:\Users\sheil\.wetscan-sentinel\s04-audit-procedure-'+[Guid]::NewGuid().ToString('N')
  New-ProvisionPrivateDirectory $controller
  Write-ProvisionExclusive (Join-Path $controller 'owned-processes.jsonl') ''
  $lastCompleted=$stage; $stage='manifest_file'
  if(-not (Test-Path -LiteralPath $InputManifestFile) -or $InputManifestSha256 -cnotmatch '\A[a-f0-9]{64}\z' -or (Get-FileHash -LiteralPath $InputManifestFile -Algorithm SHA256).Hash.ToLowerInvariant() -cne $InputManifestSha256){throw 'bootstrap_manifest'}
  $pins=[IO.File]::ReadAllText($InputManifestFile)|ConvertFrom-Json
  $lastCompleted=$stage; $stage='manifest_inputs'
  foreach($pin in $pins.PSObject.Properties){
    $item=Get-Item -LiteralPath $pin.Name -Force
    if($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or (Get-FileHash -LiteralPath $pin.Name -Algorithm SHA256).Hash.ToLowerInvariant() -cne $pin.Value){throw 'bootstrap_dependency'}
  }
  $lastCompleted=$stage; $stage='bootstrap_dependencies'
  foreach($f in @((Join-Path $PSScriptRoot 'sentinel-provision-common.ps1'),(Join-Path $PSScriptRoot 'sentinel-audit-procedure.mjs'))){if((Get-FileHash -LiteralPath $f -Algorithm SHA256).Hash.ToLowerInvariant() -cne $pins.($f)){throw 'bootstrap_dependency'}}
  $binding=[IO.File]::ReadAllText((Join-Path (Split-Path $InputManifestFile -Parent) 'audit-package-bindings.private.json'))|ConvertFrom-Json
  $node=(Get-Command node.exe -CommandType Application -ErrorAction Stop).Source
  if((Get-FileHash -LiteralPath $node -Algorithm SHA256).Hash.ToLowerInvariant() -cne $binding.runtimeBinaries.($node)){throw 'bootstrap_runtime'}
  $lastCompleted=$stage; $stage='native_coordinator'
  # One deadline includes process startup, journaling, and coordinator preflight.
  $coordinatorClock=[Diagnostics.Stopwatch]::StartNew()
  $coordinatorDeadlineMs=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()+210000
  $values=@('--import','tsx',(Join-Path $PSScriptRoot 'sentinel-audit-procedure.mjs'),('--package-dir='+(Split-Path $InputManifestFile -Parent)),('--manifest-sha256='+$InputManifestSha256),('--evidence-dir='+$controller),('--execute-live='+[int]$ExecuteLive.IsPresent),('--owner='+$OwnerAuthorization),('--scope='+$ConfirmScope),('--outer-deadline-ms='+$coordinatorDeadlineMs))
  foreach($v in $values){if($v -match '["\r\n\x00]'){throw 'bootstrap_arguments'}}
  $psi=New-Object Diagnostics.ProcessStartInfo
  $psi.FileName=$node; $psi.WorkingDirectory=$repo; $psi.UseShellExecute=$false; $psi.CreateNoWindow=$true; $psi.RedirectStandardOutput=$true; $psi.RedirectStandardError=$true
  $psi.Arguments=($values|ForEach-Object{'"'+$_+'"'}) -join ' '
  $process=New-Object Diagnostics.Process; $process.StartInfo=$psi
  if(-not $process.Start()){throw 'native_start'}
  $null=$process.Handle
  $record=Get-ProvisionProcessRecord $process.Id
  [IO.File]::AppendAllText((Join-Path $controller 'owned-processes.jsonl'),(($record|ConvertTo-Json -Compress)+[Environment]::NewLine),[Text.UTF8Encoding]::new($false))
  $stdout=$process.StandardOutput.ReadToEndAsync(); $stderr=$process.StandardError.ReadToEndAsync()
  $coordinatorRemainingMs=[int][Math]::Max(0,210000-$coordinatorClock.ElapsedMilliseconds)
  if(-not $process.WaitForExit($coordinatorRemainingMs)){throw 'native_timeout'}
  $process.WaitForExit(); $exitCode=$process.ExitCode
  if($null -eq $exitCode -or $exitCode -isnot [int]){throw 'native_exit_missing'}
  if($exitCode -ne 0){throw 'native_exit'}
  if($stderr.Result.Length -ne 0 -or $stdout.Result.Length -gt 65536){throw 'native_stream_failed'}
  $summary=$stdout.Result|ConvertFrom-Json
  $result=[IO.File]::ReadAllText((Join-Path $controller 'procedure-result.sanitized.json'))|ConvertFrom-Json
  $expected=if($ExecuteLive){'PASS'}else{'OFFLINE_READY'}
  if($summary.status -cne $expected -or $result.status -cne $expected -or $result.primaryFailure -or @($result.cleanupFailures).Count -ne 0){throw 'native_evidence_failed'}
  $status=$expected
  $lastCompleted=$stage
} catch {
  # Deliberately never serialize ErrorRecord, Message, InvocationInfo or streams.
  $known=@('bootstrap_manifest','bootstrap_dependency','bootstrap_runtime','bootstrap_arguments','native_start','native_timeout','native_exit_missing','native_exit','native_stream_failed','native_evidence_failed')
  $code=if($_.Exception.Message -cin $known){$_.Exception.Message}else{'unclassified_powershell_error'}
  $primary=@{stage=$stage;code=$code;nativeExitCode=$exitCode}
  $status='NOT_VERIFIED'
} finally {
  if($controller){
    if($ExecuteLive -and (Test-Path -LiteralPath (Join-Path $controller 'admission.sanitized.json'))){
      try {
        $admission=[IO.File]::ReadAllText((Join-Path $controller 'admission.sanitized.json'))|ConvertFrom-Json
        $auditOutput=$admission.auditOutputDirectory
        if($auditOutput -cnotmatch '\AC:\\Users\\sheil\\\.wetscan-sentinel\\s04-readonly-audit-[a-f0-9]{32}\z'){throw 'cleanup_scope'}
        $approvalFile=Join-Path $auditOutput 'dev-readonly-audit-approval.json'
        if(Test-Path -LiteralPath $approvalFile){
          Assert-ProvisionPrivateDirectory $auditOutput; Assert-ProvisionPrivateFile $approvalFile
          $a=[IO.File]::ReadAllText($approvalFile)|ConvertFrom-Json
          if($a.kind -cne 'wetscan-s04-dev-preservation-audit' -or $a.phase -cne 'preservation-audit' -or $a.outputDirectory -cne $auditOutput -or $a.runId -cnotmatch '\A[a-f0-9]{32}\z'){throw 'cleanup_scope'}
          $auditCommon=Join-Path $PSScriptRoot 'sentinel-readonly-audit-common.ps1'
          if((Get-FileHash -LiteralPath $auditCommon -Algorithm SHA256).Hash.ToLowerInvariant() -cne $pins.($auditCommon)){throw 'cleanup_dependency'}
          . $auditCommon
          $closureErrors=@(Complete-ReadOnlyAuditCleanup $auditOutput $a.runId)
          if($closureErrors.Count){throw 'cleanup_not_verified'}
        }
      }catch{$cleanup+=@('audit_approval_cleanup_failed');$status='NOT_VERIFIED'}
    }
    try { Stop-ProvisionOwnedProcesses $controller } catch {$cleanup+=@('owned_process_cleanup_failed');$status='NOT_VERIFIED'}
    try { Write-ProvisionReceipt (Join-Path $controller 'launcher-result.sanitized.json') @{status=$status;lastCompletedStage=$lastCompleted;firstFailedStage=if($primary){$primary.stage}elseif($cleanup.Count){'cleanup'}else{$null};primaryFailure=$primary;cleanupFailures=$cleanup;nativeExitCode=$exitCode;childDiagnosticReceipt='procedure-result.sanitized.json';overallS04Status='IMPLEMENTED_PENDING_ACCEPTANCE'} } catch {$cleanup+=@('launcher_receipt_failed');$status='NOT_VERIFIED'}
  }
  if($process){$process.Dispose()}
}
@{status=$status;evidenceDirectory=$controller;primaryFailure=$primary;cleanupFailures=$cleanup;nativeExitCode=$exitCode}|ConvertTo-Json -Depth 6
if($status -cne 'PASS' -and $status -cne 'OFFLINE_READY'){exit 1}
exit 0
