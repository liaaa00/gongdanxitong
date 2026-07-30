# 阶段2 在职管理后端实现报告

- 任务：e2e3b408-8dfe-4000-a9bc-381e3e54eff2
- 范围：在职单项业务后端实体、DTO、Service、Controller、状态机、Sheet2 分类树种子，以及 Sheet4 派单接入。
- 实现：
  - 增加 `OrderType.IN_SERVICE`、`InServiceOrderStatus`、办理渠道和三级分类枚举/映射；保留既有订单类型与派单路径。
  - 新增 `in_service_orders` 实体和幂等迁移，包含金额、附件上限、状态约束、软删除、乐观锁及用户/客户/部门外键。
  - 新增 REST CRUD、审批/驳回/开始办理/补料/重提/完成/关闭端点；全端点沿用 JWT 与角色范围校验。
  - 派单审批调用 `HandlerPickerService.pick(FIXED, in_service_single_business, ..., {province, mappingSource: 'sheet4'})`；Sheet4 映射优先，未命中才接受显式人工处理人，缺失时保留空处理人，不读取 `assignee_user_id/fallback_user_id`。
  - 在 `dispatched-order.service.ts` 末尾追加 `draft -> dispatched -> processing -> pending_info -> processing` 及 `completed/archived` 合法转移，非法转移返回 400；补料可重复往返。
  - 新增 Sheet2 三级分类幂等种子，并注册到启动 seed、TypeORM 实体和应用模块。
- 验证：
  - `npm run build`：通过。
  - 阶段2 + 既有派单定向 Jest：2 suites，34 tests passed。
  - 全量后端 Jest：63 suites passed，1 skipped，478 tests passed，16 skipped；3 个 bcrypt 套件因本机跳过原生安装脚本缺少 `bcrypt_lib.node`，1 个既有 `p1-split4-dirty-return` 历史状态记录断言失败，均与本次阶段2改动无关。
  - `回归测试.ps1 -BackendOnly`：通过（后端构建）。
  - 根目录 `回归测试.ps1`：通过，前端关键测试 10 suites / 109 tests passed、前端构建和后端构建均通过；仅有既存 Vite/jsdom 警告。
- 规则覆盖：未改变既有入职、续签、离职、待遇派单或 dispatch_rules 死字段语义；新增 Sheet4 在职映射规则已写入业务回归清单。
