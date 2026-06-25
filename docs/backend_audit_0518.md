# 后端现状摸底报告（0518 反馈整改前置）

> 任务 ID：b7f5aaec-724a-430d-bac0-5b27147b5e30  
> 调研范围：`backend/src` 现有 NestJS 后端代码。  
> 说明：本报告只记录代码阅读事实；未执行代码改造。后端全局前缀在 `backend/src/main.ts`：`app.setGlobalPrefix('api')`，下文路由均按 `/api/...` 记录。

---

## 1. 工单状态机现状

### 1.1 状态枚举值

**文件路径**：`backend/src/entities/enums.ts`

```ts
export enum WorkOrderStatus {
  DRAFT = 'draft',
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  RETURNED = 'returned',
  WITHDRAWN = 'withdrawn',
}

export enum DispatchedOrderStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  RETURNED = 'returned',
}
```

**中文展示（当前代码未集中定义 label，按已有产品/历史文档口径整理）**：

| 枚举 | 值 | 中文展示 | 现状评价 |
|---|---|---|---|
| `WorkOrderStatus.DRAFT` | `draft` | 草稿 | 已实现 |
| `WorkOrderStatus.PENDING` | `pending` | 待处理/待派发 | 已实现，但 submit 中只是中间态 |
| `WorkOrderStatus.PROCESSING` | `processing` | 处理中 | 已实现 |
| `WorkOrderStatus.COMPLETED` | `completed` | 已完成 | 已实现 |
| `WorkOrderStatus.RETURNED` | `returned` | 已退回/待业务员修改 | 已实现 |
| `WorkOrderStatus.WITHDRAWN` | `withdrawn` | 已撤回/作废类 | 枚举存在，但未找到当前接口将工单置为 withdrawn |
| `DispatchedOrderStatus.PENDING` | `pending` | 待办理/待接单 | 已实现 |
| `DispatchedOrderStatus.PROCESSING` | `processing` | 办理中 | 已实现 |
| `DispatchedOrderStatus.COMPLETED` | `completed` | 已完成 | 已实现 |
| `DispatchedOrderStatus.RETURNED` | `returned` | 已退回 | 已实现 |

**GAP 点**：后端未找到统一的“状态中文名映射”导出；API 多处仍返回英文状态，需要前端自行映射或新增 `statusText`。

### 1.2 状态转移逻辑位置与现有路径

#### 主工单创建/提交

**文件路径**：`backend/src/modules/work-orders/work-order.service.ts`

```ts
// createDraft
status: WorkOrderStatus.DRAFT,

// submit
if (workOrder.status === WorkOrderStatus.PROCESSING || workOrder.status === WorkOrderStatus.COMPLETED || workOrder.status === WorkOrderStatus.WITHDRAWN) {
  throw businessException(4113, HttpStatus.CONFLICT, '重复提交');
}
if (workOrder.status !== WorkOrderStatus.DRAFT && workOrder.status !== WorkOrderStatus.RETURNED) {
  throw businessException(4114, HttpStatus.CONFLICT, '主工单非 returned 态，不能重新提交');
}
...
workOrder.status = WorkOrderStatus.PENDING;
...
status: DispatchedOrderStatus.PENDING,
...
workOrder.status = WorkOrderStatus.PROCESSING;
```

**现有路径**：
- 新建：无 → `draft`
- 首次提交：`draft` → `pending` → `processing`，同时创建子工单 `pending`
- returned 状态普通 submit：`returned` → `processing`，复位 returned 子单（旧逻辑）

**现状评价**：提交链路已实现；但 `pending` 对主工单只是短暂中间态。

**GAP 点**：普通 `submit` 和专门 `resubmit` 两条退回后重提路径并存，行为不完全一致，后续整改需统一入口。

#### 专门重新提交

**文件路径**：`backend/src/modules/work-orders/work-order-resubmit.service.ts`

```ts
if (workOrder.status !== WorkOrderStatus.RETURNED) {
  throw businessException(4114, HttpStatus.CONFLICT, '仅 returned 状态允许重新提交');
}
...
workOrder.status = WorkOrderStatus.PROCESSING;
...
if (current.status !== DispatchedOrderStatus.COMPLETED) {
  current.status = DispatchedOrderStatus.PENDING;
}
```

**现有路径**：`returned` → `processing`；按当前派发结果更新/创建子单，非 completed 子单回到 `pending`。

**现状评价**：已实现专门重提服务。

**GAP 点**：与 `WorkOrderService.submit` 中 returned 分支存在重复/不一致风险。

#### 子工单接单/认领/完成/退回/转交

**文件路径**：`backend/src/modules/dispatched-orders/dispatched-order.service.ts`

