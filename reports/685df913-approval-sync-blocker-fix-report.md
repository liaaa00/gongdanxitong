# 685df913 QA阻断修复报告

## 改动文件 -> 需求编号 -> 必要性 -> 验证证据

- `backend/src/modules/dispatched-orders/dispatched-order.service.ts` -> 需求6 -> 必要性：
  - `batchAccept` 恢复统一调用 `accept()`，避免重复状态判断绕过既有方法/测试 spy，并保持批量接单行为入口一致。
  - `batchCompleteSocialInsurance` 增加空备注前置校验，确保返回 `processed/completed/skipped` 的社保批量反馈流程在无备注时先给出业务错误，而不是先查子单导致“子工单不存在”。
  - 业务领导默认使用部门范围查看子单历史，修复派发子单服务相关测试中团队范围断言失败。
  - 验证：`npm run build` 通过；相关测试集合 46/46 通过。

- `backend/test/social-insurance-state-flow.spec.ts` -> 需求6 -> 必要性：
  - 将“社保已接单后业务员修改必须冲突”的旧断言更新为需求6确认口径：已接单子工单字段变更进入 `MODIFY_PENDING` 审批，父工单旧值不变。
  - 验证：相关测试集合 46/46 通过。

- `backend/test/database-schema-guard.spec.ts` -> 需求6 -> 必要性：
  - schema guard 运行时兜底已包含 `dispatched_order_status_enum.modify_pending`；测试期望同步补齐，避免审批状态枚举修复被误判失败。
  - 验证：相关测试集合 46/46 通过。

## 验证命令与结果

- `npm run build`：通过。
- `npm test -- --runTestsByPath test/dispatched-order.service.spec.ts test/dispatched-field-sync.spec.ts test/social-insurance-state-flow.spec.ts test/p1-split4-dirty-return.spec.ts test/database-schema-guard.spec.ts`：通过，5 suites / 46 tests 全部通过。
- `npm test`：已尝试两次全量运行，分别在 185s 与 305s 超时，未取得完整全量结果。此前可复现的导出模板、导入模板、seed 用户、control-flow regression 等失败不属于需求6字段审批同步范围，本次未越界修改。

## 范围说明

- 未重做状态机。
- 未修改导入模板、合同导出、seed 用户等非需求6模块。
- 保持需求6口径：未接单直接同步；已接单进入审批；拒绝保留旧值；已完成受影响子工单禁止线上修改。
