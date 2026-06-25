# 7ff9a47c 架构与需求统筹验收矩阵

> 任务：验收矩阵与实现边界统筹  
> 角色：架构与需求统筹  
> 日期：2026-06-24  
> 范围：只读分析并输出分批验收矩阵、数据/接口/迁移/种子/测试边界、跨成员冲突风险；未修改业务代码。

## 0. 结论摘要

1. **第一批主流程修复优先级最高**：入职导入模板必须以用户 Excel 为基准逐列对齐；但本仓库当前只发现内置导出模板 Excel（`backend/src/assets/export-templates/*.xlsx`）和字段/模板种子，未发现用户提供的入职导入 Excel 原件，QA 需补充原件作为最终比对证据。
2. **字段口径应统一落在后端种子/校验/导入作业/导出模板/详情模板**：前端 mock 字段仅作兜底展示，不能成为最终口径来源。
3. **是否电子签必须改为 `1.是` / `2.否` 全链路一致**：当前 `seed-fields.ts` 与前端 fallback 仍为 `是/否`，导入字段校验存在枚举别名逻辑，需同步兼容旧值并规范化到新值。
4. **身份证派生字段应在导入确认落库时生成**：`gender`、`birth_date`、`age` 目前字段已存在，导出模板已有性别/试用期公式，但系统详情与导出可见要求不能只依赖 Excel 公式，应写入 `extraData` 并进入详情/导出字段列表。
5. **第二批审批同步建议复用现有轻量模型，最小新增**：现有 `work_order_field_dirty_marks`、`operation_logs`、`notifications` 已能支撑字段变更、待审批内容、脏标记和站内通知；如需批次级审计，可新增最小“字段变更批次/子单结果”表，但第一版可先复用 operation_log + dirty_mark，避免大改。
6. **回滚口径**：审批不通过保留旧值；审批通过前不改已接单子单；未接单子单可直接同步父单并给相关子单脏标记/通知。该口径与 `creator-update`/`modify/approve` 路径基本一致，但主工单 `PUT /work-orders/:id` 仍会直接更新父单，需要约束入口或补统一服务。

## 1. 只读证据与现状

### 1.1 关键代码证据

- 字段种子：`backend/src/database/seeds/seed-fields.ts`
  - 入职字段顺序现状：`ONBOARDING_FIELD_ORDER` 包含 `gender/birth_date/age`、试用期、电子签、合同模板/主体等。
  - 当前 `need_esign` 选项仍为 `['是','否']`，`esign_platform` 为 `['速创','E签宝']`。
  - `need_esign/esign_platform/contract_subject/contract_template` 当前条件必填依赖 `need_company_contract = 是`。
- 导入链路：`backend/src/modules/imports/imports.controller.ts`、`import-job.service.ts`、`work-order-import.service.ts`、`field-validation.service.ts`
  - 预览负责映射候选；确认后作业逐行处理；`validateRow` 承担必填/下拉校验；写入时合并到主工单 `extraData`。
- 主工单修改：`backend/src/modules/work-orders/work-order.service.ts`
  - `update` 允许草稿/处理中/退回/撤回态修改 `extraData`，并创建 dirty mark；存在已完成子单时阻止。
- 子工单字段修改审批：`backend/src/modules/dispatched-orders/dispatched-order.service.ts`
  - `POST /dispatched-orders/:id/creator-update`：未接单直接同步；已接单进入 `MODIFY_PENDING`，pendingFields 写入 operation_log。
  - `POST /dispatched-orders/:id/modify/approve`：同意后合并 pendingFields 到父工单；拒绝不合并。
  - `markAndNotifyAffectedDispatchedOrders`：按变更字段影响所有活跃子单，写 dirty mark 与 notifications。
- 导出模板：`backend/src/database/seeds/seed-export-templates.ts`
  - 速创模板当前“签订方式”常量为 `新签`，需求要求默认 `1.新签`。
  - 速创已包含 `probation_end_date` 公式、`gender` 公式；E签宝已包含合同主体与性别/试用期公式。
