# 需求-实现-测试 验收追踪矩阵 · 20260521 HR 测试讨论会

> 交付角色：测试工程师（QA）
> 交付日期：2026-05-21
> 任务 ID：8bb7b881-626a-44f5-bd0c-728358196c92
> 范围：基于 2026-05-21 测试讨论会纪要，对会议核心需求点逐条建立"需求 → 角色 → 前端入口 → 后端能力 → 测试用例 → 优先级 / 阻塞风险 / 验收标准"的端到端追踪矩阵。**只读整理，不改代码。**
> 上游依据：
> - `docs/architect/01-需求影响面与实施路径.md`（架构师影响面映射）
> - `docs/需求实施方案-20260521-HR测试会议.md`（架构师 8 大类实施方案）
> - 既有交付：测试计划（E2E_TEST_PLAN_0520.md / TEST_PLAN_0518_INCREMENTAL.md / 回归用例总纲.md）+ 上一轮 QA 细化用例清单
> - 代码现状：`work-order.service.ts`、`dispatched-order.service.ts`、`dispatch-engine/`、`field-supplement/`、`operation-logs/`、`BasicLayout.tsx`、`OnboardingModule/`、`MyDispatched/`、`constants/dictionaries.ts`

---

## 0. 阅读说明

- **优先级**：P0=本轮必上线（会议核心调整 + 阻断回归），P1=本轮应上线（高频体验/批量），P2=本轮可后置（管理 UI / 边角优化）。
- **阻塞风险等级**：🔴 高（语义/数据/审批改动，回滚成本大）/ 🟡 中（前后端联动，可独立 PR）/ 🟢 低（纯展示或开关型）。
- **测试用例编号约定**：
  - `TC-A-*` ~ `TC-L-*` 与下方 12 个需求块一一对应；
  - 已在前序交付（`E2E_TEST_PLAN_0520.md` / 上一轮 QA 用例清单）中存在的复用为"复用 + 标注来源"，新补充的写"补充"。
- **前端入口锚点**：尽量精确到文件 + 关键 region；后端能力锚点：方法/接口路径。
- **验收标准**：可观测的"完成 / 不完成"判定条件（用 _Given / When / Then_ 风格）。

---

## 1. 需求总图（12 类核心调整）

| 编号 | 需求块 | 优先级 | 阻塞风险 |
|---|---|---|---|
| A | 业务员操作下沉到子工单（主工单只读） | **P0** | 🔴 |
| B | 公共字段双向同步与字段级通知 | **P0** | 🟡 |
| C | 业务员菜单与团队工单权限收敛（仅"我的代办"+ 团队工单仅组长/负责人） | **P0** | 🟢 |
| D | 派发配置：固定派发 + 条件派发 + AB 角（去公共池展示） | P1 | 🟡 |
| E | 工单状态合并到 7 类（含撤回/作废审批中） | **P0** | 🔴 |
| F | 仪表盘 / 顶栏 / 子工单进度中文化等界面优化 | **P0** | 🟢 |
| G | 历史工单页（按月筛选 + 默认仅最近 N 条） | P1 | 🟡 |
| H | 子工单查询改表头筛选（与主工单字段对齐） | **P0** | 🟢 |
| I | 导出模板与子工单绑定（不让用户选字段） | P1 | 🟢 |
| J | 后道批量退回 + 批量导入办理/退回/修改（含暂存语义） | **P0** | 🔴 |
| K | 操作权限规则细化（业务员/后道操作矩阵）+ 撤回审批通过后直接作废免审 | **P0** | 🟡 |
| L | 操作日志保留 30 天 + 定时清理 | P1 | 🟢 |

### 1.1 本次点名范围覆盖核对

| 点名范围 | 覆盖章节 / 用例锚点 | 覆盖结论 |
|---|---|---|
| 入职一拆四 | A（子工单操作下沉）、D（派发配置）、F（左侧导航入职 4 子菜单）、J（后道批量/导入处理），重点用例 TC-A-03、TC-D-01、TC-F-03、TC-J-01~J-15 | 已覆盖 |
| 主工单只读 / 子工单操作 | A，TC-A-01~TC-A-10 | 已覆盖 |
| 字段同步与消息通知 | B，TC-B-01~TC-B-09 | 已覆盖 |
| 撤回作废审批 | A + E + K，TC-A-03、TC-A-04、TC-E-03、TC-E-04、TC-K-03~TC-K-06 | 已覆盖 |
| 退回重提 / 撤回后直接作废 | E + K，TC-E-03、TC-E-06、TC-K-05、TC-K-06；退回后重新提交沿用既有 E2E 回归并作为状态流转验收前置 | 已覆盖 |
| 7 类状态流转 | E，TC-E-01~TC-E-07 | 已覆盖 |
| 后道批量退回 | J，TC-J-01、TC-J-02 | 已覆盖 |
| 导入批量办理 / 退回 | J，TC-J-03、TC-J-04、TC-J-09~TC-J-14 | 已覆盖 |
| 银行卡字段导入修改 | J，TC-J-05~TC-J-08、TC-J-12 | 已覆盖 |
| 权限菜单 | C + K，TC-C-01~TC-C-06、TC-K-01~TC-K-10 | 已覆盖 |
| 历史工单 | G，TC-G-01~TC-G-05 | 已覆盖 |
| 导出模板 | I，TC-I-01~TC-I-05 | 已覆盖 |
| 日志清理 | L，TC-L-01~TC-L-05 | 已覆盖 |

---

## 2. 追踪矩阵

> 每个需求块下含两张表：
> - 顶部为概览（角色 / 前端入口 / 后端能力 / 验收标准）
> - 底部为测试用例编号 + 标题 + 复用/补充标注

---

### A. 业务员操作下沉到子工单 · 主工单只读 【P0 / 🔴】

**会议要点**：业务员主工单仅查看，所有 _修改 / 撤回 / 作废 / 催办_ 入口都迁到对应子工单；只操作目标子工单不影响其他子工单；撤回/作废是子工单粒度审批。