```ts
// accept
if (order.status !== DispatchedOrderStatus.PENDING) throw ...
.set({ status: DispatchedOrderStatus.PROCESSING, handlerId, acceptedAt: new Date() })

// claim
.set({ handlerId: user.sub, status: DispatchedOrderStatus.PROCESSING, acceptedAt: new Date() })

// complete
.set({ status: DispatchedOrderStatus.COMPLETED, completedAt: new Date(), completionRemark: remark || null })
.andWhere('status = :status', { status: DispatchedOrderStatus.PROCESSING })

// returnOrder
order.status = DispatchedOrderStatus.RETURNED;
order.parentOrder.status = WorkOrderStatus.RETURNED;

// reassign
await this.dispatchedOrderRepository.update(id, {
  handlerId: newHandlerId,
  status: DispatchedOrderStatus.PENDING,
  acceptedAt: null,
});
```

**现有路径**：
- 子工单接单：`pending` → `processing`
- 公共池认领：未分配 `pending` → `processing`
- 子工单完成：`processing` → `completed`
- 全部子单完成后主单：`processing` → `completed`
- 子工单退回：子单任意可处理状态/完成态（完成态需主管/admin）→ `returned`；主单 → `returned`
- 子工单转交：当前子单 → `pending`，重置处理人

**现状评价**：核心后道状态机已实现。

**GAP 点**：没有独立状态用于“作废”；`withdrawn` 枚举存在但当前业务接口未落地。

### 1.3 退回/撤回/作废/重新提交/催办/修改重提接口

| 动作 | 是否已有 | 文件路径 | 路由路径 | 说明/GAP |
|---|---:|---|---|---|
| 退回 | 已有 | `backend/src/modules/dispatched-orders/dispatched-order.controller.ts` | `POST /api/dispatched-orders/:id/return` | 子工单退回，主工单置 `returned` |
| 撤回 | 未找到 | 未找到 | 未找到 | 数据库迁移中有历史 withdraw 表相关内容，但当前模块未找到撤回 controller/service |
| 作废 | 未找到 | 未找到 | 未找到 | `withdrawn` 枚举存在；未找到 `cancel/void/invalid` 类业务接口 |
| 重新提交 | 已有 | `backend/src/modules/work-orders/work-order.controller.ts` | `POST /api/work-orders/:id/resubmit` | 专门重提；另 `POST /api/work-orders/:id/submit` 对 returned 有旧重提逻辑 |
| 催办 | 未找到 | 未找到 | 未找到 | 未找到 `urge/remind` 路由或服务方法 |
| 修改重提 | 部分已有 | `work-order.service.ts` + `work-order-resubmit.service.ts` | `PUT /api/work-orders/:id` + `POST /api/work-orders/:id/resubmit` | 修改与重提分离；未形成“修改重提”一体动作 |

---

## 2. 角色与权限现状

### 2.1 角色枚举/角色种子现状

后端没有 `UserRoleEnum` 这类 TS 枚举；角色是数据库表 `roles` + seed 维护。

**文件路径**：`backend/src/entities/role.entity.ts`

```ts
@Entity({ name: 'roles' })
export class Role {
  @Column({ type: 'varchar', length: 64, unique: true })
  code!: string;

  @Column({ type: 'varchar', length: 128 })
  name!: string;

  @Column({ type: 'enum', enum: RoleLevel, default: RoleLevel.EXECUTION })
  level!: RoleLevel;
}
```

**文件路径**：`backend/src/database/seeds/seed-roles.ts`

当前 active seed 主要包括：

```ts
{ code: 'admin', name: '系统管理员', level: RoleLevel.GLOBAL, ... }
{ code: 'biz_manager', name: '业务负责人', level: RoleLevel.MANAGEMENT, ... }
{ code: 'biz_leader', name: '业务组长', level: RoleLevel.SUPERVISOR, ... }
{ code: 'biz_member', name: '业务员（组员）', level: RoleLevel.EXECUTION, ... }
{ code: 'shared_leader', name: '共享团队负责人', level: RoleLevel.SUPERVISOR, ... }
{ code: 'contract_specialist', name: '合同专员', level: RoleLevel.EXECUTION, ... }
{ code: 'onboarding_specialist', name: '入离职联系专员', level: RoleLevel.EXECUTION, ... }
{ code: 'data_entry_leader', name: '数据录入组长', level: RoleLevel.EXECUTION, ... }
```

**需求角色覆盖情况**：

| 需求角色 | 当前 code/名称 | 是否有 |
|---|---|---:|
| 业务员 | `biz_member`（兼容旧 `salesperson` 已停用） | 有 |
| 组长 | `biz_leader` | 有 |
| 负责人 | `biz_manager` | 有 |
| 合同专员 | `contract_specialist` | 有 |
| 入离职联系专员 | `onboarding_specialist` | 有 |
| 数据录入岗 | 当前是 `data_entry_leader`，名称“数据录入组长” | 不完整 |
| 社保公积金专员 | 未找到 active role；旧 `social_security_team/supervisor` 在 deprecatedRoleCodes 中停用 | 未实现/不完整 |
| 共享团队负责人 | `shared_leader` | 有 |
| 管理员 | `admin` | 有 |