- 前端详情/字段兜底：`frontend/src/services/fields.ts`、`frontend/src/pages/WorkOrders/Detail/index.tsx`、`frontend/src/pages/MyDispatched/Detail/index.tsx`
  - fallback 字段仍保留 `是否电子签=是/否`；合同主体/模板字段存在。

### 1.2 未发现/未验证证据

- 未在仓库根、`docs`、`backend/src/assets` 中发现用户提供的“入职导入模板 Excel 原件”。仅发现：
  - `backend/src/assets/export-templates/劳动合同签订批导出模板-速创.xlsx`
  - `backend/src/assets/export-templates/劳动合同签订批导出模板-e签宝.xlsx`
- 因缺少用户 Excel 原件，以下验收必须由 QA 或模板工程师补证：字段逐列顺序、表头标黄、填写要求、示例、隐藏 options sheet、Excel 数据验证源。

## 2. 分批交付边界

### 第一批：入职导入/字段派生/合同导出详情主流程

| 编号 | 需求 | 验收标准 | 建议改动范围 | 不应触碰范围 |
|---|---|---|---|---|
| A1 | 入职导入模板与用户 Excel 逐列一致 | 下载模板与用户文件字段顺序、字段名、填写说明、示例、下拉源、隐藏 options sheet、数据验证源一致；标黄仅表示客户填写/关注，不影响必填判断 | `import-template.service.ts`、`import-template-config.service.ts`、`import_template_fields` 迁移/种子、Excel 生成逻辑 | 不改派单策略、不改权限角色、不以标黄推导 required |
| A2 | 必填/非必填/条件必填以用户文件为准 | 普通必填、非必填、条件必填说明均在模板/预览/确认校验中一致；失败行给出字段名和触发条件 | `seed-fields.ts`、`field-validation.service.ts`、导入 job 行校验 | 不把前端 fallback 当唯一规则源 |
| A3 | 身份证派生性别/出生日期/年龄 | 导入确认后 `extraData.gender/birth_date/age` 有值；详情页、主列表/子单详情、导出表可见；非中国居民身份证或非法证件号不误生成 | `work-order-import.service.ts` 落库前派生；必要时 `work-order-validation.service.ts` 复用；详情/导出模板字段列表 | 不仅依赖 Excel 公式；不覆盖用户已明确填写的合法值，除非需求确认必须强制重算 |
| A4 | 试用期终止年月/结束日期带出 | 导入后系统详情、速创导出、E签宝导出均显示/导出正确；若开始日期+月数可推算，应与 Excel 公式一致 | 导入派生/规范化；`seed-export-templates.ts` 公式和字段映射；详情模板 | 不改合同起止日期业务含义 |
| A5 | 是否电子签改为 `1.是/2.否` | 模板下拉、导入校验、详情展示、导出均使用新值；旧值“是/否”导入可兼容并规范化为 `1.是/2.否` | `seed-fields.ts`、`frontend/src/services/fields.ts` fallback、`field-validation.service.ts` 枚举别名、导入模板 options sheet | 不把 `need_company_contract` 的“是/否”同步改成 `1.是/2.否`，除非用户另行确认 |
| A6 | 条件必填按前置字段值 | 例：`是否电子签=1.是` 时 `电子签平台` 必填；截图字段按用户截图链路设置；错误信息指明前置字段和值 | `conditionalRequired` 种子/迁移、导入 `evaluateCondition`、前端表单 required 提示 | 不沿用当前仅 `need_company_contract=是` 的粗粒度规则作为最终截图口径 |
| A7 | 合同详情页展示合同模板/主体 | 劳动合同新签子单详情和主工单详情可见 `contract_template`、`contract_subject`，值来自同一 `extraData` | 详情模板种子/前端字段渲染/字段权限 | 不新增重复字段名或另建合同专属冗余列 |
| A8 | 速创导出末尾增加合同模板/主体 | 速创导出模板最后两列为劳动合同模板、劳动合同主体；原列顺序不被破坏；签订方式默认 `1.新签` | `seed-export-templates.ts`、必要时迁移更新已存在模板 | 不影响 E签宝模板多行表头结构 |
| A9 | E签宝导出增加劳动合同模板 | E签宝导出包含劳动合同模板字段，表头层级与用户模板一致；合同主体原映射不被破坏 | `seed-export-templates.ts`、标准模板 workbook 写入逻辑 | 不把速创末尾列规则套到 E签宝多行表头 |

