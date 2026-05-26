# P4 验收脚本准备与全量回归用例清单（2026-05-20）

> 角色：测试工程师  
> 任务：G-18/G-19/G-20/G-21 验收脚本准备 + 全量回归用例梳理  
> 产物：`docs/VERIFICATION_CHECKLIST_P4_0520.md`、`docs/scripts/p4_smoke.http`  
> 纪律：本文只准备验收用例与 HTTP 自检脚本，不启动服务、不执行测试、不修改业务代码。

---

## 0. 覆盖来源与总数

### 0.1 输入文档

- `docs/E2E_TEST_PLAN_0520.md`
- `docs/VERIFICATION_CHECKLIST_0520.md`
- `docs/TEST_PLAN_0518_INCREMENTAL.md`
- `docs/FINAL_COMPLIANCE_REPORT_0520.md`

### 0.2 本文用例计数

| 范围 | 用例数 | 说明 |
|---|---:|---|
| 环境与数据准备 | 7 | 账号、Token、测试数据、导入文件、权限边界、终态数据、截图记录准备 |
| G-18 字段管理权限 | 4 | admin/非 admin 接口、菜单可见性、路由 guard |
| G-19 工单流程配置 | 4 | CRUD、版本发布、创建工单实际走配置、可视化编辑器交互 |
| G-20 导出模板 + 门户配置权限 | 4 | 导出模板菜单/API、门户配置菜单/API 双 guard |
| G-21 编辑必须重新提交 | 3 | 业务员编辑后状态、审批链/待办重置、UI 提示 |
| 反馈文档 26 问题全量回归 | 26 | 24 PASS + 2 NOT_VERIFIED 全部重新跑 |
| 6 类工单流程 R1~R6 | 6 | 重点 R4 编辑流转 |
| 5 个 BUG B1~B5 | 5 | 历史 BUG 根除复测 |
| **合计** | **59** | 后续真实执行时逐条记录 PASS/FAIL 和证据 |

### 0.3 统一环境变量

真实执行前准备以下变量，HTTP 自检脚本见 `docs/scripts/p4_smoke.http`：

```text
BASE_URL=http://localhost:3000/api
FRONTEND_URL=http://localhost:5173
ADMIN_TOKEN=<管理员 JWT>
SALES_TOKEN=<业务员 JWT>
NON_ADMIN_TOKEN=<普通非管理员 JWT>
BACKOFFICE_SUPERVISOR_TOKEN=<后道主管 JWT>
BACKOFFICE_HANDLER_TOKEN=<后道办理人员 JWT>
SHARED_OWNER_TOKEN=<共享负责人 JWT>
FIELD_MANAGER_TOKEN=<如产品允许字段管理授权给非管理员，则为被授权非管理员 JWT；若本轮要求仅管理员，则该账号也应 403>
RUN_ID=P4-0520-<时间戳>
```

### 0.4 必要工具与数据准备清单

- 工具：REST Client / Postman / curl、浏览器、截图工具、测试账号 Token、可访问测试库的只读核验方式。
- 账号：管理员、业务员、普通非管理员、后道主管、后道办理人员、共享负责人、入职联系专员、社保专员、合同专员、数据录入岗。
- 数据：
  - 入职、在职、离职、社保公积金办理各至少 5 条。
  - pending、processing、returned、completed、withdraw_pending、withdrawn、void_pending、void 终态/非终态数据。
  - R4 专用处理中工单：至少 1 个子单未完成、1 个后道已开始但未完成。
  - 导入 Excel：标准模板、非标准表头模板、缺必填/格式错误混合模板。
  - 权限边界：普通非管理员无字段/流程/导出/门户配置权限；管理员全量权限；共享负责人仅有部分模块授权。
- 证据：每条用例需保留请求/响应、页面截图、数据库/接口状态、失败日志。

### 0.5 通用 PASS/FAIL 规则