| 维度 | 内容 |
|---|---|
| 涉及角色 | 业务员、业务组长、业务负责人、后道（受撤回/作废审批触发）、admin |
| 前端页面/入口 | `frontend/src/pages/WorkOrders/Detail/index.tsx`（去除主单写按钮、加只读 Alert）；`frontend/src/pages/MyDispatched/Detail/index.tsx` 与 `frontend/src/pages/OnboardingModule/index.tsx` 行内 + 详情：新增「修改 / 撤回 / 作废 / 催办」4 按钮；按钮 disabled 规则随子工单状态变化；`services/dispatchedOrders.ts` 新增 4 个 client 方法 |
| 后端能力 | `POST /api/dispatched-orders/:id/withdraw \| void \| urge`、`PATCH /api/dispatched-orders/:id/extra-data` 子工单代理接口；`work-order.service.ts: withdraw/void/urge/update` 复用；`field_configs.is_salesperson_initiated` 字段白名单；催办节流 key `${parentId}:${moduleCode}` + admin 全单 `${parentId}:__all__` 共享 |
| 数据库变更 | `field_configs` 增 `is_salesperson_initiated boolean`（业务员可发起字段白名单）；`work_orders` / `dispatched_orders` 状态语义不动（参考 §E） |
| 阻塞风险 | 🔴 R-A1：撤回/作废迁移到"对单个子工单审批"是核心语义变更，主工单状态需要按子工单状态聚合；R-A2：旧调用主单接口的页面/脚本必须 grep 全量替换（含 `Onboarding/Detail` / 旧版 `WorkOrders/Detail`）；R-A3：催办节流绕过（业务员通过 4 个子单分别催办） |
| 验收标准 | _Given_ 业务员账号登录 _When_ 进入主工单详情 _Then_ 看不到"修改/撤回/作废/催办"按钮，顶部出现"请在子工单中办理"的 Alert；_Given_ 任意子工单为 PROCESSING _When_ 业务员在该子单点撤回 _Then_ 仅该子工单进入 WITHDRAW_PENDING，其余子工单状态不变；_Given_ 撤回审批通过 _Then_ 该子工单 WITHDRAWN，主工单状态由所有子单聚合（任一非 final → 主单仍可写） |

| 用例编号 | 标题 | 类型 |
|---|---|---|
| TC-A-01 | 业务员主工单详情页只读校验（按钮全部消失 + Alert 出现） | 复用（来源：上一轮 QA 用例 §1.1） |
| TC-A-02 | 子工单"修改"按钮 disabled 规则（仅 PENDING/PROCESSING + 无已办兄弟单） | 补充 |
| TC-A-03 | 子工单"撤回"端到端：单个子单撤回不影响其他子单 | 补充（核心场景） |
| TC-A-04 | 子工单"作废"端到端：作废入口在子单但语义为整单作废（弹窗确认） | 补充 |
| TC-A-05 | 子工单"催办"端到端 + 30 分钟节流（4 个子单分别催办应共享 throttle） | 补充 |
| TC-A-06 | 业务员通过子工单 PATCH `extra-data` 改公共字段 → 主工单 extraData 同步 | 复用（E2E_TEST_PLAN_0520 §3） |
| TC-A-07 | 字段白名单越权：业务员尝试改非 `is_salesperson_initiated=true` 字段返回 403 | 补充 |
| TC-A-08 | 旧主工单写接口仍可调（管理员脚本兼容）但前端业务员不暴露 | 补充（回归） |
| TC-A-09 | 已办结子工单"修改/撤回"按钮 disabled | 复用（QA 上轮 §1.4） |
| TC-A-10 | 部分子工单已 RETURNED 时，业务员对其他子单的撤回不受影响 | 补充 |

---

### B. 公共字段双向同步与字段级通知 【P0 / 🟡】

**会议要点**：业务员/后道任一方修改公共字段 → 同步到主工单 + 所有相关子工单 + 通知对应办理人；与字段无关的子工单不同步、不通知。

| 维度 | 内容 |
|---|---|
| 涉及角色 | 业务员（写入端）、后道五类专员（写入/接收端）、共享团队 |
| 前端入口 | `pages/WorkOrders/Detail/index.tsx` + `pages/MyDispatched/Detail/index.tsx` 解析 `?focus=fieldCode` 滚动+高亮；`components/DynamicForm/index.tsx` 新增 `highlightFields` / `dirtyTooltips`；详情页 `<Affix>` "已知悉"按钮 → `POST /dispatched-orders/:id/dirty/confirm-read` |
| 后端能力 | `field-change.hook.ts` 增 `payload.diff_fields[].field_name`；`field-supplement.service.ts: supplement` / `dispatched-order.service.ts: complete/supplement` 写入侧补反向 dirty hook；`work_order_field_dirty_marks.unique_active(work_order_id, field_code, flow_round, is_active=true)` 已建；`FieldSupplementRule.syncToModules` 决定同步范围 |
| 数据库变更 | `field_configs` 增 `is_common_field boolean`（公共字段标识）；`work_order_field_dirty_marks` 已存在；可选：`affected_module_codes` jsonb 列 |
| 阻塞风险 | 🟡 R-B1：后道→业务员反向通知量过大（每字段一改一通知）→ 需要 5 分钟节流批合并；R-B2：dirty 标记互相覆盖（同字段同轮次双向修改）；R-B3：字段名查找热路径（必须缓存 `field_configs.fieldName`） |
| 验收标准 | _Given_ 业务员在子工单 A 改了 `mobile_phone`（公共字段，且 `syncToModules` 含子工单 B） _Then_ 主工单 extraData 更新、子工单 B 的对应字段值同步、子工单 B 办理人收到通知；_Given_ `mobile_phone` 不在子工单 C 的 `syncToModules` 内 _Then_ 子工单 C 不收到通知；_Given_ 收到通知后办理人点详情 `?focus=mobile_phone` _Then_ 字段滚动到可视区 + 黄色高亮 2s |

| 用例编号 | 标题 | 类型 |
|---|---|---|
| TC-B-01 | 业务员→后道：单字段同步到主工单 + 含规则的子工单（不污染无关子工单） | 复用（QA 上轮 §2.1） |
| TC-B-02 | 后道→业务员反向同步：后道补充银行卡 → 主单 extraData + 通知业务员 | 补充 |
| TC-B-03 | 通知 payload 完整性：`diff_fields[].field_name` 中文 + `link?focus=` 正确 | 补充 |
| TC-B-04 | `?focus=fieldCode` 高亮：滚动到字段 + 2s 黄色 keyframes | 补充 |
| TC-B-05 | "已知悉"按钮 → dirty 标 `cleared_at` 写入 + 列表 Tag 消失 | 复用（QA 上轮 §2.3） |
| TC-B-06 | 同字段同轮次双向修改：dirty unique 索引行为正确（最后一次为准） | 补充（边界） |
| TC-B-07 | 5 分钟批合并通知（多次后道改 → 一条聚合通知） | 补充（性能/UX） |
| TC-B-08 | 修改非公共字段（`is_common_field=false`）：不写 dirty、不发通知 | 补充 |
| TC-B-09 | 通知发送失败重试 / 重复消费幂等 | 复用（回归用例总纲） |

