# 阶段2在职管理前端交付报告

日期：2026-07-27

## 交付范围

- 路由：`/in-service`、`/in-service/new`、`/in-service/:id`、`/in-service/:id/audit` 已接入 RoleRoute。
- 权限：阶段2在职列表/详情开放给现有业务和后道角色；新建仅业务组角色/管理员；审批仅业务负责人、业务组长/管理员。续签、待遇入口继续隐藏。
- 表单：Sheet1 单项业务字段、27 省简称、客户/部门选项、三级分类联动、服务费 2 位小数、线上/线下、紧急程度、5 附件上限与必填校验。
- 列表/详情：分页筛选（省份、状态、业务类型、优先级、创建时间、关键词）、派单结果接单人、进度时间线、审批/驳回/开始办理/补料/完成/关闭等动作。
- 服务：`frontend/src/services/inServiceOrders.ts` 提供真实 REST 与 test/dev mock 生命周期；省外模块和 `businessScope` 暂不实现。

## 验证结果

- 定向 Vitest：4 files，49 tests passed。
- `npm run build`：TypeScript 与 Vite production build passed。
- 后端阶段2接口当前未在本 worktree，REST 字段/状态映射已保留 snake_case 兼容；待后端合入后进行联调回归。
