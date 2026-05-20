# Phase 1 + Phase 2 综合验收报告

验收日期：2026-05-11
执行角色：QA / 测试工程师
工作目录：`D:\AI\SpeceAppDate\工单系统`

## 一、本地环境验收（Windows 原生 PostgreSQL 备用路径）

执行日期：2026-05-11

| 步骤 | 命令/动作 | 结果 | 输出/错误摘要 |
|---|---|---|---|
| 1 | `winget install --id PostgreSQL.PostgreSQL.16 -e --accept-source-agreements --accept-package-agreements --scope machine` | 失败 | 下载 345MB 安装包并校验 hash 成功，安装阶段返回 `Installer failed with exit code: 1` |
| 2 | EDB installer unattended：`--mode unattended --superpassword postgres --serverport 5432` | 失败 | 命令无明确错误但未落盘，`C:\Program Files\PostgreSQL\16\bin\psql.exe` 不存在，服务不存在 |
| 3 | 免安装 PostgreSQL zip 解压到项目中文路径并 initdb | 失败 | `initdb` 报 `invalid byte sequence for encoding "UTF8": 0xb9` |
| 4 | 免安装 PostgreSQL zip 解压到 `D:\pgsql16portable` 并 initdb | 成功 | `psql (PostgreSQL) 16.13`；`initdb` 成功，数据目录 `D:\pgsql16portable\data` |
| 5 | `pg_ctl -D D:\pgsql16portable\data -l D:\pgsql16portable\postgres.log -o "-p 5432" start` | 成功 | `pg_ctl: server is running`；`127.0.0.1:5432 - accepting connections` |
| 6 | 创建 DB/用户 | 成功 | `CREATE ROLE`、`CREATE DATABASE`、`GRANT`；`ticket/ticket_system` 连接成功 |
| 7 | 写入 `backend/.env` | 成功 | DB 指向 `127.0.0.1:5432`、`ticket/ticket123`、`ticket_system` |
| 8 | `cd backend && npm.cmd ci` | 成功 | added 805 packages；有 23 个 npm audit vulnerabilities（非本轮阻塞） |
| 9 | `npm.cmd run migration:run` | 成功 | 执行 `InitSchema1715400000000` 与 `Phase3Core1715500000000` 两个 migration |
| 10 | `npm.cmd run seed` | 成功 | `Seed completed successfully` |
| 11 | `verify-seed.ts` | 部分通过 | 7/8 检查通过：JSONB、11 角色、5 部门、54 字段、4 派发规则、1458 条字段权限、admin bcrypt 均通过；失败项：缺少文件表候选 `attachments/files/file_records/uploaded_files` |
| 12 | `npm.cmd run start:dev` | 失败 | TypeScript watch 编译 0 errors；Nest 启动失败：`AuditInterceptor` 无法注入 `OperationLogRepository`（CustomersModule context），后端未监听 3000 |
| 13 | `GET http://localhost:3000/api/health` | 未通过 | 因后端启动失败，无法连接到远程服务器 |
| 14 | 登录与 `/api/auth/me` | 未执行 | 依赖后端监听 3000；当前被 `P2-BE-REWORK-008` 阻塞 |

结论：Windows 原生 PostgreSQL 16 备用路径已打通，数据库、迁移、seed 可用；后端 HTTP 复测当前阻塞于后端依赖注入错误，不再受 Docker 限制。

## 二、Phase 1 Auth 模块端到端验收

执行日期：2026-05-11  
执行方式：后端本地启动成功后，先手工 API 验证，再运行 `auth.e2e-spec.ts`。

| 步骤 | 验证点 | 当前结果 | 响应时间/输出摘要 |
|---|---|---|---|
| A1 | `cd backend && npm.cmd run start:dev` | 通过 | Nest 成功启动，`P2-BE-REWORK-008` 已复测关闭。 |
| A2 | `GET http://localhost:3000/api/health` | 通过 | 131ms，返回 `{code:0,data:{status:'ok'},message:'ok',traceId}`。 |
| A3 | `POST /api/auth/login`，账号 `admin/admin123` | 通过 | 155ms，返回 `accessToken`、`refreshToken`、`traceId=req_9cb13680-...`。 |
| A4 | `GET /api/auth/me` 携 JWT | 通过 | 10ms，返回当前用户及 roles；未返回 passwordHash。 |
| A5 | `POST /api/auth/refresh` | 通过 | 3ms，返回新 `accessToken`。 |
| A6 | `POST /api/auth/change-password` | 通过 | 111ms，改为 `Admin123456!` 成功；随后旧密码登录返回 401，新密码登录成功。 |
| A7 | 恢复 admin 密码 | 通过 | 使用临时密码登录后改回 `admin123`，最终 `admin/admin123` 登录成功。 |
| A8 | `npm.cmd run test:e2e -- auth.e2e-spec.ts` | 通过 | 11/11 passed，Test Suites 1 passed，耗时 4.539s。 |