---

### C. 业务员菜单与团队工单权限收敛 【P0 / 🟢】

**会议要点**：业务员菜单仅保留「我的代办」（仅展示后道退回的待处理）+ 子工单分类菜单；团队工单仅 _业务组长 / 业务负责人_ 可见；普通业务员无团队工单权限；删除"我的已办"。

| 维度 | 内容 |
|---|---|
| 涉及角色 | 业务员、业务组长、业务负责人、后道（不应进 `/work-orders`）、admin |
| 前端入口 | `frontend/src/layouts/BasicLayout.tsx: RAW_MENU` 收紧 roles：业务员菜单仅入职/在职/离职 + 我的代办 + 消息；团队工单 roles=`[ADMIN, BUSINESS_OWNER, BUSINESS_GROUP_LEADER]`；`config/routeVisibility` 后道访问 `/work-orders` 重定向 `/my-dispatched?from=work-orders` |
| 后端能力 | `WorkOrderService.findAll` 业务员视角默认仅返回"自己创建 + RETURNED 给自己"的列表；新增 `GET /api/work-orders/team`（业务组长/负责人专用，按 departmentId/global 过滤）；后道 `GET /api/work-orders` 在业务员路径下返 403/302 |
| 数据库变更 | 无（角色 canonical 映射已在 `frontend/src/constants/roles.ts` 与后端 role-permissions.ts） |
| 阻塞风险 | 🟢 R-C1：旧 deeplink 兼容（302 重定向 + `from=` 参数）；R-C2：组长/负责人映射别名（`biz_leader`/`business_group_leader` 等）需统一入口校验 |
| 验收标准 | _Given_ 业务员登录 _Then_ 左侧菜单不包含"我的已办" / "团队工单"；_Given_ 业务员访问 `/team-dispatched` _Then_ 404 或重定向；_Given_ 组长/负责人登录 _Then_ 团队工单可见且范围正确（部门 / 全局） |

| 用例编号 | 标题 | 类型 |
|---|---|---|
| TC-C-01 | 业务员菜单矩阵：仅"我的代办"+ 子工单分类 + 消息（已办/团队不见） | 复用（QA 上轮 §3.1） |
| TC-C-02 | 业务组长 / 业务负责人菜单：含"团队工单"且按部门 / 全局过滤 | 补充 |
| TC-C-03 | 后道五类访问 `/work-orders` 路由 → 302 重定向 `/my-dispatched` | 补充 |
| TC-C-04 | "我的代办"内容口径：仅展示 RETURNED 给当前业务员的子工单 | 补充 |
| TC-C-05 | 组长权限边界：能看本部门、不能看其他部门 | 复用（QA 上轮 §3.4） |
| TC-C-06 | 角色别名映射：`biz_leader` / `business_group_leader` 行为一致 | 补充（回归） |

---

### D. 派发配置：固定派发 + 条件派发 + AB 角 + 去公共池展示 【P1 / 🟡】

**会议要点**：90% 工单固定负责人（如劳动合同→杨春、入职联系→毛雅丽）；支持按客户/参保地条件派发（先 stub）；A/B 角直接显示姓名；去除"公共池"概念展示。

| 维度 | 内容 |
|---|---|
| 涉及角色 | admin（配置）、业务员（触发派发）、后道（接收派发） |
| 前端入口 | `pages/Admin/DispatchConfig/`（已有）增 AB 角多选（最多 2 人，UI 校验）；`pages/OnboardingModule/index.tsx:57` 的 `<Tag color="orange">公共池</Tag>` 替换为"备选 N 人"或姓名联展；池筛选 chip 标签调整 |
| 后端能力 | `dispatch_rules` 已支持 `assigneeUserId / fallbackUserId / triggerConditions(jsonb AST) / customerId / departmentId / dispatch_strategy(fixed/round_robin/load_balance/pool) / priority`；新增 `dispatch_rules.ab_member_ids jsonb`；`dispatched_orders.ab_pool_members jsonb`；`HandlerPickerService` + `DispatchEngineService.resolveRuleHandler` 路由 AB 角并行池；`DispatchedOrderService.claim` 增 `ab_pool_members` 校验 |
| 数据库变更 | `ALTER TABLE dispatch_rules ADD COLUMN ab_member_ids jsonb NULL;`；`ALTER TABLE dispatched_orders ADD COLUMN ab_pool_members jsonb NULL;` |
| 阻塞风险 | 🟡 R-D1：AB 池既不是 fixed 也不是纯 pool，admin 必须严格校验；R-D2：历史规则未填 `ab_member_ids` → 行为不变（不需迁移）；R-D3："公共池"展示在 OnboardingModule 等多处出现，需 grep 全量改 |
| 验收标准 | _Given_ admin 配置劳动合同模块固定负责人=杨春 _When_ 业务员发起入职 _Then_ 子工单 handler=杨春；_Given_ 配置 AB 角 [杨春, 江璐] _When_ 派发 _Then_ 子工单 handler_id=null + ab_pool_members=2 人；_Given_ 江璐认领 _Then_ 子工单 handler=江璐，杨春不可再认领；_Given_ 列表展示 _Then_ 不出现"公共池"文案 |

| 用例编号 | 标题 | 类型 |
|---|---|---|
| TC-D-01 | 固定负责人派发（默认 90% 路径）：劳动合同→杨春、入职联系→毛雅丽 | 复用（QA 上轮 §4.1） |
| TC-D-02 | 条件派发（按客户）：客户=字节 → 派发给指定专员 | 补充 |
| TC-D-03 | AB 角并行：handler_id=null + ab_pool_members 校验认领权限 | 补充 |
| TC-D-04 | AB 角越权认领：非池成员 4220 错误 | 补充 |
| TC-D-05 | 公共池文案下线：所有列表 / 标签 / 详情不出现"公共池" | 补充 |
| TC-D-06 | A 角离线 → B 角接管（fallback 行为不变） | 复用（回归用例总纲） |
| TC-D-07 | 派发规则优先级：customer_id > department_id > 全局 | 复用（QA 上轮 §4.4） |
| TC-D-08 | admin 配置 UI 校验：AB 角不超 2 人、必为 active user、必为 strategy=pool | 补充 |

