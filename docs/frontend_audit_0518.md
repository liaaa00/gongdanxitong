# 前端现状摸底报告（0518反馈整改前置）

任务 ID：`bec53483-52a1-4c81-9390-7a453e599ee2`  
调研范围：`D:\AI\SpeceAppDate\工单系统\frontend/src`  
调研方式：只读源码检索与片段读取；未修改业务代码。  
备注：终端初次输出中文乱码，经 UTF-8 读取确认源码本身为 UTF-8。以下行号以当前工作区文件为准。

---

## 0. 重要现状风险（影响后续整改优先级）

### 0.1 主工单列表文件存在重复组件/重复默认导出
- 文件：`frontend/src/pages/WorkOrders/index.tsx`
- 现状：同一文件内出现两段 `const WorkOrders: React.FC = () => { ... }` 与两次 `export default WorkOrders`。
  - 第一段：约 `48-403` 行，包含“详情/修改/撤回/作废/催办/删除”等较完整按钮。
  - 第二段：约 `430-716` 行，重新定义同名组件，只保留“详情/删除”等操作。
- 代码片段：
```tsx
// frontend/src/pages/WorkOrders/index.tsx:48,403
const WorkOrders: React.FC = () => { ... };
export default WorkOrders;

// frontend/src/pages/WorkOrders/index.tsx:430,716
const WorkOrders: React.FC = () => { ... };
export default WorkOrders;
```
- GAP/风险：同一模块重复声明/重复默认导出，正常 TS/Vite 编译应报重复标识符；后续整改前应先清理为单一组件，否则无法判断真实运行版本。

### 0.2 工单详情页也存在重复组件/重复默认导出
- 文件：`frontend/src/pages/WorkOrders/Detail/index.tsx`
- 现状：文件前半部分和后半部分均出现 `WorkOrdersDetail` 渲染逻辑与 `export default WorkOrdersDetail`。
  - 第一段导出：约 `358` 行。
  - 第二段导出：约 `755` 行，包含“工单动态”“工单进度”“流转进度链”等区域。
- 代码片段：
```tsx
// frontend/src/pages/WorkOrders/Detail/index.tsx:358
export default WorkOrdersDetail;

// frontend/src/pages/WorkOrders/Detail/index.tsx:755
export default WorkOrdersDetail;
```
- GAP/风险：同一文件重复导出和重复 UI 逻辑，需先合并/删除旧段，再按需求删除冗余动态/进度区域。

---

## 1. 仪表盘/门户（Dashboard/Portal）

### 1.1 页面主组件路径
- 文件：`frontend/src/pages/Dashboard/index.tsx`
- 路由：`frontend/src/routes/index.tsx` 中 `/dashboard` 懒加载 `@/pages/Dashboard`。
- 代码片段：
```tsx
// frontend/src/routes/index.tsx
const Dashboard = lazy(() => import('@/pages/Dashboard'));
<Route path="dashboard" element={<RoleRoute><RouteGuard moduleName="仪表盘"><Dashboard /></RouteGuard></RoleRoute>} />
```

