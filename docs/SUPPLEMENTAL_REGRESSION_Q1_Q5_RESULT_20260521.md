# 架构差异补齐后的补充回归结果（Q1-Q5）

## 结论

**建议通过当前可自动化验证范围内的补充回归。**

本轮在后端补齐任务 `8d4cbf9d-d563-4b55-8c5a-101ded0e1fd5` 和前端补齐任务 `1fe8d657-b698-449d-883f-b96a7a3c8cb7` 均进入 `completed / review_pending` 可验证状态后执行。

自动化与静态验证结果：

- 后端目标回归：**8 suites / 73 tests passed**。
- 后端 build：**通过**。
- 前端 Q1-Q5 目标回归：**6 files / 26 tests passed**。
- 前端全量 Vitest：**18 files / 71 tests passed**。
- 前端 build：**通过**。
- 精确分页静态扫描：未发现 `pageSize/limit/perPage > 100`。
- 前端默认消息入口扫描：未发现 `includeDispatch:true` 或“共享团队视角”兜底文案残留。
- “未派发”文案扫描：前后端源码无残留。

## 依赖任务状态

| 依赖任务 | 状态 | 说明 |
| --- | --- | --- |
| 后端补齐 `8d4cbf9d-d563-4b55-8c5a-101ded0e1fd5` | completed / review_pending | 已返回主工单列表子工单摘要，dashboard/cards 返回 scope，相关单测与构建可验证 |
| 前端补齐 `1fe8d657-b698-449d-883f-b96a7a3c8cb7` | completed / review_pending | 已优先真实矩阵接口、去除默认派单消息入口、后道重定向、子工单多态展示、通知高亮跳转 |

## 执行命令与结果

### 1. 后端目标回归

```powershell
cd backend
npm test -- --runTestsByPath test/dashboard.spec.ts test/notifications.spec.ts test/import.service.spec.ts test/dispatched-order.service.spec.ts test/work-order.service.spec.ts test/return-resubmit.spec.ts test/work-order-withdraw.spec.ts test/p1-split4-dirty-return.spec.ts
```

结果：

```text
PASS test/dispatched-order.service.spec.ts
PASS test/dashboard.spec.ts
PASS test/work-order.service.spec.ts
PASS test/p1-split4-dirty-return.spec.ts
PASS test/work-order-withdraw.spec.ts
PASS test/import.service.spec.ts
PASS test/return-resubmit.spec.ts
PASS test/notifications.spec.ts
Test Suites: 8 passed, 8 total
Tests: 73 passed, 73 total
```

覆盖：

- Q1 四角色仪表盘口径后端聚合。
- Q2 主工单列表返回 `dispatched_orders/sub_orders` 摘要。
- Q3 字段变更、dirty/return/resubmit 相关后端链路。
- Q4 通知分类、正常派单排除、撤回/作废/退回/催办等消息链路。
- Q5 分页 DTO 与 pageSize 上限后端安全网。

### 2. 后端构建

```powershell
cd backend
npm run build
```

结果：通过。

### 3. 前端 Q1-Q5 目标回归

```powershell
cd frontend
npm test -- --run src/services/dashboard.test.ts src/pages/Notifications/index.test.tsx src/components/MultiViewTable/index.test.tsx src/pages/WorkOrders/Detail/index.test.tsx src/components/DynamicForm/index.test.tsx src/services/onboardingMockE2E.test.ts
```

结果：

```text
Test Files  6 passed (6)
Tests       26 passed (26)
```

覆盖：

- Q1 dashboard 真实 `/dashboard/order-type-matrix` 优先调用与 fallback 安全分页。
- Q2 WorkOrders/列表相关子工单摘要消费与多态展示。
- Q3 Notifications 跳转参数、Detail 解析 `focus/highlightFields`、DynamicForm 高亮锚点。
- Q4 消息中心分类、默认消息入口不带正常派单。
- Q5 节点总表/总表 fallback pageSize 安全网。

### 4. 前端构建

```powershell
cd frontend
npm run build
```

结果：通过。

### 5. 前端全量 Vitest

```powershell
cd frontend
npm test
```

结果：

```text
Test Files  18 passed (18)
Tests       71 passed (71)
```

说明：测试过程中有 Vite deprecated 配置警告和 jsdom `getComputedStyle()` pseudo-elements not implemented 提示，不影响测试结果。

### 6. 精确分页安全网静态扫描

