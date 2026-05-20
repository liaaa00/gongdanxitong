# Phase 2 管理后台测试用例

优先级说明：P0 = 阻塞阶段验收；P1 = 重要但可短期规避；P2 = 体验增强或低频场景。

通用验收约束：

- 所有 `/api/admin/*` 接口必须要求 `@Roles('admin')`。
- 所有写操作必须进入审计，写入 `operation_logs`。
- 批量接口必须事务化：任一项失败则整体回滚。
- 响应结构统一为 `{code,data,message,traceId}`；分页统一为 `{page,pageSize,total,totalPages,list}`。
- 删除默认软删除，即 `is_active=false`。

## 1. 用户管理

### P2-USER-001 新增用户成功并绑定多角色

- 优先级：P0
- 前置：admin 已登录；角色、部门 seed 已存在。
- 步骤：
  1. 进入 `/admin/users`。
  2. 点击新建，填写 username、realName、phone、email、password。
  3. 添加两条角色绑定：业务员/业务部、项目经理/业务部，其中一条 `isPrimary=true`。
  4. 保存。
- 预期：创建成功；用户列表出现新用户；详情返回 roles 数组；恰好一条 `isPrimary=true`；操作日志记录 create。

### P2-USER-002 同一角色允许绑定不同部门

- 优先级：P1
- 前置：存在同一用户、同一角色和两个启用部门。
- 步骤：
  1. 编辑用户角色绑定。
  2. 添加同一 roleId 在不同 departmentId 下的两条记录。
  3. 保存。
- 预期：保存成功；后端不误判为重复；返回两条不同部门绑定。

### P2-USER-003 重复 roleId + departmentId 组合应被拒绝

- 优先级：P0
- 前置：admin 已登录；存在角色和部门。
- 步骤：
  1. 新建或编辑用户。
  2. 添加两条完全相同的 `(roleId, departmentId)`。
  3. 保存。
- 预期：前端提示重复；直接调用 API 时后端返回 400/业务错误码；数据库无重复记录。

### P2-USER-004 角色绑定必须恰好一个主角色

- 优先级：P0
- 前置：admin 已登录。
- 步骤：
  1. 提交 roles 全部 `isPrimary=false`。
  2. 再提交两条 `isPrimary=true`。
- 预期：两种请求均失败；错误信息指向主角色约束。

### P2-USER-005 禁用有未完成子工单的用户应失败

- 优先级：P0
- 前置：目标用户存在未完成 `dispatched_orders.handler_id`。
- 步骤：调用 `DELETE /api/admin/users/:id` 或编辑 `isActive=false`。
- 预期：返回业务错误码 4202；响应列出冲突子工单编号；用户仍为启用。

### P2-USER-006 重置密码后触发强制改密

- 优先级：P1
- 前置：admin 已登录；目标用户存在。
- 步骤：调用 `/api/admin/users/:id/reset-password` 设置新密码。
- 预期：返回成功；操作日志记录 reset-password；目标用户下次登录被要求改密。

## 2. 角色管理

### P2-ROLE-001 新增角色成功

- 优先级：P0
- 前置：admin 已登录。
- 步骤：填写 code、name、level、description 并保存。
- 预期：角色创建成功；code 符合 snake_case；列表可查询；审计记录 create。

### P2-ROLE-002 角色 code 重复应失败

- 优先级：P0
- 前置：已有 `salesperson` 角色。
- 步骤：新增 code=`salesperson` 的角色。
- 预期：保存失败；提示编码已存在；数据库无新增。

### P2-ROLE-003 角色 code 格式非法应失败

- 优先级：P1
- 前置：admin 已登录。
- 步骤：提交 code=`1Admin` 或 `admin-role`。
- 预期：前后端均校验失败；返回格式错误提示。

### P2-ROLE-004 删除已绑定用户的角色应失败

- 优先级：P0
- 前置：目标角色已被 `user_roles` 引用。
- 步骤：调用 `DELETE /api/admin/roles/:id`。
- 预期：返回业务错误码 4301；提示先解绑用户；角色仍启用。

### P2-ROLE-005 停用角色保留字段权限配置

- 优先级：P1
- 前置：角色存在 `field_permissions`。
- 步骤：停用角色并二次确认。
- 预期：角色 `is_active=false`；`field_permissions` 不被删除；操作日志记录 delete/disable。

## 3. 部门树管理

