param(
  [switch]$FrontendOnly,
  [switch]$BackendOnly,
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Frontend = Join-Path $Root 'frontend'
$Backend = Join-Path $Root 'backend'

function Write-Step {
  param([string]$Message)
  Write-Host "`n==== $Message ====" -ForegroundColor Cyan
}

function Invoke-InDir {
  param(
    [string]$Path,
    [string]$Command,
    [string[]]$Arguments
  )
  Push-Location $Path
  try {
    Write-Host "> $Command $($Arguments -join ' ')" -ForegroundColor DarkGray
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "Command failed with exit code ${LASTEXITCODE}: $Command $($Arguments -join ' ')"
    }
  } finally {
    Pop-Location
  }
}

$FrontTests = @(
  'src/config/routeVisibility.test.ts',
  'src/pages/MyDispatched/index.test.tsx',
  'src/pages/MyDispatched/Detail/index.test.tsx',
  'src/pages/TeamDispatched/index.test.tsx',
  'src/pages/HistoryWorkOrders/index.test.tsx',
  'src/pages/WorkOrders/index.test.tsx',
  'src/pages/OnboardingModule/index.test.tsx',
  'src/pages/OnboardingModule/filterParams.test.ts',
  'src/pages/Dashboard/index.test.tsx',
  'src/utils/dispatchedStatusFilter.test.ts'
)

Write-Step 'Business regression start'
Write-Host "Root: $Root"
Write-Host "FrontendOnly: $FrontendOnly, BackendOnly: $BackendOnly, SkipBuild: $SkipBuild"

if (-not $BackendOnly) {
  Write-Step 'Frontend key business tests'
  Invoke-InDir $Frontend 'npm' (@('test', '--', '--run') + $FrontTests)

  if (-not $SkipBuild) {
    Write-Step 'Frontend build'
    Invoke-InDir $Frontend 'npm' @('run', 'build')
  }
}

if (-not $FrontendOnly) {
  if (-not $SkipBuild) {
    Write-Step 'Backend build'
    Invoke-InDir $Backend 'npm' @('run', 'build')
  } else {
    Write-Step 'Skip backend build because SkipBuild is set'
  }
}

Write-Step 'Git status'
Push-Location $Root
try {
  git status --short
} finally {
  Pop-Location
}

Write-Step 'Business regression done'
