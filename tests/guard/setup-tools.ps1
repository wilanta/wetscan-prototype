# Explicit local fixture setup; no runtime downloads, project dependency or Auth changes.
$ErrorActionPreference = "Stop"
if ($env:OS -ne "Windows_NT") { throw "These fixture pins are Windows x64 only." }
$guardTools = @(
  @{ Folder="wetscan-guard-tools-v1.33.1"; File="opengrep.exe"; Binary="132e606e071bdd3928286fddc893198a6106a90820d46e21197e0ace1a23e0c1"; Asset="opengrep_windows_x86.exe"; Version="v1.33.1"; Repo="opengrep/opengrep"; Archive="" },
  @{ Folder="wetscan-guard-tools-gitleaks-8.30.1"; File="gitleaks.exe"; Binary="17157e2ee8b76fc8b1d8bee607a250e34b8a8023c8bc81822d4b5ee4d78fcb7c"; Asset="gitleaks_8.30.1_windows_x64.zip"; Version="v8.30.1"; Repo="gitleaks/gitleaks"; Archive="d29144deff3a68aa93ced33dddf84b7fdc26070add4aa0f4513094c8332afc4e" },
  @{ Folder="wetscan-guard-tools-osv-2.7.1"; File="osv-scanner.exe"; Binary="7121dcf420aefbbf89a7f0050c4d3094e079ff93afd334dfc96f16b02ec85800"; Asset="osv-scanner_windows_amd64.exe"; Version="v2.7.1"; Repo="google/osv-scanner"; Archive="" },
  @{ Folder="wetscan-guard-tools-trivy-0.76.2"; File="trivy.exe"; Binary="dd07adf881a72b54d1a922191d62fa939938df2155be85a727da93b67b24e617"; Asset="trivy_0.76.2_windows-64bit.zip"; Version="v0.76.2"; Repo="aquasecurity/trivy"; Archive="691f737a7e5566a673c3a74dab9160552ec32101e953b659e5c77443d16dddb6" }
)
foreach ($guardTool in $guardTools) {
  $guardRoot = [IO.Path]::GetFullPath((Join-Path $env:TEMP $guardTool.Folder))
  $guardTemp = [IO.Path]::GetFullPath($env:TEMP).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
  if (-not $guardRoot.StartsWith($guardTemp, [StringComparison]::OrdinalIgnoreCase)) { throw "Unsafe fixture tool directory." }
  New-Item -ItemType Directory -Force -Path $guardRoot | Out-Null
  $guardBinary = Join-Path $guardRoot $guardTool.File
  if ((Test-Path -LiteralPath $guardBinary) -and (Get-FileHash -LiteralPath $guardBinary -Algorithm SHA256).Hash.ToLowerInvariant() -eq $guardTool.Binary) { Write-Output ($guardTool.File + " already checksum-verified"); continue }
  $guardAsset = Join-Path $guardRoot $guardTool.Asset
  Invoke-WebRequest -UseBasicParsing ("https://github.com/" + $guardTool.Repo + "/releases/download/" + $guardTool.Version + "/" + $guardTool.Asset) -OutFile $guardAsset
  $guardExpected = if ($guardTool.Archive) { $guardTool.Archive } else { $guardTool.Binary }
  if ((Get-FileHash -LiteralPath $guardAsset -Algorithm SHA256).Hash.ToLowerInvariant() -ne $guardExpected) { throw "Official scanner artifact checksum mismatch." }
  if ($guardTool.Archive) { Expand-Archive -LiteralPath $guardAsset -DestinationPath $guardRoot -Force } else { Copy-Item -LiteralPath $guardAsset -Destination $guardBinary -Force }
  if ((Get-FileHash -LiteralPath $guardBinary -Algorithm SHA256).Hash.ToLowerInvariant() -ne $guardTool.Binary) { throw "Scanner executable checksum mismatch." }
  Write-Output ($guardTool.File + " installed and checksum-verified")
}
