# P5 权限控制与编辑重提交流程验收方案（2026-05-20）

> 角色：测试工程师  
> 任务：P5-权限控制验收方案：角色矩阵 + 编辑重提交流程  
> 产物：
> - `docs/P5_PERMISSION_RESUBMIT_ACCEPTANCE_0520.md`
> - `docs/scripts/p5_permission_resubmit.http`
>
> 说明：本任务只准备验收脚本和测试用例，不启动服务、不执行破坏性写入测试。真实执行前需替换脚本中的 Token、工单 ID、测试字段/模板 ID。

---

## 1. 验收范围与准入标准

### 1.1 本轮必须验收的 4 类需求

| 范围 | 用户要求 | 验收层级 | 阻断级别 |
|---|---|---|---|
| 字段管理权限 | 字段管理权限只授权给管理员 | 菜单不可见、直达路由 403、API 403 | P0 |
| 导出模板权限 | 导出模板配置权限仅开放给管理员，非管理员无需显示菜单 | 菜单不可见、直达路由 403、API 403 | P0 |
| 门户/仪表盘配置权限 | 门户（仪表盘）配置权限仅开放给管理员，非管理员无需显示菜单 | 菜单不可见、直达路由 403、API 403 | P0 |
| 工单编辑强制重提交 | 前端编辑后不能直接保存，必须走重新提交审批/派发流程 | UI 提示、API 状态、待办/审计/通知重置 | P0 |

### 1.2 代码路径对齐（用于测试定位）

| 类型 | 已定位路径/端点 | 验收关注点 |
|---|---|---|
| 前端路由 guard | `frontend/src/config/routeVisibility.ts` | `/admin/fields`、`/admin/field-permissions`、`/admin/export-templates`、`/export-templates`、`/admin/system-settings` 均应仅 admin |
| 前端详情编辑 | `frontend/src/pages/WorkOrders/Detail/index.tsx` | “保存并重新提交”按钮、确认弹窗、保存后重提交流程 |
| 后端字段管理 | `GET/POST/PUT/DELETE /admin/fields`、`GET/POST /admin/field-permissions/*` | `@Roles('admin')` 生效，非管理员 401/403 |
| 后端导出模板 | `/admin/export-templates`、兼容 `/export-templates` | 管理端读写接口均 admin-only；兼容路径不能越权 |
| 后端门户/仪表盘配置 | 当前可验：`/admin/system-settings/operation-log-retention`；若后续新增 `/admin/dashboard-config` 或 `/admin/portal-config`，同标准纳入 | 配置类接口 admin-only；普通 `GET /dashboard/cards` 不属于配置入口，不应误拦截 |
| 后端编辑重提交流程 | `PUT /work-orders/:id`、`POST /work-orders/:id/resubmit`、`GET /work-orders/:id/timeline` | 编辑后不得仅保存字段继续旧流程；必须生成 `salesperson_modify_resubmit`/重派发记录 |

### 1.3 PASS / FAIL 总规则

- PASS：菜单、路由、API 三层一致；admin 可访问并可配置；所有非 admin 角色配置菜单不可见、直达路由无权、API 返回 401/403 且不泄露配置数据。
- PASS：工单在 `processing` 或 `returned` 状态被业务员编辑后，UI 明确提示“保存并重新提交”，确认后字段更新并触发重新提交/重派发，时间线/审计/通知能证明原审批或后道待办已重置。
- FAIL：任一非管理员能看到配置菜单、直达配置页面、或调用配置 API 成功；任一编辑行为只保存字段但不重新提交；前端显示“保存成功”但实际 resubmit 失败也视为 FAIL。

---

## 2. 10 个角色 × 3 个配置模块权限矩阵

> 说明：第 10 类“普通非管理员/无配置权限账号”用于覆盖无业务管理身份但可登录系统的账号；若环境没有该账号，可用任一不含 admin 角色的普通测试账号代替。

### 2.1 角色定义与账号准备