### P2-DEPT-001 新增顶级部门成功

- 优先级：P0
- 前置：admin 已登录。
- 步骤：创建 parentId=null 的部门，填写 code、name、sortOrder。
- 预期：创建成功；`/tree` 返回该顶级节点。

### P2-DEPT-002 新增子部门成功

- 优先级：P0
- 前置：存在启用父部门。
- 步骤：在树节点右键新增子部门并保存。
- 预期：子部门 parentId 正确；树结构层级正确。

### P2-DEPT-003 移动节点到新父节点成功

- 优先级：P1
- 前置：存在两个部门分支。
- 步骤：拖拽部门，调用 `/api/admin/departments/:id/move`。
- 预期：parentId 和 sortOrder 更新；树刷新后位置正确；审计记录 move/update。

### P2-DEPT-004 不允许移动到自身后代

- 优先级：P0
- 前置：存在至少两层部门树。
- 步骤：尝试将父节点移动到自己的子孙节点下。
- 预期：请求失败；提示不能形成环；原树结构不变。

### P2-DEPT-005 停用有启用用户的部门应失败

- 优先级：P0
- 前置：部门下存在启用用户或用户角色绑定。
- 步骤：删除/停用该部门。
- 预期：返回 4301；提示存在启用用户；部门仍启用。

## 4. 客户管理

### P2-CUST-001 新增客户成功

- 优先级：P0
- 前置：admin 已登录。
- 步骤：填写 customerCode、customerName、联系人、电话、地址、备注。
- 预期：创建成功；联系人等扩展字段进入 `extra` JSONB；列表可查询。

### P2-CUST-002 客户编码重复应失败

- 优先级：P0
- 前置：已有客户 code。
- 步骤：新增相同 customerCode。
- 预期：返回唯一性错误；无新增数据。

### P2-CUST-003 模糊查询客户

- 优先级：P1
- 前置：存在多个客户。
- 步骤：使用 keyword 查询 code/name。
- 预期：分页结果只包含命中客户；分页字段完整。

### P2-CUST-004 编辑客户扩展信息成功

- 优先级：P1
- 前置：客户存在。
- 步骤：修改 contactName、contactPhone、address、remark。
- 预期：`extra` 被正确更新；操作日志包含 before/after。

### P2-CUST-005 删除被工单引用的客户应受控

- 优先级：P0
- 前置：客户已被 work_orders 引用。
- 步骤：删除该客户。
- 预期：按设计返回引用冲突或仅软删除但不影响历史工单；不得物理删除历史数据。

## 5. 字段配置 CRUD

### P2-FIELD-001 新增通用字段成功

- 优先级：P0
- 前置：admin 已登录。
- 步骤：创建 orderType=null 的 text 字段。
- 预期：创建成功；field_code snake_case；列表通用 tab 可见。

### P2-FIELD-002 新增指定业务字段成功

- 优先级：P0
- 前置：存在 orderType=`onboarding`。
- 步骤：创建 onboarding 字段并设置 displayOrder。
- 预期：只在 onboarding tab 或对应查询中出现。

### P2-FIELD-003 dropdown 字段必须配置合法选项

- 优先级：P0
- 前置：admin 已登录。
- 步骤：创建 dropdown 字段但不填选项，或选项 value 重复。
- 预期：保存失败；提示 dropdown_options 非空且 value 唯一。

### P2-FIELD-004 字段类型变更被引用时应阻止或要求确认

- 优先级：P0
- 前置：字段已被 dispatch_rules、field_permissions 或 export_templates 引用。
- 步骤：尝试将字段类型从 dropdown 改为 number。
- 预期：返回引用/兼容性错误；不得破坏已有规则。

### P2-FIELD-005 删除字段前执行引用检查

- 优先级：P0
- 前置：字段被派发规则或模板引用。
- 步骤：删除字段。
- 预期：删除失败并列出引用位置；字段仍启用。

### P2-FIELD-006 条件必填 AST 保存校验

- 优先级：P1
- 前置：ConditionBuilder 可输入 AST。
- 步骤：为 `contract_subject` 设置 `{op:'EQ', field:'need_company_contract', value:'是'}`。
- 预期：保存成功；非法 op/禁用字段/超过 10 层嵌套保存失败。

## 6. 字段权限矩阵配置

### P2-FP-001 拉取权限矩阵成功