**GAP 点**：缺少明确 active 的“社保公积金专员/负责人”角色；数据录入岗命名为 leader 但 level 是 execution，角色语义不清。

### 2.2 菜单/路由权限控制后端实现

后端 RBAC 由全局 Guard + `@Roles()` 元数据实现。

**文件路径**：`backend/src/app.module.ts`

```ts
providers: [
  { provide: APP_GUARD, useClass: JwtAuthGuard },
  { provide: APP_GUARD, useClass: RolesGuard },
  { provide: APP_INTERCEPTOR, useClass: FieldPermissionInterceptor },
]
```

**文件路径**：`backend/src/common/decorators/roles.decorator.ts`

```ts
export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
```

**文件路径**：`backend/src/common/guards/roles.guard.ts`

```ts
const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
  context.getHandler(),
  context.getClass(),
]);
...
const hasRole = requiredRoles.some((role) => userRoles.includes(role));
if (!hasRole) throw new ForbiddenException('Insufficient role permissions');
```

**现状评价**：后端有接口级 RBAC；菜单/前端路由是否显示主要不在后端统一输出，未找到后端“菜单权限树”接口。

**GAP 点**：`@Roles()` 只做静态角色匹配；很多业务接口未标注 `@Roles()`，依赖 service 内部判断。

### 2.3 删除权限、操作权限是否区分角色

**删除权限**：已区分，主工单/子工单删除和批量删除均仅 `admin`。

**文件路径**：`backend/src/modules/work-orders/work-order.controller.ts`

```ts
@Post('batch-delete')
@Roles('admin')
batchDelete(...)

@Delete(':id')
@Roles('admin')
remove(...)
```

**文件路径**：`backend/src/modules/dispatched-orders/dispatched-order.controller.ts`

```ts
@Post('batch-delete')
@Roles('admin')
batchDelete(...)

@Delete(':id')
@Roles('admin')
remove(...)
```

**修改权限**：主工单修改要求创建人本人，且业务负责人只读。

```ts
this.assertBusinessOwnerReadOnly(user);
const workOrder = await this.loadWorkOrder(id);
this.assertOwner(workOrder, user.sub);
```

**撤回/作废/催办权限**：未找到相关接口，无法区分。

**退回/转交/完成权限**：在 `DispatchedOrderService` 内按 handler、模块主管、admin 判断。

```ts
private async assertCanHandle(order, user) {
  if (this.isAdmin(user) || order.handlerId === user.sub) return;
  if (await this.canActAsModuleSupervisor(user, order.moduleCode)) return;
  throw businessException(5000, HttpStatus.FORBIDDEN, '无权操作该子工单');
}
```

**现状评价**：删除权限清晰；后道操作权限有业务判断；撤回/作废/催办未实现。

**GAP 点**：操作权限分散在 service，不是统一 action 权限矩阵；`action_configs.requiredRoles` 字段存在但当前服务未见统一校验使用。

---

## 3. 仪表盘数据接口

### 3.1 接口路径和返回字段

**文件路径**：`backend/src/modules/dashboard/dashboard.controller.ts`

```ts
@Controller('dashboard')
export class DashboardController {
  @Get('salesperson')
  @Roles('salesperson', 'manager', 'admin')
  salesperson(...) { return this.dashboardService.getSalespersonMetrics(user.sub); }

  @Get('team/:module')
  @Roles(...TEAM_DASHBOARD_ROLES)
  team(...) { return this.dashboardService.getTeamMetrics(moduleCode, user); }

  @Get('processor/:module')
  processor(...) { return this.dashboardService.getTeamMetrics(moduleCode, user); }

  @Get('manager')
  @Roles('manager', 'admin')
  manager(...) { return this.dashboardService.getManagerMetrics(user); }

  @Get('admin')
  @Roles('admin')
  admin(...) { return this.dashboardService.getManagerMetrics(user); }
}
```

路由：
- `GET /api/dashboard/salesperson`
- `GET /api/dashboard/team/:module`
- `GET /api/dashboard/processor/:module`
- `GET /api/dashboard/manager`
- `GET /api/dashboard/admin`

**返回字段**（来自 `backend/src/modules/dashboard/dashboard.service.ts`）：