---

### E. 工单状态合并到 7 类 【P0 / 🔴】

**会议要点**：删除"草稿/待派发"，保留 _处理中 / 已完成 / 已退回 / 已撤回 / 已作废 / 撤回审批中 / 作废审批中_ 共 7 类；已退回=后道退回，已撤回=业务员自行撤回，两者默认未派发，重新提交后→处理中。

| 维度 | 内容 |
|---|---|
| 涉及角色 | 全部（影响所有列表、Tag、筛选下拉、Dashboard 卡片） |
| 前端入口 | `frontend/src/constants/dictionaries.ts` 新增 `WORK_ORDER_DISPLAY_STATUS_LABELS` + `WORK_ORDER_DISPLAY_STATUS_COLOR`；所有 List Tag / 状态筛选下拉 / Dashboard 卡片 / Notifications 来源筛选切到 `displayStatus`；旧 9 值映射保留 1 个 sprint 后下线 |
| 后端能力 | 不动 `WorkOrderStatus` enum（`DRAFT/PENDING/PROCESSING/COMPLETED/RETURNED/WITHDRAW_PENDING/WITHDRAWN/VOID_PENDING/VOID`）；`work-order.mapper.ts: toWorkOrderListItem` 增 `displayStatus: 7 类 enum`；`enums.ts` 增 `WorkOrderDisplayStatus`；`DispatchedOrderStatus` 4 值不动（PENDING/PROCESSING/COMPLETED/RETURNED） |
| 数据库变更 | 不动 enum 列；如要彻底物化 `displayStatus`，可加 generated column 或 view（本期采用映射方案） |
| 阻塞风险 | 🔴 R-E1：`/dashboard/cards.processing` 现含 PENDING 还是仅 PROCESSING？口径变化影响指标；R-E2：旧 9 值在历史数据 / 报表 / 第三方对接（无）中的兼容；R-E3：撤回审批中/作废审批中是否仍是主单状态由 §A 决定 |
| 验收标准 | _Given_ 主工单为 PENDING（已提交未派发） _Then_ 列表 Tag 展示"待处理"（gold）；_Given_ DRAFT _Then_ Tag 展示"草稿"（default），若产品口径不展示则归入待撤回派系；_Given_ WITHDRAW_PENDING _Then_ Tag 展示"已撤回"+"审核中"徽章；_Given_ 状态筛选下拉 _Then_ 仅 7 项（不含 DRAFT/PENDING）；_Given_ 撤回通过 _Then_ 状态从 WITHDRAW_PENDING → WITHDRAWN |

| 用例编号 | 标题 | 类型 |
|---|---|---|
| TC-E-01 | 7 类状态展示矩阵（含 Tag color + 中文文案） | 补充 |
| TC-E-02 | 状态筛选下拉仅 7 项 | 补充 |
| TC-E-03 | 状态流转端到端：PROCESSING→撤回审批中→已撤回→重新提交→PROCESSING | 复用（E2E_TEST_PLAN_0520 §5） |
| TC-E-04 | 状态流转：PROCESSING→作废审批中→已作废 | 复用（同上） |
| TC-E-05 | Dashboard 卡片口径与 displayStatus 一致 | 补充 |
| TC-E-06 | 历史数据兼容：现存 DRAFT/PENDING 数据展示无报错 | 补充（回归） |
| TC-E-07 | 撤回审批中状态下"修改/二次撤回"按钮 disabled | 补充 |

---

### F. 仪表盘 / 顶栏 / 子工单进度等界面优化 【P0 / 🟢】

**会议要点**：删除仪表盘周期选择、备注信息、视角提示文字、左上角重复用户名块；仅保留"我的消息"+ 退出登录；左侧导航按子工单划分（入职拆 4 / 离职拆对应）；子工单进度英文→中文。

| 维度 | 内容 |
|---|---|
| 涉及角色 | 全部（业务员、后道、组长、负责人、admin） |
| 前端入口 | `pages/Dashboard/index.tsx`（删除周期选择、视角提示、备注块）；`layouts/BasicLayout.tsx` 顶栏（去重复用户名，仅保留消息+退出）；导航 `RAW_MENU` 已按子工单拆分（入职 4 模块），离职模块菜单需增；`pages/WorkOrders/Detail/index.tsx` 的"子工单进度"英文 → `getStatusText` 中文 |
| 后端能力 | `dashboard.service.ts` 不需动；删除"视角"参数（如有） |
| 数据库变更 | 无 |
| 阻塞风险 | 🟢 仅前端、低风险；视觉回归测试覆盖即可 |
| 验收标准 | _Given_ 任意角色登录 _Then_ 仪表盘无周期选择/视角提示/备注；_Given_ 顶栏 _Then_ 仅出现"我的消息"+ 退出登录；_Given_ 业务员侧边栏 _Then_ 入职模块下展开 4 子菜单（合同签订/入职联系/数据录入/社保公积金）；_Given_ 子工单进度 _Then_ 全部中文 |

| 用例编号 | 标题 | 类型 |
|---|---|---|
| TC-F-01 | 仪表盘冗余元素清理（周期/视角/备注全部消失） | 补充 |
| TC-F-02 | 顶栏精简（去重复用户名 + 仅消息+退出） | 补充 |
| TC-F-03 | 左侧导航：入职 4 子菜单 + 离职对应子菜单 | 复用（QA 上轮 §6.1） |
| TC-F-04 | 子工单进度面板：英文→中文 + 与 getStatusText 一致 | 补充 |
| TC-F-05 | 视觉回归：在不同角色登录下截图对照（业务员 / 后道 / 组长 / admin） | 补充 |

---

### G. 历史工单页（按月筛选 + 默认仅最近 N 条） 【P1 / 🟡】

**会议要点**：新增独立"历史工单"页，按月份筛选；默认仅显示最近的部分数据，避免全量加载卡顿；选月后显示该月全量。