### 1.2 现有数据卡片与字段
- 文件：`frontend/src/pages/Dashboard/index.tsx`
- 现状：按角色分三类面板：业务员、团队/主管、管理员/经理。
- 业务员卡片：`本月工单 total_orders`、`处理中 processing_orders`、`已完成 completed_orders`、`待处理 pending_orders`；附带 `last_month_total`、`last_month_completed`。
```tsx
// Dashboard/index.tsx:57-60
<Statistic title="本月工单" value={salesData?.total_orders || 0} />
<Statistic title="处理中" value={salesData?.processing_orders || 0} />
<Statistic title="已完成" value={salesData?.completed_orders || 0} />
<Statistic title="待处理" value={salesData?.pending_orders || 0} />
```
- 团队卡片：`待处理 total_pending`、`处理中 total_processing`、`今日完成 completed_today`、`本月完成 completed_this_month`。
```tsx
// Dashboard/index.tsx:97-100
<Statistic title="待处理" value={teamData?.total_pending || 0} />
<Statistic title="处理中" value={teamData?.total_processing || 0} />
<Statistic title="今日完成" value={teamData?.completed_today || 0} />
<Statistic title="本月完成" value={teamData?.completed_this_month || 0} />
```
- 管理员/经理卡片：`总工单 total_onboarding`、`已完成 completed_onboarding`、`完成率 completion_rate`、`本月新增 total_this_month`、`本月完成 completed_this_month`、`服务时限超期 sla_breach_count`。
```tsx
// Dashboard/index.tsx:134-139
<Statistic title="总工单" value={mgrData?.total_onboarding || 0} />
<Statistic title="已完成" value={mgrData?.completed_onboarding || 0} />
<Statistic title="完成率" value={mgrData?.completion_rate || 0} suffix="%" />
<Statistic title="本月新增" value={mgrData?.total_this_month || 0} />
<Statistic title="本月完成" value={mgrData?.completed_this_month || 0} />
<Statistic title="服务时限超期" value={mgrData?.sla_breach_count || 0} />
```
- GAP：反馈文档若要求统一门户卡片口径，需要对三套面板统一字段/布局；目前不同角色字段差异较大。

### 1.3 右上角今天/本周/本月切换控件
- 文件：`frontend/src/pages/Dashboard/index.tsx`
- 现状：`PERIOD_OPTIONS` + `Segmented` 放在 `PageContainer.header.extra`，位置为页面右上角。
```tsx
// Dashboard/index.tsx:15-19,175-178
const PERIOD_OPTIONS = [
  { label: '今天', value: 'today' },
  { label: '本周', value: 'week' },
  { label: '本月', value: 'month' },
];
<Segmented key="period" options={PERIOD_OPTIONS} value={period} onChange={(v) => setPeriod(v as string)} />
```
- GAP：控件已存在；但 `period` 当前主要传给 `getSalespersonDashboard({ period })`，团队/管理员接口调用未传 `period`，需核对需求是否要求所有角色联动。

### 1.4 左下角用户姓名头像微件
- 文件：`frontend/src/layouts/BasicLayout.tsx`
- 现状：使用 ProLayout `avatarProps`，标题显示 `user?.real_name || user?.username`，点击/hover 出下拉退出。
```tsx
// BasicLayout.tsx:347-351
avatarProps={{
  icon: <UserOutlined />,
  title: user?.real_name || user?.username,
  render: (_props, dom) => <Dropdown menu={avatarMenu}>{dom}</Dropdown>,
}}
```
- GAP：当前仍是头像下拉微件；未找到“左下角右侧直显”专门实现。需求“应从 hover 改为右侧直显”需改 ProLayout avatar 渲染逻辑/布局。

### 1.5 未读消息微件
- 文件：`frontend/src/layouts/BasicLayout.tsx`
- 现状：右上 actionsRender 中用 `Popover + Badge + BellOutlined` 展示未读；轮询间隔 30s。
```tsx
// BasicLayout.tsx:207-211
const count = await getUnreadCount();
const result = await getNotifications({ unread: true, page: 1, pageSize: 50 });

// BasicLayout.tsx:352-359
actionsRender={() => [
  <Popover ...>
    <Badge count={unreadCount}><BellOutlined ... /></Badge>
  </Popover>,
]}
```
- GAP：微件已存在，但只统计 `sla/task/system` 三类，未纳入 `field_change/claim`；与消息页分类不完全一致。

---

## 2. 左侧导航（SideMenu）

### 2.1 菜单配置位置
- 文件：`frontend/src/layouts/BasicLayout.tsx`
- 现状：静态常量 `RAW_MENU`，非接口返回。
```tsx
// BasicLayout.tsx:31
const RAW_MENU: MenuItem[] = [ ... ];
```
- GAP：若需求要求后台动态菜单，目前不满足；需要迁移为接口配置或至少集中配置。

