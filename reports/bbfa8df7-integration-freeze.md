# 集成冻结与修复顺序控制报告（任务 bbfa8df7）

观察时间：2026-06-24 11:57–12:00（Asia/Shanghai）
角色：阻塞与冲突治理专员
工作方式：只读监督；未修改业务代码。

## 1. Leader 决策记录

Leader 已决策：

- 当前无 Git / integration worktree 可确认。
- 正式采用“无 Git 根交付模式”的临时冻结点。
- 冻结点定义为：
  1. `reports/438b8ec3-qa-regression.md` 中记录的失败状态；
  2. 当前工作目录文件状态。
- 在用户或平台提供真实 integration worktree 前，不得宣称“已集成通过”。
- QA 只能在相关 owner 明确提交 build/lint 验证通过证据后复跑。

## 2. 冻结点证据

### 2.1 Git / integration 状态

只读检查结果：

| 路径/标记 | 状态 |
|---|---|
| `.git` | 缺失 |
| `backend/.git` | 缺失 |
| `frontend/.git` | 缺失 |
| `integration` | 缺失 |
| `worktree` | 缺失 |
| `worktrees` | 缺失 |

结论：当前无法用 `git status`、`git branch`、`git worktree list` 确认真实集成分支或工作树。

### 2.2 QA 失败状态（冻结点来源）

证据来源：`reports/438b8ec3-qa-regression.md`。

| 检查项 | 状态 | 关键证据 |
|---|---|---|
| Git / branch | 失败/环境风险 | `fatal: not a git repository` |
| 后端 build 第一次 | 失败 | `dispatched-order.service.ts` 引用不存在方法 `buildCompletionExtraDataPatch`、`evaluateOrderCompletion`、`applyHandlingFeedbackByBatchImport` |
| 后端 build 第二次/完整回归 | 失败且失败点变化 | `seed-fields.ts:255 conditionalRequired` 类型不匹配、`dispatched-order.controller.ts:202 getFieldSyncRecords` 不存在、`dispatched-order.service.ts:486 processed` 缺失 |
| 后端 Jest | 失败 | `Test Suites: 6 failed, 1 skipped, 46 passed, 52 of 53 total`；`Tests: 6 failed, 16 skipped, 354 passed, 376 total` |
| 前端 lint | 失败 | `19 problems (1 error, 18 warnings)`；致命错误 `frontend/src/pages/TeamDispatched/index.tsx:90 jsx-a11y/anchor-is-valid` |
| 前端 build | 通过 | `tsc -b && vite build` 成功 |
| 完整回归脚本 | 失败 | 后端 build 阶段失败，不能判定整体通过 |

### 2.3 当前关键文件状态快照

只读时间戳快照：

| 文件 | 大小/状态 | 最近写入时间 |
|---|---:|---|
| `reports/438b8ec3-qa-regression.md` | 18926 | 2026-06-24 11:52:55 |
| `reports/3ae07a31-blocker-followup.md` | 14716 | 2026-06-24 11:54:32 |
| `backend/src/modules/dispatched-orders/dispatched-order.service.ts` | 134973 | 2026-06-24 11:53:51 |
| `backend/src/modules/dispatched-orders/dispatched-order.controller.ts` | 13039 | 2026-06-24 11:46:41 |
| `backend/src/database/seeds/seed-fields.ts` | 39363 | 2026-06-24 11:59:25 |
| `backend/src/modules/dispatched-orders/handling-feedback.ts` | 4352 | 2026-06-24 11:20:56 |
| `backend/src/entities/work-order-field-sync-batch.entity.ts` | 2227 | 2026-06-24 11:41:01 |
| `backend/src/entities/work-order-field-sync-item.entity.ts` | 2579 | 2026-06-24 11:41:45 |
| `backend/src/database/migrations/20260624001000-WorkOrderFieldSyncRecords.ts` | 3710 | 2026-06-24 11:45:07 |
| `frontend/src/pages/TeamDispatched/index.tsx` | 9205 | 2026-06-23 17:35:09 |

注意：`seed-fields.ts` 在冻结监督期间仍有 11:59 写入，说明修复任务可能正在进行；后续 QA 复跑必须以 owner 明确“修复完成且验证通过”的时间点为准，而不能把旧 QA 结果视为修复后结果。

## 3. 当前团队状态观察

截至本次巡检：

- 实现/修复任务仍在进行：
  - `72d4b0a1...` 入职导入模板与后端字段派生修复：`in_progress`。
  - `3384d7bd...` 合同详情与导出字段修复：`in_progress`。
  - `056b50ab...` 字段修改审批与同步机制：`in_progress`。
  - `a5f21a99...` 社保公积金反馈与批量接单混选优化：`in_progress`。
  - `685df913...` QA阻断修复：后端审批同步编译与测试失败：`in_progress`，owner `approval_sync_workflow`。
  - `239ec7ef...` QA阻断修复：导入模板字段种子类型与后端构建：`in_progress`，owner `import_template_backend`。
  - `81767d34...` QA阻断修复：前端 TeamDispatched lint 失败：`in_progress`，owner `contract_export_frontend`。
