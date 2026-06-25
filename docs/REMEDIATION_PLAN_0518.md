# 工单管理系统 0518 反馈整改总规划（架构师 - 2026-05-20）

> 范围：基于《工单办理流程及各种情况处理规则.docx》和《工单管理系统测试问题反馈0518.docx》两份文档。
> 本规划是后端 / 前端 / QA 后续执行的统一蓝本，颗粒度细到「文件路径 + 改动点」，下游同事直接据此动手。
> 配套验收：QA 已交付 `docs/test_cases_0518.md`（共 36 个用例覆盖 P1.x / P2.x / P3.x / P4.x / B1~B5 / S1~S6）。

---

## 0. 总体策略与风险

| 项 | 结论 |
|---|---|
| 改动量级 | 后端 中（约 12 个新增端点 + 仪表盘/通知重构）、前端 大（菜单/列表/详情/仪表盘均要重构） |
| 数据迁移 | 仅新增字段（流程配置表），不破坏既有 work_orders / dispatched_orders schema |
| 兼容性 | 保留旧角色编码（兼容 `salesperson`、`shared_team_owner` 等正在使用的别名）|
| 高风险点 | ① 工单状态机新增 `void` / `withdraw_pending` 两态；② 仪表盘卡片口径变更需重写；③ 江璐共享负责人 module 过滤逻辑修复 |
| 推荐 GO/NOGO 闸 | 闸 1：后端状态机 + 通知分类 完成；闸 2：前端菜单分角色 + 列表精简 完成；闸 3：UAT 通过 36 个验收用例 ≥ 90% |

---

## 1. 变更影响盘点（反馈点 → 代码定位）

### 1.1 仪表盘 / 门户（P1.x）

| 反馈点 | 后端 | 前端 | 数据库 |
|---|---|---|---|
| P1.1 左下角姓名直接显示 | — | `frontend/src/layouts/BasicLayout.tsx` `avatarProps` | — |
| P1.2 4 卡片重构（本月总数/处理中/已完成/我的消息）按角色取数 | `backend/src/modules/dashboard/dashboard.{controller,service}.ts` 全部重写口径 | `frontend/src/pages/Dashboard/index.tsx` 重写 4 张 Statistic Card | — |
| P1.3 删除"今/周/月"切换、固定当月 | dashboard.controller 删除 `period` 入参 | Dashboard 删除 `Segmented` + `period state` | — |
| P1.4 业务负责人趋势图（入/在/离 月度完成率） | dashboard.service 新增 `getLeaderTrend` | Dashboard 新增 `<LeaderTrendChart>` | — |
| P1.5 仪表盘合并总表（工单类型 / 总数 / 处理中 / 已完成 / 完成率） | dashboard.service 新增 `getOrderTypeMatrix` | Dashboard 用 ProTable 渲染合并表 | — |
| P1.6 消息通知分类与定向接收 | `backend/src/modules/notifications/notification.service.ts` 重写 `countUnreadByType`、新增 biz_type 分组规则；`field-change.hook.ts` 调整收件人 | `BasicLayout` 顶部铃铛 Tabs 改为业务员/后道分类；`pages/Notifications` 同步 | `notification_templates` 表新增分类字段 |

### 1.2 左侧导航（P2.x）

| 反馈点 | 前端文件 |
|---|---|
| P2.1+P2.2 各角色仅显示授权模块（业务员看入/在/离全部；合同专员看劳合签订+续签；入离职联系看入职联系+离职材料；数据录入岗看三模块录入；社保公积金专员看三模块社保办理；导出模板/门户配置仅管理员） | `frontend/src/layouts/BasicLayout.tsx` 中 `RAW_MENU` + `frontend/src/config/routeVisibility.ts` 全量重写角色映射 |
| P2.3 我的工单子菜单：我发起的 / 我的待办 / 我的已办 / 团队工单 | `BasicLayout` 新增 4 个子菜单；`frontend/src/pages/MyDispatched/index.tsx` 拆分为 `MyDispatched/{Initiated,Pending,Done,Team}`（或在 1 个组件里按 query 区分） |
| P2.4 主工单列表 + 新建入职合并 | `frontend/src/pages/WorkOrders/index.tsx` 在 toolBar 上保留"新建工单"按钮即可；删除菜单中独立"新建入职"项 |

### 1.3 工单详情模块（P3.x）

