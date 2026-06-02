# Demo Gate Go/No-Go 最终验收接力清单（0602 演示 / 06-03 09:00）

> 出品：架构与需求统筹（architect_requirements）— QA 失联（quota_exhausted 被移除）后只读接力
> 任务 ID：`bb445753-d32f-4e3f-ab4d-5b3edab013e9`
> 日期：2026-06-02
> 性质：**只读接力**。不改业务代码、不回滚他人改动；本清单仅整理 Go/No-Go、待复测命令、演示风险，等后端/前端提交合入后由 Leader/剩余成员执行最终验证。
>
> 基线文档：
> - `docs/QA_FINAL_ACCEPTANCE_REPORT_20260602.md`（QA 最后落盘的复测结论，No-Go）
> - `docs/验收矩阵-0602演示-20260602.md` §5 Demo Gate（验收基准）
> - `docs/集成前闭环对照清单-0602演示-20260602.md`（实现→验收→演示映射）
> - `docs/协作契约-AH验收-0602演示-20260602.md`（六维执行契约）

---

## 0. 一句话结论

**当前 = No-Go（预集成口径）。** 阻断集中在两侧且尚未合入 integration：

- **后端 P0**：`notification.service.ts` 类型错误导致 `backend npm run build` 失败，连带 returnOrder（E-1/E-3）、B2、F3 多项测试无法完整运行；returnOrder 在父单 WITHDRAWN 下的前置 409 拦截与父/子单状态不改写为 RETURNED 仍未收敛。
- **前端 P0**：A1（业务负责人旧路径阻断）、H5（TeamDispatched 子工单 API/只读详情）相关任务为 `conflict_with_integration + changes_requested`，未合入。

**已稳定可演示**：看板 G（dashboard.spec 19/19、前端 dashboard 17/17、build 通过）、架构验收矩阵（A–H 全表 + 五条裁决，已 accepted 合入 integration）。

---

## 1. Go/No-Go 决策口径（沿用验收矩阵 §7）

| 判定 | 条件 |
|---|---|
| **Go** | 所有 P0 自动化与 §5 演示主线通过；无权限越权、状态流错误、导入不可用、看板核心指标错误、团队工单可操作等阻断。 |
| **Conditional Go** | 仅剩 P1/P2 或非阻断 UI 文案问题，且演示路线可稳定走完。 |
| **No-Go** | 任一 P0 阻断存在且演示前无法规避。 |

> 当前判定：**No-Go**。需先修通后端 build → 再修 A1/H5 前端口径 → 补齐 returnOrder/B2/F3 证据 → integration 合入后全量复测。

---

## 2. 已通过项（绿灯，可直接进演示）

| 项 | 范围 | 证据 | 任务/状态 |
|---|---|---|---|
| **看板 G1/G2** 待处理拆分（总待处理 + 本月待处理） | dashboard | `backend npm test dashboard.spec` **19/19 passed**；`frontend npm test dashboard` **17/17 passed**；`frontend npm run build` 通过 | 605eaad7 / 90d07d7f / cd75b7aa / 0352202a 均 `merged_to_integration` |
| **看板月初不丢历史遗留** | dashboard | `totalPending` 不受所选月份限制（DTO 已声明 + 测试覆盖） | 同上，accepted |
| **架构验收矩阵 A–H + 五条裁决** | architect | `docs/验收矩阵-0602演示-20260602.md` + 协作契约 + 闭环对照清单，3 份文档 tracked 入 integration | 85a08794 / 42369c77 / e500284a 均 `merged_to_integration + accepted` |
| **前端通知 lifecycle 入口（D4/D6 前端侧）** | import_notification（前端部分） | `notificationLifecycle.regression.test.tsx` 2/2 passed | QA 报告 PASS-02（后端联动仍待确认） |

> 注：通知 D4「处理后提醒消失」依赖后端通知与子单状态联动，前端入口已过，**后端联动需 build 修通后端到端确认**，不计入纯绿灯。

---

## 3. 仍待后端修复的 P0（红灯）

