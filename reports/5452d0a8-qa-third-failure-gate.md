# 5452d0a8 QA 第三轮失败后的修复门槛与最小复测口径

> 任务：QA第三轮失败后的修复门槛与最小复测口径  
> 角色：架构与需求统筹  
> 时间：2026-06-24 约 12:35（Asia/Shanghai）  
> 范围：只读治理口径；未修改业务代码。

## 1. 当前结论：暂停 QA 重复复测

基于 `reports/438b8ec3-qa-regression.md` 最新复测记录（11:54-12:18）与当前团队状态，当前结论仍为 **不通过**。即日起暂停 QA 重复复测，直到以下两个 owner 均提交自验证通过证据：

1. `import_template_backend`：完成 `seed-fields.ts:255 conditionalRequired` 类型修复，并修复/确认导入条件必填相关单测失败。
2. `contract_export_frontend`：完成 `frontend/src/pages/TeamDispatched/index.tsx:90 jsx-a11y/anchor-is-valid` 修复，并将 lint warning 数降到门限以内。

在两类证据未到齐前，QA 不再重复运行完整回归脚本、前端全量测试或 E2E，以免继续产生超时、残留进程与无效噪声。

## 2. 第三轮失败证据摘要

| 类别 | 最新失败证据 | 当前治理判断 |
|---|---|---|
| 后端 build | `cd backend; npm run build` 仍失败：`src/database/seeds/seed-fields.ts:255 conditionalRequired` 类型不匹配 | `import_template_backend` 必须先修复；未修前后端接口/E2E均不可验收 |
| 后端 test | `cd backend; npm run test` 失败：`Test Suites: 7 failed, 1 skipped, 45 passed, 52 of 53 total`；`Tests: 7 failed, 16 skipped, 353 passed, 376 total` | 失败套件增加，必须由相关 owner 自证关键单测恢复 |
| 导入条件必填 | `test/import.service.spec.ts` 新增失败：`keeps contract_template in onboarding import but does not require it even when company contract is required`，期望 `ok=true` 实际 false | 必须确认合同模板条件必填触发口径；不能把非触发场景误判必填 |
| 前端 lint | `cd frontend; npm run lint` 仍失败：`TeamDispatched/index.tsx:90 jsx-a11y/anchor-is-valid`，另有 18 warnings；`--max-warnings 10` 下即使修 error 也可能失败 | `contract_export_frontend` 必须先修 lint error + warning 门限 |
| 前端/回归命令 | `frontend npm run test`、完整 `回归测试.ps1`、`回归测试.ps1 -SkipBuild`、10 个关键前端测试直跑均超时/无完整结果 | QA 暂停重复运行，待进程/环境清理和 owner 自验证后按最小集合复测 |
| Git/integration | 当前目录仍非 Git 仓库，无法确认 integration worktree、变更文件清单、是否混入未完成改动 | 继续保留高风险提示；不得宣称已集成通过 |

## 3. Owner 修复完成门槛

### 3.1 `import_template_backend` 必须完成的门槛

**修复范围**：

- `backend/src/database/seeds/seed-fields.ts:255 conditionalRequired` 类型错误。
- 导入条件必填相关失败，尤其是 `contract_template` 在入职导入中的触发口径。
- 需求 1/4 相关条件必填必须保持一致：`1.是/2.否`、`need_esign=1.是 -> esign_platform 必填`、合同模板/主体等字段只在明确前置条件触发时必填。

**必须提交的自验证命令结果**：

1. `cd backend; npm run build`
   - 必须通过。
   - 输出摘要需明确不再出现 `seed-fields.ts:255 conditionalRequired`。
2. `cd backend; npm run test -- --runInBand test/import.service.spec.ts`
   - 若项目 Jest 参数不支持该精确形式，可提交等价定向执行命令。
   - 必须覆盖并通过导入条件必填相关用例。
3. `cd backend; npm run test -- --runInBand test/import-template.service.spec.ts test/import-template-config.service.spec.ts`
   - 必须证明模板字段/隐藏 sheet/配置条件口径未被修坏。
4. 如果修改了 seed 或字段口径，还需提交“改动文件 -> 需求编号 -> 必要性 -> 验证证据”：
   - `seed-fields.ts` 对应需求 1/4。
   - `field-validation.service.ts`、`import-template-config.service.ts` 对应需求 1/4。

**完成标准**：以上命令至少一次在当前冻结目录中成功，并将关键输出写入成员报告或团队消息；否则不触发 QA 复测。

### 3.2 `contract_export_frontend` 必须完成的门槛

**修复范围**：

- `frontend/src/pages/TeamDispatched/index.tsx:90` 的 `anchor-is-valid`，禁止继续用无 href 的 `<a>` 当按钮。
- lint warnings 数必须降至 `--max-warnings 10` 门限内；仅允许最小必要修复，不做无关 UI 重构。