| 反馈点 | 文件 |
|---|---|
| P3.1 批导入字段映射策略明确化 | 后端 `imports/imports.controller.ts` + `imports/import-job.service.ts` 已支持双模式；前端 `frontend/src/components/ExcelUploader/index.tsx`、`frontend/src/pages/WorkOrders/Import/index.tsx` 增加 mode 选择器 |
| P3.2 删除"社保公积金未办是否需要催办"字段 | `backend/src/database/seeds/seed-fields.ts` 中 `social_urge` 改为 `isActive: false`；新增 migration `2026XXXXXXXXXX-DropSocialUrgeField.ts` 把存量行 `extra_data` 清理；前端 `frontend/src/pages/WorkOrders/New/index.tsx`、`Detail/index.tsx` 移除 FIELD_GROUPS 中 `social_urge` |
| P3.3 搜索栏字段（客户代码/客户名称/员工姓名/员工证件号/状态） | 前端 `frontend/src/pages/WorkOrders/index.tsx` 已基本符合；后端 `backend/src/modules/work-orders/dto/list-query.dto.ts` 增加 `customerCode/customerName/employeeName/idCardNo/status` 五个查询参数；`work-order.service.ts findAll` 同步 where 条件 |
| P3.4 删除看板/列配置等冗余视图 | `frontend/src/pages/WorkOrders/index.tsx` 删除 `MultiViewTable` 改为 `ProTable`；`frontend/src/components/MultiViewTable/*` 仅在其它模块使用时保留 |
| P3.5 操作按钮（业务员：修改/撤回/作废/催办；非管理员不可删除；已办结只能详情查看） | 前端 `WorkOrders/index.tsx` 已部分实现，**但其调用的后端接口不存在**；需后端补齐 4 个端点（见 § 2.1） |
| P3.6 工单详情页删除"工单动态/工单进度/流转进度链" | `frontend/src/pages/WorkOrders/Detail/index.tsx` 删除 `Tabs` 中 `TIMELINE_TAB_KEY` 项 + 删除 `工单进度` Card + 删除 `flow-link Timeline` 区块 |
| P3.7 我的工单筛选栏（节点类型/工单类型/状态/工单所属月份/客户/员工证件号） | 前端 `frontend/src/pages/MyDispatched/index.tsx` 增加 6 个筛选项；后端 `dispatched-orders/dto/list-query.dto.ts` 增加 `nodeType / orderType / orderMonth / customerName / employeeIdCard` 字段 |

### 1.4 管理员配置（P4.x）

| 反馈点 | 文件 |
|---|---|
| P4.1 入职单条新建表单分组（合同/工资/银行） | `frontend/src/pages/WorkOrders/New/index.tsx` 已有 `fieldGroups` 雏形（基本信息/合同信息/发薪信息等），需对照截图 image13/14 校准分组顺序，并在 `DynamicForm` 渲染时按 `collection_group` 落 `Card`；`backend/src/database/seeds/seed-fields.ts` 中各字段的 `collection_group` 字段需对齐 |
| P4.2 新增"工单流程配置"功能 | 新增页面 `frontend/src/pages/Admin/FlowConfig/index.tsx`；后端**已有** `admin/module-configs` 端点（含 `work-order-modules` / `module-fields` / `action-configs`），将其前端化为 UI 即可 |
| P4.3 字段管理权限可授予非管理员 | 后端 `admin/fields/fields.controller.ts` 当前仅 admin；将 `@Roles('admin')` 改为按 `permission_code: 'field:manage'` 的细粒度校验，参考 `field-permissions.service.ts` 模式 |
| P4.4 导出模板字段选择改为列表勾选 | `frontend/src/pages/Admin/ExportTemplates/index.tsx` 中字段选择改为按 `FIELD_OPTIONS`（已分组）渲染 `Checkbox.Group` |

### 1.5 反馈 BUG（B1~B5）

| BUG | 根因初判 | 入口文件 |
|---|---|---|
| B1 必填字段未填仍可导入 | `backend/src/modules/imports/field-validation.service.ts` `isRequired()` 默认 OK，但 `social_urge` 字段下游被 P3.2 移除后场景消失；同时校验失败行需在结果中明确返回行号和错误原因 | `imports/import-job.service.ts` 中 `runJob` 路径，`error-excel.service.ts` 输出 |
| B2 导入后仪表盘未刷新 / 子工单"未派发" / 共享团队视角 | ① 导入回流 webhook 未触达前端（缺少 `/work-orders/import/{id}/status` 推送）；② `WorkOrders/index.tsx` `viewDescription` 默认分支 fallback 到「共享团队视角」误显示；③ `dispatched_orders` 由 `work-order.service.ts submit()` 同步生成，导入路径缺少 submit 调用 | 后端 `imports/work-order-import.service.ts` 检查是否调用 `WorkOrderService.submit()`；前端 `WorkOrders/index.tsx` 修复 fallback 文案 |
| B3 消息计数与列表不一致 | `notification.service.ts list()` 与 `countUnread()` 查询条件不一致：list 使用 `unread === false` 过滤而 count 仅看 `isRead = false`；前端 `BasicLayout.tsx fetchAll()` 同时拉两个接口未做容错 | 重写 list / count 共用 query builder |
| B4 后道待办无批量办理 | `MyDispatched/index.tsx` 缺少 `batchActions={...}`；后端 `dispatched-order.controller.ts` 已有 `batch-complete` 端点（仅社保有 `social-insurance/batch-complete`） | 前端补 batch UI；后端验证现有端点权限及 remark 必填行为 |
| B5 江璐部门工单按模块筛选无效 | 后端 `dispatched-order.service.ts applyUserScope()` 给 supervisor 加 `OR module_code IN modules`，但 `applyCommonFilters()` 顺序在前，搜索时 `applyUserScope` 的 OR 范围会与单 moduleCode 等值过滤冲突 | 调整 `findAll` 顺序：先 applyCommonFilters，再 applyUserScope；并把 `applyUserScope` 改为 `andWhere(brackets)` 严格收敛 |

---

## 2. 后端 API 改动清单

### 2.1 新增端点（业务员操作集）

> 文件：`backend/src/modules/work-orders/work-order.controller.ts` + 对应 service

