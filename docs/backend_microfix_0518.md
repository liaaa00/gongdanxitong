# 后端微改动与 BUG 根因定位细化表（0518）

> 任务 ID：06078ffa-a7f0-4bee-b06b-a8e377f30829  
> 范围：基于 `docs/backend_audit_0518.md` 与当前 `backend/src` 代码做只读调研。  
> 结论属性：本文件只输出技术细化、根因定位与后续补丁点；未修改业务代码。  
> 路由说明：后端全局前缀为 `/api`，下表路由默认按 `/api/...` 理解。  
> 标记说明：凡涉及新增/调整 API 契约、前端参数语义、角色权限矩阵统一口径的项，均标注「等待架构师规划」。

---

## 1. 微改动与 BUG 根因总表

| 改动编号 | 需求来源 | 当前代码位置（文件+行号） | 现状说明 | 需改点 | 是否需数据迁移 | 是否需与前端同步 | 风险点 |
|---|---|---|---|---|---|---|---|
| B-01 | 角色枚举补齐 | `backend/src/entities/role.entity.ts:12-34`；`backend/src/database/seeds/seed-roles.ts:12-19`；`backend/src/common/auth/role-permissions.ts:18-31` | 后端没有 TS `UserRoleEnum`，角色由 `roles` 表 + seed 维护。已有 `contract_specialist`（合同专员）、`onboarding_specialist`（入离职联系专员）、`shared_leader`（共享团队负责人）。`data_entry_leader` 名称为“数据录入组长”但 level 是 execution；无 active 的 `social_insurance_specialist`/社保公积金专员，旧 `social_security_team/supervisor` 已废弃。 | 建议新增/修正：`data_entry_specialist`（数据录入岗）或将 `data_entry_leader` 更名/新增 alias；新增 `social_insurance_specialist`（社保公积金专员）。同步补 `role-permissions.ts`：`DATA_ENTRY_MODULE_ROLES` 和新增 `SOCIAL_INSURANCE_MODULE_ROLES`；若保留 `data_entry_leader` 兼容，需明确是否是主管还是执行岗。等待架构师规划角色 code 口径。 | 需要。新增 roles seed/upsert；旧用户 `social01` 当前挂 `data_entry_leader`，需迁移到社保角色；字段权限、模块处理人关系可能需同步补行。 | 需要。前端角色筛选、权限矩阵、登录态角色中文名需要同步。 | 角色 code 改名会影响已有 JWT roles、字段权限、模块处理人、历史操作日志；建议只新增新 code，旧 code 保留兼容一段时间。 |
| B-02 | 入职工单删除“社保公积金未办是否需要催办”字段 | `backend/src/database/seeds/seed-fields.ts:47`、`107`；`backend/src/modules/ai/ai-mapping.service.ts:67`；`backend/src/modules/imports/field-validation.service.ts:81`；`backend/src/modules/imports/excel-parser.service.ts:17-26`；`backend/src/database/seeds/seed-field-permissions.ts:100-106`、`257-263`；`backend/src/entities/work-order.entity.ts:91-92` | 字段 code 为 `social_urge`，在字段 seed 中为入职必填且默认必填；AI 映射、导入表头别名、Excel 已知字段、字段权限均引用。实体没有独立列，存储在 `work_orders.extra_data` JSONB。模块字段配置 `backend/src/database/seeds/seed-module-configs.ts:56-59` 的社保办理导出字段未包含它，但权限仍包含。 | 删除/停用 `social_urge`：从 seed-fields 的 collectionGroup 和 field seed 删除或置 inactive；删除 AI/导入别名和 Excel 已知字段；从字段权限 visible/editable 移除；确认前端是否动态读字段配置。等待架构师规划是否物理删除还是软停用。 | 需要。建议 migration：`UPDATE field_configs SET is_active=false,is_required=false,default_required=false WHERE field_code='social_urge'`；删除/隐藏 `field_permissions.field_code='social_urge'`；可选清理 `work_orders.extra_data - 'social_urge'`。 | 需要。导入模板、表单展示、错误提示、字段权限页面需同步。 | 如果只删 seed 不做数据迁移，存量 DB 仍会显示/校验；如果清理 extraData，历史导入追溯可能丢字段。 |
| B-03 | BUG-1：批导入必填未填仍提示成功 | 新实现：`backend/src/modules/imports/imports.controller.ts:60-76`、`backend/src/modules/imports/import-job.service.ts:103-127`、`191-239`、`256-283`、`357-384`、`backend/src/modules/imports/field-validation.service.ts:116-158`、`285-297`；旧实现：`backend/src/modules/work-orders/work-order.service.ts:562-574` | 当前实际暴露的确认接口创建异步 job 后立即返回 `status=processing`；逐行处理时必填缺失会进入 `failRows` 并最终 `failed/partially_failed`。若前端只看 confirm 初始返回或把 `partially_failed` 当成功，就会表现为“必填未填仍可导入成功”。另有旧 `confirmImport` 直接保存 `ImportJobStatus.COMPLETED` 且不校验，当前未在 controller 暴露，但应清理避免误用。 | 修复思路：前端必须轮询 `GET /api/work-orders/import/:jobId` 并以 `failRows/validationErrors/status` 判定；后端可在 confirm 返回结构中补 `processing` 语义提示，或提供同步 preview 校验摘要。后端应清理/废弃旧 `WorkOrderService.confirmImport`，避免后续误接路由。无需此任务中改代码。 | 不需要业务数据迁移；可选清理历史误生成的 import job 状态。 | 需要。确认前端成功判定规则：`completed && failRows===0` 才算全成功；`partially_failed` 必须展示失败行。 | 异步 job 若 worker 失败只更新 failed，前端未轮询会误报；旧方法保留增加维护风险。 |
| B-04 | BUG-3：未读计数与列表查询范围不一致 | `backend/src/modules/notifications/notification.controller.ts:11-23`；`backend/src/modules/notifications/dto/query-notifications.dto.ts:5-31`；`backend/src/modules/notifications/notification.service.ts:292-324`、`358-366`、`445-463` | 列表接口按 `userId + bizType + isRead/unread` 过滤；`unread-count` 只按 `userId + isRead=false` 统计全量未读；DTO 有 `priority` 但 list 的 where 未使用 priority。若前端在某分类/优先级下查看列表，却用全量 count，就会出现“未读数有值但当前列表为空”。 | 统一途径：抽 `buildNotificationWhere(userId, query)` 或新增 count 支持与 list 相同的 `bizType/isRead/priority` 过滤；优先使用 `unread-by-type` 作为分类角标。priority 是否作为正式过滤条件等待架构师规划。 | 不需要。 | 需要。前端需明确全局角标 vs 当前筛选角标，调用对应接口。 | 改 count 语义可能影响导航栏总未读；建议新增兼容参数而不是直接改变默认。 |
| B-05 | BUG-2：子工单显示未派发/共享团队视角 | `backend/src/modules/work-orders/work-order.service.ts:291-317`、`346-357`、`370-373`；`backend/src/modules/work-orders/work-order.mapper.ts:29-59`；`backend/src/modules/dispatch-engine/dispatch-engine.service.ts:203-224`、`242-249`；`backend/src/modules/dispatch-engine/handler-picker.service.ts:185-195`；`backend/src/database/seeds/seed-module-handlers.ts:44-48`；`backend/src/modules/dispatched-orders/dispatched-order.service.ts:572-598`、`792-833` | 后端允许 `handlerId=null` 的子工单进入模块池/待认领；seed 中处理人账号不存在时明确“不阻断 seed，子单将进入 handler_id=null”。主/子工单返回只给 `status=pending`、`handlerId/handlerName=null`，无 `statusText`。共享团队负责人/模块主管通过 `module_handlers`/`module_supervisors` 可看模块全部，非单纯返回字段问题。 | 若“未派发”不应出现，应先确保模块处理人 seed/配置完整，或提交时对必派发模块 `handlerId=null` 失败。若 UI 要显示“待接单/公共池”，需前后端约定 `handlerId=null && status=pending` 的文案。共享团队默认视角需前端按角色/当前 tab 控制，后端可补返回当前 scope 元信息。等待架构师规划视角契约。 | 可能需要：补齐 `module_handlers` 处理人记录、用户角色和主管配置；不一定需要迁移历史子单，历史 `handler_id=null` 可按模块池保留。 | 需要。前端文案和默认视角规则需同步。 | 若强制 handler 非空，会破坏公共池/认领模式；若只改前端文案，实际无人处理的单仍可能滞留。 |
| B-06 | BUG-5：部门工单接口按模块过滤不生效 | `backend/src/modules/work-orders/dto/list-query.dto.ts:6-45`；`backend/src/modules/work-orders/work-order.controller.ts:24-28`；`backend/src/modules/work-orders/work-order.service.ts:378-435`；对比子单接口 `backend/src/modules/dispatched-orders/dto/list-query.dto.ts:6-50`、`backend/src/modules/dispatched-orders/dispatched-order.service.ts:601-610` | 主工单列表 DTO 没有 `moduleCode/module_code/nodeType` 参数，service 只按部门、orderType、status、客户、创建人等过滤；没有 join `dispatched_orders`，所以“部门工单 + 模块过滤”天然不生效。模块过滤只在子工单列表 `GET /api/dispatched-orders` 生效。 | 若需求是部门主工单按模块过滤：在 `ListWorkOrderQueryDto` 加 `moduleCode/module_code/nodeType`，service join/exist 子单过滤；若需求是后道部门视角，应改前端调用子单接口。涉及接口契约，等待架构师规划。 | 不需要。 | 需要。需要明确页面到底使用主工单接口还是子工单接口，以及参数名。 | 主工单 join 子单可能导致分页去重/性能问题；建议用 `EXISTS` 子查询并加索引。 |
| B-07 | 状态机枚举补齐 | `backend/src/entities/enums.ts:38-52`；DB 初始枚举 `backend/src/database/migrations/1715400000000-InitSchema.ts:24-29` | 主工单状态：`draft/pending/processing/completed/returned/withdrawn`；子工单状态：`pending/processing/completed/returned`。覆盖“发起/办理中/已退回/已撤回/已办结”，但缺独立“已作废”。“发起”与 `draft/pending` 的中文语义未统一。 | 建议新增 `WorkOrderStatus.VOIDED = 'voided'` 或明确 `withdrawn` 同时表示撤回/作废。若作废是独立动作，需要新增状态和迁移，并补 controller/service 状态转移。等待架构师规划状态中文口径。 | 需要。PostgreSQL enum 需 `ALTER TYPE work_order_status_enum ADD VALUE IF NOT EXISTS 'voided'`；若子单也作废则补 dispatched enum。 | 需要。前端状态字典、筛选项、颜色、列表统计同步。 | PG enum 新值迁移不可随意回滚；状态语义不清会影响统计和通知。 |
| B-08 | 消息类型枚举检查 | `backend/src/entities/notification.entity.ts:11-24`；`backend/src/modules/notifications/notification.service.ts:100-205`；`backend/src/database/seeds/seed-notification-templates.ts:45-246`；字段变更 hook `backend/src/modules/notifications/field-change.hook.ts:13-65` | 无 `NotificationType enum`，`bizType` 是 varchar。已有字段变更类 `order.field_changed/order.completed_modified/order.supplement_filled`（hook 动态创建）、退回 `dispatched_returned/dispatched_returned_to_salesperson`、超时 `sla_breach`。未找到催办、作废、撤回消息类型。 | 建议新增强类型常量/枚举或集中 `NotificationBizType`，补 `urge/remind`、`voided`、`withdrawn` 模板和发送路径；具体 bizType 命名等待架构师规划。 | 需要。若使用 notification_templates 表，需要 seed/upsert 新 biz_type。 | 需要。前端消息分类、图标、跳转链接需同步。 | bizType 已被历史数据使用，重命名会影响未读分类和列表筛选；应新增兼容映射。 |
| B-09 | 权限装饰器入口清点：主工单 | `backend/src/modules/work-orders/work-order.controller.ts:24-34`、`37-42`、`61-75`、`78-95`；全局 guard `backend/src/app.module.ts:129-139`、`backend/src/common/guards/roles.guard.ts:15-33` | 主工单创建有 `@Roles(...WORK_ORDER_CREATOR_ROLES)`，删除/批量删除仅 `admin`。列表、详情、更新、提交、重提没有 `@Roles`，依赖 service 内部 owner/部门逻辑。 | 后续角色权限矩阵落地时，需决定列表/详情/更新/提交/重提是否加装饰器，还是保持 service 动态校验。建议先不盲目加 `@Roles`，避免业务负责人只读与部门范围冲突。等待架构师规划。 | 不需要。 | 可能需要。前端按钮显隐需和后端矩阵一致。 | 静态 `@Roles` 只能判断角色，不能判断“本人/本部门/主管模块”等动态条件。 |
| B-10 | 权限装饰器入口清点：子工单 | `backend/src/modules/dispatched-orders/dispatched-order.controller.ts:27-55`、`65-95`、`98-175`、`179-188`；service 权限 `backend/src/modules/dispatched-orders/dispatched-order.service.ts:782-833` | 子工单大部分接口未加 `@Roles`，依赖 `assertModulePoolAccess/assertCanViewTeam/assertCanHandle` 等动态判断；删除/批删仅 `admin`。`findTeam` 通过 `ensureAdminScope` 临时放大角色进入 findAll。 | 后续矩阵要在 service 动态权限上收口，不建议只靠装饰器；需补批量接单/转交/退回时复用同一权限方法。`ensureAdminScope` 的语义需要审查，避免绕过过滤。等待架构师规划。 | 不需要。 | 需要。前端批量按钮与后端动作权限同步。 | 如果只加 @Roles，可能阻断合法模块主管；如果只靠 service，接口文档无法直观看出角色。 |
| B-11 | 权限装饰器入口清点：看板/导入/通知/管理后台 | 看板 `backend/src/modules/dashboard/dashboard.controller.ts:7-49`；导入 `backend/src/modules/imports/imports.controller.ts:30-76`；通知 `backend/src/modules/notifications/notification.controller.ts:11-23`；角色常量 `backend/src/common/auth/role-permissions.ts:4-31` | 看板仍大量使用旧角色：`salesperson/manager/contract_team/...`，未覆盖新版 `biz_member/biz_leader/biz_manager/contract_specialist/onboarding_specialist/shared_leader`。导入使用 `WORK_ORDER_CREATOR_ROLES`，通知无 `@Roles` 仅按本人 userId。 | 看板 `@Roles` 需补新版角色或改为权限常量；导入角色常量需随数据录入/社保角色补齐做审查；通知保持本人隔离即可。等待架构师规划。 | 不需要。 | 需要。看板入口显隐和接口访问要一致。 | 看板角色遗漏会造成新角色 403；盲目放开会导致跨部门数据泄露，需配合 service scope。 |

