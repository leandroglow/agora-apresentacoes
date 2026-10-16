param([switch]$Once)
$ErrorActionPreference = 'Stop'
$cadLocal = Join-Path $env:LOCALAPPDATA 'AgoraCAD'
New-Item -ItemType Directory -Path $cadLocal -Force | Out-Null
$cadSecret = Join-Path $cadLocal 'worker-secret.xml'
# Packaged desktop apps virtualize LocalAppData; use the same protected file.
if (-not (Test-Path -LiteralPath $cadSecret)) {
    $cadPackagedSecret = Join-Path $env:LOCALAPPDATA 'Packages\OpenAI.Codex_2p2nqsd0c76g0\LocalCache\Local\AgoraCAD\worker-secret.xml'
    if (Test-Path -LiteralPath $cadPackagedSecret) { $cadSecret = $cadPackagedSecret }
}
if (-not $env:CAD_WORKER_TOKEN -and (Test-Path -LiteralPath $cadSecret)) {
    $cadSecure = Import-Clixml -LiteralPath $cadSecret
    $env:CAD_WORKER_TOKEN = [System.Net.NetworkCredential]::new('', $cadSecure).Password
}
if (-not $env:CAD_API_URL) { $env:CAD_API_URL = 'https://agora-apresentacoes.vercel.app' }
if (-not $env:CAD_ODA) { $env:CAD_ODA = 'C:\Program Files\ODA\ODAFileConverter 27.9.0\ODAFileConverter.exe' }
if (-not $env:CAD_LIBS) { $env:CAD_LIBS = 'C:\Users\leand\.codex\visualizations\2026\09\13\01a09c03-76e6-7283-a9e6-1dc5038aac59\cad-libs' }
$cadPython = if ($env:CAD_PYTHON) { $env:CAD_PYTHON } else { 'C:\Users\leand\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' }
$cadMutex = New-Object System.Threading.Mutex($false, 'Local\AgoraCADWorker')
if (-not $cadMutex.WaitOne(0)) { exit 0 }
try {
    $cadArgs = @((Join-Path $PSScriptRoot 'cad-worker.py'))
    if ($Once) { $cadArgs += '--once' }
    $cadLog = Join-Path $env:LOCALAPPDATA 'AgoraCAD\worker.log'
    Add-Content -LiteralPath $cadLog -Value ('Starting CAD worker ' + (Get-Date -Format o))
    & $cadPython @cadArgs >> $cadLog 2>&1
    $cadExit = $LASTEXITCODE
} finally {
    $env:CAD_WORKER_TOKEN = $null
    $cadMutex.ReleaseMutex()
    $cadMutex.Dispose()
}
exit $cadExit


