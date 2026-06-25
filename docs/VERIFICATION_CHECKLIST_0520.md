# 0520 补强动作验收检查表

> 角色：测试工程师  
> 日期：2026-05-20  
> 输入依据：`docs/REAL_GAP_ANALYSIS_0520.md`、`docs/test_cases_0518.md`、`docs/TEST_PLAN_0518_INCREMENTAL.md`  
> 范围：仅验收 G-1~G-20 补强动作是否真实落地，不重复 0518 全量黑盒用例内容。

## 0. 验收纪律与环境约定

### 0.1 执行顺序

1. **先跑环境检查脚本**：若存在明显代码残留或必备路由缺失，直接判定对应 G 项 FAIL，不进入 UI 验收。
2. **按优先级验收**：P0（G-1~G-7）→ P1（G-8~G-17）→ P2（G-18~G-20）。
3. **任何一项 FAIL**：记录失败命令、响应、截图或日志，并立即上报 Leader 安排返工；不允许口头跳过。
4. **P0 全部 PASS 后**，才允许进入 P1/P2 的人工 UI 验收。

### 0.2 命令前置变量

后端已设置全局前缀 `/api`，以下 curl 默认使用：

```powershell
$env:BASE_URL = "http://localhost:3000/api"
$env:FRONTEND_URL = "http://localhost:5173"
$env:TOKEN_SALES = "<业务员JWT>"
$env:TOKEN_BACKOFFICE = "<后道JWT>"
$env:TOKEN_SHARED_LEADER = "<共享负责人JWT>"
$env:TOKEN_ADMIN = "<管理员JWT>"
$env:WORK_ORDER_ID = "<未终态主工单ID>"
$env:DISPATCHED_ID_1 = "<可办理子工单ID-1>"
$env:DISPATCHED_ID_2 = "<可办理子工单ID-2>"
```

### 0.3 通用 PASS/FAIL 记录格式

| 项目 | 结果 | 证据 | 备注 |
|---|---|---|---|
| G-N | PASS / FAIL | curl 响应、rg 输出、截图路径、接口日志 | 失败必须写明阻断点 |

---

## 1. 环境检查脚本（补强落地前置闸门）

> 说明：以下命令不修改代码；在仓库根目录执行。`rg` 无输出通常代表检查通过；若命令输出命中行，需按下方判据确认是否 FAIL。

### 1.1 CLI 检查命令

```powershell
# 1) 检查运行态代码中是否仍有 social_urge 字符串引用
rg -n "social_urge" backend/src frontend/src
# PASS: 无输出。若仅出现在“删除该字段”的一次性迁移文件，需人工确认迁移已执行且运行态 seed/校验/AI 别名无引用。

# 2) 检查是否还有 hasRole('biz_member') / 旧角色或页面硬编码角色调用
rg -n "hasRole\('(biz_member|biz_leader|shared_leader|business_group_member|business_owner|shared_service_leader|salesperson)'\)" frontend/src
# PASS: 无输出；角色判断应统一经 ROLE 常量 + canonicalRoleCode 归一化。

# 3) 检查 MyDispatched / 权限工具是否接入 canonicalRoleCode
rg -n "canonicalRoleCode|ROLE\." frontend/src/stores/userStore.ts frontend/src/utils/permission.ts frontend/src/pages/WorkOrders frontend/src/pages/MyDispatched
# PASS: userStore.hasRole 与 utils/permission 均能看到 canonicalRoleCode；页面不再散落旧 role code 字符串。

# 4) 检查 batch-complete.dto 是否含 ArrayMaxSize(50)
rg -n "ArrayMaxSize\(50\)|@ArrayMaxSize" backend/src/modules/dispatched-orders/dto/batch-complete.dto.ts
# PASS: batch-complete DTO 的 ids 字段存在 @ArrayMaxSize(50)。

# 5) 检查 unread-count-by-bucket 后端路由是否存在
rg -n "unread-count-by-bucket|countUnreadByBucket" backend/src/modules/notifications
# PASS: controller 存在 @Get('unread-count-by-bucket')，service 存在 countUnreadByBucket 实现。

# 6) 编译与单测基础门禁
Push-Location backend; npm run build; npm test; Pop-Location
Push-Location frontend; npm run build; npm test; Pop-Location
# PASS: 四条命令退出码均为 0。
```

