# 工单系统真实缺失清单（2026-05-20）

> **角色**：架构师
> **任务**：P1-阶段一 代码层面真实差距核对
> **方法**：用 Read/Grep/Glob 工具逐文件验证，每条结论附代码位置证据
>
> **结论先行**：上一轮 37 个任务中，**至少 10 个反馈条目并未真正落地**；
> 文档 `ARCHITECTURE_ANALYSIS_0520.md` 中所写"全部已解决/无需重做"的判断**与代码现状不符**。
> 必须按本清单进行补强后再验收。

---

## 一、问题清单（5 大类 23 项 + 6 类流程 + 截图衍生 1 项 = 30 项核查）

来源：`E:\DeskTop\工单管理系统测试问题反馈0518.docx`、`E:\DeskTop\工单办理流程及各种情况处理规则.docx`。

| 编号 | 简述 | 状态 | 责任 | 优先级 |
|---|---|---|---|---|
| P1.1 | 仪表盘左下角姓名直显（去 hover） | ✅ 已实现 | — | — |
| P1.2 | 仪表盘 4 卡片按角色取数 + 我的消息排除正常派单 | 🟡 部分实现 | backend | P1 |
| P1.3 | 取消周期选择器 + 业务负责人按入职/在职/离职模块趋势图 | 🟡 部分实现 | backend+frontend | P1 |
| P1.4 | 仪表盘总表按子工单/办理事项口径 | ❌ 未实现 | backend+frontend | P1 |
| P2.1 | 非管理员菜单按角色重排 | ✅ 已实现 | — | — |
| P2.2 | "我的工单"四子菜单（待办/已办/我发起的/团队） | 🟡 部分实现 | frontend | P0 |
| P2.3 | "主工单列表"与"新建入职"合并 | ✅ 已实现（标题文案可微调） | — | — |
| P3.1 | 批导入字段映射机制（标准模板免映射 / AI 智能映射） | 🟡 部分实现 | backend+frontend | P1 |
| P3.2 | 删除"社保公积金未办是否需要催办"字段（social_urge） | ❌ 未实现（前端已不显示，后端仍存留） | backend | P1 |
| P3.3 | 搜索栏 5 字段 | ✅ 已实现 | — | — |
| P3.4 | 删除列配置/看板/网格 | ✅ 已实现（运行态需 QA 复测） | — | — |
| P3.5 | 列表操作按钮（修改/撤回/作废/催办，终态隐藏） | ✅ 已实现 | — | — |
| P3.6 | 详情页操作按钮 + 删除工单动态/进度/流转链 | ❌ 详情页缺撤回/作废/催办按钮 | frontend | P1 |
| P3.7 | 详情页搜索筛选栏调整 | ✅ 已实现 | — | — |
| P4.1 | 入职单条录入表单分组栅格排版 | ❌ 未实现（仍单列纵向） | frontend | P1 |
| P4.2 | 新增工单流程配置功能 | ❌ 未实现（前后端均无 workflow_*） | backend+frontend | P2 |
| P4.3 | 字段管理权限可授权非管理员 | ❌ 未实现（仍硬编码 admin） | backend+frontend | P2 |
| P4.4 | 导出模板字段选择改为列表勾选 | ✅ 已实现 | — | — |
| B1 | 必填字段未维护仍可导入（应失败） | 🟡 校验已加固，但旧 confirmImport 未停用 | backend | P0 |
| B2-a | 业务员导入后仪表盘未更新 | 🟡 取决于 P1.2 修复后效果 | backend+frontend | P0 |
| B2-b | 子工单显示"未派发" | 🟡 取决于 P1.2 + 导入触发 submit 是否生效 | backend | P0 |
| B2-c | "共享团队视角"误显示 | ❌ 未实现（角色未归一化） | frontend | P0 |
| B3 | 消息显示数量但点击无记录（count/list 口径不一致） | ❌ 未修复 | backend | P0 |
| B4 | MyDispatched 个人待办无批量办理按钮 | ❌ 未实现 | frontend | P0 |
| B5 | 共享负责人模块筛选失效（中文/无下拉） | ❌ 未实现（仅 code 精确匹配，前端无下拉） | backend+frontend | P1 |
| R1 | 情况 1：常规办理（发起→后道→完成） | ✅ 已落地 | — | — |
| R2 | 情况 2：后道退回→业务员作废 | 🟡 接口完整，但前端详情页缺作废按钮（同 P3.6） | frontend | P1 |
| R3 | 情况 3：后道退回→业务员修改→重新提交 | ✅ 已落地 | — | — |
| R4 | 情况 4：办理中编辑→重新提交→消息提醒后道 | 🟡 已实现 update 通知（`order.field_changed`），但"编辑必须走重新提交"产品语义未强制 | backend | P2 |
| R5 | 情况 5：办理中申请撤回/作废→后道审批 | 🟡 接口完整，前端详情页缺申请入口（同 P3.6） | frontend | P1 |
| R6 | 情况 6：已完成不允许操作 | ✅ 已落地（`isTerminal` 守卫） | — | — |

