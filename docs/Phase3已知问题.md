# Phase 3 已知问题

> 更新时间：2026-05-11  
> 来源：Phase 3 端到端复测；生产就绪闭环任务 14763850

| ID | 类型 | 现象 | 影响 | 当前处理 |
|---|---|---|---|---|
| P3-KNOWN-001 | Docker 联机 | 当前会话未识别 `docker` 命令；Docker Desktop 安装需要管理员权限/UAC。 | 暂无法在本机会话启动 `docker compose` 做 PostgreSQL/Nginx/前后端联机验证。 | 代码侧 `npm run build`、`npm run test`、`npm run test:e2e` 已通过；具备可用 Docker/PostgreSQL 环境后可继续执行 compose 联机。 |
| P3-KNOWN-002 | 测试警告 | 早期 `npm run test` 通过后曾出现 Jest worker 未优雅退出警告。 | 不影响测试结果，但可能来自异步资源 teardown。 | fixed：当前 `npm run test` 16 suites / 80 tests 通过，无 worker warning。 |

## 2026-05-11 Phase 3 端到端复测新增问题

| ID | 类型 | 现象 | 影响 | 当前处理 |
|---|---|---|---|---|
| P3-E2E-001 | API 响应契约 | `POST /api/work-orders/:id/submit` 顶层 `dispatchedOrders` 曾只返回 `id/moduleCode/status`，缺少验收要求 `handlerId`。 | 前端若依赖 submit 响应直接展示派单处理人，会拿不到 handler。 | fixed：`WorkOrderService.submit()` 与 returned 重提分支均返回 `handlerId`；`backend/test/work-order.service.spec.ts` 已断言 submit 响应包含 `handlerId:'handler-contract-1'`。 |
| P3-E2E-002 | API 阻塞缺陷 | 后道用户请求 `GET /api/dispatched-orders?page=1&pageSize=20&moduleCode=data_entry/social_security/onboarding_contact/contract` 曾返回 HTTP 500。 | “我的子工单列表”不可用，后道执行层无法从列表进入待办。 | fixed：`DispatchedOrderService.findAll()` 列表查询已稳定返回分页结果；`backend/test/dispatched-order.service.spec.ts` 新增四模块参数化回归，覆盖 `data_entry/social_security/onboarding_contact/contract` 不抛错并应用 moduleCode 过滤。 |

## 回归验证记录（2026-05-11）

- `npm run build`：通过。
- `npm run test`：16 suites / 80 tests 通过。
- `npm run test:e2e`：认证 e2e 11/11 通过。
- P3-E2E-001：通过单测验证 submit 顶层 `dispatchedOrders[].handlerId`。
- P3-E2E-002：通过单测验证四个模块列表查询不会 500，且正确加入 `d.module_code = :moduleCode` 条件。
