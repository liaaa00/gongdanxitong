# -----------------------------------------------------------------------------
# config/env.ps1 —— 端口 / 主机 / 路径的单一事实源（Single Source Of Truth）
# -----------------------------------------------------------------------------
# 用法（在任意根目录脚本里 dot-source 本文件）：
#   . (Join-Path $rootPath 'config\env.ps1')
#
# 约定（治理计划 2026-09-14 §7 Shared Knowledge）：
#   1. 全仓库只有本文件定义端口/主机/路径；其他脚本一律引用这里的变量。
#   2. PowerShell 变量名大小写不敏感，因此脚本里既有的 $backendPort / $dbPort /
#      $nodeDir 等写法会直接命中本文件导出的 $BackendPort / $DbPort / $NodeDir，
#      不需要再写别名赋值。
#   3. 本文件绝不写密码。DB_PASSWORD / JWT_* 仍只存在于 backend/.env（已 gitignore），
#      需要时用 Get-TicketDbPassword 读取。
#   4. 数值来源为 2026-09-14 实测运行态：PostgreSQL 5433、后端 3000、前端 5173。
#   5. Docker / Nginx 生产形态（容器内 postgres:5432、HTTP_PORT=8080）是另一套命名
#      空间，不在本文件定义，见根 .env 与 docker-compose*.yml，不要混用。
#
# 漂移自检：scripts/检查环境口径.ps1（任一文件与本文件口径不一致即非零退出）。
# -----------------------------------------------------------------------------

if (-not $PSScriptRoot) {
    throw 'config/env.ps1 must be dot-sourced from a script file on disk.'
}

# --- 目录 -------------------------------------------------------------------
$ProjectRoot   = Split-Path -Parent $PSScriptRoot
$BackendPath   = Join-Path $ProjectRoot 'backend'
$FrontendPath  = Join-Path $ProjectRoot 'frontend'
$BackendEnvPath = Join-Path $BackendPath '.env'
$BackupDir     = Join-Path $ProjectRoot 'backups\database'

# --- 数据库（本机原生裸跑口径：便携版 PostgreSQL 16 实测监听 5433）----------
$DbHost     = '127.0.0.1'
$DbPort     = 5433
$DbName     = 'ticket_system'
$DbUsername = 'postgres'

# --- 后端 NestJS ------------------------------------------------------------
$BackendHost = '0.0.0.0'
$BackendPort = 3000

# --- 前端 Vite dev server（strictPort：占用即报错，禁止静默漂移）------------
$FrontendHost       = '0.0.0.0'
$FrontendPort       = 5173
$FrontendStrictPort = $true

# --- Node.js 运行时（不在 PATH 中，必须使用绝对路径）------------------------
$NodeDir = 'D:\AI\node-v20.20.2-win-x64'
$NpmCmd  = Join-Path $NodeDir 'npm.cmd'
$NodeExe = Join-Path $NodeDir 'node.exe'

# --- 便携版 PostgreSQL 可执行与数据目录 ------------------------------------
$PgRoot = 'D:\pgsql16portable'
$PgBin  = Join-Path $PgRoot 'pgsql\bin\pg_ctl.exe'
$PgData = Join-Path $PgRoot 'data'
$PgDump = Join-Path $PgRoot 'pgsql\bin\pg_dump.exe'

# --- 就绪等待上限（秒）-----------------------------------------------------
# nest start --watch 在 dist 为空/冷编译时需要编译整个后端（本机实测 >120s），
# 等待上限过短会让"日常启动"在冷启动时误报失败。
$BackendReadyTimeoutSec = 300
$FrontendReadyTimeoutSec = 120

# --- 派生的访问地址 ---------------------------------------------------------
$HealthUrl         = "http://127.0.0.1:$BackendPort/api/health"
$FrontendHealthUrl = "http://127.0.0.1:$FrontendPort"
# Vite dev server 的 /api 代理目标（前端始终走相对路径，浏览器不直连后端）。
$ViteApiTarget = "http://127.0.0.1:$BackendPort"

