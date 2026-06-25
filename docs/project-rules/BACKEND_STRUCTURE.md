# BACKEND_STRUCTURE.md — 后端与数据结构

> 版本：0.2.0（基于 2026-05-29 逆向工程盘点，已逐文件核对 30 个 Entity / 32 个 Controller 的真实路由）
> 数据库引擎：PostgreSQL 16 · ORM：TypeORM 0.3.21 · schema：public

---

## 1. 数据库实体总览（共 30 个 Entity）

### 核心业务域

| # | 表名 (snake_case) | Entity 类 | 说明 |
|---|-------------------|-----------|------|
| 1 | `users` | `User` | 系统用户（用户名/密码/个人信息） |
| 2 | `roles` | `Role` | 角色定义（code / name / level） |
| 3 | `user_roles` | `UserRole` | **用户-角色-部门三元关系**（复合主键） |
| 4 | `departments` | `Department` | 自引用部门树 |
| 5 | `customers` | `Customer` | 客户主体 |
| 6 | `branches` | `Branch` | 客户下属分公司/分支 |
| 7 | `customer_assignees` | `CustomerAssignee` | 业务员↔客户绑定关系 |
| 8 | `work_orders` | `WorkOrder` | 主工单（入职/续签/离职/待遇） |
| 9 | `dispatched_orders` | `DispatchedOrder` | 子工单（派发到各岗） |
| 10 | `dispatched_order_return_records` | `DispatchedOrderReturnRecord` | 子工单退回记录 |

### 配置与权限域

| # | 表名 | Entity 类 | 说明 |
|---|------|-----------|------|
| 11 | `field_configs` | `FieldConfig` | 动态字段定义（fieldType / dropdownOptions / validationRegex） |
| 12 | `field_permissions` | `FieldPermission` | 角色×字段×场景 的可见/只读/隐藏/脱敏权限 |
| 13 | `field_supplement_rules` | `FieldSupplementRule` | 字段补充规则（哪个字段在哪个场景允许补充） |
| 14 | `field_supplement_logs` | `FieldSupplementLog` | 字段补充操作日志 |
| 15 | `work_order_field_dirty_marks` | `WorkOrderFieldDirtyMark` | 字段级别修改标记 |
| 16 | `role_action_permissions` | `ActionConfig` | 角色×操作权限（CRUD 细粒度） |
| 17 | `dispatch_rules` | `DispatchRule` | 派发规则（触发条件→目标模块+处理人） |
| 18 | `module_handlers` | `ModuleHandler` | 模块处理人注册（含权重/轮询游标） |
| 19 | `module_supervisors` | `ModuleSupervisor` | 模块主管 |
| 20 | `exception_module_handlers` | `ExceptionModuleHandler` | 例外处理人 |
| 21 | `module_fields` | `ModuleField` | 模块字段关联 |
| 22 | `work_order_modules` | `WorkOrderModuleConfig` | 模块定义（子模块code/name/dispatchStrategy/SLA） |

### 流程与工作流域

| # | 表名 | Entity 类 | 说明 |
|---|------|-----------|------|
| 23 | `workflow_definitions` | `WorkflowDefinition` | 工作流定义（ReactFlow JSON） |
| 24 | `order_stages` | `OrderStage` | 工单阶段时间线节点 |

### 辅助数据域

| # | 表名 | Entity 类 | 说明 |
|---|------|-----------|------|
| 25 | `notifications` | `Notification` | 站内通知（bizType / isRead / link） |
| 26 | `import_jobs` | `ImportJob` | Excel 批量导入任务 |
| 27 | `export_templates` | `ExportTemplate` | 导出模板（字段列表 JSON） |
| 28 | `order_attachments` | `OrderAttachment` | 工单附件 |
| 29 | `operation_logs` | `OperationLog` | 操作审计日志 |
| 30 | `system_settings` | `SystemSetting` | 系统级 K/V 配置 |

---

## 2. 核心实体字段详解

