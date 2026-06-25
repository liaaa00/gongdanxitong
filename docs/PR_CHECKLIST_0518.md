# PR 模板 + P0 验收 Checklist + 本地自检命令套装（架构师 - 2026-05-20）

> 适用范围：0518 反馈整改阶段（任务卡总表见 `docs/IMPLEMENTATION_TASKS_0518.md`）。
> 三个部分：A. PR 标题/描述模板；B. P0 重点 20 张卡的验收 Checklist；C. 本地自检命令套装。
> 强制约束：每个 PR 必须按本文 A 部分填写描述；review 时按 B 部分逐项勾选；提交前必须按 C 部分跑完命令。

---

## A. PR 标题 / 描述模板

### A.1 标题规范（前后端通用）

```
[<TASK_ID>] <一句话总结>
```

举例：
- `[BE-01] 工单状态机扩展 withdraw_pending/void_pending/void`
- `[FE-06] WorkOrders 主列表精简 + 业务员视角修复`

约束：
- TASK_ID 必须是 `BE-\d+` 或 `FE-\d+`，与 `docs/IMPLEMENTATION_TASKS_0518.md` 一致；
- 一句话总结 ≤ 50 字，禁止使用「修复一些问题」「优化代码」等空话；
- 多卡合并 PR：标题用 `[BE-01,BE-02] ...`，但同一 PR 不超过 3 张卡，且必须同一阶段（P0/P1/P2）。

### A.2 后端 PR 描述模板

```markdown
## 任务卡
- 任务卡 ID：BE-XX（多卡用逗号分隔）
- 阶段：P0 / P1 / P2
- 关联文档：docs/IMPLEMENTATION_TASKS_0518.md#BE-XX

## 变更主要点
- [ ] 文件 A：变更点描述
- [ ] 文件 B：变更点描述
- [ ] 新增 migration：xxx.ts（如有）
- [ ] 新增/调整 DTO：xxx.dto.ts（如有）

## 验收用例
- TC-XX-NNN（用例标题简述）
- TC-XX-NNN（用例标题简述）

> 验收用例必须取自 docs/test_cases_0518.md，且与本卡对应。

## 接口契约
- 新增/变更接口：
  - `POST /api/work-orders/{id}/withdraw`
    - Request: `{ "reason"?: string }`
    - Response 200: `{ "id":"uuid", "status":"withdraw_pending" }`
    - Response 403/409 行为说明：...
- 废弃接口：（如有）
- 兼容性：保留 / 不保留 / 1 个版本后下架

## 数据迁移
- 是否需要：是 / 否
- migration 文件：`backend/src/database/migrations/xxx.ts`
- 是否可回滚：是 / 否（说明理由）
- 生产执行命令：`npm run migration:run`
- 回滚命令：`npm run migration:revert`
- 数据风险：（如改 enum、删字段，列出已评估范围）

## 是否需联调
- 与前端 PR 联调：是 / 否
- 联调对象 PR：FE-XX（链接）
- 是否 block 其他卡：是 / 否
- 被本卡 block 的卡：BE-XX、FE-XX

## 自检
- [ ] `cd backend && npm run lint`
- [ ] `cd backend && npm run build`（含 tsc 校验）
- [ ] `cd backend && npm test -- --testPathPattern=<相关 spec>`
- [ ] migration dry-run（如有）：`npm run typeorm -- migration:show`
- [ ] 手动验证关联 TC 用例
- [ ] 已更新接口契约相关 .md（如 docs/Phase3前后端联调契约.md）

## 截图/录屏
（数据/日志样本或终端截图，非 UI 改动可忽略）

## 备注
（如本 PR 与摸底报告不一致的地方，需说明决策依据）
```

### A.3 前端 PR 描述模板

