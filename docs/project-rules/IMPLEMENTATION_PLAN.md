# IMPLEMENTATION_PLAN.md — 逐步构建序列

> 版本：0.1.0 · 最后更新：2025-05-29
> 本文件将 `progress.txt` 【接下来】中的每个目标拆解为极小的、原子化的执行步骤。
> **每条步骤只做一件事。禁止跨步执行或跳步。**

---

## 使用说明

- 每条步骤的格式：**步骤 X.Y — [标题]**
  - `🎯 目标`：本步骤要达成什么
  - `📁 涉及文件`：需要修改或创建的文件（含路径）
  - `🔧 具体操作`：逐条列出要执行的代码改动
  - `✅ 验证方式`：如何确认步骤完成且正确
- 步骤之间**有顺序依赖关系**，必须按序执行。
- 每完成一条步骤，立即在 `progress.txt` 中勾选对应的 `[x]` 并记录验证结果。

---

## 第 1 步：关键路径加固

### 步骤 1.1 — 清理多余分支和工作树目录
- 🎯 确保项目只有一个权威代码源，消除多分支混淆风险
- 📁 涉及文件：`.spectrai-worktrees/` 目录、多余的 git worktree
- 🔧 具体操作：
  1. `git worktree list` 列出所有 worktree
  2. 确认当前 `main` 分支为唯一生产分支
  3. `git worktree remove <path>` 移除多余 worktree
  4. 删除 `.spectrai-worktrees/` 目录（如果存在且已无用）
  5. `git branch -a` 列出所有分支，确认哪些需要合并
  6. 对已确认完成的特性分支执行 `git merge <branch>` 或 `git branch -d <branch>`
- ✅ 验证方式：`git worktree list` 只剩 1 个 worktree；`ls .spectrai-worktrees` 返回空或不存在

### 步骤 1.2 — 检查并补全数据库索引
- 🎯 确保高频查询字段有索引，避免全表扫描
- 📁 涉及文件：新建 Migration 文件 `backend/src/database/migrations/1716500000000-AddPerformanceIndexes.ts`
- 🔧 具体操作：
  1. 审查 `work_orders` 表：`order_type` + `status` 组合索引，`created_by` 索引，`department_id` 索引
  2. 审查 `dispatched_orders` 表：`parent_order_id` + `module_code` 组合索引，`handler_id` + `status` 组合索引
  3. 审查 `notifications` 表：`user_id` + `is_read` 组合索引
  4. 审查 `operation_logs` 表：`entity_type` + `entity_id` 组合索引，`created_at` 索引（已有 migration 1716400000000，需验证）
  5. 审查 `user_roles` 表：确认复合主键已覆盖 `user_id` + `role_id` + `department_id` 查询
  6. 只添加缺失的索引，不修改已有 Migration
- ✅ 验证方式：`EXPLAIN ANALYZE` 验证关键查询使用了索引；`npm run migration:run` 成功

### 步骤 1.3 — 统一密码哈希库
- 🎯 移除冗余依赖，消除 "用哪个 bcrypt" 的歧义
- 📁 涉及文件：`backend/package.json`、`backend/src/modules/auth/auth.service.ts`（如有引用 `bcryptjs`）
- 🔧 具体操作：
  1. 确认 `auth.service.ts` 只 import 了 `bcrypt`（非 `bcryptjs`）
  2. 从 `package.json` 的 `dependencies` 中移除 `bcryptjs`
  3. 执行 `npm install` 更新 `package-lock.json`
  4. 如果 Docker 构建依赖原生模块 `bcrypt`，确认 `Dockerfile` 安装了 `python3`/`make`/`g++`
- ✅ 验证方式：`npm run test` 后端测试全部通过；`npm run build` 成功

### 步骤 1.4 — 修复 @nestjs/axios 版本不一致
- 🎯 消除 `package.json` 声明版本与实际安装版本的不一致
- 📁 涉及文件：`backend/package.json`
- 🔧 具体操作：
  1. 确认实际安装的 `@nestjs/axios` 版本（`npm ls @nestjs/axios`）
  2. 回退到与 `axios` v1.12.2 兼容的 `@nestjs/axios` 版本，或升级两者
  3. 更新 `package.json` 版本号
  4. 执行 `npm install`
- ✅ 验证方式：`npm ls @nestjs/axios` 版本与 `package.json` 一致

