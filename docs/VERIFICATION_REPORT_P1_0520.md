# P1 补强项静态验收报告（G-8~G-17）

> 日期：2026-05-20  
> 角色：测试工程师  
> 依据：`docs/VERIFICATION_CHECKLIST_0520.md`、`docs/REAL_GAP_ANALYSIS_0520.md`、`docs/VERIFICATION_REPORT_P0_0520.md`  
> 范围：按 Leader 本次任务分配的 10 个 P1 静态检查点执行。未启动服务器，未执行 curl/UI；本报告以 `rg` / Read / spec 文件证据为准。  
> 说明：本次任务详情对 G-13~G-17 的验收点做了细化/重映射，报告编号以任务分配清单为准。

## 1. 总结

| 指标 | 结果 |
|---|---:|
| P1 验收项总数 | 10 |
| PASS | 10 |
| FAIL | 0 |
| 阻断项 | 0 |

**结论：P1 静态验收通过。**  
G-8~G-17 均能在代码中找到对应修复证据；未发现 P1 阻断返工项。

---

## 2. 逐项验收结果

### G-8 social_urge 清理

**结果：PASS**

| 检查点 | 最小证据 |
|---|---|
| `social_urge` 在运行态源码中仅剩迁移 | `rg -l "social_urge|社保公积金未办是否需要催办" backend/src frontend/src backend/test` 仅输出：`backend/src\database\migrations\20260520002000-DisableSocialUrgeField.ts` |
| 禁止运行态文件无残留 | `rg -n "social_urge|社保公积金未办是否需要催办" backend/src/database/seeds/seed-fields.ts backend/src/database/seeds/seed-field-permissions.ts backend/src/modules/ai/ai-mapping.service.ts backend/src/modules/imports/field-validation.service.ts backend/src/modules/imports/excel-parser.service.ts` 输出：`NO_MATCH_IN_FORBIDDEN_RUNTIME_FILES` |
| 迁移文件存在 | `backend/src/database/migrations/20260520002000-DisableSocialUrgeField.ts` |
| 迁移禁用字段、删除权限、清理 extra_data | `backend/src/database/migrations/20260520002000-DisableSocialUrgeField.ts:8-15`：更新 `field_configs`，`is_active=false`、`is_required=false`、`default_required=false`；删除 `field_permissions`；清理 `work_orders.extra_data - 'social_urge'` |

**执行过的静态命令：**

```powershell
rg -l "social_urge|社保公积金未办是否需要催办" backend/src frontend/src backend/test
rg -n "social_urge|社保公积金未办是否需要催办" backend/src/database/seeds/seed-fields.ts backend/src/database/seeds/seed-field-permissions.ts backend/src/modules/ai/ai-mapping.service.ts backend/src/modules/imports/field-validation.service.ts backend/src/modules/imports/excel-parser.service.ts
rg -n "social_urge|DisableSocialUrge|is_required|required|field_permissions|field_configs" backend/src/database/migrations/20260520002000-DisableSocialUrgeField.ts
```

**判定：** social_urge 已从运行态 seed、AI 映射、导入校验、Excel 解析中清理，仅保留禁用/清理迁移。静态验收通过。

---

### G-9 工单详情页补撤回/作废/催办按钮

**结果：PASS**

| 检查点 | 最小证据 |
|---|---|
| 三个接口调用存在 | `frontend/src/pages/WorkOrders/Detail/index.tsx:137-159`：分别 POST `/work-orders/${id}/urge`、`/withdraw`、`/void` |
| 终态过滤存在 | `frontend/src/pages/WorkOrders/Detail/index.tsx:166`：`['completed', 'withdrawn', 'void'].includes(order.status)`；`217`：`{!isTerminal && (...)}` |
| 详情页按钮存在 | `frontend/src/pages/WorkOrders/Detail/index.tsx:227-245`：撤回 Popconfirm、作废 Popconfirm、催办 Popconfirm 与按钮 |

**执行过的静态命令：**

```powershell
rg -n "withdraw|void|urge|撤回|作废|催办|isTerminal|status" frontend/src/pages/WorkOrders/Detail/index.tsx frontend/src/services/workOrders.ts
```

**判定：** 详情页非终态展示撤回/作废/催办入口，终态隐藏。静态验收通过。

---

### G-10 仪表盘总表支持 `dimension=node`

**结果：PASS**