```ts
// salesperson
{ current, previous, deltaPct, trend }
// current: created/submitted/completed/returned/withdrawn

// team
{ moduleCode, counts, pool, top5, members }
// counts: pending/processing/completed/returned/slaBreach

// manager/admin
{ modules, topCustomers, ratios, trend }
// modules: module_code/total/pending/processing/completed/returned/avg_h
// ratios: totalSubmitted/returnRatio/withdrawRatio/avgCloseHours
```

### 3.2 是否按角色差异化返回数据范围

**文件路径**：`backend/src/modules/dashboard/dashboard.service.ts`

```ts
async getSalespersonMetrics(userId: string) {
  ... WHERE wo.created_by = $1 ...
}

// team：非 manager/admin 只看自己或公共池
AND ($2::boolean = true OR d.handler_id = $3 OR d.handler_id IS NULL)

private async resolveDepartmentScope(user) {
  if (isAdminRole(user.roles)) return { departmentIds: null, empty: false };
  if (hasAnyRole(user.roles, BUSINESS_MANAGER_ROLES) || hasAnyRole(user.roles, BUSINESS_LEADER_ROLES)) {
    const departmentIds = await this.workOrderValidationService.resolveUserDepartmentIds(user.sub);
    return { departmentIds, empty: false };
  }
}
```

**现状评价**：有一定角色差异化：个人看本人，团队看模块范围，管理端按部门范围/admin 全量。

**GAP 点**：Controller 仍使用旧角色 `salesperson/manager`，新角色 `biz_member/biz_leader/biz_manager` 覆盖不完整，可能导致新角色访问看板被 403。

### 3.3 是否有按工单类型返回当月总数/处理中/已完成/完成率接口

**现状**：未找到完全匹配接口。

已有 `manager/admin` 的 `modules` 是按 `dispatched_orders.module_code` 聚合，不是按主工单 `order_type`（入职/在职/离职）聚合；也没有直接返回“完成率”。

**GAP 点**：需新增/调整按 `work_orders.order_type` 聚合的当月总数、处理中、已完成、完成率接口。

### 3.4 入职/在职/离职月度趋势接口是否存在

**现状**：未找到独立“入职/在职/离职月度趋势”接口。现有 `trend` 是按日期统计 submitted/completed，没有按 `order_type` 分组。

**GAP 点**：需新增按 `OrderType.ONBOARDING/RENEWAL/RESIGNATION` 分组的月度趋势。

---

## 4. 消息通知现状

### 4.1 notification 模块路径、实体、推送机制

**模块路径**：`backend/src/modules/notifications/*`

**实体路径**：`backend/src/entities/notification.entity.ts`

```ts
@Entity({ name: 'notifications' })
export class Notification {
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @Column({ name: 'biz_type', type: 'varchar', length: 64 }) bizType!: string;
  @Column({ type: 'varchar', length: 255 }) title!: string;
  @Column({ type: 'text' }) content!: string;
  @Column({ type: 'varchar', length: 512, nullable: true }) link!: string | null;
  @Column({ type: 'jsonb', nullable: true }) payload!: Record<string, unknown> | null;
  @Column({ name: 'is_read', type: 'boolean', default: false }) isRead!: boolean;
}
```

**推送机制**：SSE + 站内轮询接口。无 WebSocket。

**文件路径**：`backend/src/modules/notifications/notification-stream.controller.ts`

```ts
@Sse('events/notifications')
streamByEvents(...) { return this.buildStream(user.sub); }

@Sse('notifications/stream')
streamByNotifications(...) { return this.buildStream(user.sub); }

const heartbeat$ = interval(1000).pipe(map(() => ({ type: 'ping', data: { ts: Date.now() } })));
const notifications$ = this.eventBus.subscribe(userId).pipe(map((payload) => ({ type: 'notification', data: payload })));
```

**站内消息创建**：`backend/src/modules/notifications/channels/in-app.channel.ts`

```ts
const saved = await repository.save(entity);
this.eventBus.publish(this.toStreamPayload(saved));
```

### 4.2 现有消息类型枚举

**现状**：未找到 `NotificationType enum`；`bizType` 是字符串。fallback templates 在 `backend/src/modules/notifications/notification.service.ts` 中维护。

```ts
private readonly fallbackTemplates = {
  dispatched_new: {...},
  dispatched_accepted: {...},
  dispatched_completed: {...},
  dispatched_returned: {...},
  dispatched_returned_to_salesperson: {...},
  dispatched_supplemented: {...},
  field_supplemented: {...},
  work_order_completed: {...},
  import_done: {...},
  import_failed: {...},
  sla_breach: {...},
  reassigned_to_you: {...},
  pool_new: {...},
  system_announcement: {...},
}
```

覆盖情况：

