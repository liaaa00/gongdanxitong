# Phase 2 已知问题

记录日期：2026-05-11
记录人：QA

## P2-BE-001 Phase 2 管理后台模块未接入 AppModule
- 状态：open
- 位置：`backend/src/app.module.ts`
- 现象：当前 `AppModule` imports 中仅看到 `AuthModule`，未看到 admin users/roles/departments/customers/fields/field-permissions/dispatch-rules/module-handlers/export-templates/logs 相关 module，也未看到 `DispatchModule` 被接入顶层模块。
- 影响：即使 controller/service 文件存在，`/api/admin/*` 与 `/api/admin/dispatch-rules/simulate` 可能无法注册路由，Phase 2 API E2E 会失败。
- 建议：后端补充 Admin 聚合模块并在 `AppModule` 中 import，同时确认 `DispatchModule` 被需要的服务模块引用。

## P2-BE-002 WorkOrderService 尚未落地，单测模板需保持 skip
- 状态：open
- 位置：`backend/test/work-order.service.spec.ts`、`backend/src/modules`
- 现象：未发现 `work-order.service.ts`、`work-order.controller.ts` 或 `work-orders.module.ts`。
- 影响：`work-order.service.spec.ts` 暂不能活化；Phase 3 工单核心前需要后端补齐服务层。
- 建议：后端实现主工单模块后，按 `backend/test/docs/后端单测活化指导.md` 活化模板。

## P2-FE-001 non-admin 仍会看到管理后台菜单
- 状态：open
- 位置：`frontend/src/layouts/BasicLayout.tsx`
- 现象：`mainMenuData` 固定包含“管理后台”及所有子菜单，未按 `user.roles` 过滤。
- 影响：non-admin 虽会被路由守卫拦截，但菜单仍暴露管理入口，违反 Phase 2 前端验收预期。
- 建议：菜单数据按角色过滤；non-admin 不显示 `/admin/*` 菜单。

## P2-FE-002 admin 嵌套路由可能不渲染子页面
- 状态：open
- 位置：`frontend/src/routes/index.tsx`
- 现象：`path="admin"` 的元素中 `RoleRoute` 包裹的是 `<Suspense fallback={<Loading />} />`，未看到 `<Outlet />` 或管理后台布局出口。
- 影响：admin 用户访问 `/admin/users` 等子路由可能只渲染空 Suspense，不显示页面内容。
- 建议：将 admin route element 调整为可渲染子路由的布局或 `<Outlet />`。

## P2-FE-003 DynamicForm 的 masked 字段未做前端脱敏
- 状态：open
- 位置：`frontend/src/components/DynamicForm/index.tsx`
- 现象：`masked` 当前仅被当作 disabled，未在展示层对初始值脱敏。
- 影响：若后端误传明文，前端会直接显示敏感信息；不满足字段级权限的双重防护要求。
- 建议：前端根据字段 code 或后端返回的脱敏值展示，禁止回显明文。

## P2-FE-004 AstConditionEditor 输出结构与后端 JSON AST 不一致
- 状态：open
- 位置：`frontend/src/components/AstConditionEditor/index.tsx`、`backend/src/modules/dispatch/types.ts`
- 现象：前端使用 `{type:'group', operator:'AND', conditions:[]}` 与小写比较符；后端期望 `{op:'AND', children:[]}` 和大写 `EQ/NEQ/IN/...`。当前组件也未提供 NOT 节点。
- 影响：派发规则保存或 simulate 调试可能无法通过后端 AST schema 校验。
- 建议：统一前后端 AST 数据契约，优先以 `docs/DispatchEngine-JSON-AST规范.md` 与后端 `AstNode` 类型为准。

## P2-FE-005 RolePermissionMatrix 缺少批量保存与复制交互
- 状态：open
- 位置：`frontend/src/components/RolePermissionMatrix/index.tsx`
- 现象：组件目前只提供单元格下拉变更回调，未看到脏数据收集、批量保存按钮、复制到其他角色入口。
- 影响：无法完整覆盖字段权限矩阵的 Phase 2 管理后台验收流程。
- 建议：前端页面层或组件层补充批量提交与复制角色的交互。

## P2-FE-006 ProTablePage 导出按钮缺少显式权限控制入参
- 状态：open
- 位置：`frontend/src/components/ProTablePage/index.tsx`
- 现象：组件只要传入 `onExport` 就显示导出按钮，没有 `canExport` 或权限码入参。
- 影响：需要依赖外层页面不传 `onExport` 来隐藏按钮，容易误暴露导出入口。
- 建议：增加显式权限开关，或在页面层统一断言 non-permission 不传 `onExport`。

