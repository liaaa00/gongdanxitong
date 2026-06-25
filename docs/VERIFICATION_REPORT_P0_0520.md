# P0 补强项静态验收报告（G-1~G-7）

> 日期：2026-05-20  
> 角色：测试工程师  
> 依据：`docs/VERIFICATION_CHECKLIST_0520.md`、`docs/REAL_GAP_ANALYSIS_0520.md`  
> 范围：仅验收 P0 补强项 G-1~G-7。未启动服务器，未执行 curl/UI；本报告以 `rg` / Read / npm test 静态证据为准。

## 1. 总结

| 指标 | 结果 |
|---|---:|
| P0 验收项总数 | 7 |
| PASS | 7 |
| FAIL | 0 |
| 阻断项 | 0 |
| 后端单测 | PASS：34 suites / 192 tests |
| 前端单测 | PASS：14 files / 57 tests |

**结论：P0 静态验收通过。**  
G-1~G-7 均能在代码中找到对应修复证据；后端、前端测试均未出现回归。

---

## 2. 逐项验收结果

### G-1 通知 count / list / dashboard 口径统一，正常派单不进消息

**结果：PASS**

| 检查点 | 最小证据 |
|---|---|
| NotificationService list/count 共用 buildWhere | `backend/src/modules/notifications/notification.service.ts:329`：`where: this.buildWhere(userId, query)`；`380-389`：`countUnread` 调 `this.buildWhere(userId, filters)` |
| 默认排除 dispatch 类 | `backend/src/modules/notifications/notification.service.ts:122-126` 定义 `DISPATCH_BIZ_TYPES`；`422-437` `buildWhere` 中 `!includeDispatch` 时处理 dispatch；`438-440` 使用 `Not(In([...DISPATCH_BIZ_TYPES]))` |
| dashboard 我的消息排除正常派单 | `backend/src/modules/dashboard/dashboard.service.ts:275`：`biz_type NOT IN ('dispatch', 'dispatch_created', 'dispatched_new', 'dispatched_accepted', 'dispatched_completed')` |

**执行过的静态命令：**

```powershell
rg -n "build.*Where|shouldExcludeDispatch|exclude.*dispatch|dispatch_created|dispatched_new|countUnreadByBucket|countUnread\(|async list\(" backend/src/modules/notifications/notification.service.ts backend/src/modules/dashboard/dashboard.service.ts
```

**判定：** list、countUnread、countUnreadByBucket 已统一走 buildWhere；默认不 includeDispatch 时排除正常派单类消息。静态验收通过。

---

### G-2 新增 `GET /notifications/unread-count-by-bucket`

**结果：PASS**

| 检查点 | 最小证据 |
|---|---|
| 后端 controller 路由存在 | `backend/src/modules/notifications/notification.controller.ts:21-23`：`@Get('unread-count-by-bucket')` 调 `countUnreadByBucket(user.sub)` |
| 后端 service 实现存在 | `backend/src/modules/notifications/notification.service.ts:392-405`：`async countUnreadByBucket(userId: string)`，并跳过 dispatch 类型 |
| 前端服务调用新路由 | `frontend/src/services/notifications.ts:201`：`request.get('/notifications/unread-count-by-bucket')` |

**执行过的静态命令：**

```powershell
rg -n "unread-count-by-bucket|countUnreadByBucket" backend/src/modules/notifications frontend/src/services/notifications.ts
```

**判定：** 后端路由、service、前端调用均存在。静态验收通过。

---

### G-3 角色判断归一化

**结果：PASS**