| 维度 | 内容 |
|---|---|
| 涉及角色 | 业务员（自己创建）、后道（自己处理过）、组长/负责人（团队范围） |
| 前端入口 | 新增 `frontend/src/pages/HistoryWorkOrders/index.tsx`，路由 `/history`；月份多选下拉 + 默认 limit；表头筛选与 §H 风格一致 |
| 后端能力 | `GET /api/work-orders` 增加 `monthList[]`（YYYY-MM）+ `latestN` 参数；不破坏现有列表查询；可选 `MyWork/Done` 共用视图（status ∈ {COMPLETED, WITHDRAWN, VOID}） |
| 数据库变更 | 确认 `work_orders.created_at` 索引；如数据量大评估增 `(created_at desc, status)` 复合索引 |
| 阻塞风险 | 🟡 R-G1：N 默认值（建议 100，待确认）；R-G2：分页 + 月份筛选组合的 SQL 性能；R-G3：与 `MyWork/Done` 是否共用 |
| 验收标准 | _Given_ 进入"历史工单"页 _Then_ 默认显示最近 N 条，加载耗时 <2s；_Given_ 选月份"3 月" _Then_ 仅展示 3 月全量；_Given_ 多选"3 月+4 月" _Then_ 合并展示；_Given_ 当月数据 _Then_ 不出现在历史页（与"我的代办"分流） |

| 用例编号 | 标题 | 类型 |
|---|---|---|
| TC-G-01 | 历史工单页默认 latest N 条加载（性能 <2s） | 补充 |
| TC-G-02 | 单月筛选 / 多月筛选行为正确 | 补充 |
| TC-G-03 | 历史页范围正确（业务员=自己创建；后道=自己处理过） | 补充 |
| TC-G-04 | 历史页与"我的代办"数据分流（当月 RETURNED 不出现在历史） | 补充 |
| TC-G-05 | 大数据量（10k+ 行）翻页性能基线 | 补充（性能） |

---

### H. 子工单查询改表头筛选（与主工单字段对齐） 【P0 / 🟢】

**会议要点**：子工单页面查询功能改为表头筛选（与主工单一致）；展示字段统一为：客户代码 / 客户名称 / 员工姓名 / 编号 / 状态 / 派发时间 / 完成时间。

| 维度 | 内容 |
|---|---|
| 涉及角色 | 业务员、后道、组长 |
| 前端入口 | `pages/OnboardingModule/index.tsx`（4 子工单页都用此组件）：ProTable 顶部 search → 列表头 filters/filterDropdown；同步 `MyDispatched/index.tsx` |
| 后端能力 | `GET /api/dispatched-orders` 已支持 `customerId/customerName/employeeName/orderNo/status/dispatchedAt/completedAt` 等查询参数；如缺需补 |
| 数据库变更 | 无 |
| 阻塞风险 | 🟢 R-H1：日期字段精确度（会议倾向不到日，仅月份/天，但保留日级查询参数也可） |
| 验收标准 | _Given_ 子工单列表 _Then_ 表头每列出现筛选 icon；_Given_ 输入客户代码 _Then_ 列表过滤；_Given_ 状态列下拉 _Then_ 仅 4 类子工单状态（PENDING/PROCESSING/COMPLETED/RETURNED）；_Given_ 字段集 _Then_ 与主工单完全一致 |

| 用例编号 | 标题 | 类型 |
|---|---|---|
| TC-H-01 | 表头筛选基础：每列均可筛选 | 补充 |
| TC-H-02 | 字段集对齐主工单（含派发时间 / 完成时间） | 补充 |
| TC-H-03 | 多列组合筛选（客户代码 + 状态 + 时间区间） | 补充 |
| TC-H-04 | 筛选 + 分页交互（清空筛选回到第 1 页） | 补充 |
| TC-H-05 | 子工单状态下拉仅 4 类 | 补充 |

---

### I. 导出模板与子工单绑定（不暴露字段选择） 【P1 / 🟢】

**会议要点**：导出模板与子工单 moduleCode 绑定；每个子工单的导出字段、顺序提前配置；用户无需选字段；导入字段集 = 导出字段集。

| 维度 | 内容 |
|---|---|
| 涉及角色 | admin（配置模板）、业务员（无字段选择 UI）、后道（按模板导出） |
| 前端入口 | `pages/Admin/ExportTemplates/index.tsx` 增"作为该模块默认导出模板"开关；子工单页"导出"按钮直接调接口、不弹字段选择 UI；`pages/MyDispatched/Detail/index.tsx` 导出按钮 |
| 后端能力 | `ExportTemplate.moduleCode` + `fieldList(jsonb)` + `isShared`（已存在，已被 `DispatchedOrderService` 注入）；`POST /api/dispatched-orders/:id/export` 已存在；新增 `POST /api/dispatched-orders/export-by-template` 批量导出（基于过滤条件 + 默认模板）；`POST /api/work-orders/export`（参考 §G） |
| 数据库变更 | 可选 `export_templates.is_default boolean` |
| 阻塞风险 | 🟢 R-I1：字段权限交集（导出列受 `field_permissions` 进一步过滤）；R-I2：导入/导出字段集一致性需 admin 配置时校验 |
| 验收标准 | _Given_ admin 为合同签订配置默认模板（8 字段） _When_ 后道导出 _Then_ 导出 Excel 仅这 8 列且顺序正确；_Given_ 用户视角 _Then_ 不出现字段选择对话框；_Given_ 字段权限对某列 hidden _Then_ 该列从导出结果剔除 |

| 用例编号 | 标题 | 类型 |
|---|---|---|
| TC-I-01 | 默认模板导出：列数 / 列序 / 列名（中文表头）正确 | 补充 |
| TC-I-02 | 用户侧无字段选择 UI（按钮直接出文件） | 补充 |
| TC-I-03 | 导入模板与导出模板字段集一致（admin 校验） | 补充 |
| TC-I-04 | 字段权限过滤：hidden 字段从导出剔除 | 复用（QA 上轮 §7.3） |
| TC-I-05 | 多模块切换：合同/入职联系/数据录入/社保 各模板互不污染 | 补充 |

---

### J. 后道批量退回 + 批量导入办理/退回/修改 【P0 / 🔴】

**会议要点**：
- 批量退回（系统勾选）：新增功能（已支持批量完成）
- 批量导入更新状态：身份证号匹配 → 选完成/退回；仅更新状态、忽略其他字段修改
- 批量导入修改字段（仅入职联系工单 + 银行卡相关字段）：白名单锁定，其他字段忽略；修改后**暂存语义**（不自动变更状态，需另行批量办理）

