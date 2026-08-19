param(
    [switch]$NoBrowser,
    [switch]$NoPause
)

try {
    chcp 65001 > $null
    [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
} catch {}

$ErrorActionPreference = 'Stop'
$rootPath = $PSScriptRoot
$backendPath = Join-Path $rootPath 'backend'
$frontendPath = Join-Path $rootPath 'frontend'
$nodeDir = 'D:\AI\node-v20.20.2-win-x64'
$npmCmd = Join-Path $nodeDir 'npm.cmd'
$dbHost = '127.0.0.1'
$dbPort = 5433
$dbName = 'ticket_system'
$backendPort = 3000
$frontendPort = 5173

$env:PATH = "$nodeDir;$env:PATH"
$env:HOST = '0.0.0.0'
$env:PORT = [string]$backendPort
$env:DB_HOST = $dbHost
$env:DB_PORT = [string]$dbPort
$env:DB_USERNAME = 'postgres'
$env:DB_PASSWORD = 'postgres'
$env:DB_DATABASE = $dbName
$env:AUTO_SEED = 'false'
Remove-Item Env:VITE_API_BASE_URL -ErrorAction SilentlyContinue

function Assert-Path([string]$path, [string]$name) {
    if (-not (Test-Path -LiteralPath $path)) { throw "$name not found: $path" }
}
function Get-ListeningProcess([int]$port) {
    return Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1
}
function Get-ReadyProcess([int]$port, [string]$url, [string]$name) {
    $listen = Get-ListeningProcess $port
    if (-not $listen) { return $null }
    if (Wait-Http200 $url 5) { return $listen.OwningProcess }
    $proc = Get-Process -Id $listen.OwningProcess -ErrorAction SilentlyContinue
    $label = if ($proc) { "$($proc.ProcessName) PID=$($proc.Id)" } else { "PID=$($listen.OwningProcess)" }
    throw "$name port $port is occupied by $label but health check failed. Stop that service explicitly, then retry."
}
function Wait-Http200([string]$url, [int]$seconds) {
    $deadline = (Get-Date).AddSeconds($seconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
            if ($response.StatusCode -eq 200) { return $true }
        } catch {}
        Start-Sleep -Seconds 1
    }
    return $false
}
function Get-LanIP {
    $candidate = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.AddressState -eq 'Preferred' } |
        Sort-Object InterfaceMetric |
        Select-Object -First 1
    return $candidate.IPAddress
}

Assert-Path $backendPath 'Backend directory'
Assert-Path $frontendPath 'Frontend directory'
Assert-Path $nodeDir 'Node.js directory'
Assert-Path $npmCmd 'npm command'
if (-not (Get-ListeningProcess $dbPort)) {
    throw "PostgreSQL is not listening on $dbHost port $dbPort. Run the database service or 升级启动.ps1 first."
}
$backendPid = Get-ReadyProcess $backendPort "http://127.0.0.1:$backendPort/api/health" 'Backend'
$frontendPid = Get-ReadyProcess $frontendPort "http://127.0.0.1:$frontendPort" 'Frontend'

$branch = (& git -C $rootPath branch --show-current 2>$null | Select-Object -First 1)
$commit = (& git -C $rootPath rev-parse --short HEAD 2>$null | Select-Object -First 1)
$dirty = @(& git -C $rootPath status --porcelain --untracked-files=no 2>$null).Count -gt 0
Write-Host "Source: branch=$branch commit=$commit dirty=$dirty"
Write-Host "Database: $dbHost port $dbPort / $dbName"
Write-Host 'Mode: daily source start; migrations and seed are disabled.'

$backendOut = Join-Path $rootPath 'backend-run.out.log'
$backendErr = Join-Path $rootPath 'backend-run.err.log'
$backendProcess = $null
if ($null -eq $backendPid) {
    $backendProcess = Start-Process -FilePath $npmCmd -ArgumentList @('run', 'start:dev') -WorkingDirectory $backendPath -PassThru -WindowStyle Hidden -RedirectStandardOutput $backendOut -RedirectStandardError $backendErr
    if (-not (Wait-Http200 "http://127.0.0.1:$backendPort/api/health" 120)) {
        throw "Backend did not become ready on port $backendPort. See $backendErr"
    }
    $backendPid = (Get-ListeningProcess $backendPort).OwningProcess
} else {
    Write-Host "Backend already healthy; reusing PID=$backendPid"
}

$frontendOut = Join-Path $rootPath 'frontend-run.out.log'
$frontendErr = Join-Path $rootPath 'frontend-run.err.log'
$frontendProcess = $null
if ($null -eq $frontendPid) {
    $frontendProcess = Start-Process -FilePath $npmCmd -ArgumentList @('run', 'dev', '--', '--host', '0.0.0.0', '--port', [string]$frontendPort) -WorkingDirectory $frontendPath -PassThru -WindowStyle Hidden -RedirectStandardOutput $frontendOut -RedirectStandardError $frontendErr
    if (-not (Wait-Http200 "http://127.0.0.1:$frontendPort" 60)) {
        throw "Frontend did not become ready on port $frontendPort. See $frontendErr"
    }
    $frontendPid = (Get-ListeningProcess $frontendPort).OwningProcess
} else {
    Write-Host "Frontend already healthy; reusing PID=$frontendPid"
}
$localIP = Get-LanIP
$launchUrl = "http://localhost:$frontendPort/?source=$([uri]::EscapeDataString("$commit-$(Get-Date -Format 'yyyyMMddHHmmss')"))"
if (-not $NoBrowser) { Start-Process $launchUrl }
Write-Host "Started: backend PID=$backendPid frontend PID=$frontendPid"
Write-Host "Frontend: http://localhost:$frontendPort"
if ($localIP) { Write-Host ("LAN: http://" + $localIP + ":" + $frontendPort) }
Write-Host 'No database migration or seed was run. Use 升级启动.ps1 for an explicit upgrade.'
if (-not $NoPause) { Read-Host 'Press Enter to close this launcher window; services keep running' }
