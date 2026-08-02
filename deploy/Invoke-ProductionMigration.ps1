[CmdletBinding()]
param(
  [string]$EnvFile = '.env.production',
  [string]$BackupDirectory = 'backups',
  [switch]$RunSeed,
  [switch]$ImportLegacyPermissions,
  [string]$PermissionConfigVersion = '1.0.0-legacy.20260802'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$resolvedEnv = [System.IO.Path]::GetFullPath((Join-Path $root $EnvFile))
$resolvedBackupDirectory = [System.IO.Path]::GetFullPath((Join-Path $root $BackupDirectory))
$baseCompose = Join-Path $root 'docker-compose.yml'
$productionCompose = Join-Path $root 'docker-compose.production.yml'

if (-not (Test-Path -LiteralPath $resolvedEnv -PathType Leaf)) {
  throw "Production environment file not found: $resolvedEnv"
}

New-Item -ItemType Directory -Force -Path $resolvedBackupDirectory | Out-Null

$composeArgs = @(
  'compose',
  '--project-name', 'ticket-system',
  '--env-file', $resolvedEnv,
  '-f', $baseCompose,
  '-f', $productionCompose
)

function Invoke-DockerCompose {
  param([string[]]$Arguments)

  & docker @composeArgs @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "docker compose failed: $($Arguments -join ' ')"
  }
}

Write-Host '[1/5] Validating production Compose configuration'
Invoke-DockerCompose -Arguments @('config', '--quiet')

Write-Host '[2/5] Ensuring PostgreSQL is healthy'
Invoke-DockerCompose -Arguments @('up', '-d', '--wait', 'postgres')

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$containerBackup = "/tmp/ticket-system-$timestamp.dump"
$localBackup = Join-Path $resolvedBackupDirectory "ticket-system-$timestamp.dump"

Write-Host '[3/5] Creating a pre-migration PostgreSQL backup'
Invoke-DockerCompose -Arguments @(
  'exec', '-T', 'postgres', 'sh', '-c',
  "PGPASSWORD=`"`$POSTGRES_PASSWORD`" pg_dump -U `"`$POSTGRES_USER`" -d `"`$POSTGRES_DB`" --format=custom --file=$containerBackup"
)

$postgresContainer = (& docker @composeArgs 'ps' '-q' 'postgres').Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($postgresContainer)) {
  throw 'Unable to resolve the PostgreSQL container ID'
}

& docker cp "${postgresContainer}:$containerBackup" $localBackup
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $localBackup)) {
  throw 'Failed to copy the pre-migration backup to the host'
}

if ((Get-Item -LiteralPath $localBackup).Length -eq 0) {
  throw "Backup is empty: $localBackup"
}

Write-Host '[4/5] Running TypeORM migrations'
Invoke-DockerCompose -Arguments @('run', '--rm', '--no-deps', '--build', 'backend', 'npm', 'run', 'migration:run')

if ($RunSeed) {
  Write-Host 'Running idempotent production seeds because -RunSeed was specified'
  Invoke-DockerCompose -Arguments @('run', '--rm', '--no-deps', 'backend', 'npm', 'run', 'seed')
}

if ($ImportLegacyPermissions) {
  Write-Host "Importing legacy permissions as version $PermissionConfigVersion"
  Invoke-DockerCompose -Arguments @(
    'run', '--rm', '--no-deps', 'backend',
    'npm', 'run', 'permission:migrate-legacy', '--',
    '--version', $PermissionConfigVersion, '--activate'
  )
}

Write-Host '[5/5] Starting the application services'
Invoke-DockerCompose -Arguments @('up', '-d', '--build', 'backend', 'frontend', 'nginx', 'redis', 'prometheus', 'grafana')
Invoke-DockerCompose -Arguments @('ps')

Write-Host "Migration completed. Pre-migration backup: $localBackup"
