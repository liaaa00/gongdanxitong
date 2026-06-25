param(
    [switch]$StopPostgres
)

# Ticket System stop script. Stops app ports and Node processes, keeps PostgreSQL by default.
$ErrorActionPreference = 'Continue'
$nodeDir = 'D:\AI\node-v20.20.2-win-x64'
$pgBin = 'D:\pgsql16portable\pgsql\bin\pg_ctl.exe'
$pgData = 'D:\pgsql16portable\data'
$ports = @(3000, 5173)

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

Write-Host '========================================' -ForegroundColor Cyan
Write-Host '  Ticket System stopping...' -ForegroundColor Cyan
Write-Host '========================================' -ForegroundColor Cyan

Write-Host "`n[1/2] Stop backend/frontend ports and Node processes..." -ForegroundColor Yellow
foreach ($port in $ports) { Stop-PortProcess $port }

$nodeProcesses = Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object {
    ($_.Path -and ($_.Path -like "$nodeDir*" -or $_.Path -like '*\node.exe'))
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
    Write-Host '  Ports 3000/5173 are free.' -ForegroundColor Green
}

Write-Host "`n[2/2] PostgreSQL..." -ForegroundColor Yellow
if ($StopPostgres) {
    if (Test-Path -LiteralPath $pgBin) {
        & $pgBin stop -D $pgData -m fast
        Write-Host '  PostgreSQL stopped.' -ForegroundColor Green
    } else {
        Write-Host "  pg_ctl not found: $pgBin" -ForegroundColor Gray
    }
} else {
    Write-Host '  PostgreSQL kept running to preserve shared server database access.' -ForegroundColor Green
}

Write-Host "`nApplication services stopped." -ForegroundColor Green
Write-Host 'Press Enter to close this window...' -ForegroundColor Gray
Read-Host