> 责任角色：`backend_workflow`（部分 `import_notification_engineer`）。相关任务 cdbc0ce2 / fb29cc75 / 409ddbc2 / 1e9b1770 当前均 `in_progress`，未提交评审。

### P0-后端-1：returnOrder 在父单 WITHDRAWN 下必须前置拦截 409，父/子单状态不得改写为 RETURNED

| 维度 | 内容 |
|---|---|
| 口径 | 父工单处于 WITHDRAWN（已撤回）时，对其子单发起退回（returnOrder）必须**前置拦截返回 409**；**禁止**把父单或子单状态改写为 RETURNED。撤回态已脱离后道办理流，不可被退回动作重新拉回流转。 |
| 现状 | ❌ 未收敛。需后端在 returnOrder 入口按父单 `status === WITHDRAWN` 前置短路抛 409（业务冲突），并确保不进入任何 RETURNED 状态写入分支。 |
| 验收断言 | (1) 父单 WITHDRAWN → 调 returnOrder → 返回 **409**，响应体含明确业务原因；(2) 调用后父单仍 WITHDRAWN、子单状态未变为 RETURNED；(3) 父单非 WITHDRAWN 的正常退回路径不受影响（回归保护）。 |
| 必补回归测试 | `work-order.service.spec.ts` / `dispatched-order.service.spec.ts` 增：「父单 WITHDRAWN 下 returnOrder 抛 409 且状态不变」「正常态 returnOrder 仍可退回」两条。 |
| 关联裁决 | 矩阵 §3 E-3（撤回/退回态脱流处理）、E-1（修改与重提解耦）。 |

### P0-后端-2：`notification.service.ts` 类型错误 → build 失败（总阻断根因）

| 维度 | 内容 |
|---|---|
| 口径 | `backend npm run build` 必须通过，否则 E/F/B2 全部测试无法完整运行。 |
| 现状 | ❌ `src/modules/notifications/notification.service.ts`：`counts.backend[bucket] += 1` 推断为 `never`；`bucket` 与 `urge/sla_warning/sla_breached` 比较类型不收敛（QA-0602-BLOCKER-01）。 |
| 验收断言 | `cd backend && npm run build` 退出码 0，无 TS 报错。 |
| 关联 | 这是连带阻断 returnOrder 测试、B2、F3 的根因，**必须最先修通**。 |

### P0-后端-3：E-1 修改不自动重提 + E-3 撤回/退回态作废直达 VOID

| 维度 | 内容 |
|---|---|
| 口径 | E-1：修改（update）仅保存 extraData，不触发派发、不改流转状态；重提是独立动作。E-3：WITHDRAWN/RETURNED 子单作废→直接 VOID 免审批；PROCESSING/PENDING 在办态作废→仍走 VOID_PENDING。 |
| 现状 | ❌ `work-order.service.ts` L178/L211/L250 仍 `shouldRequireResubmitAfterEdit` 自动重提；`dispatched-order.service.ts` L701-702 `voidByCreator` 对所有状态一律 `VOID_PENDING`。 |
| 验收断言 | E-1：退回工单→改→保存→状态仍 RETURNED 未自动流转；E-3：撤回子单作废→直接 VOID 无审批节点，在办子单作废→仍 VOID_PENDING。 |
| 必补回归测试 | 「修改后状态不变」「撤回态作废直接 VOID」「在办态作废仍审批」三条。 |

### P0-后端-4：B2 江璐社保/录入列表后端 403

| 维度 | 内容 |
|---|---|
| 口径 | 江璐(SHARED_TEAM_OWNER)访问社保/数据录入列表，后端返回 403（前端 B3 已收敛，需后端成对兜底）。 |
| 现状 | ❌ 受 build 阻断无法完整复测；且社保码 B4/C-1 未收敛——`roleAllowsModule`/`roleAccessibleModules` 未识别新码 `onboarding_social_insurance`/`resignation_social_insurance`。 |
| 验收断言 | jianglu 查询社保/录入列表 → 403；社保角色查新码子单 → 正常返回；旧码 `social_insurance` 仍兼容。 |

