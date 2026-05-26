# 新一轮反馈前端问题摸底与 UI/交互方案（2026-05-20）

> 角色：前端工程师  
> 输入文档：
> - `E:\DeskTop\工单办理流程及各种情况处理规则.docx`
> - `E:\DeskTop\工单管理系统测试问题反馈0518.docx`

## 0. 文档与截图读取情况

- 两个 docx 均可读取。
- 规则文档读取到 30 行文字，无内嵌图片。
- 反馈文档读取到 48 行文字、25 个媒体对象；其中 24 张 PNG 截图可清晰读取，1 个 0KB/不可读媒体对象不影响需求理解。
- 关键截图已识别：用户姓名直显、仪表盘总表样式、菜单层级、详情页进度链删除、搜索栏字段、表单 3 列布局、导出模板字段多选下拉问题、通知空记录、后道待办批量办理、共享负责人模块筛选。

## 1. 反馈问题与上一轮 FE-01~FE-13/当前代码映射

| 反馈域 | 上一轮/当前覆盖情况 | 当前前端现状 | 结论 |
|---|---|---|---|
| 仪表盘 4 卡片、取消周期选择 | FE-05 已做主结构 | `frontend/src/pages/Dashboard/index.tsx` 已无周期选择，顶部 4 卡片调用 `/dashboard/cards` | 基础布局已解决 |
| 仪表盘总表 | FE-05 已做“工单类型总表” | 当前 `/dashboard/order-type-matrix` 按主工单类型（入职/续签/离职/待遇）统计；截图要求按子工单/办理事项（入职联系、劳动合同签订、数据录入、社保公积金办理等）统计 | **需补强** |
| 业务负责人趋势图 | FE-05 已做趋势图 | `LeaderTrendChart` 当前按主工单类型切换；反馈文字要求按入职/在职/离职模块中的各项工单完成率趋势 | **需与后端口径再对齐，前端可能需调整维度** |
| 导航栏按角色 | FE-02 已做 | `BasicLayout.tsx` 已有“仪表盘/入职/在职/离职/我的工单/消息通知/管理后台”结构，非管理员不显示管理后台 | 基本解决 |
| 我的工单 4 子菜单 | FE-02/FE-08 已做入口 | `BasicLayout.tsx` 已有“我发起的/我的待办/我的已办/团队工单”；但 `/my-work/pending` 与 `/my-work/done` 复用 `MyDispatched`，页面未按路由区分待办/已办 | **需补强** |
| 主工单列表与新建合并 | FE-02/FE-06 已做 | `WorkOrders/index.tsx` 仍显示“主工单列表”标题，但新建/批导入已在同页 toolbar；旧多视图配置按钮已关闭 | 基本解决，标题可再优化 |
| 工单列表搜索栏 | FE-06 已做 | 已有客户代码、客户名称、员工姓名、证件号、状态 5 字段 | 已解决 |
| 删除表格/看板/网格/列配置 | FE-06 已做 | `MultiViewTable` 仍被使用，但 `proTableOptions=false`、`proTableToolBarRender=false`，截图中的切换控件通常不会显示 | 基本解决，需回归确认运行态 |
| 列表业务员操作按钮 | FE-06 已做 | 列表有详情/修改/撤回/作废/催办，终态隐藏，删除仅 admin | 基本解决 |
| 详情页操作按钮 | FE-07/FE-06 相关 | `WorkOrders/Detail/index.tsx` 已删除“工单动态/工单进度/流转进度链”，但详情页只保留编辑/重新提交，没有撤回/作废/催办入口 | **需补强** |
| 详情页进度链删除 | FE-07 已做 | 当前详情仅保留“子工单状态”卡片，无旧 Steps/Timeline | 已解决 |
| 删除 social_urge 字段 | FE-13 已做 | 前端 `rg social_urge` 未命中；导出模板和字段列表已移除该字段 | 已解决 |
| 管理员导出模板字段选择 | FE-16/当前代码已实现 | `Admin/ExportTemplates/index.tsx` 已改为左侧字段 Checkbox + 右侧排序/别名，不再是多选下拉 | 已解决 |
| 入职表单排版优化 | FE-14/当前未充分体现 | `DynamicForm` 仍是单列纵向 ProForm 渲染，未按截图做分组 Card + 3 列栅格 | **需补强** |
| 字段管理权限给非管理员 | FE-15/当前部分 | 有 `/my-field-permissions` 只读路由给 admin/business_owner，但后台字段配置/字段权限仍 admin 菜单和路由独占 | **需产品/后端确认授权口径后补强** |
| BUG：业务员导入后显示“共享团队视角” | FE-09/角色规范化相关 | `BasicLayout` 使用规范角色；但 `WorkOrders`、`TeamDispatched` 等页面仍用 store 原始 `hasRole`，旧角色 `biz_member` 可能被误判，导致业务员落入默认“共享团队视角” | **需补强** |
| BUG：子工单未派发状态 | BE-14/FE-09 相关 | 前端无子单时显示“未派发”；若导入后未生成子单是后端/数据问题，若只是状态文案则前端可用中央字典兜底 | 需联调验证 |
| BUG：消息有数无记录 | FE-04/FE-10 已做分类 | 铃铛 Tabs 已按角色分桶；仍需 QA 对 count/list 参数一致性回归 | 前端低风险，偏联调 |
| BUG：后道待办无批量办理 | FE-08/FE-17 部分 | `TeamDispatched` 和 `OnboardingModule` 有批量完成；但反馈指向个人“我的待办”页面 `MyDispatched`，当前只有批量导出 | **需补强** |
| BUG：共享负责人模块筛选 | FE-08/FE-17 部分 | `TeamDispatched` 有模块列，但未提供固定模块下拉，普通输入不友好；服务层支持 `module_code`，后端也兼容 `moduleCode/module_code` | **需补强 UI** |

