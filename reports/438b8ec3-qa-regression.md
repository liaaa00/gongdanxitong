# QA 回归矩阵与最终验证报告

- 任务 ID：438b8ec3-de1e-4afc-b422-76415ca571ed
- 角色：QA 回归验证工程师
- 当前阶段：只读建立回归计划，等待实现成员成果进入 integration 后执行最终验证
- 工作目录：`d:\ai\speceappdate\工单系统`
- 用户基准模板：`D:\Program Files（x86）\xwechat_files\wxid_h1l8ikrop93s22_3850\msg\file\2026-06\工单管理系统-入职导入模板 (8).xlsx`
- 用户截图：
  - `D:\AI\SpeceAppDate\attachments\2026-06\spectrai_img_20260624_1782267250468.png`
  - `D:\AI\SpeceAppDate\attachments\2026-06\spectrai_img_20260624_1782267258661.png`

## 1. 只读基线证据

### 1.1 项目测试/构建入口

已只读检查：

- 根目录 `回归测试.ps1`
  - 前端关键业务测试：`npm test -- --run` 加指定测试文件列表
  - 前端构建：`npm run build`
  - 后端构建：`npm run build`
- `backend/package.json`
  - `npm run build`
  - `npm run test`
  - `npm run test:e2e`
  - `npm run migration:run`
  - `npm run seed`
- `frontend/package.json`
  - `npm run build`
  - `npm run test`
  - `npm run lint`
  - `npm run e2e`
  - `npm run e2e:smoke`

说明：当前工作目录不是 Git 仓库，`git status` / `git branch` / `git worktree list` 返回 `fatal: not a git repository`，后续需由 Leader 明确 integration worktree 路径或在进入 integration 后重新确认。

### 1.2 用户 Excel 模板只读解析结果

使用 Node + `xlsx` 对用户基准模板只读解析：

- 工作表：
  - `当前字段配置`：可见
  - `__options`：`Hidden=2`，即 veryHidden
- 主 sheet 范围：`A1:BL4`
- 隐藏 options 范围：`A1:V12`
- 主 sheet 数据验证数量：22
- 关键表头共 64 列，顺序如下：

```text
客户名称, 客户代码, 外包类型, 岗位, 岗位类型, 姓名, 证件类型, 证件号码, 性别, 出生日期, 年龄, 户籍性质, 民族, 学历, 婚姻状况, 移动电话, 电子邮件, 现住地址, 户籍地址, 邮编, 合同期限形式, 合同期限, 合同开始日期, 合同终止日期, 试用期开始日期, 试用期（月）, 试用期结束日期, 工作城市, 工时制, 工资形式, 基本工资, 其他工资, 试用期工资, 试用期其他工资, 发薪周期, 发薪日期, 参保地, 参保起始月, 社保基数, 公积金基数, 公积金比例, 开户银行信息, 银行借记卡帐号, 备注, 业务模式, 人员类型, 是否企服发起劳动合同, 是否电子签, 电子签平台, 劳动合同主体, 甲方住所, 项目名称, 安排或调整工作的情况, 劳动合同模板（标准模板/特殊模板）, 劳动合同签署是否需要催办员工, 入职材料是否需要集约收集, 反馈截止日期, 是否为通用模板, 模板名称, 是否企服发薪, 发薪地, 社保公积金未办是否需要催办, 特殊备注
```

- 截图/模板重点：
  - 标黄是客户填写/关注提示，不得作为必填判断依据。
  - `是否电子签` 下拉应为 `1.是 / 2.否`。
  - `电子签平台` 下拉应含 `速创 / E签宝`。
  - `是否电子签`、`电子签平台`、`劳动合同主体`、`甲方住所`、`项目名称`、`劳动合同模板（标准模板/特殊模板）`、`劳动合同签署是否需要催办员工`、`是否为通用模板`、`模板名称` 等需按前置条件判断必填。
  - 截图明确 `安排或调整工作的情况` 为非必填。

### 1.3 需求相关现有代码/测试定位

只读检索定位到的关键文件，后续验证应重点覆盖：