### 1.2 可选 npm script 建议（不强制改 package.json）

如需固化，可在根目录 CI 中增加等价命令：

```json
{
  "verify:0520:static": "rg -n \"social_urge\" backend/src frontend/src && exit 1 || exit 0"
}
```

实际 CI 建议拆成 PowerShell 脚本逐项输出 PASS/FAIL，避免 `rg` 无匹配退出码导致误判。

---

## 2. P0 补强动作验收表

### G-1 通知 count / list / dashboard 口径统一，正常派单不进消息

| 字段 | 内容 |
|---|---|
| 预期改动文件 | `backend/src/modules/notifications/notification.service.ts`、`backend/src/modules/notifications/notification.controller.ts`、`backend/src/modules/dashboard/dashboard.service.ts`、必要时 `frontend/src/services/notifications.ts` |
| 验收命令 | `rg -n "build.*Where|exclude.*dispatch|dispatch_created|dispatched_new|countUnreadByBucket" backend/src/modules/notifications backend/src/modules/dashboard`；随后执行：<br>`curl.exe -s -H "Authorization: Bearer $env:TOKEN_BACKOFFICE" "$env:BASE_URL/dashboard/cards"`<br>`curl.exe -s -H "Authorization: Bearer $env:TOKEN_BACKOFFICE" "$env:BASE_URL/notifications/unread-count"`<br>`curl.exe -s -H "Authorization: Bearer $env:TOKEN_BACKOFFICE" "$env:BASE_URL/notifications?isRead=false&pageSize=50"` |
| 预期输出/状态变化 | `dispatch`、`dispatch_created`、`dispatched_new`、`dispatched_accepted`、`dispatched_completed` 等正常派单类消息不计入“我的消息”；dashboard 卡片、unread-count、list 分页 total/list 长度口径一致。 |
| PASS 条件 | 对只含正常派单未读消息的后道账号，dashboard `myMessages=0`，`/notifications/unread-count` 返回 0，列表为空；对含退回/催办/撤回作废/字段变更消息的账号，三处数量一致且列表可定位源数据。 |

### G-2 新增 `GET /notifications/unread-count-by-bucket`

| 字段 | 内容 |
|---|---|
| 预期改动文件 | `backend/src/modules/notifications/notification.controller.ts`、`backend/src/modules/notifications/notification.service.ts`、`frontend/src/services/notifications.ts`、通知类型常量/DTO 文件（如有） |
| 验收命令 | `rg -n "unread-count-by-bucket|countUnreadByBucket|field_changed|returned|withdraw|void|urge|sla|system" backend/src/modules/notifications frontend/src/services/notifications.ts`<br>`curl.exe -s -H "Authorization: Bearer $env:TOKEN_SALES" "$env:BASE_URL/notifications/unread-count-by-bucket"`<br>`curl.exe -s -H "Authorization: Bearer $env:TOKEN_BACKOFFICE" "$env:BASE_URL/notifications/unread-count-by-bucket"` |
| 预期输出/状态变化 | 接口 HTTP 200；返回对象包含可稳定消费的桶，如 `field_changed`、`returned`、`withdraw`、`void`、`urge`、`sla`、`system`，无权限桶为 0 而不是 404。 |
| PASS 条件 | 前端不再走 404 fallback；业务员和后道分别触发对应消息后，bucket 数量与 `/notifications?bizType=...&isRead=false` 过滤结果一致。 |

### G-3 角色判断归一化

| 字段 | 内容 |
|---|---|
| 预期改动文件 | `frontend/src/stores/userStore.ts`、`frontend/src/utils/permission.ts`、`frontend/src/constants/roles.ts`、`frontend/src/pages/WorkOrders/index.tsx`、`frontend/src/layouts/BasicLayout.tsx`、相关权限页面 |
| 验收命令 | `rg -n "canonicalRoleCode" frontend/src/stores/userStore.ts frontend/src/utils/permission.ts`<br>`rg -n "hasRole\('(biz_member|biz_leader|shared_leader|business_group_member|business_owner|shared_service_leader|salesperson)'\)" frontend/src`<br>UI：用旧角色 code 账号（如 `biz_member`）登录，进入仪表盘和主工单列表。 |
| 预期输出/状态变化 | `hasRole` 内部对用户角色与目标角色均做 canonical 化；页面使用 `ROLE.*` 常量；旧 `biz_member` 账号不落到“共享团队视角”。 |
| PASS 条件 | 第二条 `rg` 无页面硬编码命中；旧角色 code 业务员登录后展示“业务员视角/本人范围”，不显示错误的“共享团队视角”；菜单、路由、按钮权限与 canonical 角色一致。 |

