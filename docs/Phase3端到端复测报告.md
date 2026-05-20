# Phase 3 后端端到端复测报告

记录日期：2026-05-11  
执行角色：QA / 测试工程师  
测试范围：Phase 3 核心流程 submit → dispatch → accept → complete → return，以及 Phase 2 遗留问题复测。

## 1. 环境与准备

| 项 | 结果 |
|---|---|
| 工作目录 | `D:\AI\SpeceAppDate\工单系统` |
| Git 更新 | 根目录与 `backend/` 均不是 Git 仓库，`git status` 返回 `fatal: not a git repository`，因此未执行 `git pull`。 |
| Node | 使用 portable Node `D:\AI\node-v20.20.2-win-x64\node.exe`，版本 `v20.20.2`，npm `10.8.2`。 |
| 数据库 | Windows 本地 PostgreSQL 16，`127.0.0.1:5432`。 |
| 依赖 | 既有 `node_modules` 可用；此前已用 Node 20 + Python 3.12 完成 `npm ci`。 |
| Migration | `npm.cmd run migration:run` 成功，输出 `No migrations are pending`。 |
| Seed | `npm.cmd run seed` 成功，输出 `Seed completed successfully`。 |
| Backend | `npm run start:dev` 已成功监听 `127.0.0.1:3000`，Nest 路由包含 `/api/work-orders`、`/api/dispatched-orders`、`/api/admin/dispatch-rules/simulate`、`/api/health`。 |
| 原始结果 | `tests/phase3-e2e-results.json`。 |
| 复测脚本 | `tests/phase3-e2e-runner.mjs`，使用 Node fetch，避免 PowerShell 中文编码问题。 |

## 2. 测试账号与数据

- 需求指定 `salesperson/salesperson123`，但 seed 中实际可用业务员账号为 `sales01/admin123`；本次使用 `sales01` 执行业务员流程。
- 后道账号：`dataentry01/admin123`、`social01/admin123`、`onboard01/admin123`、`contract01/admin123`、`dataentrysup01/admin123`。
- 客户使用 seed 数据：`CUST_NB001 / 宁波某制造集团`。
- 工单样例：`order_type=onboarding`，`need_onboarding_contact=是`，`need_company_contract=是`，并补齐 field_configs 要求的必填字段。

## 3. 11 步核心流程复测结论

| 步骤 | 请求摘要 | 期望 | 实际结果 | 结论 | TraceId / 证据 |
|---|---|---|---|---|---|
| 1 | `POST /api/auth/login`，`sales01/admin123` | 返回 token | HTTP 201，返回 `code=0`、`accessToken`、`refreshToken`、`traceId` | 通过 | 见结果 JSON `login sales01` |
| 2 | `POST /api/work-orders` 创建 onboarding 草稿 | 创建成功，`orderNo=ON+YYYYMMDD+序号`，`status=draft` | HTTP 201，`orderNo=ON20260511002`，`status=draft` | 通过 | `req_*`，原始结果 `step2 create onboarding draft` |
| 3 | `POST /api/work-orders/:id/submit` | 触发 4 个子工单，模块为 `data_entry/social_security/onboarding_contact/contract`，每条有 `handler_id` | HTTP 201，4 个模块均生成；但 submit 顶层 `dispatchedOrders` 只返回 `id/moduleCode/status`，不返回 `handlerId`。后续 `GET /work-orders/:id` 和 `GET /dispatched-orders/:id` 可看到 handlerId。 | 部分通过；响应契约不满足“submit 返回每条 handler_id”的验收期望 | `req_9c96acb2-e2d7-4a26-8a62-7932ae318a0a`；记录为 `P3-E2E-001` |
| 4 | `GET /api/work-orders/:id` | 返回主单详情和子单状态；业务员视角字段过滤正常 | HTTP 200，返回主单、`extraData`、`dispatchedOrders`；业务员视角可见完整字段，符合“业务员主工单可见全部字段”矩阵 | 通过 | `step4 salesperson get work order detail` |
| 5 | 后道用户 `GET /api/dispatched-orders?page=1&pageSize=20&moduleCode=...` | 只看到自己模块子单 | 4 个模块列表接口均 HTTP 500，统一响应 `code=1000`。直接 `GET /api/dispatched-orders/:id` 可访问对应子单详情。 | 失败 | traceId：`req_7f928838-b1e2-46ae-8054-948f4dc5faa2`、`req_cccde286-5402-4b0a-94dc-20eac1f8a6ce`、`req_333ceb44-bb71-4772-b919-d242dc9e0a99`、`req_e244ca97-206a-4a83-a099-b05df0138d44`；记录为 `P3-E2E-002` |
| 6 | `POST /api/dispatched-orders/:id/accept` data_entry | `status=processing`，`accepted_at` 有值 | HTTP 201，`status=processing`，`acceptedAt=2026-05-11T04:10:10.626Z` | 通过 | `step6 accept data_entry` |
| 7 | 第二个同角色用户重复 accept 同一子单 | 返回冲突，期望 409/4220 | HTTP 409，业务码 `4201`，消息“子工单状态不允许接单” | 通过（冲突行为正确；业务码不是任务示例中的 4220，但语义可接受） | `req_0a68d956-8d0f-493e-8641-6e3e9e07dbd9` |
| 8 | `POST /api/dispatched-orders/:id/complete`，`extraData.data_entry_feedback=已办结` | 子单完成，字段回写 | HTTP 201，`status=completed`；后续主单 `extraData.data_entry_feedback=已办结` | 通过 | `step8 complete data_entry` |
| 9 | 依次 accept/complete social_security、onboarding_contact、contract | 全部子单 completed 后主单 `completed`，`completed_at` 有值 | 3 个模块 accept/complete 均 HTTP 201；主单 HTTP 200，`status=completed`，`completedAt` 有值 | 通过 | `step9 verify main completed` |
| 10 | 新建一单，submit → accept data_entry → return | 子单 returned，主单 returned | HTTP 201，子单 `status=returned` 且有 `returnReason`；主单 `status=returned` | 通过 | `step10 verify main returned` |
| 11 | 业务员再次 `GET /api/work-orders/:id` | hidden 字段不返回，敏感字段按场景处理 | 业务员主工单场景按矩阵可见 53 个 `extraData` 键，`id_card_no` 明文返回；符合“业务员主工单可见全部字段”配置。未在本轮验证 non-salesperson 的主单隐藏场景。 | 通过（本步骤限业务员视角） | `req_b64c111e-68f3-40a0-954a-3a3b70764efc` |