| 端点 | 用途 | 入参 DTO | 状态机变更 | 通知 |
|---|---|---|---|---|
| `POST /work-orders/:id/withdraw` | 业务员申请撤回（情况5） | `{ reason?: string }` | `pending|processing → withdrawn_pending` | 通知所有未办结子工单的当前 handler |
| `POST /work-orders/:id/withdraw/approve` | 后道审批撤回 | `{ approved: boolean, comment?: string }` | `withdrawn_pending → withdrawn` 或回滚到原状态 | 通知发起人 |
| `POST /work-orders/:id/void` | 业务员申请作废（情况2） | `{ reason: string }` | `pending|processing|returned → void_pending` | 同上 |
| `POST /work-orders/:id/void/approve` | 后道审批作废 | `{ approved: boolean, comment?: string }` | `void_pending → void` 或回滚 | 通知发起人 |
| `POST /work-orders/:id/urge` | 业务员催办 | `{ moduleCode?: string }` | 不变状态，写一条 `urge` 操作日志 | 通知所有未办结子工单 handler，biz_type=`urge_received` |

> ⚠️ 现状前端 `frontend/src/pages/WorkOrders/index.tsx` line 102/112/123 已经在调用这 3 个端点（`/withdraw`、`/void`、`/urge`），后端**当前并不存在**；前端调用必然 404。优先级 P0。

### 2.2 状态机扩展

> 文件：`backend/src/entities/enums.ts`

```ts
export enum WorkOrderStatus {
  DRAFT = 'draft',
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  RETURNED = 'returned',
  WITHDRAWN = 'withdrawn',          // 既有
  WITHDRAW_PENDING = 'withdraw_pending',  // 新增：等待后道审核撤回
  VOID_PENDING = 'void_pending',          // 新增：等待后道审核作废
  VOID = 'void',                          // 新增：终态作废
}
```

迁移：新增 `backend/src/database/migrations/2026XXXX-WorkOrderStatusExtend.ts` 扩展 `work_orders.status` enum；旧 `withdrawn` 保留语义。

### 2.3 仪表盘重写

> 文件：`backend/src/modules/dashboard/dashboard.{controller,service}.ts`

**端点重排**：
- `GET /dashboard/cards`：4 卡片统一接口（按 token 角色自动取数），返回：
  ```json
  { "totalThisMonth": 0, "processing": 0, "completed": 0, "myMessages": 0 }
  ```
  按角色取数规则：
    - 业务员：自己发起；
    - 业务组长：本组成员发起；
    - 业务负责人：本部门所有；
    - 后道（合同/入离职/数据录入/社保公积金）：自己 handler 的子工单；
    - 管理员：全体。
- `GET /dashboard/order-type-matrix`：合并总表，返回 `[{ orderType, total, processing, completed, completionRate }]`。
- `GET /dashboard/leader-trend`（仅 manager/business_owner）：返回入/在/离三模块各月办结完成率数组。
- 旧端点 `/dashboard/salesperson`、`/dashboard/team/:module`、`/dashboard/manager` 标记 `@Deprecated`，1 个版本后下架。

**口径**：
- "本月" = `date_trunc('month', now() AT TIME ZONE 'Asia/Shanghai')`，与现有 `getSalespersonMetrics` 对齐；
- "我的消息" = `notifications` 表 `is_read=false AND user_id = :sub`。

### 2.4 通知分类重写

> 文件：`backend/src/modules/notifications/notification.service.ts`

- `toUnreadBucket(bizType)` 当前桶为 `sla / task / system`。改为按收件人角色 + biz_type 分两组：
  - 业务员桶：`field_supplemented / dispatched_returned_to_salesperson / urge_feedback / withdrawn_approved / void_approved`；
  - 后道桶：`urge_received / sla_breach / sla_warning / order_modified_by_creator / withdraw_request / void_request`。
- 新增 biz_type 常量定义文件 `backend/src/modules/notifications/biz-types.ts` 集中管理。
- `field-change.hook.ts` 中 `onWorkOrderUpdated()` 必须仅向后道（仍未办结的子工单 handler）发，不向发起人本人发。
- 数据库新增 `notification_templates` seed：把 5 个新 biz_type 模板补齐（`backend/src/database/seeds/seed-notification-templates.ts`）。

### 2.5 批量办理（B4）

> 文件：`backend/src/modules/dispatched-orders/dispatched-order.controller.ts`

- 已有 `POST /dispatched-orders/batch-complete`、`POST /dispatched-orders/social-insurance/batch-complete`，**功能已就绪**；B4 是前端没做按钮。
- 但需校验：当前 `BatchCompleteDispatchedOrderDto.remark` 为必填，前端调用前需弹窗收集；社保单独路径需保留。

### 2.6 列表筛选扩展（P3.7）

> 文件：`backend/src/modules/dispatched-orders/dto/list-query.dto.ts`

```ts
@IsOptional() @IsString() nodeType?: string;
@IsOptional() @IsString() orderType?: string;          // onboarding/renewal/resignation
@IsOptional() @IsString() orderMonth?: string;          // 'YYYY-MM'
@IsOptional() @IsString() customerName?: string;
@IsOptional() @IsString() employeeIdCard?: string;
```

`dispatched-order.service.ts applyCommonFilters()` 同步增加 5 个 where 条件。