---

## 2. BUG 根因重点说明

### BUG-1：批导入必填字段未填仍可导入成功

**代码证据**

1. 实际暴露接口：`POST /api/work-orders/import/confirm` 在 `backend/src/modules/imports/imports.controller.ts:60-76`，只创建 job 并返回，不同步完成导入。
2. `createJob` 初始保存 `status: ImportJobStatus.PROCESSING`：`backend/src/modules/imports/import-job.service.ts:103-127`。
3. 逐行处理时会调用 `validateRow`：`backend/src/modules/imports/import-job.service.ts:209-221`；校验失败则 `failRows + 1` 并 `continue`：`231-233`。
4. 必填判断本身存在：`backend/src/modules/imports/field-validation.service.ts:128-144`；`isRequired` 覆盖 `isRequired/defaultRequired/conditionalRequired`：`285-289`；空字符串判空：`292-296`。
5. job 最终状态：无成功行为 `failed`，部分失败为 `partial`，全成功为 `completed`：`backend/src/modules/imports/import-job.service.ts:256-260`；序列化时 `PARTIAL` 会转为 `partially_failed`：`380-384`。
6. 遗留旧方法 `WorkOrderService.confirmImport` 直接保存 `ImportJobStatus.COMPLETED` 且不做行校验：`backend/src/modules/work-orders/work-order.service.ts:562-574`，当前未见 controller 暴露，但应清理防误用。

