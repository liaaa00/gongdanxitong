# 仪表盘 / 工单列表问题复现与回归验证清单（2026-05-21）

## 1. 已定位问题

### P0：仪表盘“节点总表”触发 `pageSize must not be greater than 100`
- 复现入口：登录后进入 `/dashboard`，查看或切换总表维度（节点总表 / 工单类型总表）。
- 根因定位：`frontend/src/services/dashboard.ts` 的旧后端兼容降级路径会调用：
  - `/api/dispatched-orders?page=1&pageSize=10000`
  - `/api/work-orders?page=1&pageSize=10000`
- 后端统一分页 DTO 存在 `@Max(100)`，因此请求被校验层拒绝。
- 已补充自动化回归：`frontend/src/services/dashboard.test.ts`，断言仪表盘降级聚合请求 `pageSize <= 100`。

### P1：业务员导入工单后仪表盘未显示更新
- 需要验证导入成功后：
  1. 本月工单总数按当前角色口径增加；
  2. 处理中 / 已完成按主工单或子工单状态刷新；
  3. 总表按节点或工单类型聚合刷新；
  4. 浏览器不依赖旧 localStorage/mock 数据。
- 建议优先使用真实后端接口 `/dashboard/cards`、`/dashboard/order-type-matrix` 或当前兼容聚合接口验证。

### P1：工单列表子工单显示“未派发”
- 期望：仅在主工单确实没有任何 `dispatched_orders` 子单时显示“未派发”。
- 若导入后已有分派记录，应显示各子工单模块名称与状态。
- 手工验证重点：导入成功后查主工单接口响应是否包含 `dispatched_orders`；若后端存在子单但前端仍显示“未派发”，属于前端字段映射问题；若后端无子单，属于导入/派发链路问题。

### P2：左上角显示“共享团队视角”
- 当前逻辑：工单列表中非 admin、非业务负责人、非业务组长、非业务员时默认显示“共享团队视角”。
- 对后道办理人员这是合理的后道/共享团队待办视角；对业务员如果出现该文案，应检查登录用户角色是否没有被规范化为 `business_group_member` / `business_group_leader`。

## 2. 角色口径测试矩阵

| 场景 | 样例角色 | 账号建议 | 本月工单总数 | 处理中 | 已完成 | 我的消息 |
| --- | --- | --- | --- | --- | --- | --- |
| 业务员 | `business_group_member` | aolei / 普通业务员 | 本人当月发起主工单数，不区分类别 | 本人发起且未办结 | 本人发起且已办结 | 字段被后道补充/更新、后道退回 |
| 业务组长 | `business_group_leader` | 业务组长账号 | 所负责团队成员当月发起主工单数 | 团队发起且未办结 | 团队发起且已办结 | 同业务团队口径 |
| 业务负责人 | `business_owner` | 业务负责人账号 | 全部业务员当月发起主工单数 | 全部业务员发起且未办结 | 全部业务员发起且已办结 | 同业务团队口径；额外显示负责人趋势图 |
| 后道办理人员 | 如 `contract_specialist`、`data_entry_team` | jianglu / 专员账号 | 当月流转到本人或本团队负责办理的子工单数 | 本人/团队负责且未办结 | 本人/团队负责且已办结 | 催办、即将超时、已超时、业务员修改、发起人撤回、发起人作废 |

## 3. 消息分类与高亮定位验证

| 接收角色 | 消息类型 | 触发动作 | 期望 |
| --- | --- | --- | --- |
| 业务员 | 数据修改 | 后道补充/编辑业务员关注字段 | 消息出现在业务员“数据修改”分类；点击可定位到工单详情对应字段；修改内容高亮 |
| 业务员 | 退回 | 后道退回工单 | 消息出现在业务员“退回”分类；可定位到退回原因和字段 |
| 后道 | 数据修改 | 业务员在未办结前修改字段并重提 | 消息出现在后道“数据修改”分类；对应字段高亮 |
| 后道 | 催办 | 业务员点击催办 | 消息出现在后道“催办”分类 |
| 后道 | 即将超时 / 已超时 | SLA 任务到达预警/逾期 | 消息分别进入“即将超时”“已超时”分类 |
| 后道 | 发起人撤回 / 作废 | 业务员发起撤回或作废 | 消息分别进入“发起人撤回”“发起人作废”分类 |
| 所有角色 | 正常派单 | 系统正常创建待办 | 不计入“我的消息”；只应出现在待办工单或我的待办数据中 |