### 3.1 核心流程统计

- 11 步中：通过 9 步，部分通过 1 步，失败 1 步。
- 脚本原始断言统计：34 个请求中 27 个通过、7 个失败；其中旧 bug 010 的 2 个失败为脚本请求体缺少必填 `roles` 导致，已用完整请求体单独复测通过。
- 关键业务闭环：创建草稿 → 提交派发 → 接单 → 重复接单冲突 → 完成 → 主单完成 → 退回主单，已跑通。

## 4. Phase 2 遗留 bug 复测

| ID | 复测项 | 复测结果 | 结论 |
|---|---|---|---|
| P2-BE-REWORK-009 | `POST /api/admin/dispatch-rules/simulate`，请求 `{orderType:'onboarding', fields:{need_onboarding_contact:'是', need_company_contract:'是'}}` | HTTP 201，`code=0`；`matchedRules/targetModules` 包含 `data_entry/social_security/onboarding_contact/contract` 4 个模块；traceId `req_e56f5067-2c37-4619-8777-e0c0bfa4bef7` | 已修复 |
| P2-BE-REWORK-010 | `POST /api/admin/users` create 后 `GET /api/admin/users/:id` | 使用包含 `roles:[{roleId,departmentId,isPrimary:true}]` 的合法请求体后，创建 HTTP 201、详情 HTTP 200，返回新用户 `qa_p3_ok_*` | 已修复 |
| P2-BE-REWORK-011 | `cd backend && npm.cmd run test:e2e` | `PASS test/auth.e2e-spec.ts`，11/11 tests passed；未出现 Jest worker failed to exit gracefully warning | 已修复（e2e 口径） |

## 5. 新发现问题

### P3-E2E-001 submit 响应未返回子工单 handlerId

- 现象：`POST /api/work-orders/:id/submit` 返回的顶层 `dispatchedOrders` 数组仅包含 `id/moduleCode/status`，不含 `handlerId/handlerName/visibleFields`。
- 影响：不满足本轮验收“提交后检查返回中有 4 条子工单且每条都有 handler_id”的契约；前端若依赖 submit 响应直接展示派单人，需要再请求详情。
- 补充：`workOrder` 详情内的 `dispatchedOrders` 以及 `GET /api/work-orders/:id` 可返回 `handlerId`，说明派发绑定本身成功。
- 建议：统一 submit 响应契约，将顶层 `dispatchedOrders` 补齐 `handlerId`，或移除顶层精简数组，仅保留完整 `workOrder.dispatchedOrders`。

### P3-E2E-002 `GET /api/dispatched-orders` 列表接口 500

- 现象：后道用户分别请求：
  - `GET /api/dispatched-orders?page=1&pageSize=20&moduleCode=data_entry`
  - `GET /api/dispatched-orders?page=1&pageSize=20&moduleCode=social_security`
  - `GET /api/dispatched-orders?page=1&pageSize=20&moduleCode=onboarding_contact`
  - `GET /api/dispatched-orders?page=1&pageSize=20&moduleCode=contract`
- 实际：均返回 HTTP 500，统一响应 `{code:1000,data:null,message:'Internal server error',traceId}`。
- 影响：后道执行层“我的子工单列表”不可用，是 Phase 3 核心页面/API 阻塞缺陷；虽然直接详情、接单、完成接口可用，但用户无法通过列表进入待办。
- 证据 traceId：`req_7f928838-b1e2-46ae-8054-948f4dc5faa2`、`req_cccde286-5402-4b0a-94dc-20eac1f8a6ce`、`req_333ceb44-bb71-4772-b919-d242dc9e0a99`、`req_e244ca97-206a-4a83-a099-b05df0138d44`；补充复现 `req_7232ef1e-99a8-4bf7-9d94-4a86dee3f26f`。
- 建议：后端在 `DispatchedOrderService.findAll()` 打开 SQL 错误日志，重点检查分页 DTO 字段、`getCount()` + join、`moduleCode` 过滤与 `applyUserScope` 的 QueryBuilder 参数。

## 6. 其他注意事项

1. seed 账号与任务描述不一致：任务描述中的 `salesperson/salesperson123` 不存在，本次使用 `sales01/admin123`；建议文档统一。
2. 控制台直接 `Get-Content` 中文可能显示乱码，但 Node 结果文件中的中文 code point 验证正确，属于 PowerShell 控制台编码显示问题，不影响接口数据。
3. 现有报告中的 `tests/phase3-e2e-results.json` 为最终原始证据；早期根目录 `phase3-e2e-results.json` 为上一轮编码问题产物，不作为本次最终结论依据。