| 检查点 | 最小证据 |
|---|---|
| DTO 存在且含 dimension | `backend/src/modules/dashboard/dto/dashboard-query.dto.ts:3-7`：`OrderTypeMatrixQueryDto`，`@IsIn(['orderType', 'node']) dimension` |
| Controller 传入 dimension | `backend/src/modules/dashboard/dashboard.controller.ts:61-63`：`orderTypeMatrix(@Query() query...)` 调 `getOrderTypeMatrix(user, query.dimension ?? 'orderType')` |
| Service 接收 dimension 参数 | `backend/src/modules/dashboard/dashboard.service.ts:382`：`getOrderTypeMatrix(user, dimension: 'orderType' | 'node' = 'orderType')` |
| node 维度按子工单 module 分组 | `backend/src/modules/dashboard/dashboard.service.ts:395-397`：`dimension === 'node'` 调 `queryNodeMatrixRows`；`466-476`：`d.module_code AS "moduleCode"`，`GROUP BY d.module_code` |
| node label 中文化 | `backend/src/modules/dashboard/dashboard.service.ts:481-483`：`label: DISPATCH_MODULE_LABELS[row.moduleCode] ?? row.moduleCode` |

**执行过的静态命令：**

```powershell
rg -n "DashboardQueryDto|dimension|moduleCode|moduleName|nodeType|getOrderTypeMatrix|getLeaderTrend|leader-trend" backend/src/modules/dashboard backend/src/common/constants
```

**判定：** 后端总表支持 `dimension=node`，并按 `dispatched_orders.module_code` 汇总。静态验收通过。

---

### G-11 业务负责人趋势图支持 `moduleCode` / 中文名识别

**结果：PASS**

| 检查点 | 最小证据 |
|---|---|
| DTO 含 moduleCode | `backend/src/modules/dashboard/dto/dashboard-query.dto.ts:9-15`：`LeaderTrendQueryDto` 包含 `moduleCode?: string` |
| Controller 传 moduleCode | `backend/src/modules/dashboard/dashboard.controller.ts:66-69`：`getLeaderTrend(query.orderType, user, query.moduleCode)` |
| Service 接受 moduleCode | `backend/src/modules/dashboard/dashboard.service.ts:487`：`getLeaderTrend(orderType, user, moduleCode?: string)` |
| 中文名/编码统一识别 | `backend/src/common/constants/dispatch-modules.ts:1-20`：`DISPATCH_MODULE_LABELS`、`DISPATCH_MODULE_NAME_TO_CODE`、`resolveDispatchModuleCode` 支持中文 label 反查 code |
| 查询按 moduleCode 过滤 | `backend/src/modules/dashboard/dashboard.service.ts:494`：`resolveDispatchModuleCode(moduleCode)`；`523-527`：EXISTS 子查询过滤 `d.module_code = $5::text` |

**执行过的静态命令：**

```powershell
rg -n "leader-trend|moduleCode|resolveDispatchModuleCode|DISPATCH_MODULE_NAME_TO_CODE" backend/src/modules/dashboard backend/src/common/constants/dispatch-modules.ts
```

**判定：** leader-trend 已支持 moduleCode，并能通过公共模块映射识别中文名。静态验收通过。

---

### G-12 前端 Dashboard 接入 dimension/moduleCode

**结果：PASS**

| 检查点 | 最小证据 |
|---|---|
| service 发送 dimension | `frontend/src/services/dashboard.ts:287-294`：`getOrderTypeMatrix({ dimension })` 请求 `/dashboard/order-type-matrix`，params 含 `dimension` |
| service 发送 moduleCode | `frontend/src/services/dashboard.ts:297-320`：`getLeaderTrend(orderType, moduleCode)`，请求 params 含 `{ orderType, moduleCode }` |
| 页面有 dimension Segmented | `frontend/src/pages/Dashboard/index.tsx:37-40` 定义 `按节点/按工单类型`；`297-302` 渲染 `Segmented` 并更新 `matrixDimension` |
| 页面请求 matrix 时带 dimension | `frontend/src/pages/Dashboard/index.tsx:236-239`：`getOrderTypeMatrix({ dimension: matrixDimension })` |
| LeaderTrendChart 有 moduleCode 下拉 | `frontend/src/pages/Dashboard/index.tsx:70-80` 保存 `moduleCode` 并调用 `getLeaderTrend(orderType, moduleCode)`；`105-117` 渲染 `Select`，options 来自模块列表 |

