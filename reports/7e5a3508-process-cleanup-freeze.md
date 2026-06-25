# QA 残留测试进程安全清理与复测冻结监督（任务 7e5a3508）

执行时间：2026-06-24 12:34–12:45（Asia/Shanghai）
角色：阻塞与冲突治理专员
边界：未修改业务代码；仅在 Leader 授权范围内清理明确测试残留进程。

## 1. Leader 授权与执行原则

Leader 授权清理残留 `npm test` / `vitest` / worker 进程，但要求：

- 清理前先只读列出 PID、进程名、完整命令行、父进程/父命令行（如可得）。
- 不得误杀 dev/server/build/数据库/浏览器等非测试进程。
- 仅可终止明确属于本轮 QA 复测残留的 `npm test`、`vitest`、`jest worker`、`node test worker`。
- 清理前后记录清单和理由。
- 继续监督复测冻结：在 `import_template_backend` 提交 backend build + import 条件必填相关测试通过证据、`contract_export_frontend` 提交 frontend lint 通过证据前，禁止 QA 第 4 次完整复测。

## 2. 清理前只读发现

### 2.1 首次发现

第一次兼容 WMI 扫描列出了多组明显的前端 Vitest 残留链，命令行均指向：

- `frontend/node_modules/.../vitest.mjs run --run ...`
- `vitest run src/pages/MyDispatched/Detail/index.test.tsx`
- `vitest ... forks.js`
- `npm-cli.js test -- --run ...`，测试文件包括：
  - `src/config/routeVisibility.test.ts`
  - `src/pages/MyDispatched/index.test.tsx`
  - `src/pages/MyDispatched/Detail/index.test.tsx`
  - `src/pages/TeamDispatched/index.test.tsx`
  - `src/pages/HistoryWorkOrders/index.test.tsx`
  - `src/pages/WorkOrders/index.test.tsx`
  - `src/pages/OnboardingModule/index.test.tsx`
  - `src/pages/OnboardingModule/filterParams.test.ts`
  - `src/pages/Dashboard/index.test.tsx`
  - `src/utils/dispatchedStatusFilter.test.ts`

这些与 QA 第 6 节报告的“根脚本 10 个关键前端测试”和 `MyDispatched/Detail` 定向 Vitest 超时残留相符。

### 2.2 清理前完整 JSON 清单摘要

清理前完整扫描识别到以下测试样进程：

| PID | PPID | 进程 | 判定 | 理由 |
|---:|---:|---|---|---|
| 41084 | 41016 | `cmd.exe` | 可清理 | `vitest run --run` 前端关键测试链 |
| 42572 | 41084 | `node.exe` | 可清理 | `frontend/node_modules/.../vitest.mjs run --run` |
| 39292 | 42572 | `node.exe` | 可清理 | Vitest worker `vitest/dist/workers/forks.js` |
| 34836 | 38604 | `cmd.exe` | 可清理 | `vitest run --run` 前端关键测试链 |
| 42744 | 34836 | `node.exe` | 可清理 | `frontend/node_modules/.../vitest.mjs run --run` |
| 33992 | 42744 | `node.exe` | 可清理 | Vitest worker |
| 40036 | 39444 | `cmd.exe` | 可清理 | `npx vitest run src/pages/MyDispatched/Detail/index.test.tsx` |
| 31884 | 40036 | `node.exe` | 可清理 | `npx-cli.js vitest run ...` |
| 1308 | 31884 | `cmd.exe` | 可清理 | `vitest run src/pages/MyDispatched/Detail/index.test.tsx` |
| 38156 | 1308 | `node.exe` | 可清理 | `vitest.mjs run src/pages/MyDispatched/Detail/index.test.tsx` |
| 25144 | 38156 | `node.exe` | 可清理 | Vitest worker |
| 41664 | 38652 | `cmd.exe` | 可清理 | `vitest run --run` 前端关键测试链 |
| 34664 | 41664 | `node.exe` | 可清理 | `vitest.mjs run --run` |
| 22636 | 34664 | `node.exe` | 可清理 | Vitest worker |
| 40744 | 36232 | `cmd.exe` | 可清理 | `npx vitest run src/pages/MyDispatched/Detail/index.test.tsx` |
| 39380 | 40744 | `node.exe` | 可清理 | `npx-cli.js vitest run ...` |
| 32336 | 39380 | `cmd.exe` | 可清理 | `vitest run src/pages/MyDispatched/Detail/index.test.tsx` |
| 13488 | 32336 | `node.exe` | 可清理 | `vitest.mjs run src/pages/MyDispatched/Detail/index.test.tsx` |
| 11388 | 13488 | `node.exe` | 可清理 | Vitest worker |
| 41628 | 40264 | `cmd.exe` | 暂不清理 | 后端 Jest `export-template` 定向测试，可能是实现成员自证，不属于 QA 前端残留 |
| 40720 | 41628 | `node.exe` | 暂不清理 | `npx-cli.js jest ... export-template...` |
| 4848 | 40720 | `cmd.exe` | 暂不清理 | `jest --config ... export-template...` |
| 26116 | 4848 | `node.exe` | 暂不清理 | `backend/node_modules/.../jest.js ... export-template...` |