> 上一轮分析（`ARCHITECTURE_ANALYSIS_0520.md`）声称的 26 项全部已解决，与代码实际不符——本表中 **10 项 ❌ 未实现 + 9 项 🟡 部分实现**。

---

## 二、逐条代码证据

### P1.2 仪表盘 4 卡片按角色取数 + 我的消息分类（🟡 部分实现）

**已实现部分：**

- `backend/src/modules/dashboard/dashboard.service.ts:41-55`：`getDashboardCards` 已按 admin / 业务负责人 / 业务组长 / 后道 / 业务员分支调用不同 query。
- `backend/src/modules/dashboard/dashboard.service.ts:269-279`：`countUnreadMessages` 已通过 `biz_type NOT IN ('dispatch','dispatch_created','dispatched_new','dispatched_accepted','dispatched_completed')` 排除正常派单类计入门户"我的消息"。

**未达标部分：**

1. **处理中口径不符反馈要求**：反馈要求"已发起未办结"=`status NOT IN (completed, withdrawn, void, draft)`；当前实现只统计 `status = 'processing'`：
   - `backend/src/modules/dashboard/dashboard.service.ts:300`：`COUNT(*) FILTER (WHERE status = 'processing')::int AS processing`
   - `backend/src/modules/dashboard/dashboard.service.ts:325` 同样问题。
   - 这导致 `status=pending/withdraw_pending/void_pending/returned` 的工单不计入"处理中"，仪表盘看起来"漏数"。
2. **后道角色 myMessages 与 list 接口不对齐**：dashboard 排除了 dispatch，但 `notification.service.ts:358-360`（`countUnread`）和 `notification.service.ts:292-325`（`list`）都没有排除 dispatch 类——铃铛/列表使用 list+countUnread，两者口径不一致，导致 B3 现象。

### P1.3 业务负责人趋势图（🟡 部分实现）

- `backend/src/modules/dashboard/dashboard.controller.ts:66-69`、`dashboard.service.ts:437-489`：`GET /dashboard/leader-trend` 已存在，按 12 个月输出 total/completed/rate。
- **缺陷**：接口签名 `getLeaderTrend(orderType, user)` **只接 orderType**，不支持 `moduleCode`；反馈要求"按入职、在职、离职模块中**各项工单**完成率变动趋势"（即按子工单事项）。当前实现无法满足。

### P1.4 仪表盘总表按子工单/办理事项口径（❌ 未实现）

- `backend/src/modules/dashboard/dashboard.service.ts:381-435`：`getOrderTypeMatrix` 按 `wo.order_type` 分组：
  - `dashboard.service.ts:412-419`：CASE 输出仅 `'入职工单'/'续签工单'/'离职工单'/'待遇申报'` 共 **4 行**。
- 反馈截图明确要求行为"入职联系、劳动合同签订、数据录入、社保公积金办理…"，应按 `dispatched_orders.module_code` 分组。当前实现完全是按主工单类型分组，**与反馈要求不一致**。
- 前端 `frontend/src/pages/Dashboard/index.tsx` 直接消费 `orderType` 维度，未做 module 维度。