```markdown
## 任务卡
- 任务卡 ID：FE-XX（多卡用逗号分隔）
- 阶段：P0 / P1 / P2
- 关联文档：docs/IMPLEMENTATION_TASKS_0518.md#FE-XX

## 变更主要点
- [ ] 文件 A：变更点描述
- [ ] 文件 B：变更点描述
- [ ] 新增页面/组件：xxx
- [ ] 删除冗余代码：xxx（行号区间）

## 验收用例
- TC-XX-NNN（用例标题简述）
- TC-XX-NNN（用例标题简述）

## 依赖后端接口
- 后端任务卡：BE-XX（已 merge / 待 merge）
- 调用接口：
  - `GET /api/dashboard/cards`
  - `POST /api/work-orders/{id}/withdraw`
- 接口契约文档：本卡描述 + docs/IMPLEMENTATION_TASKS_0518.md#BE-XX

## 是否需联调
- 是否依赖未 merge 的后端卡：是 / 否
- 临时 mock：是 / 否（位置：`frontend/src/mocks/...` 或 MSW handler）
- 切到真实接口的 PR/commit：xxx

## 自检
- [ ] `cd frontend && npm run lint`
- [ ] `cd frontend && npm run build`（含 tsc 校验）
- [ ] `cd frontend && npm test`
- [ ] `cd frontend && npm run dev` 本地手测对应页面
- [ ] 浏览器手测验收用例 TC-XX-NNN
- [ ] 截图存档对比改动前/改动后

## 是否 block 其他卡
- block 的卡：FE-XX、BE-XX
- 被 block 的卡：FE-XX、BE-XX

## 截图/录屏
（必须，至少包含改动后效果图；UI 修复需对比图）

## 备注
（任何与摸底报告或总规划不一致的决策，需说明）
```

### A.4 共性约束

- 不允许跨阶段合并（P0 卡不能与 P2 卡同 PR）；
- 不允许仅有一句话描述（最少要勾选「变更主要点」≥2 项）；
- 不允许跳过 `自检` 区域；
- 删除文件必须在描述中显式声明，避免 review 时遗漏；
- 涉及 `extra_data` JSONB 修改、`work_orders.status` 枚举修改、字段配置变更的 PR，必须额外在描述中加 `## 影响存量数据` 段说明。

---

## B. 阶段 P0 重点卡的验收 Checklist

> 每张卡 3-6 个可勾选项目，全部为可执行/可验证动作。
> Reviewer 按列表逐项勾选；任一项目无法勾选 → block PR。

### B.1 后端 P0 卡

#### BE-01　工单状态机扩展（withdraw_pending / void_pending / void）

- [ ] 检查 `backend/src/entities/enums.ts` `WorkOrderStatus` 枚举包含 3 个新值 `WITHDRAW_PENDING / VOID_PENDING / VOID`
- [ ] 检查 `backend/src/database/migrations/2026XXXX-WorkOrderStatusExtend.ts` 存在，每条 `ALTER TYPE ... ADD VALUE` 单独提交（PostgreSQL 不允许同事务多 add）
- [ ] 在干净 DB 上执行 `cd backend && npm run migration:run` 不报错；执行 `npm run migration:revert` 给出"不可恢复"提示但不破坏数据
- [ ] 跑单测 `cd backend && npm test -- --testPathPattern=enums`（如无既存 spec，新增 `backend/test/work-order-status-enum.spec.ts` 验枚举完整）
- [ ] 在 `backend/src/common/auth/role-permissions.ts` 或新建常量文件确认导出 `WORK_ORDER_TERMINAL_STATUSES = ['completed','withdrawn','void']`
- [ ] PR 描述里写明：本卡 block BE-02/BE-03/FE-09，必须先合并

---

#### BE-02　业务员撤回 / 撤回审批接口

- [ ] 检查 `backend/src/modules/work-orders/work-order.controller.ts` 新增两个端点 `@Post(':id/withdraw')` 与 `@Post(':id/withdraw/approve')`
- [ ] 检查新增 `dto/withdraw.dto.ts`、`dto/withdraw-approve.dto.ts` 含 class-validator 装饰器
- [ ] `withdraw` 流程：发起人 + admin 才能调用；`withdraw/approve` 仅当前未办结子工单 handler / 模块主管 / admin 可调；其它角色 403
- [ ] `operation_logs.payload` 中 `previous_status` 字段保存原状态，approve(false) 时能回滚
- [ ] 跑单测 `cd backend && npm test -- --testPathPattern=work-order` 至少 4 个新用例：成功撤回 / 已 completed 拒绝 409 / 跨人 403 / 拒绝回滚
- [ ] 触发 `withdraw_request` 通知给所有未办结子工单 handler，可在 `notifications` 表查到记录