说明：后端 Jest `export-template` 链未清理，原因是它可能属于实现成员定向验证/自证，不是 QA 第 6 节提到的前端 Vitest 残留。遵守“不误杀非本轮 QA 残留”的原则。

## 3. 清理动作

### 3.1 首次清理尝试

首次清理脚本使用了 `$pid` 变量名，PowerShell 中 `$PID` 为只读内置变量，导致未实际终止进程。该尝试已记录为失败探测，没有继续沿用同一写法。

### 3.2 实际清理命令结果

改用安全变量名后，按命令行过滤“前端 Vitest / QA 关键测试 / MyDispatched Detail 定向测试 / Vitest worker”，并排除 dev/server/build/数据库/浏览器相关命令。

实际选择的目标 PID：

`1308,11388,13488,22636,25144,31884,32336,33992,34664,34836,38156,38604,38652,39292,39380,40036,40744,41016,41084,41664,42572,42744`

实际停止结果：

| PID | 结果 |
|---:|---|
| 1308 | stopped |
| 11388 | stopped |
| 13488 | stopped |
| 22636 | stopped |
| 25144 | stopped |
| 33992 | stopped |
| 34664 | stopped |
| 34836 | stopped |
| 38156 | stopped |
| 38604 | 已退出/找不到进程 |
| 39292 | stopped |
| 41016 | stopped |
| 42572 | stopped |
| 42744 | stopped |

说明：部分父/子进程在终止链路时自动退出，因此未逐一打印 stopped；后续复核确认测试样进程已清空。

## 4. 清理后复核

最终复核命令按以下模式检查：

- `vitest`
- `jest`
- `npm-cli.js test`
- `npx-cli.js vitest/jest`
- `node_modules/.../vitest` / `node_modules/.../jest`

结果：`NO_TEST_LIKE_PROCESSES`。

结论：当前未发现残留 `npm test` / `vitest` / `jest` / worker 测试样进程。

## 5. 未清理/避免误杀说明

- 未按进程名粗暴杀全部 `node.exe`。
- 未杀 dev/server/build 命令，如 `npm run dev`、`vite`、`nest start`、`node dist/main` 等。
- 未杀数据库、浏览器或未知非测试进程。
- 对后端 Jest `export-template` 定向链最初采取保守策略，未作为 QA 前端残留清理；最终复核时已无测试样进程。

## 6. 复测冻结监督

继续冻结 QA 第 4 次完整复测，直到满足以下条件：

1. `import_template_backend` 提交：
   - `backend npm run build` 通过证据；
   - `import.service` 条件必填相关定向测试或说明；
   - “改动文件 -> 需求编号 -> 必要性 -> 验证证据”。
2. `contract_export_frontend` 提交：
   - `frontend npm run lint` 通过证据；
   - `TeamDispatched` anchor/warnings 修复说明；
   - “改动文件 -> 需求编号 -> 必要性 -> 验证证据”。
3. 后端 Jest 中 `social-insurance-state-flow` 与本轮审批需求的期望口径由 Leader/架构/owner 明确：
   - 若已接单变更进入 `modify_pending` 是新预期，则更新旧测试；
   - 若不是新预期，则退回实现修复。
4. 当前仍为无 Git 根临时冻结模式；无真实 integration worktree 前不得宣称集成通过。

## 7. 停止条件

- 若 QA 在两个 owner 自证前发起第 4 次完整复测，应视为违反冻结规则，并停止继续消耗复测资源。
- 若清理后再次出现大量 Vitest/Jest 残留，应先列 PID/命令行/父进程并确认来源，不得直接按进程名批量杀。
- 若 backend build 或 frontend lint 仍失败，不得进入端到端验收或宣称整体通过。
