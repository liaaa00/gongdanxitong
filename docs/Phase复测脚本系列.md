# Phase 复测脚本系列

> ⚠️ 当前演示口径（2026-06-03）：所有 seed/演示账号默认密码统一为 `123456`；`admin123` 是历史旧口径，会返回 401，不可用于演示。本文下方如出现 `admin123`，仅为历史记录/旧脚本背景，不代表当前可用密码。

记录日期：2026-05-11  
维护角色：QA

## 1. Windows 原生后端环境

```powershell
# 进入项目根目录
cd D:\AI\SpeceAppDate\工单系统

# Node 20 优先
$env:PATH = 'D:\AI\node-v20.20.2-win-x64;' + $env:PATH

# PostgreSQL 本地服务已准备时
cd backend
npm.cmd ci
npm.cmd run migration:run
npm.cmd run seed
npm.cmd run start:dev
```

健康检查：

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/health
```

## 2. Phase 1 / Phase 2 复测

```powershell
# seed 基线
cd D:\AI\SpeceAppDate\工单系统
D:\AI\node-v20.20.2-win-x64\node.exe tests\verify-seed.ts

# auth e2e
cd backend
$env:PATH = 'D:\AI\node-v20.20.2-win-x64;' + $env:PATH
npm.cmd run test:e2e

# Phase 2 admin CRUD 全量复核
cd D:\AI\SpeceAppDate\工单系统
D:\AI\node-v20.20.2-win-x64\node.exe tests\phase2-admin-crud-full.mjs
```

输出：`tests/phase2-admin-crud-full-results.json`。

## 3. Phase 3 核心工单流程复测

```powershell
cd D:\AI\SpeceAppDate\工单系统
D:\AI\node-v20.20.2-win-x64\node.exe tests\phase3-e2e-runner.mjs
```

覆盖：login → create work-order → submit dispatch → accept → duplicate accept conflict → complete all children → main completed → return flow。

输出：
- `tests/phase3-e2e-results.json`
- `docs/Phase3端到端复测报告.md`

## 4. Phase 4 导入与回流复测预备

### 4.1 生成 Excel fixtures

```powershell
cd D:\AI\SpeceAppDate\工单系统
D:\AI\node-v20.20.2-win-x64\node.exe tests\generate-phase4-fixtures.mjs
```

生成目录：`tests/phase4-fixtures/`

| 文件 | 用途 |
|---|---|
| `standard.xlsx` | 标准模板，2 行合法数据 |
| `missing-col.xlsx` | 缺少关键列：电子邮件、身份证号 |
| `extra-col.xlsx` | 多余列：客户自定义备注、无需映射列 |
| `format-err.xlsx` | 手机号/邮箱/工资格式错误，姓名缺失 |
| `partial-success.xlsx` | 部分成功：合法 + 非法 + 合法 |

### 4.2 Phase 4 smoke

后端 Phase 4 交付并启动后执行：

```powershell
cd D:\AI\SpeceAppDate\工单系统
powershell -ExecutionPolicy Bypass -File tests\phase4-smoke.ps1 `
  -BaseUrl http://127.0.0.1:3000/api `
  -Username admin `
  -Password admin123 ` (legacy admin123 record; current admin123 returns 401 and must not be used for demos)
  -Fixture tests/phase4-fixtures/standard.xlsx
```

脚本步骤：
1. `/api/health`
2. `/api/auth/login`
3. `/api/work-orders/import/preview` 上传 Excel
4. `/api/work-orders/import/confirm` 确认映射
5. `/api/work-orders/import/:jobId` 轮询导入任务
6. 输出 traceId、jobId、success/fail 行数

### 4.3 五类夹具建议执行矩阵

```powershell
$fixtures = @('standard.xlsx','missing-col.xlsx','extra-col.xlsx','format-err.xlsx','partial-success.xlsx')
foreach ($f in $fixtures) {
  powershell -ExecutionPolicy Bypass -File tests\phase4-smoke.ps1 -Fixture "tests/phase4-fixtures/$f"
}
```

预期：
- `standard.xlsx`：preview 映射置信度高，confirm completed，fail_rows=0。
- `missing-col.xlsx`：preview 标红缺字段或 confirm validation failed。
- `extra-col.xlsx`：多余列 unmatched，不阻断合法字段映射。
- `format-err.xlsx`：confirm failed 或 fail_rows>0，返回错误报表。
- `partial-success.xlsx`：status=partial/completed with fail_rows>0，生成错误明细。

## 5. 前端 MSW 演练

```powershell
# 启动前端 MSW 模式
cd D:\AI\SpeceAppDate\工单系统\frontend
$env:VITE_USE_MSW='true'
$env:VITE_USE_MOCK='true'
npm.cmd run dev -- --host 127.0.0.1 --port 5173

# 另开窗口执行演练截图
cd D:\AI\SpeceAppDate\工单系统
D:\AI\node-v20.20.2-win-x64\node.exe tests\frontend-msw-e2e.mjs
```

输出目录：`docs/截图/frontend-msw-e2e/`。

注意：当前演练发现缺少 `/mockServiceWorker.js` 时，MSW 注册会失败，需要前端补 `npx msw init public/ --save` 或提交等价 public worker 文件后再复测。
