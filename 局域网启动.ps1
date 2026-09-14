param(
    [switch]$NoBrowser,
    [switch]$NoPause
)

# Ticket System LAN startup script for Windows PowerShell 5.1.
# Logic is ASCII-only and all project paths are derived from PSScriptRoot.
# Ports/hosts/paths come ONLY from config/env.ps1 - never hardcode them here.

$ErrorActionPreference = 'Stop'
$rootPath = $PSScriptRoot
. (Join-Path $rootPath 'config\env.ps1')

$runSeed = $true

$env:PATH = "$NodeDir;$env:PATH"
$env:HOST = $BackendHost
$env:PORT = [string]$BackendPort
$env:DB_HOST = $DbHost
$env:DB_PORT = [string]$DbPort
$env:DB_USERNAME = $DbUsername
$env:DB_PASSWORD = Get-TicketDbPassword
$env:DB_DATABASE = $DbName
$env:AUTO_SEED = 'true'
$env:VITE_API_BASE_URL = $null
[Environment]::SetEnvironmentVariable('VITE_API_BASE_URL', $null, [EnvironmentVariableTarget]::Process)

function Write-Step([string]$message) { Write-Host "`n$message" -ForegroundColor Yellow }
function Assert-PathExist([string]$path, [string]$name) { if (-not (Test-Path -LiteralPath $path)) { throw "$name not found: $path" } }
function Assert-LastExit([string]$name) { if ($LASTEXITCODE -ne 0) { throw "$name failed with exit code $LASTEXITCODE" } }