- 优先级：P0
- 前置：admin 已登录；字段和角色已存在。
- 步骤：调用 `/api/admin/field-permissions/matrix`。
- 预期：一次返回角色 x 字段 x scenario 矩阵；包含 main 与 dispatched 模块场景。

### P2-FP-002 批量提交脏单元成功

- 优先级：P0
- 前置：矩阵页面已加载。
- 步骤：修改少量单元格后调用 `/batch`。
- 预期：仅提交脏单元；事务成功；刷新后值保持。

### P2-FP-003 批量提交部分非法时整体回滚

- 优先级：P0
- 前置：准备一组合法和一组非法 permission。
- 步骤：调用 `/batch`。
- 预期：接口失败；合法单元也不落库；返回非法项详情。

### P2-FP-004 权限复制到多个角色成功

- 优先级：P1
- 前置：源角色已有完整权限；目标角色存在。
- 步骤：调用 `/copy`，选择多个目标角色。
- 预期：目标角色权限与源角色一致；操作日志记录 copy。

### P2-FP-005 非 admin 访问矩阵应被拒绝

- 优先级：P0
- 前置：非 admin 用户已登录。
- 步骤：访问 `/api/admin/field-permissions/matrix`。
- 预期：返回 403；不泄露矩阵数据。

## 7. 派发规则管理

### P2-DR-001 新增空条件规则成功

- 优先级：P0
- 前置：admin 已登录。
- 步骤：创建 orderType=onboarding、targetModule=data_entry、triggerConditions=null。
- 预期：保存成功；null 被视为恒真。

### P2-DR-002 新增复杂 AST 规则成功

- 优先级：P0
- 前置：字段配置存在。
- 步骤：使用 ConditionBuilder 创建 AND/OR/NOT 嵌套规则，深度不超过 10。
- 预期：保存成功；AST 符合 JSON Schema；审计记录 before/after。

### P2-DR-003 非法 op 或字段不存在应失败

- 优先级：P0
- 前置：admin 已登录。
- 步骤：提交 op=`BAD_OP` 或 field=`not_exist_field`。
- 预期：返回 3003 或校验错误；不落库。

### P2-DR-004 dropdown 枚举值非法应失败

- 优先级：P0
- 前置：字段为 dropdown 且选项固定。
- 步骤：提交不在 dropdown_options.value 内的 value。
- 预期：保存失败；提示枚举值非法。

### P2-DR-005 规则 simulate 返回命中与 AST trace

- 优先级：P0
- 前置：已有多条规则。
- 步骤：调用 `/api/admin/dispatch-rules/simulate`，传入 extraData。
- 预期：返回每条规则是否命中、AstEvalTrace、同模块去重结果。

### P2-DR-006 同一模块多规则命中按 priority 取低值

- 优先级：P0
- 前置：同 targetModule 有多条规则且都命中，priority 不同。
- 步骤：调用 simulate。
- 预期：deduped 中保留 priority 最小规则；其他命中写入审计/调试信息。

### P2-DR-007 REGEX ReDoS 风险规则应被拒绝或熔断

- 优先级：P1
- 前置：admin 已登录。
- 步骤：提交明显指数型正则或 simulate 触发超时。
- 预期：保存拒绝或求值 100ms 熔断返回 false；系统不中断。

## 8. 模块处理人配置与派发策略

### P2-MH-001 fixed 策略选择固定处理人

- 优先级：P0
- 前置：module_handlers 配置一个主处理人。
- 步骤：模拟 fixed 派发。
- 预期：handlerId 等于固定处理人；无处理人时返回配置错误。

### P2-MH-002 round_robin 策略轮询处理人

- 优先级：P1
- 前置：同模块配置多个启用处理人。
- 步骤：连续模拟或派发多次。
- 预期：处理人按轮询分配；禁用处理人不参与。

### P2-MH-003 load_balance 策略选择未完成单最少的人

- 优先级：P1
- 前置：多个处理人未完成工单数量不同。
- 步骤：模拟 load_balance 派发。
- 预期：选择当前未完成单最少的处理人；并列时按稳定规则选择。

### P2-MH-004 pool 策略不指定 handlerId

- 优先级：P0
- 前置：派发规则策略为 pool。
- 步骤：模拟派发或创建子工单。
- 预期：handlerId=null；子工单进入公共池。

### P2-MH-005 处理人权重和备份配置保存成功

