param(
    [switch]$NoBrowser,
    [switch]$NoPause,
    [switch]$Restart
)

try {
    chcp 65001 > $null
    [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
} catch {}

$ErrorActionPreference = 'Stop'
$rootPath = $PSScriptRoot

# 端口/主机/路径的唯一事实源：config/env.ps1（禁止在本文件硬编码 3000/5173/5433）
. (Join-Path $rootPath 'config\env.ps1')

# 日常启动只跑当前源码：不迁移、不种子（见 docs/业务规则回归清单.md 第 33 节）
$env:AUTO_SEED = 'false'
$env:DB_PASSWORD = Get-TicketDbPassword

function Assert-PathExist([string]$path, [string]$name) {
    if (-not (Test-Path -LiteralPath $path)) { throw "$name not found: $path" }
}
function Get-ReadyProcess([int]$port, [string]$url, [string]$name) {
    $listen = Get-TicketListeningProcess $port
    if (-not $listen) { return $null }
    if (Wait-TicketHttp200 $url 5) { return $listen.OwningProcess }
    $owner = Get-TicketPortOwnerLabel $port
    throw "$name port $port is occupied by $($owner.Name) PID=$($owner.Pid) but health check failed. Stop that service explicitly, then retry. See docs/AI修改前必读.md for how to locate the owner."
}
function Report-PortOwner([int]$port) {
    $owner = Get-TicketPortOwnerLabel $port
    if ($owner) {
        Write-Host "  Port $port is held by $($owner.Name) PID=$($owner.Pid) on $($owner.Address)" -ForegroundColor Yellow
        if ($owner.Path) { Write-Host "    executable: $($owner.Path)" -ForegroundColor DarkGray }
        if ($owner.Command) { Write-Host "    command   : $($owner.Command)" -ForegroundColor DarkGray }
    } else {
        Write-Host "  Port $port is free." -ForegroundColor Gray
    }
}

function Stop-ProjectNodeProcesses {
    # Same semantics as 停止系统.ps1: free the app ports, then drop project-owned
    # node processes (nest watcher / vite) so no orphan watcher respawns later.
    Stop-TicketAppPort -Ports @($BackendPort, $FrontendPort)
    $nodes = Get-Process -Name node -ErrorAction SilentlyContinue
    foreach ($node in $nodes) {
        $cmd = $null
        try { $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$($node.Id)" -ErrorAction Stop).CommandLine } catch {}
        $isProjectNode = $false
        if ($cmd -and ($cmd -like "*$rootPath*" -or $cmd -like '*dist\main.js*' -or $cmd -like '*dist\main *' -or $cmd -like '*vite*')) { $isProjectNode = $true }
        if (-not $cmd -and $node.Path -and $node.Path -like "$NodeDir*") { $isProjectNode = $true }
        if ($isProjectNode) {
            try { Write-Host "  Stop project Node PID=$($node.Id)" -ForegroundColor Gray; Stop-Process -Id $node.Id -Force -ErrorAction Stop }
            catch { Write-Host "  Node PID=$($node.Id) already stopped or cannot stop: $($_.Exception.Message)" -ForegroundColor DarkYellow }
        }
    }
    Start-Sleep -Seconds 2
}

Assert-PathExist $BackendPath 'Backend directory'
Assert-PathExist $FrontendPath 'Frontend directory'
Assert-PathExist $NodeDir 'Node.js directory'
Assert-PathExist $NpmCmd 'npm command'
if (-not (Get-TicketListeningProcess $DbPort)) {
    throw "PostgreSQL is not listening on $DbHost port $DbPort. Start the portable PostgreSQL or run 升级启动.ps1 first."
}

if ($Restart) {
    Write-Host 'Mode: restart requested, stopping current backend/frontend services first.' -ForegroundColor Yellow
    Stop-ProjectNodeProcesses
    if (Test-TicketPortListen $BackendPort) { Report-PortOwner $BackendPort; throw "Backend port $BackendPort is still listening after restart cleanup." }
    if (Test-TicketPortListen $FrontendPort) { Report-PortOwner $FrontendPort; throw "Frontend port $FrontendPort is still listening after restart cleanup." }
}

$backendPid = Get-ReadyProcess $BackendPort $HealthUrl 'Backend'
$frontendPid = Get-ReadyProcess $FrontendPort $FrontendHealthUrl 'Frontend'

$source = Get-TicketSourceRevision -RepoPath $rootPath
Write-Host "Source: branch=$($source.Branch) commit=$($source.Commit) dirty=$($source.Dirty)"
Write-Host "Database: $DbHost port $DbPort / $DbName"
Write-Host 'Mode: daily source start; migrations and seed are disabled.'

$backendOut = Join-Path $rootPath 'backend-run.out.log'
$backendErr = Join-Path $rootPath 'backend-run.err.log'
if ($null -eq $backendPid) {
    Start-Process -FilePath $NpmCmd -ArgumentList @('run', 'start:dev') -WorkingDirectory $BackendPath -PassThru -WindowStyle Hidden -RedirectStandardOutput $backendOut -RedirectStandardError $backendErr | Out-Null
    if (-not (Wait-TicketHttp200 $HealthUrl $BackendReadyTimeoutSec)) {
        Report-PortOwner $BackendPort
        throw "Backend did not become ready on port $BackendPort. See $backendErr"
    }
    $backendPid = (Get-TicketListeningProcess $BackendPort).OwningProcess
} else {
    Write-Host "Backend already healthy; reusing PID=$backendPid"
}

$frontendOut = Join-Path $rootPath 'frontend-run.out.log'
$frontendErr = Join-Path $rootPath 'frontend-run.err.log'
if ($null -eq $frontendPid) {
    Start-Process -FilePath $NpmCmd -ArgumentList @('run', 'dev', '--', '--host', $FrontendHost, '--port', [string]$FrontendPort, '--strictPort') -WorkingDirectory $FrontendPath -PassThru -WindowStyle Hidden -RedirectStandardOutput $frontendOut -RedirectStandardError $frontendErr | Out-Null
    if (-not (Wait-TicketHttp200 $FrontendHealthUrl $FrontendReadyTimeoutSec)) {
        Report-PortOwner $FrontendPort
        throw "Frontend did not become ready on port $FrontendPort (strictPort is on, so Vite exits instead of drifting). See $frontendErr"
    }
    $frontendPid = (Get-TicketListeningProcess $FrontendPort).OwningProcess
} else {
    Write-Host "Frontend already healthy; reusing PID=$frontendPid"
}
$launchUrl = "http://localhost:$FrontendPort/?source=$([uri]::EscapeDataString("$($source.Commit)-$(Get-Date -Format 'yyyyMMddHHmmss')"))"
if (-not $NoBrowser) { Start-Process $launchUrl }
Write-Host "Started: backend PID=$backendPid frontend PID=$frontendPid"
Write-Host "Frontend: http://localhost:$FrontendPort"
Write-Host "Backend health: $HealthUrl"
if ($ServerLanIp) { Write-Host "LAN: http://${ServerLanIp}:$FrontendPort" }
Write-Host 'No database migration or seed was run. Use 升级启动.ps1 for an explicit upgrade.'
if (-not $NoPause) { Read-Host 'Press Enter to close this launcher window; services keep running' }
