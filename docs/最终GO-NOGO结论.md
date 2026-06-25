# 最终 GO / NO-GO 结论（v1.4）

> 执行人：QA / 测试工程师  
> 更新时间：2026-05-12（Asia/Shanghai）  
> v1.2 基线复测实例：本地 backend `PORT=3300` + Windows 原生 PostgreSQL 16 + `ticket_system` 数据库  
> v1.4/P7 关联报告：`docs/Phase7复测报告.md` v1.1

## 1. 总体结论

| 范围 | 结论 | 说明 |
|---|---|---|
| v1.2 既有生产基线 | CONDITIONAL GO | 2026-05-11 定向复测中 P3/P5/导出下载关键 blocker 已 fixed-verified；仍建议容器环境再 smoke |
| v1.4 / Phase7 新范围 | CONDITIONAL-GO | 后端/前端主体已交付，静态检查与测试脚本语法通过；待 migration/seed 与浏览器快速验收 |
| 对外上线建议 | CONDITIONAL-GO | 若明日完成 DB migration + seed + P7 快速点击验收 + 关键脚本运行，即可升级为 GO |

## 2. v1.2 基线闭环证据

| Bug | 复测命令/证据 | 实际结果 | 最终状态 |
|---|---|---|---|
| P3-E2E-001 | `node tests\final-directed-retest-3300.mjs` | submit 后 4 个 `dispatchedOrders` 均包含 `handlerId` | fixed-verified |
| P3-E2E-002 | `GET /api/dispatched-orders?page=1&pageSize=20&moduleCode=data_entry|contract|onboarding_contact|social_security` | 四个模块均 HTTP 200，`code=0` | fixed-verified |
| P5-E2E-001 | 导出模板 alias 含“员工姓名”“身份证号” | apply-preview/apply/Excel 表头与数据行均正常，无 `??` / `???` | fixed-verified |
| FINAL-FILE-DOWNLOAD-001 | `apply` 后 `GET /api/files/:id` | Excel 文件可真正下载并打开 | fixed-verified |

## 3. v1.4 / Phase7 静态复测结果

| 检查项 | 结果 |
|---|---|
| `backend/src/modules/attachments` + `backend/src/modules/stages` 存在并在 `app.module.ts` 注册 | 通过 |
| `OrderAttachment` / `OrderStage` 实体和 `1715800000000-P7Extend.ts` migration 覆盖 `order_attachments` / `order_stages` | 通过，待 DB 执行 |
| 通知标已读 `POST /notifications/:id/read` 和 `POST /notifications/read-all` 为 `@HttpCode(200)` 且返回 `{ success, unread_count }` | 通过 |
| Renewal / Resignation / Benefit 共 10 个页面存在并路由注册 | 通过 |
| `frontend/src/components/MultiViewTable/index.tsx` 已交付 | 通过 |
| 主要前端页面 `MODULE_LABEL` 已移除 `social_security` | 通过；`ExportTemplates` 保留历史社保模板选项作为兼容项 |
| `seed-fields.ts` 保留社保 5 字段 | 通过 |
| `seed-roles.ts` 软下线 `social_security_team/supervisor` | 通过 |
| `seed-dispatch-rules.ts` / `seed-module-handlers.ts` / `seed-field-permissions.ts` 同步软下线社保 | 通过 |
| `tests/p7-*.mjs` 脚本 `node --check` | 4/4 通过 |

## 4. P7 测试资产与当前状态

| 资产 | 状态 |
|---|---|
| `docs/Phase7测试用例.md` | 已完成，覆盖 P7-F ~ P7-N 9 个测试分类 |
| `tests/p7-onboarding-retest.mjs` | 已完成，语法通过 |
| `tests/p7-new-businesses.mjs` | 已完成，已兼容实际 `renewal_contract` 与 `/stages`，语法通过 |
| `tests/p7-notification-marking.mjs` | 已完成，语法通过 |
| `tests/p7-multiview-behaviour.mjs` | 已完成，语法通过，支持生成手验清单 |
| `docs/Phase7复测报告.md` | 已更新 v1.1，P7 结论 CONDITIONAL-GO |

## 5. 明日用户验收清单

### 5.1 DB 初始化

在 `backend/` 下执行：

```powershell
npm run migration:run
npm run seed
```

验收点：
- `order_attachments` / `order_stages` 表存在；
- active 角色为 9 个；
- `social_security_team` / `social_security_supervisor` 为 inactive；
- `social_security` 派发规则、处理人映射 inactive；
- `dispatched:social_security` 字段权限 hidden；
- 社保 5 字段仍保留在 `field_configs`。

### 5.2 脚本复测

```powershell
$env:API_BASE='http://127.0.0.1:3300/api'
node tests\final-directed-retest-3300.mjs
node tests\p7-onboarding-retest.mjs
node tests\p7-new-businesses.mjs
node tests\p7-notification-marking.mjs
node tests\p7-multiview-behaviour.mjs
```

验收点：无 P0 fail；如 MultiView 脚本只生成手验清单，则以浏览器手验记录补充。

### 5.3 浏览器快速验收

打开前端并点击：

1. 续签：列表 → 新建 → 详情；
2. 离职：列表 → 新建 → 详情 → 离职证明页；
3. 待遇申报：列表 → 新建 → 详情 → 材料/节点区；
4. MultiViewTable：表格 / 看板 / 网格三视图切换；
5. 看板拖拽一次：确认成功乐观更新，或接口失败时回滚并 toast 提示；
6. 通知中心：单条标已读、全部已读，确认 Badge 同步。

## 6. 当前剩余风险

| ID | 等级 | 风险 | 处置 |
|---|---|---|---|
| P7-RISK-001 | P0 条件项 | DB 尚未在本轮执行 migration/seed | 明日按清单执行后关闭 |
| P7-RISK-002 | P1 | MultiView 看板拖拽尚未浏览器验证 | 手验或 Playwright 补录 |
| P7-RISK-003 | P1 | 待遇申报 6 节点状态机尚未端到端跑通 | 执行 `p7-new-businesses.mjs` + 浏览器详情页验证 |
| P7-RISK-004 | P2 | `ExportTemplates` 保留社保模板选项 | 作为历史模板兼容接受；如产品要求“主 UI 完全不可见”，需前端再隐藏 |

## 7. 当前最终判定

**v1.4 当前最终判定：CONDITIONAL-GO。**

P7 已从 v1.3 的“未交付 NO-GO”推进到“静态通过 CONDITIONAL-GO”。完成明日 migration、seed、脚本复测和浏览器快速验收后，可升级为 **GO**。

## 8. 上线后首周关注指标

- API 5xx 率 > 2% / 5 分钟
- 子工单列表连续 3 次 5xx
- 导出下载失败率 > 5% / 5 分钟
- 登录失败率异常飙升
- DB 连接数 > 80% 持续 5 分钟
- 导入失败率 > 30% / 1 小时
- 备份任务失败
- P7 新增：`order_stages` 写入失败率 > 2% / 10 分钟
- P7 新增：`social_security` 新子单产生数 > 0 立即告警
- P7 新增：通知标已读失败率 > 5% / 10 分钟