## Phase 2 后端评审打回返工要求（Leader 记录）

### P2-BE-REWORK-001 10 个 admin 子模块缺少 `@Module()` 且 AppModule 未集成
- 状态：open
- 严重级别：P0
- 问题：users/roles/departments/customers/fields/field-permissions/dispatch-rules/module-handlers/export-templates/logs 等 admin 子模块缺少对应 `@Module()` 文件，且 `AppModule` 未集成。
- 影响：`/api/admin/*` 路由可能未注册，API 访问返回 404。
- 验收：所有 admin 路由注册成功；`GET /api/admin/users` 至少返回统一响应结构。

### P2-BE-REWORK-002 5 个 TypeScript 编译错误待修复
- 状态：open
- 严重级别：P0
- 问题：已知错误集中在 `dispatch-rules.service` 的 `repository.create` 类型、`condition-evaluator` 两处 `trace.node.op` 类型访问、`simulate` 返回类型不匹配等，共 5 个 TS 编译错误。
- 影响：`npm run build` 失败，无法进入 E2E 和 Docker 验收。
- 验收：`cd backend && npm run build` 零错误。

### P2-BE-REWORK-003 handler-picker 四种策略未实现
- 状态：open
- 严重级别：P0
- 问题：fixed / round_robin / load_balance / pool 的处理人选择逻辑尚未落地。
- 影响：Phase 2 simulate 与 Phase 3 工单派发无法验证 `handler_id` 绑定。
- 验收：四种策略均有单测和集成路径；round_robin 需覆盖并发/乐观锁场景。

### P2-BE-REWORK-004 三个后端单测仍是 `describe.skip`
- 状态：open
- 严重级别：P0
- 问题：`backend/test/dispatch-engine.spec.ts`、`field-permission.service.spec.ts`、`work-order.service.spec.ts` 仍为占位跳过。
- 影响：核心规则、权限过滤、工单流转缺少自动化保护。
- 验收：相关测试活化，`npm run test` 全部通过。

### P2-BE-REWORK-005 AuditInterceptor 的 `tap` 内 async 存在未处理 Promise 风险
- 状态：open
- 严重级别：P1
- 问题：若在 RxJS `tap` 中直接使用 async 写日志，Promise reject 可能不进入主链路错误处理。
- 影响：审计失败不可见，甚至引发未处理 Promise。
- 验收：改用 `mergeMap/concatMap` 或显式 catch；审计写入失败可记录日志且不破坏主响应。

### P2-BE-REWORK-006 AstValidator 缺少叶子数与 REGEX value 长度校验
- 状态：open
- 严重级别：P1
- 问题：缺少叶子节点总数 ≤256 限制，以及 REGEX pattern/value 长度校验。
- 影响：复杂 AST 或超长正则可能造成性能风险或 ReDoS 风险。
- 验收：保存阶段拒绝超限 AST；REGEX 仍保留运行时 100ms 熔断。

### P2-BE-REWORK-007 返工验收线
- 状态：open
- 严重级别：P0
- 要求：`npm run build` 零错误；`npm run test` 全部通过；`GET /api/admin/users` 返回 `{code, data}` 统一响应结构。
- 影响：未满足前不进入 Phase 2 后端通过状态。
- 验收：QA 后续复测按该验收线执行并补充报告。

### P2-BE-REWORK-008 本地启动失败：AuditInterceptor 缺 OperationLogRepository 注入
- 状态：fixed-verified
- 严重级别：P0
- 问题：Windows 原生 PostgreSQL 环境下，`npm run start:dev` 编译通过后 Nest 启动失败：`Nest can't resolve dependencies of the AuditInterceptor (Reflector, ?). Please make sure that the argument "OperationLogRepository" at index [1] is available in the CustomersModule context.`
- 影响：后端无法监听 3000，`GET /api/health`、登录和 `/api/auth/me` 均无法执行。
- 验收：2026-05-11 QA 复测通过：Nest 成功启动，`/api/health`、Auth、Admin 路由均可访问。

