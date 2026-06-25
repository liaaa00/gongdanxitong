# Phase 4 导入与回流复测验收脚本

> ⚠️ 当前演示口径（2026-06-03）：所有 seed/演示账号默认密码统一为 `123456`；`admin123` 是历史旧口径，会返回 401，不可用于演示。本文下方如出现 `admin123`，仅为历史记录/旧脚本背景，不代表当前可用密码。

> 执行角色：QA  
> 适用阶段：backend Phase 4 交付后  
> 环境：Windows 本地 PostgreSQL 16 + backend `http://127.0.0.1:3000/api`

## 一、前置条件

1. PostgreSQL 已启动，migration + seed 已完成。
2. backend 已启动并通过：
   - `GET /api/health`
   - `POST /api/auth/login admin/admin123` (legacy admin123 record; current admin123 returns 401 and must not be used for demos)
3. 测试 fixtures 已存在：`tests/phase4-fixtures/`。
4. 运行脚本前建议重置测试库，避免历史导入数据干扰：

```powershell
powershell -ExecutionPolicy Bypass -File tests/reset-windows-native.ps1
```

## 二、通用 smoke 命令

```powershell
powershell -ExecutionPolicy Bypass -File tests/phase4-smoke.ps1 `
  -BaseUrl "http://127.0.0.1:3000/api" `
  -Username "admin" `
  -Password "admin123" ` (legacy admin123 record; current admin123 returns 401 and must not be used for demos)
  -Fixture "tests/phase4-fixtures/standard.xlsx" `
  -OrderType "onboarding" `
  -CustomerCode "CUST_NB001"
```

脚本执行步骤：

1. `GET /api/health` 健康检查。
2. `POST /api/auth/login` 登录并取得 token。
3. 校验 Excel fixture 存在。
4. `POST /api/upload/excel` 上传 Excel 并取得 `fileId`。
5. `POST /api/work-orders/import/preview` 获取 AI mapping suggestions 与 confidence。
6. `POST /api/work-orders/import/confirm` 提交最终 mapping 并取得 `jobId`。
7. 每 3 秒轮询 `GET /api/work-orders/import/:jobId`，直到 `completed/failed/partial`。
8. 查询 `GET /api/work-orders` 验证创建工单数量。

> 兼容说明：若后端实际 preview 仍采用 multipart 直接上传文件，脚本会自动从 `{fileId}` JSON preview 回退到 multipart preview。

## 三、5 条 E2E 验收流程

| 编号 | Fixture | 目标场景 | 执行命令 | 预期结果 | 通过标准 |
|---|---|---|---|---|---|
| P4-E2E-001 | `standard.xlsx` | 标准模板全字段导入 | `tests/phase4-smoke.ps1 -Fixture tests/phase4-fixtures/standard.xlsx` | preview 返回 `suggestion/confidence`；confirm 返回 `jobId`；job `completed`；`successRows >= 1`、`failRows = 0` | 生成 work_orders，按派发规则创建子工单；无错误报表 |
| P4-E2E-002 | `missing-col.xlsx` | 缺少必填列 | `tests/phase4-smoke.ps1 -Fixture tests/phase4-fixtures/missing-col.xlsx` | preview 的 `missingRequired` 非空；confirm 应被拒绝或 job `failed/partial` | 返回明确字段缺失错误，不允许静默成功 |
| P4-E2E-003 | `extra-col.xlsx` | 多余列 + 可忽略字段 | `tests/phase4-smoke.ps1 -Fixture tests/phase4-fixtures/extra-col.xlsx` | preview 的 `unmatched` 包含多余列；核心字段仍能映射；job 可 `completed` 或 `partial` | 多余列不阻塞标准字段导入；结果中可追踪 unmatched |
| P4-E2E-004 | `format-err.xlsx` | 格式错误：身份证/邮箱/手机号/日期等 | `tests/phase4-smoke.ps1 -Fixture tests/phase4-fixtures/format-err.xlsx` | confirm 后 job `failed/partial`；`failRows >= 1`；错误报表可下载 | 错误行不写入或以 savepoint 回滚；错误原因包含字段码与校验消息 |
| P4-E2E-005 | `partial-success.xlsx` | 部分成功：合法行 + 错误行混合 | `tests/phase4-smoke.ps1 -Fixture tests/phase4-fixtures/partial-success.xlsx` | job `partial`；`successRows >= 1` 且 `failRows >= 1`；生成错误报表 | 成功行写入并派发，失败行记录到错误报表；事务不互相污染 |

## 四、重点断言

### 1. AI 映射建议

- `confidence > 0.9`：前端可默认继承。
- `0.7 <= confidence <= 0.9`：应黄标提示人工确认。
- `confidence < 0.7`：应红标强制手调。
- `missingRequired` 不为空时，不允许直接 confirm 成功。

### 2. import_jobs 状态机

| 输入 | 预期状态 |
|---|---|
| 全部合法 | `completed` |
| 全部非法 | `failed` |
| 部分合法部分非法 | `partial` |
| 执行中 | `processing` |

### 3. 数据写入与派发

标准模板成功导入后应验证：

```sql
SELECT COUNT(*) FROM work_orders WHERE extra_data->>'customer_code' = 'CUST_NB001';
SELECT module_code, COUNT(*) FROM dispatched_orders GROUP BY module_code ORDER BY module_code;
SELECT status, success_rows, fail_rows FROM import_jobs ORDER BY created_at DESC LIMIT 5;
```

### 4. 错误报表

当 `failRows > 0` 时：

- `errorReportUrl` 不为空。
- 下载后应包含：行号、字段、错误类型、错误消息、原始值。
- 错误报表不应泄露被 masked/hidden 的敏感字段明文给无权限用户。

## 五、验收结论模板

| 项 | 结论 |
|---|---|
| 标准模板导入 | 通过 / 失败 / 阻塞 |
| 表头缺失处理 | 通过 / 失败 / 阻塞 |
| 多余列处理 | 通过 / 失败 / 阻塞 |
| 格式错误处理 | 通过 / 失败 / 阻塞 |
| 部分成功处理 | 通过 / 失败 / 阻塞 |
| 错误报表 | 通过 / 失败 / 阻塞 |
| 字段补充回流 | 通过 / 失败 / 阻塞 |
| 退回后重新提交 | 通过 / 失败 / 阻塞 |
