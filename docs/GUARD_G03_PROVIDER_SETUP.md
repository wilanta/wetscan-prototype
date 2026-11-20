# G03 provider preparation — no activation or paid call

Use the existing server-side OpenAI Responses adapter and existing WetScan Auth. The checked-in [non-secret settings](config/guard-g03.provider.example.json) select `gpt-5.4-mini-2026-03-17`, input $0.75/output $4.50 per million tokens. The maximum reservation is **16,500 micro-USD = $0.0165**, below the owner's $0.10 ceiling. These prices, snapshot, Responses/structured-output support and default `reasoning.effort=none` were checked against the [official model page](https://developers.openai.com/api/docs/models/gpt-5.4-mini) on 20 November 2026. Recheck pricing/account access before activation. No real model call or account availability is proven by a settings file.

`enabled:false`, `dataPolicyApproved:false`, `keyFile:null` are intentional. The setup helper never calls the provider, reads key contents, starts the server/scanner, applies environment variables or enables repository writes.

Do not put an AI key or these settings in `.env.sentinel.example`; that template belongs to the preserved Sentinel database setup. G03 uses its own private server process references.

From this worktree:

```powershell
node --require ./tests/auth/skip-dotenv.cjs --conditions=react-server --import tsx scripts/guard-g03-setup.ts plan docs/config/guard-g03.provider.example.json
```

The helper rejects unknown fields (including `apiKey`), relative/dotenv references, invalid prices, excessive reservation and enabled-but-unapproved settings. `settingsEnvironment` maps reviewed values into the existing backend environment names; it never sets `GUARD_G03_ENABLED` or `GUARD_G03_GITHUB_WRITES_ENABLED`. It is a mapping for an owner-managed launcher, not a command to activate a running process. Keep normal source/review/write/retest approval gates intact.

## Owner-only private key provisioning

The owner runs this **interactively in a local PowerShell console**, outside screen sharing/recording. Do not paste a key into chat, command-line arguments, environment variables, an editor in this worktree or a checked-in file. The commands create a new private directory outside Git, restrict it to the current user and SYSTEM, verify that ACL before prompting, take masked input and use `CreateNew` (never overwrite an existing key). No existing directory ACL is changed. No AI request follows.

```powershell
$g03Parent = Join-Path $env:LOCALAPPDATA 'WetScanGuardG03'
[IO.Directory]::CreateDirectory($g03Parent) | Out-Null
if (([IO.DirectoryInfo]::new($g03Parent).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Private parent must not be a reparse point' }
$g03Root = Join-Path $g03Parent ('wetscan-g03-provider-' + [Guid]::NewGuid().ToString())
if ([IO.Directory]::Exists($g03Root)) { throw 'New private root required' }
[IO.Directory]::CreateDirectory($g03Root) | Out-Null
$g03Sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
if ($g03Sid.Value -eq 'S-1-5-18') { throw 'Interactive owner identity required' }
$g03Acl = [Security.AccessControl.DirectorySecurity]::new()
$g03Acl.SetOwner($g03Sid)
$g03Acl.SetAccessRuleProtection($true, $false)
$g03Inheritance = [Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit
$g03Acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($g03Sid, [Security.AccessControl.FileSystemRights]::FullControl, $g03Inheritance, [Security.AccessControl.PropagationFlags]::None, [Security.AccessControl.AccessControlType]::Allow))
$g03System = [Security.Principal.SecurityIdentifier]::new('S-1-5-18')
$g03Acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($g03System, [Security.AccessControl.FileSystemRights]::FullControl, $g03Inheritance, [Security.AccessControl.PropagationFlags]::None, [Security.AccessControl.AccessControlType]::Allow))
[IO.DirectoryInfo]::new($g03Root).SetAccessControl($g03Acl)
node --require ./tests/auth/skip-dotenv.cjs --conditions=react-server --import tsx scripts/guard-g03-setup.ts check-root $g03Root
if ($LASTEXITCODE -ne 0) { throw 'Private root verification failed; no key may be entered' }
$g03KeyFile = Join-Path $g03Root 'provider.key'
$g03Secret = Read-Host 'Provider key (masked; never send to chat)' -AsSecureString
$g03Pointer = [IntPtr]::Zero
$g03Bytes = $null
$g03Stream = $null
try {
  $g03Pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($g03Secret)
  $g03Bytes = [Text.Encoding]::UTF8.GetBytes([Runtime.InteropServices.Marshal]::PtrToStringBSTR($g03Pointer))
  if ($g03Bytes.Length -lt 20 -or $g03Bytes.Length -gt 512) { throw 'Unexpected key length' }
  $g03Stream = [IO.File]::Open($g03KeyFile, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
  $g03Stream.Write($g03Bytes, 0, $g03Bytes.Length)
} finally {
  if ($g03Stream) { $g03Stream.Dispose() }
  if ($g03Bytes) { [Array]::Clear($g03Bytes, 0, $g03Bytes.Length) }
  if ($g03Pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($g03Pointer) }
  $g03Secret.Dispose()
}
$g03Settings = Get-Content -LiteralPath 'docs/config/guard-g03.provider.example.json' -Raw | ConvertFrom-Json
$g03Settings.keyFile = $g03KeyFile
$g03SettingsFile = Join-Path $g03Root 'provider.settings.json'
[IO.File]::WriteAllText($g03SettingsFile, ($g03Settings | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
node --require ./tests/auth/skip-dotenv.cjs --conditions=react-server --import tsx scripts/guard-g03-setup.ts check-reference $g03SettingsFile
```

The final command inspects metadata/ACL only and prints no private path, key value or key hash. It does not validate the actual key or prove model access. Provisioning is for the owner; the agent has **not run this block or created/read a real key**. .NET temporarily materializes a managed string while writing; do not treat this procedure as a secure enclave. Prefer an existing approved secret manager/file reference where available.

## Policy and first-call gates

Review the account's sharing/retention settings privately. API data is not used for training by default unless sharing is opted into, while abuse-monitoring logs may retain data up to 30 days. `store:false` does not establish Zero Data Retention. See [official data controls](https://developers.openai.com/api/docs/guides/your-data). After actual owner policy approval, record a new auditable policy version in the private settings. Leave AI disabled until the specific source preview/model/cost is approved.

The existing runtime retains 20-second timeout, 10,000/2,000 token reservations, zero retries, $0.50/20-attempt project daily caps and one actor request per minute. A key reference, plan or model listing is not successful provider acceptance. Unknown attempts are not repeated. Use [the staged live plan](GUARD_G03_LIVE_ACCEPTANCE.md) after an actual finding/revision is selected.
