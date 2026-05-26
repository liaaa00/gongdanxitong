param(
    [switch]$NoBrowser,
    [switch]$NoPause
)

# Ticket System one-click start script for Windows PowerShell 5.1.
# Logic is ASCII-only and all project paths are derived from PSScriptRoot.

$ErrorActionPreference = 'Stop'
$rootPath = $PSScriptRoot
$backendPath = Join-Path $rootPath 'backend'
$frontendPath = Join-Path $rootPath 'frontend'
$nodeDir = 'D:\AI\node-v20.20.2-win-x64'
$npmCmd = Join-Path $nodeDir 'npm.cmd'
$pgBin = 'D:\pgsql16portable\pgsql\bin\pg_ctl.exe'
$pgData = 'D:\pgsql16portable\data'
$backendPort = 3000
$frontendPort = 5173
$runSeed = $true

$env:PATH = "$nodeDir;$env:PATH"
$env:HOST = '0.0.0.0'
$env:PORT = [string]$backendPort
$env:AUTO_SEED = 'true'
$env:VITE_API_BASE_URL = $null

function Write-Step([string]$message) { Write-Host "`n$message" -ForegroundColor Yellow }
function Assert-Path([string]$path, [string]$name) { if (-not (Test-Path -LiteralPath $path)) { throw "$name not found: $path" } }
function Assert-LastExit([string]$name) { if ($LASTEXITCODE -ne 0) { throw "$name failed with exit code $LASTEXITCODE" } }

function Stop-PortProcess([int]$port) {
    $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    foreach ($conn in $connections) {
        $processId = $conn.OwningProcess
        if ($processId -and $processId -ne 0) {
            try {
                $proc = Get-Process -Id $processId -ErrorAction Stop
                Write-Host "  Stop port $port process PID=$processId ($($proc.ProcessName))" -ForegroundColor Gray
                Stop-Process -Id $processId -Force -ErrorAction Stop
            } catch {
                Write-Host "  Port $port PID=$processId already stopped or cannot stop: $($_.Exception.Message)" -ForegroundColor DarkYellow
            }
        }
    }
}

function Stop-ProjectNodeProcesses {
    Stop-PortProcess $backendPort
    Stop-PortProcess $frontendPort
    $nodes = Get-Process -Name node -ErrorAction SilentlyContinue
    foreach ($node in $nodes) {
        $cmd = $null
        try {
            $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$($node.Id)" -ErrorAction Stop).CommandLine
        } catch {}
        $isProjectNode = $false
        if ($cmd -and ($cmd -like "*$rootPath*" -or $cmd -like '*dist\main.js*' -or $cmd -like '*vite*')) { $isProjectNode = $true }
        if (-not $cmd -and $node.Path -and $node.Path -like "$nodeDir*") { $isProjectNode = $true }
        if ($isProjectNode) {
            try {
                Write-Host "  Stop project Node PID=$($node.Id)" -ForegroundColor Gray
                Stop-Process -Id $node.Id -Force -ErrorAction Stop
            } catch {
                Write-Host "  Node PID=$($node.Id) already stopped or cannot stop: $($_.Exception.Message)" -ForegroundColor DarkYellow
            }
        }
    }
    Start-Sleep -Seconds 2
}

function Test-PortListen([int]$port) {
    $listen = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    return [bool]$listen
}

function Wait-Http200([string]$url, [int]$seconds) {
    for ($i = 1; $i -le $seconds; $i++) {
        try {
            $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
            if ($response.StatusCode -eq 200) { return $true }
        } catch {}
        Start-Sleep -Seconds 1
    }
    return $false
}

function Assert-ServiceReady([int]$port, [string]$url, [string]$name) {
    $deadline = (Get-Date).AddSeconds(120)
    while ((Get-Date) -lt $deadline) {
        if ((Test-PortListen $port) -and (Wait-Http200 $url 1)) {
            $listen = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop | Select-Object -First 1
            return $listen.OwningProcess
        }
        Start-Sleep -Seconds 1
    }
    throw "$name failed: port $port did not listen or $url did not return HTTP 200 within 120s"
}

function Get-LanIP {
    $candidates = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object {
            $_.IPAddress -notlike '127.*' -and
            $_.IPAddress -notlike '169.254.*' -and
            $_.AddressState -eq 'Preferred' -and
            $_.InterfaceAlias -notlike '*vEthernet*' -and
            $_.InterfaceAlias -notlike '*Docker*' -and
            $_.InterfaceAlias -notlike '*WSL*' -and
            $_.InterfaceAlias -notlike '*VMware*' -and
            $_.InterfaceAlias -notlike '*VirtualBox*' -and
            $_.InterfaceAlias -notlike '*Loopback*'
        } |
        Sort-Object @{ Expression = { if ($_.PrefixOrigin -eq 'Dhcp') { 0 } else { 1 } } }, InterfaceMetric
    return $candidates | Select-Object -First 1 -ExpandProperty IPAddress
}

Write-Host '========================================' -ForegroundColor Cyan
Write-Host '  Ticket System server starting' -ForegroundColor Cyan
Write-Host '========================================' -ForegroundColor Cyan