**根因判断**：后端新路径不是“校验没做”，而是异步任务语义/前端成功判定问题；另旧路径保留造成代码层面风险。

**修复思路**：不在本任务改代码。后续建议：前端以轮询 job 结果为准；后端可把 confirm 返回明确标记为 `processing` 并提供 `validationErrors` 的最终查询；删除或废弃旧 `confirmImport`。

### BUG-2：子工单显示未派发、左上角显示共享团队视角

**代码证据**

1. 子工单保存时允许 `handlerId: child.handlerId` 为 null：`backend/src/modules/work-orders/work-order.service.ts:300-315`。
2. 无 handler 时不会创建派发通知：`backend/src/modules/work-orders/work-order.service.ts:346-357`。
3. 返回给前端的是 `status=pending` + `handlerId/handlerName`，没有后端中文文案：`backend/src/modules/work-orders/work-order.mapper.ts:29-59`。
4. handler picker 如果找不到主/备处理人返回 null：`backend/src/modules/dispatch-engine/handler-picker.service.ts:185-195`；seed 也说明用户不存在时不阻断，进入 `handler_id=null` 模块池：`backend/src/database/seeds/seed-module-handlers.ts:44-48`。
5. 共享/主管视角：`applyUserScope` 对模块主管允许看 `d.module_code IN (:...modules)` 全部模块单：`backend/src/modules/dispatched-orders/dispatched-order.service.ts:581-595`；`canViewAsSupervisor/getAccessibleModules` 通过角色、module handler、module supervisor 判断：`792-833`。