- PASS：前端菜单不可见/可见、路由 guard、后端接口 guard 三层一致；接口状态码、业务状态、通知、时间线、列表数据均符合预期。
- FAIL：任一权限越权、状态机跳转不一致、编辑后未重新提交、流程配置未生效、消息 count/list 不一致、导入缺必填仍成功、终态仍可操作。
- 条件 PASS：仅当 Leader/产品书面确认某增强项延期，且不影响 P0/P1 业务主流程；本次 G-18~G-21 若已被要求实现，不建议再标条件 PASS。

---

## 1. 环境与数据准备用例（7 条）

| 用例 ID | 前置数据 | 操作步骤 | 预期结果 | 关联问题/任务编号 | PASS 判据 |
|---|---|---|---|---|---|
| P4-SETUP-01 账号 Token 有效性 | 已创建 admin、sales、non_admin、backend_supervisor、backend_handler、shared_owner、field_manager 账号 | 逐个调用 `GET /auth/me`；记录 userId、roles、department/module 范围 | 所有 Token 均 200；roles 与预期一致；业务员不被识别为共享负责人 | SETUP / B2-c | 角色 canonical 后仍与业务身份一致，无共享团队视角误判 |
| P4-SETUP-02 管理端基础权限基线 | admin 与 non_admin 已登录 | 分别访问 `/admin/fields`、`/admin/workflows`、`/admin/export-templates`、`/admin/system-settings` | admin 可见；non_admin 不可见或无权页 | G-18/G-19/G-20 | 菜单、路由、接口三层后续可基于该基线验证 |
| P4-SETUP-03 工单状态数据池 | 至少 8 种主工单状态各 1 条 | 查询主工单列表并按状态筛选；记录工单 ID | 每种状态均可定位；本人/非本人数据区分清楚 | R1~R6 / Q15 | 可支撑终态守卫、撤回、作废、重提测试 |
| P4-SETUP-04 R4 专用处理中工单 | 业务员已提交入职工单，至少 1 个子单 pending/processing 且未 completed | 记录主工单 ID、子单 ID、当前 handler、审批/时间线快照 | 工单处于 processing，允许业务员编辑关键字段 | G-21 / R4 / F04 | 编辑前后可对比状态、子单、通知、时间线 |
| P4-SETUP-05 流程配置测试数据 | admin 可访问流程配置；orderType=onboarding | 准备流程定义 JSON：start、data_entry、contract、end 节点及 edges | JSON 符合后端 DTO 和前端可视化编辑器结构 | G-19 / Q19 | 可用于创建、更新、发布和新建工单生效验证 |
| P4-SETUP-06 导入文件准备 | 三类 Excel fixture 已放置 | 标准模板、AI/规则映射模板、缺必填混合模板各 1 份 | 文件可上传，行号和字段便于断言 | Q11/Q22/B1 | 后续导入用例可复用，不需临时造数据 |
| P4-SETUP-07 证据归档目录 | QA 本地或测试平台有证据目录 | 为每条用例准备截图/响应保存命名规范：`P4-<caseId>-<role>-<timestamp>` | 后续执行证据可追踪 | 全量回归 | 每个失败项能定位到账号、请求、响应、截图 |

---

## 2. G-18 字段管理权限验收（4 条）

> 本轮用户最新口径为“字段管理权限只授权给管理员”。因此本节按“仅 admin 可见可操作；非 admin 不显示菜单、路由/API 均拦截”验收。若后续产品重新决定允许非管理员授权，应把 `FIELD_MANAGER_TOKEN` 改为被授权账号并重新定义 PASS 条件。

