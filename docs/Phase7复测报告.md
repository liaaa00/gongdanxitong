# Phase 7 复测报告

> 版本：v1.1  
> 执行人：QA / 测试工程师  
> 日期：2026-05-12  
> 环境：Windows + 本地工作目录 `D:\AI\SpeceAppDate\工单系统`  
> 依据：`docs/P7-需求确认与实施拆分.md`、`docs/Phase7测试用例.md`  
> 说明：本轮为 P7 后端/前端实际交付后的静态 smoke + 脚本语法复核；Leader 已确认 backend/frontend build + unit test 均绿色。

## 1. 摘要结论

**Phase 7 当前结论：CONDITIONAL-GO。**

本轮静态复核显示 P7-B 后端与 P7-C 前端主体已经交付：

- 后端 `attachments` / `stages` 模块、实体、迁移与 `AppModule` 注册已归位。
- 通知标已读接口已改为 HTTP 200 + JSON 返回体，单条与全部已读的 POST 路径均有 `@HttpCode(200)`。
- 前端 Renewal / Resignation / Benefit 共 10 个页面文件存在并完成路由注册。
- `frontend/src/components/MultiViewTable/index.tsx` 已交付，并配套 ViewSwitcher / KanbanView / GridView / FilterViews / ColumnsConfigDrawer。
- `social_security` 已从主工单、我的子单、团队子单等主要 `MODULE_LABEL` 中移除；后端字段种子仍保留 5 个社保字段。
- 后端 seeds 已对 `social_security_team` / `social_security_supervisor`、`dispatch_rules`、`module_handlers`、`field_permissions` 做软下线同步。
- 4 个 `tests/p7-*.mjs` 脚本均通过 `node --check`。

仍需运行时确认的条件：DB 尚未在本轮执行现成 migration + seed；SSE/SLA、MultiView 看板拖拽需要打开浏览器实测；待遇申报状态机需跑一遍端到端。上述完成后即可转 GO。

## 2. 静态复核明细

| 检查项 | 证据 | 结果 |
|---|---|---|
| attachments/stages 模块归位 | `backend/src/modules/attachments/*`、`backend/src/modules/stages/*` 存在；`backend/src/app.module.ts` import 并注册 `AttachmentsModule` / `StagesModule`；`OrderAttachment` / `OrderStage` 实体注册 | 通过 |
| migration 覆盖通用表 | `backend/src/database/migrations/1715800000000-P7Extend.ts` 创建 `order_attachments` / `order_stages` 与索引 | 静态通过，待 DB 执行 |
| 通知标已读 200 + JSON | `notification.controller.ts` 中 `@Post(':id/read') @HttpCode(200)`、`@Post('read-all') @HttpCode(200)`；`notification.service.ts` 返回 `{ success, unread_count }` | 通过 |
| 三类新业务页面 | Renewal 3 页、Resignation 4 页、Benefit 3 页，共 10 个 `index.tsx` 页面存在 | 通过 |
| 路由注册 | `frontend/src/routes/index.tsx` 注册 `/renewal`、`/renewal/new`、`/renewal/:id`、`/resignation`、`/resignation/new`、`/resignation/:id`、`/resignation/:id/cert`、`/benefit`、`/benefit/new`、`/benefit/:id` | 通过 |
| MultiViewTable | `frontend/src/components/MultiViewTable/index.tsx` 已建，配套看板/网格/筛选/列配置组件 | 通过，待浏览器拖拽验证 |
| social_security 前端主标签 | `WorkOrders`、`WorkOrders/Detail`、`MyDispatched`、`MyDispatched/Detail`、`TeamDispatched` 的 `MODULE_LABEL` 不再含 `social_security` | 通过 |
| social_security 历史入口 | `ExportTemplates` 仍保留社保模板选项；可解释为历史模板查询/导出兼容 | 接受风险，非阻塞 |
| 社保 5 字段保留 | `seed-fields.ts` 保留 `social_location/start_month/social_base/fund_base/fund_ratio` | 通过 |
| roles 软下线 | `seed-roles.ts` 中 `social_security_team` / `social_security_supervisor` 为 `isActive: false` | 通过 |
| dispatch-rules 软下线 | `seed-dispatch-rules.ts` 最后将 `target_module='social_security'` 更新为 `isActive=false` | 通过 |
| module-handlers 软下线 | `seed-module-handlers.ts` 对 `social_security` 执行 `isActive=false` | 通过 |
| field-permissions 软下线 | `seed-field-permissions.ts` 对 `dispatched:social_security` 全字段写入 `HIDDEN` | 通过 |
| P7 脚本语法 | `node --check tests\p7-onboarding-retest.mjs` 等 4 个脚本 | 通过 |