| 类型需求 | 是否已有 | 当前 bizType/实现 |
|---|---:|---|
| 字段被后道修改 | 部分有 | `order.field_changed` / `order.completed_modified` 由 `FieldChangeHook` 动态创建，不在 fallback 模板中 |
| 退回 | 有 | `dispatched_returned`、`dispatched_returned_to_salesperson` |
| 催办 | 未找到 | 未找到 `urge/remind` |
| 超时 | 有 | `sla_breach` 模板存在 |
| 作废 | 未找到 | 未找到 void/cancel 作废消息 |
| 撤回 | 未找到/历史痕迹 | 数据库文档/模板 seed 可能有 withdraw 历史，但当前业务接口未找到 |

**GAP 点**：消息类型未强类型化；撤回/作废/催办缺口明显。

### 4.3 未读计数接口 × 消息列表接口一致性

**文件路径**：`backend/src/modules/notifications/notification.controller.ts`

```ts
@Get()
list(@Query() query, @CurrentUser() user) {
  return this.notificationService.list(user.sub, query);
}

@Get('unread-count')
async unreadCount(@CurrentUser() user) {
  return { count: await this.notificationService.countUnread(user.sub) };
}
```

**文件路径**：`backend/src/modules/notifications/notification.service.ts`

```ts
async list(userId, query) {
  const bizType = query.bizType ?? query.biz_type;
  const isRead = typeof query.unread === 'boolean' ? !query.unread : query.isRead;
  const rows = await this.notificationRepository.find({
    where: { userId, ...(bizType ? { bizType } : {}), ...(typeof isRead === 'boolean' ? { isRead } : {}) },
  });
}

async countUnread(userId: string): Promise<number> {
  return this.notificationRepository.count({ where: { userId, isRead: false } });
}
```

**现状评价**：如果列表不带额外过滤，`GET /api/notifications?unread=true` 与 `GET /api/notifications/unread-count` 条件一致。

**GAP 点（BUG-3 可能原因）**：列表支持 `bizType` 过滤，但 `unread-count` 是全量未读；若前端进入某一分类或传错 `isRead/unread/bizType`，就可能出现“有未读数量但列表为空”。`priority` 参数未实际参与过滤。

---

## 5. 批导入现状

### 5.1 批导入接口代码路径

**文件路径**：`backend/src/modules/imports/imports.controller.ts`

```ts
@Controller('work-orders')
export class ImportsController {
  @Post('import/preview')
  @Roles(...WORK_ORDER_CREATOR_ROLES)
  @UseInterceptors(FileInterceptor('file', ...))
  preview(...)

  @Post('import/confirm')
  @Roles(...WORK_ORDER_CREATOR_ROLES)
  confirm(...)

  @Get('import/:jobId')
  getJob(...)

  @Post('import/:jobId/cancel')
  cancel(...)

  @Get('import/:jobId/error-report')
  errorReport(...)
}
```

路由：
- `POST /api/work-orders/import/preview`
- `POST /api/work-orders/import/confirm`
- `GET /api/work-orders/import/:jobId`
- `POST /api/work-orders/import/:jobId/cancel`
- `GET /api/work-orders/import/:jobId/error-report`
- 兼容别名：`GET /api/work-orders/import/jobs/:jobId/error-report`

### 5.2 字段映射逻辑：手工还是 AI

**现状**：预览阶段会调用 AI/本地混合映射；确认阶段可接收最终人工 mapping。

**文件路径**：`backend/src/modules/imports/import-job.service.ts`

```ts
const availableFields = await this.fieldValidationService.buildCandidateFields(input.orderType);
const rawSuggestion = await this.aiMappingService.suggest(input.orderType, parsed.headers, availableFields);
const suggestion = this.ensureSuggestion(rawSuggestion, parsed.headers, availableFields);
```

**文件路径**：`backend/src/modules/ai/ai-mapping.service.ts`

```ts
const localResult = forceLlm ? this.emptyLocalMatch(headers) : this.localMatch(headers, candidateFields, 0.85);
if (!forceLlm && localResult.unmatched.length === 0) return localOnly;
...
for (const provider of this.providers()) { ... provider.call(prompt) ... }
...
const fallback = this.fallbackFuzzy(llmHeaders, llmCandidateFields, promptHash, 'no_api_key');
```

**现状评价**：不是纯手工；先本地匹配，未匹配时尝试 LLM，失败后 fuzzy fallback。

### 5.3 必填字段校验：阐错跳过还是静默通过

**文件路径**：`backend/src/modules/imports/field-validation.service.ts`

```ts
const required = await this.isRequired(field, normalized);
if (required && !this.hasValue(value)) {
  const safeDefault = SOFT_REQUIRED_SAFE_DEFAULTS[field.fieldCode];
  if (safeDefault !== undefined) { ... } else {
    errors.push({ fieldCode: field.fieldCode, reason: 'required', message: `${field.fieldName}为必填项，请在导入表格中补充后重新导入` });
  }
}
```