### 2.1 `users` — 系统用户

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | UUID (PK) | | 主键 |
| `username` | VARCHAR(64) | UNIQUE, NOT NULL | 登录名 |
| `real_name` | VARCHAR(128) | NOT NULL | 真实姓名（**系统内自治，不与飞书同步**） |
| `email` | VARCHAR(128) | UNIQUE, NULLABLE | 邮箱 |
| `phone` | VARCHAR(32) | NULLABLE | 手机号 |
| `password_hash` | VARCHAR(255) | NOT NULL | bcrypt 哈希 |
| `group_code` | VARCHAR(32) | NULLABLE | 所属组 Code |
| `must_change_password` | BOOLEAN | DEFAULT TRUE | 首次登录强制改密 |
| `password_updated_at` | TIMESTAMPTZ | NULLABLE | 最近改密时间 |
| `avatar_url` | VARCHAR(512) | NULLABLE | 头像 URL |
| `is_active` | BOOLEAN | DEFAULT TRUE | 启用/禁用 |
| `last_login_at` | TIMESTAMPTZ | NULLABLE | 最近登录时间 |
| `created_at` | TIMESTAMPTZ | AUTO | 创建时间 |

> ⚠️ **权限存储原则**：`users` 表仅存储 UserID 和其自身属性（姓名、密码等）。角色分配通过 `user_roles` 表管理。**不冗余存储飞书已有的元数据（如姓名、部门名），也不存在"同步组织架构"逻辑。**

### 2.2 `roles` — 角色定义

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | UUID (PK) | |
| `code` | VARCHAR(64) UNIQUE | 角色代码（如 `admin`、`business_group_leader`） |
| `name` | VARCHAR(128) | 角色显示名 |
| `level` | ENUM(`execution`, `supervisor`, `management`, `global`) | 层级 |
| `description` | VARCHAR(512) NULLABLE | 描述 |
| `is_active` | BOOLEAN | |
| `created_at` | TIMESTAMPTZ | |

### 2.3 `user_roles` — 用户-角色-部门三元关系（核心鉴权表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `user_id` | UUID (PK 之一) | FK → `users.id` CASCADE | |
| `role_id` | UUID (PK 之一) | FK → `roles.id` CASCADE | |
| `department_id` | UUID (PK 之一) | FK → `departments.id` CASCADE | |
| `is_primary` | BOOLEAN | DEFAULT FALSE | 是否主角色 |
| `created_at` | TIMESTAMPTZ | | |

> 复合主键 = `(user_id, role_id, department_id)`。一人可在多部门有不同角色。

### 2.4 `work_orders` — 主工单

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | UUID (PK) | |
| `order_no` | VARCHAR(64) UNIQUE | 工单号 |
| `order_type` | ENUM(`onboarding`, `renewal`, `resignation`, `benefit`) | 业务类型 |
| `status` | ENUM(`draft`, `pending`, `processing`, `completed`, `returned`, `withdraw_pending`, `withdrawn`, `void_pending`, `void`) | |
| `created_by` | UUID FK→users | 创建人 |
| `department_id` | UUID FK→departments | 所属部门 |
| `customer_id` | UUID FK→customers | 客户 |
| `branch_id` | UUID FK→branches NULLABLE | 分支 |
| `customer_code` | VARCHAR(64) NULLABLE | 客户编号冗余 |
| `branch_code` | VARCHAR(64) NULLABLE | 分支编号冗余 |
| `customer_name` | VARCHAR(128) NULLABLE | 客户名称冗余 |
| `employee_name` | VARCHAR(128) | 员工姓名 |
| `employee_id_card` | VARCHAR(64) | 身份证号 |
| `extra_data` | JSONB | 扩展数据（动态字段值） |
| `submitted_at` | TIMESTAMPTZ NULLABLE | 提交时间 |
| `completed_at` | TIMESTAMPTZ NULLABLE | 完成时间 |
| `last_modified_at` | TIMESTAMPTZ NULLABLE | 最后修改时间 |
| `last_modified_by` | UUID NULLABLE | 最后修改人 |
| `modification_round` | INT DEFAULT 0 | 修改轮次 |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

