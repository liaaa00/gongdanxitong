param(
    [switch]$StopPostgres
)

# Ticket System stop script. Stops app ports and Node processes, keeps PostgreSQL by default.
# Ports/paths come ONLY from config/env.ps1.
$ErrorActionPreference = 'Continue'
$rootPath = $PSScriptRoot
. (Join-Path $rootPath 'config\env.ps1')

$ports = @($BackendPort, $FrontendPort)

Write-Host '========================================' -ForegroundColor Cyan
Write-Host '  Ticket System stopping...' -ForegroundColor Cyan
Write-Host '========================================' -ForegroundColor Cyan

Write-Host "`n[1/2] Stop backend/frontend ports and Node processes..." -ForegroundColor Yellow
Stop-TicketAppPort -Ports $ports

$nodeProcesses = Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object {
    ($_.Path -and ($_.Path -like "$NodeDir*" -or $_.Path -like '*\node.exe'))
}
if ($nodeProcesses) {
    foreach ($proc in $nodeProcesses) {
        try {
            Stop-Process -Id $proc.Id -Force -ErrorAction Stop
            Write-Host "  Stopped Node PID=$($proc.Id)" -ForegroundColor Green
        } catch {
            Write-Host "  Node PID=$($proc.Id) already stopped or cannot stop: $($_.Exception.Message)" -ForegroundColor DarkYellow
        }
    }
} else {
    Write-Host '  No Node process found.' -ForegroundColor Gray
}

Start-Sleep -Seconds 2
$leftListen = Get-NetTCPConnection -LocalPort $ports -State Listen -ErrorAction SilentlyContinue
if ($leftListen) {
    Write-Host '  Warning: some ports are still listening:' -ForegroundColor Yellow
    $leftListen | Select-Object LocalAddress, LocalPort, State, OwningProcess | Format-Table -AutoSize
} else {
    Write-Host "  Ports $BackendPort/$FrontendPort are free." -ForegroundColor Green
}

Write-Host "`n[2/2] PostgreSQL ($DbHost : $DbPort)..." -ForegroundColor Yellow
if ($StopPostgres) {
    if (Test-Path -LiteralPath $PgBin) {
        & $PgBin stop -D $PgData -m fast
        Write-Host '  PostgreSQL stopped.' -ForegroundColor Green
    } else {
        Write-Host "  pg_ctl not found: $PgBin" -ForegroundColor Gray
    }
} else {
    Write-Host '  PostgreSQL kept running to preserve shared server database access.' -ForegroundColor Green
}

Write-Host "`nApplication services stopped." -ForegroundColor Green
Write-Host 'Press Enter to close this window...' -ForegroundColor Gray
Read-Host