| 用例 ID | 前置数据 | 操作步骤 | 预期结果 | 关联问题/任务编号 | PASS 判据 |
|---|---|---|---|---|---|
| P4-G18-01 admin 字段管理接口 | admin Token；至少存在 1 个字段配置 | admin 调用 `GET /admin/fields?page=1&pageSize=20`、`GET /admin/field-permissions/matrix`；如需写接口，使用测试字段调用 `POST /admin/field-permissions/batch` | admin 接口 200；能读取字段与权限矩阵；写操作仅影响测试字段/测试角色 | G-18 / P4.3 / Q20 | HTTP 200；响应含字段列表/矩阵；无 403；审计日志可追踪 |
| P4-G18-02 非 admin 字段管理接口拒绝 | 普通非管理员 Token；不得拥有 admin 角色 | 使用 non_admin 调用 `GET /admin/fields`、`GET /admin/field-permissions/matrix`、`POST /admin/field-permissions/batch` | 全部返回 401/403 或业务无权错误；不返回字段配置详情 | G-18 / P4.3 / Q20 | 任一非 admin 可读取/写入字段管理即 FAIL；响应不泄露敏感字段配置 |
| P4-G18-03 字段管理菜单可见性 | admin 与 non_admin 均可登录前端 | admin 打开左侧菜单；non_admin 打开左侧菜单；搜索“字段配置/字段权限/我的字段权限” | admin 显示字段配置、字段权限；非 admin 不显示字段管理相关菜单 | G-18 / Q20 | 截图证明 admin 可见、非 admin 不可见；刷新后仍一致 |
| P4-G18-04 字段管理路由 guard | 已登录 admin/non_admin 浏览器 | admin 直达 `/admin/fields`、`/admin/field-permissions`；non_admin 直达同 URL；如存在 `/my-field-permissions` 也需验证 | admin 正常进入；non_admin 被重定向到无权页/首页或显示 403；不渲染管理表格 | G-18 / FE route guard | URL 直达不能绕过菜单；前端 guard 与后端 403 一致 |

---

## 3. G-19 工单流程配置验收（4 条）

| 用例 ID | 前置数据 | 操作步骤 | 预期结果 | 关联问题/任务编号 | PASS 判据 |
|---|---|---|---|---|---|
| P4-G19-01 流程定义 CRUD | admin Token；准备 onboarding 流程 JSON | 依次调用：`POST /admin/workflows` 创建草稿；`GET /admin/workflows` 列表；`GET /admin/workflows/{id}` 详情；`PUT /admin/workflows/{id}` 修改名称/节点；可选 `DELETE /admin/workflows/{id}` 清理测试草稿 | 创建返回 id/status=draft；列表可查；详情 JSON 完整；更新后 version/status/updated_at 合理；删除仅限未发布测试草稿 | G-19 / P4.2 / Q19 | CRUD 全部符合状态码与响应；非 admin 调同接口 403 |
| P4-G19-02 版本发布 | 已创建 draft 流程 | 调用 `POST /admin/workflows/{id}/publish`，传入完整 `definitionJson`；再次列表按 `status=published` 查询 | 流程状态为 published/active；version 增加或 published_at 更新；非法 JSON/空节点发布失败并给出校验错误 | G-19 / P4.2 | 发布成功后可查询；错误配置不能发布；非 admin 发布 403 |
| P4-G19-03 新建工单实际走配置 | 已发布包含特定节点/模块的 onboarding 流程；业务员 Token | 业务员新建并提交入职工单；查询工单详情、子工单列表、时间线；对照流程配置中的 nodes/edges | 新工单按已发布流程生成子单/待办；节点顺序、模块、办理角色、SLA/动作要求符合配置 | G-19 / Q19 / R1 | 如果新工单仍走硬编码旧流程且配置无效即 FAIL；配置错误时应阻止提交或明确回退说明 |
| P4-G19-04 可视化编辑器交互 | admin 浏览器；已有 draft 流程 | 进入 `/admin/workflows/{id}`；拖拽节点、连线、修改节点 label/module/assignee/SLA/action buttons；保存后刷新再打开；尝试非法连线/孤立节点 | 画布可编辑；保存成功；刷新后节点位置与属性不丢失；非法配置有提示且不能发布 | G-19 / FE workflow editor | 截图 + 再次 GET 证明前端画布与后端 definition_json 一致 |

---

## 4. G-20 导出模板 + 门户配置权限验收（4 条）