---

#### BE-03　业务员作废 / 作废审批接口

- [ ] 检查 `backend/src/modules/work-orders/work-order.controller.ts` 新增 `@Post(':id/void')` 与 `@Post(':id/void/approve')`
- [ ] `dto/void.dto.ts` `reason` 字段标 `@IsString() @MinLength(1)` 必填
- [ ] 状态机：`pending|processing|returned|withdraw_pending → void_pending`；approve(true) → `void`；approve(false) → 原状态
- [ ] 在 `dispatched-order.service.ts` 入口（accept/complete/return/claim）检查父工单状态属于 `void/void_pending/withdraw_pending` 时返回 409（与 BE-04 共同实现可在同一 PR）
- [ ] 跑单测 `cd backend && npm test -- --testPathPattern=work-order|dispatched-order`，至少覆盖：作废通过 / 作废拒绝 / 作废后子工单不能办理 409
- [ ] 通知三类 `void_request`、`void_approved`、`void_rejected` 在 `seed-notification-templates.ts` 中存在

---

#### BE-04　催办接口 + 子工单守卫

- [ ] 检查 `backend/src/modules/work-orders/work-order.controller.ts` 新增 `@Post(':id/urge')`，`work-order.service.ts` 新增 `urge()` 方法
- [ ] 限流：同一工单同一 module 30 分钟内重复调用返回 429（service 内查 `operation_logs` 最近一条 `urge` action 的时间）
- [ ] 触发 `urge_received` 通知给目标 module 当前 handler，payload 含发起人、工单号、距上次催办时长
- [ ] `dispatched-order.service.ts` 中 `accept/complete/return/claim` 入口加守卫：父工单状态 ∈ `{void, void_pending, withdraw_pending}` → 409
- [ ] 跑单测 `cd backend && npm test -- --testPathPattern=work-order|dispatched-order`：含催办成功、限流 429、守卫拒绝 3 个用例
- [ ] PR 描述声明：FE-06 依赖本卡

---

#### BE-05　仪表盘 4 卡片接口（按角色取数）

- [ ] 检查 `backend/src/modules/dashboard/dashboard.controller.ts` 新增 `@Get('cards')`
- [ ] `dashboard.service.ts` 内根据 `user.roles` 选择查询分支：业务员/组长/负责人/后道/管理员各一个；逻辑覆盖测试见 `backend/test/dashboard.spec.ts`
- [ ] 当月口径用 `date_trunc('month', now() AT TIME ZONE 'Asia/Shanghai')`，与现有 `getSalespersonMetrics` 一致
- [ ] `myMessages` 字段来自 `notifications WHERE user_id=:sub AND is_read=false`
- [ ] 旧端点 `/dashboard/salesperson|/team/:module|/manager` 加 `/** @deprecated */` 注释；保持 1 版本不删除
- [ ] 跑单测 `cd backend && npm test -- --testPathPattern=dashboard`，新增至少 2 个角色分支用例

---

#### BE-06　仪表盘按工单类型总表 + 业务负责人趋势

- [ ] 检查 `dashboard.controller.ts` 新增 `@Get('order-type-matrix')` 与 `@Get('leader-trend')`，后者使用 `@Roles(...BUSINESS_MANAGER_ROLES, 'admin')`
- [ ] `order-type-matrix` 返回 4 条记录（onboarding/renewal/resignation/benefit），含 `total/processing/completed/completionRate`
- [ ] `leader-trend?orderType=...` 返回最近 12 个月分桶，每桶 `{month, total, completed, rate}`，按角色限定数据范围
- [ ] 非负责人/管理员调 `leader-trend` 返回 403；测试 `cd backend && npm test -- --testPathPattern=dashboard`
- [ ] SQL 写法用 `WITH bounds AS (...)`，与 BE-05 共用日期口径
- [ ] 接口契约对齐 `docs/IMPLEMENTATION_TASKS_0518.md#BE-06` 示例 JSON

---

