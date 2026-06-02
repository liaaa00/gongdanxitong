# Phase 1 测试用例清单

> ⚠️ 当前演示口径（2026-06-03）：所有 seed/演示账号默认密码统一为 `123456`；`admin123` 是历史旧口径，会返回 401，不可用于演示。本文下方如出现 `admin123`，仅为历史记录/旧脚本背景，不代表当前可用密码。

优先级说明：P0 = 阻塞阶段验收；P1 = 重要但可短期规避；P2 = 增强体验或非核心。

## 1. 数据库迁移和 Seed 验证

### TC-DB-001 迁移后应创建 19 张核心表

- 优先级：P0
- 前置条件：PostgreSQL 已启动；migration 已执行完成。
- 操作步骤：
  1. 连接应用数据库。
  2. 查询 `information_schema.tables`。
  3. 检查 19 张核心表是否存在：基础表、配置表、业务表、审计/导入/文件表。
- 预期结果：19 张核心表均存在；`work_orders.extra_data` 为 JSONB；表名与迁移脚本一致。

### TC-DB-002 Seed 应创建 11 个默认角色

- 优先级：P0
- 前置条件：seed 已执行完成。
- 操作步骤：查询 `roles.code`，检查 `admin`、`manager`、`salesperson`、`contract_team`、`onboarding_team`、`data_entry_team`、`social_security_team`、`contract_supervisor`、`onboarding_supervisor`、`data_entry_supervisor`、`social_security_supervisor`。
- 预期结果：11 个角色均存在且 `is_active=true`。

### TC-DB-003 Seed 应创建 5 个默认部门

- 优先级：P0
- 前置条件：seed 已执行完成。
- 操作步骤：查询 `departments.name`，检查业务部、合同中心、共享服务中心、集约岗、社保团队。
- 预期结果：5 个部门均存在且启用。

### TC-DB-004 Seed 应创建 54 个入职字段配置

- 优先级：P0
- 前置条件：seed 已执行完成。
- 操作步骤：
  1. 查询 `field_configs`。
  2. 统计 54 个入职字段 code。
  3. 抽查 `customer_name`、`employee_name`、`id_card_no`、`need_company_contract`、`need_onboarding_contact`、`data_entry_feedback`。
- 预期结果：54 个字段均存在；必填、字段类型、下拉选项与需求一致；`field_code` 保持 snake_case。

### TC-DB-005 Seed 应创建 4 条默认派发规则

- 优先级：P0
- 前置条件：seed 已执行完成。
- 操作步骤：
  1. 查询 `dispatch_rules` 中 `order_type='onboarding'` 的启用规则。
  2. 检查目标模块：`data_entry`、`social_security`、`onboarding_contact`、`contract`。
  3. 检查条件 JSON AST 中包含 `need_onboarding_contact=是` 与 `need_company_contract=是`。
- 预期结果：4 条规则存在、启用且优先级明确；条件不是写死在代码中。

### TC-DB-006 Seed 应创建字段权限矩阵

- 优先级：P0
- 前置条件：seed 已执行完成。
- 操作步骤：
  1. 查询 `field_permissions`。
  2. 检查 scenario 包含 `main`、`dispatched:contract`、`dispatched:onboarding_contact`、`dispatched:data_entry`、`dispatched:social_security`。
  3. 抽查薪资、银行、合同、社保字段的 visible/hidden/readonly/masked 配置。
- 预期结果：权限矩阵非空；关键角色和场景存在权限记录。

### TC-DB-007 admin 账号密码应可用 bcrypt 校验

- 优先级：P0
- 前置条件：seed 已执行完成。
- 操作步骤：查询 `users.username='admin'` 的 `password_hash`，使用 bcrypt 校验 `admin123`。
- 预期结果：bcrypt 校验通过；admin 用户启用；如实现首登强制改密，应有明确字段或响应标识。

## 2. 后端认证 API

### TC-AUTH-001 admin 正确账号密码登录成功

- 优先级：P0
- 前置条件：后端服务已启动；admin seed 存在。
- 操作步骤：POST `/api/auth/login`，请求体 `{ "username": "admin", "password": "admin123" }`。
- 预期结果：返回 200/201；响应符合 `{code,data,message,traceId}`；`data.accessToken` 存在；不返回 `password_hash`。

### TC-AUTH-002 错误密码登录失败

- 优先级：P0
- 前置条件：后端服务已启动。
- 操作步骤：POST `/api/auth/login`，使用 `admin/wrong-password`。
- 预期结果：返回 401；错误响应包含 `code`、`message`、`traceId`；不返回 JWT。