| 序号 | 角色代码/账号类型 | 中文角色 | 是否管理员 | Token 变量建议 |
|---:|---|---|---|---|
| 1 | `admin` | 系统管理员 | 是 | `ADMIN_TOKEN` |
| 2 | `business_owner` / `biz_manager` | 业务负责人 | 否 | `BUSINESS_OWNER_TOKEN` |
| 3 | `business_group_leader` / `biz_leader` | 业务组长 | 否 | `BUSINESS_LEADER_TOKEN` |
| 4 | `business_group_member` / `biz_member` | 业务员 | 否 | `BUSINESS_MEMBER_TOKEN` |
| 5 | `data_entry_leader` | 数据录入负责人 | 否 | `DATA_ENTRY_TOKEN` |
| 6 | `shared_team_owner` / `shared_leader` | 共享负责人 | 否 | `SHARED_OWNER_TOKEN` |
| 7 | `labor_contract_member` / `contract_specialist` | 劳动合同专员 | 否 | `CONTRACT_TOKEN` |
| 8 | `onboarding_resignation_member` / `onboarding_specialist` | 入离职联系专员 | 否 | `ONBOARDING_TOKEN` |
| 9 | `social_insurance_specialist` / `social_security_team` | 社保公积金专员 | 否 | `SOCIAL_TOKEN` |
| 10 | `non_admin` / 无 admin 角色 | 普通非管理员 | 否 | `NON_ADMIN_TOKEN` |

### 2.2 权限矩阵（期望结果）

| 角色 | 字段管理 `/admin/fields`, `/admin/field-permissions` | 导出模板配置 `/admin/export-templates`, `/export-templates` | 门户/仪表盘配置 `/admin/system-settings`（或 dashboard/portal config） |
|---|---|---|---|
| 系统管理员 `admin` | 允许：菜单可见、路由可进、API 200 | 允许：菜单可见、路由可进、API 200 | 允许：菜单可见、路由可进、API 200 |
| 业务负责人 | 禁止：菜单不可见、路由 403、API 403 | 禁止：菜单不可见、路由 403、API 403 | 禁止：菜单不可见、路由 403、API 403 |
| 业务组长 | 禁止 | 禁止 | 禁止 |
| 业务员 | 禁止 | 禁止 | 禁止 |
| 数据录入负责人 | 禁止 | 禁止 | 禁止 |
| 共享负责人 | 禁止 | 禁止 | 禁止 |
| 劳动合同专员 | 禁止 | 禁止 | 禁止 |
| 入离职联系专员 | 禁止 | 禁止 | 禁止 |
| 社保公积金专员 | 禁止 | 禁止 | 禁止 |
| 普通非管理员 | 禁止 | 禁止 | 禁止 |

### 2.3 矩阵执行方法

每个非管理员角色都执行以下三层检查：

1. **菜单层**：登录前端，左侧菜单不得出现：
   - 字段配置、字段权限、我的字段权限（本轮要求字段管理只给 admin，因此 `/my-field-permissions` 也不得给非 admin 显示）
   - 导出模板、导出模板配置
   - 门户配置、仪表盘配置、系统设置（用于门户/仪表盘配置）
2. **路由层**：浏览器直达以下 URL，应跳转 `/403` 或无权页，不得渲染管理表格：
   - `/admin/fields`
   - `/admin/field-permissions`
   - `/my-field-permissions`
   - `/admin/export-templates`
   - `/export-templates`
   - `/admin/system-settings`
3. **API 层**：使用对应 Token 调用 `docs/scripts/p5_permission_resubmit.http` 中的 P5-A/P5-B/P5-C，请求应返回 401/403，不得返回配置数据。

---

## 3. 权限测试用例

### 3.1 字段管理权限

| 用例 ID | 角色 | 步骤 | 预期结果 | 证据 |
|---|---|---|---|---|
| P5-A-01 | admin | 打开菜单并直达 `/admin/fields`、`/admin/field-permissions` | 页面正常渲染；字段列表/权限矩阵可读取 | 菜单截图、页面截图、API 200 |
| P5-A-02 | admin | 调 `GET /admin/fields?page=1&pageSize=20`、`GET /admin/field-permissions/matrix` | 200，返回字段配置/权限矩阵 | 请求/响应 |
| P5-A-03 | 任一非 admin | 登录后查看菜单 | 不显示字段配置、字段权限、我的字段权限 | 10 角色菜单截图或录像 |
| P5-A-04 | 任一非 admin | 直达 `/admin/fields`、`/admin/field-permissions`、`/my-field-permissions` | 403/无权页；不渲染管理页面 | 10 角色 URL 截图 |
| P5-A-05 | 任一非 admin | 调字段管理读写 API | 401/403；不返回字段配置数据，不写入 | REST 脚本响应 |

### 3.2 导出模板权限