### 步骤 1.5 — 添加工单号唯一约束
- 🎯 确保 `order_no` 在数据库层面绝对不重复
- 📁 涉及文件：新建 Migration `backend/src/database/migrations/1716500001000-AddOrderNoUniqueConstraint.ts`
- 🔧 具体操作：
  1. 创建 Migration：`ALTER TABLE work_orders ADD CONSTRAINT uq_work_orders_order_no UNIQUE (order_no)`
  2. （Entity 已有 `unique: true`，但某些环境中可能未在 DB 层面落实）
  3. 执行 Migration
- ✅ 验证方式：尝试插入重复 `order_no` 时数据库报唯一约束错误

---

## 第 2 步：安全性加固

### 步骤 2.1 — 添加 API Rate Limiting
- 🎯 防止暴力破解和 API 滥用
- 📁 涉及文件：`backend/package.json`、`backend/src/app.module.ts`、新建 `backend/src/common/guards/throttler.guard.ts`
- 🔧 具体操作：
  1. `npm install @nestjs/throttler`（或基于 Redis 的 `@nestjs/throttler-storage-redis`）
  2. 在 `app.module.ts` 中注册 `ThrottlerModule`（全局 60 秒内 100 次）
  3. 对 `auth/login` 单独设置更严格的限制（60 秒内 5 次）
  4. 添加 `ThrottlerGuard` 到全局守卫链
- ✅ 验证方式：连续调用 `/api/auth/login` 超过 5 次后返回 429 Too Many Requests

### 步骤 2.2 — JWT Secret 强度启动检测
- 🎯 防止开发/部署时使用默认的弱 secret
- 📁 涉及文件：`backend/src/config/env.validation.ts`
- 🔧 具体操作：
  1. 在 `validateEnv` 中添加检查：如果 `JWT_SECRET` === `'replace_me_with_a_secure_random_string_32chars_or_more'`
  2. 如果 `NODE_ENV === 'production'`，直接抛出启动错误
  3. 如果 `NODE_ENV === 'development'`，打印醒目的 console.warn 警告
- ✅ 验证方式：启动时如果使用默认 secret，控制台显示红色警告（dev）或启动失败（prod）

### 步骤 2.3 — 文件上传 MIME 类型白名单
- 🎯 防止用户上传恶意文件（如 `.exe`、`.sh`）
- 📁 涉及文件：`backend/src/modules/upload/file.controller.ts` 或 `backend/src/modules/uploads/uploads.controller.ts`
- 🔧 具体操作：
  1. 定义白名单：`.xlsx`、`.xls`、`.csv`、`.pdf`、`.jpg`、`.jpeg`、`.png`、`.docx`、`.doc`
  2. 在文件上传的 Multer 配置中添加 `fileFilter` 回调，校验 MIME 类型和扩展名
  3. 不匹配的文件返回 400 Bad Request
- ✅ 验证方式：尝试上传 `.exe` 文件时返回错误

### 步骤 2.4 — DynamicForm XSS 安全审查
- 🎯 确保用户输入不会被注入 HTML/JS
- 📁 涉及文件：`frontend/src/components/DynamicForm/index.tsx`
- 🔧 具体操作：
  1. 审查所有 `dangerouslySetInnerHTML` 使用情况
  2. 确认 Ant Design 的 `Input`、`Input.TextArea` 默认转义
  3. 如果存在自定义渲染（如 `render` 属性返回 HTML），添加 DOMPurify 清洗
  4. 记录审查结果
- ✅ 验证方式：在文本字段中输入 `<script>alert(1)</script>` 并在详情页确认被转义显示

---

## 第 3 步：测试覆盖

### 步骤 3.1 — 编写全链路 E2E 测试
- 🎯 验证 "创建工单 → 提交 → 自动派发 → 处理人接单 → 完成" 完整流程
- 📁 涉及文件：`tests/e2e/full-pipeline.spec.ts`（新建）
- 🔧 具体操作：
  1. 测试登录获取 JWT Token
  2. 创建入职工单草稿
  3. 提交工单
  4. 验证系统自动生成了 4 个子工单（data_entry / social_insurance / onboarding_contact / contract）
  5. 以处理人身份登录，接单
  6. 完成子工单
  7. 验证主工单状态联动
- ✅ 验证方式：`npm run test:e2e` 全部通过

### 步骤 3.2 — Pool 认领并发测试
- 🎯 验证两个处理人同时认领同一 pool 子工单时不会重复分配
- 📁 涉及文件：`backend/test/dispatch-engine-pool-concurrency.spec.ts`（新建）
- 🔧 具体操作：
  1. 创建一个 pool 策略的子工单
  2. 使用 `Promise.all` 同时发起两个认领请求
  3. 验证只有一个成功，另一个返回 "已被认领" 错误
  4. 使用数据库行级锁或乐观锁验证无竞态
