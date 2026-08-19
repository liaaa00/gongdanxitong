param(
    [switch]$StartAfterUpgrade,
    [switch]$NoBrowser,
    [switch]$NoPause
)

$ErrorActionPreference = 'Stop'
$rootPath = $PSScriptRoot
$backendPath = Join-Path $rootPath 'backend'
$nodeDir = 'D:\AI\node-v20.20.2-win-x64'
$npmCmd = Join-Path $nodeDir 'npm.cmd'
$pgDump = 'D:\pgsql16portable\pgsql\bin\pg_dump.exe'
$dbHost = '127.0.0.1'
$dbPort = 5433
$dbName = 'ticket_system'
$backupDir = Join-Path $rootPath 'backups\database'
$backendPort = 3000
$frontendPort = 5173

$env:PATH = "$nodeDir;$env:PATH"
$env:DB_HOST = $dbHost
$env:DB_PORT = [string]$dbPort
$env:DB_USERNAME = 'postgres'
$env:DB_PASSWORD = 'postgres'
$env:DB_DATABASE = $dbName
$env:AUTO_SEED = 'false'

function Assert-Path([string]$path, [string]$name) {
    if (-not (Test-Path -LiteralPath $path)) { throw "$name not found: $path" }
}
function Assert-PortFree([int]$port, [string]$name) {
    $listen = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($listen) {
        $proc = Get-Process -Id $listen.OwningProcess -ErrorAction SilentlyContinue
        $label = if ($proc) { "$($proc.ProcessName) PID=$($proc.Id)" } else { "PID=$($listen.OwningProcess)" }
        throw "$name port $port is already in use by $label. Stop it explicitly before upgrade."
    }
}
Assert-Path $backendPath 'Backend directory'
Assert-Path $nodeDir 'Node.js directory'
Assert-Path $npmCmd 'npm command'
Assert-Path $pgDump 'PostgreSQL pg_dump'
if (-not (Get-NetTCPConnection -LocalPort $dbPort -State Listen -ErrorAction SilentlyContinue)) {
    throw "PostgreSQL is not listening on $dbHost port $dbPort"
}
Assert-PortFree $backendPort 'Backend'
Assert-PortFree $frontendPort 'Frontend'

$branch = (& git -C $rootPath branch --show-current 2>$null | Select-Object -First 1)
$commit = (& git -C $rootPath rev-parse --short HEAD 2>$null | Select-Object -First 1)
$timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
$backupFile = Join-Path $backupDir ("ticket_system_" + $timestamp + ".dump")
Write-Host "Upgrade source: branch=$branch commit=$commit"
Write-Host "Database: $dbHost port $dbPort / $dbName"
Write-Host "Backup: $backupFile"
& $pgDump --host=$dbHost --port=$dbPort --username=postgres --format=custom --file=$backupFile $dbName
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed with exit code $LASTEXITCODE" }

Push-Location $backendPath
try {
    & $npmCmd run build
    if ($LASTEXITCODE -ne 0) { throw "backend build failed with exit code $LASTEXITCODE" }
    & $npmCmd run migration:run
    if ($LASTEXITCODE -ne 0) { throw "migration:run failed with exit code $LASTEXITCODE" }
    & $npmCmd run seed
    if ($LASTEXITCODE -ne 0) { throw "seed failed with exit code $LASTEXITCODE" }
} finally {
    Pop-Location
}
Write-Host "Upgrade completed. Backup retained at $backupFile"
if ($StartAfterUpgrade) {
    $quickName = [string]::Concat([char]0x5feb, [char]0x901f, [char]0x542f, [char]0x52a8, '.ps1')
    & (Join-Path $rootPath $quickName) -NoBrowser:$NoBrowser -NoPause:$NoPause
} else {
    Write-Host 'Services were not started. Run 快速启动.ps1 to start the current source.'
}