- 导入模板/解析/校验：
  - `backend/src/modules/imports/import-template-config.service.ts`
  - `backend/src/modules/imports/excel-parser.service.ts`
  - `backend/src/modules/imports/field-validation.service.ts`
  - `backend/test/import-template.service.spec.ts`
  - `backend/test/import-template-config.service.spec.ts`
  - `backend/test/excel-parser.service.spec.ts`
  - `backend/test/import.service.spec.ts`
- 字段/种子/模板：
  - `backend/src/database/seeds/seed-fields.ts`
  - `backend/src/database/seeds/seed-export-templates.ts`
  - 可能还需 migration 或既有模板更新逻辑
- 合同导出：
  - `backend/src/modules/admin/export-templates/export-templates.service.ts`
  - `backend/test/export-templates-columns.spec.ts`
- 子工单详情/批量接单/办理反馈：
  - `frontend/src/pages/MyDispatched/Detail/index.tsx`
  - `frontend/src/pages/MyDispatched/index.tsx`
  - `frontend/src/pages/OnboardingModule/index.tsx`
  - `frontend/src/components/DispatchedBatchImportModal.tsx`
  - 对应测试文件：`*.test.tsx`
- 审批与状态：
  - `backend/src/modules/dispatched-orders/dispatched-order.service.ts`
  - `backend/test/dispatched-resubmit.spec.ts`

## 2. 回归矩阵

| 编号 | 需求点 | 验证范围 | 数据准备 | 自动化/命令 | 手工/接口验收点 | 通过标准 |
|---|---|---|---|---|---|---|
| QA-01 | 入职导入模板逐列对齐 | 字段顺序、字段名、必填/非必填/条件必填、填写要求、示例值 | 用户基准模板 + 系统下载模板 | 后续增加/执行模板比对脚本或后端模板单测 | 下载系统模板并与用户模板 A1:BL4 比对 | 顺序/文案完全按用户模板，差异有明确需求依据 |
| QA-02 | 模板样式和标黄口径 | 表头标黄、标黄不影响必填 | 缺少已标黄但非必填字段的导入样本 | 模板单测 + 导入校验单测 | 导入仅缺少标黄但非必填字段的数据 | 不因标黄报必填；只按 row2/条件规则校验 |
| QA-03 | 下拉/options/数据验证 | `__options` veryHidden、22 个数据验证、下拉源 | 系统下载模板 | 模板解包/ExcelJS 检查 | Excel 打开模板，下拉可用，options 不可见 | options 为 hidden/veryHidden；下拉项与用户模板一致 |
| QA-04 | 是否电子签与条件必填 | `是否电子签=1.是` 时电子签平台必填；合同模板链路字段条件必填 | 正例：填 1.是+平台+条件字段；反例：漏平台/漏模板名等 | 后端 import/validation 单测；接口导入 | 错误行返回明确字段和原因 | 满足条件未填时报错；不满足条件不误报 |
| QA-05 | 身份证派生 | 性别、出生日期、年龄自动派生 | 只填写证件号码，性别/出生日期/年龄留空 | 后端导入单测/接口导入 | 导入后详情页、数据库/接口、导出表查看 | 18 位身份证派生值正确；详情和导出可见 |
| QA-06 | 试用期结束日期带出 | 试用期开始、试用期（月）、试用期结束日期 | 导入含开始日期+月份，或模板已有结束日期 | 后端导入/导出单测 | 详情页和导出表查看 | 试用期结束日期不丢失，计算/映射符合需求 |
| QA-07 | 合同详情页字段 | 劳动合同模板、劳动合同主体 | 导入含合同主体、模板类型 | 前端 detail 单测/手工页面 | 劳动合同详情页查看 | 两字段展示位置正确，权限/空值不异常 |
| QA-08 | 速创/E签宝导出 | 速创末尾新增合同模板/主体，E签宝新增合同模板，速创签订方式默认 1.新签 | 选择平台为速创/E签宝的合同子单 | 后端 export 单测，必要时接口导出 | 下载导出 Excel 检查列和默认值 | 列顺序/列名正确；既有模板数据也生效 |
| QA-09 | 字段修改审批同步 | 未接单直接同步；已接单审批；已完成禁止线上改；审批通过/不通过 | 含未接单、已接单、已完成子工单的主单 | 后端 service/e2e 单测 | 修改主单字段，检查子单及审批记录 | 结构化记录原值/新值/同步/审批中/不通过/保留旧值 |
| QA-10 | 社保/医保/公积金三项反馈 | 6 个字段，结果固定已完成/未完成，三项全完成自动完成 | 社保公积金增员/减员子单 | 后端/前端批量反馈测试 | 单条/批量导入办理结果 | 全完成自动完成；任一未完成不自动完成；备注非必填 |
| QA-11 | 批量反馈办理结果 | 从批量完成改为批量反馈，可复用设计 | 批量反馈 Excel：全完成、部分未完成、非法结果 | 前端 modal 测试 + 后端接口 | 导入反馈后状态变化 | 状态按结果判断，非法枚举报错 |
| QA-12 | 批量接单混选 | 混选已接单和未接单 | 2 条待接单 + 1 条已接单 | 前端 MyDispatched/OnboardingModule 单测 | 页面提示 | 只接未接单，跳过已接单，提示“成功接单 2 条，跳过 1 条已接单工单”或等价文案 |