**根因判断**：这是后端设计允许公共池/待认领导致的 `handlerId=null`，不是简单返回字段丢失；“共享团队视角”来自模块主管权限范围和前端默认视角选择。

**修复思路**：若产品不接受“未派发”，需要补齐模块处理人配置或提交时阻断 handler 为空；若保留公共池，则前端应显示“待认领/公共池”。视角契约等待架构师规划。

### BUG-3：消息未读计数与消息列表不一致

**代码证据**

1. 列表接口：`GET /api/notifications` 调 `list(user.sub, query)`：`backend/src/modules/notifications/notification.controller.ts:11-13`。
2. 未读计数接口：`GET /api/notifications/unread-count` 只调 `countUnread(user.sub)`：`backend/src/modules/notifications/notification.controller.ts:16-18`。
3. DTO 支持 `isRead/unread/bizType/biz_type/priority/groupBy`：`backend/src/modules/notifications/dto/query-notifications.dto.ts:5-31`。
4. list 实际过滤 `userId + bizType + isRead`：`backend/src/modules/notifications/notification.service.ts:292-307`；未使用 `priority`。
5. countUnread 固定过滤 `userId + isRead=false`：`backend/src/modules/notifications/notification.service.ts:358-359`。

**根因判断**：列表是当前筛选范围，未读计数是全量范围；当列表带 `bizType` 或未来 priority 筛选时，范围不一致。

