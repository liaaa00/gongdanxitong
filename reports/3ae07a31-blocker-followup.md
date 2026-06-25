# 持续阻塞与集成风险巡检报告（任务 3ae07a31）

观察时间：2026-06-24 11:41–11:47（Asia/Shanghai）
角色：阻塞与冲突治理专员
范围：只读巡检；未修改业务代码。

## 1. 巡检结论摘要

- 当前仍有实现类任务进行中，未发现已上报的“同一测试/构建失败 2 次以上”或明确成员互相等待链。
- 最高风险仍是无 Git 根、无 integration/worktree 目录，QA 最终验收与评审无法基于统一 diff/worktree 进行。
- 已出现审批同步相关活跃写入，集中在后端高冲突区域：`seed-fields.ts`、`dispatched-order.service.ts`、新增 field sync 实体/迁移、模块注册文件。
- 未见近期前端源文件写入；社保反馈/批量接单相关后端文件曾在 11:20–11:24 写入，审批同步文件在 11:41–11:45 写入，后续 integration 需重点检查二者在 `dispatched-order.service.ts` 的交叠。

## 2. 当前证据

### 2.1 团队任务状态

- 仍在进行：
  - `7ff9a47c...` 验收矩阵与实现边界统筹
  - `72d4b0a1...` 第一批：入职导入模板与后端字段派生修复
  - `3384d7bd...` 第一批：合同详情与导出字段修复
  - `056b50ab...` 第二批：字段修改审批与同步机制
  - `a5f21a99...` 第三/四批：社保公积金反馈与批量接单混选优化
  - `438b8ec3...` QA 回归矩阵与最终验证
- 已完成并 accepted：范围守门、初始阻塞治理、无 Git 根模式补充范围审查。

### 2.2 integration / Git 状态