### 2.2 菜单项现有路由与名称
- 文件：`frontend/src/layouts/BasicLayout.tsx`
- 现有一级/子菜单（摘录）：
  - `/dashboard`：仪表盘
  - `/work-orders`：入职管理
    - `/work-orders`：主工单列表
    - `/work-orders/new`：新建入职
    - `/onboarding/contract`：合同签订子工单
    - `/onboarding/onboarding_contact`：入职联系子工单
    - `/onboarding/data_entry`：数据录入子工单
    - `/onboarding/social_insurance`：社保公积金办理子工单
  - `/my-dispatched`：我的任务
    - `/my-dispatched`：我的子工单
    - `/team-dispatched`：部门子工单
  - `/my-field-permissions`：我的字段权限
  - `/export-templates`：导出模板
  - `/notifications`：消息通知
  - `/renewal`：续签管理（续签列表/新建续签）
  - `/resignation`：离职管理（离职列表/新建离职）
  - `/benefit`：待遇申报（申报列表/新建申报）
  - `/admin`：管理后台（用户、角色、部门、客户、模块化配置、字段配置、字段权限、派发配置、导出模板配置、智能字段映射、系统设置、操作日志、登录诊断）
- 代码片段：
```tsx
// BasicLayout.tsx:31-119
const RAW_MENU: MenuItem[] = [
  { path: '/dashboard', name: '仪表盘' },
  { path: '/work-orders', name: '入职管理', children: [...] },
  { path: '/my-dispatched', name: '我的任务', children: [...] },
  { path: '/notifications', name: '消息通知' },
  { path: '/admin', name: '管理后台', roles: ['admin'], children: [...] },
];
```
- GAP：未见“我的工单”作为菜单标题；当前是“我的任务”。若反馈文档要求“我的工单”及固定子菜单，需要重构命名和层级。

### 2.3 菜单按角色过滤逻辑位置
- 文件：`frontend/src/layouts/BasicLayout.tsx`、`frontend/src/config/routeVisibility.ts`
- 现状：菜单过滤调用 `canAccessPath(it.path, userRoles)`；部分菜单项额外声明 `roles`，但过滤函数没有直接使用 `it.roles`，主要依赖 `ROUTE_VISIBILITY`。
```tsx
// BasicLayout.tsx:121-130
function filterMenuByRoles(items, userRoles) {
  const filteredChildren = it.children?.length ? filterMenuByRoles(it.children, userRoles) : undefined;
  const selfAllowed = canAccessPath(it.path, userRoles);
  if (!selfAllowed && (!filteredChildren || filteredChildren.length === 0)) continue;
}
```
- 代码片段：
```tsx
// routeVisibility.ts:103-106
export function canAccessPath(pathname, userRoles) {
  const requiredRoles = getRequiredRolesForPath(pathname);
  if (!requiredRoles.length) return false;
  return userHasAnyCanonicalRole(userRoles, [...requiredRoles]);
}
```
- GAP：`RAW_MENU.roles` 字段与实际过滤规则存在双源但 `roles` 未被 `filterMenuByRoles` 使用，容易造成配置误判；应统一权限来源。

### 2.4 “我的工单”下现有子菜单
- 文件：`frontend/src/layouts/BasicLayout.tsx`
- 现状：当前为“我的任务”，子菜单只有：`我的子工单`、`部门子工单`。
```tsx
// BasicLayout.tsx:58-65
{ path: '/my-dispatched', name: '我的任务', children: [
  { path: '/my-dispatched', name: '我的子工单' },
  { path: '/team-dispatched', name: '部门子工单' },
]}
```
- GAP：未找到“我发起的 / 我的待办 / 我的已办 / 团队工单”四个子菜单；需新增或调整路由。