### G-4 MyDispatched 增加批量办理按钮

| 字段 | 内容 |
|---|---|
| 预期改动文件 | `frontend/src/pages/MyDispatched/index.tsx`、`frontend/src/services/dispatchedOrders.ts`、必要时批量办理弹窗/组件文件 |
| 验收命令 | `rg -n "batchComplete|批量办理|remark|selectedRowKeys" frontend/src/pages/MyDispatched frontend/src/services/dispatchedOrders.ts`<br>API：`curl.exe -s -X POST -H "Authorization: Bearer $env:TOKEN_BACKOFFICE" -H "Content-Type: application/json" -d '{"ids":["'$env:DISPATCHED_ID_1'","'$env:DISPATCHED_ID_2'"],"remark":"QA批量办理验收"}' "$env:BASE_URL/dispatched-orders/batch-complete"`<br>UI：后道登录 → 我的工单 → 我的待办 → 勾选 2 条待办 → 点击批量办理。 |
| 预期输出/状态变化 | MyDispatched 勾选后同时显示“批量导出”和“批量办理”；备注必填；只提交 pending/processing 且当前用户可处理的子工单。 |
| PASS 条件 | 未填备注无法提交；提交后接口 200，返回 completed/skipped 明细；已完成项从待办列表消失或状态变为 completed，跳过项有明确原因。 |

### G-5 我的工单 pending/done 路由分模式

| 字段 | 内容 |
|---|---|
| 预期改动文件 | `frontend/src/routes/index.tsx`、`frontend/src/pages/MyDispatched/index.tsx`、`frontend/src/layouts/BasicLayout.tsx`、必要时 `frontend/src/services/dispatchedOrders.ts` |
| 验收命令 | `rg -n "mode=|useLocation|pending|done|我的待办|我的已办|handlerId" frontend/src/routes/index.tsx frontend/src/pages/MyDispatched/index.tsx`<br>UI：分别访问 `/my-work/pending`、`/my-work/done`，记录标题、空状态文案、接口 query。 |
| 预期输出/状态变化 | pending 只看当前人待处理/处理中；done 只看已处理/当月 completed；业务员 pending 能看到退回/待补充主工单入口，不与 done 共用同一份数据。 |
| PASS 条件 | 两个路由发出的列表请求参数不同；同一账号进入 pending 与 done 展示数据集合不同且符合状态；业务员被退回工单在“我的待办”可处理。 |

### G-6 仪表盘“处理中”口径修正

| 字段 | 内容 |
|---|---|
| 预期改动文件 | `backend/src/modules/dashboard/dashboard.service.ts`、相关 dashboard 单测/e2e 文件 |
| 验收命令 | `rg -n "NOT IN.*completed|withdrawn|void|draft|status = 'processing'" backend/src/modules/dashboard/dashboard.service.ts backend/test`<br>`curl.exe -s -H "Authorization: Bearer $env:TOKEN_SALES" "$env:BASE_URL/dashboard/cards"` |
| 预期输出/状态变化 | 处理中统计改为 `status NOT IN ('completed','withdrawn','void','draft')`；pending、processing、returned、withdraw_pending、void_pending 均计入处理中。 |
| PASS 条件 | 构造 6 种状态各 1 条后，dashboard “处理中”= pending+processing+returned+withdraw_pending+void_pending；completed/withdrawn/void/draft 不计入。 |

### G-7 停用旧 confirmImport