Auth 结论：Phase 1 Auth 真复测通过，统一响应结构包含 `code/data/message/traceId`；登录、me、refresh、change-password、logout 的 e2e 用例全部通过。

## 三、Phase 2 admin API 端到端验收

执行日期：2026-05-11 11:21-11:35  
环境：Windows 原生 PostgreSQL 16.13（`127.0.0.1:5432`）+ backend `npm.cmd run start:dev`（Node 24.15.0）  
说明：当前工作目录不是 Git 仓库，`git pull` 无法执行；本次基于当前落地代码复测。

### 3.1 启动与登录

| 步骤 | 请求/命令 | 结果 | 响应时间 | 摘要 |
|---|---|---|---:|---|
| 1 | `cd backend && npm.cmd run start:dev` | 通过 | - | Nest 成功启动，AdminModule/DispatchModule/HealthModule 路由均注册；stderr 仅 Node 24 `DEP0190` warning。 |
| 2 | `GET /api/health` | 通过 | 131ms | `{code:0,data:{status:'ok'},traceId:'req_8d47bbeb-...'}` |
| 3 | `POST /api/auth/login` admin/admin123 | 通过 | 110ms | 返回 `accessToken`、`refreshToken`、`traceId=req_a45b31ad-...`。 |
| 4 | `GET /api/auth/me` | 通过 | 8ms | 返回当前用户，含 roles；响应统一结构含 traceId。 |

### 3.2 Admin 列表/查询接口跳通

| API | 结果 | 响应时间 | 摘要 |
|---|---|---:|---|
| `GET /api/admin/users?page=1&pageSize=10` | 通过 | 7ms | `code=0`，不再 404。 |
| `GET /api/admin/roles?page=1&pageSize=10` | 通过 | 3ms | `code=0`。 |
| `GET /api/admin/departments` | 通过 | 3ms | `code=0`，返回部门树/数组。 |
| `GET /api/admin/customers?page=1&pageSize=10` | 通过 | 5ms | `code=0`。 |
| `GET /api/admin/fields?page=1&pageSize=10` | 通过 | 5ms | `code=0`。 |
| `GET /api/admin/field-permissions/matrix` | 通过 | 16ms | `code=0`。 |
| `GET /api/admin/dispatch-rules?page=1&pageSize=10` | 通过 | 5ms | `code=0,total=4`，含 2 条无条件规则 + 2 条条件规则。 |
| `GET /api/admin/module-handlers?page=1&pageSize=10` | 通过 | 6ms | `code=0`，返回 4 个模块 handler。 |
| `GET /api/admin/export-templates?page=1&pageSize=10` | 通过 | 3ms | `code=0`。 |
| `GET /api/admin/logs?page=1&pageSize=10` | 通过 | 4ms | `code=0`。 |

### 3.3 Admin CRUD 抽样验收

| 模块 | 覆盖动作 | 结果 | 摘要 |
|---|---|---|---|
| customers | create/update/toggle/delete | 通过 | QA 临时客户全链路 `code=0`。 |
| roles | create/update/delete | 通过 | QA 临时角色全链路 `code=0`。 |
| departments | create/update/delete | 通过 | QA 临时部门全链路 `code=0`。 |
| fields | create/update/delete | 通过 | QA 临时字段全链路 `code=0`。 |
| export-templates | create/update/delete | 通过 | QA 临时导出模板全链路 `code=0`。 |
| users | create | 未通过 | `POST /api/admin/users` 返回 404 `{code:404,message:'用户不存在'}`，已记录 `P2-BE-REWORK-010`。 |

### 3.4 `/api/admin/dispatch-rules/simulate` 验收

| Case | 请求 body | 预期 | 实际 | 结论 |
|---|---|---|---|---|
| case1 | `{orderType:'onboarding',fields:{need_onboarding_contact:'是',need_company_contract:'是'}}` | 命中 4 规则 | `code=0`，仅命中 2 规则：data_entry、social_security | 未通过 |
| case2 | `{orderType:'onboarding',fields:{need_onboarding_contact:'否',need_company_contract:'否'}}` | 命中 2 规则 | `code=0`，命中 2 规则：data_entry、social_security | 通过 |
| case3 | `{orderType:'onboarding',fields:{need_onboarding_contact:'是',need_company_contract:'否'}}` | 命中 3 规则 | `code=0`，仅命中 2 规则：data_entry、social_security | 未通过 |