function Stop-ProjectNodeProcesses {
    Stop-TicketAppPort -Ports @($BackendPort, $FrontendPort)
    $nodes = Get-Process -Name node -ErrorAction SilentlyContinue
    foreach ($node in $nodes) {
        $cmd = $null
        try { $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$($node.Id)" -ErrorAction Stop).CommandLine } catch {}
        $isProjectNode = $false
        if ($cmd -and ($cmd -like "*$rootPath*" -or $cmd -like '*dist\main.js*' -or $cmd -like '*vite*')) { $isProjectNode = $true }
        if (-not $cmd -and $node.Path -and $node.Path -like "$NodeDir*") { $isProjectNode = $true }
        if ($isProjectNode) {
            try { Write-Host "  Stop project Node PID=$($node.Id)" -ForegroundColor Gray; Stop-Process -Id $node.Id -Force -ErrorAction Stop }
            catch { Write-Host "  Node PID=$($node.Id) already stopped or cannot stop: $($_.Exception.Message)" -ForegroundColor DarkYellow }
        }
    }
    Start-Sleep -Seconds 2
}

function Assert-ServiceReady([int]$port, [string]$url, [string]$name, [int]$serviceReadyTimeoutSec = $BackendReadyTimeoutSec) {
    $deadline = (Get-Date).AddSeconds($serviceReadyTimeoutSec)
    while ((Get-Date) -lt $deadline) {
        if ((Test-TicketPortListen $port) -and (Wait-TicketHttp200 $url 1)) {
            return (Get-TicketListeningProcess $port).OwningProcess
        }
        Start-Sleep -Seconds 1
    }
    throw "$name failed: port $port did not listen or $url did not return HTTP 200 within ${serviceReadyTimeoutSec}s"
}

Write-Host '========================================' -ForegroundColor Cyan
Write-Host '  Ticket System LAN server starting' -ForegroundColor Cyan
Write-Host '========================================' -ForegroundColor Cyan
Assert-PathExist $BackendPath 'Backend directory'; Assert-PathExist $FrontendPath 'Frontend directory'; Assert-PathExist $NodeDir 'Node.js directory'

Write-Step "[1/7] Stop old project Node processes and free ports $BackendPort/$FrontendPort..."
Stop-ProjectNodeProcesses
if (Test-TicketPortListen $BackendPort) { throw "Port $BackendPort is still listening after cleanup" }
if (Test-TicketPortListen $FrontendPort) {
    $owner = Get-TicketPortOwnerLabel $FrontendPort
    if ($owner) { Write-Host "  Occupier: $($owner.Name) PID=$($owner.Pid) cmd=$($owner.Command)" -ForegroundColor Yellow }
    throw "Port $FrontendPort is still listening after cleanup"
}
Write-Host '  Cleanup OK.' -ForegroundColor Green

Write-Step "[2/7] Start/check PostgreSQL shared database ($DbHost : $DbPort / $DbName)..."
$pgProcess = Get-Process -Name postgres -ErrorAction SilentlyContinue
if ($pgProcess) { Write-Host '  PostgreSQL already running.' -ForegroundColor Green }
else {
    Assert-PathExist $PgBin 'PostgreSQL pg_ctl'
    $logFile = Join-Path $PgRoot ("pg_" + (Get-Date -Format 'yyyyMMdd_HHmmss') + ".log")
    & $PgBin start -D $PgData -l $logFile
    Assert-LastExit 'Start PostgreSQL'
    Start-Sleep -Seconds 3
    Write-Host '  PostgreSQL started.' -ForegroundColor Green
}
if (-not (Test-TicketPortListen $DbPort)) { throw "PostgreSQL is not listening on $DbHost port $DbPort" }

Write-Step '[3/7] Build latest backend dist...'
Push-Location $BackendPath
try { npm run build; Assert-LastExit 'npm run build' }
finally { Pop-Location }

Write-Step '[4/7] Sync field definitions from compiled seed...'
Push-Location $BackendPath
try {
    & $NodeExe 'dist\database\seeds\index.js'
    Assert-LastExit 'Seed execution'
    Write-Host '  Seed completed.' -ForegroundColor Green
} finally { Pop-Location }

Write-Step "[5/7] Start backend on $BackendHost : $BackendPort..."
$backendOut = Join-Path $rootPath 'backend-run.out.log'
$backendErr = Join-Path $rootPath 'backend-run.err.log'
$backendProcess = Start-Process -FilePath $NodeExe -ArgumentList @('dist\main.js') -WorkingDirectory $BackendPath -PassThru -WindowStyle Hidden -RedirectStandardOutput $backendOut -RedirectStandardError $backendErr
Start-Sleep -Seconds 3
$backendPid = Assert-ServiceReady $BackendPort $HealthUrl 'Backend'
Write-Host "  Backend OK. PID=$backendPid StartedPID=$($backendProcess.Id) URL=$HealthUrl" -ForegroundColor Green

Write-Step "[6/7] Start frontend on $FrontendHost : $FrontendPort (strictPort) with relative /api proxy to $ViteApiTarget..."
$frontendOut = Join-Path $rootPath 'frontend-run.out.log'
$frontendErr = Join-Path $rootPath 'frontend-run.err.log'
$viteJs = Join-Path $FrontendPath 'node_modules\vite\bin\vite.js'
Assert-PathExist $viteJs 'Vite CLI'
[Environment]::SetEnvironmentVariable('VITE_API_BASE_URL', $null, [EnvironmentVariableTarget]::Process)
$frontendProcess = Start-Process -FilePath $NodeExe -ArgumentList @($viteJs, '--host', $FrontendHost, '--port', [string]$FrontendPort, '--strictPort') -WorkingDirectory $FrontendPath -PassThru -WindowStyle Hidden -RedirectStandardOutput $frontendOut -RedirectStandardError $frontendErr
Start-Sleep -Seconds 3
try {
    $frontendPid = Assert-ServiceReady $FrontendPort $FrontendHealthUrl 'Frontend' $FrontendReadyTimeoutSec
} catch {
    $owner = Get-TicketPortOwnerLabel $FrontendPort
    if ($owner) { Write-Host "  Possible occupier of port $FrontendPort : $($owner.Name) PID=$($owner.Pid) cmd=$($owner.Command)" -ForegroundColor Yellow }
    throw
}
Write-Host "  Frontend OK. PID=$frontendPid StartedPID=$($frontendProcess.Id) URL=$FrontendHealthUrl" -ForegroundColor Green

Write-Step '[7/7] Print access URLs...'
if (-not $NoBrowser) { Start-Process "http://localhost:$FrontendPort" }
Write-Host "`nSTARTED SUCCESSFULLY" -ForegroundColor Green
Write-Host "Backend PID: $backendPid" -ForegroundColor Green
Write-Host "Frontend PID: $frontendPid" -ForegroundColor Green
Write-Host "Server local URL: http://localhost:$FrontendPort" -ForegroundColor Yellow
if ($ServerLanIp) { Write-Host "Coworker URL: http://${ServerLanIp}:$FrontendPort" -ForegroundColor Yellow }
Write-Host 'Demo login: lizhanbo / 123456 (all seed users use 123456; admin123 is obsolete, returns 401, and must not be used for demos).' -ForegroundColor Yellow
Write-Host "Frontend API mode: browser calls relative /api; Vite proxy sends to server $ViteApiTarget." -ForegroundColor Cyan
Write-Host "Database: server PostgreSQL $DbHost : $DbPort / $DbName" -ForegroundColor Cyan
Write-Host "Single source of truth for all ports above: config/env.ps1" -ForegroundColor DarkGray
if (-not $NoPause) { Write-Host "`nPress Enter to close this launcher window. Services keep running." -ForegroundColor Gray; Read-Host }