### P2.2 "我的工单"四子菜单（🟡 部分实现）

- `frontend/src/layouts/BasicLayout.tsx:133-141`：菜单项已拆为 `我发起的/我的待办/我的已办/团队工单`。
- `frontend/src/routes/index.tsx:123-126`：
  ```
  <Route path="my-work/initiated" element={... <WorkOrders /> ...} />
  <Route path="my-work/pending"   element={... <MyDispatched /> ...} />
  <Route path="my-work/done"      element={... <MyDispatched /> ...} />
  <Route path="my-work/team"      element={... <TeamDispatched /> ...} />
  ```
- **缺陷**：`/my-work/pending` 与 `/my-work/done` **复用同一个 `MyDispatched` 组件**，但 `MyDispatched/index.tsx:179-180` 内部固定 `handlerId='current'`，**未区分 mode**——业务员点"我的待办"和点"我的已办"看到的是同一份数据，且业务员"我的待办"应显示"被退回的主工单"，当前完全没实现这一分支。

### P3.2 删除 social_urge 字段（❌ 未实现）

后端仍然引用：
- `backend/src/database/seeds/seed-fields.ts:47`：`...['social_urge', 'special_remark', 'data_entry_feedback'].map(...)`
- `backend/src/database/seeds/seed-fields.ts:107`：
  ```
  { code: 'social_urge', name: '社保公积金未办是否需要催办',
    type: FieldType.DROPDOWN, required: true, defaultRequired: true,
    options: ['是', '否'], orderType: ONBOARDING, businessContext: [ONBOARDING] }
  ```
  仍然 `required:true, defaultRequired:true`。
- `backend/src/database/seeds/seed-field-permissions.ts:102, 105`：仍出现在 read/write 列表。
- `backend/src/modules/imports/field-validation.service.ts:81`：仍出现在 alias 表。
- `backend/src/modules/ai/ai-mapping.service.ts:67`：仍出现在 AI 字段映射别名表。

前端 `frontend` 下未引用（`rg social_urge` 返回 0 命中），但**存量 seed 数据库里这个字段仍然 required**——业务员单条新建时仍会被强制要求填写，与反馈"建议删除"冲突；批导入若 `social_urge` 列缺失，整行直接 required 校验失败，造成 B1 现象的死循环。

### P3.6 详情页操作按钮（❌ 未实现）

- `frontend/src/pages/WorkOrders/Detail/index.tsx:178-194`：详情页非终态时**只**渲染：
  ```
  "编辑工单" + "取消编辑" + "重新提交"（仅 returned 态）+ "返回列表"
  ```
- **完全没有**：撤回、作废、催办按钮。
- 列表页 `frontend/src/pages/WorkOrders/index.tsx:240-289` 是有撤回/作废/催办按钮的，但详情页缺失，**与反馈 P3.6 直接冲突**：
  > "点击工单进入详情页后，操作同上（业务员：修改、撤回、作废、催办）"
- 同时 R2/R5 的业务流程"业务员发起作废/撤回申请→后道审批"在详情页没有发起入口。

### P4.1 入职单条录入表单分组栅格（❌ 未实现）

- `frontend/src/components/DynamicForm/index.tsx:253-271`：渲染逻辑直接 `<ProForm layout="vertical">{sortedFields.map(renderField)}</ProForm>`，**无 collection_group 分组、无栅格、无 Card**。
- 第 112 行虽然读取了 `f.collection_group`，但只用于一处过滤判断，没有依据分组分段渲染。
- 反馈截图明确要求"基础信息/合同/社保/银行/备注…" 分组 Card + PC 端 3 列栅格。

### P4.2 工单流程配置功能（❌ 未实现）

- 后端 `rg workflow_definitions|workflow_nodes|workflow_edges` 返回 0 命中。
- 前端 `frontend/src/pages/Admin/ModuleConfig/index.tsx:1-100` 仅是模块启用/禁用开关，没有节点/边/动作配置 UI。
- 反馈 P5.2"管理员可完成各个工单的流程自定义配置"——属于全新需求，未开工。