| 用例 ID | 角色 | 步骤 | 预期结果 | 证据 |
|---|---|---|---|---|
| P5-B-01 | admin | 打开 `/admin/export-templates` 和兼容入口 `/export-templates` | 页面可访问，模板列表可读取 | 页面截图、API 200 |
| P5-B-02 | admin | 调 `GET /admin/export-templates`，可选创建测试模板 | 200/201，模板字段勾选可保存回显 | 请求/响应 |
| P5-B-03 | 任一非 admin | 菜单检查 | 不显示导出模板/导出模板配置 | 10 角色菜单截图 |
| P5-B-04 | 任一非 admin | 直达 `/admin/export-templates`、`/export-templates` | 403/无权页 | URL 截图 |
| P5-B-05 | 任一非 admin | 调 `/admin/export-templates` 与 `/export-templates` 读写 API | 401/403；兼容路径不能绕过 admin-only | REST 脚本响应 |

### 3.3 门户/仪表盘配置权限

| 用例 ID | 角色 | 步骤 | 预期结果 | 证据 |
|---|---|---|---|---|
| P5-C-01 | admin | 打开 `/admin/system-settings`（如后续有 `/admin/dashboard-config` 或 `/admin/portal-config` 也执行） | 页面正常渲染 | 页面截图 |
| P5-C-02 | admin | 调 `GET/PUT /admin/system-settings/operation-log-retention` | 200；配置可读取/保存 | 请求/响应 |
| P5-C-03 | 任一非 admin | 菜单检查 | 不显示门户配置、仪表盘配置、系统设置等配置菜单 | 10 角色菜单截图 |
| P5-C-04 | 任一非 admin | 直达 `/admin/system-settings` | 403/无权页 | URL 截图 |
| P5-C-05 | 任一非 admin | 调配置 API | 401/403；不能读取或修改配置 | REST 脚本响应 |
| P5-C-06 | 任一业务角色 | 调普通统计接口 `GET /dashboard/cards` | 不应因配置权限收紧而误伤业务仪表盘查看 | API 200 或按原业务权限返回 |

---

## 4. 工单编辑强制重提交流程验收脚本

### 4.1 前置数据

准备 3 类工单：

| 数据 ID | 状态 | 创建人 | 子单状态 | 用途 |
|---|---|---|---|---|
| P5-WO-01 | `processing` | 当前业务员 | 至少 1 个子单 `pending` 或 `processing`，且无 completed 子单 | 验证办理中编辑必须重提交 |
| P5-WO-02 | `returned` | 当前业务员 | 存在退回记录 | 验证退回后修改重提交 |
| P5-WO-03 | `completed` / `void` / `withdrawn` | 当前业务员或其他人 | 终态 | 验证终态不可编辑/不可重提交 |

### 4.2 UI 层验收

| 用例 ID | 场景 | 步骤 | 预期结果 | FAIL 条件 |
|---|---|---|---|---|
| P5-D-01 | 办理中工单编辑入口 | 业务员打开 P5-WO-01 详情，点击编辑 | 页面显示提示：“编辑后将自动重新提交，原审批将被重置”；按钮文案为“保存并重新提交” | 只有“保存”按钮或无重提交说明 |
| P5-D-02 | 确认弹窗 | 修改 `mobile`/`special_remark` 等字段并点击保存 | 弹窗标题/正文明确说明必须重新提交、原审批/后道待办会重置；取消后数据不变 | 取消仍保存；弹窗文案不说明重提交影响 |
| P5-D-03 | 确认后提交流程 | 点击确认 | 前端不得只提示“保存成功”；必须完成重新提交后提示“已重新提交/已重新进入派发流程” | 保存成功但 resubmit 失败；页面仍停留旧流程状态 |
| P5-D-04 | 退回工单编辑 | 业务员打开 P5-WO-02 修改并确认 | 字段更新、状态进入重新提交/待派发流程、后道待办重置 | 修改后仍为旧退回/旧审批链 |
| P5-D-05 | 终态工单 | 打开 P5-WO-03 | 不显示编辑/重提交入口；强行 API 调用返回 409/403 | 终态仍可编辑或重新提交 |

### 4.3 API 层验收

按 `docs/scripts/p5_permission_resubmit.http` 的 P5-D 执行，重点断言：

1. `PUT /work-orders/:id` 不得成为“静默保存且继续旧 processing 审批链”的接口。
2. 如果前端采用 `PUT` 后再 `POST /resubmit` 的两步链路，则两步必须整体成功；若 `PUT` 已把状态改为 `pending` 导致后续 `POST /resubmit` 返回 409，应判定为 FAIL，因为用户会看到“保存或重新提交失败”。
3. `GET /work-orders/:id/timeline` 或操作日志中必须出现：
   - `salesperson_modify_resubmit` 或等价“业务员修改后重提”动作；
   - `oldStatus`、`newStatus`；
   - 被重派发/重置的子单信息。