### 2.7 工单列表筛选扩展（P3.3）

> 文件：`backend/src/modules/work-orders/dto/list-query.dto.ts`

```ts
@IsOptional() @IsString() customerCode?: string;
@IsOptional() @IsString() customerName?: string;
@IsOptional() @IsString() employeeName?: string;
@IsOptional() @IsString() idCardNo?: string;
@IsOptional() @IsEnum(WorkOrderStatus) status?: WorkOrderStatus;
```

`work-order.service.ts findAll()` 把这 5 个条件接入 `qb.andWhere`。

### 2.8 字段权限非管理员可配置（P4.3）

> 文件：`backend/src/modules/admin/fields/fields.controller.ts`

- 把 `@Roles('admin')` 替换为基于权限码的守卫：
  - 新增 `backend/src/common/decorators/permission.decorator.ts`（如不存在）；
  - 新增权限码 `field:manage`，注入 `PermissionGuard`；
  - `seed-roles.ts` 给 `admin` 默认带此权限，其它角色由管理员后台授权。

### 2.9 江璐 BUG（B5）修复

> 文件：`backend/src/modules/dispatched-orders/dispatched-order.service.ts`

- `findAll()` 内调用顺序：保持 `applyCommonFilters` → `applyUserScope`，但把 `applyUserScope` 内的 `qb.andWhere(new Brackets(...))` 改为单层 `andWhere`，确保 `module_code = ?` 和 `module_code IN (modules)` 都用 AND 连接。当前代码用 OR，会让模块过滤失效。

---

## 3. 前端改动清单

### 3.1 仪表盘（P1.x）

| 文件 | 改动 |
|---|---|
| `frontend/src/pages/Dashboard/index.tsx` | ① 删除 `Segmented period`；② 顶部 4 张 `<Card><Statistic>` 改为 `本月工单总数 / 处理中 / 已完成 / 我的消息`；③ 中部 ProTable 渲染 P1.5 总表；④ 业务负责人额外渲染 `<LeaderTrendChart>`（recharts 折线图） |
| `frontend/src/services/dashboard.ts` | ① 改为调用新端点 `/dashboard/cards`、`/dashboard/order-type-matrix`、`/dashboard/leader-trend`；② Mock 数据同步；③ 旧 `getSalespersonDashboard`/`getTeamDashboard` 保留至 1 版后删除 |
| `frontend/src/layouts/BasicLayout.tsx` | `avatarProps` 中 `title` 取 `user?.real_name || user?.username`，删除原悬浮 `Tooltip`（如有）；放在头像图标右侧 |

### 3.2 左侧导航（P2.x）

> 文件：`frontend/src/layouts/BasicLayout.tsx` + `frontend/src/config/routeVisibility.ts`

**RAW_MENU 重排（按角色分支显式声明）**：

```text
仪表盘                              （所有登录用户）
入职管理                            （admin、business_*、shared_*、labor_contract_member、onboarding_resignation_member、data_entry_*）
  我发起的                          （仅业务员相关）
  我的待办                          （后道 + 被退回的业务员）
  我的已办                          （仅后道）
  团队工单                          （组长、负责人、shared_team_owner）
在职管理                            （含续签合同等）
离职管理                            （含离职联系、离职证明等）
消息通知                            （所有人）
管理后台                            （仅 admin）
  ↳ 用户/角色/部门/客户/字段/权限/导出模板/工单流程配置/系统设置/操作日志
```

**模块特化菜单**：
- 合同专员（`labor_contract_member`、`contract_specialist`）：仅显示「入职管理 → 我的待办（含合同子工单）」「在职管理 → 续签合同」
- 入离职联系（`onboarding_resignation_member`、`onboarding_specialist`）：仅显示「入职管理 → 入职联系子工单」「离职管理 → 离职材料收集」
- 数据录入岗（`data_entry_leader`、`data_entry_team`）：保留三模块的"数据录入子工单"
- 社保公积金专员（新角色 `social_insurance_specialist`，需 seed）：保留三模块的"社保公积金办理子工单"
- 「导出模板」「门户配置」改为仅在 `admin` 角色出现。

**实现要点**：
- `ROUTE_VISIBILITY` 表中已用规范角色码描述每条路径的可见性，扩展即可。
- 删除 `BasicLayout RAW_MENU` 中 `/work-orders/new` 子菜单项（合并入主列表，P2.4）。

### 3.3 工单列表（P3.x）

> 文件：`frontend/src/pages/WorkOrders/index.tsx`

- ❶ 删除文件中段 line 405~717 的整段重复代码（同名 `WorkOrders` 二次声明，导致编译歧义）。
- ❷ 用 `ProTable` 替换 `MultiViewTable`，删除 kanban 视图开关。
- ❸ 顶部搜索 Form 已含 5 个字段（客户代码/客户名称/员工姓名/证件号/状态），保留即可。
- ❹ 操作列保留：详情 / 修改 / 撤回 / 作废 / 催办（业务员可见且工单未终态时）。
- ❺ 删除 toolBar 中 `批量删除` 按钮（仅管理员保留），与 P3.5 对齐。
- ❻ `viewDescription` 中默认分支「共享团队视角」误显示问题：业务员在不匹配任何明确分支时，默认应为「业务员视角」而非「共享团队视角」（B2.3）。

