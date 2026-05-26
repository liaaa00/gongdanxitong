# 最终回归验证与验收报告（2026-05-21）

## 最新团队状态（本次重新分配后确认）

- 后端接口与统计口径修复：`completed / accepted`。
- 前端仪表盘与列表页面修复：`completed / review_pending`，已进入可验证状态。
- 架构梳理与修复方案设计：仍 `in_progress`，不阻塞当前代码级最终回归，但后续若架构结论要求调整口径，应触发补充回归。
- QA 最终回归任务：已完成一轮可执行最终回归并提交评审；当前保持待命，不关闭会话。

## 结论

当前代码在可执行的自动化与静态检查范围内：**本次仪表盘 / 工单列表 / 消息中心相关修复通过回归**。

仍需说明：本轮未连接真实业务数据库执行浏览器端多角色实机导入；实机角色验收步骤保留在本文“手工验收脚本”中。后端全量单测仍有 1 个与本需求无关的 `workflow.service.spec.ts` 失败。

## 执行环境

- 工作目录：`D:\AI\SpeceAppDate\工单系统`
- 日期：2026-05-21
- 验证方式：后端 Jest、前端 Vitest、前后端 build、静态 pageSize 扫描、关键前端实现检查。

## 已执行命令与结果

| 命令 | 结果 |
| --- | --- |
| `cd backend && npm test -- --runTestsByPath test/dashboard.spec.ts test/notifications.spec.ts test/import.service.spec.ts test/dispatched-order.service.spec.ts test/work-order.service.spec.ts test/return-resubmit.spec.ts test/work-order-withdraw.spec.ts` | 7 passed / 69 tests passed |
| `cd frontend && npm test -- --run src/services/dashboard.test.ts src/pages/Notifications/index.test.tsx src/components/MultiViewTable/index.test.tsx src/pages/WorkOrders/Detail/index.test.tsx src/services/onboardingMockE2E.test.ts` | 5 passed / 20 tests passed |
| `cd backend && npm run build` | passed |
| `cd frontend && npm run build` | passed |
| 静态扫描 `rg "pageSize..." frontend\src backend\src` | 未发现 `pageSize > 100`；仅剩合法 `100` 与前后端 clamp 常量 |
| `cd frontend && npm test` | 18 passed / 69 tests passed |
| `cd backend && npm test` | 37 passed、1 failed、1 skipped；失败项为 `test/workflow.service.spec.ts` 工作流节点校验，与本次仪表盘/派发/消息回归无关 |

## 逐项验收清单

### 1. 节点总表及相关页面 pageSize 不超过 100

**状态：通过。**

证据：
- 后端 `PaginationQueryDto` 存在统一 `MAX_PAGE_SIZE = 100`、`@Max(MAX_PAGE_SIZE)` 与正整数裁剪。
- 前端 `request.ts` 统一拦截 `pageSize/page_size/limit/perPage` 并裁剪到 `MAX_PAGE_SIZE=100`。
- `dashboard.test.ts` 覆盖节点总表 `/dispatched-orders` 与工单类型总表 `/work-orders` fallback 请求，断言 `pageSize <= 100`。
- 静态扫描未发现 `pageSize: 10000` 或超过 100 的请求。

### 2. 多角色仪表盘当月统计口径

**状态：自动化通过；实机多账号验收待业务环境执行。**

证据：
- 后端 `dashboard.spec.ts` 覆盖：管理员全局、业务员本人、业务组长部门、业务负责人全局、后道办理人员流转/办理范围。
- 前端 `dashboard.test.ts` 覆盖业务侧当月工单列表聚合与消息 bucket 聚合。
- 后端目标套件 69 tests passed。

实机建议账号：业务员、业务组长、业务负责人、后道办理人员各 1 个。

### 3. 导入工单数据后仪表盘刷新

**状态：自动化链路通过；真实 Excel 导入 UI 待实机确认。**

证据：
- 后端 `import.service.spec.ts` 通过，覆盖导入字段校验与户籍别名保留。
- 后端 `work-order.service.spec.ts`、`return-resubmit.spec.ts`、`dispatched-order.service.spec.ts` 通过，覆盖工单提交/重提/派发链路。
- 前端 `onboardingMockE2E.test.ts` 通过，覆盖 mock 模式下创建、派发、退回、消息、字段权限链路。
- 前端 dashboard 卡片从当前月列表和消息 bucket 聚合，刷新后可反映导入/创建结果。

