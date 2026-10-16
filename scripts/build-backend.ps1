# Build the DeepTutor backend as a standalone binary for Windows.
#
# Usage:   powershell -ExecutionPolicy Bypass -File scripts/build-backend.ps1
# Env:     DEEPTUTOR_SRC — path to the DeepTutor checkout (default: ..\DeepTutor)
#
# Result:  build/dist/deeptutor-backend/  (consumed by electron-builder)

$ErrorActionPreference = "Stop"

$DesktopDir   = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$DeeptutorSrc = if ($env:DEEPTUTOR_SRC) { $env:DEEPTUTOR_SRC } else { (Resolve-Path (Join-Path $DesktopDir "..\DeepTutor")).Path }

Write-Host ">> DeepTutor source: $DeeptutorSrc"

$Python = $null
foreach ($candidate in @("py -3.12", "py -3.11", "python")) {
    try {
        $version = Invoke-Expression "$candidate -c `"import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')`"" 2>$null
        if ($version -match "^3\.(11|12|13|14)$") { $Python = $candidate; break }
    } catch {}
}
if (-not $Python) { throw "Python 3.11+ is required" }
Write-Host ">> Using $Python ($version)"

$VenvPython = Join-Path $DeeptutorSrc ".venv\Scripts\python.exe"
if (-not (Test-Path $VenvPython)) {
    Write-Host ">> Creating venv"
    Invoke-Expression "$Python -m venv `"$DeeptutorSrc\.venv`""
}

Write-Host ">> Installing deeptutor + pyinstaller"
& $VenvPython -m pip install --quiet --upgrade pip
& $VenvPython -m pip install --quiet -e $DeeptutorSrc pyinstaller

Write-Host ">> Running PyInstaller"
$DistDir = Join-Path $DesktopDir "build\dist\deeptutor-backend"
if (Test-Path $DistDir) { Remove-Item -Recurse -Force $DistDir }
$env:DESKTOP_DIR = $DesktopDir
$env:DEEPTUTOR_SRC = $DeeptutorSrc
& (Join-Path $DeeptutorSrc ".venv\Scripts\pyinstaller.exe") --noconfirm `
    --distpath (Join-Path $DesktopDir "build\dist") `
    --workpath (Join-Path $DesktopDir "build\work") `
    (Join-Path $DesktopDir "build\deeptutor-backend.spec")

Write-Host ">> Done: $DistDir"