try {

Assert-Path $backendPath 'Backend directory'
Assert-Path $frontendPath 'Frontend directory'
Assert-Path $nodeDir 'Node.js directory'

Write-Step '[1/7] Stop old project Node processes and free ports 3000/5173...'
Stop-ProjectNodeProcesses
if (Test-PortListen $backendPort) { throw 'Port 3000 is still listening after cleanup' }
if (Test-PortListen $frontendPort) { throw 'Port 5173 is still listening after cleanup' }
Write-Host '  Cleanup OK.' -ForegroundColor Green

Write-Step '[2/7] Start/check PostgreSQL shared database...'
$pgProcess = Get-Process -Name postgres -ErrorAction SilentlyContinue
if ($pgProcess) {
    Write-Host '  PostgreSQL already running.' -ForegroundColor Green
} else {
    Assert-Path $pgBin 'PostgreSQL pg_ctl'
    $logFile = "D:\pgsql16portable\pg_$(Get-Date -Format 'yyyyMMdd_HHmmss').log"
    & $pgBin start -D $pgData -l $logFile
    Assert-LastExit 'Start PostgreSQL'
    Start-Sleep -Seconds 3
    Write-Host '  PostgreSQL started.' -ForegroundColor Green
}

Write-Step '[3/7] Build latest backend dist...'
Push-Location $backendPath
try {
    & $npmCmd run build
    Assert-LastExit 'npm run build'
    if ($runSeed) {
        Write-Step '[4/7] Run idempotent seed (base data only, no business data cleanup)...'
        & $npmCmd run seed
        Assert-LastExit 'npm run seed'
    } else {
        Write-Step '[4/7] Seed skipped by script config.'
    }
} finally { Pop-Location }

Write-Step '[5/7] Start backend on 0.0.0.0:3000...'
$backendOut = Join-Path $rootPath 'backend-run.out.log'
$backendErr = Join-Path $rootPath 'backend-run.err.log'
$env:HOST = '0.0.0.0'
$env:PORT = [string]$backendPort
# Seed has already run in step [4/7]; skip startup seed to avoid health-check timeout.
$env:AUTO_SEED = 'false'
$backendProcess = Start-Process -FilePath (Join-Path $nodeDir 'node.exe') -ArgumentList @('dist\main.js') -WorkingDirectory $backendPath -PassThru -WindowStyle Hidden -RedirectStandardOutput $backendOut -RedirectStandardError $backendErr
Start-Sleep -Seconds 3
$backendPid = Assert-ServiceReady $backendPort "http://127.0.0.1:$backendPort/api/health" 'Backend'
Write-Host "  Backend OK. PID=$backendPid StartedPID=$($backendProcess.Id) URL=http://127.0.0.1:$backendPort/api/health" -ForegroundColor Green

Write-Step '[6/7] Start frontend on 0.0.0.0:5173 with relative /api proxy to 127.0.0.1:3000...'
$frontendOut = Join-Path $rootPath 'frontend-run.out.log'
$frontendErr = Join-Path $rootPath 'frontend-run.err.log'
$viteJs = Join-Path $frontendPath 'node_modules\vite\bin\vite.js'
Assert-Path $viteJs 'Vite CLI'
Remove-Item Env:VITE_API_BASE_URL -ErrorAction SilentlyContinue
$frontendProcess = Start-Process -FilePath (Join-Path $nodeDir 'node.exe') -ArgumentList @($viteJs, '--host', '0.0.0.0', '--port', [string]$frontendPort) -WorkingDirectory $frontendPath -PassThru -WindowStyle Hidden -RedirectStandardOutput $frontendOut -RedirectStandardError $frontendErr
Start-Sleep -Seconds 3
$frontendPid = Assert-ServiceReady $frontendPort "http://127.0.0.1:$frontendPort" 'Frontend'
Write-Host "  Frontend OK. PID=$frontendPid StartedPID=$($frontendProcess.Id) URL=http://127.0.0.1:$frontendPort" -ForegroundColor Green

Write-Step '[7/7] Print access URLs...'
$localIP = Get-LanIP
if (-not $NoBrowser) { Start-Process "http://localhost:$frontendPort" }
Write-Host "`nSTARTED SUCCESSFULLY" -ForegroundColor Green
Write-Host "Backend PID: $backendPid" -ForegroundColor Green
Write-Host "Frontend PID: $frontendPid" -ForegroundColor Green
Write-Host "Server local URL: http://localhost:$frontendPort" -ForegroundColor Yellow
if ($localIP) { Write-Host "Coworker URL: http://${localIP}:$frontendPort" -ForegroundColor Yellow }
Write-Host 'Frontend API mode: browser calls relative /api; Vite proxy sends to server 127.0.0.1:3000.' -ForegroundColor Cyan
Write-Host 'Database: server PostgreSQL 127.0.0.1:5432 / ticket_system.' -ForegroundColor Cyan
if (-not $NoPause) { Write-Host "`nPress Enter to close this launcher window. Services keep running." -ForegroundColor Gray; Read-Host }

} catch {
    Write-Host "`n[FATAL] $($_.Exception.Message)" -ForegroundColor Red
    Write-Host $_.ScriptStackTrace -ForegroundColor DarkRed
    $backendErr = Join-Path $rootPath 'backend-run.err.log'
    if (Test-Path -LiteralPath $backendErr) {
        Write-Host "`n--- Last 40 lines of backend-run.err.log ---" -ForegroundColor DarkYellow
        Get-Content -LiteralPath $backendErr -Tail 40 | ForEach-Object { Write-Host $_ -ForegroundColor DarkYellow }
    }
    Read-Host "`nPress Enter to close"
    exit 1
}