### P4.3 字段管理权限非管理员（❌ 未实现）

- `backend/src/modules/admin/fields/fields.controller.ts:181-203`：所有写接口 `@Roles('admin')`。
- `backend/src/modules/admin/field-permissions/field-permission.controller.ts:55, 62`：均 `@Roles('admin')`。
- 没有 `@RequirePermission('field_permission.write')` 这类细粒度 guard，无法授权给非管理员。

### B1 必填字段未维护仍可导入（🟡 校验加固但旧接口未停用）

- `backend/src/modules/imports/field-validation.service.ts:131-144`：
  ```
  if (required && !this.hasValue(value)) {
    ... errors.push({ ... reason: 'required' ... });
    continue;
  }
  ```
  逻辑已修正，必填缺失即整行失败。
- `backend/src/modules/imports/field-validation.service.ts:26`：`SOFT_REQUIRED_SAFE_DEFAULTS = {}`，没有为 social_urge 做软降级。
- **但是**：`backend/src/modules/work-orders/work-order.service.ts:962-975` 旧的 `confirmImport` 仍存在，直接 `status: ImportJobStatus.COMPLETED, successRows:0, failRows:0`，**完全跳过校验**。如果还有任何调用方走这条路径，B1 仍会复现。需要确认是否有路由暴露此方法。

### B2-c "共享团队视角"误显示（❌ 未实现）

- `frontend/src/stores/userStore.ts:70-80`：
  ```
  hasRole: (roleCode: string) => {
    const { user } = get();
    if (!user || !user.roles) return false;
    return user.roles.some((r) => r.code === roleCode);
  },
  ```
  **直接比较 `r.code === roleCode`，不做归一化**。
- `frontend/src/utils/permission.ts:13-21`：同样直接 `userRoles.includes(r)`，无归一化。
- `frontend/src/constants/roles.ts:50-58`：`canonicalRoleCode` 归一化函数**存在但未被 store.hasRole 调用**。
- `frontend/src/pages/WorkOrders/index.tsx:50-65`：
  ```
  const isGroupMember = hasRole('business_group_member');
  ...
  if (isGroupMember) return { title: '业务员视角', ... };
  return { title: '共享团队视角', ... };  // ← 当用户角色 code 是旧的 biz_member 时，会落到这里
  ```
- **根因明确**：业务员账号若数据库角色 code 仍是旧 `biz_member`/`biz_leader`/`shared_leader` 等，`hasRole('business_group_member')` 永远为 false → fallback 到"共享团队视角"。

### B3 消息显示数量但点击无记录（❌ 未修复）

- `backend/src/modules/notifications/notification.service.ts:358-360`（`countUnread`）：`return this.notificationRepository.count({ where: { userId, isRead: false } });` **不排除 dispatch**。
- `backend/src/modules/notifications/notification.service.ts:292-325`（`list`）：where 子句只有 `userId/bizType/isRead`，**不排除 dispatch**。
- `backend/src/modules/dashboard/dashboard.service.ts:269-279`（`countUnreadMessages`，门户卡片）：**排除 dispatch**。
- **三处口径不一致**：门户卡片显示 X 条未读，但铃铛 `unread-count` 显示 Y 条，点击列表 list 又是 Z 条；当用户角色仅产生 dispatch 类（典型 = 后道刚收到派单），门户/列表/铃铛会出现"数字对不上、点开为空"。
- 前端 `frontend/src/services/notifications.ts:198-207` 调用了 `/notifications/unread-count-by-bucket`，**但后端 controller 没有这个路由**（`backend/src/modules/notifications/notification.controller.ts:7-53` 只有 `unread-count`、`unread-by-type`），前端 catch 后自己拉 200 条聚合，效率差且容易出错。

### B4 MyDispatched 无批量办理（❌ 未实现）

- `frontend/src/pages/MyDispatched/index.tsx:194-207`：
  ```
  tableAlertRender={({ selectedRowKeys, onCleanSelected }) => (
    <Space>
      <span>已选 {selectedRowKeys.length} 项</span>
      <RefButton ... onClick={onCleanSelected}>取消</RefButton>
      <RefButton type="primary" icon={<ExportOutlined />} onClick={...}>批量导出</RefButton>
    </Space>
  )}
  ```