> **终态集合**：`COMPLETED`、`WITHDRAWN`、`VOID` 为工单终态。

### 2.5 `dispatched_orders` — 子工单

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | UUID (PK) | |
| `parent_order_id` | UUID FK→work_orders CASCADE | 父工单 |
| `module_code` | VARCHAR(64) | 模块代码（如 `data_entry`, `contract`） |
| `status` | ENUM(`DispatchedOrderStatus`，**8 态**，无 `draft`) | 子工单状态独立于主工单，无草稿态 |
| `handler_id` | UUID FK→users SET NULL | 当前处理人 |
| `visible_fields` | JSONB NULLABLE | 可见字段列表 |
| `return_reason` | VARCHAR(512) NULLABLE | 退回原因 |
| `flow_round` | INT DEFAULT 0 | 流转轮次 |
| `completion_remark` | VARCHAR(1024) NULLABLE | 完成备注 |
| `dispatched_at` | TIMESTAMPTZ NULLABLE | 派发时间 |
| `due_at` | TIMESTAMPTZ NULLABLE | 截止时间 |
| `sla_hours` | INT NULLABLE | SLA 小时数 |
| `sla_reminder_before_hours` | INT NULLABLE | 提前提醒小时数 |
| `accepted_at` | TIMESTAMPTZ NULLABLE | 接单时间 |
| `completed_at` | TIMESTAMPTZ NULLABLE | 完成时间 |
| `void_at` | TIMESTAMPTZ NULLABLE | 废弃时间 |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

### 2.6 `field_configs` — 动态字段定义

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | UUID (PK) | |
| `field_code` | VARCHAR(128) UNIQUE | 字段代码 |
| `field_name` | VARCHAR(128) | 字段显示名 |
| `field_type` | ENUM(`text`, `number`, `date`, `dropdown`, `email`, `phone`) | |
| `is_required` | BOOLEAN | 是否必填 |
| `default_required` | BOOLEAN | 默认必填 |
| `conditional_required` | JSONB NULLABLE | 条件必填规则 |
| `validation_regex` | VARCHAR(512) NULLABLE | 校验正则 |
| `validation_msg` | VARCHAR(512) NULLABLE | 校验错误消息 |
| `dropdown_options` | JSONB NULLABLE | 下拉选项列表 |
| `collection_group` | VARCHAR(128) NULLABLE | 分组 |
| `placeholder` | VARCHAR(255) NULLABLE | 占位提示 |
| `help_text` | VARCHAR(512) NULLABLE | 帮助文本 |
| `order_type` | ENUM OrderType NULLABLE | 适用工单类型 |
| `business_context` | JSONB NULLABLE | 适用业务上下文（多类型数组） |
| `display_order` | INT DEFAULT 0 | 排序 |
| `is_active` | BOOLEAN | |

### 2.7 `field_permissions` — 字段权限

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | UUID (PK) | |
| `role_id` | UUID FK→roles CASCADE | |
| `field_code` | VARCHAR(128) | |
| `permission` | ENUM(`visible`, `hidden`, `readonly`, `masked`) | |
| `scenario` | VARCHAR(128) | 场景标识（如 `main`、`dispatched:data_entry`） |
| UNIQUE | `(role_id, field_code, scenario)` | |

### 2.8 `dispatch_rules` — 派发规则

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | UUID (PK) | |
| `rule_name` | VARCHAR(128) | |
| `order_type` | ENUM OrderType | |
| `trigger_conditions` | JSONB NULLABLE | 触发条件 |
| `target_module` | VARCHAR(64) | 目标子模块 |
| `customer_id` | UUID FK→customers SET NULL | 限定客户 |
| `department_id` | UUID FK→departments SET NULL | 限定部门 |
| `sub_module` | VARCHAR(32) NULLABLE | 子模块细分 |
| `assignee_user_id` | UUID FK→users SET NULL | 指定处理人 |
| `fallback_user_id` | UUID FK→users SET NULL | 兜底处理人 |
| `allow_manual_override` | BOOLEAN DEFAULT TRUE | 允许手动覆盖 |
| `dispatch_strategy` | ENUM(`fixed`, `round_robin`, `load_balance`, `team_claim`, `pool`) | |
| `is_active` | BOOLEAN | |
| `priority` | INT DEFAULT 100 | 优先级（越小越高） |