| 用例 ID | 前置数据 | 操作步骤 | 预期结果 | 关联问题/任务编号 | PASS 判据 |
|---|---|---|---|---|---|
| P4-G20-01 导出模板菜单权限 | admin/non_admin 前端登录 | admin 查看菜单；non_admin 查看菜单；搜索“导出模板/导出模板配置” | admin 显示导出模板配置；非 admin 不显示该菜单 | G-20 / Q08 / P4.4 | 非 admin 菜单不可见，且刷新/重新登录后不出现 |
| P4-G20-02 导出模板接口 guard | admin/non_admin Token | admin 调 `GET /admin/export-templates`、`POST /admin/export-templates`；non_admin 调相同接口 | admin 200/创建成功；non_admin 403；别名 `/export-templates` 若存在也需同样限制 | G-20 / Q08 / Q21 | 非 admin 任何导出模板管理接口可成功即 FAIL |
| P4-G20-03 门户/仪表盘配置菜单权限 | admin/non_admin 前端登录 | admin 查看系统/门户配置菜单；non_admin 查看左侧菜单及直达 `/admin/system-settings` | admin 可见门户配置/系统设置；非 admin 不显示菜单且直达无权 | G-20 / Q08 | 非 admin 无菜单、无页面、无配置表单渲染 |
| P4-G20-04 门户/仪表盘配置接口 guard | admin/non_admin Token | admin 调 `GET /admin/system-settings/operation-log-retention`；non_admin 调 GET/PUT；可补充门户配置实际端点 | admin 200；non_admin 403；PUT 仅 admin 可保存 | G-20 / Q08 | 接口 guard 与菜单 guard 一致；非 admin 不能读取或修改配置 |

---

## 5. G-21 编辑必须重新提交验收（3 条）

| 用例 ID | 前置数据 | 操作步骤 | 预期结果 | 关联问题/任务编号 | PASS 判据 |
|---|---|---|---|---|---|
| P4-G21-01 业务员编辑后状态强制进入重提 | R4 专用 processing 工单；业务员为创建人；子单未全部完成 | 业务员打开详情进入编辑；修改 mobile/special_remark 等关键字段并保存；查询 `GET /work-orders/{id}` 与 timeline | 保存后不得静默继续 processing 旧链路；必须自动调用 resubmit 或状态变为 pending/待重提；时间线有 `salesperson_modify_resubmit` | G-21 / R4 / F04 | 状态、审计日志、通知三者均体现重新提交；无“保存成功但后道无感继续旧数据” |
| P4-G21-02 审批链/待办重置 | 同一 R4 工单；记录编辑前子单 id/status/handler | 编辑并重新提交后，查询子单列表、后道待办、通知 | 原审批/后道待办按规则重置或重新派发；新待办读取最新字段；已完成子单若禁止编辑则接口 409 并提示需退回后修改 | G-21 / R4 | 待办不是旧字段快照；处理人收到 `dispatch_resubmit`/字段变更通知；非法编辑被阻断 |
| P4-G21-03 UI 提示与确认 | 业务员浏览器；processing/returned 工单各 1 条 | 进入详情编辑；检查保存按钮文案、Alert、确认弹窗；确认保存；取消保存各走一次 | UI 明确提示“编辑后将自动重新提交/原审批重置”；确认后保存并重提；取消不修改数据 | G-21 / FE detail | 截图证明提示完整；按钮文案为“保存并重新提交”；取消后 GET 详情无变化 |

---

## 6. 反馈文档 26 问题全量回归（26 条）

> 依据 `docs/FINAL_COMPLIANCE_REPORT_0520.md`：原 24 PASS + 2 NOT_VERIFIED 本轮均需重新跑。Q19/Q20 对应 P4 新增能力，本轮按 G-19/G-18 强验收。