**必须提交的自验证命令结果**：

1. `cd frontend; npm run lint`
   - 必须通过。
   - 输出摘要需明确不再出现 `TeamDispatched/index.tsx:90 jsx-a11y/anchor-is-valid`，且 warning 数不超过 10。
2. `cd frontend; npm run build`
   - 建议提交通过结果，确认 UI 修复不破坏构建。
3. 如果修复涉及批量接单 UI，需提交最小手工/测试证据：
   - 混选已接单/未接单时，界面能展示成功接单数量与跳过数量。

**完成标准**：lint 必须通过；未通过则不触发 QA 前端复测。

## 4. QA 下一轮最小复测集合

仅当 3.1 与 3.2 的 owner 自验证证据均到齐后，QA 按以下顺序复测。

### 4.1 门禁复测（必须先做）

1. `cd backend; npm run build`
   - 目标：确认后端 build 阻断解除。
2. `cd backend; npm run test -- --runInBand test/import.service.spec.ts`
   - 目标：确认导入条件必填不再失败。
3. `cd frontend; npm run lint`
   - 目标：确认 TeamDispatched lint 与 warning 门限解除。

若上述任一失败，立即停止本轮 QA，不继续完整回归。

### 4.2 需求级最小复测

门禁通过后，再跑以下最小业务复测：

| 需求 | 最小复测 |
|---|---|
| 需求 1 | 下载入职导入模板，与用户 Excel 比对字段顺序/字段名/必填说明/填写要求/示例/下拉源/隐藏 `__options`/数据验证数量 |
| 需求 4 | 导入正例：`是否电子签=1.是` + `电子签平台=速创/E签宝`；反例：`是否电子签=1.是` 但电子签平台空必须失败；非触发场景不误报合同模板必填 |
| 需求 6 | 仅在后端 build/test 稳定后，抽测未接单直接同步、已接单进入审批、审批通过合并、审批拒绝保留旧值、结构化记录可查 |
| 需求 9 | 批量接单混选 pending + processing：只接 pending，processing 返回 skipped，前端展示成功/跳过数量 |

### 4.3 完整回归触发条件

只有当 4.1 和 4.2 均通过，才运行：

- `cd backend; npm run test` 全量后端单测。
- `cd frontend; npm run test` 全量前端测试。
- 根目录 `回归测试.ps1`。

## 5. 超时与残留进程处理策略

第三轮中多个前端/回归命令超时且无完整结果，因此下一轮必须先控制环境噪声。

1. 运行前记录当前 Node/npm/vitest 进程清单；若存在上一轮残留测试进程，由 Leader 或阻塞治理确认后清理。
2. 单条命令建议超时：
   - 后端 build：120 秒。
   - 后端定向 Jest：180 秒。
   - 前端 lint：120 秒。
   - 前端全量 test：300 秒。
   - 根回归脚本：360 秒。
3. 若命令超时：
   - 标记为“超时/无完整结果”，不得算通过。
   - 保存已输出日志摘要、进程清单、命令开始/结束时间。
   - 不连续重复跑同一超时命令超过 1 次；第二次前必须先清理残留进程并确认 integration 冻结。
4. 若前端测试再次超时但 lint/build 已通过，QA 可先只跑与需求 9 相关的最小页面/服务测试，暂不扩大全量测试。
5. 不要为追求通过而手动修改测试输出、跳过失败测试或扩大超时时间掩盖问题。

## 6. 无 Git 根 / integration 不可确认风险

该风险仍未解除：

- 当前工作目录执行 Git 状态类命令仍无 Git 根，无法确认分支、commit、worktree 或统一 diff。
- 无法仅凭文件时间戳确认最终交付范围，也无法判断是否混入其他成员未完成改动。
- 因此所有 owner 完成时必须提交完整清单：`改动文件 -> 需求编号 -> 必要性 -> 自验证命令/结果`。
- 在真实 integration worktree 或明确冻结目录未确认前，不得使用“最终集成通过”表述，只能说“当前目录自验证通过/失败”。

## 7. 对团队的即时要求

1. QA 保持待命，不再重复复测，直到收到两个 owner 的自验证通过证据。
2. `import_template_backend` 先修后端 build 与 import 条件必填；这是下一轮 QA 的第一门槛。
3. `contract_export_frontend` 先修 TeamDispatched lint；这是下一轮 QA 的第二门槛。
4. 若任一 owner 只提交“已修复”但无命令结果，视为未完成，不触发 QA。
5. 阻塞治理继续维护冻结点和进程清理；若目录仍无 Git 根，需在报告中持续标注 integration 风险。
