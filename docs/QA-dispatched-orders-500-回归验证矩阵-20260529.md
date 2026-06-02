# QA- dispatched-orders 多模块 500 回归验证矩阵（2026-05-29）

## 1. 任务状态

- 任务 ID：`bbb00e92-0af0-4b43-a3a3-63490877d877`
- 目标：验证 `/api/dispatched-orders` 多模块 500 与前端 `unhandledrejection` 兜底是否修复。
- 当前状态：**仅整理验证清单，暂不执行最终回归**。
- 执行前置：等待后端修复提交 `5fb732eb`、前端修复提交 `3f69619f` 已合入当前 integration 基线后再跑。

## 2. 基线信息

- integration worktree：`D:\AI\SpeceAppDate\工单系统\.spectrai-worktrees\integrations\e67c4d14-e561-4cf0-afcb-75c7573485d5`
- 当前 HEAD：`52b2093ae12b306432722d77d704bb27e0ce8049`
- 当前 worktree dirty 状态（已存在，勿误清理）：
  - `backend/src/modules/role-action-permissions/role-action-permission.service.ts`
  - `frontend/test-results/.last-run.json`
  - `frontend/test-results/admin-users-Admin-Users-Page-admin-can-access-users-page/error-context.md`
  - `frontend/test-results/admin-users-Admin-Users-Page-admin-can-access-users-page/test-failed-1.png`
  - `frontend/tsconfig.tsbuildinfo`
  - `frontend/tmp_import_page.txt`
  - `docs/QA-dispatched-orders-500-回归验证矩阵-20260529.md`（本文件）

## 3. 回归范围

### 3.1 必测 URL

| 页面 | 请求 URL | 关键参数 |
|---|---|---|
| 数据录入 | `/api/dispatched-orders` | `module_code=data_entry&current=1&pageSize=20&sort=dispatched_at&order=descend&page=1` |
| 社保公积金办理 | `/api/dispatched-orders` | `module_code=social_insurance&current=1&pageSize=20&sort=dispatched_at&order=descend&page=1` |
| 入职联系 | `/api/dispatched-orders` | `module_code=onboarding_contact&current=1&pageSize=20&sort=dispatched_at&order=descend&page=1` |
| 劳动合同签订 | `/api/dispatched-orders` | `module_code=contract&current=1&pageSize=20&sort=dispatched_at&order=descend&page=1` |

### 3.2 对应页面

- `/onboarding/data_entry`
- `/onboarding/social_insurance`
- `/onboarding/onboarding_contact`
- `/onboarding/contract`

## 4. 验证矩阵

### 4.1 主验证：多模块 500 兜底

| 场景 | 预期网络 | 预期页面 | 预期控制台 |
|---|---|---|---|
| 200 有数据 | `/api/dispatched-orders` 返回 200 | 列表正常显示数据 | 无 `unhandledrejection` |
| 200 空数据 | `/api/dispatched-orders` 返回 200 且 list 为空 | 正常空态 | 无红错 |
| 403 权限不足 | `/api/dispatched-orders` 返回 403 | 页面给出空态/权限提示，不崩溃 | 无 `unhandledrejection` |
| 500 服务异常 | `/api/dispatched-orders` 返回 500 | 页面展示兜底空态或错误提示，不出现大面积红错 | 无 `unhandledrejection` |
| 多模块切换 | 四个 module_code 全部覆盖 | 切换后列表与空态行为一致 | 无连续报错 |

### 4.2 Dashboard 新口径回归

| 场景 | 预期网络 | 预期结果 |
|---|---|---|
| 顶部统计 | `/api/dashboard/cards` | 仅走 cards，不回退到 `/api/dispatched-orders` |
| 本月总表 | `/api/dashboard/order-type-matrix?dimension=node&scope=*` | 按新口径展示，completion rate 不被旧聚合覆盖 |
| 负责人趋势 | `/api/dashboard/leader-trend?orderType=*&moduleCode=*` | 正常返回趋势或明确兜底，不影响顶部卡片 |
| 作废分母 | 已作废工单不计入完成率分母 | 页面/接口口径一致 |

### 4.3 原全量修复关键路径烟测

- `/my/work-orders`、`/my-dispatched`、`/work-orders`、`/team-dispatched`、`/history-work-orders`
- `/notifications`
- 工单新建 / 提交 / 派发 / 处理 / 退回 / 作废 / 撤回 / 导入 / 导出
- 目标：确认本次 dispatched-orders 修复没有回退原关键路径

## 5. 待执行命令清单

> 状态说明：当前全部为 **待执行**，需等 `5fb732eb` / `3f69619f` 修复合入后再跑。

### 前端

- `npm test -- src/pages/Notifications/index.test.tsx src/pages/TeamDispatched/index.test.tsx src/services/dashboard.test.ts src/pages/Dashboard/index.test.tsx`
- `npm run build`
- `npx eslint src --ext .ts,.tsx --max-warnings 10`
- `npm test -- --coverage`
- `npm run e2e`

### 后端

- `npm test -- --runInBand dashboard.spec.ts dispatched-order.service.spec.ts notifications.spec.ts work-order-withdraw.spec.ts`
- `npm run build`
- `npx eslint "{src,test}/**/*.ts"`
- `npm run test:e2e`
- 如需补充：`npm test -- --runInBand dispatched-order.service.spec.ts`

## 6. 已知环境限制 / 风险

- 若 integration 仍未完成 `5fb732eb` / `3f69619f` 合入，本次验证只能停留在清单阶段。
- 前端 e2e 需确认 Playwright Chromium 可用，并且启动的是 **integration worktree** 的前端服务，不是根目录服务。
- 后端 e2e 需确认原生依赖可用，避免 bcrypt native binding 缺失导致假失败。
- 覆盖率命令需确认 frontend 已装 `@vitest/coverage-v8`。

## 7. 回归判定标准

- 页面不再出现大面积红错。
- 页面不再触发 `unhandledrejection`。
- 500/403 时可正常兜底为空态或提示，不阻断列表页面。
- 四个 module_code 均覆盖且结果一致。
- Dashboard 新口径和原关键路径均无回退。

## 8. 结果占位

- 前端 test/build/lint/coverage/e2e：待执行
- 后端 build/typecheck/lint/Jest/e2e：待执行
- Dashboard 新口径回归：待执行
- 关键路径烟测：待执行
- integration dirty 状态：已记录，暂不清理
