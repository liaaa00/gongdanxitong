[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[A-Za-z0-9.-]+$')]
  [string]$PublicHostname,

  [Parameter(Mandatory = $true)]
  [string]$TlsCertFile,

  [Parameter(Mandatory = $true)]
  [string]$TlsKeyFile,

  [string]$DatabaseName = 'ticket_system',
  [string]$DatabaseUser = 'ticket_app',
  [string]$OutputPath = '.env.production',
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

function New-RandomBytes {
  param([int]$ByteCount)

  $bytes = New-Object byte[] $ByteCount
  $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $generator.GetBytes($bytes)
  } finally {
    $generator.Dispose()
  }

  return ,$bytes
}

function New-RandomSecret {
  param([int]$ByteCount = 64)

  return [Convert]::ToBase64String((New-RandomBytes -ByteCount $ByteCount))
}

function Assert-SingleLineValue {
  param([string]$Name, [string]$Value)

  if ([string]::IsNullOrWhiteSpace($Value) -or $Value.Contains("`r") -or $Value.Contains("`n")) {
    throw "$Name must be a non-empty single-line value"
  }
}

Assert-SingleLineValue -Name 'PublicHostname' -Value $PublicHostname
Assert-SingleLineValue -Name 'TlsCertFile' -Value $TlsCertFile
Assert-SingleLineValue -Name 'TlsKeyFile' -Value $TlsKeyFile
Assert-SingleLineValue -Name 'DatabaseName' -Value $DatabaseName
Assert-SingleLineValue -Name 'DatabaseUser' -Value $DatabaseUser

$resolvedOutput = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $OutputPath))
if ((Test-Path -LiteralPath $resolvedOutput) -and -not $Force) {
  throw "Output already exists: $resolvedOutput. Use -Force to replace it."
}

$jwtSecret = -join (
  (New-RandomBytes -ByteCount 32) | ForEach-Object { $_.ToString('x2') }
)
$jwtRefreshSecret = -join (
  (New-RandomBytes -ByteCount 32) | ForEach-Object { $_.ToString('x2') }
)
$databasePassword = -join (
  (New-RandomBytes -ByteCount 32) | ForEach-Object { $_.ToString('x2') }
)
$redisPassword = -join (
  (New-RandomBytes -ByteCount 32) | ForEach-Object { $_.ToString('x2') }
)
$grafanaPassword = New-RandomSecret -ByteCount 32

$lines = @(
  'NODE_ENV=production'
  'TZ=Asia/Shanghai'
  "PUBLIC_HOSTNAME=$PublicHostname"
  'HTTP_BIND_ADDRESS=0.0.0.0'
  'HTTP_PORT=80'
  'HTTPS_BIND_ADDRESS=0.0.0.0'
  'HTTPS_PORT=443'
  "TLS_CERT_FILE=$TlsCertFile"
  "TLS_KEY_FILE=$TlsKeyFile"
  'POSTGRES_BIND_ADDRESS=127.0.0.1'
  'POSTGRES_PORT=5432'
  "POSTGRES_DB=$DatabaseName"
  "POSTGRES_USER=$DatabaseUser"
  "POSTGRES_PASSWORD=$databasePassword"
  'DB_SCHEMA=public'
  "REDIS_PASSWORD=$redisPassword"
  'REDIS_KEY_PREFIX=ticket-system:'
  "JWT_SECRET=$jwtSecret"
  "JWT_REFRESH_SECRET=$jwtRefreshSecret"
  'JWT_EXPIRES_IN=2h'
  'JWT_REFRESH_EXPIRES_IN=7d'
  'AUTO_SEED=false'
  'DB_LOGGING=false'
  'BCRYPT_ROUNDS=12'
  'BCRYPT_SALT_ROUNDS=12'
  'UPLOAD_DIR=/app/uploads'
  'MAX_IMPORT_SIZE_MB=10'
  'MAX_ATTACHMENT_SIZE_MB=20'
  'AI_PROVIDER=openai'
  'AI_API_KEY='
  'AI_BASE_URL=https://api.openai.com/v1'
  'AI_MODEL=gpt-4o-mini'
  'PROMETHEUS_BIND_ADDRESS=127.0.0.1'
  'PROMETHEUS_PORT=9090'
  'PROMETHEUS_RETENTION=30d'
  'GRAFANA_BIND_ADDRESS=127.0.0.1'
  'GRAFANA_PORT=3001'
  "GRAFANA_ROOT_URL=https://$PublicHostname/grafana/"
  'GRAFANA_ADMIN_USER=admin'
  "GRAFANA_ADMIN_PASSWORD=$grafanaPassword"
)

[System.IO.File]::WriteAllLines(
  $resolvedOutput,
  $lines,
  [System.Text.UTF8Encoding]::new($false)
)

if ($IsLinux -or $IsMacOS) {
  & chmod 600 $resolvedOutput
  if ($LASTEXITCODE -ne 0) {
    throw 'Failed to set restrictive permissions on the generated environment file'
  }
}

Write-Host "Production environment written to $resolvedOutput"
Write-Host 'Secrets were generated with a cryptographic random number generator and were not printed.'
Write-Host 'JWT values are 32-byte hexadecimal secrets equivalent to: openssl rand -hex 32'