#### BE-07　通知分类重写 + 计数与列表条件统一

- [ ] 新增 `backend/src/modules/notifications/biz-types.ts` 集中常量；`fallback templates` 引用该常量
- [ ] `notification.controller.ts` 新增 `@Get('unread-count-by-bucket')`，返回业务员桶 + 后道桶 + 系统桶
- [ ] `dto/query-notifications.dto.ts` `unread` 字段加 `@Transform(({value}) => value === true || value === 'true')`，修复 BUG-3
- [ ] `notification.service.ts` 抽 `private buildScope(query)` 方法，`list()` 与 `countUnread()` 共享
- [ ] `field-change.hook.ts onWorkOrderUpdated()` 收件人收紧：仅未办结子工单 handler，**不**给发起人本人发
- [ ] `seed-notification-templates.ts` 新增 5 个模板：`urge_received / withdraw_request / withdraw_approved / void_request / void_approved`
- [ ] 跑单测 `cd backend && npm test -- --testPathPattern=notification`：含 list/count 一致性测试 + 新模板存在

---

#### BE-08　共享负责人按模块筛选修复（B5）

- [ ] 检查 `dispatched-order.service.ts findAll()` 调用顺序：先 `applyCommonFilters`，再 `applyUserScope`
- [ ] `applyUserScope()` 内当 `query.moduleCode` 已存在时，把内部 `OR module_code IN modules` 改为 `AND module_code IN modules`
- [ ] 新增 `backend/test/dispatched-order-supervisor-filter.spec.ts`：江璐账号传 `moduleCode=contract` 仅返回 contract 子单（非空且无 onboarding_contact 项）
- [ ] 旧测试 `dispatched-order.service.spec.ts` 不被破坏
- [ ] PR 描述附江璐账号 + 杨纯/毛雅妮场景的回归测试通过截图
- [ ] 跑 `cd backend && npm test -- --testPathPattern=dispatched-order`

---

#### BE-09　子工单批量办理路由确认 + remark 校验

- [ ] 确认 `dispatched-order.controller.ts` 已存在 `@Post('batch-complete')` 与 `@Post('social-insurance/batch-complete')`
- [ ] `dto/batch-complete.dto.ts` 中 `remark` `@IsString() @MinLength(1)`，`ids` `@ArrayMaxSize(50) @ArrayMinSize(1)`
- [ ] service 内对每个 id 调 `assertCanHandle`，跨 handler 的 id 进入 `skipped[]` 而非整体失败
- [ ] 新增/补全单测 `cd backend && npm test -- --testPathPattern=dispatched-order`，覆盖：全部成功 / 部分跳过 / remark 缺失 400
- [ ] 接口返回结构 `{ success, completed, skipped: [{id, reason}] }` 与文档一致
- [ ] PR 描述声明：FE-08 依赖本卡

---

#### BE-12　删除 / 停用 social_urge 字段

- [ ] `backend/src/database/seeds/seed-fields.ts` `social_urge` 改 `isActive: false, required: false, defaultRequired: false`
- [ ] 删除 `seed-field-permissions.ts` 中所有 `social_urge` 引用
- [ ] 删除 `backend/src/modules/ai/ai-mapping.service.ts FIELD_ALIASES.social_urge`
- [ ] 删除 `backend/src/modules/imports/field-validation.service.ts HEADER_ALIASES.social_urge`
- [ ] 新建 migration `backend/src/database/migrations/2026XXXX-DropSocialUrge.ts`，含三条 SQL：① `UPDATE field_configs SET is_active=false, is_required=false WHERE field_code='social_urge'` ② `DELETE FROM field_permissions WHERE field_code='social_urge'` ③ `UPDATE work_orders SET extra_data = extra_data - 'social_urge' WHERE extra_data ? 'social_urge'`
- [ ] 跑 `cd backend && npm run migration:run` 后执行 `npm run seed`，确认 field_configs 中 social_urge 仍为 inactive
- [ ] 跑 `cd backend && npm test -- --testPathPattern=field-validation|imports`：导入不再要求 social_urge

### B.2 前端 P0 卡

#### FE-01　WorkOrders 列表 / Detail 文件去重