### 2.5 “主工单列表”与“新建入职”是否独立菜单项
- 文件：`frontend/src/layouts/BasicLayout.tsx`
- 现状：二者均为“入职管理”下的两个独立子菜单：`/work-orders` 与 `/work-orders/new`。
- GAP：已是独立子菜单，但“新建入职”路由权限通过别名映射到 `/work-orders/create`，需注意菜单与权限表命名不一致。

---

## 3. 工单列表页（主工单列表/部门工单等）

### 3.1 主工单列表主组件路径
- 文件：`frontend/src/pages/WorkOrders/index.tsx`
- 路由：`/work-orders`。
- 备注：如 0.1 所述，文件存在重复组件；后半段当前位于文件末尾。

### 3.2 顶部现有搜索栏字段
- 文件：`frontend/src/pages/WorkOrders/index.tsx`
- 第一段组件搜索字段（约 `335-344` 行）：客户代码、客户名称、员工姓名、证件号、状态。
```tsx
<Form.Item name="customerCode" label="客户代码" />
<Form.Item name="customerName" label="客户名称" />
<Form.Item name="employeeName" label="员工姓名" />
<Form.Item name="idCardNo" label="证件号" />
<Form.Item name="status" label="状态"><Select ... /></Form.Item>
```
- 第二段组件搜索字段（约 `654-657` 行）：客户代码、客户名称、发起人。
```tsx
<Form.Item name="customerCode" label="客户代码" />
<Form.Item name="customerName" label="客户名称" />
<Form.Item name="createdByName" label="发起人" />
```
- GAP：由于文件重复，真实搜索栏应先清理确认；若以末尾版本为准，则缺少员工姓名/证件号/状态；若以首段为准，则字段更全。后续需按反馈文档明确“保留/删除”字段。

### 3.3 列表现有操作按钮
- 文件：`frontend/src/pages/WorkOrders/index.tsx`
- 第一段组件（约 `241-308` 行）操作：详情、修改、撤回、作废、催办、删除；接口：催办 `/work-orders/{id}/urge`、撤回 `/work-orders/{id}/withdraw`、作废 `/work-orders/{id}/void`。
```tsx
<RefButton>详情</RefButton>
<RefButton>修改</RefButton>
<RefButton>撤回</RefButton>
<RefButton danger>作废</RefButton>
<RefButton>催办</RefButton>
<RefButton danger>删除</RefButton>
```
- 第二段组件（约 `600-627` 行）操作：详情、删除；批量区有批量删除。
```tsx
// WorkOrders/index.tsx:607-625
<RefButton ...>详情</RefButton>
<Popconfirm ...><RefButton danger icon={<DeleteOutlined />}>删除</RefButton></Popconfirm>
```
- GAP：实际代码存在两版按钮定义；需求中的“修改、撤回、作废、催办位置”需要以清理后的单一版本统一。当前末尾版本缺少修改/撤回/作废/催办。

### 3.4 是否有看板/表格/列配置等冗余切换按钮
- 文件：`frontend/src/components/MultiViewTable/index.tsx`、`frontend/src/components/MultiViewTable/ViewSwitcher.tsx`、`frontend/src/components/MultiViewTable/ColumnsConfigDrawer.tsx`
- 现状：主工单列表使用 `MultiViewTable`，组件顶部固定渲染视图切换、筛选视图、列配置。
```tsx
// WorkOrders/index.tsx:665-680
<MultiViewTable viewId="work-orders-main" ... kanbanColumnKey="status" ... />

// MultiViewTable/index.tsx:130-142
<ViewSwitcher value={viewMode} onChange={handleViewChange} />
<FilterViews ... />
<Button ...>列配置</Button>
```
- 视图切换按钮内容：
```tsx
// ViewSwitcher.tsx:19-28
<Radio.Button value="table">表格</Radio.Button>
<Radio.Button value="kanban">看板</Radio.Button>
<Radio.Button value="grid">网格</Radio.Button>
```
- 列配置抽屉：
```tsx
// ColumnsConfigDrawer.tsx:75-84
<Drawer title="列配置" ...>
  <Checkbox checked={!isHidden}>...</Checkbox>
</Drawer>
```
- GAP：存在“看板/网格/列配置/筛选视图”等冗余控件；若反馈要求删除，需要从 `MultiViewTable` 或调用参数中提供关闭开关。