| 检查点 | 最小证据 |
|---|---|
| userStore.hasRole 归一化 | `frontend/src/stores/userStore.ts:71-75`：`const required = canonicalRoleCode(roleCode)`；用户角色 `canonicalRoleCode(r.code)` 后比较 |
| userStore.hasAnyRole 归一化 | `frontend/src/stores/userStore.ts:78-82`：目标角色和用户角色均使用 `canonicalRoleCode` |
| permission 工具归一化 | `frontend/src/utils/permission.ts:22-23`：`userRoles.map((r) => canonicalRoleCode(r))`，requiredRoles 也 canonical 化 |
| WorkOrders 视角判断使用 ROLE 常量 | `frontend/src/pages/WorkOrders/index.tsx:51-54`：`hasRole(ROLE.ADMIN)`、`hasRole(ROLE.BUSINESS_GROUP_MEMBER)` 等 |

**执行过的静态命令：**

```powershell
rg -n "canonicalRoleCode|hasRole:|hasAnyRole|ROLE\." frontend/src/stores/userStore.ts frontend/src/utils/permission.ts frontend/src/pages/WorkOrders/index.tsx frontend/src/layouts/BasicLayout.tsx
rg -n "hasRole\('(biz_member|biz_leader|shared_leader|business_group_member|business_owner|shared_service_leader|salesperson)'\)" frontend/src
```

**补充注意：** 第二条扫描命中 `frontend/src/pages/WorkOrders/New/index.tsx:44`：`hasRole('business_owner') && !hasRole('admin')`。这不是旧角色别名（如 `biz_member`），且底层 `hasRole` 已统一 canonical 化，因此不阻断 B2-c 修复验收；但建议后续统一改为 `ROLE.BUSINESS_OWNER` / `ROLE.ADMIN`，减少硬编码。

**判定：** 旧角色 code 可通过 canonicalRoleCode 归一化判断；B2-c 的根因修复已具备。静态验收通过。

---

### G-4 MyDispatched 增加批量办理/完成按钮

**结果：PASS**

| 检查点 | 最小证据 |
|---|---|
| MyDispatched 引入批量完成接口 | `frontend/src/pages/MyDispatched/index.tsx:16`：导入 `batchCompleteDispatchedOrders` |
| 备注必填 | `frontend/src/pages/MyDispatched/index.tsx:111-115`：`batchCompleteRemark.trim()` 为空则提示 `请填写批量完成备注` 并 return |
| 调用批量完成接口 | `frontend/src/pages/MyDispatched/index.tsx:121-134`：调用 `batchCompleteDispatchedOrders(batchCompleteIds, remark)`，成功后清理选择并 reload |
| 勾选后显示批量完成按钮 | `frontend/src/pages/MyDispatched/index.tsx:315-334`：仅非 done 模式渲染；筛选 `pending/processing`；按钮文案 `批量完成` |
| 弹窗提示只提交 pending/processing | `frontend/src/pages/MyDispatched/index.tsx:356-376`：`批量完成子工单` Modal，提示 `仅 pending/processing 子单会被提交` |
| 服务层接口存在 | `frontend/src/services/dispatchedOrders.ts:524-542`：`batchCompleteDispatchedOrders(ids, remark)` POST `/dispatched-orders/batch-complete` |

**执行过的静态命令：**

```powershell
rg -n "batchComplete|批量办理|批量完成|remark|selectedRowKeys" frontend/src/pages/MyDispatched/index.tsx frontend/src/services/dispatchedOrders.ts
```

**判定：** 我的待办页已具备批量完成入口、备注必填、pending/processing 过滤与提交逻辑。静态验收通过。

---

### G-5 我的工单 pending/done 路由分模式

**结果：PASS**

| 检查点 | 最小证据 |
|---|---|
| 路由显式传 mode | `frontend/src/routes/index.tsx:124`：`<MyDispatched mode="pending" />`；`125`：`<MyDispatched mode="done" />` |
| 组件支持 mode prop / fallback useLocation | `frontend/src/pages/MyDispatched/index.tsx:39-42` 定义 `MyDispatchedMode`；`72-80` 根据 prop 或路径计算 `currentMode` / `isDoneMode` |
| 标题随模式变化 | `frontend/src/pages/MyDispatched/index.tsx:82-83`：pending 显示 `我的待办`，done 显示 `我的已办` |
| done 查询 completed | `frontend/src/pages/MyDispatched/index.tsx:258-263`：done 模式请求 `handlerId:'current', status:'completed'` 并限制当月 |
| pending 查询 pending + processing | `frontend/src/pages/MyDispatched/index.tsx:266-276`：pending 模式分别请求 `status:'pending'`、`status:'processing'` 后合并 |