| 维度 | 内容 |
|---|---|
| 涉及角色 | 后道五类专员（合同/入职联系/数据录入/社保/共享） |
| 前端入口 | `pages/MyDispatched/index.tsx` 增"批量操作"下拉（批量退回 / 批量完成）；新增 `pages/MyDispatched/Import/Handle/index.tsx`、`Import/Return/index.tsx`、`Import/Modify/index.tsx`；复用 `components/ExcelUploader/index.tsx`；模板下载走后端 `/dispatched-orders/import-template?type=handle\|return\|modify` |
| 后端能力 | `POST /api/dispatched-orders/batch-return`（≤50，复用 `returnOrder` + `DispatchedOrderReturnRecord`，参数 `{ ids[], reason, returnedFields? }`）；`POST /api/dispatched-orders/import-handle`（multipart：file + moduleCode + decision: complete\|return + 可选 remark；身份证匹配代办；只改状态）；`POST /api/dispatched-orders/import-return`（按身份证 + reason 列退回）；`POST /api/dispatched-orders/import-modify`（仅 onboarding_contact 银行卡字段白名单；写 extraData + dirty mark + 通知；不改状态）；4 接口复用 `ImportJobService` 骨架；新增 `ImportJobType.dispatched_handle / dispatched_return / dispatched_modify` |
| 数据库变更 | 复用 `import_jobs` 表；`ImportJobType` 枚举扩展；如需暂存可 `dispatched_orders` 增 `pending_extra_data jsonb`（可选） |
| 阻塞风险 | 🔴 R-J1：导入修改字段白名单遗漏导致越权写入；R-J2：批量退回大事务锁竞争（建议 5 个一批拆分）；R-J3：导入文件列变更导致解析失败；R-J4：暂存语义跨页面可见性（业务员"我的代办"如何区分"已暂存修改" vs "未修改"）；R-J5：身份证匹配多条/无匹配的错误处理 |
| 验收标准 | _Given_ 50 条子工单选中 + 退回原因 _Then_ batch-return 成功，DispatchedOrderReturnRecord 写入 50 条；_Given_ Excel 含 40 条身份证 + decision=complete _Then_ 仅这 40 条状态变 COMPLETED，其余字段值不变；_Given_ Excel 同时改了非白名单字段 _Then_ 后端忽略并在错误报表中提示；_Given_ onboarding_contact import-modify 修改银行卡 _Then_ extraData 写入 + dirty mark + 通知，状态保持原值；_Given_ 任何匹配失败（身份证 not found / 多条匹配 / 子单已 COMPLETED） _Then_ 错误报表逐行说明，不阻断成功条目 |

| 用例编号 | 标题 | 类型 |
|---|---|---|
| TC-J-01 | 批量退回（系统勾选）≤ 50 条端到端 + 退回原因写入 | 补充 |
| TC-J-02 | 批量退回：超过 50 条 → 400 + 错误提示 | 补充（边界） |
| TC-J-03 | 导入批量办理 complete：状态变更 + 其他字段不污染 | 复用（QA 上轮 §8.2） |
| TC-J-04 | 导入批量办理 return：状态变更 + return_reason 列写入 | 补充 |
| TC-J-05 | 导入批量修改 onboarding_contact 银行卡（白名单） | 补充 |
| TC-J-06 | 导入批量修改：篡改非白名单字段 → 后端忽略 + 错误报表行级提示 | 补充（重要风控） |
| TC-J-07 | 导入批量修改：暂存语义校验（状态不变 + 业务员主单同步） | 补充（核心） |
| TC-J-08 | 暂存修改后再发起批量办理：30 条标记完成 + 10 条不办的 | 补充 |
| TC-J-09 | 身份证号无匹配 → 错误报表行级提示，成功条目不阻断 | 复用（QA 上轮 §8.4） |
| TC-J-10 | 身份证号多条匹配 → 错误报表 + 跳过 | 补充 |
| TC-J-11 | 子单已 COMPLETED 时的导入 complete → 跳过 + 报表 | 补充 |
| TC-J-12 | 非 onboarding_contact 模块尝试 import-modify → 403 / 拒绝 | 补充（白名单） |
| TC-J-13 | 模板下载：办理 / 退回 / 修改三种 Excel 模板各列正确 | 补充 |
| TC-J-14 | ImportJob 进度 SSE / 错误报表下载 | 复用（回归用例总纲） |
| TC-J-15 | 大文件（5000 行）导入性能与内存基线 | 补充（性能） |

---

### K. 操作权限规则细化 + 撤回通过后直接作废免审 【P0 / 🟡】

**会议要点**：
- 业务员：单条新增 / 单条修改 / 批量导入；无批量修改；仅未办理工单可修改/撤回；催办支持单条+批量
- 撤回 / 作废发起需后道审批；**审批通过撤回后**业务员直接作废**不再审批**
- 后道：单条办理 / 系统批量办理 / 导入批量办理；单条退回 / 批量退回 / 导入批量退回；仅单条修改 / 导入批量修改；不支持系统勾选批量修改

| 维度 | 内容 |
|---|---|
| 涉及角色 | 业务员、后道五类、admin |
| 前端入口 | `pages/MyDispatched/index.tsx` + `pages/OnboardingModule/index.tsx` 按钮组按 role × status 显隐；批量操作菜单（系统勾选）按矩阵收紧；`pages/Admin/Roles/RoleActionPermissions` 维护权限矩阵 |
| 后端能力 | `WorkOrderService.assertCanWithdraw / assertCanVoid / assertCanRequestVoid` 校验状态 + role；新增 `voidWithdrawn` 路径（撤回后直接作废免审，写 OperationLog 但不发后道审批通知）；`role_action_permissions` 表 + 拦截器 |
| 数据库变更 | 利用现有 `role_action_permissions` 维护；如需新增"暂存"动作类型可扩 actionType |
| 阻塞风险 | 🟡 R-K1：撤回审批通过后直接作废"不再审批"语义补丁需要新方法 `voidWithdrawn` 避免污染原 void 流；R-K2：操作日志是否记录"免审作废"+ 是否仍发通知（待确认）；R-K3：业务员/后道操作矩阵在前后端两侧一致性 |
| 验收标准 | _Given_ 业务员 _Then_ 不出现"批量修改"按钮；_Given_ 已办子工单 _Then_ 业务员"修改/撤回"按钮 disabled；_Given_ 业务员发起撤回 → 后道审批通过 _Then_ 子工单回到待派发；_Given_ 此时业务员点作废 _Then_ 直接 VOID 终态（无审批中状态、写 OperationLog）；_Given_ 后道 _Then_ 系统勾选无"批量修改"入口（但有"批量退回 + 批量完成"+ 导入三类） |