**文件路径**：`backend/src/modules/imports/import-job.service.ts`

```ts
if (!validation.ok) {
  failRows.push({ rowNo, raw, fieldCode: validation.errors[0]?.fieldCode, message: validation.errors.map((item) => item.message).join('; ') });
  await this.importJobRepository.update({ id: job.id }, { failRows: () => 'fail_rows + 1' });
  continue;
}
```

**现状评价**：必填缺失会记录失败行并跳过，不是静默通过。

**GAP 点**：错误信息进入 job 状态与错误 Excel，但确认接口本身异步返回 processing，前端必须轮询 `GET /api/work-orders/import/:jobId` 才能看到失败详情；如果前端未展示 validationErrors，会表现为“静默”。

### 5.4 批量导入返回结构是否区分成功行/失败行

**文件路径**：`backend/src/modules/imports/types.ts`

```ts
export interface ImportJobStatusVo {
  id: string;
  status: string;
  totalRows: number;
  successRows: number;
  failRows: number;
  progress: number;
  fieldMapping: Record<string, string> | null;
  errorReportUrl?: string | null;
  validationErrors?: ImportValidationErrorItem[];
  warnings?: ImportWarningItem[];
}
```

**文件路径**：`backend/src/modules/imports/import-job.service.ts`

```ts
return {
  id: job.id,
  status,
  totalRows: job.totalRows,
  successRows: job.successRows,
  failRows: job.failRows,
  validationErrors,
  warnings,
  errorReportUrl: job.errorReportUrl,
};
```

**现状评价**：能区分成功行/失败行数量，并有失败行详情和错误报告。

**GAP 点**：`createJob` 初始返回没有最终失败详情，需轮询；失败详情保存于 `aiMappingRaw.validationErrors`，结构不如独立表稳定。

---

## 6. 批量处理现状、部门视角现状

### 6.1 后道待办批量接单/批量转交/批量返回接口

**文件路径**：`backend/src/modules/dispatched-orders/dispatched-order.controller.ts`

当前批量接口只有：

```ts
@Post('batch-delete')
@Roles('admin')
batchDelete(...)

@Post('batch-complete')
batchComplete(...)

@Post('social-insurance/batch-complete')
batchCompleteSocialInsurance(...)
```

对应路由：
- `POST /api/dispatched-orders/batch-delete`
- `POST /api/dispatched-orders/batch-complete`
- `POST /api/dispatched-orders/social-insurance/batch-complete`

**搜索结论**：未找到 `batch-accept`、`batch-claim`、`batch-reassign`、`batch-return` 类接口。

**现状评价**：批量完成已实现，社保有专用批量完成；批量接单/转交/退回未实现。

**GAP 点（BUG-4）**：需新增后道待办批量接单、批量转交、批量退回接口，并定义部分成功/失败返回结构。

### 6.2 部门工单查询接口及模块/节点类型过滤

主工单列表：

**文件路径**：`backend/src/modules/work-orders/work-order.controller.ts`

```ts
@Get()
findAll(@Query() query, @CurrentUser() user) {
  return this.workOrderService.findAll(query, user);
}
```

路由：`GET /api/work-orders`

**文件路径**：`backend/src/modules/work-orders/work-order.service.ts`

```ts
if (!isAdminRole(user.roles)) {
  if (hasAnyRole(user.roles, BUSINESS_MANAGER_ROLES)) {
    const departmentIds = await this.validationService.resolveUserDepartmentIds(user.sub);
    qb.andWhere('w.department_id IN (:...departmentIds)', { departmentIds });
  } else if (hasAnyRole(user.roles, BUSINESS_LEADER_ROLES)) {
    const departmentIds = await this.validationService.resolveUserDepartmentIds(user.sub);
    qb.andWhere('w.department_id IN (:...departmentIds)', { departmentIds });
  } else {
    qb.andWhere('w.created_by = :userId', { userId: user.sub });
  }
}

if (query.orderType) qb.andWhere('w.order_type = :orderType', { orderType: query.orderType });
if (query.status) qb.andWhere('w.status = :status', { status: query.status });
```

子工单/部门后道视角：

**文件路径**：`backend/src/modules/dispatched-orders/dispatched-order.controller.ts`

```ts
@Get()
findAll(...)

@Get('team/:module')
findTeam(@Param('module') moduleCode, ...)
```

路由：
- `GET /api/dispatched-orders`
- `GET /api/dispatched-orders/team/:module`

**文件路径**：`backend/src/modules/dispatched-orders/dispatched-order.service.ts`

```ts
const moduleCode = query.moduleCode ?? query.module_code ?? query.pool;
if (moduleCode) qb.andWhere('d.module_code = :moduleCode', { moduleCode });
const handlerId = query.handlerId ?? query.handler_id;
if (handlerId) qb.andWhere('d.handler_id = :handlerId', ...);
if (query.status) qb.andWhere('d.status = :status', { status: query.status });
```