- 优先级：P1
- 前置：admin 已登录。
- 步骤：为模块新增 handler、weight、isBackup。
- 预期：保存成功；列表展示权重和备份标识；审计记录 config_change。

### P2-MH-006 禁用有未完成单的处理人应提示风险

- 优先级：P1
- 前置：处理人存在未完成子工单。
- 步骤：禁用该 module_handler。
- 预期：返回风险提示或阻止；不得导致未完成单无人处理。

## 9. 导出模板管理与一键导出

### P2-ET-001 新增导出模板成功

- 优先级：P0
- 前置：admin 已登录；字段权限已配置。
- 步骤：选择 moduleCode、字段列表、别名、顺序并保存。
- 预期：模板创建成功；field_list 顺序正确。

### P2-ET-002 可选字段集排除 hidden 字段

- 优先级：P0
- 前置：某模块存在 hidden 字段。
- 步骤：打开模板字段选择器。
- 预期：可选字段 = 非 hidden 权限字段 ∩ 启用字段；hidden 字段不可见。

### P2-ET-003 API 注入 hidden 字段应失败

- 优先级：P0
- 前置：准备 hidden 字段 code。
- 步骤：直接调用保存模板 API，将 hidden 字段加入 field_list。
- 预期：后端拒绝；返回敏感字段不可导出；模板不保存。

### P2-ET-004 编辑模板字段顺序成功

- 优先级：P1
- 前置：模板存在。
- 步骤：拖拽调整字段顺序并保存。
- 预期：再次打开顺序保持；审计记录 update。

### P2-ET-005 一键导出按模板生成文件

- 优先级：P1
- 前置：存在子工单数据和导出模板。
- 步骤：在子工单列表选择模板导出。
- 预期：导出文件字段、别名、顺序与模板一致；无 hidden 字段。

### P2-ET-006 删除被使用模板应软删除且不影响历史记录

- 优先级：P2
- 前置：模板被历史导出使用。
- 步骤：删除模板。
- 预期：模板 `is_active=false`；历史操作日志仍可查询。

## 10. 操作日志查询

### P2-LOG-001 查询操作日志列表成功

- 优先级：P0
- 前置：admin 已登录；已有写操作日志。
- 步骤：访问 `/admin/logs`。
- 预期：分页返回日志；包含 entityType、entityId、userId、actionType、createdAt。

### P2-LOG-002 按用户和动作过滤日志

- 优先级：P1
- 前置：存在多个用户和动作日志。
- 步骤：按 userId、actionType 查询。
- 预期：只返回匹配日志；分页正确。

### P2-LOG-003 按实体类型和时间范围过滤日志

- 优先级：P1
- 前置：存在不同实体和日期日志。
- 步骤：按 entityType、startAt、endAt 查询。
- 预期：返回时间范围内匹配日志；时间字段 ISO 8601。

### P2-LOG-004 日志详情展示 before/after

- 优先级：P1
- 前置：存在 update/config_change 日志。
- 步骤：打开日志详情。
- 预期：展示 beforeData、afterData；敏感字段脱敏。

### P2-LOG-005 非 admin 查询日志被拒绝

- 优先级：P0
- 前置：非 admin 用户已登录。
- 步骤：访问 `/api/admin/logs`。
- 预期：返回 403；不泄露日志内容。

### P2-LOG-006 日志不可被普通接口修改或删除

- 优先级：P0
- 前置：存在日志记录。
- 步骤：尝试调用未授权的修改/删除日志接口或构造请求。
- 预期：接口不存在或返回 403/405；日志保持不可篡改。

## 11. 规则调试 `/simulate` E2E 用例

### P2-SIM-001 空 AST + 无条件规则命中
- 优先级：P0
- 前置：存在一条 `triggerConditions=null` 的派发规则，以及至少一条有条件规则。
- 步骤：调用 `/api/admin/dispatch-rules/simulate`，传入 `orderType=onboarding` 与基础 `extraData`。
- 预期：空 AST 视为恒真；命中无条件规则；返回 `matchedRules`、`targetModules` 和 `astTrace`，trace 中可见 `empty ast treated as true`。

### P2-SIM-002 复合条件输入的命中与去重
- 优先级：P0
- 前置：存在 `need_onboarding_contact=是`、`need_company_contract=是` 两类规则，以及同模块多条不同 priority 规则。
- 步骤：传入 `need_onboarding_contact=否`、`need_company_contract=是` 的模拟数据。
- 预期：只命中合同相关规则与无条件规则；同一模块仅保留 priority 更高（数值更小）的规则进入 `targetModules`；其它命中规则在调试结果中标记为去重候选。