- ✅ 验证方式：测试通过，且数据库中间状态一致

### 步骤 3.3 — SLA 提醒边界测试
- 🎯 验证 SLA 提醒在跨天、时区边缘、同子工单重复触发时的正确性
- 📁 涉及文件：`backend/test/sla-reminder.spec.ts`（新建）
- 🔧 具体操作：
  1. 创建子工单，设置 `sla_hours=1`，`due_at=now+1h`
  2. Mock 时间前进到 `due_at - reminder_before_hours`
  3. 验证通知生成
  4. Mock 时间前进到 `due_at`，验证第二次提醒
  5. 验证不会重复生成通知
- ✅ 验证方式：测试通过

---

## 第 4 步：用户体验

### 步骤 4.1 — 子工单 SLA 倒计时
- 🎯 在处理人查看子工单详情时，直观显示 "距离截止还有 X 小时 Y 分钟"
- 📁 涉及文件：`frontend/src/pages/MyDispatched/Detail/index.tsx`
- 🔧 具体操作：
  1. 从详情数据中读取 `dueAt` 和 `slaHours`
  2. 使用 `dayjs` 计算当前时间到 `dueAt` 的差值
  3. 在页面顶部（标题下方）显示倒计时组件
  4. 超过截止时间时显示红色警告 "已超时 X 小时"
  5. 每 60 秒自动刷新（使用 `setInterval` + `useEffect` 清理）
- ✅ 验证方式：详情页正确显示倒计时；超时后显示红色警告

### 步骤 4.2 — 仪表盘实时计数器
- 🎯 仪表盘首页展示 "今日新增 X 单 / 今日完成 Y 单"
- 📁 涉及文件：`backend/src/modules/dashboard/dashboard.service.ts`、`frontend/src/pages/Dashboard/index.tsx`
- 🔧 具体操作：
  1. 后端 `getDashboardCards` 返回值中加入 `todayCreated` 和 `todayCompleted` 字段
  2. SQL 查询：`SELECT COUNT(*) FROM work_orders WHERE DATE(created_at) = CURRENT_DATE` 等
  3. 前端在仪表盘顶部卡片中展示
- ✅ 验证方式：今天新建一个工单后，仪表盘数字 +1

### 步骤 4.3 — 通知全部已读防误触
- 🎯 避免用户误点 "全部已读" 丢失未读提醒
- 📁 涉及文件：`frontend/src/pages/Notifications/index.tsx`
- 🔧 具体操作：
  1. "全部标记已读" 按钮点击后弹出 `Modal.confirm`
  2. 确认文案："确定要将所有通知标记为已读吗？此操作不可撤销。"
  3. 用户确认后才调用 API
- ✅ 验证方式：点击按钮后出现确认弹窗；取消后通知保持不变

### 步骤 4.4 — 移动端最小可用适配
- 🎯 至少 Dashboard 和子工单列表在手机上能看
- 📁 涉及文件：`frontend/src/layouts/BasicLayout.tsx`、`frontend/src/pages/Dashboard/index.tsx`
- 🔧 具体操作：
  1. 添加 `<meta name="viewport" content="width=device-width, initial-scale=1">` 到 `index.html`
  2. Dashboard 卡片在小屏幕上改为单列（`xs={24}` 而非 `xs={12}`）
  3. ProLayout 在小屏幕上自动折叠侧边栏（Ant Design 默认行为，确认生效）
  4. 表格在小屏幕上启用横向滚动
- ✅ 验证方式：Chrome DevTools 模拟 iPhone 12，页面可正常滚动查看

---

## 第 5 步：代码质量

### 步骤 5.1 — 引入 Swagger 自动生成 API 文档
- 🎯 自动生成可交互的 API 文档页面
- 📁 涉及文件：`backend/package.json`、`backend/src/main.ts`
- 🔧 具体操作：
  1. `npm install @nestjs/swagger swagger-ui-express`
  2. 在 `main.ts` 中配置 `SwaggerModule`
  3. 为每个 Controller 添加 `@ApiTags()` 和 `@ApiOperation()` 装饰器
  4. 为每个 DTO 添加 `@ApiProperty()` 装饰器
  5. 文档访问路径：`/api/docs`