### P2-BE-REWORK-009 `/api/admin/dispatch-rules/simulate` 条件规则未命中
- 状态：open
- 严重级别：P0
- 问题：按实际 DTO 使用 `{ orderType:'onboarding', fields:{ need_onboarding_contact:'是', need_company_contract:'是' } }` 调用 simulate 返回 `code=0`，但 `matchedRules` 仅包含 data_entry/social_security 两条默认规则，未命中 onboarding_contact/contract 条件规则；三组输入（是/是、否/否、是/否）均返回 2 条。
- 影响：Phase 2 派发规则调试接口不能反映真实条件规则，Phase 3 提交派发存在高风险。
- 证据：`phase2-simulate-results.json`；traceId 示例 `req_80a79e76-1649-475c-9592-a9a26513a71f`。
- 补充：任务要求中的旧契约 `{order_type,payload}` 当前返回 400，实际 DTO 为 `{orderType,fields}`，需同步文档/前端契约。
- 验收：是/是命中 4 条规则；否/否命中 2 条；是/否命中 3 条；响应包含 matchedRules、targetModules、astTrace。

### P2-BE-REWORK-010 `POST /api/admin/users` 创建用户后返回 404 用户不存在
- 状态：open
- 严重级别：P0
- 问题：QA 使用有效 salesperson roleId 和 departmentId 创建临时用户，请求进入创建流程后返回 404 `{code:404,message:'用户不存在'}`。
- 影响：用户管理 CRUD 未全通，admin 无法新增用户。
- 初步定位：`UsersService.create()` 在 transaction 内保存 user/user_roles 后调用事务外 `this.detail(user.id)`，疑似未提交前用普通 repository 查询导致读不到新用户。
- 证据：`phase2-crud-results.json`；traceId `req_b4ef7a17-18b8-410a-8561-ddaf7eaff815`。
- 验收：创建用户返回 `code=0` 和用户详情；随后 PUT、reset-password、DELETE/disable 均可执行。

### P2-BE-REWORK-011 Jest 单测通过但存在 worker 未优雅退出 warning
- 状态：open
- 严重级别：P2
- 问题：`npm.cmd run test` 结果 4 suites / 50 tests 全部通过，但 Jest 输出 `A worker process has failed to exit gracefully and has been force exited`。
- 影响：当前不阻塞功能验收，但提示测试可能存在 DB 连接、timer 或 Nest app teardown 泄漏，后续 CI 可能偶发卡住。
- 证据：2026-05-11 QA 在 backend 执行 `npm.cmd run test`。
- 验收：使用 `--detectOpenHandles` 定位并清理资源，单测通过且不再出现 worker leak warning。

### P2-FE-MSW-001 缺少 `mockServiceWorker.js` 导致 MSW 模式阻塞
- 状态：fixed-verified
- 严重级别：P1
- 原问题：前端以 `VITE_USE_MSW=true` 启动后，`worker.start()` 请求 `/mockServiceWorker.js`，但该文件不存在，Vite 返回 `text/html`，浏览器报 `The script has an unsupported MIME type ('text/html')`，Service Worker 注册失败。
- 修复验证：2026-05-11 QA 复测确认 `frontend/public/mockServiceWorker.js` 与 `frontend/dist/mockServiceWorker.js` 均存在；Playwright 探针显示 Service Worker registration active，`navigator.serviceWorker.controller` 指向 `/mockServiceWorker.js`；登录场景通过并拿到 `mock-jwt-acc...`。
- 证据：`docs/前端演练报告.md`、`docs/截图/frontend-msw-e2e/frontend-msw-e2e-results.json`。

### P2-FE-MSW-002 MSW handlers 覆盖不足
- 状态：partial-fixed / open
- 严重级别：P2
- 原问题：MSW handlers 覆盖不足，Dashboard、admin、import、withdraw、export-templates、notifications 等链路无法形成纯 MSW 闭环。
- 修复验证：2026-05-11 QA 复测 13 个检查点 11 个通过，Dashboard、工单新建、导入页、我的子工单、子单详情、撤回详情、我的待办、导出模板、通知路由均可访问。
- 未关闭项：`/admin/users` 等待“用户管理”超时，`/admin/roles` 等待“角色管理”超时；`/notifications` 仍记录为路由可达但非正式业务页。需 frontend 继续检查 admin 嵌套路由/RoleRoute/Outlet/页面标题和通知中心正式路由。
- 证据：`docs/前端演练报告.md`，统计 `13 total / 11 passed / 2 failed`。

### P2-BE-REWORK-010 复核补充
- 状态：fixed-verified
- 复核日期：2026-05-11
- 证据：`tests/phase2-admin-crud-full-results.json`，Users CREATE/READ(list+detail)/UPDATE/DELETE 全通过；Phase 2 admin 全 CRUD 统计 `60/60` 通过。
