# Phase 3 前后端联调验证清单（MSW Mock）

> ⚠️ 当前演示口径（2026-06-03）：所有 seed/演示账号默认密码统一为 `123456`；`admin123` 是历史旧口径，会返回 401，不可用于演示。本文下方如出现 `admin123`，仅为历史记录/旧脚本背景，不代表当前可用密码。

执行日期：2026-05-11  
适用对象：前端本地独立调试、QA 联调预验收  
依据：`docs/Phase3前后端联调契约.md`

## 1. 启用方式

1. 安装依赖：`cd frontend && npm install`
2. 启动 Mock：`$env:VITE_USE_MSW='true'; npm run dev`
3. 浏览器控制台确认 MSW worker 已启动；未匹配接口按 `onUnhandledRequest=bypass` 透传。

> 当前已新增 `frontend/src/mocks/`，包含 auth、workOrders、dispatchedOrders 三组 handler。

## 2. Handler 覆盖范围

| 文件 | 覆盖接口 | 场景 |
|---|---|---|
| `handlers/auth.ts` | `POST /api/auth/login`、`GET /api/auth/me`、`POST /api/auth/refresh`、`POST /api/auth/change-password` | admin 登录、未登录 401、刷新 token、改密成功 |
| `handlers/workOrders.ts` | `POST /api/work-orders`、`POST /api/work-orders/:id/submit` | 入职主工单草稿创建；按 `need_onboarding_contact` / `need_company_contract` 返回 2/3/4 个子工单 |
| `handlers/dispatchedOrders.ts` | `GET /api/dispatched-orders/:id`、`accept`、`complete`、`return`、`supplement` | data_entry/onboarding_contact/contract 详情；接单、完成、退回、补充回流 |

## 3. 前端手工验证清单

| 编号 | 步骤 | 预期 |
|---|---|---|
| MSW-001 | 使用 `admin/admin123` 登录 | 登录成功，响应含 `accessToken`、`refreshToken`、用户 roles/permissions |
| MSW-002 | 调用 `/api/auth/me` | 返回 admin 用户，路由守卫可进入后台页面 |
| MSW-003 | 新建入职主工单，两个派发字段均为“是” | 创建草稿成功；提交后返回 4 个子工单：data_entry、social_security、onboarding_contact、contract |
| MSW-004 | 新建入职主工单，`need_onboarding_contact=是`、`need_company_contract=否` | 提交后返回 3 个子工单：data_entry、social_security、onboarding_contact |
| MSW-005 | 新建入职主工单，两个派发字段均为“否” | 提交后返回 2 个子工单：data_entry、social_security |
| MSW-006 | 打开 data_entry 子工单详情 | 字段 `data_entry_feedback` 可编辑，其它展示为只读 |
| MSW-007 | 打开 onboarding_contact 子工单详情并补充银行卡字段 | 返回 `supplemented` 字段和 `syncedToModules=['data_entry','social_security']` |
| MSW-008 | 子工单 accept / complete | 状态从 pending → processing → completed；contract complete 返回主工单 completed |
| MSW-009 | 子工单 return 不填原因 | 返回 400；填写原因后返回主工单 returned |
| MSW-010 | 关闭 `VITE_USE_MSW` 后重新启动 | mock 不生效，请求走真实后端或 Vite proxy 配置 |

## 4. 与真实后端联调注意点

- Mock 使用 `traceId=req_MOCK_*`，真实后端为 `req_<uuid>`，可在 Network 中快速区分。
- Mock 的分页、字段权限只覆盖 Phase 3 主路径，不替代后端权限过滤验收。
- `/api/admin/dispatch-rules/simulate` 不在本次 MSW 范围内，仍以真实后端 Phase 2 验收为准。
- 如前端新增接口，请追加对应 handler，避免页面在 MSW 模式下半真半假导致误判。

## 5. 当前 QA 验证状态

- 已创建 handlers：3 组。
- 已接入 `frontend/src/main.tsx` 的 `VITE_USE_MSW=true` 开关。
- 待前端执行：`npm run build` / 页面手工走查。