4. 子单/待办检查：未完成子单应重置为 `pending` 并刷新 handler/visibleFields；已完成子单如按规则不允许编辑，应在编辑阶段返回 409 并提示“需退回后修改”。
5. 通知检查：后道处理人应收到 `dispatch_resubmit` 或等价重派发通知；业务员/后道列表显示最新字段，不得保留旧字段快照。

### 4.4 代码阅读发现的重点风险（执行时必须关注）

- 前端详情页当前设计包含 `updateWorkOrder` 后继续调用 `resubmitWorkOrder` 的两步链路。
- 后端 `WorkOrderService.update` 已有“processing/returned 编辑后置为 pending 并写 `salesperson_modify_resubmit`”逻辑。
- 因此真实执行时必须确认两者协议一致：
  - 要么 `PUT` 只是保存草稿且 `POST /resubmit` 成功；
  - 要么 `PUT` 已原子完成重提交，前端不应再调用会失败的 `POST /resubmit`。
- 如果出现“`PUT` 成功但 `POST /resubmit` 因状态已变为 pending 返回 409”，本轮 P5-D-03 必须判 FAIL，并回退给前后端修复协议。

---

## 5. 回归测试检查清单

### 5.1 权限收紧不能误伤的功能

| 检查项 | 角色 | 验收点 |
|---|---|---|
| 普通仪表盘查看 | 10 角色中所有可登录用户 | `GET /dashboard/cards`、首页仪表盘仍按原角色范围可见；不要把“仪表盘配置权限”误拦成“仪表盘查看权限” |
| 我的工单四视图 | 业务员、组长、后道、共享负责人 | `/my-work/initiated`、`/my-work/pending`、`/my-work/done`、`/my-work/team` 权限不回归 |
| 新建/提交工单 | 业务员、组长、admin | 草稿创建、提交、派发仍可用 |
| 后道办理 | 数据录入、合同、入离职、社保等后道角色 | 子单接受/完成/退回仍可用 |
| 字段权限运行态 | 后道角色 | 虽不能进入字段管理配置，但办理页仍按字段权限展示 visible/editable 字段 |
| 导出业务功能 | 如果存在业务导出按钮 | 管理“模板配置”仅 admin；业务侧已授权的实际导出功能不应被误删，除非产品明确也禁止 |
| 操作日志/通知 | admin、业务员、后道 | 重提交、字段变更、重派发通知仍产生且分类正确 |
| 工单流程配置 | admin/非 admin | 作为相邻配置入口回归：`/admin/workflows` admin 可见，非 admin 403 |

### 5.2 建议执行命令

> 真实执行阶段在服务和依赖可用后运行，当前任务不执行。

```bash
# 后端单元/集成基线
cd backend
npm run test
npm run build

# 前端单元、路由 guard、详情页重提交单测
cd frontend
npm run test -- --run
npm run build

# 若测试环境可用，执行浏览器 E2E
cd frontend
npm run e2e
```

### 5.3 最小人工回归顺序

1. admin 登录：确认字段管理、导出模板配置、门户/系统设置、流程配置菜单均可见且可打开。
2. 9 个非 admin 角色逐个登录：确认三类配置菜单不可见，直达 URL 为 403。
3. 使用 REST 脚本逐个 Token 跑 P5-A/B/C：所有非 admin 配置 API 403。
4. 业务员执行 P5-D：办理中编辑必须提示并重新提交；退回编辑必须重新提交；终态不可编辑。
5. 后道账号检查：重提交后待办读取最新字段，通知出现，旧待办不继续错误办理。
6. 跑 `backend npm run test`、`frontend npm run test/build`，确保已有 P0/P1 修复不回归。

---

## 6. 失败记录模板

```text
[P5 验收失败]
用例 ID：P5-__
角色/账号：
页面 URL：
API：
前置数据：
操作步骤：
预期结果：
实际结果：
截图/响应证据：
初步归因：frontend / backend / permission-config / data / env
阻断级别：P0 / P1 / P2
建议责任人：frontend / backend / architect
```

---

## 7. 本任务结论

已准备本轮 P5 的验收矩阵、UI/API 测试用例、编辑重提交流程脚本和回归清单。真实执行时重点关注两类阻断：

1. 任一非 admin 角色可访问字段管理、导出模板配置、门户/仪表盘配置，即 P0 FAIL。
2. 编辑后出现“字段保存了但未重新提交/前端二次 resubmit 失败/后道继续旧待办”，即 P0 FAIL。