- **只有"批量导出"按钮，没有"批量完成"按钮**。后端 `POST /dispatched-orders/batch-complete` 已就绪（参见下条），但前端没接入。
- `frontend/src/pages/TeamDispatched/index.tsx:235` 有"批量完成"按钮，证明能力存在但未下沉到 MyDispatched。
- 反馈截图明确指向"我的待办"页面（即 `/my-work/pending` 即 MyDispatched）。

### B5 共享负责人模块筛选失效（❌ 未实现）

- `backend/src/modules/dispatched-orders/dispatched-order.service.ts:607-608`：
  ```
  const moduleCode = query.moduleCode ?? query.module_code ?? query.pool;
  if (moduleCode) qb.andWhere('d.module_code = :moduleCode', { moduleCode });
  ```
- 只接收 `moduleCode/module_code/pool`，**没有处理 `moduleName`（中文）或 `nodeType`**。若前端传"入职联系"中文，会被当作 module_code 精确匹配，必空。
- `frontend/src/pages/TeamDispatched/index.tsx:138-139`：
  ```
  { title: '模块', dataIndex: 'module_code', key: 'module_code', width: 140,
    render: (_, record) => getModuleLabel(record.module_code) },
  ```
  **列没有 `valueType: 'select'`，搜索表单不提供下拉**，普通用户必须手输 module_code，无法靠中文名筛选。这正是反馈截图"按模块搜索时无法显示"的根因。
- `backend/src/modules/dispatched-orders/dto/batch-complete.dto.ts:1-17`：DTO 缺 `@ArrayMaxSize(50)`（后端工程师在 BE-N09 已提出，但尚未补）。

### R4 情况 4 编辑后通知后道（🟡 已实现 update 通知）

- `backend/src/modules/work-orders/work-order.service.ts:226-233`：
  ```
  if (this.fieldChangeHook) {
    await this.fieldChangeHook.onWorkOrderUpdated({
      orderId: workOrder.id,
      actorUserId: user.sub,
      diff: this.fieldChangeHook.buildDiff(before, after),
      bizType: workOrder.status === WorkOrderStatus.COMPLETED ? 'order.completed_modified' : 'order.field_changed',
    });
  }
  ```
  编辑触发 `order.field_changed` 通知。
- **未达标点**：反馈要求"只要点击编辑，即需重新提交"，即 update 后状态应回到"待派发/待办"，强制再次走 dispatch。当前 update 不改变 status，子工单照样按原 handler 继续处理。语义上少一道"重新提交"重派动作（不过开发工作量大，可作为 P2）。

### R5 情况 5 撤回/作废审批（🟡 接口完整，前端入口缺）

- 后端：
  - `backend/src/modules/work-orders/work-order.controller.ts:103-110` `/work-orders/:id/withdraw`
  - `backend/src/modules/work-orders/work-order.controller.ts:113-123` `/work-orders/:id/withdraw/approve`
  - `backend/src/modules/work-orders/work-order.controller.ts:133-140` `/work-orders/:id/void`
  - `backend/src/modules/work-orders/work-order.controller.ts:143-...` `/work-orders/:id/void/approve`
  - `backend/src/entities/enums.ts:44-47`：`WITHDRAW_PENDING`、`VOID_PENDING` 已加入枚举。
  - `backend/src/modules/work-orders/work-order.service.ts:397-540` 撤回/审批全流程已实现，含通知。
- 前端：
  - 列表页 `frontend/src/pages/WorkOrders/index.tsx:264-289`：有"撤回""作废""催办"按钮。
  - **详情页**`frontend/src/pages/WorkOrders/Detail/index.tsx:178-194`：**无撤回/作废/催办按钮**（同 P3.6）。

---

## 三、真实缺失清单（按补强动作组织）