### 3.4 工单详情（P3.6）

> 文件：`frontend/src/pages/WorkOrders/Detail/index.tsx`

- ❶ 删除文件中 line 359~755 的重复声明（与上半重复）。
- ❷ 删除 `工单进度` Card（含 `Steps` + `Timeline` 流转进度链）整段。
- ❸ 删除 `Tabs` 中 `TIMELINE_TAB_KEY` 项 → 即"工单动态" Tab。
- ❹ 保留：基本信息 + 子工单状态 + 工单字段信息（按分组 Card）。
- ❺ 已办结工单：操作按钮只保留 `详情查看`（其它 hidden）。

### 3.5 我的工单（P2.3、P3.7）

> 文件：`frontend/src/pages/MyDispatched/index.tsx`

- 把当前单一 `MyDispatched` 改为受 `mode` 参数控制的多视图：
  - `?mode=initiated` → 我发起的（仅业务员，转向 `WorkOrders/index.tsx` 也可）；
  - `?mode=pending` → 我的待办（默认）；
  - `?mode=done` → 我的已办；
  - `?mode=team` → 团队工单。
- 顶部筛选栏增加 6 个字段：节点类型、工单类型、状态、工单所属月份、客户、员工证件号。
- 顶部 toolBarRender 增加 `批量办理` 按钮（弹 Modal 收集 `remark`，调用 `POST /dispatched-orders/batch-complete`）。

### 3.6 单条新建入职表单（P3.2、P4.1）

> 文件：`frontend/src/pages/WorkOrders/New/index.tsx`

- ❶ `social_urge` 字段在 `seed-fields.ts` 中下架后，前端 DynamicForm 自动不渲染；同步把 `frontend/src/pages/WorkOrders/Detail/index.tsx FIELD_GROUPS.社保公积金（参考）` 中的 `social_urge` 移除。
- ❷ `groupOrder` 中分组顺序对齐 image13/14：
  ```
  ['基本信息', '合同信息（劳动合同）', '工资信息（发薪）', '银行信息', '社保公积金信息', '其他备注']
  ```
- ❸ 后端 `seed-fields.ts` 中各字段的 `collection_group` 字段同步对齐上述 6 个分组名。

### 3.7 批量导入（P3.1）

> 文件：`frontend/src/pages/WorkOrders/Import/index.tsx` + `frontend/src/components/ExcelUploader/`

- 步骤 1：选择「严格标准模板」/「AI 智能映射」单选；
- 步骤 2：上传 Excel；
- 步骤 3：严格模式直接提交 → 失败行提示；AI 模式给出映射结果让用户确认覆盖；
- 失败行下载链接复用 `GET /work-orders/import/:jobId/error-report`（已存在）。

### 3.8 管理员（P4.2、P4.3、P4.4）

| 文件 | 改动 |
|---|---|
| `frontend/src/pages/Admin/FlowConfig/index.tsx` (新建) | 列出工单类型 → 进入流程编辑器（节点列表 + 顺序 + 必填字段 + 操作按钮）。后端复用现有 `admin/work-order-modules` + `admin/action-configs` |
| `frontend/src/pages/Admin/Fields/index.tsx` | 添加"是否对非管理员开放"开关（前端 UI），调用 `POST /admin/role-permissions` 写入 `field:manage` |
| `frontend/src/pages/Admin/ExportTemplates/index.tsx` | 字段选择控件由 `Select` 改为 `Checkbox.Group`，按 `FIELD_OPTIONS` 分组渲染（已分组数据源 line 38~） |
| `frontend/src/layouts/BasicLayout.tsx` | 在 `管理后台 → admin` 子菜单中加 `工单流程配置` 项 |

### 3.9 顶部消息铃铛（P1.6、B3）

> 文件：`frontend/src/layouts/BasicLayout.tsx`

- Tabs 当前为 `全部 / 服务时限(sla) / 任务(task) / 系统(system)`。改为：
  - 业务员视角：`全部 / 字段更新 / 退回 / 撤回作废结果 / 催办反馈 / 系统`
  - 后道视角：`全部 / 待办 / 催办 / 超时 / 业务员修改 / 撤回作废申请 / 系统`
- `fetchAll()` 内 `getNotifications({ unread: true, page: 1, pageSize: 50 })` 与 `getUnreadCount()` 必须基于同一过滤条件，避免 B3。

---

## 4. 工单状态机与流程更新

### 4.1 状态枚举（最终版）

```
draft
  └─ submit ──▶ pending ──▶ processing ──┬─ all_children_completed ──▶ completed
                                          ├─ child_returned ─────────▶ returned
                                          ├─ withdraw_request ───────▶ withdraw_pending
                                          └─ void_request ───────────▶ void_pending
returned ──▶ resubmit ──▶ processing
withdraw_pending ──▶ approved ──▶ withdrawn   /  rejected ──▶ 原 status
void_pending ──▶ approved ──▶ void           /  rejected ──▶ 原 status
completed ──▶ (终态：仅可详情查看；管理员可线下处理)
withdrawn / void ──▶ (终态)
```

### 4.2 6 类业务场景对照（流程文档）