**执行过的静态命令：**

```powershell
rg -n "dimension|moduleCode|getOrderTypeMatrix|getLeaderTrend|Segmented|Radio|LeaderTrendChart|Select" frontend/src/services/dashboard.ts frontend/src/pages/Dashboard/index.tsx
```

**判定：** 前端已接入 `dimension` 与 `moduleCode`，并提供总表维度切换和趋势模块下拉。静态验收通过。

---

### G-13 batch-complete DTO 上限 `ArrayMaxSize(50)`

**结果：PASS**

| 检查点 | 最小证据 |
|---|---|
| DTO 引入 ArrayMaxSize | `backend/src/modules/dispatched-orders/dto/batch-complete.dto.ts:1`：import `ArrayMaxSize` |
| ids 上限 50 | `backend/src/modules/dispatched-orders/dto/batch-complete.dto.ts:3-8`：`BatchCompleteDispatchedOrderDto` 的 `ids` 字段有 `@ArrayMaxSize(50)` |
| spec 覆盖 51 条失败 | `backend/test/dispatched-order.service.spec.ts:99-105`：`limits batch complete ids to 50 items`，51 个 id 校验应产生 ids 错误 |

**执行过的静态命令：**

```powershell
rg -n "ArrayMaxSize|ArrayNotEmpty|ids|BatchComplete" backend/src/modules/dispatched-orders/dto/batch-complete.dto.ts backend/test/dispatched-order.service.spec.ts
```

**判定：** DTO 已限制批量办理最多 50 条，并有静态 spec 证据。静态验收通过。

---

### G-14 共享负责人模块筛选：中文名兼容 + moduleName/nodeType

**结果：PASS**

| 检查点 | 最小证据 |
|---|---|
| 中文映射常量存在 | `backend/src/common/constants/dispatch-modules.ts:1-20`：定义中文 label 与 `resolveDispatchModuleCode` |
| DTO 增加 moduleName/nodeType | `backend/src/modules/dispatched-orders/dto/list-query.dto.ts:15-21`：`moduleName?: string`、`nodeType?: string` |
| service 统一处理多参数 | `backend/src/modules/dispatched-orders/dispatched-order.service.ts:607-609`：`resolveDispatchModuleCode(query.moduleCode ?? query.module_code ?? query.moduleName ?? query.nodeType ?? query.pool)` 后过滤 `d.module_code` |

**执行过的静态命令：**

```powershell
rg -n "DISPATCH_MODULE_LABELS|DISPATCH_MODULE_NAME_TO_CODE|resolveDispatchModuleCode|moduleName|nodeType|moduleCode" backend/src/common/constants/dispatch-modules.ts backend/src/modules/dispatched-orders/dto/list-query.dto.ts backend/src/modules/dispatched-orders/dispatched-order.service.ts
```

**判定：** 后端团队/部门子工单筛选已兼容中文模块名和 nodeType。静态验收通过。

---

### G-15 前端 DynamicForm 分组栅格

**结果：PASS**

| 检查点 | 最小证据 |
|---|---|
| 引入 Card/Row/Col | `frontend/src/components/DynamicForm/index.tsx:11`：`import { App, Card, Col, Row } from 'antd'` |
| 字段模型含 collection_group | `frontend/src/components/DynamicForm/index.tsx:27`：`collection_group?: string | null` |
| 按 collection_group 分组 | `frontend/src/components/DynamicForm/index.tsx:123-135`：`groupedFields` 使用 `field.collection_group?.trim()` 构建分组 |
| Card + Row/Col gutter 栅格渲染 | `frontend/src/components/DynamicForm/index.tsx:285-298`：每组渲染 `Card`，内部 `Row gutter={[16, 16]}`，字段包在 `Col xs={24} sm={24} md={12} lg={8} xl={8}` |

**执行过的静态命令：**

```powershell
rg -n "collection_group|collectionGroup|Row|Col|gutter|group|Card|span|colSpan" frontend/src/components/DynamicForm/index.tsx frontend/src/components/DynamicForm
```

**判定：** 入职动态表单已从单列改为按 collection_group 分组的响应式栅格。静态验收通过。

---

### G-16 TeamDispatched 模块 Select

**结果：PASS**