| 字段 | 内容 |
|---|---|
| 预期改动文件 | `backend/src/modules/work-orders/work-order.service.ts`、`backend/src/modules/work-orders/work-order.controller.ts`、`backend/src/modules/imports/*`、`frontend/src/services/workOrders.ts`、`frontend/src/pages/WorkOrders/Import/index.tsx` |
| 验收命令 | `rg -n "async confirmImport|confirmImport\(" backend/src/modules/work-orders backend/src/modules/imports frontend/src/services frontend/src/pages/WorkOrders/Import`<br>API：走当前导入 confirm 接口提交缺必填文件对应 job。 |
| 预期输出/状态变化 | `work-order.service.ts` 中旧的直接置 COMPLETED、successRows/failRows=0 的 confirmImport 不存在或无路由出口；导入统一走 import-job preview/confirm 校验链。 |
| PASS 条件 | 缺必填行返回失败明细且不会静默完成；合法行仍可成功并触发派发；没有任何 `/work-orders/...confirmImport` 旧路径可被前端或接口调用。 |

---

## 3. P1 补强动作验收表

### G-8 social_urge 字段处置

| 字段 | 内容 |
|---|---|
| 预期改动文件 | `backend/src/database/seeds/seed-fields.ts`、`backend/src/database/seeds/seed-field-permissions.ts`、`backend/src/modules/imports/field-validation.service.ts`、`backend/src/modules/ai/ai-mapping.service.ts`、迁移文件、相关测试 |
| 验收命令 | `rg -n "social_urge|社保公积金未办是否需要催办" backend/src frontend/src backend/test frontend/src`<br>UI：新建入职单 → 不填写该字段 → 提交；批导入模板缺该列 → preview/confirm。 |
| 预期输出/状态变化 | 运行态 seed、字段权限、导入校验、AI 映射、前端表单/模板均不再要求该字段；如保留字段则必须 `required=false/defaultRequired=false` 且不展示。 |
| PASS 条件 | `rg` 在运行态代码无残留必填引用；新建与批导入不含该字段仍成功；导出模板字段选择中不可见该字段；存量 extra_data 不在详情页展示。 |

### G-9 工单详情页补撤回/作废/催办按钮

| 字段 | 内容 |
|---|---|
| 预期改动文件 | `frontend/src/pages/WorkOrders/Detail/index.tsx`、`frontend/src/pages/WorkOrders/index.tsx`、`frontend/src/services/workOrders.ts`、角色权限常量 |
| 验收命令 | `rg -n "撤回|作废|催办|withdraw|void|urge|isTerminal" frontend/src/pages/WorkOrders/Detail frontend/src/services/workOrders.ts`<br>API：`curl.exe -s -X POST -H "Authorization: Bearer $env:TOKEN_SALES" -H "Content-Type: application/json" -d '{"reason":"QA详情页验收"}' "$env:BASE_URL/work-orders/$env:WORK_ORDER_ID/withdraw"`<br>UI：业务员打开未终态详情页，分别点击撤回/作废/催办。 |
| 预期输出/状态变化 | 详情页按钮与列表页权限一致；终态只显示查看/返回；非本人或无权限角色不显示业务员专属按钮。 |
| PASS 条件 | 未终态本人主工单详情可发起撤回、作废、催办；接口状态/通知正常变化；completed/withdrawn/void 工单详情无这些按钮。 |

### G-10 仪表盘总表按子工单 module 维度

| 字段 | 内容 |
|---|---|
| 预期改动文件 | `backend/src/modules/dashboard/dashboard.service.ts`、`backend/src/modules/dashboard/dashboard.controller.ts`、模块 label 映射/DTO 文件、相关测试 |
| 验收命令 | `rg -n "dimension|module_code|moduleCode|getOrderTypeMatrix|dispatched_orders" backend/src/modules/dashboard backend/test`<br>`curl.exe -s -H "Authorization: Bearer $env:TOKEN_ADMIN" "$env:BASE_URL/dashboard/order-type-matrix?dimension=node"` |
| 预期输出/状态变化 | 总表可按 `dispatched_orders.module_code` 分组；每行含 `moduleCode/moduleName/total/processing/completed/completionRate`。 |
| PASS 条件 | 返回行包含入职联系、劳动合同签订、数据录入、社保公积金办理等子工单维度；不再只有入职/续签/离职/待遇申报 4 行主工单类型。 |

### G-11 仪表盘前端总表行 key 切到 moduleCode

