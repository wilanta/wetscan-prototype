param([Parameter(Mandatory=$true)][string]$Directory, [switch]$Create, [switch]$File)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'sentinel-provision-common.ps1')
$null = Assert-ProvisionPrivatePath $Directory (Split-Path $PSScriptRoot -Parent)
if ($Create) { New-ProvisionPrivateDirectory $Directory } elseif ($File) { Assert-ProvisionPrivateFile $Directory } else { Assert-ProvisionPrivateDirectory $Directory }