### P0-后端-5：F3 导出模板再导入闭环

| 维度 | 内容 |
|---|---|
| 口径 | 系统导出的模板能原样再导入成功，不报「缺少行/字段」。 |
| 现状 | ❌ `import-job.service` 受通知 TS 错误阻断，F3 闭环证据不完整（QA-0602-BLOCKER-06，责任 import_notification_engineer）。 |
| 验收断言 | `import-job.service.spec.ts` 通过；导出→导入闭环无报错。 |

---

## 4. 仍待前端修复/评审的 A1/H5（红灯）

> 责任角色：`frontend_permissions_ui`。相关任务 a356a36a / 82996683 / 2db561ba 当前 `conflict_with_integration + changes_requested`；35cc5f1e `review_pending`。

### P0-前端-1：A1 业务负责人旧路径阻断

| 维度 | 内容 |
|---|---|
| 口径 | 业务负责人（business_owner）菜单仅 仪表盘 + 我的工单(团队工单 + 历史工单)；必须从 `INITIATED_WORK_ROLES`/`ONBOARDING_ROLES`/`IN_SERVICE_ROLES`/`OFFBOARDING_ROLES` 移除，旧路径 `/work-orders` 等阻断。 |
| 现状 | ❌ `routeVisibility.test.ts` 业务负责人 `/work-orders` 期望与实现不一致（QA-0602-BLOCKER-03），任务 changes_requested。 |
| 验收断言 | aolei 登录菜单仅 仪表盘 + 团队工单 + 历史工单；旧路径不可达；`routeVisibility.test.ts` 通过。 |

### P0-前端-2：H5 TeamDispatched 子工单 API/只读详情

| 维度 | 内容 |
|---|---|
| 口径 | 团队工单按子工单粒度一行一条（裁决：子工单列/API，非主工单）；可打开**只读详情**不可操作；发起人列非空。 |
| 现状 | ❌ `TeamDispatched/index.test.tsx` 测试期望与子工单口径对齐仍失败（QA-0602-BLOCKER-04），任务 changes_requested + conflict_with_integration。 |
| 验收断言 | 团队工单一子单一行；员工/类型/发起人三列齐全且发起人有值；点「只读详情」进入无任何操作按钮的详情页；`TeamDispatched/index.test.tsx` 通过。 |

### P0-前端-3：我的退回子工单「一行一条」（H1/H2）

| 维度 | 内容 |
|---|---|
| 口径 | 我的退回页按子工单粒度一行一条，去除重复筛选区/重复数据区。 |
| 现状 | ⚠️ 前端相关测试大多通过，需随 A1/H5 合入后一并回归确认。 |
| 验收断言 | 我的退回页只有一套筛选、无重复行、一子单一行。 |

---

## 5. 待复测命令清单（integration 合入后由 Leader/剩余成员执行）

> 前置：Leader 将 backend_workflow / frontend_permissions_ui / import_notification 改动合入 integration worktree 后，**在 integration 分支**逐条执行。当前主工作区预检结果仅供参考，最终以 integration 为准。

### 5.1 后端（先验 build，再验状态机/权限/导入）

```bash
# ① 编译闸门（最先跑，不过则后续全部阻断）
cd backend && npm run build

# ② returnOrder 父单 WITHDRAWN 前置 409 + 状态不改写（P0-后端-1，核心演示项）
cd backend && npm test -- --runTestsByPath test/work-order.service.spec.ts test/work-order-withdraw.spec.ts test/control-flow-regression.spec.ts

# ③ E-1 修改不自动重提 + 子单重提链路
cd backend && npm test -- --runTestsByPath test/return-resubmit.spec.ts

# ④ E-3 撤回/退回态作废直达 VOID（在 dispatched-order spec）
cd backend && npm test -- --runTestsByPath test/dispatched-order.service.spec.ts

# ⑤ B1/B2 分工与江璐范围
cd backend && npm test -- --runTestsByPath test/onboarding-split-and-users.spec.ts

# ⑥ F3 导入闭环
cd backend && npm test -- --runTestsByPath test/import.service.spec.ts test/import-job.service.spec.ts test/export-template.spec.ts test/export-template-default-shared.spec.ts test/export-templates-columns.spec.ts

# ⑦ 看板（已绿，回归确认）
cd backend && npm test -- --runTestsByPath test/dashboard.spec.ts
```