| 字段 | 内容 |
|---|---|
| 预期改动文件 | `frontend/src/pages/Dashboard/index.tsx`、`frontend/src/services/dashboard.ts`、相关类型定义 |
| 验收命令 | `rg -n "moduleCode|moduleName|orderTypeMatrix|dimension=node|rowKey" frontend/src/pages/Dashboard frontend/src/services/dashboard.ts`<br>UI：管理员/业务负责人进入仪表盘，查看总表行名与空表文案。 |
| 预期输出/状态变化 | 前端请求 module 维度数据，表格 rowKey 使用 moduleCode，列名展示办理事项/模块名称；无数据时显示明确 Empty。 |
| PASS 条件 | 页面总表与 G-10 API 返回一致；刷新无 React key warning；完成率显示正确；不再依赖 `orderType` 作为唯一行键。 |

### G-12 业务负责人趋势图按 module 维度

| 字段 | 内容 |
|---|---|
| 预期改动文件 | `backend/src/modules/dashboard/dashboard.controller.ts`、`backend/src/modules/dashboard/dashboard.service.ts`、`frontend/src/pages/Dashboard/index.tsx`、`frontend/src/services/dashboard.ts` |
| 验收命令 | `rg -n "leader-trend|moduleCode|Radio|orderType" backend/src/modules/dashboard frontend/src/pages/Dashboard frontend/src/services/dashboard.ts`<br>`curl.exe -s -H "Authorization: Bearer $env:TOKEN_ADMIN" "$env:BASE_URL/dashboard/leader-trend?orderType=onboarding&moduleCode=onboarding_contact"` |
| 预期输出/状态变化 | leader-trend 支持 `moduleCode`；前端可按入职/在职/离职及办理事项切换，趋势数据随选择变化。 |
| PASS 条件 | 同一 orderType 下切换不同 moduleCode 返回不同趋势序列；业务负责人可见，普通业务员不可见；图表数值与后台聚合一致。 |

### G-13 团队工单模块筛选改下拉 + 中文名兼容

| 字段 | 内容 |
|---|---|
| 预期改动文件 | `frontend/src/pages/TeamDispatched/index.tsx`、`frontend/src/constants/modules.ts` 或模块常量、`backend/src/modules/dispatched-orders/dispatched-order.service.ts`、`backend/src/modules/dispatched-orders/dto/list-query.dto.ts` |
| 验收命令 | `rg -n "valueType:\s*'select'|moduleName|nodeType|moduleCode|MODULE" frontend/src/pages/TeamDispatched backend/src/modules/dispatched-orders`<br>`curl.exe -s -H "Authorization: Bearer $env:TOKEN_SHARED_LEADER" "$env:BASE_URL/dispatched-orders/team/onboarding_contact?moduleName=入职联系"` |
| 预期输出/状态变化 | 团队工单模块筛选为下拉；后端同时兼容 moduleCode、moduleName、nodeType，并统一映射为 module_code。 |
| PASS 条件 | 共享负责人选择中文“入职联系”有结果，选择其他模块只显示该模块，清空恢复；无权模块不泄露。 |

### G-14 入职表单分组栅格布局

| 字段 | 内容 |
|---|---|
| 预期改动文件 | `frontend/src/components/DynamicForm/index.tsx`、`frontend/src/components/DynamicForm/*.less|*.css`、`frontend/src/pages/WorkOrders/New*` 或新建入职页面 |
| 验收命令 | `rg -n "collection_group|Card|grid|grouped|span|colSpan|DynamicForm" frontend/src/components/DynamicForm frontend/src/pages/WorkOrders`<br>UI：业务员/管理员打开新建入职表单，切换 PC 宽屏与窄屏。 |
| 预期输出/状态变化 | 表单按基础信息/合同/社保/银行/备注等 collection_group 渲染 Card；PC 端 3 列栅格，长字段跨列；移动端单列。 |
| PASS 条件 | 视觉分组清晰；必填标识不丢；提交数据结构与改造前一致；不同屏宽无遮挡、无横向溢出。 |

### G-15 批量办理 DTO 上限

| 字段 | 内容 |
|---|---|
| 预期改动文件 | `backend/src/modules/dispatched-orders/dto/batch-complete.dto.ts`、`backend/test/*batch*` 或 dispatched-orders spec |
| 验收命令 | `rg -n "ArrayMaxSize\(50\)|ids" backend/src/modules/dispatched-orders/dto/batch-complete.dto.ts backend/test`<br>API：用 51 个 UUID 调用 `/dispatched-orders/batch-complete`。 |
| 预期输出/状态变化 | DTO `ids` 字段有 `@ArrayMaxSize(50)`；超过 50 条被 ValidationPipe 拦截。 |
| PASS 条件 | 50 条以内合法请求进入业务处理；51 条返回 400，错误信息说明数组长度超过限制；无服务器 500。 |