**修复思路**：抽公共查询条件或给 `unread-count` 增加同名查询参数；保留默认全量 count 兼容导航栏。前端需区分全局未读与当前分类未读。

### BUG-5：部门工单按模块过滤不生效

**代码证据**

1. 主工单列表 DTO 没有 `moduleCode/module_code/nodeType`：`backend/src/modules/work-orders/dto/list-query.dto.ts:6-45`。
2. 主工单列表 service 只按部门、orderType、status、客户、时间、创建人等过滤：`backend/src/modules/work-orders/work-order.service.ts:383-431`。
3. 主工单列表没有 join/exist 子工单表：`backend/src/modules/work-orders/work-order.service.ts:381-435`。
4. 模块过滤只在子工单 DTO/service 存在：`backend/src/modules/dispatched-orders/dto/list-query.dto.ts:6-17`，`backend/src/modules/dispatched-orders/dispatched-order.service.ts:601-603`。

**根因判断**：如果页面调用的是主工单列表，按模块过滤必然无效；不是权限过滤推送问题，而是查询参数/查询模型缺失。

**修复思路**：要么前端改用子工单接口做模块视角；要么后端主工单列表新增 module 参数并用 `EXISTS (SELECT 1 FROM dispatched_orders...)` 过滤。接口契约等待架构师规划。

---

## 3. 补齐项清单

### 3.1 角色补齐建议

| 需求角色 | 当前覆盖 | 建议 code | 补齐位置 |
|---|---|---|---|
| 合同专员 | 已有 `contract_specialist` | 保持 | `seed-roles.ts:17`；`role-permissions.ts:29` |
| 入离职联系专员 | 已有 `onboarding_specialist` | 保持 | `seed-roles.ts:18`；`role-permissions.ts:30` |
| 数据录入岗 | 现为 `data_entry_leader`，名称“数据录入组长” | `data_entry_specialist` 或更名为执行岗 alias | `seed-roles.ts:19`；`role-permissions.ts:31`；字段权限 `seed-field-permissions.ts:68-72` |
| 社保公积金专员 | 缺 active 角色；旧 `social_security_*` 已停用 | `social_insurance_specialist` | `seed-roles.ts:12-20` 新增；`role-permissions.ts` 新增社保模块角色常量；`seed-field-permissions.ts:81-87` |
| 共享团队负责人 | 已有 `shared_leader` | 保持 | `seed-roles.ts:16`；`role-permissions.ts:18-27` |