| 编号 | 起点 | 路径 | 终态 | 触发事件 / 通知 |
|---|---|---|---|---|
| 情况1 常规 | 业务员发起 | submit → pending → processing → 各子单 complete | completed | 子单完成时 → 通知发起人 |
| 情况2 退回-作废 | 业务员发起 | submit → 后道退回 → returned → 业务员申请作废 → void_pending → 后道审核 → void | void | 后道收到 `void_request`，业务员收到 `void_approved` |
| 情况3 退回-重提 | 业务员发起 | submit → 后道退回 → returned → 业务员修改 + resubmit → processing → 后道办结 | completed | 后道收到 `dispatch_resubmit`，业务员收到 `field_supplemented` |
| 情况4 后道未办-业务员修改 | 业务员发起 | submit → processing → 业务员发现错误 → update（lifecycle hook 写 dirty mark）→ 后道办结 | completed | 后道收到 `order_modified_by_creator` 高亮提示 |
| 情况5 后道未办-业务员撤回/作废 | 业务员发起 | submit → processing → 业务员申请撤回 → withdraw_pending → 后道审核 → withdrawn 或回滚 → 撤回后修改+resubmit | withdrawn / completed | 双向通知 |
| 情况6 已办结 | 业务员发起 | submit → processing → completed | completed（不可变）| 仅可线下处理 |

### 4.3 操作权限矩阵（按状态）

| 状态 | 业务员 | 后道 | 管理员 |
|---|---|---|---|
| draft | 修改/提交/作废 | — | 删除 |
| pending | 修改/撤回申请/作废申请/催办 | 接单/退回 | 删除 |
| processing | 修改（情况4）/撤回申请/作废申请/催办 | 办理/修改特定字段/退回/批量办理 | 删除 |
| returned | 修改+重新提交/作废申请 | （等待业务员重新提交） | 删除 |
| withdraw_pending / void_pending | 撤销申请 | 审批通过/拒绝 | 删除 |
| completed | 详情查看 | 详情查看 | 删除（线下处理） |
| withdrawn / void | 详情查看 | 详情查看 | — |

---

## 5. 角色权限矩阵（菜单 × 按钮）

> 列：业务员（business_group_member） / 业务组长（business_group_leader） / 业务负责人（business_owner） / 合同专员（labor_contract_member） / 入离职联系（onboarding_resignation_member） / 数据录入岗（data_entry_leader / data_entry_team） / 社保公积金（social_insurance_specialist 待 seed） / 共享团队负责人（shared_team_owner） / 管理员（admin）

### 5.1 顶层菜单可见性

| 菜单 | 业务员 | 业务组长 | 业务负责人 | 合同 | 入离职 | 数据录入 | 社保 | 共享负责人 | 管理员 |
|---|---|---|---|---|---|---|---|---|---|
| 仪表盘 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 入职管理（含子工单） | ✓ | ✓ | ✓（只读）| ✓（合同子单）| ✓（入职联系子单）| ✓（数据录入子单）| ✓（社保子单）| ✓（团队全部）| ✓ |
| 在职管理 | ✓ | ✓ | ✓（只读）| ✓（续签）| ✗ | ✓（录入）| ✓（社保）| ✓ | ✓ |
| 离职管理 | ✓ | ✓ | ✓（只读）| ✗ | ✓（材料收集）| ✓（录入）| ✓（停保）| ✓ | ✓ |
| 我的工单 → 我发起的 | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| 我的工单 → 我的待办 | ✓（被退回时）| ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 我的工单 → 我的已办 | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 我的工单 → 团队工单 | ✗ | ✓ | ✓ | ✗ | ✗ | ✓（leader）| ✗ | ✓ | ✓ |
| 消息通知 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 导出模板（用户侧） | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| 管理后台 | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |

### 5.2 工单列表按钮（行内操作）

| 按钮 | 业务员（自己发起未终态）| 后道（自己 handler）| 管理员 |
|---|---|---|---|
| 详情 | ✓ | ✓ | ✓ |
| 修改 | ✓ | ✓（受字段权限限制）| ✓ |
| 撤回 | ✓ | ✗ | ✗ |
| 作废 | ✓ | ✗ | ✗ |
| 催办 | ✓ | ✗ | ✗ |
| 办理 / 退回 | ✗ | ✓ | ✓ |
| 删除 | ✗ | ✗ | ✓ |

---

## 6. BUG 修复清单（B1~B5 详解）

### B1 入职表单"社保公积金未办是否需要催办"必填字段未填仍可导入

- **根因**：① 字段本身按 P3.2 应当移除；② `imports/field-validation.service.ts` 在 `dropdown` 字段无值时 `hasValue()` 判定可能为真（空字符串 vs null）。
- **修改入口**：
  - `backend/src/database/seeds/seed-fields.ts` 把 `social_urge` 标 `isActive: false`（同时新增 migration 将存量数据 `extra_data.social_urge` 删除）；
  - `backend/src/modules/imports/field-validation.service.ts` `hasValue()` 收紧：trim 后空串视为无值；
  - `backend/src/modules/imports/import-job.service.ts runJob` 失败行写入 `error_report.xlsx`，确保 partial 模式下其它合法行成功导入（已具备 `ImportJobStatus.PARTIAL` 枚举）。
- **验证**：QA TC-BUG-001。

### B2 业务员导入工单后仪表盘未刷新 / 子工单"未派发" / 左上角"共享团队视角"