**现状评价**：主工单按部门范围过滤；子工单按模块/处理人/状态过滤，模块主管可看模块全部。

**GAP 点（BUG-5）**：未找到“部门工单查询”专用接口；子工单视角不按部门层级过滤，而是按模块权限过滤。若需求是“部门视角 + 模块/节点类型过滤”，现有实现不完整。

---

## 7. 表单与字段配置现状

### 7.1 入职/在职/离职字段配置表位置

**字段配置实体**：`backend/src/entities/field-config.entity.ts`

```ts
@Entity({ name: 'field_configs' })
export class FieldConfig {
  @Column({ name: 'field_code', type: 'varchar', length: 128, unique: true }) fieldCode!: string;
  @Column({ name: 'field_name', type: 'varchar', length: 128 }) fieldName!: string;
  @Column({ name: 'field_type', type: 'enum', enum: FieldType }) fieldType!: FieldType;
  @Column({ name: 'is_required', type: 'boolean', default: false }) isRequired!: boolean;
  @Column({ name: 'order_type', type: 'enum', enum: OrderType, nullable: true }) orderType!: OrderType | null;
  @Column({ name: 'business_context', type: 'jsonb', nullable: true }) businessContext!: OrderType[] | null;
}
```

**字段 seed**：`backend/src/database/seeds/seed-fields.ts`

```ts
{ code: 'customer_name', name: '客户名称', type: FieldType.TEXT, required: true, orderType: ONBOARDING, businessContext: ALL_BIZ },
...
{ code: 'renewal_reason', name: '续签原因', type: FieldType.DROPDOWN, required: true, orderType: RENEWAL, businessContext: [RENEWAL] },
...
{ code: 'resignation_type', name: '离职类型', type: FieldType.DROPDOWN, required: true, orderType: RESIGNATION, businessContext: [RESIGNATION] },
```

**现状评价**：入职/续签/离职/待遇申报字段均在 `field_configs` 和 `seed-fields.ts` 维护。需求中的“在职”对应代码里更细分为 `RENEWAL`、`BENEFIT`。

**GAP 点**：未找到名为 `form-template` 的独立表；表单结构主要由字段配置 + 模块字段配置组合生成。

### 7.2 字段权限表

**实体路径**：`backend/src/entities/field-permission.entity.ts`

```ts
@Entity({ name: 'field_permissions' })
@Unique('uq_field_permissions_role_field_scenario', ['roleId', 'fieldCode', 'scenario'])
export class FieldPermission {
  @Column({ name: 'role_id', type: 'uuid' }) roleId!: string;
  @Column({ name: 'field_code', type: 'varchar', length: 128 }) fieldCode!: string;
  @Column({ type: 'enum', enum: FieldPermissionMode, default: FieldPermissionMode.VISIBLE }) permission!: FieldPermissionMode;
  @Column({ type: 'varchar', length: 128 }) scenario!: string;
}
```

**读权限拦截器**：`backend/src/modules/field-permissions/field-permission.interceptor.ts`

```ts
if (cloned.extraData && typeof cloned.extraData === 'object') {
  const result = this.fieldPermissionService.applyExtraData(cloned.extraData, permissions);
  cloned.extraData = result.data;
  cloned.readonlyFields = result.readonlyFields;
}
```

**现状评价**：已有字段读权限/脱敏/只读配置表和响应拦截。

**GAP 点**：写权限没有统一由 `field_permissions` 拦截，主工单写权限仍靠 `assertSalesEditableFields` 等业务硬编码；需补齐“什么角色可写哪个字段”的后端校验闭环。

### 7.3 工单流程配置表

现有与流程/模块相关实体：

- `backend/src/entities/work-order-module.entity.ts` → `work_order_modules`
- `backend/src/entities/module-field.entity.ts` → `module_fields`
- `backend/src/entities/action-config.entity.ts` → `action_configs`
- `backend/src/entities/dispatch-rule.entity.ts` → `dispatch_rules`
- `backend/src/entities/order-stage.entity.ts` → `order_stages`

**模块/动作配置示例**：`backend/src/database/seeds/seed-module-configs.ts`

```ts
{ moduleCode: 'onboarding_contact', moduleName: '入职联系', moduleType: 'sub_module', ... }
{ moduleCode: 'contract', moduleName: '劳动合同签订', ... }
{ moduleCode: 'data_entry', moduleName: '数据录入', ... }
{ moduleCode: 'social_insurance', moduleName: '社保公积金办理', ... }

{ moduleCode: 'social_insurance', actionCode: 'batch_complete', actionName: '社保批量完成', remarkRequired: true, ... }
```

