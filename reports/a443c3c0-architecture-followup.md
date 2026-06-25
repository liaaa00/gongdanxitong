# a443c3c0 修复后验收口径更新与交付清单核对

> 任务：修复后验收口径更新与交付清单核对  
> 角色：架构与需求统筹  
> 时间：2026-06-24 约 12:00（Asia/Shanghai）  
> 范围：只读收口；未修改业务代码；仅新增本报告。

## 1. 当前结论

截至本次只读收口，**不能将当前版本判定为通过**。原因如下：

1. 团队任务状态显示三类 QA 阻断修复仍在执行中：
   - `685df913` QA阻断修复：后端审批同步编译与测试失败 —— `in_progress`。
   - `239ec7ef` QA阻断修复：导入模板字段种子类型与后端构建 —— `in_progress`。
   - `81767d34` QA阻断修复：前端 TeamDispatched lint 失败 —— `in_progress`。
2. 新增 `bbfa8df7` 集成冻结与修复顺序控制任务也仍为 `in_progress`，说明当前工作区尚未形成可复测冻结点。
3. 本地可见源码已有部分修复痕迹，但尚无修复后 `backend npm run build`、`backend npm run test`、`frontend npm run lint` 成功证据。
4. `frontend/src/pages/TeamDispatched/index.tsx:90` 仍可见 `<a onClick=...>`，与 QA 报告的 `jsx-a11y/anchor-is-valid` lint 阻断一致，当前前端 lint 阻断至少从源码观察看**仍未解除**。

因此，本报告给出的是**阶段性验收口径更新与最小复测建议**，而非最终通过结论。

## 2. 阻断项状态更新

| 阻断项 | QA 原始失败 | 当前只读观察 | 状态判定 | 对应需求 |
|---|---|---|---|---|
| 后端审批同步编译/测试失败 | `dispatched-order.service.ts` 缺 `buildCompletionExtraDataPatch`、`evaluateOrderCompletion`、`applyHandlingFeedbackByBatchImport`；后续又出现 `getFieldSyncRecords` 不存在、`processed` 缺失等 | 当前 `dispatched-order.service.ts` 已出现上述方法和 `processed` 返回；`controller` 已出现 `getFieldSyncRecords` 路由；新增 field sync 实体/迁移/类型 | **有修复痕迹，但待 build/test 证实** | 需求 6；并可能影响 7/8 |
| 导入模板 seed 类型与后端构建 | `seed-fields.ts:255 conditionalRequired` 类型不匹配 | `seed-fields.ts` 仍有 `conditionalRequired: seed.conditionalRequired ?? null`，字段接口仍是 `Record<string, unknown>`；未见 build 成功证据 | **待 build 证实；另有条件值不一致风险** | 需求 1、4 |
| 前端 TeamDispatched lint | `TeamDispatched/index.tsx:90 jsx-a11y/anchor-is-valid` | 当前文件 90 行仍为 `<a onClick={() => navigate(...) }>` | **未解除/至少源码仍显示同类问题** | 需求 9 或通用前端质量门禁 |
| 完整回归脚本失败 | 后端 build 阶段失败 | 无修复后完整回归成功证据 | **待 QA 复跑** | 全需求 |

## 3. 需求 1/4/6/9 对应性核对

### 3.1 需求 1：入职导入模板与用户 Excel/截图对齐

当前可见改动/文件：

| 文件 | 必要性 | 当前观察 | 验证证据要求 |
|---|---|---|---|
| `backend/src/modules/imports/import-template.service.ts` | 生成导入模板、隐藏 `__options`、数据验证、表头标黄/必填说明 | 已见 `OPTIONS_SHEET_NAME='__options'`、`optionsSheet.state='veryHidden'`、条件必填说明、派生字段不标黄逻辑 | 需下载系统模板与用户 Excel 对比 A1:BL4、hidden/veryHidden、22 个数据验证、下拉源 |
| `backend/src/modules/imports/import-template-config.service.ts` | 控制导入模板字段配置/回退规则 | 仍发现 fallback 条件 `need_onboarding_contact` / `is_common_template` 使用 `value: '是'` | 若入职主流程布尔字段统一为 `1.是/2.否`，需确认这里是否必须同步为 `1.是`；否则条件必填可能失效 |
| `backend/src/modules/imports/field-validation.service.ts` | 导入确认行校验 | 已见别名、必填、下拉校验、派生字段调用 | 需用正反例 Excel 验证必填/非必填/条件必填与用户模板一致 |
| `backend/src/modules/imports/work-order-import.service.ts` | 导入创建主工单前处理 `extraData` | 已见 `applyOnboardingDerivedFields(extraData)` | 需真实导入后查详情/导出验证派生字段落库 |

结论：需求 1 相关改动范围基本合理，但**仍缺系统下载模板对用户 Excel 的最终对比证据**，且 fallback 条件值需核对。

### 3.2 需求 4：是否电子签 `1.是/2.否` 与条件必填