- ✅ 验证方式：访问 `http://localhost:3000/api/docs` 看到 Swagger UI

### 步骤 5.2 — 拆分 BasicLayout.tsx
- 🎯 将 570 行的布局文件拆分为多个子组件
- 📁 涉及文件：`frontend/src/layouts/BasicLayout.tsx`、新建若干个组件文件
- 🔧 具体操作：
  1. 抽离菜单定义到 `frontend/src/layouts/menuConfig.tsx`
  2. 抽离通知铃铛到 `frontend/src/components/NotificationBell/index.tsx`
  3. 抽离用户信息展示到 `frontend/src/components/UserInfoBadge/index.tsx`
  4. `BasicLayout.tsx` 仅保留 ProLayout 配置和组合逻辑（目标 <200 行）
- ✅ 验证方式：功能不变，`npm run test` 通过

### 步骤 5.3 — 拆分 work-order.service.ts
- 🎯 将庞大复杂的 Service 拆分为职责清晰的小服务
- 📁 涉及文件：`backend/src/modules/work-orders/work-order.service.ts`、创建新 Service 文件
- 🔧 具体操作：
  1. 识别 `work-order.service.ts` 中的独立职责：
     - 状态机转换逻辑 → `work-order-state-machine.service.ts`
     - 撤回/废弃审批逻辑 → `work-order-approval.service.ts`
     - 字段校验逻辑 → 已有 `work-order-validation.service.ts`（确保完整）
  2. 逐一抽离，保持接口不变
  3. 原有 Service 变成 Orchestrator，只做调用协调
- ✅ 验证方式：`npm run test` 全部通过

### 步骤 5.4 — 统一前后端时间格式
- 🎯 全系统统一使用 ISO 8601 + Asia/Shanghai 时间
- 📁 涉及文件：后端全局、前端日期显示组件
- 🔧 具体操作：
  1. 确认 `main.ts` 中设置了 `process.env.TZ = 'Asia/Shanghai'`
  2. 后端所有 `timestamptz` 字段的序列化通过全局 Interceptor 统一格式
  3. 前端所有 `dayjs` 实例统一使用 `dayjs.extend(utc).extend(timezone)` 并设 `dayjs.tz.setDefault('Asia/Shanghai')`
  4. 排查是否有 `new Date().toLocaleString()` 等本地时区依赖
- ✅ 验证方式：不同时区环境下查看工单详情，时间显示一致

---

## 第 6 步：运维

### 步骤 6.1 — 数据库备份脚本
- 🎯 自动化日常备份
- 📁 涉及文件：新建 `scripts/backup-db.sh`、可能在 `docker-compose.yml` 中添加 cron 服务
- 🔧 具体操作：
  1. 创建 Shell 脚本：`pg_dump -h localhost -U postgres ticket_system > backup_$(date +%Y%m%d_%H%M%S).sql`
  2. 添加到 postgres 容器的 cron 任务（或外部 cron 调用 `docker exec`）
  3. 保留最近 7 天的备份，自动清理旧备份
- ✅ 验证方式：手动执行脚本生成 `.sql` 文件，`psql` 能成功恢复

### 步骤 6.2 — 应用监控（API 响应时间 + 错误率）
- 🎯 可观测性基线
- 📁 涉及文件：新建 `backend/src/common/interceptors/metrics.interceptor.ts`
- 🔧 具体操作：
  1. 创建 MetricsInterceptor，记录每个 API 请求的响应时间
  2. 将指标输出到结构化日志（JSON 格式）
  3. 可选：集成 Prometheus 或简单的内存聚合
  4. 慢查询（>3 秒）特殊标记
- ✅ 验证方式：日志中能看到每个请求的 `duration_ms` 字段

### 步骤 6.3 — Nginx gzip + 静态资源缓存
- 🎯 减少前端资源传输体积，加速首屏加载
- 📁 涉及文件：`nginx/nginx.conf`
- 🔧 具体操作：
  1. 添加 `gzip on; gzip_types text/css application/javascript application/json image/svg+xml;`
  2. 添加静态资源缓存：`location /assets/ { expires 30d; add_header Cache-Control "public, immutable"; }`
  3. 添加 `location /api/ { proxy_pass ...; proxy_read_timeout 120s; }` 的超时配置（如需要）
  4. 测试：`nginx -t` 验证配置正确
- ✅ 验证方式：浏览器 DevTools 查看 JS/CSS 文件带有 `Cache-Control: public, immutable` 响应头；响应体积变少（gzip）