### G-16 通知模板补全

| 字段 | 内容 |
|---|---|
| 预期改动文件 | `backend/src/modules/notifications/*`、`backend/src/modules/work-orders/work-order.service.ts`、`backend/src/modules/field-supplement/*`、通知模板常量/seed 文件 |
| 验收命令 | `rg -n "withdraw_request|withdraw_approved|withdraw_rejected|void_request|void_approved|void_rejected|urge_received|order.field_changed|sla_warning|sla_breached" backend/src backend/test`<br>触发撤回申请、作废申请、催办、字段编辑、SLA 警告。 |
| 预期输出/状态变化 | 每类事件生成可读通知标题/正文/bizType/targetId；bucket 分类与 G-2 一致。 |
| PASS 条件 | 业务员、后道、共享负责人收到各自应收模板；消息可点击定位；模板无空标题、undefined、错误角色收件。 |

### G-17 批导入 preview 返回 mappingMode

| 字段 | 内容 |
|---|---|
| 预期改动文件 | `backend/src/modules/imports/*`、`backend/src/modules/imports/dto/*`、`frontend/src/pages/WorkOrders/Import/index.tsx`、`frontend/src/services/workOrders.ts` |
| 验收命令 | `rg -n "mappingMode|standard|ai|manual_required|missingRequired|confidence" backend/src/modules/imports frontend/src/pages/WorkOrders/Import frontend/src/services/workOrders.ts`<br>API：分别上传标准模板、非标准表头、缺映射文件执行 preview。 |
| 预期输出/状态变化 | preview 明确返回 `mappingMode: standard | ai | manual_required`；confirm 前校验映射完整性，缺映射返回 400。 |
| PASS 条件 | 标准模板为 standard；AI 可识别为 ai 且展示映射确认；缺失关键映射为 manual_required 且不能直接 confirm。 |

---

## 4. P2 补强动作验收表

### G-18 字段管理权限粒度

| 字段 | 内容 |
|---|---|
| 预期改动文件 | `backend/src/modules/admin/fields/fields.controller.ts`、`backend/src/modules/admin/field-permissions/field-permission.controller.ts`、权限 guard/decorator、`frontend/src/pages/Admin/*`、路由/菜单权限配置 |
| 验收命令 | `rg -n "RequirePermission|field_permission\.write|field_permission\.read|@Roles\('admin'\)" backend/src/modules/admin backend/src/common frontend/src`<br>API：被授权非管理员调用字段保存接口；未授权非管理员直达同接口。 |
| 预期输出/状态变化 | 字段管理写权限从硬编码 admin 改为权限码；管理员可授予/撤销非管理员字段管理权限。 |
| PASS 条件 | 被授权角色菜单可见、接口 200 且仅能操作授权范围；未授权角色菜单不可见、URL/API 403；管理员仍可全量管理。 |

### G-19 工单流程配置一期

| 字段 | 内容 |
|---|---|
| 预期改动文件 | 后端：`workflow_definitions`、`workflow_nodes`、`workflow_edges`、`action_configs` 相关 entity/migration/service/controller；前端：`frontend/src/pages/Admin/Workflow*`、路由、菜单 |
| 验收命令 | `rg -n "workflow_definitions|workflow_nodes|workflow_edges|action_configs|Workflow" backend/src frontend/src`<br>`curl.exe -s -H "Authorization: Bearer $env:TOKEN_ADMIN" "$env:BASE_URL/admin/workflows"`<br>UI：管理员进入工单流程配置，新增/编辑节点、办理人、SLA、动作备注配置。 |
| 预期输出/状态变化 | 数据库表、CRUD API、管理页面均存在；至少支持节点、办理人、SLA、动作必填备注配置。 |
| PASS 条件 | 管理员保存流程后，新发起工单按新流程生成子工单；非管理员菜单不可见且 URL/API 403；配置错误有校验提示。 |

### G-20 情况 4 编辑后强制重派语义