| 用例编号 | 标题 | 类型 |
|---|---|---|
| TC-K-01 | 业务员操作矩阵：新增 / 修改 / 批量导入 / 撤回 / 催办 | 复用（QA 上轮 §9.1） |
| TC-K-02 | 业务员无"批量修改"入口（系统勾选/导入均无） | 补充 |
| TC-K-03 | 已办工单：修改/撤回按钮 disabled + 后端 403 兜底 | 补充 |
| TC-K-04 | 撤回审批中 → 业务员二次撤回 disabled | 补充 |
| TC-K-05 | 撤回审批通过 → 业务员作废免审：直接 VOID + OperationLog 记录 | 补充（核心场景） |
| TC-K-06 | 撤回审批通过 → 业务员作废免审：是否仍发后道通知（待确认） | 补充（待确认项） |
| TC-K-07 | 后道操作矩阵：单条/批量/导入 三种办理 + 三种退回 + 仅单条/导入修改 | 复用（QA 上轮 §9.4） |
| TC-K-08 | 后道无系统勾选批量修改入口（仅勾选退回/完成） | 补充 |
| TC-K-09 | 催办批量（业务员系统勾选）+ 节流（30 分钟） | 补充 |
| TC-K-10 | 角色权限拦截器（`role_action_permissions`）端到端 | 复用（回归用例总纲） |

---

### L. 操作日志保留 30 天 + 定时清理 【P1 / 🟢】

**会议要点**：操作日志已记录操作人/操作类型；按 30 天周期清理（初步），后续可调；admin 可配。

| 维度 | 内容 |
|---|---|
| 涉及角色 | admin |
| 前端入口 | 新增 `pages/Admin/SystemSettings/OperationLogRetention/index.tsx`（按 actionType 分类配置） |
| 后端能力 | `OperationLogCleanupService`（已实装 `@Cron('0 0 3 * * *')`，默认 365 天 / [7, 3650]）调整默认 30 天；`system_settings.operation_log.retention_days` 改 jsonb：`{default, by_action_type}`；新 API `GET / PUT /admin/system-settings/operation-log-retention` |
| 数据库变更 | `system_settings.value` 已是 jsonb 即可；批量删 2000 行/批 |
| 阻塞风险 | 🟢 R-L1：撤回/作废审计建议保留 ≥ 5 年；R-L2：admin UI 必须有警示弹窗防误删 |
| 验收标准 | _Given_ admin 设置默认保留 30 天 _When_ Cron 凌晨 3 点执行 _Then_ 30 天前的日志被删除（按 action_type 分桶 cutoff）；_Given_ withdraw_request 配置 1825 天 _Then_ 撤回类日志独立保留；_Given_ admin UI _Then_ 修改保留期 < 7 / > 3650 报错 |

| 用例编号 | 标题 | 类型 |
|---|---|---|
| TC-L-01 | 默认保留 30 天 + Cron 删除 30 天前日志 | 补充 |
| TC-L-02 | 按 actionType 分桶保留：撤回/作废类 1825 天 | 补充 |
| TC-L-03 | admin UI：保留天数 [7, 3650] 边界校验 + 警示弹窗 | 补充 |
| TC-L-04 | 批量删除 2000 行/批 + 多桶顺序执行 | 补充（性能） |
| TC-L-05 | 操作日志写入完整（操作人 / actionType / before/after） | 复用（QA 上轮 §10.1） |

---

## 3. 用例汇总（按优先级与覆盖维度）

| 维度 | P0 用例数 | P1 用例数 | 复用 | 补充 | 合计 |
|---|---|---|---|---|---|
| A 子工单操作下沉 | 10 | 0 | 3 | 7 | 10 |
| B 双向同步与通知 | 9 | 0 | 3 | 6 | 9 |
| C 菜单权限收敛 | 6 | 0 | 2 | 4 | 6 |
| D 派发 + AB 角 | 0 | 8 | 3 | 5 | 8 |
| E 状态合并 7 类 | 7 | 0 | 2 | 5 | 7 |
| F 界面优化 | 5 | 0 | 1 | 4 | 5 |
| G 历史工单 | 0 | 5 | 0 | 5 | 5 |
| H 表头筛选 | 5 | 0 | 0 | 5 | 5 |
| I 导出模板绑定 | 0 | 5 | 1 | 4 | 5 |
| J 批量退回/导入 | 15 | 0 | 3 | 12 | 15 |
| K 操作权限矩阵 | 10 | 0 | 3 | 7 | 10 |
| L 操作日志清理 | 0 | 5 | 1 | 4 | 5 |
| **总计** | **67** | **23** | **22** | **68** | **90** |

> 复用 = 已在 E2E_TEST_PLAN_0520 / 回归用例总纲 / QA 上一轮细化清单中存在；补充 = 本矩阵新增。

---

## 4. 风险登记表（合并 §A–§L，按等级排序）