- **根因**：
  - ① 仪表盘是被动拉取，导入完成后无 `invalidate cache` 信号；前端 `Dashboard` 也未在路由切回时重拉；
  - ② 导入入库后未走 `WorkOrderService.submit()` → 子工单未生成 → 列表显示"未派发"标签；
  - ③ `frontend/src/pages/WorkOrders/index.tsx viewDescription()` 默认 `return { title: '共享团队视角' ... }` 给业务员误用。
- **修改入口**：
  - 后端 `imports/work-order-import.service.ts` 在 `autoSubmit=true` 时调用 `WorkOrderService.submit()`；
  - 前端 `Dashboard/index.tsx` 在路由聚焦时重拉数据（`useFocus`）；
  - 前端 `WorkOrders/index.tsx` 默认 fallback 改为 `业务员视角` 或 `查看授权工单`，禁止误用「共享团队视角」。
- **验证**：QA TC-BUG-002 / TC-BUG-003 / TC-BUG-004。

### B3 消息通知显示数量但点击查看无任何记录

- **根因**：`notification.service.ts` 中：
  - `list()` 默认按 `query.unread === true` 改写 `isRead = false`；
  - `countUnread()` 永远 `count where isRead = false`；
  - 但前端 `BasicLayout.fetchAll()` 拉 list 时传 `unread: true`，正常应一致；可能是后端 `query.unread` 解析为 `'true'` 字符串而 `isRead === false` 的 boolean 误判。
- **修改入口**：
  - `notification.service.ts list()` 内：用统一 transformer 解析 `unread`，与 `unread-count` 共享 query builder；
  - `notification.controller.ts QueryNotificationsDto` 增加 `@Transform(({value}) => value === true || value === 'true')`。
- **验证**：QA TC-BUG-005。

### B4 后道待办勾选多条数据后无批量处理功能

- **根因**：前端 `MyDispatched/index.tsx` 仅有"批量导出"，未挂"批量办理"。
- **修改入口**：
  - 前端 `MyDispatched/index.tsx` `<ProTable rowSelection batchActions>` 中新增"批量办理"按钮 → Modal 收集 remark + 可选 extraData → 调用 `POST /dispatched-orders/batch-complete`；
  - 社保模块路径走 `social-insurance/batch-complete`；
  - 后端 `BatchCompleteDispatchedOrderDto` 已存在，无需变更。
- **验证**：QA TC-BUG-006。

### B5 共享负责人江璐部门工单按模块搜索无效

- **根因**：`backend/src/modules/dispatched-orders/dispatched-order.service.ts` 中 `applyUserScope()` 用 `qb.andWhere(new Brackets((scope) => { scope.where('handler_id = :userId').orWhere('module_code IN (:modules)') }))`；当 `applyCommonFilters` 又加了 `andWhere('d.module_code = :moduleCode')` 时，外层 AND 与内层 OR 互不冲突，本应能正确缩小到指定 module。
- 真因可能是前端 `MyDispatched/index.tsx` 的"按模块搜索"未把选中的 module 透传到 `getDispatchedOrders({ moduleCode })`，或 ProTable search 字段名错误（应为 `moduleCode` 而非 `module_code`）。
- **修改入口**：
  - 前端 `MyDispatched/index.tsx` 模块搜索 column.search.transform 把 `module_code` → `moduleCode`；
  - 后端 `applyCommonFilters()` 已同时支持 `moduleCode | module_code | pool` 三个键名（line 602），可保留；
  - 验证 `applyUserScope` 与 `applyCommonFilters` 顺序：先 commonFilters 再 userScope，避免 OR 短路。
- **验证**：QA TC-BUG-007。

---

## 7. 前后端协作的接口契约草案

### 7.1 仪表盘新数据卡片

```
GET /api/dashboard/cards   （Header: Authorization: Bearer <token>）
Response 200:
{
  "totalThisMonth": 24,
  "processing": 8,
  "completed": 14,
  "myMessages": 3,
  "scope": "salesperson"   // salesperson|group_leader|business_owner|backend|admin
}
```

```
GET /api/dashboard/order-type-matrix
Response 200:
{
  "rows": [
    { "orderType": "onboarding", "label": "入职", "total": 12, "processing": 3, "completed": 9, "completionRate": 0.75 },
    { "orderType": "renewal",    "label": "续签", "total": 6,  "processing": 2, "completed": 4, "completionRate": 0.667 },
    { "orderType": "resignation","label": "离职", "total": 6,  "processing": 1, "completed": 5, "completionRate": 0.833 }
  ]
}
```

```
GET /api/dashboard/leader-trend?orderType=onboarding   （仅业务负责人/管理员）
Response 200:
{
  "orderType": "onboarding",
  "buckets": [
    { "month": "2026-01", "total": 30, "completed": 27, "rate": 0.9 },
    { "month": "2026-02", "total": 22, "completed": 20, "rate": 0.909 },
    ...
  ]
}
```

### 7.2 消息通知分类

```
GET /api/notifications/unread-count-by-bucket
Response 200:
{
  "salesperson": { "field_changed": 1, "returned": 2, "urge_feedback": 0, "withdraw_void_result": 1 },
  "backend":     { "urge_received": 0, "sla_warning": 0, "creator_modified": 0, "withdraw_request": 0 },
  "system": 1,
  "total": 5
}
```

