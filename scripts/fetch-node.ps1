# Download a standalone Node.js runtime (node.exe) for the frontend server.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/fetch-node.ps1 [-Platform win-x64]
param([string]$Platform = "win-x64")

$ErrorActionPreference = "Stop"
$NodeVersion = "v22.21.0"
$DesktopDir  = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Out         = Join-Path $DesktopDir "build\node"

$Zip = "node-$NodeVersion-$Platform.zip"
$Url = "https://nodejs.org/dist/$NodeVersion/$Zip"
$Tmp = Join-Path $env:TEMP ("node-fetch-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $Tmp | Out-Null

try {
    Write-Host ">> $Url"
    Invoke-WebRequest -Uri $Url -OutFile (Join-Path $Tmp $Zip)
    Expand-Archive -Path (Join-Path $Tmp $Zip) -DestinationPath $Tmp

    New-Item -ItemType Directory -Force -Path $Out | Out-Null
    Copy-Item (Join-Path $Tmp "node-$NodeVersion-$Platform\node.exe") (Join-Path $Out "node.exe")
    Copy-Item (Join-Path $Tmp "node-$NodeVersion-$Platform\LICENSE") (Join-Path $Out "LICENSE.node")

    & (Join-Path $Out "node.exe") --version
    Write-Host ">> Done: $Out\node.exe"
} finally {
    Remove-Item -Recurse -Force $Tmp -ErrorAction SilentlyContinue
}