- [ ] `frontend/src/pages/WorkOrders/index.tsx` 仅保留一段 `const WorkOrders: React.FC` 与一处 `export default`，删除原 line 405~717 的重复段
- [ ] `frontend/src/pages/WorkOrders/Detail/index.tsx` 仅保留一段 `WorkOrdersDetail` 组件与一处 `export default`，删除原 line 359~755 的重复段
- [ ] 跑 `cd frontend && npm run build` 通过（含 `tsc -b`）
- [ ] 跑 `cd frontend && npm run lint` 无新报错
- [ ] 浏览器打开 `/work-orders` 与 `/work-orders/:id` 渲染正常
- [ ] PR 描述声明：本卡 block FE-02、FE-06、FE-07、FE-08、FE-13

---

#### FE-02　左侧菜单按角色重排 + 「我的工单」4 子菜单

- [ ] `frontend/src/layouts/BasicLayout.tsx` 中 `RAW_MENU` 重写：顶层 6 项（仪表盘/入职/在职/离职/我的工单/消息通知，+ admin 管理后台）
- [ ] 「我的工单」下 4 个子菜单：`/my-work/initiated`、`/my-work/pending`、`/my-work/done`、`/my-work/team`
- [ ] 「主工单列表」与「新建入职」合并；菜单中删除 `/work-orders/new` 独立项；删除 `/renewal/new`、`/resignation/new`、`/benefit/new` 独立项
- [ ] `frontend/src/config/routeVisibility.ts` 增加 `social_insurance_specialist` 角色映射；`/my-work/*` 路径加入可见性表
- [ ] `frontend/src/constants/roles.ts` 新增 `social_insurance_specialist` 进 `CANONICAL_ROLES`
- [ ] 用 5 个角色（业务员/合同专员/入离职联系/数据录入岗/社保专员）登录验证菜单与 `docs/REMEDIATION_PLAN_0518.md#5.1` 表一致
- [ ] 跑 `cd frontend && npm run build`、`npm run lint`

---

#### FE-03　左下角姓名直显（去 hover）

- [ ] `frontend/src/layouts/BasicLayout.tsx avatarProps` 在头像旁渲染 `<span>{user.real_name||user.username}</span>` 文字（永久可见，非 Tooltip/Popover 触发）
- [ ] ProLayout 菜单收起态下姓名仍显示（或显示首字母简写），不要消失
- [ ] 跑 `cd frontend && npm run dev`，登录后无需 hover 即可看到左下角姓名
- [ ] 跑 `cd frontend && npm run build` 通过
- [ ] 截图：登录后初始页面截图（左下角清晰可见姓名）
- [ ] 验收用例 TC-DASH-001 通过

---

#### FE-04　顶部消息铃铛 Tabs 重写 + 一致计数

- [ ] `frontend/src/layouts/BasicLayout.tsx` 顶部 Popover Tabs 改为按角色出现：业务员桶 / 后道桶 + 系统桶
- [ ] `frontend/src/services/notifications.ts` 新增 `getUnreadCountByBucket()`，调用 `GET /notifications/unread-count-by-bucket`
- [ ] `fetchAll()` 替换为新接口，确认桶之和 == 全局未读数
- [ ] 移除 `unreadByType.sla/task/system` 写死逻辑
- [ ] 在浏览器中手动制造 1 条 `urge_received` + 1 条 `withdraw_request` 通知（可调后端 seed），验证桶分类正确
- [ ] 跑 `cd frontend && npm run build` 与 `npm run lint`

---

#### FE-05　Dashboard 4 卡片 + 总表 + leader 趋势重写

- [ ] `frontend/src/pages/Dashboard/index.tsx` 删除 `PERIOD_OPTIONS` 与 `Segmented period` 切换
- [ ] 顶部渲染 4 张 `<Statistic>`：本月工单总数 / 处理中 / 已完成 / 我的消息（点击「我的消息」跳 `/notifications`）
- [ ] 中部 `<ProTable>` 渲染 `/dashboard/order-type-matrix`，列与 BE-06 契约一致
- [ ] 业务负责人/管理员可见 `<LeaderTrendChart>`（recharts 折线图，3 标签 onboarding/renewal/resignation 切换）
- [ ] `frontend/src/services/dashboard.ts` 新增 `getDashboardCards / getOrderTypeMatrix / getLeaderTrend`，旧方法保留 1 版
- [ ] 用 5 个角色登录验证 4 卡片数值口径与 TC-DASH-002~006 一致
- [ ] 跑 `cd frontend && npm run build`、`npm run lint`