### 第二批：字段修改审批同步机制

| 编号 | 需求 | 验收标准 | 建议改动范围 | 不应触碰范围 |
|---|---|---|---|---|
| B1 | 未接单直接同步 | 业务员在子单未接单前修改当前子单字段，父工单 `extraData` 立即更新；相关子单产生 dirty mark/通知；无审批 | 复用 `creatorUpdateFields` 未接单分支；必要时统一入口 | 不经审批、不新增待办审批状态 |
| B2 | 已接单字段变更需审批 | 已接单子单修改后进入 `modify_pending`，原值仍对处理人可见；审批通过前父单不变 | `creatorUpdateFields`、`approveModify`、前端按钮/状态文案 | 不允许主工单 PUT 绕过审批直接覆盖已接单字段 |
| B3 | 审批通过同步所有相关子单 | 通过后合并 pendingFields 到父单，并按字段影响范围给所有活跃相关子单 dirty mark 和站内通知 | `markAndNotifyAffectedDispatchedOrders`；必要时补批次结果记录 | 不同步已撤回/作废子单；已完成子单是否同步需按用户确认，当前主工单 update 已阻止完成子单修改 |
| B4 | 审批拒绝回滚 | 拒绝时不改父单、不改其他子单；恢复原状态；通知发起人 | `approveModify` 拒绝分支、operation_log | 不删除申请日志 |
| B5 | 通知日志 | 第一版只写 notifications/operation_logs/dirty_marks，不接入短信/邮件/外部通知 | `notifications`、`operation_logs` | 不新增外部通知渠道、不改 MockEmail/SMS 行为 |
| B6 | 批次/子单结果审计 | 若验收要求展示每个子单同步成功/跳过原因，允许新增最小表；否则复用 operation_log afterData | 可选新增 `field_change_batches`、`field_change_batch_items` 或以 operation_log payload 承载 | 不引入完整 BPM/工作流引擎重构 |

**对第二批同事的问题答复口径**：

1. 是否允许新增最小表：**允许，但非强制**。当前已有 `work_order_field_dirty_marks`、`operation_logs`、`notifications`，可先复用；如产品要求批次级页面/逐子单处理结果，再新增最小批次表。
2. 审批复用还是新建：**第一版复用现有子单 `MODIFY_PENDING` + operation_log pendingFields + dirty mark**，不要新建完整审批模型。
3. 通知是否只记录日志：**是，默认只落站内通知/操作日志/脏标记，不接外部通知**。
4. 回滚边界：**审批不通过保留旧值；审批通过前不改已接单子单/父单；未接单可直接同步**。

### 第三批：社保反馈与批量操作

| 编号 | 验收标准 | 建议边界 |
|---|---|---|
| C1 社保/医保/公积金反馈 | 三项结果均完成时可自动完成子单；任一未完成则保持处理中并可继续编辑备注 | 复用 `handling-feedback.ts` 与 `batch-import`，不要改第一批导入主链路 |
| C2 批量接单/完成/导入/导出 | 批量接口返回逐行 success/action/message；失败不阻断其他行；完成时回写父单 `extraData` 并触发 dirty mark | `dispatched-order.service.ts` 批量方法和前端批量弹窗 |
| C3 状态冲突 | 已完成/作废/审批中子单禁止批量覆盖；错误信息可读 | 不绕过 `describeTerminalBlockedStatus` |