## 3. 测试数据准备方案

### 3.1 导入模板/字段数据

准备 4 类 Excel：

1. `template-baseline.xlsx`：用户原始模板，只读基准。
2. `onboarding-positive-id-derived.xlsx`：
   - 填写所有绝对必填字段。
   - `证件类型=中国居民身份证`，`证件号码=330106199001011234`。
   - `性别/出生日期/年龄` 留空，用于验证自动派生。
3. `onboarding-esign-negative.xlsx`：
   - `是否电子签=1.是`，漏填 `电子签平台`。
   - 预期导入失败，错误原因指向电子签平台。
4. `onboarding-contract-template-negative.xlsx`：
   - 触发特殊模板/通用模板条件，但漏填 `模板名称` 或 `劳动合同模板（标准模板/特殊模板）`。
   - 预期导入失败，错误原因指向缺失字段和前置条件。

### 3.2 合同导出数据

- 速创样本：`是否电子签=1.是`，`电子签平台=速创`，包含 `劳动合同主体`、`劳动合同模板（标准模板/特殊模板）`。
- E签宝样本：`是否电子签=1.是`，`电子签平台=E签宝`，包含 `劳动合同模板（标准模板/特殊模板）`。
- 验证既有数据库模板：不能只依赖 seed；如存在 migration/启动更新逻辑，需在已有数据环境验证。

### 3.3 审批同步数据

同一主工单派发至少 3 个子工单：

- 子单 A：未接单。
- 子单 B：已接单/处理中。
- 子单 C：已完成。

对主单同一字段发起修改：

- A 应直接同步。
- B 应进入审批，审批通过后同步新值，审批不通过保留旧值。
- C 应禁止线上修改或记录为保留旧值。

### 3.4 社保反馈和批量接单数据

- 社保公积金增员/减员子单：
  - 全部：社保/医保/公积金均 `已完成`。
  - 部分：任一项 `未完成`，备注留空。
  - 非法：任一结果填 `完成` 或其他非法值。
- 批量接单列表：
  - 2 条 `pending` / 待接单。
  - 1 条已接单/处理中。

## 4. integration 后拟执行命令

进入 Leader 指定的 integration worktree 后按顺序执行，并把输出摘要补到本报告：

```powershell
# 环境确认
Get-Location
Get-ChildItem -Force
git status --short
git branch --show-current

# 后端
cd backend
npm run build
npm run test
# 如测试 DB 可用，再执行：
npm run test:e2e

# 前端
cd ..\frontend
npm run lint
npm run test
npm run build
# 如浏览器和后端环境可用，再执行：
npm run e2e:smoke

# 项目回归脚本
cd ..
.\回归测试.ps1
```