## 2. UI/交互方案

### 2.1 仪表盘 UI 重构方案

**保留已有：**
- 顶部 4 卡片：本月工单总数、处理中、已完成、我的消息。
- 取消周期选择器，默认展示当月。
- 点击“我的消息”跳转消息通知。

**调整点：**
1. 将当前“工单类型总表”从主工单类型口径调整为“办理事项/子工单类型”口径：
   - 入职：入职联系、劳动合同签订、数据录入、社保公积金办理。
   - 在职：劳动合同续签、待遇申报/社保公积金相关事项（以后台模块配置为准）。
   - 离职：离职材料收集、离职证明、数据录入/社保停保等（以后台模块配置为准）。
2. 表格列保持截图格式：`工单类型 / 当月工单总数 / 处理中 / 已完成 / 完成率`。
3. 业务负责人/管理员可显示趋势图：建议顶部用 `Radio.Group` 切换“入职/在职/离职”，图中展示该模块内各办理事项的月度完成率；如果后端只返回单条趋势，则前端先按当前主工单类型展示，后续迭代为多线图。
4. 对后道角色，总表应默认按“本人/本团队可办理模块”展示，不应空表。

### 2.2 导航栏与“我的工单”方案

1. 菜单结构保留当前 `BasicLayout`：
   - 仪表盘
   - 入职管理 / 在职管理 / 离职管理
   - 我的工单：我发起的、我的待办、我的已办、团队工单
   - 消息通知
   - 管理后台（仅 admin）
2. 修复所有页面的角色判断：统一使用 `canonicalRoleCodes` 或 `userHasAnyCanonicalRole`，不要再直接用原始 `hasRole('business_group_member')` 判断业务角色。
3. `my-work` 四视图不要只复用同一页面默认行为：
   - 我发起的：业务团队可见，默认当月，支持按派发所属月份查询。
   - 我的待办：后道显示 `pending/processing`；业务员显示被退回且需处理的主工单；不按月份限制。
   - 我的已办：后道显示本人当月已完成子工单。
   - 团队工单：组长/负责人可见，按团队或可管理模块过滤。

### 2.3 工单详情模块方案

1. 顶部基础信息卡片保留，按钮区统一为：
   - 返回列表。
   - 详情/查看（只读状态下）。
   - 编辑/保存/取消。
   - 重新提交（仅退回态）。
   - 撤回、作废、催办（业务员/发起人、非终态）。
2. 终态（已完成/已办结、已撤回、已作废）只允许查看，不显示编辑、撤回、作废、催办。
3. 继续删除旧“工单动态”“工单进度”“流转进度链”，仅保留子工单状态卡片用于必要状态说明。
4. 字段变更/补充内容需要高亮时，优先复用现有 dirty_fields/has_unread_dirty 机制，在字段展示区以 Tag 或背景色标记。

### 2.4 管理员配置界面方案