- QA 回归任务 `438b8ec3...` 已完成但状态为 `review_pending`，其结论是当前环境不通过。
- 另有 `1be76def...` QA复测任务显示已完成/`review_pending`，但在本监督点看到多个修复 owner 仍为 `in_progress`；因此该复测结果不得被视为“修复后最终通过”，除非 QA 报告后续明确包含 owner 验证通过后的复跑证据。

## 4. 修复顺序控制

### 4.1 第一阶段：后端 build blockers 优先

必须先修后端 TypeScript build。未经后端 build 通过，不应扩大到 E2E 或声称导入/导出/审批/社保链路通过。

| Owner | 修复范围 | 必须限制 |
|---|---|---|
| `approval_sync_workflow` | `dispatched-order` / 字段同步接口返回相关 build blocker，例如 `getFieldSyncRecords`、`processed`、字段同步结构化记录相关注册/返回类型 | 不扩展重做状态机；只修阻断 build/Jest 的审批同步必要路径 |
| `import_template_backend` | `seed-fields.ts` 中 `conditionalRequired` 类型不匹配，确保字段种子类型满足后端 build | 只修字段配置类型和本轮字段口径，不重排无关字段、不改无关 seed |
| `social_feedback_batch` | 仅修其社保/批量反馈相关 build blocker，例如反馈辅助方法漏合入/重命名导致的 `buildCompletionExtraDataPatch`、`evaluateOrderCompletion`、`applyHandlingFeedbackByBatchImport` 等引用问题 | 不改审批同步结构，不抢修字段同步接口 |

后端 owner 需提交：

- 改动文件 -> 对应需求编号 -> 必要性 -> 验证证据。
- 至少包含 `backend npm run build` 通过证据。
- 若涉及 Jest，需列出定向/全量 Jest 命令与结果。

### 4.2 第二阶段：前端 lint

| Owner | 修复范围 | 必须限制 |
|---|---|---|
| `contract_export_frontend` | `frontend/src/pages/TeamDispatched/index.tsx:90` anchor lint error，以及使 warnings 降到 `--max-warnings 10` 门限内的最小必要调整 | 不做无关 UI 重构、菜单/权限/账号/看板改动；不做全局格式化 |

前端 owner 需提交：

- 改动文件 -> 对应需求编号 -> 必要性 -> 验证证据。
- 至少包含 `frontend npm run lint` 通过证据。

### 4.3 第三阶段：QA 复跑门槛

QA 只应在以下条件同时满足后复跑：

1. Leader/owner 明确当前验证目录为“无 Git 根临时冻结点”的最新修复状态。
2. 后端 owner 已明确 `npm run build` 通过。
3. 后端相关 owner 已明确后端 Jest 至少定向通过；若全量仍失败，需说明失败是否与本轮阻断有关。
4. 前端 owner 已明确 `npm run lint` 通过。
5. 所有 owner 提交完整“改动文件 -> 需求编号 -> 必要性 -> 验证证据”。

在这些条件满足前，QA 不应继续完整回归复跑，避免把变动工作区造成的错误变化误判为真实修复结果。

## 5. 停止条件

- 若 QA 第 3 次后端 build 仍失败且错误继续变化：立即停止 QA 复跑，上报用户确认当前集成状态与真实 worktree。
- 若同一 build blocker 在同一文件重复失败 2 次：冻结该文件，由 Leader 指定唯一 owner 修复；其他成员不得并行改同文件。
- 若前端 lint 修复后仍因 warning 超限失败：列出 warning 清单，由 Leader 决定是否本轮最小修复；禁止全局格式化或顺手重构。
- 若无法确认 Git/integration 状态：最终交付只能表述为“无 Git 根临时冻结点下的验证结果”，不得表述为“真实 integration 已通过”。
- 若 owner 未提交文件清单和验证证据：阻断 QA 最终通过结论。

## 6. 风险等级

| 风险 | 等级 | 理由 | 当前建议 |
|---|---|---|---|
| 无 Git/integration worktree | 高 | 无法确认真实集成基线，失败点变化无法归因 | 采用 Leader 决策的无 Git 根临时冻结点；不得宣称集成通过 |
| 后端 build blockers | 高 | 阻断后端测试、E2E、导入导出与审批/社保接口验证 | 后端 owner 先修并自证 build 通过 |
| `dispatched-order.service.ts` 多 owner 交叠 | 高 | 审批同步、社保反馈、批量接单均可能触碰同一大型服务 | 串行修复，按 owner 边界处理 |
| `seed-fields.ts` 仍在写入 | 中高 | 字段口径影响导入模板、条件必填、构建类型 | import owner 修完后冻结字段口径再 QA |
| 前端 lint | 中高 | lint 是质量门禁，当前 error + warnings 超限 | 前端 owner 最小修复后再 QA |
| 复测时机异常 | 中 | QA复测任务显示完成但修复 owner 仍 in_progress | 复测结果需等 owner 明确通过后才可作为最终证据 |

## 7. 已执行的监督动作