# --- 环境变量注入（供 NestJS / Vite 子进程读取）-----------------------------
if ($env:PATH -notlike "*$NodeDir*") { $env:PATH = "$NodeDir;$env:PATH" }
$env:HOST = $BackendHost
$env:PORT = [string]$BackendPort
$env:DB_HOST = $DbHost
$env:DB_PORT = [string]$DbPort
$env:DB_USERNAME = $DbUsername
$env:DB_DATABASE = $DbName
# Vite 侧：端口与代理目标只从环境变量派生，避免在 vite.config.ts 里二次硬编码。
$env:VITE_PORT = [string]$FrontendPort
$env:VITE_BACKEND_PORT = [string]$BackendPort
$env:VITE_API_TARGET = $ViteApiTarget
# 前端必须走相对 /api；残留的绝对地址会让同事访问时打到自己的 localhost。
# 用 SetEnvironmentVariable 而非 Remove-Item Env:，避免任何 Remove-Item 包装器干扰。
[Environment]::SetEnvironmentVariable('VITE_API_BASE_URL', $null, [EnvironmentVariableTarget]::Process)

# --- 局域网访问口径 ---------------------------------------------------------
function Get-TicketLanIP {
    $candidate = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
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
        Sort-Object @{ Expression = { if ($_.PrefixOrigin -eq 'Dhcp') { 0 } else { 1 } } }, InterfaceMetric |
        Select-Object -First 1
    if ($candidate) { return $candidate.IPAddress }
    return $null
}

# 可用 TICKET_LAN_IP 显式覆盖（多网卡或演示机固定 IP 时）。
$ServerLanIp = if ($env:TICKET_LAN_IP) { $env:TICKET_LAN_IP } else { Get-TicketLanIP }
if ($ServerLanIp) {
    $LanApiBase      = "http://${ServerLanIp}:$BackendPort/api"
    $LanFrontendBase = "http://${ServerLanIp}:$FrontendPort"
} else {
    $LanApiBase      = "http://<LAN_IP>:$BackendPort/api"
    $LanFrontendBase = "http://<LAN_IP>:$FrontendPort"
}

# --- 密码读取（只读，不落盘、不打印）---------------------------------------
function Get-TicketDbPassword {
    param([string]$EnvFilePath = $BackendEnvPath)
    $fromFile = $null
    if (Test-Path -LiteralPath $EnvFilePath) {
        $fromFile = (Get-Content -LiteralPath $EnvFilePath -Encoding UTF8 |
            Where-Object { $_ -match '^DB_PASSWORD=.+' } |
            Select-Object -First 1) -replace '^DB_PASSWORD=', ''
    }
    if (-not [string]::IsNullOrWhiteSpace($fromFile)) { return $fromFile.Trim() }
    if (-not [string]::IsNullOrWhiteSpace($env:DB_PASSWORD)) { return $env:DB_PASSWORD }
    return 'postgres'
}

function Get-TicketEnvValue {
    param(
        [string]$Key,
        [string]$EnvFilePath = $BackendEnvPath
    )
    if (-not (Test-Path -LiteralPath $EnvFilePath)) { return $null }
    $line = Get-Content -LiteralPath $EnvFilePath -Encoding UTF8 |
        Where-Object { $_ -match "^$([regex]::Escape($Key))=" } |
        Select-Object -First 1
    if ($line) { return ($line -replace "^[^=]+=", '').Trim() }
    return $null
}

# --- 进程环境自愈 -----------------------------------------------------------
# Windows PowerShell 5.1 的 Start-Process 会把当前进程环境拼成 StringDictionary；
# 若环境中存在仅大小写不同的重复键（某些代理/CI 包装会注入 http_proxy + HTTP_PROXY），
# 拼接时直接抛「已添加项。字典中的关键字…」，表现为启动脚本当场失败。
# 这里把这类键按不区分大小写的口径各重写一次，使其在原生环境块里收敛成唯一键，
# 不改变任何变量的值，也不删除空值变量。
function Initialize-TicketProcessEnvironment {
    # 逐个「先移除再写回」：这样仅大小写不同的重复键会被合并成一条，
    # 实测（本机 PowerShell 5.1）环境条目从 69 收敛到 67，Start-Process 恢复正常。
    $snapshot = [Environment]::GetEnvironmentVariables()
    foreach ($name in @($snapshot.Keys)) {
        $value = [Environment]::GetEnvironmentVariable($name)
        if ([string]::IsNullOrEmpty($value)) { continue }
        try {
            [Environment]::SetEnvironmentVariable($name, $null, [EnvironmentVariableTarget]::Process)
            [Environment]::SetEnvironmentVariable($name, $value, [EnvironmentVariableTarget]::Process)
        } catch {}
    }
}
Initialize-TicketProcessEnvironment