1. 入职单条录入表单改为分组 Card + 响应式 3 列栅格：
   - 基础信息、合同信息、薪资与发薪、社保公积金、银行与备注、后道反馈。
   - PC 端 3 列，窄屏 1~2 列。
   - 长字段（现住地址、户籍地址、备注）可跨 2~3 列。
2. 导出模板配置保持当前 Checkbox 列表方案，并补充搜索/全选/按分组折叠（增强项）。
3. 字段管理权限若要给非管理员，需先明确哪些角色可配置、可配置哪些字段范围；前端再开放菜单和路由。

### 2.5 BUG 修复方案

1. 子工单状态显示：前端保持中央状态字典；“未派发”仅在 `dispatched_orders.length === 0` 时显示，若后端返回 pending/processing 必须显示真实状态。
2. 批量办理：在 `MyDispatched` 表格勾选后增加“批量完成”按钮，复用 `batchCompleteDispatchedOrders(ids, remark)`，仅允许未完成/未退回记录。
3. 共享负责人模块筛选：模块筛选改成 Select，选项来自固定模块常量/后端可访问模块；请求同时传 `module_code`，必要时兼容 `moduleCode`。
4. 业务员视角误判：所有页面统一角色归一化，避免旧角色 code 导致视角 fallback 到“共享团队视角”。

## 3. 可执行任务卡

### FE-NR-01 仪表盘总表改为办理事项/子工单类型口径

- 优先级：P1
- 影响文件：`frontend/src/pages/Dashboard/index.tsx`、`frontend/src/services/dashboard.ts`
- 后端依赖：需要 `/dashboard/order-type-matrix` 改为返回 module/sub-ticket 维度，或新增 `/dashboard/module-matrix`。
- 实施要点：
  1. Row key 从 `orderType` 改为 `moduleCode`。
  2. label 使用 `getModuleLabel`。
  3. 表格列保持 `工单类型/当月工单总数/处理中/已完成/完成率`。
  4. 后道角色空表时显示可解释 Empty 文案。
- 验收：业务员/业务组长/业务负责人/后道登录，表格行符合各自数据范围；截图中的 4 类入职办理事项可按当月统计。

### FE-NR-02 业务负责人趋势图维度对齐

- 优先级：P2
- 影响文件：`Dashboard/index.tsx`、`services/dashboard.ts`
- 后端依赖：趋势接口需明确返回主工单类型单线，还是子工单类型多线。
- 实施要点：
  1. 保留入职/在职/离职切换。
  2. 若返回多 series，前端渲染多线图/图例；若返回单 series，保持当前折线但文案说明口径。
- 验收：业务负责人可看到最近 12 个月完成率趋势，切换模块不报错。

### FE-NR-03 “我的工单”四视图行为拆分

- 优先级：P0
- 影响文件：`frontend/src/routes/index.tsx`、`frontend/src/pages/MyDispatched/index.tsx`、`frontend/src/pages/WorkOrders/index.tsx`
- 实施要点：
  1. 给 MyDispatched 增加 `mode=pending|done` 或通过 `useLocation` 判断路由。
  2. `/my-work/pending` 默认查待办，不限制月份。
  3. `/my-work/done` 默认查本人当月已完成。
  4. `/my-work/initiated` 默认本人当月发起，并提供工单派发所属月份筛选。
  5. 页面标题、headerTitle、空状态文案随 mode 改变。
- 验收：点击四个子菜单得到不同数据范围和标题；我的待办与我的已办不再展示同一列表。

### FE-NR-04 个人待办增加批量办理/批量完成

- 优先级：P0
- 影响文件：`frontend/src/pages/MyDispatched/index.tsx`、`frontend/src/services/dispatchedOrders.ts`
- 后端依赖：已有 `POST /dispatched-orders/batch-complete`。
- 实施要点：
  1. 表格勾选后除“批量导出”外增加“批量完成”。
  2. 只允许 `pending/processing` 且当前用户可操作的记录；completed/returned 禁用。
  3. 弹窗填写必填办理备注，提交后 reload。
  4. 复用 `TeamDispatched` 的 skipped/success 提示逻辑。
- 验收：后道办理人员在“我的待办”勾选多条可一次完成，成功/跳过数量提示清晰。

### FE-NR-05 工单详情页补齐撤回/作废/催办按钮