### 第四批：QA 回归与范围收口

| 编号 | 验收标准 | 建议边界 |
|---|---|---|
| D1 回归矩阵 | 至少覆盖导入模板下载、预览映射、确认落库、详情、子单详情、速创导出、E签宝导出、审批通过/拒绝、通知/dirty mark | QA 以用户 Excel/截图作为金标准 |
| D2 数据迁移 | 新老模板/字段种子幂等；已存在模板可迁移更新；不破坏历史工单 extraData | migration + seed 双路径，避免只改种子导致老库不生效 |
| D3 不越界 | 不改角色权限大框架、不重构派单引擎、不引入外部通知、不改 unrelated 模块 | Scope guard 复核 diff |

## 3. 数据/接口/迁移/种子边界

### 3.1 数据模型边界

- **主数据仍以 `WorkOrder.extraData` 为字段事实源**；字段配置以 `FieldConfig` / `import_template_fields` / 模板种子为规则源。
- 派生字段建议落 `extraData`：
  - `gender`：身份证第 17 位奇偶，男/女。
  - `birth_date`：身份证 7-14 位，规范化 `YYYY-MM-DD`。
  - `age`：按当前日期或入职日期口径计算需产品确认；建议导入时按当前日期计算，导出不再只靠公式。
- 第二批不建议把 pendingFields 写入父单临时字段；当前 operation_log 承载待审批内容，避免污染 `extraData`。
- 可选最小新增表仅用于批次审计，不作为字段事实源。

### 3.2 API 边界

- 主工单：
  - `GET /work-orders`、`GET /work-orders/:id`、`PUT /work-orders/:id`、`POST /work-orders/:id/submit`。
  - 风险：`PUT /work-orders/:id` 当前可直接修改 `extraData` 并写 dirty mark，需在第二批中防止绕过已接单审批规则。
- 子工单：
  - `GET /dispatched-orders/:id` 返回 `extraData`、`fields`、`pendingModify`、`dirtyCount`。
  - `POST /dispatched-orders/:id/creator-update`：业务员字段修改入口。
  - `POST /dispatched-orders/:id/modify/approve`：处理人审批入口。
  - `POST /dispatched-orders/:id/dirty/confirm-read`：处理人确认已读清脏。
- 导入：
  - 预览/确认仍走 imports 模块；条件必填最终必须在确认作业中校验，前端只做提示。
- 导出：
  - 默认模板按 `moduleCode + signPlatform` 路由，速创/E签宝分别维护。

### 3.3 迁移与种子边界

必须覆盖：

1. `seed-fields.ts`：字段名、顺序、下拉、条件必填。
2. `20260610001000-CreateImportTemplateFields.ts` 或后续新 migration：导入模板字段顺序/是否出现在模板/说明。
3. `seed-export-templates.ts`：速创/E签宝字段列与公式/常量。
4. 详情模板迁移/种子：劳动合同模板/主体、派生字段可见。
5. 前端 fallback：`frontend/src/services/fields.ts`、`workOrders.ts` 只作兜底同步，不能只改前端。

## 4. 跨成员文件/模块冲突风险清单