### 3.5 部门/我的子工单列表路径
- 文件：`frontend/src/pages/MyDispatched/index.tsx`（我的子工单，路由 `/my-dispatched`）
- 文件：`frontend/src/pages/TeamDispatched/index.tsx`（部门子工单，路由 `/team-dispatched`）
- 现状：均使用 `ProTable`；主要操作：我的子工单有接单、转交、详情、批量导出；部门子工单有详情、重新分派、删除、批量完成、批量导出、批量删除。
- GAP：如果反馈要求“主工单列表/部门工单等”统一删除冗余操作，需分别处理这些页面。

---

## 4. 工单详情页

### 4.1 主组件路径
- 文件：`frontend/src/pages/WorkOrders/Detail/index.tsx`
- 路由：`/work-orders/:id`。
- 备注：如 0.2，存在重复组件/重复导出。

### 4.2 现有“工单动态”“工单进度”“流转进度链”区域
- 文件：`frontend/src/pages/WorkOrders/Detail/index.tsx`
- 现状：后半段详情页存在需求中提到需删除的区域。
```tsx
// WorkOrders/Detail/index.tsx:563
<Button icon={<AuditOutlined />} onClick={() => setActiveTab(TIMELINE_TAB_KEY)}>工单动态</Button>

// WorkOrders/Detail/index.tsx:581-589
<Card title="工单进度">
  <div>主工单状态</div>
  <Steps ... />
  <div>流转进度链</div>
  <Timeline ... />
</Card>

// WorkOrders/Detail/index.tsx:644-749
<Tabs items={[
  { key: INFO_TAB_KEY, label: '工单信息', ... },
  { key: TIMELINE_TAB_KEY, label: '工单动态', ... },
  { key: SUBORDERS_TAB_KEY, label: '子工单状态', ... },
]} />
```
- GAP：需按反馈删除“工单动态/工单进度/流转进度链”；当前均存在。

### 4.3 顶部操作区现有按钮
- 文件：`frontend/src/pages/WorkOrders/Detail/index.tsx`
- 顶部 `PageContainer`：只有“返回列表”。
```tsx
// WorkOrders/Detail/index.tsx:529
<PageContainer header={{ title: '工单详情', extra: [<Button key="back">返回列表</Button>] }}>
```
- 基本信息卡片操作区：编辑/取消编辑、重新提交、工单动态。
```tsx
// WorkOrders/Detail/index.tsx:548-564
<Button type="primary">编辑工单 / 修改工单（已完结）</Button>
<Button>取消编辑</Button>
<Button type="primary">重新提交</Button>
<Button>工单动态</Button>
```
- GAP：反馈若要求顶部操作区按钮简化，需要明确保留“返回列表/编辑/重新提交”等，删除“工单动态”入口。

---

## 5. 表单/新建入职页

### 5.1 入职单条表单主组件路径
- 页面：`frontend/src/pages/WorkOrders/New/index.tsx`
- 动态表单组件：`frontend/src/components/DynamicForm/index.tsx`
- 路由：`/work-orders/new`。