若 `git` 仍不可用，则记录为环境风险，不以此掩盖真实测试失败。

## 5. 最终验证记录（当前可用环境）

> 验证时间：2026-06-24 11:24-11:48（Asia/Shanghai）  
> 验证目录：`D:\ai\speceappdate\工单系统`  
> 注意：该目录执行 `git status --short` / `git branch --show-current` 均返回 `fatal: not a git repository`，因此无法确认它是否为最终 integration worktree；以下结果为当前可用环境的真实执行结果，不以此掩盖失败。

### 5.1 已执行命令与结果

| 命令 | 结果 | 证据摘要 |
|---|---|---|
| `git status --short`、`git branch --show-current` | 失败/环境风险 | `fatal: not a git repository (or any of the parent directories): .git` |
| `cd backend; npm run build` | 失败 | 首次失败：`src/modules/dispatched-orders/dispatched-order.service.ts` 引用不存在方法 `buildCompletionExtraDataPatch`、`evaluateOrderCompletion`、`applyHandlingFeedbackByBatchImport`。完整回归脚本再次执行时后端 build 仍失败，错误包括 `seed-fields.ts:255 conditionalRequired` 类型不匹配、`dispatched-order.controller.ts:202 getFieldSyncRecords` 不存在、`dispatched-order.service.ts:486 processed` 缺失。说明当前工作区在验证期间可能仍有变动。 |
| `cd backend; npm run test` | 失败 | Jest：`Test Suites: 6 failed, 1 skipped, 46 passed, 52 of 53 total`；`Tests: 6 failed, 16 skipped, 354 passed, 376 total`。失败见 5.3。 |
| `cd frontend; npm run lint` | 失败 | `19 problems (1 error, 18 warnings)`；致命错误：`frontend/src/pages/TeamDispatched/index.tsx:90 jsx-a11y/anchor-is-valid`，使用 anchor 作为按钮。 |
| `cd frontend; npm run test` | 通过 | Vitest：`Test Files 44 passed (44)`，`Tests 283 passed (283)`。 |
| `cd frontend; npm run build` | 通过 | `tsc -b && vite build` 成功，`✓ built in 23.34s`。 |
| `.\回归测试.ps1 -SkipBuild` | 通过但覆盖有限 | 前端关键业务测试 `10 passed (10)`、`77 passed (77)`；因 `-SkipBuild` 跳过后端 build，不能代表后端通过。 |
| `.\回归测试.ps1` | 失败 | 前端关键业务测试和前端 build 通过，后端 build 阶段失败，脚本抛出 `Command failed with exit code 1: npm run build`。 |

注：上表里的 PowerShell 脚本命令实际文件名为根目录 `回归测试.ps1`；若渲染中出现控制字符，仍以文件系统中的脚本名为准。

### 5.2 通过项

- QA 回归矩阵已建立，覆盖：导入模板逐列/样式/下拉/隐藏 sheet/数据验证、身份证派生、条件必填、试用期日期、合同详情/导出、审批同步、社保反馈、批量接单混选。
- 用户 Excel 基线已只读解析：主 sheet `当前字段配置`，隐藏 sheet `__options` 为 `Hidden=2` / veryHidden，主 sheet 范围 `A1:BL4`，共 64 列，主 sheet 数据验证数量 22。
- 用户截图已核对：电子签/合同模板相关字段为“满足条件时必填”口径，`安排或调整工作的情况` 为非必填；标黄仅作为客户填写/关注提示，不参与必填判断。
- 前端 Vitest 全量单测通过：44 个测试文件、283 个测试用例通过。
- 前端生产构建通过。
- 根回归脚本在 `-SkipBuild` 模式下通过前端关键业务测试：10 个测试文件、77 个用例通过。

### 5.3 失败项（必须修复后再回归）