当前可见改动/文件：

| 文件 | 当前观察 | 风险/要求 |
|---|---|---|
| `backend/src/database/seeds/seed-fields.ts` | `need_company_contract`、`need_esign`、`need_contract_urge`、`need_onboarding_contact`、`need_company_payroll`、`social_urge` 等入职布尔字段均被改为 `['1.是','2.否']`；`esign_platform` 条件改为 `need_esign = 1.是` | 这超出“是否电子签”单点变更，可能是按用户 Excel 全模板同步；需成员说明对应用户模板证据，否则存在范围扩大风险 |
| `field-validation.service.ts` | `normalizeEnumAlias` 兼容 `是/否/1/2/1.是/2.否` 并映射到字段 options | 方向正确，需导入正反例验证：旧值可兼容、新值落库规范 |
| `import-template-config.service.ts` / `field-validation.service.ts` fallback 条件 | fallback 条件仍存在 `value: '是'` | 如果这些 fallback 字段参与入职模板，应改为 `1.是` 或确保枚举归一化后 AST 能等价；当前需重点复核 |

结论：需求 4 有明确实现痕迹，但**存在条件必填值“是”与“1.是”混用风险**，QA 复测必须覆盖电子签平台缺失失败场景。

### 3.3 需求 6：字段修改审批与同步机制

当前可见改动/文件：

| 文件 | 必要性 | 当前观察 | 验证证据要求 |
|---|---|---|---|
| `backend/src/entities/work-order-field-sync-batch.entity.ts` | 结构化记录变更批次 | 新增 batch 状态：`direct_synced`、`approval_pending`、`approved`、`rejected`、`partial` | migration/build/test 通过；接口返回可读 |
| `backend/src/entities/work-order-field-sync-item.entity.ts` | 结构化记录字段级原值/新值/审批状态 | 包含 oldValue/newValue/status/requiresApproval/approvedBy/approvedAt/comment | 审批通过/拒绝后 item 状态符合预期 |
| `backend/src/database/migrations/20260624001000-WorkOrderFieldSyncRecords.ts` | 新表迁移 | 创建 batches/items 及索引 | `npm run migration:run` 或测试库迁移成功证据 |
| `backend/src/modules/dispatched-orders/dispatched-order.service.ts` | 业务员修改、审批通过/拒绝、同步记录 | 未接单分支记录 `direct_synced`；已接单进入 `MODIFY_PENDING` 并记录 `approval_pending`；审批后 finalize 为 `approved` 或 `kept_old` | 后端 build、单测；接口级验证未接单/已接单/拒绝/通过/完成子单禁止 |
| `backend/src/modules/dispatched-orders/dispatched-order.controller.ts` | 暴露字段同步记录查询 | 已见 `getFieldSyncRecords` 调用 service | 需确认路由装饰器和前端调用正确，避免构建/权限问题 |

结论：需求 6 的结构化记录实现方向符合此前架构口径，且“新增最小批次/明细表”属于允许范围；但当前仍为**待构建/待单测/待端到端验证**。

### 3.4 需求 9：批量接单混选已接/未接跳过提示

当前可见改动/文件：

| 文件 | 当前观察 | 验证证据要求 |
|---|---|---|
| `backend/src/modules/dispatched-orders/dispatched-order.service.ts` | `batchAccept` 返回 `{ success, accepted, skipped }`；仅 PENDING 调 `accept`，已接单跳过并返回“已接单，已跳过” | 后端单测/接口验证：混选 1 个 pending + 1 个 processing，应 accepted=1、skipped=1 |
| `frontend/src/services/dispatchedOrders.ts`、列表页面/批量操作组件 | 有近期写入，但本次未完整审 UI | 前端操作后展示成功/跳过数量，不把部分跳过当整体失败 |
| `frontend/src/pages/TeamDispatched/index.tsx` | 仍有 lint error 源码形态 | 必须先修 lint，再复测批量接单 UI |

结论：需求 9 后端核心逻辑已可见，但前端质量门禁仍未解除。

## 4. 交付清单核对模板（实现成员必须补齐）

当前无 Git 根，无法通过统一 diff 得到最终变更集合；请每位实现成员在完成修复时按下表提交，不满足则不能最终验收。

