# Functions only; no startup or approval creation on import.
. (Join-Path $PSScriptRoot 'sentinel-provision-common.ps1')
# Windows PowerShell Start-Process returns a Process without a retained handle.
# Cache it while the child is alive, or ExitCode can remain null after exit.
function Start-ReadOnlyAuditProcess([hashtable]$Parameters) {
  $process = Start-Process @Parameters -WindowStyle Hidden -PassThru
  $null = $process.Handle
  return $process
}
function Get-ReadOnlyAuditExitCode($Process) {
  if (-not $Process.HasExited) { throw 'audit_process_not_exited' }
  $Process.WaitForExit()
  $code = $Process.ExitCode
  if ($null -eq $code -or $code -isnot [int]) { throw 'audit_process_exit_unverified' }
  return $code
}
function Write-ReadOnlyAuditReceipt([string]$Path, $Value) {
  # Flush and close a private create-only temporary file before publishing it.
  # File.Move is atomic on this volume and refuses an existing destination.
  $temporary = $Path + '.' + [Guid]::NewGuid().ToString('N') + '.tmp'
  Write-ProvisionExclusive $temporary ($Value | ConvertTo-Json -Depth 10)
  [IO.File]::Move($temporary, $Path)
}
function Read-ReadOnlyAuditReceipt([string]$OutputDir, [string]$RunId, [string]$Name) {
  Assert-ProvisionPrivateDirectory $OutputDir
  if ([IO.Path]::GetFileName($Name) -cne $Name) { throw 'audit_receipt_path' }
  $path = Join-Path $OutputDir $Name
  Assert-ProvisionPrivateFile $path
  $value = [IO.File]::ReadAllText($path) | ConvertFrom-Json
  if ($value.runId -cne $RunId -or $value.outputDirectory -cne $OutputDir) { throw 'audit_receipt_binding' }
  return $value
}
function Open-ReadOnlyAuditClosureLock([string]$OutputDir) {
  $clock = [Diagnostics.Stopwatch]::StartNew()
  while ($true) {
    try { return [IO.File]::Open((Join-Path $OutputDir 'audit-closure.lock'), 'OpenOrCreate', 'ReadWrite', 'None') }
    catch [IO.IOException] {
      # Only a sharing violation permits a bounded wait; no write is retried.
      if (($_.Exception.HResult -band 0xffff) -ne 32 -or $clock.ElapsedMilliseconds -ge 1000) { throw }
      Start-Sleep -Milliseconds 25
    }
  }
}
function Assert-ReadOnlyAuditClosure([string]$OutputDir, [string]$RunId) {
  Assert-ProvisionPrivateDirectory $OutputDir
  $lock = Open-ReadOnlyAuditClosureLock $OutputDir
  try {
    $path = Join-Path $OutputDir 'dev-readonly-audit-approval.json'
    Assert-ProvisionPrivateFile $path
    $a = [IO.File]::ReadAllText($path) | ConvertFrom-Json
    if ($a.kind -cne 'wetscan-s04-dev-preservation-audit' -or $a.phase -cne 'preservation-audit' -or
        $a.runId -cne $RunId -or $a.outputDirectory -cne $OutputDir -or
        $a.status -cne 'CLOSED' -or @($a.actions).Count -ne 0 -or -not $a.closedAt) { throw 'audit_closure_state' }
    $receipt = Read-ReadOnlyAuditReceipt $OutputDir $RunId 'authorization-closure.sanitized.json'
    if ($receipt.status -cne 'CLOSED' -or $receipt.actionsCount -ne 0 -or $receipt.closedAt -cne $a.closedAt -or
        $receipt.beforeFile -cnotmatch '\Aauthorization-before-[a-f0-9]{32}\.bin\z') { throw 'audit_closure_receipt' }
    $beforePath = Join-Path $OutputDir $receipt.beforeFile
    Assert-ProvisionPrivateFile $beforePath
    if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -cne $receipt.afterSha256 -or
        (Get-FileHash -LiteralPath $beforePath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $receipt.beforeSha256) { throw 'audit_closure_hash' }
    $before = [IO.File]::ReadAllText($beforePath) | ConvertFrom-Json
    if ($before.status -cne 'APPROVED' -or @($before.actions).Count -ne 1 -or $before.actions[0] -cne 'read_only_audit' -or
        @($a.PSObject.Properties).Count -ne (@($before.PSObject.Properties).Count + 1)) { throw 'audit_closure_metadata' }
    foreach ($property in $before.PSObject.Properties) {
      if ($property.Name -in @('status','actions')) { continue }
      if (($property.Value | ConvertTo-Json -Depth 10 -Compress) -cne ($a.($property.Name) | ConvertTo-Json -Depth 10 -Compress)) { throw 'audit_closure_metadata' }
    }
  } finally { $lock.Dispose() }
}
function Assert-ReadOnlyAuditProcessesStopped([string]$OutputDir) {
  foreach ($line in [IO.File]::ReadAllLines((Join-Path $OutputDir 'owned-processes.jsonl'))) {
    if (-not $line) { continue }
    $record = $line | ConvertFrom-Json
    $process = Get-Process -Id ([int]$record.pid) -ErrorAction SilentlyContinue
    if ($process -and $process.StartTime.ToUniversalTime().Ticks.ToString() -ceq $record.startTicks) { throw 'audit_process_survived' }
  }
}
function Get-ReadOnlyAuditFinalResult([string]$OutputDir, [string]$RunId, $AuditExitCode, $WatchdogExitCode, [string[]]$CleanupErrors) {
  $errors = New-Object Collections.Generic.List[string]
  foreach ($failure in $CleanupErrors) { $errors.Add($failure) }
  if ($null -eq $AuditExitCode -or $AuditExitCode -isnot [int] -or $AuditExitCode -ne 0) { $errors.Add('audit_process_exit_failed') }
  if ($null -eq $WatchdogExitCode -or $WatchdogExitCode -isnot [int] -or $WatchdogExitCode -ne 0) { $errors.Add('audit_watchdog_exit_failed') }
  try {
    $database = Read-ReadOnlyAuditReceipt $OutputDir $RunId 'audit-result.sanitized.json'
    if ($database.status -cne 'PASS' -or $database.phase -cne 'preservation-audit' -or
        $database.database -cne 'wetscan_dev' -or $database.role -cne 'wetscan_migrator' -or
        $database.marker -cne 'wetscan-s01:26b6b537-c016-4dc7-8007-4e839e8b838f' -or
        $database.transactionReadOnly -ne $true -or $database.databaseMutations -ne 0 -or $database.provisioningExecuted -ne $false) { throw 'audit_result_invalid' }
  } catch { $errors.Add('audit_result_NOT_VERIFIED') }
  try { Assert-ReadOnlyAuditClosure $OutputDir $RunId } catch { $errors.Add('audit_approval_closure_NOT_VERIFIED') }
  try {
    $controller = Read-ReadOnlyAuditReceipt $OutputDir $RunId 'audit-controller-cleanup-complete.json'
    $watchdog = Read-ReadOnlyAuditReceipt $OutputDir $RunId 'audit-watchdog-cleanup.sanitized.json'
    if (@($controller.cleanupErrors).Count -ne 0 -or $watchdog.status -cne 'CLEANUP_COMPLETE' -or @($watchdog.cleanupErrors).Count -ne 0) { throw 'audit_cleanup_receipt_invalid' }
  } catch { $errors.Add('audit_cleanup_receipt_NOT_VERIFIED') }
  try { Assert-ReadOnlyAuditProcessesStopped $OutputDir } catch { $errors.Add('audit_process_cleanup_NOT_VERIFIED') }
  if (Test-Path -LiteralPath (Join-Path $OutputDir 'audit-deadline-expired.sanitized.json')) { $errors.Add('audit_deadline') }
  return @{status=$(if ($errors.Count -eq 0) { 'PASS' } else { 'NOT_VERIFIED' });schemaVersion=1;phase='preservation-audit';runId=$RunId;outputDirectory=$OutputDir;attempts=1;auditExitCode=$AuditExitCode;watchdogExitCode=$WatchdogExitCode;cleanupErrors=@($errors | Select-Object -Unique);s04Status='IMPLEMENTED_PENDING_ACCEPTANCE'}
}
function Close-ReadOnlyAuditApproval([string]$OutputDir, [string]$RunId) {
  Assert-ProvisionPrivateDirectory $OutputDir
  $path = Join-Path $OutputDir 'dev-readonly-audit-approval.json'
  if (-not (Test-Path -LiteralPath $path)) { return }
  Assert-ProvisionPrivateFile $path
  $lock = Open-ReadOnlyAuditClosureLock $OutputDir
  try {
    $before = [IO.File]::ReadAllText($path)
    $a = $before | ConvertFrom-Json
    if ($a.kind -cne 'wetscan-s04-dev-preservation-audit' -or $a.phase -cne 'preservation-audit' -or $a.runId -cne $RunId -or $a.outputDirectory -cne $OutputDir) { throw 'audit_closure_binding' }
    if ($a.status -ceq 'CLOSED') {
      if ($a.actions.Count -ne 0 -or -not $a.closedAt) { throw 'audit_closure_state' }
      return
    }
    if ($a.status -cne 'APPROVED' -or $a.actions.Count -ne 1 -or $a.actions[0] -cne 'read_only_audit') { throw 'audit_closure_state' }
    $beforeHash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
    $a.status='CLOSED'; $a.actions=@()
    $a | Add-Member -NotePropertyName closedAt -NotePropertyValue (Format-ProvisionUtc ([DateTime]::UtcNow))
    $temporary = Join-Path $OutputDir ('audit-close-' + [Guid]::NewGuid().ToString('N') + '.tmp')
    $backup = Join-Path $OutputDir ('authorization-before-' + [Guid]::NewGuid().ToString('N') + '.bin')
    Write-ProvisionExclusive $temporary ($a | ConvertTo-Json -Depth 8)
    if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -cne $beforeHash) { throw 'audit_closure_drift' }
    [IO.File]::Replace($temporary,$path,$backup,$false)
    $closed = [IO.File]::ReadAllText($path) | ConvertFrom-Json
    if ($closed.status -cne 'CLOSED' -or $closed.actions.Count -ne 0 -or $closed.closedAt -cne $a.closedAt) { throw 'audit_closure_verification' }
    Write-ReadOnlyAuditReceipt (Join-Path $OutputDir 'authorization-closure.sanitized.json') @{status='CLOSED';runId=$RunId;outputDirectory=$OutputDir;actionsCount=0;beforeFile=[IO.Path]::GetFileName($backup);beforeSha256=$beforeHash;afterSha256=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant();closedAt=$closed.closedAt}
  } finally { $lock.Dispose() }
}
function Complete-ReadOnlyAuditCleanup([string]$OutputDir, [string]$RunId) {
  $errors=New-Object Collections.Generic.List[string]
  try { Close-ReadOnlyAuditApproval $OutputDir $RunId; Assert-ReadOnlyAuditClosure $OutputDir $RunId } catch { $errors.Add('audit_approval_closure_failed') }
  try { Stop-ProvisionOwnedProcesses $OutputDir } catch { $errors.Add('audit_process_cleanup_failed') }
  return $errors.ToArray()
}