### 5.2 现有字段是否含“社保公积金未办是否需要催办”
- 文件：`frontend/src/services/fields.ts`
- 现状：默认字段清单含 `social_urge`，字段名为“社保公积金未办是否需要催办”。
```tsx
// services/fields.ts:94
{ id: '52', field_code: 'social_urge', field_name: '社保公积金未办是否需要催办', field_type: 'dropdown', ... collection_group: '社保公积金类' }
```
- 文件：`frontend/src/pages/WorkOrders/Detail/index.tsx`
- 现状：详情字段分组也包含 `social_urge`。
```tsx
// WorkOrders/Detail/index.tsx:99-100
codes: ['social_location', 'start_month', 'social_base', 'fund_base', 'fund_ratio', 'social_urge']
```
- 文件：`frontend/src/pages/Admin/ExportTemplates/index.tsx`
- 现状：导出模板字段选项也包含 `social_urge`。
```tsx
// Admin/ExportTemplates/index.tsx:96-104
{ code: 'social_urge', name: '社保公积金未办是否需要催办' }
```
- GAP：反馈要求删除该字段；需要同时清理默认字段、详情分组、导出模板字段选项、字段权限/后端字段源等。

### 5.3 表单现有布局
- 文件：`frontend/src/pages/WorkOrders/New/index.tsx`
- 现状：页面使用 `PageContainer`，上方有流程说明 `Steps`、拆分预览卡片、分组标签、客户选择、再渲染统一 `DynamicForm`；底部为“保存草稿/提交并拆分工单/返回列表”。
```tsx
// WorkOrders/New/index.tsx:201-203
<PageContainer header={{ title: '新建入职工单', subTitle: '填写入职信息采集表 · 系统根据流程判断项自动拆分为子工单' }}>

// WorkOrders/New/index.tsx:257-263
<span>采集分组：</span>
<Tag>{g}（{fieldGroups[g].length}个字段）</Tag>

// WorkOrders/New/index.tsx:272-293
<Form.Item label="客户" required> <Select ... /> </Form.Item>
<DynamicForm fields={allFields} fieldPermissions={permissions} ... />
```
- 文件：`frontend/src/components/DynamicForm/index.tsx`
- 现状：`DynamicForm` 为 `ProForm layout="vertical"`，按 `display_order` 排序平铺字段；未在表单内部按分组块渲染，仅过滤入职可见分组。
```tsx
// DynamicForm/index.tsx:68,110-119,253-270
const ONBOARDING_VISIBLE_GROUPS = ['基本信息', '劳动合同签订', '入职联系', '发薪信息', '社保公积金类'];
return filtered.sort((a, b) => a.display_order - b.display_order);
<ProForm layout="vertical">{sortedFields.map(renderField)}</ProForm>
```
- GAP：当前分组只作为标签说明，字段主体没有分组卡片/多列布局；后续 UI 优化可在 `DynamicForm` 或新建页外层按 `collection_group` 分块。

---

## 6. 管理员配置页

### 6.1 表单模板配置页路径
- 未找到明确名为“表单模板配置”的页面。
- 接近页面：`frontend/src/pages/Admin/ModuleConfig/index.tsx`（菜单名“模块化配置”，路由 `/admin/module-config`）。
- 现状：仅模块启用/禁用，不是字段表单模板设计器。
```tsx
// Admin/ModuleConfig/index.tsx:87-104
<PageContainer header={{ title: '模块化配置' }}>
<ProTable headerTitle="模块列表" ... />
```
- GAP：如需求中的“表单模板配置”是独立能力，目前未找到；需新增或明确与“字段配置/模块化配置”的关系。

### 6.2 字段管理页路径
- 文件：`frontend/src/pages/Admin/Fields/index.tsx`
- 路由：`/admin/fields`。
- 现状：字段配置列表，支持工单类型/来源分类/子工单范围/采集分组筛选，新建/编辑/删除字段。
```tsx
// Admin/Fields/index.tsx:115-123
<PageContainer header={{ title: '字段配置' }} extra={[
  <Select placeholder="工单类型" />,
  <Select placeholder="来源分类" />,
  <Select placeholder="子工单范围" />,
  <Select placeholder="采集分组" />,
  <Button>新建字段</Button>,
]}>
```
- GAP：字段管理页存在；若要删除 `social_urge`，这里也需从数据源/列表处理。