---

## 3. 枚举常量（全部）

### 3.1 `OrderType` — 工单业务类型

```
onboarding  — 入职
renewal     — 续签
resignation — 离职
benefit     — 待遇申报
```

### 3.2 `WorkOrderStatus` — 主工单状态（9 态）

```
draft             — 草稿
pending           — 待处理
processing        — 处理中
completed         — 已完成
returned          — 已退回
withdraw_pending  — 撤回审批中
withdrawn         — 已撤回
void_pending      — 废弃审批中
void              — 已废弃
```

> 终态集合 `WORK_ORDER_TERMINAL_STATUSES` = `completed` / `withdrawn` / `void`。

### 3.2b `DispatchedOrderStatus` — 子工单状态（8 态）

```
pending           — 待处理
processing        — 处理中
completed         — 已完成
returned          — 已退回
withdraw_pending  — 撤回审批中
withdrawn         — 已撤回
void_pending      — 废弃审批中
void              — 已废弃
```

> ⚠️ 子工单**没有 `draft` 态**（草稿仅存在于主工单），其余 8 态与主工单同名。

### 3.3 `RoleLevel` — 角色层级

```
execution   — 执行层
supervisor  — 主管层
management  — 管理层
global      — 全局管理
```

### 3.4 `FieldType` — 字段类型

```
text / number / date / dropdown / email / phone
```

### 3.5 `FieldPermissionMode` — 字段权限模式

```
visible / hidden / readonly / masked
```

### 3.6 `DispatchStrategy` — 派发策略

```
fixed        — 固定指定人
round_robin  — 轮询
load_balance — 负载均衡
team_claim   — 团队认领
pool         — 公共池
```

### 3.7 `DispatchModuleCode` — 子模块代码（9 个）

```
data_entry          — 数据录入
social_insurance    — 社保公积金办理
onboarding_contact  — 入职联系
contract            — 劳动合同签订
renewal_contract    — 续签合同
benefit_apply       — 待遇申报
resignation_contact — 离职联系
resignation_cert    — 离职证明
data_entry_resign   — 离职数据录入
```

### 3.8 `ImportJobStatus`

```
processing / completed / partial / failed / cancelled
```

---

## 4. 全部后端 API 接口清单

### 4.1 认证 (`/api/auth`)

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| POST | `/api/auth/login` | Public | 登录，返回 JWT + refreshToken |
| POST | `/api/auth/logout` | JWT | 登出 |
| POST | `/api/auth/refresh` | Public | 刷新 Token |
| GET | `/api/auth/me` | JWT | 获取当前用户信息 |
| POST | `/api/auth/change-password` | JWT | 修改密码 |