- 已确认 Leader 的无 Git 根交付模式与临时冻结点决策。
- 已核对 QA 报告失败证据。
- 已核对 Git/integration/worktree 缺失事实。
- 已记录关键文件当前状态快照。
- 已定义修复顺序、owner 边界、QA 复跑门槛和停止条件。

## 8. 对团队的执行要求

1. 所有实现 owner 在修复完成前不要请求 QA 复跑完整回归。
2. 所有修复只允许围绕 QA 阻断点做最小修改。
3. 所有 owner 必须在完成时提交：`改动文件 -> 需求编号 -> 必要性 -> 验证证据`。
4. QA 复跑报告必须明确：复跑发生在 owner 自证通过之后，且仍处于无 Git 根临时冻结点模式。

## 9. QA 第 6 节复测阻断升级记录（停止复测条件已触发）

记录时间：2026-06-24 12:20 后。
证据来源：`reports/438b8ec3-qa-regression.md` 第 6 节。

### 9.1 问题

QA 复测后阻断仍存在，且出现测试超时与残留进程风险。当前已满足“停止重复复测，先冻结/清理/修复”的治理条件。

具体问题：

1. `seed-fields conditionalRequired` 后端 build 阻断仍未修复。
2. `TeamDispatched` 前端 lint 阻断仍未修复。
3. 后端 Jest 从上一轮 6 个失败套件增加到 7 个失败套件，其中包含 `import.service` 条件必填新增失败。
4. 前端测试与根回归脚本本轮多次超时，QA 发现多组 `npm test` / `vitest.mjs` / worker 残留进程。
5. 当前目录仍非 Git 仓库，无法确认真实 integration 或变更基线。

### 9.2 当前证据

- `cd backend; npm run build`：仍失败，位置 `backend/src/database/seeds/seed-fields.ts:255`，`conditionalRequired` 类型不匹配。
- `cd backend; npm run test`：失败，`Test Suites: 7 failed, 1 skipped, 45 passed, 52 of 53 total`；`Tests: 7 failed, 16 skipped, 353 passed, 376 total`。
- `cd frontend; npm run lint`：仍失败，`19 problems (1 error, 18 warnings)`；致命错误仍为 `frontend/src/pages/TeamDispatched/index.tsx:90 jsx-a11y/anchor-is-valid`。
- `cd frontend; npm run test`：244 秒超时，无完整 Vitest 汇总。
- `./回归测试.ps1` 与 `./回归测试.ps1 -SkipBuild`：均 304 秒超时，无完整脚本结果。
- 根脚本 10 个关键前端测试直跑：184 秒超时，且发现多组测试残留进程。
- Git 检查仍为 `fatal: not a git repository`。

### 9.3 归属与建议动作

| 阻断 | 建议 owner | 建议动作 | QA 复跑门槛 |
|---|---|---|---|
| `seed-fields.ts:255 conditionalRequired` build 阻断 | `import_template_backend` | 定向修复 TypeScript 类型；提交文件清单与 `backend npm run build` 通过证据 | build 通过后再允许 QA 进入后端测试 |
| `TeamDispatched/index.tsx:90` lint 阻断与 warnings 超限 | `contract_export_frontend` | 最小修复 anchor-as-button 与 warnings 超限；不得全局格式化 | `frontend npm run lint` 通过 |
| 后端 Jest 7 套件失败 | 对应后端 owner + Leader 口径决策 | 先区分旧测试期望与本轮需求变更；尤其确认 `social-insurance-state-flow` 对“已接单变更进入审批 modify_pending”的期望，以及 `import.service` 合同模板条件必填触发条件 | owner 给出定向测试/全量 Jest 证据，或 Leader 明确哪些测试应更新 |
| 前端测试/根回归超时与残留进程 | Leader/QA 协调执行 | 在不误杀长期 dev 服务和其他成员任务前提下，先列出并清理残留 `npm test` / `vitest` / worker 进程；清理需由 Leader 授权或 QA 明确执行 | 清理后再跑前端测试/根回归，不得在残留进程堆积状态继续复测 |
| 无 Git/integration | Leader | 继续维持“无 Git 根临时冻结点”口径；不得宣称真实 integration 通过 | 若用户/平台提供真实 worktree，再重新建立基线 |

### 9.4 立即停止条件

- QA 不应继续第 4 次完整复测，直到：
  1. Leader 确认冻结点；
  2. 残留测试进程已清理或明确无需清理；
  3. `import_template_backend` 自证后端 build 阻断修复；
  4. `contract_export_frontend` 自证前端 lint 阻断修复；
  5. 后端 Jest 争议测试由 owner/Leader 明确“修实现”还是“更新旧测试期望”。
- 若未清理残留进程就继续前端测试/根回归，结果只能记录为环境噪声，不能作为通过/失败定论。
- 若 `social-insurance-state-flow` 与本轮审批需求口径不一致，必须先由 Leader/架构确认：已接单社保子单业务员修改进入 `modify_pending` 是否为预期；未确认前禁止围绕该测试反复改实现。
- 若 `import.service` 条件必填测试继续失败，必须先确认劳动合同模板字段的前置触发条件；未确认前禁止继续扩大导入校验改动。