### P2-SIM-003 嵌套 AND/OR/NOT + 比较节点的 trace 输出
- 优先级：P0
- 前置：存在至少一条包含 AND/OR/NOT、EQ/NEQ/IN/REGEX 的复杂 AST 规则。
- 步骤：输入可同时触发一部分叶子节点、未触发另一部分叶子节点的数据。
- 预期：响应里的 `astTrace` 能逐层体现每个节点的 true/false、children 关系和失败原因；重复模块规则仍按 priority 去重。

### P2-SIM-004 非法 AST 或超深 AST 被拒绝
- 优先级：P1
- 前置：存在调试入口。
- 步骤：提交非法 `op`、字段名为空、或深度超过 10 层的 AST。
- 预期：接口返回 400；不产生调试结果、不写入持久化数据。

## 12. 派发策略轮试用例

### P2-MH-FIXED-001 fixed 单处理人稳定命中
- 优先级：P0
- 前置：`module_handlers` 为目标模块配置唯一主处理人。
- 步骤：连续触发 3 次 fixed 派发。
- 预期：3 次都分配给同一个处理人；若处理人被停用则直接报配置错误。

### P2-MH-FIXED-002 fixed 缺少处理人时应失败
- 优先级：P0
- 前置：目标模块无启用处理人。
- 步骤：触发派发。
- 预期：派发失败并提示缺少固定处理人；主工单不应进入半完成状态。

### P2-MH-FIXED-003 fixed 备份处理人仅在主处理人不可用时兜底
- 优先级：P1
- 前置：主处理人停用、备份处理人启用。
- 步骤：触发 fixed 派发。
- 预期：优先回落到备份处理人；若规则不允许自动切换则返回明确告警。

### P2-MH-RR-001 round_robin 顺序轮询
- 优先级：P0
- 前置：同模块 3 个启用处理人，轮询指针从 0 开始。
- 步骤：连续提交 6 个同模块派发请求。
- 预期：分配顺序按 A→B→C→A→B→C 循环。

### P2-MH-RR-002 round_robin 并发提交不应重复命中同一指针
- 优先级：P0
- 前置：同模块存在多个并发请求，且后端启用乐观锁或原子自增。
- 步骤：并发发起至少 5 个派发请求。
- 预期：并发结果不应全部落到同一个处理人；指针更新无丢失。

### P2-MH-RR-003 round_robin 跳过停用处理人
- 优先级：P1
- 前置：轮询队列中有 1 个停用处理人和 2 个启用处理人。
- 步骤：连续触发派发。
- 预期：停用处理人不参与轮询；分配只在启用成员之间循环。

### P2-MH-LB-001 load_balance 选择未完成量最少的人
- 优先级：P0
- 前置：3 个处理人未完成工单数分别为 8、3、5。
- 步骤：触发 load_balance 派发。
- 预期：优先选择未完成量为 3 的处理人。

### P2-MH-LB-002 load_balance 并列时按稳定顺序选择
- 优先级：P1
- 前置：两个处理人未完成量相同，且都启用。
- 步骤：连续触发两次派发。
- 预期：并列时命中规则一致且可复现，不应随机漂移。

### P2-MH-LB-003 load_balance 统计口径只看未完成子工单
- 优先级：P1
- 前置：某处理人有较多已完成单和较少未完成单。
- 步骤：触发 load_balance 派发。
- 预期：只按未完成数量选择，不受历史已完成单干扰。

### P2-MH-POOL-001 pool 始终进入公共池
- 优先级：P0
- 前置：规则 dispatchStrategy=pool。
- 步骤：触发派发 3 次。
- 预期：每次 `handlerId=null`，子工单进入公共池。

### P2-MH-POOL-002 pool 仍要保留模块与可见字段信息
- 优先级：P1
- 前置：pool 型子工单已生成。
- 步骤：打开子工单详情。
- 预期：虽然无 handlerId，但 `moduleCode`、`visibleFields` 和导出模板仍可正常使用。

### P2-MH-POOL-003 pool 重新分派后可从公共池转入指定处理人
- 优先级：P1
- 前置：存在公共池子工单。
- 步骤：主管执行重新分派。
- 预期：handlerId 可被更新为具体用户；流转记录完整。