| 字段 | 内容 |
|---|---|
| 预期改动文件 | `backend/src/modules/work-orders/work-order.service.ts`、`backend/src/modules/work-orders/work-order-resubmit.service.ts`、dispatch engine、`frontend/src/pages/WorkOrders/Detail/index.tsx`、状态/通知测试 |
| 验收命令 | `rg -n "resubmit|重新提交|field_changed|WorkOrderStatus.PENDING|dispatch" backend/src/modules/work-orders backend/src/modules/dispatch-engine frontend/src/pages/WorkOrders/Detail`<br>流程：业务员编辑处理中工单 → 保存/重新提交 → 后道查看原待办与新通知。 |
| 预期输出/状态变化 | 产品确认后，编辑保存必须进入重新提交语义：状态回退到待派发/待处理或显式等待重新提交，重新触发 dispatch，并通知后道字段变更。 |
| PASS 条件 | 编辑后不会让旧 handler 无感继续处理旧数据；重新提交后待办数据为最新；后道收到字段变更通知；若产品决定不做，需有 Leader/产品书面确认并从验收范围移除。 |

---

## 5. 跨角色端到端验收场景（仪表盘 → 我的工单 → 详情页 → 批量办理）

> 该场景用于 P0/P1 修复完成后的组合验收。每个角色至少走一遍；失败即回填到对应 G 项。

| 角色 | 准备数据 | 执行步骤 | 预期结果 | 结果记录 |
|---|---|---|---|---|
| 业务员 | 本人本月发起工单、returned 主工单、未终态主工单、消息各 1 条 | 1. 登录业务员；2. 进入仪表盘核对卡片与消息；3. 进入我的工单→我发起的/我的待办/我的已办；4. 打开未终态详情页执行催办；5. 若存在退回待处理，完成修改/重新提交 | 业务员视角正确；不显示共享团队视角；pending/done 分离；详情页有撤回/作废/催办且终态隐藏；消息计数与列表一致 | PASS / FAIL：____ 证据：____ |
| 后道 | 当前后道 pending/processing 子工单 2 条、completed 子工单 1 条、催办/字段变更消息各 1 条 | 1. 登录后道；2. 仪表盘核对处理中和我的消息；3. 我的工单→我的待办；4. 打开详情办理单条；5. 返回待办勾选 2 条批量办理 | 正常派单不进消息；异常/协作消息进入 bucket；批量办理按钮出现且 remark 必填；完成后列表和仪表盘刷新 | PASS / FAIL：____ 证据：____ |
| 共享负责人 | 授权模块 A/B 各 1 条团队子工单，无权模块 1 条 | 1. 登录共享负责人；2. 仪表盘核对团队范围；3. 我的工单→团队工单；4. 用模块下拉分别筛选 A/B；5. 打开详情；6. 对有权待办执行批量办理或确认批量入口按权限显示 | 模块中文筛选可用；清空恢复；无权模块不泄露；详情和批量操作不越权 | PASS / FAIL：____ 证据：____ |
| 管理员 | 全量工单、字段管理授权目标角色、流程配置测试数据 | 1. 登录管理员；2. 仪表盘查看 module 维度总表和趋势；3. 进入我的工单/团队工单查看全量或授权范围；4. 打开详情确认终态守卫；5. 验证流程配置、字段授权、批量办理 50/51 条边界 | 管理员可见配置入口；module 总表与趋势正确；51 条批量办理被 400 拦截；字段授权/流程配置生效 | PASS / FAIL：____ 证据：____ |

---

## 6. 总体验收判定

| 判定 | 条件 |
|---|---|
| PASS | G-1~G-7 P0 全部通过；G-8~G-17 P1 无阻断；跨角色场景 4 个角色全部 PASS；build/test 门禁通过。 |
| 条件 PASS | 仅 G-18~G-20 中经 Leader/产品确认可延期的 P2 项未完全落地，且已有任务单与排期；P0/P1 不得失败。 |
| FAIL | 任一 P0 FAIL；消息计数/list 不一致；导入缺必填仍静默成功；旧角色业务员仍显示共享团队视角；批量办理无法执行；权限出现越权。 |

## 7. 失败上报模板

```text
[0520 验收失败]
失败项：G-__
优先级：P0/P1/P2
执行命令或步骤：
实际结果：
预期结果：
证据：curl 响应 / rg 输出 / 截图路径 / 日志
建议责任方：backend / frontend / backend+frontend
是否阻断继续验收：是/否
```
