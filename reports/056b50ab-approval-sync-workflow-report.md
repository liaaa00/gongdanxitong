# 056b50ab 字段修改审批与同步机制报告

## 改动文件 -> 对应需求 -> 必要性

- `backend/src/entities/work-order-field-sync-batch.entity.ts`
  - 对应需求：结构化记录一次字段变更批次、触发来源、审批/同步总状态。
  - 必要性：OperationLog JSON 留痕不便按批次和子单状态查询，新增批次表支撑查询口径。

- `backend/src/entities/work-order-field-sync-item.entity.ts`
  - 对应需求：记录变更字段、原值、新值、哪些子工单已同步/审批中/不通过/保留旧值。
  - 必要性：将批次拆到子单+字段维度，满足明细查询和后续前端展示。

- `backend/src/database/migrations/20260624001000-WorkOrderFieldSyncRecords.ts`
  - 对应需求：新增结构化持久化表和索引。
  - 必要性：生产/测试环境显式迁移创建表，避免依赖 synchronize。

- `backend/src/entities/index.ts`、`backend/src/app.module.ts`、`backend/src/database/data-source.ts`
  - 对应需求：让新实体可被 TypeORM/Nest 加载。
  - 必要性：注册实体和迁移数据源，否则 repository 注入和迁移生成不可用。

- `backend/src/modules/dispatched-orders/dispatched-order.module.ts`
  - 对应需求：在派发子单模块注入新 repository。
  - 必要性：字段修改入口、审批入口都在派发子单服务内。

- `backend/src/modules/dispatched-orders/dispatched-order.service.ts`
  - 对应需求：
    - 未接单子工单字段修改直接同步并记录 `direct_synced/synced`。
    - 已接单子工单字段变更进入 `modify_pending` 并记录 `approval_pending`。
    - 审批通过后应用新值并标记 `approved`。
    - 审批拒绝后保留旧值并标记批次 `rejected`、明细 `kept_old`。
    - 已完成受影响子工单禁止线上修改。
    - 查询返回 `syncSummary`，支持按发起子单或受影响子单追溯批次/明细。
  - 必要性：基于现有 9 状态体系补充审批同步明细，不重做状态机。

- `backend/src/modules/dispatched-orders/dispatched-order.controller.ts`
  - 对应需求：结构化查询字段同步/审批结果。
  - 必要性：新增 `GET /dispatched-orders/:id/field-sync` 供前端或 QA 查询。

- `backend/src/modules/dispatched-orders/dispatched-order.types.ts`
  - 对应需求：详情返回 richer `syncSummary` 类型。
  - 必要性：前端详情可逐步消费同步/审批明细，无需大改 UI。

- `backend/test/dispatched-field-sync.spec.ts`
  - 对应需求：补测试覆盖直接同步、审批中、拒绝保留旧值、已完成阻断。
  - 必要性：锁定状态流口径，防止回归。

## 验证结果

- `npm test -- --runTestsByPath test/dispatched-field-sync.spec.ts`：通过，4/4。
- `npm test -- --runTestsByPath test/dispatched-field-sync.spec.ts test/dispatched-resubmit.spec.ts test/work-order-status.spec.ts`：通过，19/19。
- `npm run build`：通过。

## 范围合规

- 仅修改后端字段修改审批/同步相关实体、迁移、派发子单服务/controller/types/module、测试和本报告。
- 未改导入导出模板、权限菜单、看板等无关功能。
- 状态体系沿用现有 `pending/processing/modify_pending/completed/...`，没有新增工单状态枚举。

## 风险与后续

- 新增迁移需在部署环境执行。
- 目前 `syncSummary` 提供后端结构化数据；若需要完整可视化，可由前端详情页按现有 pendingModify/dirty 展示基础增量接入。
