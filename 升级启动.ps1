param(
    [switch]$StartAfterUpgrade,
    [switch]$NoBrowser,
    [switch]$NoPause
)

$ErrorActionPreference = 'Stop'
$rootPath = $PSScriptRoot
# Ports/hosts/paths come ONLY from config/env.ps1.
. (Join-Path $rootPath 'config\env.ps1')

$backupDir = Join-Path $rootPath 'backups\database'

$env:PATH = "$NodeDir;$env:PATH"
$env:HOST = $BackendHost
$env:PORT = [string]$BackendPort
$env:DB_HOST = $DbHost
$env:DB_PORT = [string]$DbPort
$env:DB_USERNAME = $DbUsername
$env:DB_PASSWORD = Get-TicketDbPassword
$env:DB_DATABASE = $DbName
$env:AUTO_SEED = 'false'

function Assert-PathExist([string]$path, [string]$name) {
    if (-not (Test-Path -LiteralPath $path)) { throw "$name not found: $path" }
}
function Assert-PortFree([int]$port, [string]$name) {
    $owner = Get-TicketPortOwnerLabel $port
    if ($owner) {
        throw "$name port $port is already in use by $($owner.Name) PID=$($owner.Pid). Stop it explicitly before upgrade."
    }
}
Assert-PathExist $BackendPath 'Backend directory'
Assert-PathExist $NodeDir 'Node.js directory'
Assert-PathExist $NpmCmd 'npm command'
Assert-PathExist $PgDump 'PostgreSQL pg_dump'
if (-not (Test-TicketPortListen $DbPort)) {
    throw "PostgreSQL is not listening on $DbHost port $DbPort"
}
Assert-PortFree $BackendPort 'Backend'
Assert-PortFree $FrontendPort 'Frontend'

$source = Get-TicketSourceRevision -RepoPath $rootPath
$timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
$backupFile = Join-Path $backupDir ($DbName + "_" + $timestamp + ".dump")
Write-Host "Upgrade source: branch=$($source.Branch) commit=$($source.Commit)"
Write-Host "Database: $DbHost port $DbPort / $DbName"
Write-Host "Backup: $backupFile"
& $PgDump --host=$DbHost --port=$DbPort --username=$DbUsername --format=custom --file=$backupFile $DbName
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed with exit code $LASTEXITCODE" }

Push-Location $BackendPath
try {
    & $NpmCmd run build
    if ($LASTEXITCODE -ne 0) { throw "backend build failed with exit code $LASTEXITCODE" }
    & $NpmCmd run migration:run
    if ($LASTEXITCODE -ne 0) { throw "migration:run failed with exit code $LASTEXITCODE" }
    & $NpmCmd run seed
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