| 用例 ID | 前置数据 | 操作步骤 | 预期结果 | 关联问题/任务编号 | PASS 判据 |
|---|---|---|---|---|---|
| P4-Q01 姓名直显 | 任意角色账号 | 登录后观察左下角头像/用户区域；不 hover；切换菜单展开/收起 | 真实姓名/显示名直接展示，退出入口不遮挡 | Q01 / P1.1 | 截图中可直接看到当前登录人姓名 |
| P4-Q02 仪表盘 4 卡片字段 | 5 角色 Token；本月多状态数据 | 分角色进入仪表盘并调 `GET /dashboard/cards` | 卡片为本月总数/处理中/已完成/我的消息等新口径，无旧“待处理”混淆 | Q02 / G-1/G-6 | 页面数字与接口一致，卡片标题正确 |
| P4-Q03 仪表盘按角色范围取数 | 本人/他人/团队/全量数据 | 业务员、负责人、后道、管理员分别查看 cards | 业务员只看本人；负责人看负责范围；后道看本人/团队；admin 全量 | Q03 / BE-05 | 数据不越权、不漏授权范围 |
| P4-Q04 消息通知分类 | 已触发退回、字段变更、催办、超时、撤回/作废申请 | 查看铃铛、消息页、`/notifications/unread-count-by-bucket` | 正常派单不进“我的消息”；异常/协作分类正确；count/list 一致 | Q04 / G-1/G-2/G-16 | 任一 bucket 数量与列表不一致即 FAIL |
| P4-Q05 默认当月且无周期切换 | 本月/上月数据 | 查看仪表盘右上角；接口/页面核对当月口径 | 无今日/本周/本月切换控件；默认 Asia/Shanghai 当月 | Q05 | 上月数据不计入当月卡片 |
| P4-Q06 趋势图与总表 | 管理员/负责人账号；多 module 数据 | 请求 `leader-trend`、`order-type-matrix?dimension=node`，UI 切换 module | 总表按子工单/办理事项；趋势支持 orderType/moduleCode | Q06 / G-10/G-12 | module 维度行包含 data_entry/social_insurance/contact/contract 等 |
| P4-Q07 非管理员菜单重排 | 入职联系、社保、合同、数据录入等账号 | 分角色登录检查左侧菜单 | 只显示对应授权模块，不显示无权管理菜单 | Q07 / FE-02 | 截图逐角色满足权限矩阵 |
| P4-Q08 导出模板/门户配置仅 admin | admin 与非 admin | 检查菜单、直达 URL、API guard | admin 可见可进；非 admin 菜单不可见、URL/API 403 | Q08 / G-20 | 前端+后端双 guard 均通过 |
| P4-Q09 我的工单四子菜单 | 业务员/后道/组长/负责人 | 查看我发起的、我的待办、我的已办、团队工单 | 数据集合区分，pending/done 不混用，团队入口按角色显示 | Q09 / G-5 | 每个子菜单数据归属正确 |
| P4-Q10 主列表与新建入口合并 | 业务员账号 | 进入主工单列表，查找新建入口和旧独立菜单 | 列表页统一新建入口，无重复不一致入口 | Q10 | 新建入职/续签/离职/申报可从统一入口进入 |
| P4-Q11 批导入字段映射 | 标准、非标准、缺映射 Excel | 上传 preview/confirm；检查 mappingMode 和缺失提示 | 标准免映射；AI/规则映射可确认；缺必填不能静默导入 | Q11 / G-17 | confirm 前拦截缺失关键字段 |
| P4-Q12 删除 social_urge | 新建、导入、导出模板、字段配置页面 | 全局搜索 social_urge/中文名；调用字段查询 | 运行态 UI 与导入导出均不可见；不再必填 | Q12 / G-8 | 仅允许迁移/历史说明出现，不得在运行态出现 |
| P4-Q13 搜索栏 5 字段 | 多客户、多员工、多状态数据 | 按客户代码、客户名称、员工姓名、员工证件号、状态筛选 | 单条件/组合/重置准确 | Q13 | 不泄露无权数据，结果可解释 |
| P4-Q14 删除看板/网格/列配置 | 主工单列表、我的待办、团队工单页面 | 检查工具栏、刷新页面 | 默认表格，无看板/网格/列配置等冗余入口 | Q14 | 页面无被用户要求删除的旧入口 |
| P4-Q15 列表操作按钮权限 | 本人/非本人、终态/非终态工单 | 查看修改/撤回/作废/催办/删除；实际调接口 | 删除仅 admin；本人未终态显示合法操作；终态仅详情 | Q15 / G-9 | 按钮与后端权限一致，非本人不可越权 |
| P4-Q16 详情页精简与操作 | 未终态/终态详情 | 查看工单动态、进度、流转链、按钮 | 删除冗余区块；保留必要按钮；终态隐藏操作 | Q16 / G-9 | 截图证明详情页不再展示旧冗余区块 |
| P4-Q17 我的工单筛选栏 | 待办/已办/团队数据 | 按节点类型、工单类型、状态、所属月份、客户、员工证件号筛选 | 6 字段齐全且准确 | Q17 / G-13 | 下拉/月份控件可用，清空恢复 |
| P4-Q18 入职表单分组栅格 | 入职新建页 | 检查基本信息、合同、工资、银行、社保公积金、备注分组 | 分组清晰，必填标识和响应式正常 | Q18 / G-14 | 表单字段不混排，提交不受布局影响 |
| P4-Q19 工单流程配置 | admin 与非 admin；流程测试 JSON | 执行 G-19 四条用例 | admin 可 CRUD/发布/画布编辑；新工单走配置；非 admin 403 | Q19 / G-19 | P4-G19-01~04 全 PASS |
| P4-Q20 字段管理权限仅 admin | admin 与非 admin | 执行 G-18 四条用例 | 字段管理仅 admin 可见可操作 | Q20 / G-18 | P4-G18-01~04 全 PASS |
| P4-Q21 导出模板字段勾选 | admin 账号；字段列表 | 新建/编辑导出模板，勾选多个字段，保存后重新打开 | 字段以列表/分组 checkbox 展示，可保存回显 | Q21 / P4.4 | 重新打开字段选择不丢失 |
| P4-Q22 导入缺必填 BUG | 混合 Excel：第 2 行缺必填，第 3 行合法 | preview/confirm 导入；查看失败明细、成功行工单/子单 | 错误行失败并显示行号/字段/原因；合法行成功并派发 | Q22 / B1 | 缺必填仍导入成功即 FAIL |
| P4-Q23 导入后仪表盘/派发/视角 | 业务员导入合法模板 | 导入后刷新仪表盘、列表、详情；后道查待办 | 卡片更新，子工单不是未派发，业务员不显示共享团队视角 | Q23 / B2 | 三个子问题任一复现即 FAIL |
| P4-Q24 消息数量但列表为空 BUG | 25 条未读/已读混合消息 | 查看铃铛、消息页分页、全部已读 | 数量、列表 total、未读归零一致 | Q24 / B3 | 有数量无记录即 FAIL |
| P4-Q25 批量办理 BUG | 后道待办 1/3/50/51 条 | 勾选批量办理，remark 为空/填写分别提交 | 按钮可见；remark 必填；≤50 成功，51 返回 400 | Q25 / B4/G-15 | 只能批量导出无批量办理即 FAIL |
| P4-Q26 共享负责人模块筛选 BUG | 共享负责人有 A/B 模块授权与无权模块数据 | 团队工单按中文名/code 筛选，清空 | 授权模块可查；无权模块不泄露；清空恢复 | Q26 / B5/G-13 | 中文筛选无结果但 code 有结果即 FAIL |

