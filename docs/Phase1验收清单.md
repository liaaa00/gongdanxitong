# Phase 1 验收清单

本文档用于 Phase 1 基础骨架交付验收。验收对象包括项目负责人、业务员代表、后道交付代表和技术团队。

## 1. 交付物检查

| 检查项 | 验收标准 | 结果 |
|---|---|---|
| Git 提交记录 | Phase 1 相关提交清晰，包含前端、后端、数据库、部署、测试资产 | 待验收 |
| 数据库迁移脚本 | 可从空库重复执行并创建 19 张核心表；后端未开启 synchronize | 待验收 |
| Seed 脚本 | 可重跑，写入 11 角色、5 部门、54 字段、4 派发规则、字段权限矩阵、admin 账号 | 待验收 |
| 中文 README | 包含本阶段完成内容、启动方式、验证步骤和已知问题 | 待验收 |
| Docker Compose | `docker compose config` 通过；postgres/backend/frontend/nginx 结构完整 | 待验收 |
| 测试文档 | `docs/测试策略.md`、`docs/Phase1测试用例.md`、`docs/Phase1验收清单.md` 完整 | 待验收 |
| 测试脚本 | `tests/verify-seed.ts`、`tests/smoke-test.ps1`、`backend/test/auth.e2e-spec.ts` 存在 | 待验收 |
| 已知问题 | `docs/Phase1已知问题.md` 已记录当前未完成或阻塞项 | 待验收 |

## 2. 技术验收步骤

### 2.1 环境准备

1. 安装 Docker Desktop，并确认 Docker 正常运行。
2. 进入项目根目录：`D:\AI\SpeceAppDate\工单系统`。
3. 根据 `.env.example` 创建 `.env`，如项目已默认配置可直接使用。
4. 确认 Nginx/后端/数据库端口未被占用，实际端口以 `.env` 与 `docker-compose.yml` 为准。

### 2.2 Docker 结构与一键启动验证

1. 执行：`docker compose config`。
2. 检查 services 包含 `postgres`、`backend`、`frontend`、`nginx`。
3. 检查 volumes 包含 `postgres_data`、`backend_uploads`。
4. 检查 networks 包含 `ticket_net`。
5. 执行：`powershell -ExecutionPolicy Bypass -File tests\smoke-test.ps1`。
6. 期望结果：
   - Compose 结构校验通过。
   - PostgreSQL 健康检查通过。
   - 后端 health endpoint 返回 200。
   - 前端首页返回 200/3xx。
   - `/api/auth/login` 使用 `admin/admin123` 可返回 JWT。

### 2.3 Seed 数据验证

1. 按 README 执行 migration + seed。
2. 执行：`npx ts-node tests\verify-seed.ts` 或 README 中指定命令。
3. 期望结果：脚本输出 Markdown 报告，且以下项目通过：
   - 19 张核心表。
   - 11 个默认角色。
   - 5 个默认部门。
   - 54 个字段配置。
   - 4 条派发规则。
   - 字段权限矩阵包含 `main` 与 `dispatched:<module_code>` 场景。
   - admin 账号 bcrypt 验证通过。

### 2.4 后端认证 E2E 验证

1. 进入 `backend` 目录。
2. 安装依赖：`npm install`。
3. 执行迁移和 seed（以 README 为准）。
4. 执行：`npm run test:e2e`。
5. 期望结果：认证相关 E2E 测试全部通过，覆盖登录、me、refresh、修改密码、登出。
6. 响应结构需符合 `{code,data,message,traceId}`，且不得返回 `password_hash`。

## 3. 架构硬约束验收

| 约束 | 验收方式 |
|---|---|
| 业务字段不写死 | 检查字段来自 `field_configs`，业务数据进入 `work_orders.extra_data` JSONB |
| 派发规则不写死 | 检查默认规则来自 `dispatch_rules`；Phase 3 后补充 DispatchEngine 规则测试 |
| 字段权限场景统一 | Seed 校验 `field_permissions.scenario` 使用 `main` / `dispatched:<module_code>` |
| 统一响应 | 认证 E2E 校验 `{code,data,message,traceId}` |
| 时间字段规范 | 迁移脚本使用 `timestamptz`；接口返回 ISO 8601 |
| 文件存储抽象 | Phase 1 检查目录约定；后续测试 StorageAdapter |

## 4. 最终用户手工验收步骤

### 4.1 业务员代表验收

1. 打开系统地址。
2. 确认登录页显示正常。
3. 使用管理员或业务员测试账号登录。
4. 确认登录后能进入仪表盘或工作台占位页面。
5. 刷新页面，确认不会异常退出。
6. 点击退出登录，确认回到登录页。

Phase 1 只验收登录和基础页面，不验收入职工单录入、Excel 导入和派发。

### 4.2 后道交付代表验收

1. 使用后道测试账号登录，若 Phase 1 尚未创建后道账号，则由管理员账号代验基础登录。
2. 确认系统能展示基础布局和菜单框架。
3. 访问未授权后台页面时，应显示无权限或不可访问。

Phase 1 不验收子工单列表、接单、完成、退回和导出。

### 4.3 管理员验收

1. 使用 `admin/admin123` 登录。
2. 如系统提示首登强制改密，按页面引导完成并记录。
3. 确认能访问管理后台占位入口或后续管理菜单。
4. 确认当前用户信息显示正确。
5. 退出后再次访问后台地址，应跳转登录页。

## 5. 通过标准

Phase 1 验收通过需同时满足：

- Docker Compose 结构校验和冒烟测试通过。
- 数据库迁移和 seed 验证通过。
- admin 登录链路可用，统一响应结构符合 API 规范。
- 前端基础登录流程可用。
- 权限路由具备基本拦截能力。
- 已知问题均已记录，且无 P0 阻塞问题。

## 6. 不通过处理

如发现不通过项：

1. 测试工程师记录到 `docs/Phase1已知问题.md`。
2. 按模块分派给后端、前端或架构负责人修复。
3. 修复后重新执行对应自动化脚本和手工验证。
4. P0 问题未关闭前，不建议进入 Phase 2。