1. **后端构建失败，阻断后端验收与 E2E。**
   - 首次 `backend npm run build` 失败：
     - `src/modules/dispatched-orders/dispatched-order.service.ts:284`：`buildCompletionExtraDataPatch` 不存在。
     - `src/modules/dispatched-orders/dispatched-order.service.ts:285`：`evaluateOrderCompletion` 不存在。
     - `src/modules/dispatched-orders/dispatched-order.service.ts:466`：`buildCompletionExtraDataPatch` 不存在。
     - `src/modules/dispatched-orders/dispatched-order.service.ts:467`：`evaluateOrderCompletion` 不存在。
     - `src/modules/dispatched-orders/dispatched-order.service.ts:511`：`applyHandlingFeedbackByBatchImport` 不存在。
   - 完整 `.\回归测试.ps1` 中后端 build 再次失败：
     - `src/database/seeds/seed-fields.ts:255`：`conditionalRequired` 类型不匹配。
     - `src/modules/dispatched-orders/dispatched-order.controller.ts:202`：`getFieldSyncRecords` 不存在。
     - `src/modules/dispatched-orders/dispatched-order.service.ts:486`：返回对象缺少必需字段 `processed`。
   - 影响：审批同步、社保反馈、批量反馈、导入导出后端逻辑均无法进入可靠验收。

2. **后端单元测试失败 6 个套件。**
   - `test/dispatched-order.service.spec.ts`：业务员/leader 子单历史部门范围断言失败，实际只按 `w.created_by = :userId`。
   - `test/database-schema-guard.spec.ts`：运行时 schema guard 额外产生 `ALTER TYPE dispatched_order_status_enum ADD VALUE IF NOT EXISTS 'modify_pending'`，测试期望未更新。
   - `test/social-insurance-state-flow.spec.ts`：已接单社保子单业务员直接修改没有按旧测试期望拒绝，而是进入 `modify_pending`；需结合本轮“已接单变更必须审批”确认测试期望应更新还是实现越界。
   - `test/auth-password-and-seed.spec.ts`：seed 用户保留密码测试中未找到 `maoyani`。
   - `test/control-flow-regression.spec.ts`：模块负责人 seed 文本断言缺少 `moduleCodes: ['benefit_apply', 'social_insurance_change']` 与 inactive 逻辑。
   - `test/p1-split4-dirty-return.spec.ts`：社保批量完成备注必填用例收到 `子工单不存在`，而非期望 `社保批量完成备注必填`。

3. **前端 lint 失败。**
   - `frontend/src/pages/TeamDispatched/index.tsx:90`：`jsx-a11y/anchor-is-valid` error，anchor 被当作按钮使用。
   - 同次 lint 另有 18 个 warning，当前脚本设置 `--max-warnings 10`，即使修复 error 后也可能仍因 warning 超限失败。

4. **完整项目回归脚本失败。**
   - `.\回归测试.ps1` 在后端 build 阶段失败；当前不能判定本轮需求整体通过。

### 5.4 风险项

- 当前目录不是 Git 仓库，无法确认 integration 分支、worktree、变更文件清单和是否混入其他成员未完成代码。
- 后端 build 两次失败点不完全一致，疑似验证过程中工作区仍在变化；建议集成冻结后重新执行一次完整回归。
- 后端无法构建，导致 `npm run test:e2e`、真实接口导入、导出 Excel、审批同步链路、社保批量反馈、批量接单接口无法可靠执行。
- 未连接稳定测试数据库/登录态，手工页面验收与真实 Excel 导入导出未执行。
- 前端 lint 已失败，若项目把 lint 作为合入门禁，则即使前端 test/build 通过也不能视为前端质量通过。

### 5.5 未验证项

- 系统生成/下载模板与用户模板的逐列、样式、下拉、隐藏 `__options`、数据验证源自动化对比：因后端构建失败，未能通过服务生成模板做最终对比。
- 入职导入正反例：身份证派生、标黄不影响必填、电子签/合同模板条件必填、试用期结束日期带出，尚未在真实导入接口验证。
- 导入后详情页与导出表可见性：身份证派生字段、试用期结束日期、劳动合同模板/主体、速创/E签宝导出字段和默认值未做端到端验收。
- 字段修改审批同步：未接单/已接单/已完成/审批通过/审批不通过全链路未做端到端验收。
- 社保/医保/公积金三项反馈、自动完成、批量反馈办理结果未做端到端验收。
- 批量接单混选提示未做真实页面/接口验收；仅前端相关单测随全量 Vitest 通过。