### 4.2 工单管理 (`/api/work-orders`)

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/api/work-orders` | JWT + FieldPerm | 分页列表 |
| POST | `/api/work-orders` | JWT + bizPerm(`work_order.create`) | 创建草稿 |
| GET | `/api/work-orders/:id` | JWT + FieldPerm | 工单详情 |
| PUT | `/api/work-orders/:id` | JWT + FieldPerm | 更新工单 |
| POST | `/api/work-orders/:id/submit` | JWT + FieldPerm | 提交工单 |
| POST | `/api/work-orders/:id/resubmit` | JWT + FieldPerm | 重新提交（退回后） |
| POST | `/api/work-orders/:id/withdraw` | JWT + FieldPerm | 撤回申请 |
| POST | `/api/work-orders/:id/withdraw/approve` | JWT + FieldPerm | 审批撤回 |
| POST | `/api/work-orders/:id/urge` | JWT + FieldPerm | 催办 |
| POST | `/api/work-orders/:id/void` | JWT + FieldPerm | 申请废弃 |
| POST | `/api/work-orders/:id/void/approve` | JWT + FieldPerm | 审批废弃 |
| DELETE | `/api/work-orders/:id` | JWT + Roles('admin') + Audit | 管理员删除 |
| POST | `/api/work-orders/:id/delete-request` | JWT + FieldPerm | 发起删除请求 |
| POST | `/api/work-orders/batch-delete` | JWT + Roles('admin') + Audit | 批量删除 |
| GET | `/api/work-orders/:id/timeline` | JWT + FieldPerm | 工单动态/时间线 |

### 4.3 子工单管理 (`/api/dispatched-orders`)

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/api/dispatched-orders` | JWT + FieldPerm | 我的子工单列表 |
| GET | `/api/dispatched-orders/team/:module` | JWT + FieldPerm | 团队子工单列表 |
| GET | `/api/dispatched-orders/module-members` | JWT + FieldPerm | 模块成员列表 |
| GET | `/api/dispatched-orders/:id` | JWT + FieldPerm | 子工单详情 |
| GET | `/api/dispatched-orders/:id/supplement-logs` | JWT + FieldPerm | 补充日志 |
| DELETE | `/api/dispatched-orders/:id` | JWT + Roles('admin') + Audit | 管理员删除 |
| POST | `/api/dispatched-orders/:id/accept` | JWT + FieldPerm | 接单 |
| POST | `/api/dispatched-orders/:id/claim` | JWT + FieldPerm | 认领（池/团队认领） |
| POST | `/api/dispatched-orders/:id/dirty/confirm-read` | JWT + FieldPerm | 确认已读字段变更标记 |
| POST | `/api/dispatched-orders/:id/complete` | JWT + FieldPerm | 完成 |
| POST | `/api/dispatched-orders/:id/return` | JWT + FieldPerm | 退回 |
| POST | `/api/dispatched-orders/:id/creator-update` | JWT + FieldPerm | 创建人补录/更新 |
| POST | `/api/dispatched-orders/:id/urge` | JWT + FieldPerm | 催办 |
| POST | `/api/dispatched-orders/:id/withdraw` | JWT + FieldPerm | 撤回申请 |
| POST | `/api/dispatched-orders/:id/withdraw/approve` | JWT + FieldPerm | 审批撤回 |
| POST | `/api/dispatched-orders/:id/void` | JWT + FieldPerm | 申请废弃 |
| POST | `/api/dispatched-orders/:id/void/approve` | JWT + FieldPerm | 审批废弃 |
| POST | `/api/dispatched-orders/:id/void/restore` | JWT + FieldPerm | 废弃恢复 |
| POST | `/api/dispatched-orders/:id/supplement` | JWT | 字段补充 |
| POST | `/api/dispatched-orders/:id/reassign` | JWT + FieldPerm | 转派 |
| POST | `/api/dispatched-orders/:id/benefit/transition` | JWT + FieldPerm | 待遇阶段流转 |
| POST | `/api/dispatched-orders/:id/export` | JWT | 单个导出 |
| POST | `/api/dispatched-orders/batch-complete` | JWT + FieldPerm | 批量完成 |
| POST | `/api/dispatched-orders/batch-return` | JWT + FieldPerm | 批量退回 |
| POST | `/api/dispatched-orders/batch-urge` | JWT + FieldPerm | 批量催办 |
| POST | `/api/dispatched-orders/batch-import` | JWT | 批量导入子工单 |
| POST | `/api/dispatched-orders/batch-export` | JWT | 批量导出 |
| POST | `/api/dispatched-orders/batch-delete` | JWT + Roles('admin') + Audit | 批量删除 |
| POST | `/api/dispatched-orders/social-insurance/batch-complete` | JWT + FieldPerm | 社保模块批量完成 |

