# Functions only. Dot-sourcing performs no filesystem, network, approval or process action.
Set-StrictMode -Version Latest

function Format-ProvisionUtc([DateTime]$Value) {
  return $Value.ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", [Globalization.CultureInfo]::InvariantCulture)
}

function Assert-ProvisionPrivatePath([string]$Path, [string]$RepoRoot) {
  $full = [IO.Path]::GetFullPath($Path)
  $repo = [IO.Path]::GetFullPath($RepoRoot).TrimEnd('\')
  if (-not [IO.Path]::IsPathRooted($Path) -or $full.StartsWith('\\') -or
      $full -ieq $repo -or $full.StartsWith($repo + '\', [StringComparison]::OrdinalIgnoreCase) -or
      $full -match '(?i)[\\/]OneDrive(?: - [^\\/]+)?(?:[\\/]|$)') { throw 'private_path_denied' }
  $cursor = $full
  while ($cursor) {
    if ((Test-Path -LiteralPath $cursor) -and ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'private_reparse_denied' }
    $cursor = [IO.Path]::GetDirectoryName($cursor)
  }
  return $full
}
function Assert-ProvisionPrivateDirectory([string]$Path) {
  $acl = Get-Acl -LiteralPath $Path -ErrorAction Stop
  $current = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  if (-not $acl.AreAccessRulesProtected) { throw 'private_acl_inherited' }
  $currentFull = $false
  foreach ($rule in $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])) {
    if ($rule.AccessControlType -ne 'Allow' -or @($current, 'S-1-5-18') -notcontains $rule.IdentityReference.Value) { throw 'private_acl_principal' }
    if ($rule.IdentityReference.Value -eq $current -and ($rule.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -eq [Security.AccessControl.FileSystemRights]::FullControl) { $currentFull = $true }
  }
  if (-not $currentFull) { throw 'private_acl_access' }
}
function New-ProvisionPrivateDirectory([string]$Path) {
  if (Test-Path -LiteralPath $Path) { throw 'output_already_exists' }
  # ACL supplied on creation: no interval with inherited broad access.
  $acl = New-Object Security.AccessControl.DirectorySecurity
  $acl.SetAccessRuleProtection($true, $false)
  foreach ($sid in @([Security.Principal.WindowsIdentity]::GetCurrent().User, (New-Object Security.Principal.SecurityIdentifier('S-1-5-18')))) {
    $rule = New-Object Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $acl.AddAccessRule($rule)
  }
  $directory = New-Object IO.DirectoryInfo($Path)
  $directory.Create($acl)
  Assert-ProvisionPrivateDirectory $Path
}
function Assert-ProvisionPrivateFile([string]$Path) {
  Assert-ProvisionPrivateDirectory ([IO.Path]::GetDirectoryName($Path))
  $current = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  foreach ($rule in (Get-Acl -LiteralPath $Path).GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) {
    if ($rule.AccessControlType -ne 'Allow' -or @($current,'S-1-5-18') -notcontains $rule.IdentityReference.Value) { throw 'private_file_acl' }
  }
}
function Write-ProvisionExclusive([string]$Path, [string]$Text) {
  Assert-ProvisionPrivateDirectory ([IO.Path]::GetDirectoryName($Path))
  $stream = [IO.File]::Open($Path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::Read)
  try { $bytes = (New-Object Text.UTF8Encoding($false)).GetBytes($Text); $stream.Write($bytes, 0, $bytes.Length); $stream.Flush($true) } finally { $stream.Dispose() }
}
function Close-ProvisionApprovals([string]$OutputDir) {
  Assert-ProvisionPrivateDirectory $OutputDir
  $clock = [Diagnostics.Stopwatch]::StartNew()
  $lock = $null
  while (-not $lock) {
    try { $lock = [IO.File]::Open((Join-Path $OutputDir 'provision-closure.lock'),'OpenOrCreate','ReadWrite','None') }
    catch [IO.IOException] {
      if (($_.Exception.HResult -band 0xffff) -ne 32 -or $clock.ElapsedMilliseconds -ge 1000) { throw }
      Start-Sleep -Milliseconds 25
    }
  }
  $errors = New-Object Collections.Generic.List[string]
  try {
  foreach ($name in @('web-runtime-approval.json', 'controller-runtime-approval.json')) {
    $file = Join-Path $OutputDir $name
    try {
      if (Test-Path -LiteralPath $file -PathType Leaf) {
        $approval = [IO.File]::ReadAllText($file) | ConvertFrom-Json
        if ($approval.h04cB2.phase -cne 'provision-ingest') { throw 'approval_phase' }
        if ($approval.status -ceq 'CLOSED') {
          if (@($approval.actions).Count -ne 0 -or -not $approval.closedAt) { throw 'approval_closure' }
          continue
        }
        $beforeHash = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
        $approval.status = 'CLOSED'; $approval.actions = @()
        $approval | Add-Member -NotePropertyName closedAt -NotePropertyValue (Format-ProvisionUtc ([DateTime]::UtcNow)) -Force
        $temporary = Join-Path $OutputDir ($name + '.' + [Guid]::NewGuid().ToString('N') + '.tmp')
        $backup = Join-Path $OutputDir ($name + '.before-' + [Guid]::NewGuid().ToString('N') + '.bin')
        Write-ProvisionExclusive $temporary ($approval | ConvertTo-Json -Depth 12)
        if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -cne $beforeHash) { throw 'approval_closure_drift' }
        [IO.File]::Replace($temporary,$file,$backup,$false)
        $verify = [IO.File]::ReadAllText($file) | ConvertFrom-Json
        if ($verify.status -cne 'CLOSED' -or @($verify.actions).Count -ne 0) { throw 'approval_closure' }
        Write-ProvisionReceipt (Join-Path $OutputDir ($name + '.closure.sanitized.json')) @{status='CLOSED';outputDirectory=$OutputDir;approvalFile=$name;beforeFile=[IO.Path]::GetFileName($backup);beforeSha256=$beforeHash;afterSha256=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant();closedAt=$verify.closedAt}
      }
    } catch { $errors.Add($name) }
  }
  } finally { $lock.Dispose() }
  if ($errors.Count) { throw 'approval_closure_failed' }
}
function Write-ProvisionReceipt([string]$Path, $Value) {
  $temporary = $Path + '.' + [Guid]::NewGuid().ToString('N') + '.tmp'
  Write-ProvisionExclusive $temporary ($Value | ConvertTo-Json -Depth 12)
  [IO.File]::Move($temporary,$Path)
}
function Get-ProvisionExitCode($Process) {
  if (-not $Process.HasExited) { throw 'process_not_exited' }
  $Process.WaitForExit()
  $code = $Process.ExitCode
  if ($null -eq $code -or $code -isnot [int]) { throw 'process_exit_unverified' }
  return $code
}
function Assert-ProvisionApprovalsClosed([string]$OutputDir) {
  foreach ($name in @('web-runtime-approval.json','controller-runtime-approval.json')) {
    $file = Join-Path $OutputDir $name
    Assert-ProvisionPrivateFile $file
    $a = [IO.File]::ReadAllText($file) | ConvertFrom-Json
    $r = [IO.File]::ReadAllText((Join-Path $OutputDir ($name + '.closure.sanitized.json'))) | ConvertFrom-Json
    if ($a.h04cB2.phase -cne 'provision-ingest' -or $a.status -cne 'CLOSED' -or @($a.actions).Count -ne 0 -or -not $a.closedAt -or
        $r.status -cne 'CLOSED' -or $r.outputDirectory -cne $OutputDir -or $r.approvalFile -cne $name -or $r.closedAt -cne $a.closedAt -or
        $r.beforeFile -cnotmatch ('\A'+[regex]::Escape($name)+'\.before-[a-f0-9]{32}\.bin\z')) { throw 'approval_closure_evidence' }
    if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -cne $r.afterSha256 -or
        (Get-FileHash -LiteralPath (Join-Path $OutputDir $r.beforeFile) -Algorithm SHA256).Hash.ToLowerInvariant() -cne $r.beforeSha256) { throw 'approval_closure_hash' }
  }
}
function Complete-ProvisionCleanup([string]$OutputDir) {
  $errors = New-Object Collections.Generic.List[string]
  try { Close-ProvisionApprovals $OutputDir; Assert-ProvisionApprovalsClosed $OutputDir } catch { $errors.Add('approval_closure_failed') }
  try { Stop-ProvisionOwnedProcesses $OutputDir } catch { $errors.Add('owned_process_cleanup_failed') }
  return $errors.ToArray()
}
function Assert-ProvisionWatchdogCleanup([string]$OutputDir, [string]$DeadlineUtc, $ExitCode) {
  if ($null -eq $ExitCode -or $ExitCode -isnot [int] -or $ExitCode -ne 0) { throw 'watchdog_exit_failed' }
  $path = Join-Path $OutputDir 'watchdog-cleanup.sanitized.json'
  Assert-ProvisionPrivateFile $path
  $r = [IO.File]::ReadAllText($path) | ConvertFrom-Json
  if ($r.outputDirectory -cne $OutputDir -or $r.deadlineUtc -cne $DeadlineUtc -or $r.status -cne 'CLEANUP_COMPLETE' -or @($r.cleanupErrors).Count -ne 0 -or
      (Test-Path -LiteralPath (Join-Path $OutputDir 'deadline-expired.json'))) { throw 'watchdog_cleanup_failed' }
  Assert-ProvisionApprovalsClosed $OutputDir
}
function Get-ProvisionProcessRecord([int]$ProcessId) {
  $proc = Get-Process -Id $ProcessId -ErrorAction Stop
  return @{ pid = $ProcessId; startTicks = $proc.StartTime.ToUniversalTime().Ticks.ToString() }
}
function Add-ProvisionProcess([string]$OutputDir, [int]$ProcessId) {
  $entry = Get-ProvisionProcessRecord $ProcessId
  $line = ($entry | ConvertTo-Json -Compress) + [Environment]::NewLine
  [IO.File]::AppendAllText((Join-Path $OutputDir 'owned-processes.jsonl'), $line, (New-Object Text.UTF8Encoding($false)))
}
function Get-ProvisionMatchingProcess([int]$ProcessId, [string]$StartTicks) {
  $proc=Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
  if (-not $proc) { return }
  try {
    $null=$proc.Handle
    $start=$proc.StartTime
    if ($null -eq $start) { if ($proc.HasExited) { return }; throw 'process_identity_unverified' }
    if ($start.ToUniversalTime().Ticks.ToString() -ceq $StartTicks) { return $proc }
  } catch { if ($proc.HasExited) { return }; throw }
}
function Stop-ProvisionOwnedProcesses([string]$OutputDir) {
  $file = Join-Path $OutputDir 'owned-processes.jsonl'
  if (-not (Test-Path -LiteralPath $file)) { return }
  $entries = @([IO.File]::ReadAllLines($file) | Where-Object { $_ } | ForEach-Object { $_ | ConvertFrom-Json })
  # Only roots whose process creation time matches the record are authoritative.
  $known = @{}
  foreach ($entry in $entries) {
    $proc = Get-ProvisionMatchingProcess ([int]$entry.pid) $entry.startTicks
    if ($proc) { $known[[int]$entry.pid] = $entry.startTicks }
  }
  if ($known.Count -eq 0) { return }
  $all = @(Get-CimInstance Win32_Process)
  $expanded = $true
  while ($expanded) {
    $expanded = $false
    foreach ($proc in $all) {
      if ($known.ContainsKey([int]$proc.ParentProcessId) -and -not $known.ContainsKey([int]$proc.ProcessId)) {
        try { $record = Get-ProvisionProcessRecord ([int]$proc.ProcessId); $known[[int]$proc.ProcessId] = $record.startTicks; $expanded = $true } catch { }
      }
    }
  }
  $stopping=New-Object Collections.Generic.List[object]
  foreach ($processId in @($known.Keys | Sort-Object -Descending)) {
    $proc = Get-ProvisionMatchingProcess $processId $known[$processId]
    if ($proc) {
      try { Stop-Process -InputObject $proc -Force -ErrorAction Stop } catch { if (-not $proc.HasExited) { throw } }
      $stopping.Add($proc)
    }
  }
  # Stop-Process is asynchronous. An immediate Get-Process can still see a dying
  # process (and StartTime can become null). Retain handles and wait within one
  # shared five-second bound before attempting the mandatory final audit.
  $stopClock=[Diagnostics.Stopwatch]::StartNew()
  foreach ($proc in $stopping) {
    $remaining=[int][Math]::Max(0,5000-$stopClock.ElapsedMilliseconds)
    if (-not $proc.WaitForExit($remaining)) { throw 'owned_process_survived' }
  }
  foreach ($processId in $known.Keys) {
    $proc = Get-ProvisionMatchingProcess $processId $known[$processId]
    if ($proc -and -not $proc.HasExited) { throw 'owned_process_survived' }
  }
}
function Assert-ProvisionNoWorkers {
  $workers = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'node|tsx' -and $_.CommandLine -match 'worker[\\/](sentinel|guard)' })
  if ($workers.Count) { throw 'worker_activity' }
}