### 5.2 前端（A1/H5 合入后）

```bash
# ⑧ A1 业务负责人路由 + H5 TeamDispatched 子工单口径 + 我的工单一行一条
cd frontend && npm test -- --run src/config/routeVisibility.test.ts src/layouts/BasicLayout.test.tsx src/pages/TeamDispatched/index.test.tsx src/pages/MyDispatched/index.test.tsx src/services/dispatchedOrders.test.ts src/services/dispatchedOrders.download.test.ts

# ⑨ 通知 lifecycle（已绿，回归）
cd frontend && npm test -- --run src/pages/Notifications/notificationLifecycle.regression.test.tsx

# ⑩ 看板（已绿，回归）
cd frontend && npm test -- --run src/services/dashboard.test.ts

# ⑪ 前端构建闸门
cd frontend && npm run build
```

### 5.3 端到端冒烟（后端 build 通过后，可选）

```bash
# ⑫ 真实服务冒烟（依赖后端可启动；build 未过前禁止）
cd frontend && npm run smoke:live
```

> 注意：`backend npm run lint` 含 `--fix`，主工作区有他人未提交改动时**不要执行**，避免自动改写他人文件。

---

## 6. 演示风险摘要（给 Leader 决策）

| 风险 | 等级 | 说明 | 缓解 |
|---|---|---|---|
| 后端 build 未修通 | 🔴 高 | notification.service 类型错误是总闸门，连带 returnOrder/B2/F3 无法验证 | 优先级最高，backend 先修；修通前演示只能走看板+前端可见性 |
| returnOrder 父单 WITHDRAWN 未拦截 409 | 🔴 高 | 演示「撤回后作废/退回」主线若状态被错误改写为 RETURNED，会暴露状态机 bug | 修复 + 补回归；演示前必须跑通 5.1-② |
| A1/H5 前端未合入 | 🔴 高 | 业务负责人菜单越权 / 团队工单口径不一致，是演示账号必演项 | frontend 解 changes_requested 后合入，跑通 5.2-⑧ |
| 三任务 conflict_with_integration | 🟡 中 | a356a36a/82996683/2db561ba 仍冲突态，需 Leader 在集成层处置（参照此前 force_merge 经验） | 合入前不可复测；Leader 协调集成 |
| 通知 D4 后端联动未端到端验证 | 🟡 中 | 前端入口已过，「处理后消失」需后端 build 通过后端到端确认 | build 修通后跑端到端 |
| 社保码 B4/C-1 未收敛 | 🟢 低（P1） | 演示可降级为接口层验证，非主线 | backend 加新码兼容分支 |

---

## 7. 接力状态与下一步（架构只读边界）

- **本清单为只读整理**，未改任何业务代码，未回滚他人改动。
- **当前 = No-Go**，待后端 build + returnOrder 409 + 前端 A1/H5 合入 integration 后，按 §5 命令全量复测再更新判定。
- 架构侧交付物（验收矩阵/协作契约/闭环对照清单/本接力清单）均已落盘，可作为 Leader 与剩余成员的验收基准。
- 待 backend_workflow / frontend_permissions_ui 提交并合入后，我可继续以只读方式更新本清单的 Go/No-Go 状态列与复测结果回填，供最终验证。
- 若出现新的架构口径争议（如 returnOrder 409 的幂等语义、撤回态边界），我提供裁决支持。

> **更新约定**：本文件 §2/§3/§4 的状态列在成员合入后回填实际复测结果（✅/❌ + 命令证据），§0 一句话结论同步切换 Go / Conditional Go / No-Go。