| 检查点 | 最小证据 |
|---|---|
| 模块配置来源 getModuleConfigs | `frontend/src/pages/TeamDispatched/index.tsx:13` 导入 `getModuleConfigs`；`49-55` 加载 active sub modules 到 `moduleOptions` |
| 模块列使用 select | `frontend/src/pages/TeamDispatched/index.tsx:162-178`：模块列 `valueType: 'select'`，`fieldProps.options` 来自 `moduleOptions`，`search.transform` 输出 `{ module_code: value }` |
| 请求带模块筛选 | `frontend/src/pages/TeamDispatched/index.tsx:267-270`：从 `params.module_code` 取值并传给 `getDispatchedOrders({ ...params, module_code: moduleCode })` |

**执行过的静态命令：**

```powershell
rg -n "getModuleConfigs|valueType:\s*'select'|fieldProps|module_code|request" frontend/src/pages/TeamDispatched/index.tsx
```

**判定：** TeamDispatched 已提供模块下拉筛选，并将选择值传入列表请求。静态验收通过。

---

### G-17 collection_group 后端输出与 seed

**结果：PASS**

| 检查点 | 最小证据 |
|---|---|
| FieldConfig 实体有 collection_group 列 | `backend/src/entities/field-config.entity.ts:46-47`：`@Column({ name: 'collection_group' ... }) collectionGroup` |
| FieldsService 输出 collection_group | `backend/src/modules/admin/fields/fields.service.ts:93-94`：`toFieldView` 输出 `{ collection_group: field.collectionGroup ?? null }` |
| SaveFieldInput 支持 collectionGroup | `backend/src/modules/admin/fields/fields.service.ts:20-35`：`collectionGroup?: string | null` |
| onboarding seed 含分组映射 | `backend/src/database/seeds/seed-fields.ts:31-48`：`onboardingCollectionGroups` 将字段映射到 `基本信息`、`劳动合同签订`、`入职联系`、`发薪信息`、`社保公积金类` |
| seed 字段带 collectionGroup | `backend/src/database/seeds/seed-fields.ts:109-112`：每个 onboarding field 合并 `collectionGroup: onboardingCollectionGroups[field.code]` |
| spec 验证输出 | `backend/test/fields.service.spec.ts:17-49`：断言 list 返回 `collectionGroup` 与 `collection_group` 均为 `基本信息` |

**执行过的静态命令：**

```powershell
rg -n "collection_group|collectionGroup|FieldConfig|seed-fields" backend/src/modules/admin/fields backend/src/database/seeds backend/src/entities backend/test
```

**判定：** 后端字段配置已具备 collection_group 存储、输出、seed 初始化与 spec 覆盖。静态验收通过。

---

## 3. 跨角色 sanity check

| 检查 | 命令 | 结果 | 判定 |
|---|---|---|---|
| 旧角色 `biz_member` 不应出现在业务页面 | `rg -n -i "biz_member" frontend/src` | 仅命中 `frontend/src/constants/roles.ts:4` 注释与 `frontend/src/constants/roles.ts:36` 映射 | PASS |
| canonical role 归一化链路仍存在 | `rg -n "biz_member|canonicalRoleCode|business_group_member" frontend/src/constants/roles.ts frontend/src/stores/userStore.ts frontend/src/utils/permission.ts` | `roles.ts` 中 `biz_member: ROLE.BUSINESS_GROUP_MEMBER`，`userStore.ts`/`permission.ts` 均调用 `canonicalRoleCode` | PASS |

**结论：** `biz_member` 仅出现在 canonical role 映射表，不在业务页面逻辑中直接使用；跨角色静态 sanity check 通过。

---

## 4. FAIL 项与返工建议

P1 范围内 **无 FAIL 项**，无需 P1 返工。

后续建议（非阻断）：

1. 继续补充服务器级 curl/UI 复测，验证本报告中的静态证据在真实数据下与页面展示一致。
2. G-10 中 `orderType` 旧维度仍保留 `status = 'processing'` 口径，当前不影响本次 `dimension=node` 验收；若后续要求旧维度同口径，也需单独补验。
3. G-9 详情页三按钮目前仅按终态过滤，本报告未验证真实角色权限和后端响应；需在 UI/curl 阶段继续验证“本人/非本人/终态/非终态”权限矩阵。

---

## 5. 最终判定

**P1 静态验收：PASS。**

10 个 P1 检查点全部 PASS，FAIL 0。下一步可按 Leader 安排进入服务器级 curl/UI 复测，或继续 P2 项静态验收。