### 5.6 QA 结论

当前可用环境下 **不通过**。主要阻断是后端 TypeScript 构建失败、后端 Jest 失败、前端 lint 失败。请实现成员先修复上述失败并确认进入冻结的 integration worktree 后，再由 QA 复跑完整命令与端到端验收。

## 6. QA 复测记录：阻断修复后完整回归

> 任务 ID：1be76def-68e8-4ee6-9e47-3acd22f2a8fd  
> 复测时间：2026-06-24 11:54-12:18（Asia/Shanghai）  
> 复测目录：`D:\ai\speceappdate\工单系统`  
> integration 风险：复测开始时 `git status --short` / `git branch --show-current` 仍返回 `fatal: not a git repository`，无法确认当前目录就是冻结的 integration worktree。

### 6.1 复测命令与结果

| 命令 | 结果 | 证据摘要 |
|---|---|---|
| `git status --short`、`git branch --show-current` | 失败/环境风险 | `fatal: not a git repository (or any of the parent directories): .git`。 |
| `cd backend; npm run build` | **失败** | 仍有阻断：`src/database/seeds/seed-fields.ts:255`，`conditionalRequired: seed.conditionalRequired ?? null` 类型不匹配，`Record<string, unknown> | null` 不能赋给 TypeORM `_QueryDeepPartialEntity<FieldConfig>` 对应属性。 |
| `cd backend; npm run test` | **失败** | `Test Suites: 7 failed, 1 skipped, 45 passed, 52 of 53 total`；`Tests: 7 failed, 16 skipped, 353 passed, 376 total`。失败详见 6.3。 |
| `cd frontend; npm run lint` | **失败** | 仍为 `19 problems (1 error, 18 warnings)`；致命错误仍是 `frontend/src/pages/TeamDispatched/index.tsx:90 jsx-a11y/anchor-is-valid`，说明前端 TeamDispatched lint 阻断未修复。 |
| `cd frontend; npm run test` | **超时/未完成** | 244 秒超时，无完整 Vitest 汇总输出；复测环境中随后发现多组残留 `npm test` / `vitest` / worker 进程。上一轮该命令曾通过，本轮按实际复测记录为未完成。 |
| `cd frontend; npm run build` | 通过 | `tsc -b && vite build` 成功，`✓ built in 42.22s`。 |
| `.\回归测试.ps1` | **超时/失败** | 304 秒超时，无完整脚本结果；无法作为通过证据。 |
| `.\回归测试.ps1 -SkipBuild` | **超时/失败** | 304 秒超时，无完整脚本结果；无法作为通过证据。 |
| `cd frontend; npm test -- --run <根回归脚本10个关键前端测试>` | **超时/未完成** | 184 秒超时，无完整汇总输出；检查进程发现多组 `vitest.mjs run --run ...` 和 worker 残留。 |

注：上表 PowerShell 脚本实际文件名为根目录 `回归测试.ps1`；如渲染出现异常字符，以文件系统文件名为准。

### 6.2 复测通过项

- 前端生产构建通过：`cd frontend; npm run build` 成功。
- 后端审批同步相关编译错误中，上一轮出现的 `buildCompletionExtraDataPatch`、`evaluateOrderCompletion`、`applyHandlingFeedbackByBatchImport`、`getFieldSyncRecords`、返回缺 `processed` 等编译错误本次未在 `backend npm run build` 输出中出现；但后端 build 仍被 `seed-fields.ts conditionalRequired` 阻断，不能视为整体通过。

### 6.3 复测失败项

1. **后端 build 仍失败，三类阻断中的字段类型修复未完成。**
   - 文件/位置：`backend/src/database/seeds/seed-fields.ts:255`。
   - 错误：`conditionalRequired` 类型不匹配。
   - 影响：后端无法通过 TypeScript 构建，E2E、真实导入导出、审批同步和社保反馈端到端仍无法可靠验收。