| 成员 | 改动文件 | 需求编号 | 必要性 | 验证证据 | 当前架构核对 |
|---|---|---|---|---|---|
| import_template_backend | `seed-fields.ts` | 1/4 | 字段顺序、布尔下拉、条件必填、导入模板字段口径 | 后端 build；模板对比；导入正反例 | 待补；需说明为何多个布尔字段均改 `1.是/2.否` |
| import_template_backend | `import-template.service.ts`、`import-template-config.service.ts`、`field-validation.service.ts`、`work-order-import.service.ts`、`import-derived-fields.util.ts` | 1/2/3/4 | 模板生成、行校验、身份证/试用期派生 | 模板下载对比；导入后详情/导出验证 | 待补；重点核对 fallback 条件 `是` vs `1.是` |
| approval_sync_workflow | field sync entities/migration/types/module/service/controller | 6 | 结构化记录字段变更批次、子单结果、审批状态 | build/test/migration；审批通过/拒绝接口证据 | 待补；方向符合需求 6 |
| contract_export_frontend | `seed-export-templates.ts`、合同详情/导出相关前端文件 | 5（以及与 4 相关的导出值） | 合同详情展示、速创/E签宝导出列 | 导出 Excel 比对、详情截图/接口数据 | 本任务重点 1/4/6/9，仍需成员自证 |
| contract_export_frontend | `TeamDispatched/index.tsx` 或相关批量页面 | 9/质量门禁 | 修复 lint、展示跳过提示 | `npm run lint` 通过；混选批量接单 UI 证据 | 当前仍见 `<a onClick>`，未通过 |
| social_feedback_batch | 社保反馈/批量完成相关 service/component/dto | 7/8 | 三项反馈和批量反馈状态判断 | 单测/接口/前端交互 | 当前不属于本次三类阻断主核对，但需最终补清单 |

## 5. QA 最小复测范围建议

在三类阻断 owner 明确汇报“修复完成 + integration 冻结”前，QA 不建议重复完整回归。冻结后按以下最小顺序复测：

### 5.1 门禁命令优先级

1. 后端：`cd backend; npm run build`
   - 必须先消除 TypeScript 构建失败。
2. 后端：`cd backend; npm run test`
   - 重点观察此前失败套件：`dispatched-order.service.spec.ts`、`social-insurance-state-flow.spec.ts`、seed/auth/control-flow 相关。
3. 前端：`cd frontend; npm run lint`
   - 必须解决 `TeamDispatched/index.tsx:90 jsx-a11y/anchor-is-valid`，并把 warning 数降到 `--max-warnings 10` 以下。
4. 如有测试库：`cd backend; npm run migration:run` 或等价迁移验证。
5. 最后执行项目完整 `.回归测试.ps1`（按现有脚本命名实际为根目录回归脚本）。

### 5.2 需求级最小用例

| 需求 | 最小复测用例 |
|---|---|
| 1 | 下载入职导入模板，与用户 Excel 对比字段顺序/字段名/表头标黄/必填说明/填写要求/示例/下拉源/隐藏 `__options`/数据验证数量 |
| 4 | 导入正例：`是否电子签=1.是` 且电子签平台=速创；反例：`是否电子签=1.是` 但电子签平台为空必须失败；兼容例：旧值“是/否”可导入并规范化 |
| 6 | 未接单子单业务员修改字段：直接同步、生成 sync batch/item 与通知；已接单修改：进入 `modify_pending`，审批通过合并新值，审批拒绝保留旧值/记录 kept_old；已完成子单禁止线上改 |
| 9 | 批量接单混选 pending + processing：只接 pending，processing 返回 skipped，前端展示成功/跳过数量 |

### 5.3 本次不建议扩大的复测范围

- 不在后端 build 失败时继续真实导入/导出/E2E，避免噪声。
- 不在前端 lint 未通过时扩大 UI 回归。
- 不把 Dashboard 历史 SQL warning 纳入本轮修复范围。
- 不要求实现成员在本轮修复 package-lock、dist、日志等生成物，除非有明确依赖必要性。

## 6. 对原验收矩阵的阻断项状态更新

原 `reports/7ff9a47c-architecture-acceptance-matrix.md` 中可更新为：

- A1/A2（导入模板与必填口径）：**待验证**。模板生成代码已见，但需用户 Excel 对比和 build 成功；fallback 条件值存在 `是/1.是` 风险。
- A5/A6（电子签下拉与条件必填）：**部分实现，待复测**。字段种子和枚举兼容已见；电子签平台条件已改为 `need_esign=1.是`；需真实导入失败/成功验证。
- B1-B6（审批同步）：**实现方向可接受，待构建/迁移/接口验证**。新增批次/明细表符合允许最小新增边界，但不能绕过 build/test。
- C/需求 9 批量接单混选：**后端逻辑可见，前端门禁未解除**。必须修复 lint 后复测 UI 提示。

## 7. 架构侧最终放行条件

满足以下条件前，架构侧不建议标记最终通过：

1. 三类阻断任务从 `in_progress` 变为完成，并提交清单：`改动文件 -> 需求编号 -> 必要性 -> 验证证据`。
2. 后端 build/test、前端 lint 至少各有一次修复后成功证据。
3. 导入模板与用户 Excel 的逐列/数据验证/隐藏 sheet 对比完成。
4. 需求 4 的 `是` vs `1.是` 条件值风险被修复或由测试证明等价。
5. field sync 新迁移在测试库执行成功，且审批通过/拒绝接口能查到结构化记录。
6. TeamDispatched lint 错误消除，批量接单混选前端展示通过。