接口同时返回业务员/后道两个桶，前端按当前用户角色挑选。

### 7.3 批导入失败明细

```
POST /api/work-orders/import/confirm  （已存在）
Response 200:
{
  "jobId": "uuid",
  "totalRows": 100,
  "successRows": 95,
  "failRows": 5,
  "failures": [
    { "rowNo": 3, "reason": "social_urge 必填", "fieldCode": "social_urge", "code": "required" },
    { "rowNo": 8, "reason": "id_card_no 格式错误", "fieldCode": "id_card_no", "code": "regex" }
  ],
  "errorReportUrl": "/work-orders/import/{jobId}/error-report"
}
```

### 7.4 批量办理

```
POST /api/dispatched-orders/batch-complete   （已存在）
Body:
{
  "ids": ["uuid1", "uuid2"],
  "remark": "批量办理：合同已签",
  "extraData": { "contract_feedback": "已签" }   // 可选，按字段权限校验
}
Response 200:
{
  "success": true,
  "completed": 2,
  "skipped": [
    { "id": "uuid3", "reason": "子单状态不允许完成" }
  ]
}
```

### 7.5 撤回 / 作废 / 催办

```
POST /api/work-orders/{id}/withdraw
Body: { "reason": "录入错误" }
Response 200: { "id": "...", "status": "withdraw_pending", "expiresAt": "..." }

POST /api/work-orders/{id}/withdraw/approve
Body: { "approved": true, "comment": "同意撤回" }
Response 200: { "id": "...", "status": "withdrawn" | "processing" }

POST /api/work-orders/{id}/void              { "reason": "录入错误，无需流转" }
POST /api/work-orders/{id}/void/approve      { "approved": true, "comment": "同意作废" }

POST /api/work-orders/{id}/urge
Body: { "moduleCode": "contract" }   // 可选
Response 200: { "ok": true, "notifiedHandlers": 2 }
```

### 7.6 字段管理权限

```
GET /api/admin/role-permissions/{roleId}
Response 200: { "roleId": "...", "permissions": ["field:manage", "export:manage"] }

POST /api/admin/role-permissions/{roleId}    （仅 admin）
Body: { "permissions": ["field:manage"] }
```

---

## 8. 执行顺序建议（甘特视角）

```
Day 1-2  后端 P0：
  ├─ work-order.service.ts 状态机扩展（+ migration）
  ├─ work-order.controller.ts 5 个新端点（withdraw/void/urge）
  ├─ notification 桶分类重写
  └─ dispatched-orders applyUserScope 修复（B5）
       │
Day 2-3  后端 P1：
  ├─ dashboard 3 个新端点
  ├─ work-orders/dispatched-orders DTO 扩展
  └─ field-permissions 角色化（@Roles → permission code）

Day 3-5  前端 P0（依赖后端 P0 完成）：
  ├─ BasicLayout 菜单分角色 + 头像姓名 + 通知 Tabs
  ├─ Dashboard 4 卡片重写
  ├─ WorkOrders 列表清理（去 kanban + 去重复代码 + viewDescription 修复）
  └─ Detail 删除 工单进度/工单动态/流转链

Day 4-7  前端 P1：
  ├─ MyDispatched 4 视图拆分 + 6 字段筛选 + 批量办理
  ├─ Admin/FlowConfig 新页面
  ├─ Admin/ExportTemplates Checkbox.Group
  ├─ WorkOrders/New 表单分组对齐
  └─ Import 双模式选择器

Day 6   联调与种子数据：
  ├─ seed-fields.ts 下架 social_urge
  ├─ seed-roles.ts 增加 social_insurance_specialist
  └─ seed-notification-templates.ts 5 个新模板

Day 7-8  QA UAT：依据 docs/test_cases_0518.md 执行
```

**可并行**：后端 P1（dashboard/dto）与前端 P0 中除 Dashboard 之外的部分。

**强依赖（必须串行）**：
- 前端 Dashboard 重写 ← 后端 dashboard 新端点；
- 前端撤回/作废按钮 ← 后端 withdraw/void 端点；
- 前端通知 Tabs ← 后端 notification 桶分类。

---

## 9. 验收口径（与 QA 用例对齐）

- 必须 100% 通过：B1~B5 共 7 个用例（TC-BUG-001 ~ TC-BUG-007）；
- 必须 100% 通过：S1~S6 状态机 6 个用例（TC-STATE-001 ~ TC-STATE-006）；
- 必须 ≥ 90% 通过：仪表盘 12 + 导航 9 + 详情 10 + 管理员 5 + 我的工单 2 + 权限 2 = 40 个常规用例；
- 失败用例必须挂归属（前/后端责任人 + ETA），不允许"暂时跳过"。

---

## 10. 不在本次范围（明确排除）

- 多租户、SSO 接入；
- 工单 SLA 引擎重构（沿用现有 sla_breach 逻辑）；
- 报表导出 PDF；
- 移动端适配；
- 现有 `MultiViewTable` 在其他页面的清理（仅工单主列表精简，其他页面保留）。

---

> 文档负责人：架构师；联系方式：通过团队 broadcast 协调。
> 下一步：等待 Leader 把后端/前端任务派发到位，本人随时支持接口契约咨询和评审。
