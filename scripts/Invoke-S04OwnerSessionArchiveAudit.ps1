# Offline only. No auth writes, live acceptance, approval, server, or database path.
param(
 [switch]$VerifyExistingCandidate,
 [string]$ManifestFile='',
 [string]$ManifestSha256='',
 [string]$OutputDir=''
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$repo=Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $repo
if((Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) -or
 @(Get-CimInstance Win32_Process | Where-Object {$_.Name -match '^(node|tsx)(\.exe)?$' -and $_.CommandLine -match 'worker[\\/](sentinel|guard)|next[\\/]dist[\\/]bin[\\/]next|next-server'}).Count){throw 'auth_runtime_conflict_STOP'}
$entry=Join-Path $PSScriptRoot 'sentinel-owner-session-audit.ts'
foreach($pin in @(
 @{file=$entry;sha='f8309e8332036d2aefd3b852aeff5929f8ca12f9bd1d9a154773e548996944b0'},
 @{file=(Join-Path $PSScriptRoot 'sentinel-owner-session-exception.ts');sha='972e2e5987722df6c3f17a9744a14e3f410e37e44bc5c452153b28d35236eb01'},
 @{file=(Join-Path $PSScriptRoot 'sentinel-owner-auth-snapshot.ts');sha='bd63e3464e9c2a5fa9a1a78cdc4d52c872e553b608c261a536a3cb4529cc9be6'},
 @{file=(Join-Path $PSScriptRoot 'sentinel-provision-common.ps1');sha='2d3eae6ae28e497fa06dd590f9598873cc1feac0a89f44a3b2d19cff19e9e6d1'},
 @{file=(Join-Path $PSScriptRoot 'sentinel-provision-private.ps1');sha='c2090a4e27349a7eabf8516294a5b9f9100458c80821b3122ec459f6268effa3'}
)) {if((Get-FileHash -LiteralPath $pin.file -Algorithm SHA256).Hash.ToLowerInvariant() -cne $pin.sha){throw 'reviewed_audit_dependency_changed_STOP'}}
$inputs=@()
if($ManifestFile -or $ManifestSha256){
 if(-not $ManifestFile -or $ManifestSha256 -cnotmatch '^[a-f0-9]{64}$'){throw 'manifest_pair_required_STOP'}
 $inputs=@("--manifest=$ManifestFile","--manifest-sha256=$ManifestSha256")
}
& node --import tsx $entry preflight @inputs
if($LASTEXITCODE -ne 0){throw 'offline_preflight_NOT_VERIFIED_STOP'}
if(-not $VerifyExistingCandidate){return}
if(-not $ManifestFile -or -not $OutputDir){throw 'offline_verify_explicit_inputs_required_STOP'}
if($OutputDir -cnotmatch '^C:\\Users\\sheil\\\.wetscan-sentinel\\s04-auth-archive-validation-[a-f0-9]{32}$'){throw 'fresh_output_scope_required_STOP'}
. (Join-Path $PSScriptRoot 'sentinel-provision-common.ps1')
$null=Assert-ProvisionPrivatePath $OutputDir $repo
New-ProvisionPrivateDirectory $OutputDir
& node --import tsx $entry verify @inputs "--output=$OutputDir"
if($LASTEXITCODE -ne 0){throw 'offline_archive_session_NOT_VERIFIED_STOP_NO_RETRY'}
# STOP. No live authorization is conveyed by this offline receipt.