---

## 7. 6 类工单流程 R1~R6（6 条）

| 用例 ID | 前置数据 | 操作步骤 | 预期结果 | 关联问题/任务编号 | PASS 判据 |
|---|---|---|---|---|---|
| P4-R1 常规办理完成 | 业务员可建单；后道可办理 | 业务员创建并提交；后道接受/办理所有子单；查询主单 | 子单 completed；主单 completed；统计/消息更新 | R1 / F01 | 主流程闭环，无卡死待办 |
| P4-R2 退回后作废 | 已提交工单 | 后道退回；业务员申请作废；主管同意 | 主单 void；待办取消；双方有通知 | R2 / F02 | 终态不可继续办理 |
| P4-R3 退回后修改重提 | returned 工单 | 业务员修改字段并重新提交；后道继续办理 | 修改内容同步；流程回到正确后道节点 | R3 / F03 | 可重复退回/重提且状态正确 |
| P4-R4 办理中编辑强制重提 | processing 工单，子单未完成 | 执行 G-21 三条用例 | 编辑后自动/强制重新提交，旧审批链重置，后道收到通知 | R4 / F04 / G-21 | P4-G21-01~03 全 PASS；这是本轮重点 |
| P4-R5 申请撤回/作废审批 | processing 工单 | 业务员申请撤回/作废；后道同意和拒绝各测一次 | 同意进入撤回/作废或可修改态；拒绝流程继续；通知双方 | R5 / F05 | 状态与审批结果一致 |
| P4-R6 终态不可操作 | completed/withdrawn/void 工单 | 尝试编辑、撤回、作废、催办、子单办理 | 前端无入口；后端 403/409；时间线无非法跃迁 | R6 / F06 | 任一终态可变更即 FAIL |

