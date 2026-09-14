# -----------------------------------------------------------------------------
# scripts/check-env-ports.ps1  (display name: 检查环境口径.ps1)
# -----------------------------------------------------------------------------
# Static guard for the "single source of truth" refactor (governance phase 0).
# It parses config/env.ps1, then scans every startup script, backend/.env*,
# frontend/vite.config.ts and the architecture doc for port declarations.
# Any drift -> non-zero exit code.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\检查环境口径.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\检查环境口径.ps1 -Live
#     (-Live additionally checks the real LISTENING ports of this machine)
#
# Messages are ASCII-only on purpose: Windows PowerShell 5.1 must render this
# report correctly regardless of the console code page.
# -----------------------------------------------------------------------------
[CmdletBinding()]
param(
    [switch]$Live
)

$ErrorActionPreference = 'Stop'
try {
    chcp 65001 > $null
    [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
} catch {}

$RepoRoot = Split-Path -Parent $PSScriptRoot
$EnvFile = Join-Path $RepoRoot 'config\env.ps1'

if (-not (Test-Path -LiteralPath $EnvFile)) {
    Write-Host "[FAIL] single source of truth not found: $EnvFile" -ForegroundColor Red
    exit 2
}

$problems = New-Object System.Collections.Generic.List[string]
$checked = 0

function Add-Problem([string]$message) { $script:problems.Add($message) }
function Write-Ok([string]$message) { $script:checked++; Write-Host "  OK   $message" -ForegroundColor Green }
function Write-Bad([string]$message) { Add-Problem $message; Write-Host "  FAIL $message" -ForegroundColor Red }

# --- 1. Load the single source of truth -------------------------------------
. $EnvFile

$canonical = [ordered]@{
    DbPort       = [int]$DbPort
    BackendPort  = [int]$BackendPort
    FrontendPort = [int]$FrontendPort
}

Write-Host '=== config/env.ps1 (single source of truth) ===' -ForegroundColor Cyan
Write-Host ("  database={0}:{1}/{2}  backend={3}:{4}  frontend={5}:{6} (strictPort={7})" -f `
        $DbHost, $DbPort, $DbName, $BackendHost, $BackendPort, $FrontendHost, $FrontendPort, $FrontendStrictPort)
foreach ($key in @('DbPort', 'BackendPort', 'FrontendPort')) {
    if ($canonical[$key] -le 0 -or $canonical[$key] -gt 65535) { Write-Bad "config/env.ps1 $key is not a valid port: $($canonical[$key])" }
}
if ((Get-Content -LiteralPath $EnvFile -Encoding UTF8 | Where-Object { $_ -match '^\s*\$(?:Db)?Password\s*=\s*.{3}' } | Measure-Object).Count -gt 0) {
    Write-Bad 'config/env.ps1 must not contain a literal password'
} else {
    Write-Ok 'config/env.ps1 defines ports only, no password literals'
}

# --- 2. Startup scripts must delegate to env.ps1 and hold no port literals ---
Write-Host "`n=== startup/stop scripts ===" -ForegroundColor Cyan
$startupScripts = @('日常启动.ps1', '快速启动.ps1', '局域网启动.ps1', '升级启动.ps1', '停止系统.ps1', '启动系统.ps1')
$portLiteralPattern = '\b(3000|3001|5173|5174|5178|5432|5433|8080)\b'

foreach ($name in $startupScripts) {
    $path = Join-Path $RepoRoot $name
    if (-not (Test-Path -LiteralPath $path)) { Write-Bad "missing script: $name"; continue }
    $lines = Get-Content -LiteralPath $path -Encoding UTF8

    # 2a. dot-source check (启动系统.ps1 only delegates, so delegation is enough)
    $delegates = ($lines | Where-Object { $_ -match "config\\env\.ps1" -and $_ -match '^\s*\.' } | Measure-Object).Count -gt 0
    $delegatesToScript = ($lines | Where-Object { $_ -match '局域网启动\.ps1|日常启动\.ps1' } | Measure-Object).Count -gt 0
    if (-not $delegates -and -not $delegatesToScript) {
        Write-Bad "$name neither dot-sources config/env.ps1 nor delegates to a script that does"
    }

    # 2b. hardcoded port literals outside comments
    $hits = @()
    for ($i = 0; $i -lt $lines.Count; $i++) {
        $line = $lines[$i]
        $code = ($line -replace '#.*$', '')
        if ($code -match $portLiteralPattern) { $hits += "line $($i + 1): $($line.Trim())" }
    }
    if ($hits.Count -gt 0) {
        Write-Bad "$name still hardcodes port values -> $($hits -join ' ; ')"
    } elseif ($delegates) {
        Write-Ok "$name reads ports only from config/env.ps1"
    } else {
        Write-Ok "$name has no port literals (delegates to another script)"
    }
}

# --- 3. backend/.env and .env.example ---------------------------------------
Write-Host "`n=== backend env files ===" -ForegroundColor Cyan
$envTargets = @(
    [pscustomobject]@{ Name = 'backend/.env'; Required = $true },
    [pscustomobject]@{ Name = 'backend/.env.example'; Required = $true }
)
foreach ($target in $envTargets) {
    $path = Join-Path $RepoRoot ($target.Name -replace '/', '\')
    if (-not (Test-Path -LiteralPath $path)) {
        if ($target.Required) { Write-Bad "$($target.Name) not found" }
        continue
    }
    $map = @{}
    Get-Content -LiteralPath $path -Encoding UTF8 | ForEach-Object {
        if ($_ -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)$') { $map[$matches[1]] = $matches[2].Trim() }
    }
    if (-not $map.ContainsKey('PORT')) { Write-Bad "$($target.Name) has no PORT declaration" }
    elseif ([int]$map['PORT'] -ne $BackendPort) { Write-Bad "$($target.Name) PORT=$($map['PORT']) but config/env.ps1 BackendPort=$BackendPort" }
    elseif ($map['PORT'] -match '^\s*$') { Write-Bad "$($target.Name) PORT is empty" }

    if (-not $map.ContainsKey('DB_PORT')) { Write-Bad "$($target.Name) has no DB_PORT declaration" }
    elseif ($map['DB_PORT'] -ne [string]$DbPort) { Write-Bad "$($target.Name) DB_PORT=$($map['DB_PORT']) but config/env.ps1 DbPort=$DbPort" }

    if ($map.ContainsKey('DB_HOST') -and $map['DB_HOST'] -ne $DbHost) { Write-Bad "$($target.Name) DB_HOST=$($map['DB_HOST']) but config/env.ps1 DbHost=$DbHost" }
    if ($map.ContainsKey('DB_DATABASE') -and $map['DB_DATABASE'] -ne $DbName) { Write-Bad "$($target.Name) DB_DATABASE=$($map['DB_DATABASE']) but config/env.ps1 DbName=$DbName" }
    Write-Ok "$($target.Name): PORT=$($map['PORT']) DB_PORT=$($map['DB_PORT']) DB_HOST=$($map['DB_HOST'])"
}

# --- 4. frontend/vite.config.ts ---------------------------------------------
Write-Host "`n=== frontend/vite.config.ts ===" -ForegroundColor Cyan
$vitePath = Join-Path $RepoRoot 'frontend\vite.config.ts'
if (-not (Test-Path -LiteralPath $vitePath)) {
    Write-Bad 'frontend/vite.config.ts not found'
} else {
    $vite = Get-Content -LiteralPath $vitePath -Encoding UTF8 -Raw
    if ($vite -notmatch 'strictPort\s*:\s*true') { Write-Bad 'vite.config.ts must set strictPort: true (no silent port drift)' }
    else { Write-Ok 'vite.config.ts sets strictPort: true' }

    if ($vite -notmatch 'VITE_PORT') { Write-Bad 'vite.config.ts must derive the dev port from VITE_PORT (injected by config/env.ps1)' }
    else { Write-Ok 'vite.config.ts reads VITE_PORT from the environment' }

    if ($vite -notmatch 'VITE_BACKEND_PORT|VITE_API_TARGET') { Write-Bad 'vite.config.ts must derive the proxy target from VITE_BACKEND_PORT / VITE_API_TARGET' }
    else { Write-Ok 'vite.config.ts reads the proxy target from the environment' }

    # literal ports in vite.config.ts must equal the canonical fallbacks
    foreach ($m in [regex]::Matches($vite, '\?\?\s*(\d{4})')) {
        $value = [int]$m.Groups[1].Value
        if ($value -notin @($BackendPort, $FrontendPort)) { Write-Bad "vite.config.ts fallback literal $value is not BackendPort/FrontendPort ($BackendPort/$FrontendPort)" }
    }
}

# --- 5. architecture doc -----------------------------------------------------
Write-Host "`n=== 架构设计文档.md port section ===" -ForegroundColor Cyan
$docPath = Join-Path $RepoRoot '架构设计文档.md'
if (-not (Test-Path -LiteralPath $docPath)) {
    Write-Bad '架构设计文档.md not found'
} else {
    $docLines = Get-Content -LiteralPath $docPath -Encoding UTF8
    $exemptPattern = 'Docker|docker|生产形态|容器|nginx|Nginx|HTTP_PORT|8080|8080|豁免|分区'
    $badDbRefs = @()
    for ($i = 0; $i -lt $docLines.Count; $i++) {
        $line = $docLines[$i]
        if ($line -notmatch '5432') { continue }
        if ($line -match $exemptPattern) { continue }
        $badDbRefs += "line $($i + 1): $($line.Trim())"
    }
    if ($badDbRefs.Count -gt 0) { Write-Bad "架构设计文档.md declares PostgreSQL 5432 outside the Docker section -> $($badDbRefs -join ' ; ')" }
    else { Write-Ok '架构设计文档.md has no bare 5432 claim (Docker form is explicitly exempted)' }

    if ($docLines -join "`n" -notmatch '5433') { Write-Bad '架构设计文档.md must state the real PostgreSQL port 5433' }
    else { Write-Ok '架构设计文档.md states the real PostgreSQL port' }

    if ($docLines -join "`n" -notmatch 'config/env\.ps1') { Write-Bad '架构设计文档.md must name config/env.ps1 as the single source of truth' }
    else { Write-Ok '架构设计文档.md names config/env.ps1 as the source of truth' }

    if ($docLines -join "`n" -notmatch 'strictPort') { Write-Bad '架构设计文档.md must document strictPort behaviour for 5173' }
    else { Write-Ok '架构设计文档.md documents strictPort' }
}

# --- 6. optional live check --------------------------------------------------
if ($Live) {
    Write-Host "`n=== live listeners ===" -ForegroundColor Cyan
    $expected = @(
        [pscustomobject]@{ Name = 'backend'; Port = $BackendPort; Url = $HealthUrl },
        [pscustomobject]@{ Name = 'frontend'; Port = $FrontendPort; Url = $FrontendHealthUrl },
        [pscustomobject]@{ Name = 'postgresql'; Port = $DbPort; Url = $null }
    )
    foreach ($svc in $expected) {
        $listen = Get-TicketListeningProcess $svc.Port
        if (-not $listen) { Write-Bad ("live: {0} is not listening on port {1}" -f $svc.Name, $svc.Port); continue }
        if ($svc.Url) {
            if (-not (Wait-TicketHttp200 $svc.Url 8)) { Write-Bad ("live: {0} listens on {1} but {2} did not return HTTP 200" -f $svc.Name, $svc.Port, $svc.Url); continue }
        }
        Write-Ok ("live: {0} on port {1} (PID {2})" -f $svc.Name, $svc.Port, $listen.OwningProcess)
    }
    $drift = @()
    foreach ($stray in @(3001, 5178)) {
        if (Get-TicketListeningProcess $stray) { $drift += $stray }
    }
    if ($drift.Count -gt 0) { Write-Bad "live: legacy/drifted ports still in use: $($drift -join ', ')" }
    else { Write-Ok 'live: no drifted listeners (3001/5178 are free)' }
}

# --- verdict -----------------------------------------------------------------
Write-Host ''
if ($problems.Count -eq 0) {
    Write-Host "PORT CONSISTENCY PASSED ($checked checks) - single source: config/env.ps1" -ForegroundColor Green
    exit 0
}
Write-Host "PORT CONSISTENCY FAILED ($($problems.Count) problem(s)):" -ForegroundColor Red
foreach ($p in $problems) { Write-Host "  - $p" -ForegroundColor Red }
Write-Host 'Fix the files above, or update config/env.ps1 once deliberately, then re-run this script.' -ForegroundColor Yellow
exit 1