补充：任务说明里的旧请求契约 `{order_type,payload}` 当前返回 400：`property order_type should not exist; property payload should not exist; ... fields must be an object`。实际 DTO 为 `{orderType,fields}`，需同步前后端/文档。缺陷已记录 `P2-BE-REWORK-009`。

## 四、MSW mock 集成与补充验证

执行日期：2026-05-11

| 项目 | 结果 | 摘要 |
|---|---|---|
| MSW 依赖 | 完成 | `frontend` 新增 devDependency `msw@^2.7.0`，`package-lock.json` 已更新；npm audit 仍有 5 个既有/依赖漏洞提示，未作为本轮阻塞。 |
| handlers/auth.ts | 完成 | 覆盖 login、me、refresh、change-password 4 个接口。 |
| handlers/workOrders.ts | 完成 | 覆盖 `POST /api/work-orders`、`POST /api/work-orders/:id/submit`，按派发字段返回 2/3/4 子工单。 |
| handlers/dispatchedOrders.ts | 完成 | 覆盖 detail、accept、complete、return、supplement 5 个接口。 |
| browser.ts + main.tsx | 完成 | 通过 `VITE_USE_MSW=true` 动态启动 worker，未开启时不影响真实后端联调。 |
| 联调清单 | 完成 | 新增 `docs/Phase3前后端联调验证清单.md`，列出 10 条手工验证步骤。 |
| 前端构建 | 通过 | `cd frontend && npm.cmd run build` 成功；仅保留 ProForm circular reexport 与 chunk >500k warning。 |
| 后端单测 | 通过但有 warning | `cd backend && npm.cmd run test`：4 suites / 50 tests passed；存在 Jest worker 未优雅退出 warning，已记录 `P2-BE-REWORK-011`。 |

## 1. 本次验收范围

| 范围 | 结果 | 说明 |
|---|---|---|
| Phase 2 前端测试用例补强 | 完成 | 已新增 `docs/Phase2前端测试用例.md` |
| Phase 2 后端单测活化指导 | 完成 | 已新增 `backend/test/docs/后端单测活化指导.md` |
| Phase 2 管理后台测试用例补充 | 完成 | 已在 `docs/Phase2测试用例.md` 追加 `/simulate` 与派发策略轮试用例 |
| Phase 2 静态风险记录 | 完成 | 已新增 `docs/Phase2已知问题.md` |
| Phase 1 + Phase 2 Docker 端到端复测 | 阻塞 | 本机无 Docker；尝试安装 Docker Desktop 失败，详见 P1-KNOWN-007 |

## 2. 环境检查

| 检查项 | 结果 | 证据/说明 |
|---|---|---|
| 操作系统 | Windows 11 会话 | 当前 shell 为 PowerShell |
| Docker CLI | 不存在 | `Get-Command docker` 无输出 |
| winget | 存在 | `C:\Users\Asus\AppData\Local\Microsoft\WindowsApps\winget.exe` |
| Docker Desktop 安装 | 失败 | `winget install --id Docker.DockerDesktop -e --accept-package-agreements --accept-source-agreements` 下载 617MB 安装包并校验 hash 后，安装阶段提示需要管理员权限/UAC，返回 exit code `4294967295` |
| Docker Compose | 未执行 | Docker 未安装，无法运行 `docker compose` |

## 3. 端到端复测步骤执行情况

| 步骤 | 状态 | 结果 |
|---|---|---|
| 1. Docker Compose 拉起 postgres/backend/frontend/nginx | 阻塞 | Docker 未安装，无法启动 |
| 2. 执行 migration | 未执行 | 依赖 PostgreSQL 容器 |
| 3. 执行 seed | 未执行 | 依赖 PostgreSQL 容器；且需后端编译通过 |
| 4. 运行 `tests/verify-seed.ts` | 未执行 | 依赖 migration/seed 完成 |
| 5. 运行 `backend/test/auth.e2e-spec.ts` | 未执行 | 依赖 backend 服务与测试数据库 |
| 6. 运行 Phase 2 admin 模块 E2E | 未执行 | 依赖 admin modules 接入 AppModule；当前静态检查发现未接入风险 |
| 7. 运行 `tests/smoke-test.ps1` | 未执行 | 依赖 Docker Compose 环境 |

## 4. 本次静态检查发现

### 4.1 Phase 2 后端风险

