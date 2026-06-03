# FE Menu/Dashboard QA Handoff - 0603

> Owner: 前端菜单与仪表盘工程师  
> Scope: 前端菜单、路由、看板与仪表盘修复后的只读自检与 QA 复测交接；不触碰后端。  
> Workspace checked: `D:\AI\SpeceAppDate\工单系统\.spectrai-worktrees\integrations\fbcbdb12-4c80-4f91-ad8a-01642daae998`  
> Date: 2026-06-03

## 0. Executive conclusion

- **前端菜单/仪表盘修复：GO for QA retest on integration.** 本交接报告与相关前端修复文件已纳入 integration 暂存/提交范围：`BasicLayout`、`Dashboard`、`dashboard service/mock` 及对应测试。
- **第一期口径：只开放入职、离职；在职/续签/待遇前端隐藏。** routeVisibility/moduleAccess 相关口径已在 integration HEAD 中存在，本轮重点提交菜单、仪表盘展示、mock 与交接报告。
- **后端依赖需单独验收，不能写成前端已完成。** `/api/dashboard/cards` 直返 `totalPending/monthPending`、dashboard API 服务端权限过滤、处理人/负责人 seed、社保接单后锁定流仍需后端和交互同学共同验证。

## 1. B2/B3/B4 and R1/R2/R4/R10 checklist

| Item | 自检结论 | 前端证据/说明 | QA 复测重点 | 依赖/风险 |
|---|---|---|---|---|
| **B2 前端 test/build** | **已闭环，需最终 integration 复跑确认** | 已执行 `npm run test`：34 files / 169 tests PASS；相关测试 8 files / 50 tests PASS；`npm run build` PASS。 | 在最终 integration 上复跑前端 test/build。 | 本轮未重复长命令，避免再次超过 300 秒；结果来自同一 integration worktree 前序验证。 |
| **B3 仪表盘显示在职/无权限 0 模块** | **前端渲染层已闭环** | Dashboard 趋势与矩阵只保留入职/离职；使用 `moduleAccess` 按 phase1 模块和当前角色权限过滤；无权限模块不渲染 0 卡片；社保后道只显示社保公积金增员/减员。 | 逐账号打开 `/dashboard`，不得看到在职、续签、待遇或无权限模块 0 卡。 | 后端 `cards/order-type-matrix/leader-trend` 仍必须服务端过滤。 |
| **B4 `/dashboard/cards` 缺 totalPending/monthPending** | **前端显示已兼容，最终依赖后端字段** | 看板卡片标题已补 `总待处理` / `单月待处理`；优先读取 `totalPending/monthPending`，仅保留旧 `processing` fallback。 | 构造上月遗留待办 + 本月待办，验证 `GET /api/dashboard/cards?month=2026-06` 与 UI 对齐。 | 后端必须直返字段，否则无法证明月初历史待办不清零。 |
| **R1 在职直输 URL/菜单/看板/统计** | **前端已闭环** | integration HEAD 中 `IN_SERVICE_ROLES=[]`、`PHASE1_HIDDEN_ROUTES` 覆盖 `/onboarding/renewal_contract`、`/onboarding/benefit_apply`、`/in-service*`；本轮 `BasicLayout` 将在职组 `menuVisible:false`；Dashboard 不渲染在职 trend/matrix。 | 直输 `/renewal`、`/renewal/new`、`/benefit`、`/benefit/new`、`/onboarding/renewal_contract`、`/onboarding/benefit_apply`、`/in-service`、`/in-service/contract-renewal`、`/in-service/benefit-claim`。 | 后端 API 仍需 403/过滤，不能只依赖前端隐藏。 |
| **R2 totalPending/monthPending 展示** | **前端展示已闭环** | Dashboard 卡片和说明文案明确“总待处理不受月份影响；单月待处理按所选月份统计”。 | 切换 2026-06，确认总待处理包含历史待办，单月待处理只统计当月。 | 统计正确性依赖后端 SQL/DTO。 |
| **R4 旧子工单名/负责人权限口径** | **前端展示、mock、通知 fallback 已闭环** | 新名覆盖：入职联系、劳动合同新签、增员报岗录入、社保公积金增员、劳动合同续签、待遇申报、社保公积金变更、离职材料收集、减员报岗录入、社保公积金减员；Dashboard/mock/通知回退不再显示“劳动合同签订/数据录入/社保公积金办理/离职证明/社保停保”等旧名。 | 用杨纯、毛雅妮、江璐、安娜祯、傅倩雯/付倩雯账号检查菜单、仪表盘、通知、列表显示名。 | 负责人/处理人 seed 与权限范围由后端兜底；江璐=杨纯+毛雅妮，傅倩雯仅社保增/减需后端验证。 |
| **R10 我的工单子工单级/团队只读/后道只读** | **本角色范围内已做可见性与名称过滤；只读交互需协同复测** | 菜单可见性：业务员有我发起/我的退回/历史，组长额外团队，负责人仅仪表盘+团队/历史；后道在菜单和仪表盘仅看到负责子工单模块。 | 团队工单打开详情只读；后道从我的工单/我的待办进入只读，操作回负责子工单列表。 | 详情按钮态由工单列表与详情交互任务 + 后端 action permissions 共同兜底。 |