2. **后端单元测试仍失败，且失败套件增加到 7 个。**
   - `test/dispatched-order.service.spec.ts`：业务员/leader 子单历史部门范围断言仍失败，实际仅 `w.created_by = :userId`。
   - `test/auth-password-and-seed.spec.ts`：仍未找到 `maoyani`。
   - `test/p1-split4-dirty-return.spec.ts`：仍收到 `子工单不存在`，非期望 `社保批量完成备注必填`。
   - `test/control-flow-regression.spec.ts`：模块负责人 seed 文本断言仍缺少 `moduleCodes: ['benefit_apply', 'social_insurance_change']` 与 inactive 逻辑。
   - `test/social-insurance-state-flow.spec.ts`：已接单社保子单业务员直接修改仍 resolve 到 `modify_pending`，与旧测试期望 reject 冲突；需产品/实现/测试统一本轮“已接单字段变更必须审批”的口径。
   - `test/database-schema-guard.spec.ts`：仍额外出现 `ALTER TYPE dispatched_order_status_enum ADD VALUE IF NOT EXISTS 'modify_pending'`，测试期望未同步。
   - `test/import.service.spec.ts`：新增导入校验失败，`keeps contract_template in onboarding import but does not require it even when company contract is required` 期望 `result.ok=true`，实际为 false；与本轮合同模板条件必填需求强相关，需确认测试是否应按新条件更新，或实现误将非触发条件场景判为必填。

3. **前端 lint 阻断未修复。**
   - `frontend/src/pages/TeamDispatched/index.tsx:90` 仍报 `jsx-a11y/anchor-is-valid`。
   - 仍有 18 个 warnings，当前 lint 命令 `--max-warnings 10` 下即使修复 error 也可能继续失败。

4. **前端测试和根回归脚本本轮超时。**
   - `frontend npm run test` 244 秒超时。
   - 完整 `.\回归测试.ps1` 304 秒超时。
   - `.\回归测试.ps1 -SkipBuild` 304 秒超时。
   - 根脚本 10 个关键前端测试直跑 184 秒超时。
   - 复测后发现多组 `npm test` / `vitest.mjs` / worker 进程残留；为避免误杀长期 dev 服务或其他成员任务，QA 未继续强制清理不确定来源进程。

### 6.4 复测风险项

- 当前目录仍非 Git 仓库，无法确认是否为最终 integration、无法审查变更文件清单，也无法判断是否混入未完成改动。
- 前端测试本轮从上一轮“全量通过”变为超时并残留进程，说明当前测试环境或代码存在不稳定性；建议清理残留测试进程、冻结 integration 后重跑。
- 后端 build 未通过前，不应进行真实接口导入、导出 Excel、审批同步、社保反馈端到端验收，否则结果不可信。
- `test/social-insurance-state-flow.spec.ts` 与本轮“已接单变更必须审批”可能存在旧期望冲突，需要需求/实现/测试三方明确：进入 `modify_pending` 是否为预期，若是应更新旧测试；若不是则实现仍有缺陷。
- `test/import.service.spec.ts` 新失败直接关联合同模板条件必填，需重点确认“劳动合同模板（标准模板/特殊模板）”在何种前置条件下必填，避免把非触发场景误判必填。

### 6.5 复测未验证项

- 系统生成/下载模板与用户模板的逐列、样式、下拉、隐藏 `__options`、数据验证源最终自动化对比：后端 build 未通过，未执行服务生成模板对比。
- 入职导入接口正反例、身份证派生、标黄非必填、电子签/合同模板条件必填、试用期结束日期带出：未做真实接口验收。
- 详情页与导出 Excel：身份证派生字段、试用期结束日期、劳动合同模板/主体、速创/E签宝字段和默认值未做端到端验收。
- 字段修改审批同步全链路：未接单/已接单/已完成/审批通过/审批不通过未做端到端验收。
- 社保/医保/公积金三项反馈、自动完成、批量反馈办理结果未做端到端验收。
- 批量接单混选提示未做真实页面/接口验收。