- `D:\ai\speceappdate\工单系统` 下未发现：`.git`、`backend/.git`、`frontend/.git`、`.spectrai`、`integration`、`worktree`、`worktrees`。
- QA 报告已记录：当前目录不是 Git 仓库，`git status` / `git branch` / `git worktree list` 无法使用；等待 Leader 指定 integration worktree。
- 范围守门报告已记录：从当前目录向上到 `D:\` 也未发现 `.git`，当前只能依赖成员文件清单、时间戳、报告证据和显式排除清单。

### 2.3 近期写入与热点文件

| 文件/区域 | 最近证据 | 风险等级 | 说明 |
|---|---|---:|---|
| `backend/src/database/seeds/seed-fields.ts` | 2026-06-24 11:45 左右仍在写入 | 高 | 第一批字段口径、审批同步字段、社保反馈字段都可能改此文件；无 Git 时无法自动合并冲突。 |
| `backend/src/modules/dispatched-orders/dispatched-order.service.ts` | 2026-06-24 11:24 写入，文件约 125KB | 高 | 需求 6/7/8/9 都会触碰的大型服务；社保反馈与审批同步最容易交叠。 |
| `backend/src/modules/dispatched-orders/handling-feedback.ts` | 2026-06-24 11:20 写入 | 中高 | 看起来与社保/公积金反馈相关，需与批量完成/批量反馈状态逻辑核对。 |
| `backend/src/entities/work-order-field-sync-batch.entity.ts`、`work-order-field-sync-item.entity.ts` | 2026-06-24 11:41–11:42 新增/写入 | 中高 | 对应需求 6 结构化记录；需迁移、实体注册、仓储注入一致。 |
| `backend/src/database/migrations/20260624001000-WorkOrderFieldSyncRecords.ts` | 2026-06-24 11:45 写入 | 中高 | 已存在迁移，降低“缺表”风险；但仍需在 integration DB 上验证 migration:run。 |
| `backend/src/database/data-source.ts`、`backend/src/app.module.ts`、`backend/src/modules/dispatched-orders/dispatched-order.module.ts` | 2026-06-24 11:44 写入 | 中 | 实体注册/模块注入变更，需构建验证，避免漏注册或循环依赖。 |
| `frontend/tsconfig.tsbuildinfo` | 2026-06-24 11:44 写入 | 低/交付排除 | 构建缓存，不能作为交付源文件。 |
| `backend/package-lock.json`、`frontend/package-lock.json` | 2026-06-24 08:32/08:47 写入 | 中 | 除非实现成员说明需求相关依赖变化，否则建议排除，不纳入最终交付。 |

### 2.4 构建/运行日志

- `backend-run.err.log`、`frontend-run.err.log` 未见尾部错误。
- `backend-run.out.log` 尾部有历史 Dashboard SQL fallback warning：`leader-trend fallback: syntax error at or near "$1"`，与本轮需求无直接证据关联；不建议本轮顺手修复。
- 暂未发现明确编译失败或重复失败记录。

## 3. 风险分级与治理建议

### R1. integration worktree / Git 根缺失阻断最终评审与 QA

- 风险等级：高
- 问题：无法用统一 `git diff`、`git status`、`git worktree list` 证明改动范围和集成状态；QA 报告也明确等待 integration worktree。
- 当前尝试次数：已多次只读检查，仍未发现 Git/integration 目录。
- 建议动作：
  1. 请求 Leader 明确真实 integration worktree 路径；或明确本轮采用“无 Git 根交付模式”。
  2. 若采用无 Git 根模式，必须强制所有实现成员提交完整清单：`改动文件 -> 对应需求 -> 必要性 -> 验证证据 -> 是否生成物/是否排除`。
  3. 最终 QA 不应重复运行 `git` 探测超过 2 次；若仍无 Git，直接标记为环境/流程风险并按文件清单验收。
- 停止条件：最终验收阶段如果仍无 integration worktree，停止等待和重复 git 探测，上报 Leader/用户确认交付基线。

### R2. `dispatched-order.service.ts` 职责交叠风险

- 风险等级：高
- 问题：社保反馈/批量接单与审批同步都集中在同一大型服务；现有时间戳显示 11:20–11:24 已有社保反馈相关写入，审批同步随后新增实体/模块注册。
- 当前尝试次数：尚未发生可见 merge 冲突；属于预防性高风险。
- 建议动作：
  1. integration 时指定单一整合 owner，建议由 `approval_sync_workflow` 最终串行整合状态流；`social_feedback_batch` 提供接口/字段/测试证据。
  2. 合入顺序仍建议：需求 9 批量接单提示小改 → 需求 7/8 社保反馈 → 需求 6 审批同步。
  3. 若出现同文件第二次冲突，冻结该文件，不允许两名成员继续并行编辑，改为一个 owner 手工整合。
- 停止条件：同一文件冲突重复出现 2 次，停止并行合并，Leader 指派整合 owner。

### R3. 新增 field sync 实体/迁移需要集成验证

- 风险等级：中高
- 问题：新增 `work_order_field_sync_batches/items` 实体、迁移、模块注册；迁移已存在，但尚未见测试/构建通过证据。
- 当前证据：`synchronize: false`，迁移 `20260624001000-WorkOrderFieldSyncRecords.ts` 已创建并创建两张表及索引。
- 建议动作：
  1. integration 后优先执行后端构建与 migration:run 验证。
  2. 若 migration:run 失败第一次，记录 SQL/表/约束错误并由 `approval_sync_workflow` 修复；第二次仍失败则停止继续迁移重试，上报 Leader 决策是否回退该结构化记录方案或拆成更小迁移。
  3. QA 需覆盖审批通过/拒绝后 field sync item 状态与原值/新值留存。
- 停止条件：迁移或实体注册相关错误重复 2 次，冻结审批同步变更，先保证第一批主流程可验收。

### R4. `seed-fields.ts` 持续写入可能影响第一批模板口径

- 风险等级：高
- 问题：该文件是导入模板字段、必填/条件必填、审批同步字段、社保反馈字段的共同入口；当前 11:45 仍在写入。
- 建议动作：
  1. 由 `import_template_backend` 或 Leader 指定字段口径 owner 做最终整理。
  2. 其他成员若只需要新增审批/反馈字段，应提交最小字段清单，不要重排无关字段或改第一批字段说明。
  3. QA 比对用户 Excel/截图前，需确认此文件已冻结。
- 停止条件：若模板字段测试失败 2 次且失败点涉及字段顺序/必填说明，停止反复调模板，回到用户 Excel 逐列矩阵重核。

### R5. package-lock 与生成物污染交付

- 风险等级：中
- 问题：`backend/package-lock.json`、`frontend/package-lock.json` 有近期写入；`frontend/tsconfig.tsbuildinfo` 为构建缓存。
- 建议动作：
  1. 除非成员证明新增依赖与需求 1–9 直接相关，否则 package-lock 不纳入交付或需回退。
  2. `tsconfig.tsbuildinfo`、`dist/`、`node_modules/`、运行日志一律列入排除清单。
- 停止条件：若最终交付清单包含上述生成物且无必要性说明，范围守门应建议回退，不进入 QA 主流程。

## 4. 当前阻塞处理记录

| 问题 | 尝试次数 | 当前证据 | 建议动作 | 停止条件 |
|---|---:|---|---|---|
| integration worktree / Git 根缺失 | 多次只读检查，仍未发现 | `.git`、`integration`、`worktree(s)` 均缺失；QA/范围报告均记录该风险 | 请求 Leader 提供路径或确认无 Git 根交付模式；禁止反复 git 探测 | 最终 QA 前仍缺失则标为环境阻塞，上报 Leader/用户 |
| 实现成员仍在执行，缺最终清单 | 0 | 多个实现任务仍 in_progress | 等成员完成；强制提交文件清单与验证证据 | 若成员完成但无清单，阻断最终范围合规结论 |
| `dispatched-order.service.ts` 高冲突 | 0（预防性） | 社保反馈与审批同步均可能触碰；文件近期写入 | 串行合入，指定最终 owner | 同文件冲突第 2 次即冻结并重分配整合 |
| 新增审批同步实体/迁移待验证 | 0 | 实体、迁移、模块注册已写入；未见构建/迁移通过证据 | integration 后先跑 build/migration 定向验证 | 同迁移/实体错误第 2 次即停止重试并上报 |
| 生成物/lockfile 污染风险 | 0 | lockfile 与 tsbuildinfo 有近期写入 | 最终清单中默认排除，除非有需求必要性 | 无说明则建议回退/排除 |

## 5. 需要 Leader 决策/协调的事项

1. 请明确 integration worktree 或确认本轮使用无 Git 根交付模式。
2. 请指定 `dispatched-order.service.ts` 最终整合 owner，避免审批同步与社保反馈并行覆盖。
3. 请要求所有实现成员在完成时提交“改动文件 -> 需求编号 -> 必要性 -> 验证证据”。
4. 如果第一批主流程尚未稳定，建议不要让审批同步大改阻断第一批验收；必要时按批次冻结/拆分交付。

## 6. 本次巡检未发现事项

- 未发现已记录的同一测试/构建失败达到 2 次。
- 未发现明确成员互相等待链。
- 未发现近期前端源文件大范围写入。
- 未发现运行日志尾部存在本轮需求相关的明确编译失败。

## 7. QA 阻断升级记录（2026-06-24 11:51 后）

### 7.1 问题

QA 已报告当前环境不通过，且满足阻塞治理介入条件：

1. 后端 `npm run build` 两次失败，失败点不完全一致，疑似集成工作区仍在变动。
2. 后端 Jest 失败：`Test Suites: 6 failed, 1 skipped, 46 passed, 52 of 53 total`；`Tests: 6 failed, 16 skipped, 354 passed, 376 total`。
3. 前端 `npm run lint` 失败：`19 problems (1 error, 18 warnings)`，其中致命错误为 `frontend/src/pages/TeamDispatched/index.tsx:90 jsx-a11y/anchor-is-valid`；且 warnings 数量超过 `--max-warnings 10` 门限。
4. 当前目录仍不是 Git 仓库，无法确认当前验证对象是否为冻结后的 integration。

### 7.2 当前证据

证据来源：`reports/438b8ec3-qa-regression.md`。

- 首次后端 build 失败点：`backend/src/modules/dispatched-orders/dispatched-order.service.ts` 引用不存在方法 `buildCompletionExtraDataPatch`、`evaluateOrderCompletion`、`applyHandlingFeedbackByBatchImport`。
- 完整回归脚本再次执行时后端 build 仍失败，但错误变化为：`seed-fields.ts:255 conditionalRequired` 类型不匹配、`dispatched-order.controller.ts:202 getFieldSyncRecords` 不存在、`dispatched-order.service.ts:486 processed` 缺失。
- 后端 Jest 6 个套件失败，QA 已列出 `test/dispatched-order.service.spec.ts` 等失败项；在 build 未稳定前，不建议继续扩大 E2E。
- 前端 lint 错误位于 `frontend/src/pages/TeamDispatched/index.tsx:90`，另有 18 个 warning，需一起降到门限内。
- QA 已明确：完整项目回归脚本在后端 build 阶段失败，当前不能判定本轮需求整体通过。

### 7.3 风险等级

- 总体风险：高，已阻断 QA 验收。
- 后端 build：高，阻断后端单测、E2E、导入导出与审批/社保接口可靠验收。
- 后端 Jest：高，但应在 build 稳定后再复跑定位，否则可能混入编译阶段变动噪声。
- 前端 lint：中高，若 lint 是合入门禁则阻断前端质量通过。
- integration 状态：高，无 Git/integration 确认导致“失败点变化”无法判断是修复引入还是工作区持续变动。

### 7.4 建议动作

1. 立即冻结当前 integration/工作目录：在 Leader 未确认前，所有实现成员停止继续直接改同一验证目录；如必须修复，由 Leader 指定 owner 和修复窗口。
2. Leader 确认最新合并状态：明确当前目录是否就是 integration；若不是，提供真实 integration worktree；若无 Git 根，则声明采用无 Git 根交付模式并锁定文件清单。
3. 修复归属建议：
   - `approval_sync_workflow`：优先修复 field sync 相关 build 错误，包括 `getFieldSyncRecords`、`processed`、`conditionalRequired` 若由审批同步字段改动引发。
   - `social_feedback_batch`：核对 `dispatched-order.service.ts` 中社保反馈/批量反馈方法是否漏合入或被重命名，特别是 `buildCompletionExtraDataPatch`、`evaluateOrderCompletion`、`applyHandlingFeedbackByBatchImport`。
   - `import_template_backend`：核对 `seed-fields.ts:255 conditionalRequired` 类型口径，避免字段配置破坏后端 build。
   - 相关前端 owner 或 Leader 指派成员：修复 `TeamDispatched/index.tsx:90` lint error，并将 warnings 降至门限内；不要顺手重构无关页面。
4. 修复验证顺序：先后端 `npm run build`，再后端定向 Jest/全量 Jest，再前端 `npm run lint`，最后通知 QA 复跑完整回归。
5. QA 在收到“integration 已冻结 + 修复 owner 汇报通过 build/Jest/lint”前，不再继续重复完整回归，避免无意义重试和噪声扩大。

### 7.5 停止条件

- 如果后端 build 第 3 次仍失败且失败点继续变化：停止 QA 复跑，Leader 必须先冻结 integration 并要求实现成员提交最终文件清单/修复说明。
- 如果同一 build 错误在同一文件重复出现第 2 次：由对应 owner 定向修复；不得由其他角色并行改同文件。
- 如果前端 lint 修复后仍因 warning 超限失败：停止只修单个 error，改为列出 warning 清单并由 Leader 决定本轮是否清理或临时调整门禁；默认不允许大范围格式化。
- 如果无法确认 integration/Git 状态：最终报告必须标为环境/流程阻塞，不能宣称整体通过。
