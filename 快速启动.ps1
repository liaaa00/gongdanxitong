param(
    [switch]$NoBrowser,
    [switch]$NoPause,
    [switch]$Restart = $true
)

# Thin wrapper over 日常启动.ps1. Do not define ports here; see config/env.ps1.
$ErrorActionPreference = 'Stop'
$dailyName = [string]::Concat([char]0x65e5, [char]0x5e38, [char]0x542f, [char]0x52a8, '.ps1')
$dailyPath = Join-Path $PSScriptRoot $dailyName

if (-not (Test-Path -LiteralPath $dailyPath)) {
    throw "Startup script not found: $dailyPath"
}

try {
    # 修复 G3：之前向 日常启动.ps1 透传它未声明的 -Restart 会直接抛参数绑定错误。
    & $dailyPath -NoBrowser:$NoBrowser -NoPause:$NoPause -Restart:$Restart
    exit 0
} catch {
    Write-Host ''
    Write-Host ("[STARTUP FAILED] {0}" -f $_.Exception.Message) -ForegroundColor Red
    if ($_.ScriptStackTrace) {
        Write-Host $_.ScriptStackTrace -ForegroundColor DarkRed
    }
    if (-not $NoPause) {
        Read-Host 'Press Enter to close this launcher window'
    }
    exit 1
}