### 6.6 复测 QA 结论

当前复测结论仍为 **不通过**。三类待修复阻断中至少两类明确仍未修复：`seed-fields conditionalRequired` 后端编译阻断仍在，`TeamDispatched` 前端 lint 阻断仍在；后端单测仍失败且新增导入条件必填相关失败。建议停止重复复测，交由相关实现成员继续修复并由阻塞治理协调清理/冻结 integration 后再触发 QA 复跑。

## 7. QA 待命整理：下一轮复测前置条件

> 任务 ID：ccf58e7d-8ee2-4347-a807-930db1123070  
> 状态：待命，不再主动重复复测；本节仅整理失败/超时/未验证项和下一轮复测前置条件，未运行新测试，未修改业务代码。

### 7.1 当前必须先由实现成员提供的自验证证据

1. **import_template_backend 必须先提交后端证据**
   - `cd backend; npm run build` 通过，且不再出现 `backend/src/database/seeds/seed-fields.ts:255 conditionalRequired` 类型错误。
   - 与导入模板/条件必填相关的 import tests 通过，至少覆盖 `test/import.service.spec.ts` 中合同模板条件必填相关失败用例。
   - 若调整了条件必填测试期望，需说明与用户模板/截图规则的对应关系，尤其是“劳动合同模板（标准模板/特殊模板）”何时必填、何时不必填。

2. **contract_export_frontend 必须先提交前端 lint 证据**
   - `cd frontend; npm run lint` 通过。
   - 必须确认 `frontend/src/pages/TeamDispatched/index.tsx:90 jsx-a11y/anchor-is-valid` 已修复。
   - 由于当前 lint 仍有 18 个 warnings 且脚本阈值为 `--max-warnings 10`，自验证证据必须是完整 lint 通过，而不是只修复 1 个 error。

3. **阻塞治理/集成负责人建议先确认环境**
   - 明确 QA 应使用的 integration worktree 路径。
   - 当前目录此前多次 `git status` 返回非 Git 仓库；下一轮复测前应确认 Git/worktree 状态可追溯，或明确继续按无 Git 目录验收并记录风险。
   - 清理或隔离上一轮超时残留的 `npm test` / `vitest` / worker 进程，避免影响下一轮前端测试和根回归脚本。

### 7.2 下一轮最小复测集合（收到上述证据后再执行）

仅在 Leader 明确通知两类实现证据均到齐后执行：

1. `cd backend; npm run build`
2. `cd backend; npm run test`
3. `cd frontend; npm run lint`
4. `cd frontend; npm run test`（若仍超时，记录超时和残留进程，不反复重试）
5. `cd frontend; npm run build`
6. 根目录 `.\回归测试.ps1`（完整优先；仅在完整脚本因已知后端 build 阻断或环境问题无法完成时，记录原因并酌情补充 `-SkipBuild` 差异）

### 7.3 当前未验证项保持不变

在后端 build、后端 tests、前端 lint 三类基础门禁通过前，以下端到端项目仍保持未验证：

- 系统生成/下载模板与用户模板逐列、样式、下拉、隐藏 `__options`、数据验证源最终对比。
- 入职导入接口正反例：身份证派生、标黄非必填、电子签/合同模板条件必填、试用期结束日期带出。
- 导入后详情页与导出 Excel：身份证派生字段、试用期结束日期、劳动合同模板/主体、速创/E签宝字段和默认值。
- 字段修改审批同步全链路：未接单、已接单、已完成、审批通过、审批不通过。
- 社保/医保/公积金三项反馈、自动完成、批量反馈办理结果。
- 批量接单混选提示的真实页面/接口验收。

### 7.4 待命结论

QA 已停止主动复跑。下一次复测应等待 Leader 明确通知：`import_template_backend` 已提交 backend build/import tests 通过证据，且 `contract_export_frontend` 已提交 frontend lint 通过证据；否则继续复跑只会重复消耗时间且无法改变当前不通过结论。