---

#### FE-06　WorkOrders 主列表精简 + 业务员视角修复

- [ ] `frontend/src/pages/WorkOrders/index.tsx` 用 `<ProTable>` 替换 `MultiViewTable`；不再使用看板/网格/列配置
- [ ] 顶部搜索 5 字段保留：客户代码 / 客户名称 / 员工姓名 / 员工证件号 / 状态
- [ ] 操作列：详情 / 修改 / 撤回 / 作废 / 催办 / 删除（删除仅 admin；其它仅业务员且非终态）
- [ ] `viewDescription()` 默认 fallback 由「共享团队视角」改为「业务员视角」（修 B2.3）
- [ ] `frontend/src/services/workOrders.ts` 新增 `withdrawWorkOrder/voidWorkOrder/urgeWorkOrder`，调用 BE-02/03/04 端点
- [ ] 已办结/已撤回/已作废工单：操作列只剩「详情」按钮
- [ ] 跑 `cd frontend && npm run build`，浏览器手测撤回/作废/催办按钮均能成功调通后端

---

#### FE-07　WorkOrders 详情页删除 工单动态 / 工单进度 / 流转链

- [ ] `frontend/src/pages/WorkOrders/Detail/index.tsx` 删除 `Tabs items` 中 `TIMELINE_TAB_KEY` 项（工单动态 Tab）
- [ ] 删除 `<Card title="工单进度">` 整段（含 `<Steps>` + `<Timeline>` 流转链）
- [ ] 删除顶部「工单动态」按钮
- [ ] 保留 `Tabs` 中：工单信息 / 子工单状态
- [ ] 已办结工单顶部按钮只剩「返回列表」
- [ ] 浏览器打开任一已办结/进行中工单详情，对照截图无上述区域
- [ ] 跑 `cd frontend && npm run build`、`npm run lint`

---

#### FE-08　MyDispatched 4 视图 + 6 字段筛选 + 批量办理

- [ ] `frontend/src/pages/MyDispatched/index.tsx` 改为受 `mode` 参数控制的多视图：`initiated / pending / done / team`
- [ ] `frontend/src/routes/index.tsx` 新增 4 路由 `/my-work/{initiated|pending|done|team}`，`LEGACY_ROUTE_ALIASES` 兼容旧 `/my-dispatched`、`/team-dispatched`
- [ ] 顶部筛选 6 字段：节点类型 / 工单类型 / 状态 / 工单所属月份（DatePicker.MonthPicker）/ 客户 / 员工证件号
- [ ] toolBar 增加「批量办理」按钮 → Modal 收 remark + 可选 extraData → `POST /dispatched-orders/batch-complete`；社保模块走 `social-insurance/batch-complete`
- [ ] 模块搜索字段名透传统一为 `moduleCode`（前端入参修复 B5）
- [ ] 用江璐账号验证 TC-BUG-007、TC-BUG-006、TC-MYWORK-001/002
- [ ] 跑 `cd frontend && npm run build`、`npm run lint`、`npm test`

---

#### FE-09　工单状态枚举映射 + UI 一致

- [ ] 新建 `frontend/src/constants/workOrderStatus.ts`（或扩展 `dictionaries.ts`）集中 STATUS_MAP，含 `withdraw_pending / void_pending / void` 三个新值
- [ ] grep `STATUS_MAP` 替换 `WorkOrders/index.tsx`、`WorkOrders/Detail/index.tsx`、`MyDispatched/index.tsx`、`TeamDispatched/index.tsx` 等所有使用点
- [ ] 状态颜色对齐：`withdraw_pending → gold`、`void_pending → gold`、`void → default`
- [ ] 跑 `cd frontend && npm run build`、`npm run lint`，确保无未定义状态
- [ ] 浏览器手测一个 `withdraw_pending` 工单，状态标签正确显示「撤回审批中」
- [ ] PR 描述声明：FE-06 依赖本卡（同 PR 提交也可）