# --- 来源信息（仅用于打印；git 不可用时不得阻断启动）-----------------------
function Get-TicketSourceRevision {
    param([string]$RepoPath = $ProjectRoot)
    $gitCmd = Get-Command git -ErrorAction SilentlyContinue
    if (-not $gitCmd) {
        return [pscustomobject]@{ Branch = 'unknown'; Commit = 'unknown'; Dirty = $false; HasGit = $false }
    }
    $branch = (& $gitCmd.Source -C $RepoPath branch --show-current 2>$null | Select-Object -First 1)
    $commit = (& $gitCmd.Source -C $RepoPath rev-parse --short HEAD 2>$null | Select-Object -First 1)
    $dirty = @(& $gitCmd.Source -C $RepoPath status --porcelain --untracked-files=no 2>$null).Count -gt 0
    return [pscustomobject]@{
        Branch  = if ($branch) { $branch.Trim() } else { 'unknown' }
        Commit  = if ($commit) { $commit.Trim() } else { 'unknown' }
        Dirty   = $dirty
        HasGit  = $true
    }
}

# --- 端口占用与就绪工具（各脚本共用，避免各自实现漂移）---------------------
function Get-TicketListeningProcess {
    param([int]$Port)
    return Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1
}

function Test-TicketPortListen {
    param([int]$Port)
    return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Get-TicketPortOwnerLabel {
    param([int]$Port)
    $listen = Get-TicketListeningProcess $Port
    if (-not $listen) { return $null }
    $proc = Get-Process -Id $listen.OwningProcess -ErrorAction SilentlyContinue
    if ($proc) {
        $cmdLine = $null
        try { $cmdLine = (Get-CimInstance Win32_Process -Filter "ProcessId=$($proc.Id)" -ErrorAction Stop).CommandLine } catch {}
        return [pscustomobject]@{
            Port     = $Port
            Pid      = $listen.OwningProcess
            Name     = $proc.ProcessName
            Path     = $proc.Path
            Command  = $cmdLine
            Address  = $listen.LocalAddress
        }
    }
    return [pscustomobject]@{ Port = $Port; Pid = $listen.OwningProcess; Name = 'unknown'; Path = $null; Command = $null; Address = $listen.LocalAddress }
}

function Stop-TicketAppPort {
    # 只释放应用端口对应的监听进程；不触碰 PostgreSQL、不批量杀 node。
    param([int[]]$Ports = @($BackendPort, $FrontendPort))
    foreach ($port in $Ports) {
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
    Start-Sleep -Seconds 2
}

function Wait-TicketHttp200 {
    param([string]$Url, [int]$Seconds = 5)
    $deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
            if ($response.StatusCode -eq 200) { return $true }
        } catch {}
        Start-Sleep -Seconds 1
    }
    return $false
}

# 供 `powershell -File config/env.ps1` 直接执行时打印当前口径（不含密码）。
if ($MyInvocation.InvocationName -eq '.') { return }

Write-Host "ProjectRoot    : $ProjectRoot"
Write-Host "Database       : $DbHost : $DbPort / $DbName (user $DbUsername)"
Write-Host "Backend        : $BackendHost : $BackendPort  health=$HealthUrl"
Write-Host "Frontend dev   : $FrontendHost : $FrontendPort (strictPort=$FrontendStrictPort)  health=$FrontendHealthUrl"
Write-Host "Vite proxy ->  : $ViteApiTarget"
Write-Host "LAN api base   : $LanApiBase"
Write-Host "Node.js        : $NodeDir"
Write-Host "PostgreSQL bin : $PgBin"
Write-Host "PostgreSQL data: $PgData"