- 优先级：P1
- 影响文件：`frontend/src/pages/WorkOrders/Detail/index.tsx`
- 实施要点：
  1. 复用列表页权限规则，但用规范角色判断。
  2. 非终态且当前用户为发起人/业务员时显示编辑、撤回、作废、催办。
  3. 已完成/已撤回/已作废只显示查看。
  4. 调用 `/work-orders/:id/withdraw`、`/work-orders/:id/void`、`/work-orders/:id/urge` 后刷新详情。
- 验收：同一条工单在列表和详情页可见操作一致；终态不显示操作按钮。

### FE-NR-06 全局角色判断归一化，修复业务员误显示“共享团队视角”

- 优先级：P0
- 影响文件：`frontend/src/stores/userStore.ts`、`frontend/src/hooks/useAuth.ts`、`WorkOrders/index.tsx`、`TeamDispatched/index.tsx`、`MyDispatched/index.tsx` 等使用 `hasRole` 的页面。
- 实施要点：
  1. store 的 `hasRole/hasAnyRole` 内部调用 `canonicalRoleCode`。
  2. 页面判断统一使用 `ROLE.*` 常量。
  3. 保留旧 code 兼容：`biz_member/biz_leader/biz_manager/shared_leader/contract_specialist/onboarding_specialist/social_security_team`。
- 验收：旧角色 code 登录也能显示正确业务员/组长/负责人视角；不会 fallback 到共享团队视角。

### FE-NR-07 入职单条录入表单分组栅格布局

- 优先级：P1
- 影响文件：`frontend/src/components/DynamicForm/index.tsx`、`frontend/src/pages/WorkOrders/New/index.tsx`
- 实施要点：
  1. DynamicForm 增加 `grouped`/`layoutMode` 能力。
  2. 按 `collection_group` 渲染 Card/Divider。
  3. 使用 CSS Grid：`repeat(3, minmax(0, 1fr))`，移动端降到 1 列。
  4. 对地址、备注、textarea 等字段设置跨列。
- 验收：新建入职页面排版接近截图，字段不再单列拖很长；表单校验和提交不回归。

### FE-NR-08 团队工单模块筛选改为下拉并稳定传参

- 优先级：P1
- 影响文件：`frontend/src/pages/TeamDispatched/index.tsx`、`frontend/src/services/dispatchedOrders.ts`
- 实施要点：
  1. 模块列配置 `valueType: 'select'` 或自定义 search FormItem。
  2. 选项为可读中文：入职联系、劳动合同签订、数据录入、社保公积金办理等。
  3. 请求参数传 `module_code`；如后端需要，服务层兼容转成 `moduleCode`。
- 验收：共享负责人江璐按模块筛选合同/入职联系均能返回对应数据，无需手输模块码。

### FE-NR-09 字段配置/字段权限非管理员开放策略确认与前端接入

- 优先级：P2
- 影响文件：`BasicLayout.tsx`、`routeVisibility.ts`、`routes/index.tsx`、`Admin/FieldPermissions`、`Admin/Fields`
- 后端依赖：需明确非管理员角色和接口权限。
- 实施要点：
  1. 若仅查看，保留 `/my-field-permissions`。
  2. 若可配置，新增“配置管理/字段权限”非 admin 菜单，并按角色限制可编辑范围。
  3. 页面内区分只读/可编辑状态。
- 验收：被授权非管理员能进入并配置允许范围；未授权角色菜单不可见且直输 403。

## 4. 建议实施顺序

1. P0：FE-NR-06 角色归一化、FE-NR-03 我的工单四视图拆分、FE-NR-04 个人待办批量完成。
2. P1：FE-NR-05 详情页按钮、FE-NR-01 仪表盘总表口径、FE-NR-08 模块筛选、FE-NR-07 表单布局。
3. P2：FE-NR-02 趋势多维图、FE-NR-09 非管理员字段配置。

## 5. 需要与后端/产品确认的问题

1. 仪表盘“总表”最终统计口径是主工单类型还是子工单/办理事项？截图明显偏子工单类型。
2. 业务负责人趋势图是否要求多线展示各办理事项，还是仅按入职/在职/离职主模块单线展示？
3. “我的已办”是否只显示当月，是否需要月份筛选？反馈文字为当月。
4. 非管理员可配置字段权限的具体角色和范围是什么？是否允许改全局配置，还是只允许本团队/本模块？
5. 批量完成是否所有后道角色都可用，还是仅某些模块（数据录入/共享负责人）可用？当前后端接口支持通用批量完成，但权限需以后端为准。
