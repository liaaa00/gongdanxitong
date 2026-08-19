param(
    [switch]$NoBrowser,
    [switch]$NoPause
)

$dailyName = [string]::Concat([char]0x65e5, [char]0x5e38, [char]0x542f, [char]0x52a8, '.ps1')
& (Join-Path $PSScriptRoot $dailyName) -NoBrowser:$NoBrowser -NoPause:$NoPause
exit $LASTEXITCODE