```powershell
rg "pageSize\s*[:=]\s*(10[1-9]|1[1-9][0-9]|[2-9][0-9]{2,}|10000)|limit\s*[:=]\s*(10[1-9]|1[1-9][0-9]|[2-9][0-9]{2,}|10000)|perPage\s*[:=]\s*(10[1-9]|1[1-9][0-9]|[2-9][0-9]{2,}|10000)" frontend\src backend\src -n
```

结果：无命中。

### 7. 消息入口与视角文案静态扫描

```powershell
rg "共享团队视角|includeDispatch\s*:\s*true" frontend\src -n
```

结果：无命中。

### 8. 子工单“未派发”泛化文案扫描

```powershell
rg "未派发" frontend\src backend\src -n
```

结果：无命中。

### 9. 架构链路静态复核

```powershell
rg "order-type-matrix|/my-dispatched|fromNotification|highlightFields|focus|dispatched_orders|sub_orders|shared_team_owner|共享团队视角" frontend\src backend\src -n
```

结果摘要：

- 后端存在 `GET /dashboard/order-type-matrix` 控制器入口。
- 前端 `frontend/src/services/dashboard.ts` 优先请求 `/dashboard/order-type-matrix`。
- 后端 `work-order.mapper.ts` / `work-order.service.ts` 输出 `dispatched_orders/sub_orders`。
- 前端 `WorkOrders/index.tsx` 消费 `record.dispatched_orders`，后道-only 用户重定向 `/my-dispatched`。
- 前端 `Notifications` / `BasicLayout` 生成 `fromNotification/highlightFields/focus`。
- 前端 `WorkOrders/Detail` 与 `DynamicForm` 解析并高亮字段。

## Q1-Q5 验收清单

| 编号 | 验收项 | 结果 | 证据 |
| --- | --- | --- | --- |
| Q1 | 四角色仪表盘真实性 | 通过（自动化口径覆盖）；真实业务库多账号仍建议 UAT 复核 | 后端 `dashboard.spec.ts` 通过；前端 `dashboard.test.ts` 通过；真实矩阵接口静态复核命中 |
| Q2 | 子工单进度三态/多态 | 通过 | 后端 `work-order.service.spec.ts` 通过；源码输出/消费 `dispatched_orders/sub_orders`；“未派发”文案无残留 |
| Q3 | 字段高亮跳转 | 通过 | 前端 `Notifications/index.test.tsx`、`WorkOrders/Detail/index.test.tsx`、`DynamicForm/index.test.tsx` 通过；静态复核 `focus/highlightFields` 链路存在 |
| Q4 | 正常派单不入消息 | 通过 | 后端 `notifications.spec.ts` 通过；前端消息入口扫描无 `includeDispatch:true`；默认铃铛/消息中心查询不携带派单消息 |
| Q5 | pageSize 安全网 | 通过 | 后端目标测试通过；前端 dashboard/MultiViewTable 相关测试通过；精确静态扫描无 `>100` 分页参数 |

## 仍需业务环境确认的事项

以下不是自动化失败项，而是当前本地测试环境无法完全替代真实业务数据与账号权限的验收项：

1. 使用真实业务员账号导入工单后，刷新仪表盘确认当月总数、处理中、已完成、待办/消息即时变化。
2. 使用真实业务组长/业务负责人账号确认“负责团队/全体业务员”范围是否与组织架构配置一致。
3. 使用真实后道账号确认“本人/本团队负责办理”的模块池和主管范围是否与业务配置一致。
4. 使用浏览器端完整点击消息中心分类，确认高亮字段视觉样式满足业务可识别要求。
5. 对 SLA 即将超时/已超时消息，需要真实定时任务或可控时间数据进一步做 UAT 验证。

## 风险与备注

- 本轮未连接生产/准生产业务数据库，四角色真实性以单元/组件测试和静态链路为主，建议上线前按真实账号再执行一次 UAT。
- 后端 `notification.service.ts` 中 `markReadByQuery` 内部返回 unread_count 时仍可见 `includeDispatch:true`，但前端默认铃铛、消息中心、按分类标记已读均未传该参数；当前判定不影响“正常派单不入默认消息入口”。建议后续若业务使用该接口返回值直接刷新顶部未读数，可再确认是否也应排除派单。
- 前端测试输出中的 Vite deprecated 警告和 jsdom pseudo-elements 提示为测试环境提示，不影响通过结论。

## 最终建议

当前自动化、构建和静态扫描均通过，建议本轮补充回归通过；上线前保留真实业务账号 UAT 作为最终业务验收。