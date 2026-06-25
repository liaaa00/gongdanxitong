# This entry delegates to the LAN-safe startup script in the same directory.
# It keeps all startup behavior consistent across desktop shortcuts.

param(
    [switch]$NoBrowser,
    [switch]$NoPause
)

$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot '局域网启动.ps1'
if (-not (Test-Path -LiteralPath $scriptPath)) {
    throw "Startup script not found: $scriptPath"
}

$argsList = @()
if ($NoBrowser) { $argsList += '-NoBrowser' }
if ($NoPause) { $argsList += '-NoPause' }
& $scriptPath @argsList