## 4. 手工回归步骤

### 4.1 分页上限与节点总表
1. 登录任一有仪表盘权限账号。
2. 打开 `/dashboard`。
3. 打开浏览器 Network，刷新页面。
4. 期望：无 `pageSize must not be greater than 100`；请求 `/api/dispatched-orders` 或 `/api/work-orders` 时 `pageSize <= 100`。
5. 切换“节点总表 / 工单类型总表”，重复检查。

### 4.2 业务员导入后仪表盘刷新
1. 使用业务员账号登录。
2. 记录 `/dashboard` 四张卡片与总表数值。
3. 进入工单导入页，导入 1 条当月工单。
4. 回到 `/dashboard` 并刷新。
5. 期望：本月工单总数 +1；若导入后自动派发，节点总表对应子模块总数增加；工单列表该主工单不应错误显示“未派发”。

### 4.3 工单列表“未派发”判定
1. 导入或创建一条应自动派发的工单。
2. 打开 `/work-orders`，找到该工单。
3. 期望：子工单进度列展示模块 badge；仅当接口返回 `dispatched_orders: []` 或缺失时显示“未派发”。
4. 如显示异常，抓取 `/api/work-orders` 响应中该行的 `dispatched_orders` 作为前后端定位依据。

### 4.4 “共享团队视角”文案
1. 使用业务员账号打开 `/work-orders`。
2. 期望：显示业务员视角或业务组长视角，不应显示共享团队视角。
3. 使用后道办理人员账号打开 `/work-orders` 或后道待办入口。
4. 期望：可显示共享团队/后道视角，表示查看派发给本人或团队的工单。

## 5. 已执行自动化测试

### 通过
- `cd frontend && npm test -- --run src/services/dashboard.test.ts`
  - 3 passed：卡片字段归一化、节点总表 fallback pageSize、工单类型总表 fallback pageSize。
- `cd backend && npm test -- --runTestsByPath test/dashboard.spec.ts test/notifications.spec.ts test/import.service.spec.ts test/dispatched-order.service.spec.ts`
  - 其中 `test/dashboard.spec.ts`、`test/dispatched-order.service.spec.ts` 通过。

### 当前失败 / 受限
- 后端 `test/notifications.spec.ts`：未读消息 bucket 期望与现实现不一致；现实现合并为 `withdraw_void_request`，并新增 `creator_modified/todo/urge_feedback` 计数键。
- 后端 `test/import.service.spec.ts`：户籍类型枚举别名期望“城镇户口”，现实现归一为“非农业”。需产品确认口径后调整实现或测试。
- 前端组件组合测试 `MultiViewTable + Notifications + WorkOrder Detail` 在本环境 120 秒超时，未取得有效断言结果；建议修复后分拆为更小的组件/服务测试或使用 Playwright 单测关键路径。

## 6. 二次回归结果（任务重新分配后补充）

### 通过
- `cd frontend && npm test -- --run src/services/dashboard.test.ts`
  - 3 passed：确认仪表盘卡片字段归一化、节点总表 fallback、工单类型总表 fallback 都不再发送超过 100 的 `pageSize`。
- `cd backend && npm test -- --runTestsByPath test/dashboard.spec.ts test/notifications.spec.ts test/import.service.spec.ts test/dispatched-order.service.spec.ts`
  - `test/dispatched-order.service.spec.ts` 通过。

### 仍失败，需后端/产品口径继续处理
- `test/dashboard.spec.ts`：
  - `returns dashboard cards for backend handler with dispatched order scope` 因 `hasSupervisorLevel()` 的 mock 查询未返回数组导致 `rows.length` 读取 undefined。
  - `scopes team dashboard by module and current user for processors` 当前实现会先查 `module_supervisors`，并把 `data_entry_team` 判为 team scope；旧期望仍是 personal scope `[moduleCode, false, userId]`。需确认后道团队角色是否默认团队视角，确认后更新实现或测试。
- `test/notifications.spec.ts`：未读消息 bucket 现实现返回 `withdraw_void_request` 合并桶，并包含 `creator_modified/todo/urge_feedback` 零值键；旧期望仍拆分 `withdraw_request` / `void_request`。
- `test/import.service.spec.ts`：户籍类型别名“城镇户口”仍被归一为“非农业”；需确认导入时是否保留用户原文还是标准化枚举。