### 3.2 状态枚举补齐建议

| 需求中文状态 | 当前主工单枚举 | 当前子工单枚举 | 是否缺口 | 备注 |
|---|---|---|---|---|
| 发起 | `draft`/`pending` | `pending` | 语义需统一 | “发起”是草稿、已提交待派发还是待办中间态，等待架构师规划。 |
| 办理中 | `processing` | `processing` | 否 | 已有。 |
| 已退回 | `returned` | `returned` | 否 | 已有。 |
| 已撤回 | `withdrawn` | 无 | 主单已有，接口缺 | 当前未见业务接口将主单置 withdrawn。 |
| 已作废 | 无 | 无 | 是 | 建议新增 `voided` 或明确复用 `withdrawn`。 |
| 已办结 | `completed` | `completed` | 否 | 已有。 |

### 3.3 消息类型补齐建议

| 需求消息 | 当前覆盖 | 需补齐项 |
|---|---|---|
| 字段被后道修改 | `order.field_changed`、`order.completed_modified`、`order.supplement_filled`，见 `field-change.hook.ts:13-65` | 建议纳入集中枚举/模板 seed，当前 fallback seed 不完整。 |
| 退回 | `dispatched_returned`、`dispatched_returned_to_salesperson`，见 `notification.service.ts:137-148`、`seed-notification-templates.ts:66-84` | 可保持。 |
| 催办 | 未找到 | 新增 `order.urge`/`dispatched_urge` 等，等待架构师规划。 |
| 超时 | `sla_breach`，见 `notification.service.ts:185-190`、`seed-notification-templates.ts:124-143` | 可保持。 |
| 作废 | 未找到 | 随作废状态/接口新增。 |
| 撤回 | 未找到现行业务模板 | 随撤回接口新增。 |

---

## 4. 权限装饰器补丁点清单

| Controller | 接口范围 | 当前装饰器/权限点 | 冲突点 | 建议 |
|---|---|---|---|---|
| `WorkOrderController` | `GET /work-orders`、`GET /work-orders/:id`、`PUT /work-orders/:id`、`POST /:id/submit`、`POST /:id/resubmit` | 多数无 `@Roles`，有 `@FieldPermissionScenario('main')`；创建/删除有 `@Roles` | 静态角色无法表达本人/本部门/只读负责人 | 继续以 service 动态权限为主，矩阵规划后再补最小 `@Roles`。 |
| `DispatchedOrderController` | 列表、详情、接单、认领、完成、退回、转交、批量完成 | 大多无 `@Roles`，依赖 service 动态模块权限；删除仅 admin | 模块主管/处理人/公共池权限是动态的 | 抽 action 权限服务，批量接口复用单条权限。 |
| `DashboardController` | `salesperson/team/processor/manager/admin` | 仍有旧角色 `salesperson/manager/contract_team/...` | 新版角色访问可能 403 | 改用 `role-permissions.ts` 常量并补新版角色。 |
| `ImportsController` | import preview/confirm | `@Roles(...WORK_ORDER_CREATOR_ROLES)` | 若新增数据录入/社保专员导入能力，需要补常量 | 等角色矩阵确认后调整。 |
| `NotificationController` | list/count/read/remove | 无 `@Roles`，按 `user.sub` 隔离 | 一般合理，但管理员代查场景无接口 | 保持本人范围；如需后台消息审计另开 admin 接口。 |
| Admin controllers | `/admin/*` | 多数 class 级或 method 级 `@Roles('admin')` | 与“共享负责人可配置部分模块”需求可能冲突 | 非本次微改动；等待架构师规划后台分权。 |

---

## 5. 后续建议顺序（不在本任务执行）

1. 先由架构师确认角色 code、状态中文口径、作废/撤回/催办接口契约。
2. 后端可优先做不破坏契约的清理：废弃旧 `WorkOrderService.confirmImport`、抽通知查询条件、补导入 job 状态文档。
3. 需要迁移的项分批：角色 seed/用户角色迁移、`social_urge` 软停用、消息模板新增、状态 enum 新增。
4. 前端同步：导入成功判定、消息计数范围、子单 handler 为空文案、部门模块过滤调用接口。