**派发规则实体**：`backend/src/entities/dispatch-rule.entity.ts`

```ts
@Column({ name: 'order_type', type: 'enum', enum: OrderType }) orderType!: OrderType;
@Column({ name: 'trigger_conditions', type: 'jsonb', nullable: true }) triggerConditions!: Record<string, unknown> | null;
@Column({ name: 'target_module', type: 'varchar', length: 64 }) targetModule!: string;
@Column({ name: 'dispatch_strategy', type: 'enum', enum: DispatchStrategy }) dispatchStrategy!: DispatchStrategy;
```

**现状评价**：已有模块、模块字段、动作配置、派发规则等配置表。

**GAP 点**：未找到统一命名为 `workflow` 或 `process-config` 的流程状态机配置表；状态转移仍写在 service 代码中，未配置化。

---

## 8. 入职工单“社保公积金未办是否需要催办”字段

### 8.1 DTO/实体/表单模板中的位置

该字段代码为 `social_urge`。

**字段 seed**：`backend/src/database/seeds/seed-fields.ts`

```ts
{ code: 'social_urge', name: '社保公积金未办是否需要催办', type: FieldType.DROPDOWN, required: true, defaultRequired: true, options: ['是', '否'], orderType: ONBOARDING, businessContext: [ONBOARDING] },
```

**AI 映射别名**：`backend/src/modules/ai/ai-mapping.service.ts`

```ts
social_urge: ['社保公积金未办是否需要催办', '社保公积金是否催办', '社保是否催办', '公积金是否催办'],
```

**导入字段校验别名**：`backend/src/modules/imports/field-validation.service.ts`

```ts
social_urge: ['社保公积金未办是否需要催办', '社保公积金是否催办', '社保是否催办', '公积金是否催办'],
```

**字段权限 seed**：`backend/src/database/seeds/seed-field-permissions.ts`

```ts
'social_location','start_month','social_base','fund_base','fund_ratio','social_urge','special_remark',
```

**模块字段配置**：`backend/src/database/seeds/seed-module-configs.ts`

`social_insurance` 子模块字段当前只包含：

```ts
social_insurance: [
  'customer_name', 'customer_code', 'employee_name', 'id_card_no',
  'social_location', 'start_month', 'social_base', 'fund_base', 'fund_ratio',
],
```

未包含 `social_urge`。

**DTO/实体**：
- `WorkOrder.extraData` 是 JSONB，未在 DTO 中单独定义 `social_urge` 字段。
- `CreateWorkOrderDto/UpdateWorkOrderDto/SubmitWorkOrderDto` 只接收 `extraData`，未找到单独属性。

### 8.2 现状评价

字段已作为入职字段配置存在，并且是必填；导入 AI 映射和校验也会识别/要求它；字段权限 seed 中也引用它。

### 8.3 GAP 点/删除位置清单

若按需求删除该字段，至少需处理：

1. `backend/src/database/seeds/seed-fields.ts`：删除或停用 `social_urge` 字段 seed，且不能继续 `required/defaultRequired=true`。
2. `backend/src/modules/ai/ai-mapping.service.ts`：删除 `FIELD_ALIASES.social_urge`。
3. `backend/src/modules/imports/field-validation.service.ts`：删除 `HEADER_ALIASES.social_urge`。
4. `backend/src/database/seeds/seed-field-permissions.ts`：删除所有 `social_urge` 权限引用。
5. 存量数据库 `field_configs` / `field_permissions`：需迁移停用或删除 `field_code='social_urge'`。
6. 若前端表单/模板读取字段配置自动渲染，后端停用后前端应不再显示；若前端有硬编码，也需前端同步清理。

---

## 总体结论

1. 后端核心工单/子工单状态机已实现：提交、派发、接单、完成、退回、重提、转交均有代码路径。
2. 撤回、作废、催办接口当前未找到；`withdrawn` 只是枚举/统计中存在，缺业务落地。
3. RBAC 和字段读权限已实现，但操作权限分散，写字段权限未配置化闭环。
4. 仪表盘已有个人/团队/管理统计，但缺按工单类型的月度总数、处理中、已完成、完成率和入职/在职/离职趋势。
5. 通知有站内消息 + SSE，未强类型枚举；撤回/作废/催办消息缺口明显。未读 count 与普通 unread 列表条件一致，但分类过滤可能造成 BUG-3 表象。
6. 批导入已有 AI/本地映射、逐行校验、成功/失败行统计和错误报告；前端需正确展示异步 job 详情。
7. 后道批量完成已有，批量接单/批量转交/批量退回未找到。
8. 字段配置体系存在，`social_urge` 当前是入职必填字段，删除需要同时处理 seed、AI 映射、导入映射、字段权限和存量数据。