- `backend/src/app.module.ts` 当前只 import `AuthModule`，未看到 Admin 聚合模块、DispatchModule 或各 admin controller module 接入。风险已记录到 `docs/Phase2已知问题.md` 的 `P2-BE-001`。
- `WorkOrderService` 尚未落地，`backend/test/work-order.service.spec.ts` 仍应保持 `describe.skip`。风险已记录为 `P2-BE-002`。

### 4.2 Phase 2 前端风险

已记录到 `docs/Phase2已知问题.md`：

- non-admin 仍可看到“管理后台”菜单。
- admin 嵌套路由缺少可渲染子路由的 `<Outlet />`。
- `DynamicForm` 的 `masked` 字段只禁用、未脱敏。
- `AstConditionEditor` 输出结构与后端 JSON AST 不一致，且缺少 NOT。
- `RolePermissionMatrix` 缺少批量保存与复制角色交互。
- `ProTablePage` 导出按钮缺少显式权限开关。

## 5. 本次新增/更新产物

| 文件 | 内容 |
|---|---|
| `docs/Phase2前端测试用例.md` | 路由、菜单、DynamicForm、AstConditionEditor、RolePermissionMatrix、ExcelUploader、ProTablePage 测试用例 |
| `backend/test/docs/后端单测活化指导.md` | dispatch-engine / field-permission / work-order 三类模板的 import、mock、arrange/act/expect 指导 |
| `docs/Phase2测试用例.md` | 追加 `/simulate` E2E 用例 4 条；追加 fixed/round_robin/load_balance/pool 派发策略轮试用例 12 条 |
| `docs/Phase2已知问题.md` | 记录 Phase 2 后端/前端静态检查问题 |
| `docs/Phase1已知问题.md` | 追加 Docker Desktop 安装失败记录 `P1-KNOWN-007` |

## 6. 当前阻塞与补救建议

1. **Docker 环境阻塞**：当前会话无法完成 Docker Desktop 安装，需在具备管理员权限的 Windows 会话中安装 Docker Desktop，或提供已安装 Docker 的验收环境。
2. **后端模块接入风险**：在执行 Phase 2 API E2E 前，应先由后端确认 admin modules 已接入 `AppModule`，否则 admin 路由无法注册。
3. **前端 AST 契约风险**：在派发规则 UI 验收前，应优先统一 `AstConditionEditor` 输出结构与后端 `AstNode`。

## 7. 下一次复测计划

Docker 环境可用后按以下顺序复测：

1. `docker compose config`
2. `docker compose up -d postgres backend frontend nginx`
3. `cd backend && npm.cmd run migration:run`
4. `cd backend && npm.cmd run seed`
5. `npx ts-node -r tsconfig-paths/register tests/verify-seed.ts`
6. `cd backend && npm.cmd run test:e2e`
7. `powershell -ExecutionPolicy Bypass -File tests/smoke-test.ps1`
8. 将实际结果补写回本报告。

### 3.5 Phase 2 admin 全 CRUD 复核（2026-05-11 补充）

执行脚本：`tests/phase2-admin-crud-full.mjs`  
原始结果：`tests/phase2-admin-crud-full-results.json`

| 模块 | CREATE | READ(list/detail) | UPDATE | DELETE/等价操作 | 日志校验 | 结论 |
|---|---|---|---|---|---|---|
| Users | 通过 | 通过 | 通过 | 通过 | 通过 | 全链路通过 |
| Roles | 通过 | 通过 | 通过 | 通过 | 通过 | 全链路通过 |
| Departments | 通过 | 通过 | 通过 | 通过 | 通过 | 全链路通过 |
| Customers | 通过 | 通过 | 通过 | 通过 | 通过 | 全链路通过 |
| Fields | 通过 | 通过 | 通过 | 通过 | 通过 | 全链路通过 |
| FieldPermissions | batch 新增/更新通过 | matrix 读取通过 | batch 更新通过 | copy 作为等价覆盖通过 | 通过 | 配置链路通过 |
| DispatchRules | 通过 | 通过 | 通过 | 通过 | 通过 | 全链路通过；simulate 通过 |
| ModuleHandlers | 通过 | 通过 | 通过 | 通过 | 通过 | 全链路通过 |
| ExportTemplates | 通过 | 通过 | 通过 | 通过 | 通过 | 全链路通过 |

统计：`60/60` 通过，失败 `0`。`/api/admin/logs?page=1&pageSize=100` 中已验证包含 users、roles、departments、customers、field_configs、field_permissions、dispatch_rules、module_handlers、export_templates 九类操作记录。

结论：Phase 2 admin CRUD 本轮全量复核通过；此前 P2-BE-REWORK-010 用户创建后详情 404 问题，在完整 roles 请求体下未复现。