### 6.3 导出模板配置页路径与字段选择控件
- 文件：`frontend/src/pages/Admin/ExportTemplates/index.tsx`
- 路由：`/admin/export-templates`。
- 现状：模块选择为 `Select`；字段选择已经是左侧分组 `Checkbox` 勾选 + 右侧已选字段别名/上下移动，不是单一下拉框。
```tsx
// Admin/ExportTemplates/index.tsx:240-242
<Form.Item name="module_code" label="适用模块"><Select options={MODULE_GROUPS as any} /></Form.Item>

// Admin/ExportTemplates/index.tsx:248-263
<Divider>选择导出字段（勾选后可调整顺序和别名）</Divider>
<Checkbox checked={selectedFields.some(...)} onChange={() => toggleField(f.code, f.name)}>
  {f.name}
</Checkbox>
```
- GAP：需求“字段选择控件现为下拉框，需改列表勾选”与当前源码不完全一致；当前字段选择已为列表勾选。仍需检查运行页面是否加载了旧构建或另一个导出模板页。

### 6.4 是否已存在“工单流程配置”页
- 检索范围：`frontend/src/pages`、`frontend/src/routes`、`frontend/src/layouts`、`frontend/src/services`
- 结果：未找到“工单流程配置”页面；`routeVisibility.ts` 中有 `/admin/approval-flows` 权限项，但路由与菜单未实现。
```tsx
// routeVisibility.ts:45
'/admin/approval-flows': ['admin'],
```
- GAP：需新增页面、菜单、路由和接口联调；当前仅有派发配置 `/admin/dispatch-config`。

---

## 7. 消息通知页

### 7.1 现有路由与页面路径
- 页面：`frontend/src/pages/Notifications/index.tsx`
- 路由：`/notifications`，在 `frontend/src/routes/index.tsx` 懒加载。
- 菜单：`frontend/src/layouts/BasicLayout.tsx` 中 `/notifications`。

### 7.2 是否按类型分类展示
- 文件：`frontend/src/pages/Notifications/index.tsx`
- 现状：顶部 `Tabs` 按 `all/sla/task/system/field_change` 分类；列表列中 `biz_type` 显示服务时限告警、任务、系统、变更、认领。
```tsx
// Notifications/index.tsx:138-144
const tabItems = [
  { key: 'all', label: '全部' },
  { key: 'sla', label: '服务时限' },
  { key: 'task', label: '任务' },
  { key: 'system', label: '系统' },
  { key: 'field_change', label: '变更' },
];

// Notifications/index.tsx:91-95
const labels = { sla: '服务时限告警', task: '任务', system: '系统', field_change: '变更', claim: '认领' };
```
- GAP：页面分类缺少 `claim` 标签页，但列表支持显示 `claim`；右上角布局微件只统计 `sla/task/system`，与消息页分类不一致。

### 7.3 未读计数与详情页使用的接口路径（BUG-3）
- 文件：`frontend/src/services/notifications.ts`
- 接口路径：
```ts
// services/notifications.ts:70-119
GET  /notifications
POST /notifications/{id}/read
POST /notifications/read-all
DELETE /notifications/{id}
GET  /notifications/unread-count
GET  /notifications/unread-by-type
```
- 文件：`frontend/src/pages/Notifications/index.tsx`
- 未读计数：先调 `getUnreadCount()`，再调 `getNotifications({ unread: true, page: 1, pageSize: 100 })` 自行按类型统计。
```tsx
// Notifications/index.tsx:28-40
const count = await getUnreadCount();
const result = await getNotifications({ unread: true, page: 1, pageSize: 100 });
setUnreadByType({ ... });
```
- 详情：点击行打开本地 `Modal`；关联工单跳转 `navigate(`/work-orders/${target}`)`。
```tsx
// Notifications/index.tsx:73-87
setDetailItem(record); setDetailOpen(true);
if (!record.is_read) handleMarkRead(record.id);
navigate(`/work-orders/${target}`);
```
- GAP：服务层已有 `getUnreadCountByType()` 但页面未使用；未读分类统计依赖拉取前 100 条未读，数据多时可能不准。关联跳转用 `ref_order_id || order_no` 拼 `/work-orders/{target}`，若传 order_no 而详情接口只支持 id，会触发 BUG-3 类问题。

