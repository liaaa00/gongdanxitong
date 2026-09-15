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
  'src/layouts/BasicLayout.test.tsx',
  'src/pages/CustomerRules/index.test.tsx',
  'src/pages/CustomerRules/RuleBatchActions.test.tsx',
  'src/pages/CustomerRules/ruleExcel.test.ts',
  'src/pages/CustomerConfig/CustomerPortalAccounts.test.tsx',
  'src/pages/CustomerConfig/index.test.tsx',
  'src/pages/CustomerConfig/PortalIntakeReview.test.tsx',
  'src/pages/CustomerConfig/PortalIntakeWorkbench.test.tsx',
  'src/pages/CustomerConfig/portalIntakeValues.test.ts',
  'src/pages/CustomerConfig/PortalNotifications.test.tsx',
  'src/pages/SalaryReturns/index.test.tsx',
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
  foreach ($FrontTest in $FrontTests) {
    $pool = if ($FrontTest -in @('src/layouts/BasicLayout.test.tsx', 'src/pages/CustomerRules/index.test.tsx', 'src/pages/CustomerConfig/CustomerPortalAccounts.test.tsx', 'src/pages/CustomerConfig/PortalIntakeWorkbench.test.tsx')) { 'forks' } else { 'threads' }
    Invoke-InDir $Frontend 'npm' @('test', '--', '--run', $FrontTest, "--pool=$pool", '--maxWorkers=1', '--no-file-parallelism', '--testTimeout=60000')
  }

  if (-not $SkipBuild) {
    Write-Step 'Frontend build'
    Invoke-InDir $Frontend 'npm' @('run', 'build')
  }
}

if (-not $FrontendOnly) {
  Write-Step 'Customer portal backend regression'
  Invoke-InDir $Backend 'npm' @('test', '--', '--runTestsByPath', 'test/restore-business-import-migration.spec.ts', 'test/restore-business-create-migration.spec.ts', 'test/role-action-permission-baseline.spec.ts', 'test/import-permissions.spec.ts')
  Invoke-InDir $Backend 'npm' @('test', '--', '--runTestsByPath', 'test/customer-rules.service.spec.ts', 'test/customer-rules.controller.spec.ts', 'test/customer-portal-accounts.service.spec.ts', 'test/customer-portal-accounts.controller.spec.ts', 'test/customer-portal.service.spec.ts', 'test/customer-portal.salary-workbench.spec.ts', 'test/customer-portal-upload-compensation.spec.ts', 'test/customer-portal-permissions.spec.ts', 'test/admin-field-permission-conflict.spec.ts', 'test/completion-email.service.spec.ts', 'test/completion-email-delivery.service.spec.ts', 'test/dispatched-order.service.spec.ts', 'test/audit.interceptor.spec.ts')
  Invoke-InDir $Backend 'npm' @('test', '--', '--runTestsByPath', 'test/portal-rule-application.service.spec.ts', 'test/import.service.spec.ts', 'test/work-order.service.spec.ts')
  Write-Step 'Dispatch behavior net + SQL/CORS fixes (T03)'
  Invoke-InDir $Backend 'npm' @('test', '--', '--runTestsByPath', 'test/dispatched-order.behavior.spec.ts', 'test/cors-allowlist.spec.ts', 'test/dashboard.spec.ts')
  Invoke-InDir $Backend 'npm' @('test', '--', '--runTestsByPath', 'test/portal-review.service.spec.ts', 'test/portal-review.controller.spec.ts', 'test/portal-notification.config.spec.ts', 'test/portal-notification-eligibility.service.spec.ts', 'test/portal-notifications.service.spec.ts', 'test/portal-notifications.controller.spec.ts', 'test/customer-portal-monitor.spec.ts')
  Invoke-InDir (Join-Path $Root 'customer-portal') 'npm' @('test')
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