| # | 任务 | 当前状态 | 需补强动作 | 责任 | 优先级 | 关联问题 |
|---|---|---|---|---|---|---|
| **G-1** | 通知 count / list / dashboard 口径统一，正常派单不进消息 | count/list 未排除 dispatch | NotificationService 抽 `buildWhere(userId, options)`，list/count/countByBucket 共用；count 默认排除 dispatch | backend | **P0** | B3 |
| **G-2** | 新增 `GET /notifications/unread-count-by-bucket` | 前端调用 → 404 | controller 新增路由；service 实现按业务员/后道桶（field_changed/returned/withdraw/void/urge/sla/system） | backend | **P0** | B3 |
| **G-3** | 角色判断归一化 | userStore.hasRole 不归一化 | 改 `userStore.ts:70-80` 调 `canonicalRoleCode`；utils/permission.ts 同步；移除页面对 `business_group_member` 等的硬编码（统一引用 ROLE.\*） | frontend | **P0** | B2-c |
| **G-4** | MyDispatched 增加批量办理按钮 | 仅批量导出 | 复用 TeamDispatched 的 batchComplete 逻辑；只允许 pending/processing 行；备注必填 | frontend | **P0** | B4 |
| **G-5** | 我的工单 pending/done 路由分模式 | 复用同组件无区分 | MyDispatched 接受 mode prop 或读 useLocation；pending→`status IN (pending,processing)` 且业务员显示 returned 主工单；done→当月 completed；headerTitle/Empty 文案随 mode 改 | frontend | **P0** | P2.2 |
| **G-6** | 仪表盘"处理中"口径修正 | 仅算 processing | `dashboard.service.ts:300, 325` 改为 `status NOT IN ('completed','withdrawn','void','draft')` | backend | **P0** | P1.2 / B2-a |
| **G-7** | 停用旧 confirmImport | work-order.service.ts:962 仍存在 | 删除该方法及其路由出口；统一走 import-job preview/confirm | backend | **P0** | B1 |
| **G-8** | social_urge 字段处置 | seed/校验/AI 别名仍存在 | 选 A（推荐）：seed-fields 移除 required 或整条删除，添加 migration 停用并清理 extra_data 残值；选 B：保留但 required=false。需 Leader/产品确认 | backend | **P1** | P3.2 |
| **G-9** | 工单详情页补撤回/作废/催办按钮 | 详情页 178-194 缺失 | 复用列表页 handleWithdraw/handleVoid/handleUrge；终态不显示；用规范角色判断 | frontend | **P1** | P3.6 / R2 / R5 |
| **G-10** | 仪表盘总表按子工单 module 维度 | 按 order_type 分组 | `getOrderTypeMatrix` 增加 `dimension=node` 参数；查询从 `dispatched_orders.module_code` 分组；label 用 module_code→中文映射 | backend | **P1** | P1.4 |
| **G-11** | 仪表盘前端总表行 key 切到 moduleCode | 仍消费 orderType | `Dashboard/index.tsx` 切换列定义到 moduleCode；空表 Empty 文案 | frontend | **P1** | P1.4 |
| **G-12** | 业务负责人趋势图按 module 维度 | leader-trend 只接 orderType | `getLeaderTrend(orderType, moduleCode?, user)`；前端 Radio.Group 切换入职/在职/离职模块 | backend+frontend | **P1** | P1.3 |
| **G-13** | 团队工单模块筛选改下拉 + 中文名兼容 | 列无 valueType / 后端仅 code 精确匹配 | 前端 TeamDispatched 模块列加 `valueType:'select'`，options 来自 modules 常量；后端 applyCommonFilters 支持 moduleName/nodeType→moduleCode 映射 | backend+frontend | **P1** | B5 |
| **G-14** | 入职表单分组栅格布局 | DynamicForm 单列纵向 | DynamicForm 增加 `grouped` 模式；按 collection_group 渲染 Card+CSS Grid 3 列；长字段跨列；新建入职页启用 | frontend | **P1** | P4.1 |
| **G-15** | 批量办理 DTO 上限 | 无 ArrayMaxSize | `batch-complete.dto.ts` 添加 `@ArrayMaxSize(50)`；并补 spec 测试 | backend | **P1** | B5（关联） |
| **G-16** | 通知模板补全 | 缺撤回/作废/催办/字段变更/SLA 模板 | 补 `withdraw_request/approved/rejected`、`void_request/approved/rejected`、`urge_received`、`order.field_changed`、`sla_warning/breached` | backend | **P1** | P1.2 / R5 |
| **G-17** | 批导入 preview 返回 mappingMode | preview 已返回 confidence/missingRequired，但缺明确 mode | preview 输出 `mappingMode: standard/ai/manual_required`；confirm 前置 mapping 校验，缺映射 400 | backend | **P1** | P3.1 |
| **G-18** | 字段管理权限粒度 | 全部硬编码 admin | 引入 `field_permission.write` 等权限码；guard `@RequirePermission`；管理端能给业务负责人授权 | backend+frontend | **P2** | P4.3 |
| **G-19** | 工单流程配置一期 | 前后端均无 workflow_* | 新增 workflow_definitions/nodes/edges/action_configs 表与 CRUD；先支持节点/办理人/SLA/动作必填备注配置 | backend+frontend | **P2** | P4.2 |
| **G-20** | 情况 4 编辑后强制重派语义 | update 不改 status | 评估：编辑保存后 status 是否回退 `pending` 并重新触发 dispatch 调度。需产品确认 | backend | **P2** | R4 |