### 4.4 子工单别名路由 (`/api/work-orders/sub`)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/work-orders/sub/:id/reassign` | 子工单转派（旧路径兼容） |

### 4.5 仪表盘 (`/api/dashboard`)

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/api/dashboard/cards` | JWT | 仪表盘卡片数据（支持 `?scope=mine\|team`） |
| GET | `/api/dashboard/salesperson` | JWT | [deprecated] 业务员指标 |
| GET | `/api/dashboard/team/:module` | JWT + Roles | [deprecated] 团队指标 |
| GET | `/api/dashboard/processor/:module` | JWT + Roles | 处理人指标 |
| GET | `/api/dashboard/manager` | JWT + Roles('manager','admin') | [deprecated] 管理者指标 |
| GET | `/api/dashboard/admin` | JWT + Roles('admin') | 管理员指标 |
| GET | `/api/dashboard/order-type-matrix` | JWT | 工单类型矩阵 |
| GET | `/api/dashboard/leader-trend` | JWT + Roles | 趋势数据 |

### 4.6 管理员模块 (`/api/admin/*`)

#### 4.6.1 用户管理 (`/api/admin/users`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/users` | 用户列表 |
| POST | `/api/admin/users` | 创建用户 |
| GET | `/api/admin/users/:id` | 用户详情 |
| PUT | `/api/admin/users/:id` | 更新用户 |
| DELETE | `/api/admin/users/:id` | 禁用用户 |
| POST | `/api/admin/users/:id/reset-password` | 重置密码 |
| POST | `/api/admin/users/:id/roles` | 绑定角色 |
| DELETE | `/api/admin/users/:id/roles/:roleId` | 解绑角色 |

#### 4.6.2 角色管理 (`/api/admin/roles`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/roles` | 角色列表 |
| POST | `/api/admin/roles` | 创建角色 |
| PUT | `/api/admin/roles/:id` | 更新角色 |
| DELETE | `/api/admin/roles/:id` | 删除角色 |

#### 4.6.3 部门管理 (`/api/admin/departments`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/departments` | 部门树列表 |
| POST | `/api/admin/departments` | 创建部门 |
| PUT | `/api/admin/departments/:id` | 更新部门 |
| DELETE | `/api/admin/departments/:id` | 删除部门 |
| POST | `/api/admin/departments/:id/move` | 移动部门（调整父节点） |

#### 4.6.4 客户管理 (`/api/admin/customers`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/customers` | 客户列表 |
| POST | `/api/admin/customers` | 创建客户 |
| GET | `/api/admin/customers/:id` | 客户详情 |
| PUT | `/api/admin/customers/:id` | 更新客户 |
| DELETE | `/api/admin/customers/:id` | 删除客户 |
| POST | `/api/admin/customers/:id/toggle` | 启用/禁用切换 |

分支管理 (`/api/admin/branches`)：`GET` / `POST` / `GET :id` / `PUT :id` / `DELETE :id`。

#### 4.6.5 业务员客户绑定 (`/api/admin/customer-assignees`)

`GET` / `POST` / `GET :id` / `PUT :id` / `DELETE :id`。

#### 4.6.6 字段配置 (`/api/admin/fields`，别名 `field-configs` / `work-order-fields`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/fields` | 字段列表 |
| GET | `/api/admin/fields/baseline` | 基线字段集 |
| POST | `/api/admin/fields` | 创建字段 |
| PUT | `/api/admin/fields/:id` | 更新字段 |
| DELETE | `/api/admin/fields/:id` | 删除字段 |
| POST | `/api/admin/fields/reorder` | 字段排序 |

#### 4.6.7 字段权限 (`/api/admin/field-permissions`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/field-permissions/matrix` | 权限矩阵 |
| POST | `/api/admin/field-permissions/batch` | 批量保存 |
| POST | `/api/admin/field-permissions/copy` | 跨角色复制权限 |

#### 4.6.8 模块配置 (`/api/admin`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/work-order-modules` | 模块定义列表 |
| POST | `/api/admin/work-order-modules` | 创建模块 |
| PUT | `/api/admin/work-order-modules/:id` | 更新模块 |
| GET | `/api/admin/modules/:moduleCode/fields` | 模块字段关联 |
| PUT | `/api/admin/modules/:moduleCode/fields` | 更新模块字段关联 |
| GET | `/api/admin/module-supervisors` | 模块主管列表 |
| POST | `/api/admin/module-supervisors` | 设置模块主管 |
| GET | `/api/admin/action-configs` | 角色操作权限配置列表 |
| POST | `/api/admin/action-configs` | 保存角色操作权限配置 |

#### 4.6.9 模块处理人 (`/api/admin/module-handlers`)

`GET` / `POST` / `PUT :id` / `DELETE :id`。

例外处理人 (`/api/admin/exception-module-handlers`)：`GET` / `POST` / `PATCH :id` / `PUT :id` / `DELETE :id`。

#### 4.6.10 派发规则 (`/api/admin/dispatch-rules` / `/api/admin/dispatch-config`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/dispatch-rules` | 规则列表 |
| GET | `/api/admin/dispatch-rules/:id` | 规则详情 |
| POST | `/api/admin/dispatch-rules` | 创建规则 |
| PUT | `/api/admin/dispatch-rules/:id` | 更新规则 |
| DELETE | `/api/admin/dispatch-rules/:id` | 删除规则 |
| POST | `/api/admin/dispatch-rules/simulate` | 规则命中模拟 |
| GET | `/api/admin/dispatch-config` | 派发配置聚合视图 |

#### 4.6.11 导出模板 (`/api/admin/export-templates`，别名 `export-templates`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/export-templates` | 模板列表 |
| GET | `/api/admin/export-templates/:id` | 模板详情 |
| POST | `/api/admin/export-templates/:id/apply-preview` | 应用预览 |
| POST | `/api/admin/export-templates/:id/apply` | 应用导出 |
| POST | `/api/admin/export-templates` | 创建模板 |
| PUT | `/api/admin/export-templates/:id` | 更新模板 |
| DELETE | `/api/admin/export-templates/:id` | 删除模板 |

#### 4.6.12 操作日志 (`/api/admin/logs` / `/api/operation-logs`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/logs` | 日志列表 |
| GET | `/api/admin/logs/:id` | 日志详情 |
| GET | `/api/operation-logs` | 日志列表（别名路径） |

#### 4.6.13 AI 设置 (`/api/admin/ai-settings`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/ai-settings` | 获取 AI 配置 |
| PUT | `/api/admin/ai-settings` | 更新 AI 配置 |
| POST | `/api/admin/ai-settings/test` | 连通性测试 |

#### 4.6.14 系统设置 (`/api/admin/system-settings`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/system-settings/operation-log-retention` | 获取日志保留天数 |
| PUT | `/api/admin/system-settings/operation-log-retention` | 更新日志保留天数 |

#### 4.6.15 工作流 (`/api/admin/workflows`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/workflows` | 工作流列表 |
| GET | `/api/admin/workflows/:id` | 工作流详情 |
| POST | `/api/admin/workflows` | 创建工作流 |
| PUT | `/api/admin/workflows/:id` | 更新工作流 |
| POST | `/api/admin/workflows/:id/publish` | 发布 |
| POST | `/api/admin/workflows/:id/deactivate` | 停用 |
| DELETE | `/api/admin/workflows/:id` | 删除 |

### 4.7 其他模块

#### 4.7.1 AI 字段映射 (`/api/ai`)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/ai/field-mapping` | AI 辅助导入字段映射 |

#### 4.7.2 Excel 导入 (`/api/work-orders/import`)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/work-orders/import/preview` | 导入预览（解析+校验） |
| POST | `/api/work-orders/import/confirm` | 确认导入 |
| GET | `/api/work-orders/import/:jobId` | 查询导入任务状态 |
| POST | `/api/work-orders/import/:jobId/cancel` | 取消导入任务 |
| GET | `/api/work-orders/import/:jobId/error-report` | 错误报告 |
| GET | `/api/work-orders/import/jobs/:jobId/error-report` | 错误报告（别名路径） |

#### 4.7.3 通知 (`/api/notifications`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/notifications` | 通知列表 |
| GET | `/api/notifications/unread-count` | 未读总数 |
| GET | `/api/notifications/unread-count-by-bucket` | 按分桶统计未读 |
| GET | `/api/notifications/unread-by-type` | 按类型统计未读 |
| GET | `/api/notifications/:id` | 通知详情 |
| POST | `/api/notifications/:id/read` | 标记单条已读 |
| POST / PATCH | `/api/notifications/read-all` | 全部已读 |
| POST / PATCH | `/api/notifications/read-by-query` | 按条件批量已读 |
| DELETE | `/api/notifications/:id` | 删除通知 |

#### 4.7.4 通知 SSE 实时推送

| 方法 | 路径 | 说明 |
|------|------|------|
| SSE | `/api/events/notifications` | 实时通知事件流 |
| SSE | `/api/notifications/stream` | 实时通知事件流（别名路径） |

#### 4.7.5 工单阶段 (`/api/stages`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/stages` | 阶段时间线列表 |
| POST | `/api/stages` | 新增阶段节点 |

#### 4.7.6 角色操作权限 (`/api/role-action-permissions` / `/api/admin/role-action-permissions`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/role-action-permissions/me` | 当前用户的操作权限 |
| GET | `/api/admin/role-action-permissions` | 操作权限矩阵 |
| PUT | `/api/admin/role-action-permissions` | 批量保存操作权限 |
| PUT | `/api/admin/role-action-permissions/role` | 按角色保存操作权限 |

#### 4.7.7 附件 (`/api/attachments`)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/attachments/upload` | 上传附件 |
| GET | `/api/attachments` | 附件列表 |
| POST | `/api/attachments/:id/review` | 审核附件 |
| POST | `/api/attachments/:id/stamp` | 盖章 |
| POST | `/api/attachments/:id/receive` | 签收 |

#### 4.7.8 文件上传 (`/api/upload` / `/api/files`)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/upload/excel` | 上传 Excel |
| POST | `/api/upload/attachment` | 上传附件 |
| GET | `/api/upload/files/:id` | 下载/读取文件 |
| GET | `/api/files/:id` | 文件读取（短路径） |

> ⚠️ **路由重复隐患**：`uploads.controller.ts` 也注册了 `POST /api/upload/excel`、`POST /api/upload/attachment`、`GET /api/files/:id`，与 `upload.controller.ts` 路径重叠。需在后续重构中确认二者优先级或合并，避免歧义。

#### 4.7.9 健康检查

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 存活探针 |

### 4.8 团队用户查询 (`/api/users`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/users/by-team/:teamCode` | 按团队代码查用户 |

---

## 5. 认证与权限架构

### 5.1 全局守卫链

```
请求 → TraceIdMiddleware
     → JwtAuthGuard（全局：除 @Public() 外均需 JWT）
     → RolesGuard（全局：检查 @Roles() 装饰器）
     → AdminOnlyGuard（局部）
     → BusinessPermission（局部：检查 @BusinessPermission()）
     → FieldPermissionInterceptor（全局：字段级脱敏/隐藏）
```

### 5.2 JWT Payload 结构

```ts
{
  sub: string;      // user.id (UUID)
  username: string; // 登录名
  roles: string[];  // 角色代码数组
  iat: number;
  exp: number;
}
```

### 5.3 字段权限场景

- `main` — 主工单列表/详情
- `dispatched:auto` — 子工单自动推导场景
- `dispatched:{moduleCode}` — 子工单特定模块场景

---

## 6. 外部依赖

| 服务 | 用途 |
|------|------|
| OpenAI 兼容 API | AI 辅助 Excel 导入字段映射（可选，通过环境变量配置） |