**执行过的静态命令：**

```powershell
rg -n "mode=|useLocation|pending|done|我的待办|我的已办|handlerId" frontend/src/routes/index.tsx frontend/src/pages/MyDispatched/index.tsx
```

**判定：** `/my-work/pending` 与 `/my-work/done` 已分离查询和展示模式，不再固定复用同一份数据。静态验收通过。

---

### G-6 仪表盘“处理中”口径修正

**结果：PASS**

| 检查点 | 最小证据 |
|---|---|
| 主工单卡片处理中使用 NOT IN 口径 | `backend/src/modules/dashboard/dashboard.service.ts:300`：`status::text NOT IN ('completed','withdrawn','void','draft')` |
| 后道子工单卡片处理中使用 NOT IN 口径 | `backend/src/modules/dashboard/dashboard.service.ts:325`：`status::text NOT IN ('completed','withdrawn','void','draft')` |
| 单测断言覆盖该 SQL | `backend/test/dashboard.spec.ts:17`、`68`：断言 query 包含 `status::text NOT IN ('completed','withdrawn','void','draft')` |

**执行过的静态命令：**

```powershell
rg -n "NOT IN|completed|withdrawn|void|draft|status = 'processing'|processing" backend/src/modules/dashboard/dashboard.service.ts backend/test/dashboard.spec.ts
```

**说明：** `dashboard.service.ts` 中仍存在其他旧接口/非 P0 总表逻辑使用 `status = 'processing'`（如 manager/team 历史接口、order-type-matrix）。本次 G-6 的 P0 验收对象是仪表盘 4 卡片处理中口径，关键查询已改为 NOT IN。

**判定：** P0 卡片统计口径已修正。静态验收通过。

---

### G-7 停用旧 confirmImport

**结果：PASS**

| 检查点 | 最小证据 |
|---|---|
| work-orders 旧 confirmImport 方法无命中 | `rg -n "async confirmImport|ImportConfirmDto" backend/src/modules/work-orders/work-order.service.ts backend/src/modules/work-orders/work-order.controller.ts` 输出 `NO_MATCH_IN_WORK_ORDER_MODULE` |
| 新 confirm 路由走 imports controller | `backend/src/modules/imports/imports.controller.ts:60-68`：`@Post('import/confirm')` 后调用 `this.importJobService.createJob(...)` |
| 前端 confirmImport 指向新路由 | `frontend/src/services/workOrders.ts:1322-1324`：`request.post('/work-orders/import/confirm', { fileId, orderType: 'onboarding', ... })` |
| 页面仍调用服务层 confirmImport，但不是旧后端链路 | `frontend/src/pages/WorkOrders/Import/index.tsx:54` 调服务函数；服务函数已指向新 `/work-orders/import/confirm` |

**执行过的静态命令：**

```powershell
rg -n "async confirmImport|confirmImport\(|GoneException|410|ImportJobStatus.COMPLETED,\s*successRows:\s*0|successRows:\s*0|failRows:\s*0" backend/src/modules/work-orders backend/src/modules/imports frontend/src/services/workOrders.ts frontend/src/pages/WorkOrders/Import/index.tsx
rg -n "async confirmImport|ImportConfirmDto" backend/src/modules/work-orders/work-order.service.ts backend/src/modules/work-orders/work-order.controller.ts
```

**判定：** 旧 `work-order.service.ts` 中直接置 COMPLETED 的 confirmImport 已不在 work-orders 模块中；当前导入确认统一走 import-job 链路。静态验收通过。