| 风险 | 涉及成员 | 冲突文件/模块 | 规避建议 |
|---|---|---|---|
| 字段口径多处重复 | import_template_backend、contract_export_frontend、qa_regression | `seed-fields.ts`、`frontend/src/services/fields.ts`、`workOrders.ts` | 后端种子为准，前端只同步 fallback；QA 按 API 返回验收 |
| 导入模板与导出模板均改 Excel | import_template_backend、contract_export_frontend | `import-template.service.ts`、`seed-export-templates.ts`、`assets/export-templates` | 分清“入职导入模板”和“劳动合同导出模板”，不要互相覆盖 |
| 电子签新枚举影响条件必填 | import_template_backend、contract_export_frontend、approval_sync_workflow | `field-validation.service.ts`、`seed-fields.ts`、前端表单 | 新旧值兼容，落库统一 `1.是/2.否`；条件以规范化值判断 |
| 审批同步绕过路径 | approval_sync_workflow、scope_guard | `work-order.service.ts`、`dispatched-order.service.ts` | 统一业务员修改入口；主工单 PUT 对已接单相关字段加限制或转审批 |
| 详情字段展示与字段权限 | contract_export_frontend、qa_regression | 详情模板、`MyDispatched/Detail`、字段权限服务 | 不绕过字段权限；模板字段与 visibleFields 对齐 |
| 批量反馈与字段同步都写父单 | social_feedback_batch、approval_sync_workflow | `complete`、`batchImport`、`markAndNotifyAffectedDispatchedOrders` | 保持事务顺序；批量反馈只改允许字段，审批改通用字段 |
| 迁移/种子重复写 | 多成员 | `database/migrations`、`database/seeds` | 每个成员新 migration 使用唯一时间戳；不要改他人 migration 历史 |

## 5. QA 最小回归矩阵

1. **模板下载**：入职导入模板与用户 Excel 逐列比对；隐藏 options sheet 不可见但数据验证有效；标黄不影响 required。
2. **导入预览**：用户 Excel 表头可自动映射；字段顺序和候选字段正确；错误表能指出缺失/下拉非法。
3. **导入确认**：合法行创建主工单；`gender/birth_date/age/probation_end_date` 落 `extraData`；条件必填触发失败。
4. **详情页**：主工单详情、劳动合同新签子单详情显示劳动合同模板/主体和派生字段。
5. **速创导出**：末尾两列为合同模板/主体；签订方式为 `1.新签`；试用期终止、性别值正确。
6. **E签宝导出**：新增劳动合同模板；合同主体原映射保留；多行表头不塌陷。
7. **未接单修改**：业务员改字段后父单立即更新，子单 dirty/通知生成，无审批。
8. **已接单修改审批通过**：进入 `modify_pending`；通过前父单不变；通过后同步相关活跃子单 dirty/通知。
9. **已接单修改审批拒绝**：父单不变，子单恢复原状态，发起人收到拒绝通知，日志保留。
10. **批量反馈**：社保/医保/公积金三项全部完成才自动完成；部分完成保持处理中。

## 6. 当前阻塞/需确认项

1. **用户入职导入 Excel 原件缺失**：无法完成逐列最终口径验收；需由用户或 Leader 提供。
2. **年龄计算口径**：按导入当天、入职日期、还是当前自然日？建议先按导入当天/系统当前日期，若用户有 Excel 公式则以 Excel 为准。
3. **截图字段条件必填全集**：当前仅明确“是否电子签=1.是时电子签平台必填”，其余截图字段需 QA/产品列出。
4. **已完成子单是否纳入“所有字段变更同步”**：现有主工单路径会阻止存在已完成子单时修改；子单审批同步当前过滤作废/撤回但未显式排除 completed，需产品确认是否完成子单也应 dirty 提醒。
5. **批次表是否必须**：若只需日志审计，复用现有表；若需页面展示批次和每个子单处理结果，再新增最小表。

## 7. 建议执行顺序

1. `import_template_backend` 先补用户 Excel 原件比对，改字段种子/导入模板/导入校验/派生落库。
2. `contract_export_frontend` 同步详情模板和速创/E签宝导出模板，不抢导入模板文件。
3. `approval_sync_workflow` 固化字段修改统一入口，封堵主工单 PUT 绕过审批；必要时补批次审计。
4. `social_feedback_batch` 保持批量反馈只改社保允许字段，避免与通用审批字段混写。
5. `qa_regression` 按本报告第 5 节执行回归，缺用户 Excel 原件时标记为阻塞而非通过。
6. `scope_guard` 重点审查：是否改了角色权限/派单引擎/外部通知/历史 migration，若有应拦截。