---

#### FE-13　删除 social_urge 字段（前端清理）

- [ ] `frontend/src/services/fields.ts` 默认字段清单移除 `social_urge`
- [ ] `frontend/src/pages/WorkOrders/Detail/index.tsx` `FIELD_GROUPS` 中「社保公积金（参考）」分组移除 `social_urge`
- [ ] `frontend/src/pages/Admin/ExportTemplates/index.tsx` `FIELD_OPTIONS` 中删除 `social_urge`
- [ ] 全局 grep `social_urge`，业务代码中所有引用移除（mock seed/测试数据可保留以验测试）
- [ ] 浏览器打开「新建入职工单」表单，无该字段；批导入流程也不再要求该字段
- [ ] 跑 `cd frontend && npm run build`、`npm run lint`

---

## C. 本地自检命令套装

> 所有命令在 PowerShell 7（Windows 11）下验证。Linux/macOS 请用同名 bash 命令。
> 工作目录约定：`D:\AI\SpeceAppDate\工单系统`。

### C.1 后端命令（`cd backend`）

#### 安装依赖
```powershell
cd D:\AI\SpeceAppDate\工单系统\backend
npm ci
```
> 用 `npm ci` 而非 `npm install`，保证 `package-lock.json` 一致；首次安装失败时退化用 `npm install`。

#### 类型检查 / 编译
```powershell
npm run build
```
> 内部执行 `nest build && tsc-alias`；编译报错代表 TypeScript 不通过，禁止合并。

#### Lint
```powershell
npm run lint
```
> 内部 `eslint "{src,test}/**/*.ts" --fix`；CI 跑同命令但不带 `--fix`，本地修完手动 `git add -p`。

#### 单元测试（全量）
```powershell
npm test
```
> 内部 `jest --config ./test/jest-unit.json --runInBand`，spec 目录是 `backend/test/*.spec.ts`。

#### 单元测试（按文件名匹配）
```powershell
npm test -- --testPathPattern=dispatched-order
npm test -- --testPathPattern=dashboard
npm test -- --testPathPattern=notification
npm test -- --testPathPattern=work-order
```

#### E2E 测试
```powershell
npm run test:e2e
```
> 内部 `jest --config ./test/jest-e2e.json`；需要环境变量 + 可连 PG 数据库。

#### Migration 操作
```powershell
# 列出已应用的 migration（dry-run 等价）
npm run typeorm -- migration:show

# 执行
npm run migration:run

# 回滚最近一次
npm run migration:revert

# 生成新 migration（基于 entities diff，给 InitSchema 用）
npm run migration:generate

# 创建空白 migration（手写 SQL 时用）
npm run migration:create
```

#### Seed
```powershell
npm run seed
```
> 内部 `ts-node -r tsconfig-paths/register src/database/seeds/index.ts`；幂等，可重复执行。

#### 启动开发模式
```powershell
npm run start:dev
```
> 端口默认 3000；默认使用 `backend/.env` / `backend/.env.local` 中的 DB 配置。

#### 数据清理（仅开发环境）
```powershell
npm run db:clean-orders
```
> 危险操作；生产环境严禁运行。

---

### C.2 前端命令（`cd frontend`）

#### 安装依赖
```powershell
cd D:\AI\SpeceAppDate\工单系统\frontend
npm ci
```

#### 类型检查 / 编译
```powershell
npm run build
```
> 内部 `tsc -b && vite build`；TypeScript 报错或 Vite 构建失败均禁止合并。

#### Lint
```powershell
npm run lint
```
> 内部 `eslint src --ext .ts,.tsx --max-warnings 10`；超过 10 条 warning 直接失败。

#### 单元测试 / 组件测试
```powershell
npm test
npm run test:watch          # 开发时持续监听
npm run coverage            # 输出覆盖率报告
```
> 内部 `vitest run`；spec 文件遍布 `frontend/src/**/*.test.tsx?`。