---

## 8. 菜单/路由权限现状

### 8.1 前端是否以 RBAC 控制菜单可见性
- 是。路径：`frontend/src/layouts/BasicLayout.tsx` + `frontend/src/config/routeVisibility.ts` + `frontend/src/constants/roles.ts`。
- 菜单：`filterMenuByRoles()` 使用 `canAccessPath()` 过滤。
- 路由：`RoleRoute` 使用 `canAccessPath(location.pathname, user.roles)` 拦截到 `/403`。
```tsx
// routes/index.tsx
if (!canAccessPath(location.pathname, user.roles)) return <Navigate to="/403" replace />;

// BasicLayout.tsx
const filteredMenu = useMemo(() => filterMenuByRoles(RAW_MENU, user?.roles), [user?.roles]);
```
- GAP：RBAC 逻辑存在，但菜单静态 `roles` 字段未参与过滤；权限路径与实际路由通过 `LEGACY_ROUTE_ALIASES` 兼容，维护成本高。

### 8.2 现有角色枚举与后端是否一致
- 文件：`frontend/src/constants/roles.ts`
- 前端规范角色 8 个：
```ts
admin,
business_owner,
business_group_leader,
business_group_member,
data_entry_leader,
shared_team_owner,
labor_contract_member,
onboarding_resignation_member
```
- 文件：`frontend/src/constants/roles.ts` 同时兼容旧后端种子：
```ts
biz_manager -> business_owner
biz_leader -> business_group_leader
biz_member -> business_group_member
shared_leader -> shared_team_owner
contract_specialist -> labor_contract_member
onboarding_specialist -> onboarding_resignation_member
```
- 文件：`frontend/src/services/auth.ts` 与 `frontend/src/services/roles.ts` mock seed 也使用 8 个核心角色。
- GAP：前端已做新旧角色 code 归一化，理论上可兼容后端旧种子；但需后端确认真实返回是否仅限这些 code。若后端新增角色或返回中文名/ID 权限，前端 `canAccessPath` 仍基于 `role.code`，可能无法识别。

---

## 9. 后续整改建议清单（给架构规划使用）

1. **先处理阻断风险**：清理 `WorkOrders/index.tsx` 与 `WorkOrders/Detail/index.tsx` 的重复组件/重复默认导出，确定唯一真实 UI。
2. **菜单重构**：将“我的任务”调整为反馈要求的“我的工单”结构，并补齐“我发起的/我的待办/我的已办/团队工单”路由或筛选视图。
3. **列表简化**：主工单列表如果继续用 `MultiViewTable`，需提供关闭 `ViewSwitcher/FilterViews/ColumnsConfigDrawer` 的参数，或改回普通 `ProTable`。
4. **详情简化**：删除“工单进度”“流转进度链”“工单动态”按钮/Tab/Timeline，保留必要基础信息和编辑/重新提交能力。
5. **字段删除**：`social_urge` 至少涉及 `services/fields.ts`、`WorkOrders/Detail` 字段分组、`Admin/ExportTemplates` 字段选项，另需同步后端字段和字段权限配置。
6. **管理员新增页**：未找到“工单流程配置”页；需新增路由、菜单、页面与接口。
7. **消息 BUG-3**：统一未读计数接口，优先使用 `/notifications/unread-by-type`；关联跳转应确保使用工单 `id`，不要把 `order_no` 当详情 id。