### TC-AUTH-003 不存在用户登录失败

- 优先级：P1
- 前置条件：后端服务已启动。
- 操作步骤：POST `/api/auth/login`，使用不存在的用户名。
- 预期结果：返回 401；提示不泄露用户是否存在。

### TC-AUTH-004 登录参数缺失应返回校验错误

- 优先级：P1
- 前置条件：后端服务已启动。
- 操作步骤：POST `/api/auth/login`，缺失 username 或 password。
- 预期结果：返回 400/422；错误格式统一。

### TC-AUTH-005 携带有效 JWT 获取当前用户信息

- 优先级：P0
- 前置条件：已登录获得 access token。
- 操作步骤：GET `/api/auth/me`，Header 携带 `Authorization: Bearer <token>`。
- 预期结果：返回 200；包含当前用户、角色和权限摘要；不返回 `password_hash`。

### TC-AUTH-006 未携带 JWT 访问 me 被拒绝

- 优先级：P0
- 前置条件：后端服务已启动。
- 操作步骤：GET `/api/auth/me`，不带 Authorization。
- 预期结果：返回 401。

### TC-AUTH-007 非法 JWT 访问 me 被拒绝

- 优先级：P0
- 前置条件：后端服务已启动。
- 操作步骤：GET `/api/auth/me`，Header 携带 `Bearer invalid.token`。
- 预期结果：返回 401。

### TC-AUTH-008 refresh token 可刷新 access token

- 优先级：P0
- 前置条件：登录接口返回 refresh token。
- 操作步骤：POST `/api/auth/refresh`，提交 refresh token。
- 预期结果：返回新的 access token；新 token 可访问 `/api/auth/me`。

### TC-AUTH-009 refresh token 缺失或非法时失败

- 优先级：P1
- 前置条件：后端服务已启动。
- 操作步骤：POST `/api/auth/refresh`，不传 token 或传非法 token。
- 预期结果：返回 401/400；不返回新 token。

### TC-AUTH-010 修改密码成功并可用新密码登录

- 优先级：P1
- 前置条件：已登录获得 access token。
- 操作步骤：POST `/api/auth/change-password` 修改密码；用新密码登录；测试结束恢复 `admin123`。
- 预期结果：修改成功；旧密码失效；新密码可登录；最终恢复默认密码。

### TC-AUTH-011 修改密码时旧密码错误应失败

- 优先级：P1
- 前置条件：已登录获得 access token。
- 操作步骤：POST `/api/auth/change-password`，提交错误旧密码。
- 预期结果：返回 400/401；密码未改变。

### TC-AUTH-012 登出接口成功

- 优先级：P1
- 前置条件：已登录获得 access token。
- 操作步骤：POST `/api/auth/logout`。
- 预期结果：返回 200/204；前端可清理本地 token。

## 3. JWT 守卫、@Public、@Roles

### TC-GUARD-001 @Public 路由无需 token 可访问

- 优先级：P0
- 前置条件：存在公开路由，如 `/api/health` 或 `/api/auth/login`。
- 操作步骤：不带 Authorization 访问公开路由。
- 预期结果：返回成功状态，不被 JWT 守卫拦截。

### TC-GUARD-002 受保护路由无 token 返回 401

- 优先级：P0
- 前置条件：存在受保护路由，如 `/api/auth/me`。
- 操作步骤：不带 Authorization 访问。
- 预期结果：返回 401。

### TC-GUARD-003 @Roles(admin) 允许 admin 访问

- 优先级：P0
- 前置条件：admin 登录；存在 admin 保护路由或占位接口。
- 操作步骤：用 admin token 访问 admin 路由。
- 预期结果：不返回 403。

### TC-GUARD-004 @Roles(admin) 拒绝非 admin 访问

- 优先级：P0
- 前置条件：存在非 admin 测试用户；存在 admin 保护路由。
- 操作步骤：用非 admin token 访问 admin 路由。
- 预期结果：返回 403。

### TC-GUARD-005 一人多角色时任一角色满足即可访问

- 优先级：P1
- 前置条件：用户绑定多个角色，其中一个满足目标路由要求。
- 操作步骤：使用该用户 token 访问目标路由。
- 预期结果：访问成功。

## 4. 前端登录流程

### TC-FE-001 登录页可正常渲染