---

## 8. 5 个 BUG B1~B5 回归（5 条）

| 用例 ID | 前置数据 | 操作步骤 | 预期结果 | 关联问题/任务编号 | PASS 判据 |
|---|---|---|---|---|---|
| P4-B1 必填缺失仍导入 | 缺必填混合 Excel | preview/confirm；查失败明细和成功行派发 | 缺必填行失败，合法行成功并派发 | B1 / Q22 / G-7/G-17 | 失败明细含行号、字段、原因；不会静默成功 |
| P4-B2 导入后仪表盘/派发/共享视角 | 业务员合法导入 | 导入后刷新 cards、主列表、子单、后道待办 | cards 更新；子单已派发；业务员视角正确 | B2-a/B2-b/B2-c / Q23 | 任一问题复现即 FAIL |
| P4-B3 消息有数量无列表 | 消息 bucket 数据 | 调 unread-count、unread-count-by-bucket、消息列表 | count/list 同源一致 | B3 / Q24 / G-1/G-2 | 点击消息能定位源工单/子单 |
| P4-B4 后道批量办理缺失 | 后道多条待办 | 勾选多条，填写 remark 批量完成 | 批量办理按钮存在且接口成功；无权项 skipped | B4 / Q25 / G-4/G-15 | 完成后状态和列表同步 |
| P4-B5 共享负责人模块筛选无结果 | 共享负责人授权模块数据 | 中文名与 moduleCode 分别筛选 | 两种筛选等价；无权模块不泄露 | B5 / Q26 / G-13 | 中文筛选失效即 FAIL |

---

## 9. 建议真实执行顺序

1. 先执行 P4-SETUP-01~07，确认账号和数据可用。
2. 优先执行权限类：G-18、G-20，避免非管理员配置越权。
3. 再执行 G-19 流程配置：CRUD → 发布 → 新工单生效 → 可视化编辑。
4. 执行 G-21/R4：编辑后强制重新提交，这是本轮新增强语义重点。
5. 执行 Q01~Q26 全量回归，重点复跑 24 PASS + 2 原 NOT_VERIFIED。
6. 执行 R1~R6 与 B1~B5，补齐端到端闭环和历史 BUG 根除证据。
7. 最终汇总 PASS/FAIL，任何 FAIL 必须回填：账号、用例 ID、请求、响应、截图、关联任务编号。

---

## 10. 失败上报模板

```text
[P4 验收失败]
用例 ID：P4-____
关联问题/任务：G-__/Q__/R__/B__
角色/账号：
前置数据：
操作步骤：
预期结果：
实际结果：
接口请求/响应：
页面截图：
初步判断：前端 / 后端 / 数据 / 权限配置 / 环境
阻断级别：P0 / P1 / P2
建议修复负责人：frontend / backend / architect
```

---

## 11. 本阶段结论

本文已完成 P4 验收脚本准备与全量回归用例梳理，覆盖：

- G-18 字段管理权限仅 admin：接口、菜单、路由 guard。
- G-19 工单流程配置：流程定义 CRUD、版本发布、新工单按配置派发、可视化编辑器交互。
- G-20 导出模板与门户配置权限：菜单 + API 双 guard。
- G-21 编辑必须重新提交：状态、审批链/待办重置、UI 提示。
- 反馈文档 26 问题：按 `FINAL_COMPLIANCE_REPORT_0520.md` 的 24 PASS + 2 NOT_VERIFIED 全量复跑。
- 6 类流程 R1~R6，重点 R4。
- 5 个 BUG B1~B5。

配套 HTTP 自检脚本：`docs/scripts/p4_smoke.http`。
