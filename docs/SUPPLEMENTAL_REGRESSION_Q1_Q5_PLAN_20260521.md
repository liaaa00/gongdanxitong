# 架构差异补齐后的补充回归计划（Q1-Q5）

## 当前状态

- QA 任务：`ecd3bb33-547f-4a9f-b347-88484fa8b313`，已认领，等待依赖完成。
- 后端依赖：`8d4cbf9d-d563-4b55-8c5a-101ded0e1fd5`，当前仍 `in_progress`。
- 前端依赖：`1fe8d657-b698-449d-883f-b96a7a3c8cb7`，当前仍 `in_progress`。
- 因依赖未完成，本文只固化补充回归矩阵和执行步骤，不作为最终补充回归结论。

## 执行前置条件

仅当以下条件满足后执行最终补充回归并提交结果：

1. 后端任务 `8d4cbf9d-d563-4b55-8c5a-101ded0e1fd5` 已完成且进入 accepted 或至少 review_pending 可验证状态。
2. 前端任务 `1fe8d657-b698-449d-883f-b96a7a3c8cb7` 已完成且进入 accepted 或至少 review_pending 可验证状态。
3. 工作区包含后端/前端补齐实现：
   - 工单列表接口返回 `dispatched_orders/sub_orders` 摘要。
   - 前端仪表盘优先调用真实 `/dashboard/order-type-matrix`。
   - 消息入口默认不包含正常派单消息。
   - 后道角色在主工单列表入口不再误显示“共享团队视角”。
   - 字段变更通知包含可定位/高亮的字段元数据。

## Q1-Q5 回归矩阵

| 编号 | 回归目标 | 自动化/命令优先级 | 手工验证重点 | 通过标准 |
| --- | --- | --- | --- | --- |
| Q1 | 四角色仪表盘真实性：业务员、业务组长、业务负责人、后道 | 后端 `dashboard.spec.ts`；前端 `dashboard.test.ts`；必要时 Playwright/手工 | 分别登录 4 类账号，查看本月总数、处理中、已完成、我的消息、总表维度 | 业务员=本人当月发起；组长=负责部门；负责人=全量/负责范围；后道=流转到本人/团队的当月子工单；正常派单不计入消息 |
| Q2 | 子工单进度三态 | 后端 `work-order.service.spec.ts` 新增/更新列表包含 `dispatched_orders`；前端 WorkOrders 页面测试 | 准备 3 类主单：未生成/待派发、派发池/部分派发、处理中/已完成 | 列表不再一律“未派发”；空、派发池、处理中/完成能区分展示 |
| Q3 | 字段高亮跳转 | 后端通知/dirty mark 测试；前端 Notifications + Detail + DynamicForm 测试 | 业务员修改字段或后道补充字段后，从消息点击进入详情 | URL 携带 focus/highlight 信息；详情页滚动到目标字段；字段明显高亮；diff 字段名和值可见 |
| Q4 | 正常派单不入消息 | 后端 `notifications.spec.ts`；前端 BasicLayout/Notifications 测试 | 触发正常派单，查看顶部铃铛、消息中心、我的消息卡片、我的待办 | 正常派单只进入待办，不进入消息计数和消息中心；催办/退回/字段变更/SLA/撤回作废仍进入分类消息 |
| Q5 | pageSize 安全网 | 前端 `dashboard.test.ts`、request 参数夹紧测试；后端分页 DTO 测试；静态扫描 | DevTools 人工构造 `pageSize=10000` 或切换节点总表 | 前端请求被夹紧为 100；后端不再冒出 `pageSize must not be greater than 100`；静态扫描无 `pageSize > 100` |

## 建议执行命令

### 后端目标回归

```powershell
cd backend
npm test -- --runTestsByPath test/dashboard.spec.ts test/notifications.spec.ts test/import.service.spec.ts test/dispatched-order.service.spec.ts test/work-order.service.spec.ts test/return-resubmit.spec.ts test/work-order-withdraw.spec.ts test/p1-split4-dirty-return.spec.ts
npm run build
```

如后端补齐新增了专门测试文件（例如列表返回子工单摘要或 SLA cron），将其加入 `--runTestsByPath`。

### 前端目标回归

```powershell
cd frontend
npm test -- --run src/services/dashboard.test.ts src/pages/Notifications/index.test.tsx src/components/MultiViewTable/index.test.tsx src/pages/WorkOrders/Detail/index.test.tsx src/services/onboardingMockE2E.test.ts
npm test
npm run build
```

如前端补齐新增了 WorkOrders 列表、BasicLayout 消息入口、DynamicForm 高亮测试文件，将其加入目标命令。

### 静态扫描

```powershell
rg "pageSize\s*[:=]\s*(1[0-9]{2,}|[2-9][0-9]{2,}|10000)|limit\s*[:=]\s*(1[0-9]{2,}|[2-9][0-9]{2,}|10000)|includeDispatch\s*:\s*true|共享团队视角|未派发" frontend\src backend\src -n
```

检查原则：
- `pageSize` 只能出现 `<=100` 的合法请求或 clamp 常量。
- `includeDispatch:true` 不应出现在顶部铃铛/消息中心默认加载路径。
- “共享团队视角”只允许共享团队负责人语义使用，不可作为后道兜底。
- “未派发”不可再作为所有无子单的泛化状态。

## 手工验证脚本

### Q1 四角色仪表盘

1. 准备当月工单数据：至少包含业务员本人发起、同组他人发起、其他组发起、后道子单流转到本人/团队等数据。
2. 使用业务员账号登录 `/dashboard`：期望卡片和总表只统计本人当月发起。
3. 使用业务组长账号登录：期望统计负责部门/团队当月发起。
4. 使用业务负责人账号登录：期望统计业务范围全量，并显示负责人趋势图。
5. 使用后道账号登录：期望统计当月流转到本人/本团队的子工单，并显示办理节点总表。

### Q2 子工单进度三态

1. 主单 A：未触发派发规则或尚未生成子单。
2. 主单 B：子单生成但 handler 为空，处于派发池/待认领。
3. 主单 C：子单已认领/处理中/已完成。
4. 打开 `/work-orders` 或对应业务列表，确认三类状态文案和 badge 清晰区分。

### Q3 字段高亮跳转

1. 业务员修改未办结工单字段，或后道补充后道可编辑字段。
2. 接收方打开消息中心对应分类。
3. 点击消息跳转。
4. 期望进入目标主单或子单详情；目标字段滚动定位并高亮；变更前后值可见。

### Q4 正常派单不入消息

1. 新建/导入一条可正常自动派单的工单。
2. 查看顶部铃铛、消息中心列表、仪表盘“我的消息”。
3. 查看“我的待办/我的派发”。
4. 期望派单待办只在待办入口出现，不出现在消息入口；催办、退回、字段变更、SLA、撤回/作废仍进入消息。

### Q5 pageSize 安全网

1. 刷新 `/dashboard` 并切换节点总表/工单类型总表。
2. 检查 Network：`pageSize <= 100`。
3. 人工在控制台或请求层构造 `pageSize=10000`。
4. 期望前端 request 安全网夹紧为 100，后端不会返回 `pageSize must not be greater than 100`。

## 输出模板（依赖完成后填写）

- 执行时间：
- 代码状态 / 依赖任务状态：
- 通过项：
- 失败项：
- 受环境限制项：
- 执行命令与结果：
- 需业务确认项：
- 是否建议通过：