> QA 修正：实际交付中续签子单模块为 `renewal_contract`，状态节点接口为 `/stages`。已同步修正 `tests/p7-new-businesses.mjs`，并保留 `/order-stages` fallback 兼容早期契约草案。

## 3. P7-F ~ P7-N 分类结果

| 分类 | 覆盖范围 | 本轮结果 | 备注 |
|---|---|---|---|
| P7-F | 入职 3 子工单拆单矩阵 | 静态通过，待 DB 运行时验证 | dispatch seed 只保留 `data_entry`、条件 `onboarding_contact`、条件 `contract`；`social_security` 规则软下线 |
| P7-G | 续签端到端 | 静态通过，待运行时验证 | `renewal_contract` seed、handler、权限、页面与路由均已归位 |
| P7-H | 离职端到端 | 静态通过，待运行时验证 | `resignation_contact` / `resignation_cert` 条件拆单、页面、证明页均存在 |
| P7-I | 待遇申报端到端 | 静态通过，待运行时验证 | `benefit_apply`、`attachments`、`stages` 均已交付；6 节点需真实跑一遍 |
| P7-J | 标已读交互 UX | 后端静态通过，前端需浏览器点验 | 后端 200 + JSON 已满足；Badge 同步需 UI 点击验证 |
| P7-K | MultiViewTable | 静态通过，待浏览器验证 | 源码组件齐全；看板拖拽、三视图切换、localStorage 持久化需打开浏览器验证 |
| P7-L | 社保软下线替换回归 | 静态通过，待 seed 后数据验证 | roles/rules/handlers/permissions 均软下线，5 字段保留 |
| P7-M | 字段权限 / 配置一致性 | 静态通过，待 admin UI/DB 验证 | field-permissions 覆盖 P7 新场景与社保 hidden |
| P7-N | Phase1~6 非回归 smoke | 脚本就绪，待服务运行后复跑 | `final-directed` + 4 个 P7 脚本需在 migration/seed 后跑 |

## 4. 本轮脚本校验

已执行：

```powershell
node --check tests\p7-onboarding-retest.mjs
node --check tests\p7-new-businesses.mjs
node --check tests\p7-notification-marking.mjs
node --check tests\p7-multiview-behaviour.mjs
```

结果：4/4 通过。

建议运行时复测命令：

```powershell
$env:API_BASE='http://127.0.0.1:3300/api'
node tests\final-directed-retest-3300.mjs
node tests\p7-onboarding-retest.mjs
node tests\p7-new-businesses.mjs
node tests\p7-notification-marking.mjs
node tests\p7-multiview-behaviour.mjs
```

## 5. CONDITIONAL-GO 剩余条件

| 条件 | 责任 | 通过标准 |
|---|---|---|
| 执行 migration | 用户/后端 | `npm run migration:run` 成功，`order_attachments` / `order_stages` 表存在 |
| 执行 seed | 用户/后端 | `npm run seed` 成功，9 个 active 角色，社保 2 角色 inactive，P7 规则/处理人/字段权限落库 |
| P7 脚本运行 | QA/用户 | 4 个 P7 脚本真实运行无 P0 fail |
| SSE/SLA 验证 | QA/用户 | 通知流与 SLA 提醒不回退 |
| 浏览器快速验收 | 用户/前端/QA | 3 个新业务页面可打开，MultiView 三视图切换与看板拖拽可用 |
| 待遇状态机 E2E | QA/用户 | 创建→材料/节点→退回补充→用印→收齐→线下申报→完成闭环 |

## 6. 明天用户需做的 3 件事

1. 在 `backend/` 下执行：
   ```powershell
   npm run migration:run
   ```
2. 在 `backend/` 下执行：
   ```powershell
   npm run seed
   ```
3. 打开浏览器快速点击：
   - 续签 / 离职 / 待遇申报 3 个新业务页面：列表、新建、详情；
   - MultiViewTable：表格 / 看板 / 网格三视图切换；
   - 看板拖拽一次，确认成功更新或失败回滚提示。

## 7. 结论

**CONDITIONAL-GO。**

P7 静态交付与测试框架层面已从 v1.0 的 NO-GO 转为 CONDITIONAL-GO。待 migration + seed + 浏览器快速验收 + 待遇状态机端到端复跑完成后，可升级为 GO。
