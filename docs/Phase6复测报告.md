# Phase 6 看板、通知与 SSE 复测报告

> 执行角色：QA 测试工程师  
> 执行时间：2026-05-11  
> 环境：Windows 11 + 本地 PostgreSQL 16 + 后端 `http://127.0.0.1:3000/api`

## 一、预热数据

`tests/phase6-seed-data.sql` 已通过 Node + `pg` 方式执行并写入：

| 数据类型 | 数量 | 说明 |
|---|---:|---|
| work_orders | 30 | `order_no` 前缀 `PH6-`，跨 3 周、覆盖 draft/pending/processing/completed/returned |
| dispatched_orders | 60 | 覆盖 `data_entry/contract/onboarding_contact/social_security/payroll/benefit` 六类 module |
| notifications | 18 | `payload.source=phase6_seed`，覆盖 task/system/sla 分组 |

## 二、看板接口验证

| 角色/模块 | 接口 | 期望字段 | 实际结果 | 结论 |
|---|---|---|---|---|
| 业务员 | `GET /api/dashboard/salesperson` | 待办/今日成单/同环比趋势 | HTTP 200，`code=0`，返回 `current/previous/deltaPct/trend` | 通过 |
| 后道处理人 | `GET /api/dashboard/processor/data_entry` | 模块统计、SLA、效率排行 | HTTP 200，`code=0`，返回 `moduleCode/counts/pool/top5/members` | 通过 |
| 团队看板 | `GET /api/dashboard/team/data_entry` | 团队池、成员效率 | HTTP 200，`code=0`，返回 `moduleCode/counts/pool/top5/members` | 通过 |
| 管理层/管理员 | `GET /api/dashboard/admin` | 模块汇总、客户 Top、趋势 | HTTP 200，`code=0`，返回 `modules/topCustomers/ratios/trend` | 通过 |
| 管理层 | `GET /api/dashboard/manager` | 同管理层汇总 | HTTP 200，`code=0` | 通过 |

## 三、通知与 SSE

| 测点 | 接口/方式 | 实际结果 | 结论 |
|---|---|---|---|
| 通知列表分组 | `GET /api/notifications?group_by=biz_type` | HTTP 200，返回 `items/total/page/pageSize/groups` | 通过 |
| SSE 心跳 | `curl.exe -N --max-time 3 -H "Authorization: Bearer <token>" http://127.0.0.1:3000/api/events/notifications` | 收到 `id: 1`、`data: {"type":"ping",...}` 等心跳事件 | 通过 |
| 前端脚本 SSE | `npm.cmd run verify:phase56` | Node 环境报 `EventSource is not defined` | 脚本环境限制，不判后端失败 |

## 四、前端 live 脚本结果

| 脚本 | 结果 | 说明 |
|---|---|---|
| `npm.cmd run smoke:live` | 通过 | login、me、work-orders、admin/users、dashboard/salesperson 全部 2xx |
| `npm.cmd run verify:phase56` | 部分通过 | dashboard/team/notifications 通过；撤回脚本仍用旧字段 `work_order_id/request_type` 导致 400；SSE 因 Node 缺 EventSource 失败 |

## 五、结论

Phase 6 后端核心看板与通知能力通过：三类看板、通知分组、SSE 心跳均可用。前端验证脚本需要同步后端 DTO 字段命名（`workOrderId/requestType`）并为 Node SSE 引入 EventSource/polyfill，脚本问题不阻塞后端 Phase 6 核心验收。