---

## 四、与现有补强方案的差异

| 上一轮文档 | 实际证据 | 差异 |
|---|---|---|
| `ARCHITECTURE_ANALYSIS_0520.md` 全部"已完成" | 10 项 ❌ + 9 项 🟡 | 文档判断不可靠，需作废 |
| `后端问题分析与整改方案-20260520.md` BE-N01~N09 | 与本清单 G-1/2/6/7/8/10/12/13/15/16/17/18/19 大量重叠 | 后端工程师定位正确，按其 9 个补强点推进即可 |
| `FRONTEND_UI_PLAN_0520.md` FE-NR-01~09 | 与本清单 G-3/4/5/9/11/12/13/14 重叠 | 前端工程师定位正确，按其 9 个补强点推进即可 |

**结论**：本次反馈的真实缺失，已被后端工程师和前端工程师各自识别（合计 18 个补强点），但**仍未着手编码**；本清单将其汇总为 **20 项补强动作 G-1~G-20**，并标注优先级和责任。

---

## 五、给 Leader 的建议执行序

按补强动作组织成 4 个批次：

**批次 1（P0，1-2 天）**：直接修复用户反馈的"显眼故障"——
- G-1, G-2, G-3, G-4, G-5, G-6, G-7

**批次 2（P1，2-3 天）**：完成功能补齐——
- G-8, G-9, G-10, G-11, G-12, G-13, G-14, G-15, G-16, G-17

**批次 3（P2，需求确认后单独评估）**：
- G-18, G-19, G-20

**批次 4（QA 验收）**：
- 按 `docs/test_cases_0518.md` + 本清单 G-* 关联问题逐条回归。
- 重点验证 B1~B5 的真实场景：业务员（旧角色 code）登录、批导入、消息计数、按模块筛选。

---

## 六、致命假设与待确认

1. **数据库角色 code 是否仍是旧值**（biz_member 等）？若是，G-3 是真正修复点；若已经全部迁移到 canonical code，B2-c 可能是其他原因。需要 QA 用真实账号截屏一次 `/me` 响应。
2. **social_urge 字段处置**：删除还是保留？需 Leader/产品决策。本清单按"删除"出方案，但提供保留选项。
3. **工单流程配置一期**（G-19）工作量较大，建议明确范围后再评估排期。
4. **趋势图维度**（G-12）：是按入职/在职/离职大类显示单线，还是按各办理事项多线？反馈文字偏向多线，前端工程师在 FRONTEND_UI_PLAN_0520.md §5.2 已提出此问题，需要产品决策。

---

**文档版本**：v1.0  
**编制日期**：2026-05-20  
**编制人**：架构师  
**下次更新**：批次 1 修复完成后复测时
