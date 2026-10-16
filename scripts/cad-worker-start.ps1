param([switch]$Once)
$ErrorActionPreference = 'Stop'
$cadSecret = Join-Path $env:LOCALAPPDATA 'AgoraCAD\worker-secret.xml'
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
    & $cadPython @cadArgs
    $cadExit = $LASTEXITCODE
} finally {
    $env:CAD_WORKER_TOKEN = $null
    $cadMutex.ReleaseMutex()
    $cadMutex.Dispose()
}
exit $cadExit
