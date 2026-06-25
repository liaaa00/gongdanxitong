# 工单系统 Backend

## 测试数据清理

`backend/scripts/cleanup-test-data.sql` 用于清理后端测试/验收脚本产生的工单数据，当前按 `work_orders.extra_data->>'source'` 覆盖三类来源：

- `phase6_seed`
- `e2e_test`
- `qa_dispatched_delete_acceptance`

执行脚本会先输出待删除主工单数量，再删除匹配的 `work_orders`。`dispatched_orders` 等依赖主工单的记录依赖数据库 FK `ON DELETE CASCADE` 自动跟随清理，无需在脚本中额外手工删除。

历史脚本 `backend/scripts/cleanup-phase6-seed.sql` 已保留为兼容入口，实际请优先使用 `cleanup-test-data.sql`。