### 4. 子工单派发状态不再误显示“未派发”

**状态：通过（静态与自动化）。**

证据：
- `WorkOrders/index.tsx` 中空子单状态已改为“未生成/待派发”，并用 Tooltip 解释为后端未返回子工单/规则尚未生成或派发中，不再简单误导为“未派发”。
- 有子工单时展示模块 Badge 与状态文本。
- 后端派发相关测试 `work-order.service.spec.ts`、`dispatched-order.service.spec.ts` 通过。

### 5. “共享团队视角”仅在确实团队视角时展示

**状态：通过（静态）。**

证据：
- `WorkOrders/index.tsx` 视角逻辑区分 admin、业务负责人、业务组长、业务员、共享团队负责人、后道办理角色、受限角色。
- “共享团队视角”仅 `shared_team_owner` 显示；普通后道角色显示“后道办理视角”。

### 6. 消息中心分类、定位和高亮

**状态：自动化与静态通过；具体业务字段高亮需实机点击确认。**

证据：
- 后端 `notifications.spec.ts` 通过，覆盖正常派单默认不进入消息、未读 bucket 分类、业务员/后道分类桶。
- 前端 `Notifications/index.test.tsx` 通过，覆盖消息页加载、分类入口和业务消息展示。
- 前端通知页支持 `fromNotification` / 跳转链接规范化；工单详情相关测试通过。
- 后端 dirty mark / field diff 相关测试覆盖字段变更基础链路。

## 手工验收脚本（真实环境）

1. **pageSize / 节点总表**
   - 登录任意有仪表盘权限账号，打开 `/dashboard`。
   - 打开 Network，刷新并切换节点总表/工单类型总表。
   - 期望：无 `pageSize must not be greater than 100`；请求参数 `pageSize <= 100`。

2. **业务员导入后仪表盘刷新**
   - 业务员登录，记录仪表盘四个卡片和总表。
   - 导入 1 条当月工单。
   - 返回 `/dashboard` 刷新。
   - 期望：本月工单总数增加；对应总表行增加；工单列表可看到子工单进度或“未生成/待派发”的解释状态。

3. **组长 / 负责人 / 后道口径**
   - 分别使用业务组长、业务负责人、后道账号登录。
   - 期望：组长看本团队，负责人看全体，后道看流转到本人/本团队的当月子工单。

4. **消息中心**
   - 触发后道补充字段、后道退回、业务员催办、业务员修改、撤回/作废、SLA 预警/超时。
   - 期望：正常派单不计入“我的消息”；上述事件进入对应分类；点击消息能定位到工单/子工单并显示字段变更/高亮。

## 后续触发条件

如出现以下任一情况，应立即补跑最终回归：

1. 前端任务评审未通过并产生新的修复提交。
2. 架构任务完成后调整了仪表盘口径、消息分类或页面展示规则。
3. 后端/前端合并过程中相关文件发生变更：`dashboard`、`workOrders`、`dispatchedOrders`、`notifications`、`PaginationQueryDto`、`request.ts`。
4. 真实环境导入流程发现与自动化结果不一致。

建议补跑命令：

```bash
cd backend && npm test -- --runTestsByPath test/dashboard.spec.ts test/notifications.spec.ts test/import.service.spec.ts test/dispatched-order.service.spec.ts test/work-order.service.spec.ts test/return-resubmit.spec.ts test/work-order-withdraw.spec.ts
cd frontend && npm test -- --run src/services/dashboard.test.ts src/pages/Notifications/index.test.tsx src/components/MultiViewTable/index.test.tsx src/pages/WorkOrders/Detail/index.test.tsx src/services/onboardingMockE2E.test.ts
cd backend && npm run build
cd frontend && npm run build
```

## 剩余风险 / 需业务确认

- 未在本机连接真实数据库执行多账号浏览器导入流程，真实验收仍需按上方脚本跑一遍。
- 后端全量单测的 `workflow.service.spec.ts` 失败与工作流定义校验有关，非本任务功能，但建议由工作流任务负责人处理。
- 前端测试运行中有 jsdom 对 `getComputedStyle(..., pseudoElement)` 的非阻断警告，不影响本轮测试结果。