- 优先级：P0
- 前置条件：前端服务已启动。
- 操作步骤：浏览器打开 `/login`。
- 预期结果：显示账号、密码输入框和登录按钮；无控制台阻塞错误。

### TC-FE-002 admin 登录成功后进入 dashboard

- 优先级：P0
- 前置条件：后端和前端均已启动；admin 账号可用。
- 操作步骤：在登录页输入 `admin/admin123` 并提交。
- 预期结果：登录成功；跳转 `/dashboard` 或默认首页；本地保存 token。

### TC-FE-003 登录失败应显示错误提示

- 优先级：P0
- 前置条件：前端服务已启动。
- 操作步骤：输入 `admin/wrong-password` 登录。
- 预期结果：停留在登录页；显示错误提示；不保存 token。

### TC-FE-004 刷新页面后保持登录态

- 优先级：P1
- 前置条件：已成功登录。
- 操作步骤：刷新浏览器页面。
- 预期结果：仍保持登录态；可正常获取当前用户信息；不跳回登录页。

### TC-FE-005 退出登录后清理本地状态

- 优先级：P1
- 前置条件：已成功登录。
- 操作步骤：点击退出登录。
- 预期结果：本地 token 被清理；跳转登录页；再次访问受保护页需重新登录。

## 5. 权限路由守卫

### TC-ROUTE-001 未登录访问 dashboard 跳转 login

- 优先级：P0
- 前置条件：浏览器无 token。
- 操作步骤：直接访问 `/dashboard`。
- 预期结果：跳转 `/login`，并保留 redirect 信息或可返回原页面。

### TC-ROUTE-002 未登录访问管理后台跳转 login

- 优先级：P0
- 前置条件：浏览器无 token。
- 操作步骤：直接访问 `/admin/users`。
- 预期结果：跳转 `/login`。

### TC-ROUTE-003 已登录但无 admin 权限访问后台显示 403

- 优先级：P1
- 前置条件：存在非 admin 用户并已登录。
- 操作步骤：访问 `/admin/users`。
- 预期结果：显示 403 页面或无权限提示，不展示后台数据。

### TC-ROUTE-004 admin 访问后台路由成功

- 优先级：P0
- 前置条件：admin 已登录。
- 操作步骤：访问 `/admin/users` 或 Phase 1 已实现的后台占位页。
- 预期结果：路由可进入，不显示 403。

### TC-ROUTE-005 不存在路由显示 404

- 优先级：P2
- 前置条件：前端服务已启动。
- 操作步骤：访问 `/not-exist-page`。
- 预期结果：显示 404 页面。

## 6. Docker Compose 一键启动验证

### TC-DOCKER-001 docker compose 结构校验通过

- 优先级：P0
- 前置条件：本机已安装 Docker Desktop；项目根目录存在 `docker-compose.yml`。
- 操作步骤：执行 `docker compose config`。
- 预期结果：命令退出码为 0；services 包含 postgres/backend/frontend/nginx；volumes 包含 postgres_data/backend_uploads；networks 包含 ticket_net。

### TC-DOCKER-002 docker compose 可一键启动

- 优先级：P0
- 前置条件：Docker Desktop 可用；`.env` 或 `.env.example` 配置齐全。
- 操作步骤：执行 `tests/smoke-test.ps1`。
- 预期结果：PostgreSQL、backend、frontend、nginx 容器均启动成功。

### TC-DOCKER-003 PostgreSQL 健康检查通过

- 优先级：P0
- 前置条件：Docker Compose 已启动。
- 操作步骤：脚本轮询 PostgreSQL 容器健康状态或执行 `pg_isready`。
- 预期结果：在超时时间内健康检查通过。

### TC-DOCKER-004 后端健康检查通过

- 优先级：P0
- 前置条件：Docker Compose 已启动。
- 操作步骤：请求 Nginx 转发的 `/api/health` 或项目约定 health endpoint。
- 预期结果：返回 HTTP 200。

### TC-DOCKER-005 前端首页可访问

- 优先级：P0
- 前置条件：Docker Compose 已启动。
- 操作步骤：请求 Nginx 暴露端口 `/`。
- 预期结果：返回 HTTP 200 或前端 SPA HTML。

### TC-DOCKER-006 经 HTTP 登录返回 JWT

- 优先级：P0
- 前置条件：Docker Compose 已启动；seed 已完成。
- 操作步骤：请求 `/api/auth/login`，账号 `admin/admin123`。
- 预期结果：返回 JWT；响应中不包含 `password_hash`；统一响应结构包含 `traceId`。