#### E2E（Playwright）
```powershell
npm run e2e
npm run e2e:headed          # 有头模式调试
```
> 需安装 Playwright 浏览器：`npx playwright install --with-deps`（首次）。

#### 启动开发服务器
```powershell
npm run dev
```
> 默认端口 5173 或 5174；浏览器访问 `http://localhost:5173` / `http://localhost:5174`。

#### 预览构建产物
```powershell
npm run build
npm run preview
```

#### Smoke 测试（已存在的脚本）
```powershell
npm run smoke:live          # frontend/scripts/smoke-live.mjs
npm run verify:phase56      # frontend/scripts/verify-phase5-6.mjs
```
> 需要后端服务已启动；联调阶段使用。

---

### C.3 联调与 mock 启动

#### 全量本地启动（项目根脚本）
```powershell
cd D:\AI\SpeceAppDate\工单系统
.\启动系统.ps1
# 或局域网模式
.\局域网启动.ps1
# 停止
.\停止系统.ps1
```
> 这是项目自带的一键启动脚本（PowerShell），会同时拉起 backend (3000) + frontend (5173/5174)。

#### MSW（前端 mock 模式）
```powershell
cd D:\AI\SpeceAppDate\工单系统\frontend
$env:VITE_USE_MSW = "true"; npm run dev
```
> `frontend/src/mocks/` 下有 MSW handlers；`frontend/public/mockServiceWorker.js` 由 `msw` 生成。
> 设置 `VITE_USE_MSW=true` 后前端不打真实后端，便于 FE-XX 卡未等到 BE-XX 时自测。

#### Docker Compose（含 PG / Redis 等）
```powershell
cd D:\AI\SpeceAppDate\工单系统
docker compose up -d
docker compose down
```

#### 联调对接顺序（推荐）
```powershell
# 终端 1：后端
cd D:\AI\SpeceAppDate\工单系统\backend
npm run start:dev

# 终端 2：前端
cd D:\AI\SpeceAppDate\工单系统\frontend
npm run dev

# 终端 3：观察后端日志
Get-Content D:\AI\SpeceAppDate\工单系统\backend-run.out.log -Wait -Tail 50
```

---

### C.4 PR 提交前必跑命令套（最小安全集）

> 后端 PR：
```powershell
cd D:\AI\SpeceAppDate\工单系统\backend
npm run lint
npm run build
npm test
npm run typeorm -- migration:show   # 仅当本 PR 含 migration
```

> 前端 PR：
```powershell
cd D:\AI\SpeceAppDate\工单系统\frontend
npm run lint
npm run build
npm test
```

> 前后端联调 PR：
```powershell
# 上面两套都跑，再额外
cd D:\AI\SpeceAppDate\工单系统\frontend
npm run smoke:live   # 需要后端已在 3000 端口
```

---

### C.5 常见问题速查

| 问题 | 命令 / 处理 |
|---|---|
| `npm ci` 报 `lock file` 不一致 | 先删 `node_modules` 与 `package-lock.json`，再 `npm install` |
| `npm test` 卡住 | 后端默认 `--runInBand`；前端检查是否有 `screen.debug()` 残留 |
| migration 报 `enum value does not exist` | PostgreSQL 不允许同事务多个 ADD VALUE，把 migration 拆成多条 |
| 前端 `tsc -b` 报 `Type 'WithdrawPending'` 不存在 | 检查 `frontend/src/constants/workOrderStatus.ts` 是否已合 FE-09 |
| 江璐账号筛选无效 | 检查 `dispatched-order.service.ts findAll` 顺序 + `applyUserScope` 是否落 BE-08 |
| 撤回 / 作废按钮 404 | 后端 BE-02/BE-03 未合 → 前端 FE-06 不要先合 |
| 仪表盘卡片数据不刷新（B2） | 检查 BE-14 是否落地（导入触发 submit）|

---

> 文档负责人：架构师；任何 PR 模板更新需经架构师评审；命令套 C.X 章节如脚本变化（package.json 修改）需同步本文。
> 配套文档：`docs/REMEDIATION_PLAN_0518.md`、`docs/IMPLEMENTATION_TASKS_0518.md`、`docs/test_cases_0518.md`。