## 2. QA retest accounts/pages

| Account | Role | Pages / direct URLs | Expected |
|---|---|---|---|
| `yaoyiping` | 业务员 | `/dashboard`, `/work-orders`, `/work-orders/import`, `/my-work/initiated`, `/my-work/returned`, `/my-work/history` | 可见入职管理、入职导入；不可见团队工单、在职、后道模块。 |
| `shenwenjun` | 业务组长 | 上述业务员页面 + `/my-work/team` | 业务员能力 + 团队视角；团队详情只读。 |
| `aolei` | 业务负责人 | `/dashboard`, `/my-work/team`, `/my-work/history`, 直输 `/work-orders/import` | 只看仪表盘、团队/历史；导入/发起不可见或 403。 |
| `yangchun` | 劳动合同后道 | `/dashboard`, `/my-work/pending`, `/dispatched-orders`, `/onboarding/contract` | 只看劳动合同新签；不见入职联系/报岗/社保/在职。 |
| `maoyani` | 入离职后道 | `/dashboard`, `/onboarding/onboarding_contact`, `/onboarding/resignation_contact` | 只看入职联系、离职材料收集。 |
| `jianglu` | 杨纯+毛雅妮合集 | `/dashboard`, `/my-work/*`, `/dispatched-orders` | 只看劳动合同新签、入职联系、离职材料收集；不含报岗/社保/待遇/在职。 |
| `annazhen` | 报岗录入后道 | `/dashboard`, `/onboarding/data_entry`, `/onboarding/data_entry_resign` | 只看增员报岗录入、减员报岗录入。 |
| `fuqianwen` / `付倩雯` | 社保公积金后道 | `/dashboard`, `/onboarding/social_insurance`, `/onboarding/social_insurance_resign` | 只看社保公积金增员、社保公积金减员；不见入职联系/合同/报岗。 |

## 3. QA retest APIs and direct URL list

### Direct URLs that must stay hidden/rejected

- `/renewal`
- `/renewal/new`
- `/benefit`
- `/benefit/new`
- `/onboarding/renewal_contract`
- `/onboarding/benefit_apply`
- `/in-service`
- `/in-service/contract-renewal`
- `/in-service/benefit-claim`

### Dashboard APIs

- `GET /api/dashboard/cards?month=2026-06`
  - Must include `totalPending` and `monthPending`.
  - Historical pending from previous months must count in `totalPending`.
- `GET /api/dashboard/order-type-matrix?dimension=node&month=2026-06`
  - Frontend will hide in-service/benefit rows; backend should not return unauthorized rows for current user.
- `GET /api/dashboard/leader-trend?...`
  - Phase 1 trend should be onboarding/resignation only.

### Permission APIs for backend兜底

- `jianglu`: dispatched/dashboard scope should equal 杨纯 + 毛雅妮 only; no `data_entry`, `social_insurance`, `benefit_apply`.
- `fuqianwen` / `付倩雯`: only `social_insurance` + `social_insurance_resign`.
- `annazhen`: only `data_entry` + `data_entry_resign`.
- `aolei`: create/import/write APIs rejected.

## 4. Commands already run and result

Run directory: `D:\AI\SpeceAppDate\工单系统\.spectrai-worktrees\integrations\fbcbdb12-4c80-4f91-ad8a-01642daae998\frontend`

| Command | Result |
|---|---|
| `npm run test -- src/config/routeVisibility.test.ts src/layouts/BasicLayout.test.tsx src/pages/Dashboard/index.test.tsx src/utils/moduleAccess.test.ts src/pages/Notifications/displayName.test.ts src/pages/Notifications/index.test.tsx src/pages/Resignation/index.test.tsx src/components/DispatchedBatchImportModal.test.tsx` | **PASS**: 8 files / 50 tests |
| `npm run test` | **PASS**: 34 files / 169 tests |
| `npm run build` | **PASS**: `tsc -b && vite build` completed |

## 5. Dependencies not owned by this task

1. Backend dashboard cards: direct `totalPending/monthPending` fields and SQL correctness.
2. Backend dashboard scope: `cards/order-type-matrix/leader-trend` must filter phase1 and module permissions server-side.
3. Backend handler/seed: 江璐=杨纯+毛雅妮；傅倩雯/付倩雯 only 社保公积金增员/减员；安娜祯 only 报岗录入增/减.
4. Social insurance accepted/locked workflow E2E: depends on backend workflow and WorkOrders/MyDispatched detail interaction changes.
5. Final release must rerun frontend and backend build/test after all members merge.

## 6. Remaining risks / GO-NO-GO

- **FE menu/dashboard scope**: GO for QA retest on integration.
- **Release**: CONDITIONAL GO. Requires backend permission/dashboard API兜底、社保锁定流 E2E、final frontend/backend build/test.
- **Residual risk**: if backend directly returns unauthorized modules, frontend hides them in Dashboard but API/data security must still be fixed server-side.