| 风险编号 | 等级 | 描述 | 触发场景 | 缓解 |
|---|---|---|---|---|
| R-A1 | 🔴 | 撤回/作废迁移到子工单粒度后，主工单状态聚合语义未定 | 多子工单部分 PENDING 部分 WITHDRAW_PENDING 时主单状态值 | 架构师评审：主工单状态由 service 派生（不持久化）或保留持久但表示"任一/全部已撤回"简化语义 |
| R-A2 | 🔴 | 旧调用主单 withdraw/void/urge 接口的代码未清理 | 业务员通过老 URL 入口仍可触发主单操作 | grep `services/workOrders.ts` + 全局搜索按钮 → PR 前 review |
| R-E1 | 🔴 | dashboard 卡片 `processing` 口径变化 | 现状包含 PENDING 还是仅 PROCESSING | 与 architect/leader 确认指标口径，CR 同步 |
| R-J1 | 🔴 | 导入修改字段白名单遗漏导致越权写入 | onboarding_contact 之外的模块绕过校验 | 后端 import-modify 必须双重校验 module + field code 白名单；测试 TC-J-12 |
| R-J4 | 🔴 | 暂存语义跨页面可见性 | 业务员主工单看不到"已暂存"导致重复修改 | 在主工单详情显示"后道暂存中"徽章 + dirty 标识 |
| R-K1 | 🟡 | "撤回通过后直接作废免审"独立路径 | 复用 void 流可能重新触发审批 | 新增 `voidWithdrawn` 方法独立写 OperationLog，不发审批通知 |
| R-K2 | 🟡 | 撤回作废审计是否仍通知后道 | 待确认项 | 与产品/Leader 确认（参考下方"待确认"清单） |
| R-B1 | 🟡 | 反向通知量过大 | 后道每字段一改一通知 | 5 分钟节流批合并；TC-B-07 |
| R-B2 | 🟡 | dirty 标记互相覆盖 | 同字段同轮次双向修改 | 复用 unique 索引；TC-B-06 |
| R-D1 | 🟡 | AB 池既不是 fixed 也不是纯 pool | admin 误配 | UI 严格校验 + 后端二次校验 |
| R-G1 | 🟡 | 历史工单 default latest N 待确认 | N 取多少 | 建议默认 100，待 Leader/产品确认 |
| R-G2 | 🟡 | 历史页 SQL 性能（月份 + 分页） | 大数据量分页慢 | 评估 created_at 索引；TC-G-05 |
| R-J2 | 🟡 | 批量退回大事务锁竞争 | 50 条一次循环 | 5 条一批拆分；TC-J-01 |
| R-J3 | 🟡 | 导入文件列变更导致解析失败 | Excel 模板被人手动改列名 | 模板由后端固定生成；强制列名校验；TC-J-13 |
| R-J5 | 🟡 | 身份证匹配多条/无匹配错误处理 | 重名 / 跨模块同身份证 | 错误报表逐行；TC-J-09 / J-10 |
| R-A3 | 🟡 | 催办节流绕过（4 个子单分别催办） | 业务员通过子单分别点催办 | throttle key `${parentId}:${moduleCode}` + admin `${parentId}:__all__`；TC-A-05 |
| R-C1 | 🟢 | 旧 deeplink 兼容 | QQ/微信复制的 `/work-orders` 链接 | 302 + `from=work-orders` |
| R-D3 | 🟢 | "公共池"文案在多处出现 | grep 不全导致前端残留 | 全局 grep `公共池` / `pool` 文案 |
| R-H1 | 🟢 | 时间字段精确度 | 会议倾向不到日 | 确认产品口径；TC-H-02 |
| R-L1 | 🟢 | 撤回/作废审计被误删 | 默认 30 天覆盖审计需求 | actionType 分桶；admin UI 警示弹窗 |
| R-L2 | 🟢 | admin 误改保留期 | 用户输入 < 7 / > 3650 | 后端 [7, 3650] 校验 + 前端弹窗确认 |

---

## 5. 待确认项（请 Leader / 测试负责人 / 产品答复）

1. **§A2** 撤回审批粒度：按子工单逐条审批 vs 按"模块"批量审批？（默认按子工单）
2. **§A3** `WorkOrderStatus.DRAFT` 是否仍保留作为"业务员暂存草稿"？（前端不展示但内部保留 vs 完全删除）
3. **§E1** Dashboard `processing` 卡片口径：含 PENDING 还是仅 PROCESSING？
4. **§G1** 历史工单 default latest N：50 / 100 / 200？
5. **§J5** import-modify 银行卡字段白名单清单：除 `bank_card_no`、`bank_account_name` 还有哪些？（开户行 / 支行？）
6. **§K2** 撤回通过后业务员直接作废："不再审批"是否仍写 OperationLog？是否仍发后道通知？
7. **§J7** 暂存语义跨页面：业务员主工单视角下"已暂存修改"如何展示？（徽章 / dirty Tag / 不展示）
8. **§D2** 公共池→AB 角文案下线时间表：是否一次性切换、是否需要灰度期间双展示？
9. **§G3** 历史工单页与 `MyWork/Done` 是否共用一个视图？（架构师两个文档对此口径不一致）
10. **§F4** 子工单进度模块业务员是否一定保留？（会议倾向"先放着、看反馈"）

---

## 6. 验收交付物清单（开发完成后由 QA 提交）

| # | 交付物 | 形式 | 触发条件 |
|---|---|---|---|
| 1 | 90 用例 × 测试结果矩阵 | Excel / Markdown 表 | 全量回归完成 |
| 2 | P0 阻断回归报告 | Markdown | P0 用例 100% 通过或挂起 |
| 3 | 字段同步双向 + 通知端到端报告 | Markdown + 截图 | §B 用例完结 |
| 4 | 状态流转视频/截图（撤回/作废/退回/重提） | 媒体 + 文档 | §A + §E 用例完结 |
| 5 | 批量导入错误报表样本（成功 / 失败 / 边界） | Excel | §J 用例完结 |
| 6 | 性能基线报告（历史页 / 批量导入 5000 行） | Markdown | §G + §J 性能用例完结 |
| 7 | 视觉回归对照（仪表盘 / 顶栏 / 子工单进度） | 截图集 | §F 完结 |
| 8 | 风险点关闭说明（R-A1 / R-J1 / R-J4 等核心红色风险） | Markdown | 上线前 |

---

## 7. 与已有 QA 交付物的关系

| 上游文档 | 与本矩阵关系 |
|---|---|
| `E2E_TEST_PLAN_0520.md` | 本矩阵 §A/§B/§E/§J 大量复用其端到端流程脚本 |
| `TEST_PLAN_0518_INCREMENTAL.md` | 本矩阵承接其增量测试范围；本期会议把"主工单只读 + AB 角 + 暂存语义"列为新阻断 |
| `回归用例总纲.md` | 本矩阵保持回归口径一致；新增 68 条补充用例不替换回归用例 |
| `QA_DASHBOARD_REGRESSION_20260521.md` | 仪表盘相关 §F 直接复用其用例，并补充顶栏视觉回归 |
| `SUPPLEMENTAL_REGRESSION_Q1_Q5_*` | Q1–Q5 已覆盖的回归不重复；本矩阵覆盖 Q6–Q12 之外的会议新调整 |
| `FINAL_REGRESSION_ACCEPTANCE_20260521.md` | 本矩阵作为下一轮"开发完成 → 全量回归"的入口文档 |
| 上一轮 QA 细化用例清单（§1–§10） | 本矩阵编号 TC-* 与上一轮章节一一映射，复用条目均标注 |

---

> 本矩阵不依赖任何代码修改，仅基于现有架构师/测试输出与代码现状汇总。开发完成后，QA 将按本矩阵执行 90 用例并交付 §6 中的 8 类验收物。