---

## 3. 测试执行结果

### 3.1 后端测试

命令：

```powershell
Push-Location backend
npm run test
Pop-Location
```

结果：PASS

```text
Test Suites: 34 passed, 34 total
Tests:       192 passed, 192 total
Snapshots:   0 total
```

备注：测试输出中有 AI 配置/模拟 provider 的 warning/error 日志，但不影响用例结果，退出码为 0。

### 3.2 前端测试

命令：

```powershell
Push-Location frontend
npm run test
Pop-Location
```

结果：PASS

```text
Test Files  14 passed (14)
Tests       57 passed (57)
```

备注：输出中有 Vite deprecated option 与 jsdom `getComputedStyle` pseudo-elements warning，不影响用例结果，退出码为 0。

---

## 4. 不启动服务器的 sanity check

| 检查 | 命令 | 结果 | 是否计入 P0 |
|---|---|---|---|
| `unread-count-by-bucket` 路由 | `rg -n "unread-count-by-bucket|countUnreadByBucket" backend/src/modules/notifications frontend/src/services/notifications.ts` | PASS：后端 controller/service、前端 service 均命中 | 是，覆盖 G-2 |
| 旧 confirmImport 后端方法 | `rg -n "async confirmImport|ImportConfirmDto" backend/src/modules/work-orders/work-order.service.ts backend/src/modules/work-orders/work-order.controller.ts` | PASS：无命中 | 是，覆盖 G-7 |
| social_urge 残留 | `rg -n "social_urge" backend/src frontend/src` | WARNING：仍命中 `ai-mapping.service.ts`、`field-validation.service.ts`、`seed-field-permissions.ts` | 否，属于 P1/G-8 |
| batch-complete DTO 上限 | `rg -n "ArrayMaxSize\(50\)|class BatchComplete|ids" backend/src/modules/dispatched-orders/dto/batch-complete.dto.ts` | WARNING：仅看到 class/ids，未看到 `ArrayMaxSize(50)` | 否，属于 P1/G-15 |
| 角色硬编码残留 | `rg -n "hasRole\('(biz_member|biz_leader|shared_leader|business_group_member|business_owner|shared_service_leader|salesperson)'\)" frontend/src` | WARNING：`WorkOrders/New/index.tsx:44` 命中 canonical 字符串 `business_owner` | 不阻断 G-3；建议后续改 ROLE 常量 |

---

## 5. FAIL 项与返工建议

P0 范围内 **无 FAIL 项**，无需 P0 返工。

非 P0 注意项建议后续处理：

1. **G-8 / P1：social_urge 仍有运行态残留**  
   - 命中：`backend/src/modules/ai/ai-mapping.service.ts:67`、`backend/src/modules/imports/field-validation.service.ts:81`、`backend/src/database/seeds/seed-field-permissions.ts:105`。  
   - 建议：按 G-8 删除或降级 `required=false`，并补迁移清理。
2. **G-15 / P1：batch-complete DTO 未见 `@ArrayMaxSize(50)`**  
   - 命中：`backend/src/modules/dispatched-orders/dto/batch-complete.dto.ts` 仅有 `ids`，无 `ArrayMaxSize(50)`。  
   - 建议：补 `@ArrayMaxSize(50)` 与 51 条请求的 DTO 测试。
3. **G-3 代码风格注意：仍有 canonical role 字符串字面量**  
   - 命中：`frontend/src/pages/WorkOrders/New/index.tsx:44`。  
   - 建议：改为 `ROLE.BUSINESS_OWNER` / `ROLE.ADMIN`，不影响本次 P0 判定。

---

## 6. 最终判定

**P0 静态验收：PASS。**

G-1~G-7 均有静态代码证据证明补强动作已落地；后端与前端测试均通过。下一步可进入 P1 补强项验收或按 Leader 安排进行服务器级 curl/UI 复测。
