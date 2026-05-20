# Phase 3 工单核心测试用例

依据：`docs/Phase3工单核心设计.md`、`docs/DispatchEngine-JSON-AST规范.md`、`docs/API规范.md`。

优先级：P0 = 阻塞 Phase 3 验收；P1 = 核心业务高风险；P2 = 边界/体验。

## 1. 主工单状态机

### P3-WO-SM-001 创建草稿工单
- 优先级：P0
- 关联接口：`POST /api/work-orders`
- 前置：业务员已登录；field_configs seed 完整。
- 步骤：提交最小合法草稿数据，暂不调用 submit。
- 预期：主工单状态为 `draft`；`extraData` 使用字段 code 存 JSONB；写入 create 操作日志。

### P3-WO-SM-002 draft 提交后进入 processing
- 优先级：P0
- 关联接口：`POST /api/work-orders/:id/submit`
- 前置：存在 `draft` 主工单；派发规则与处理人配置有效。
- 步骤：调用 submit。
- 预期：事务内短暂 `pending` 后变为 `processing`；生成 order_no、submittedAt；返回子工单列表。

### P3-WO-SM-003 派发失败回滚到 draft
- 优先级：P0
- 关联接口：`POST /api/work-orders/:id/submit`
- 前置：draft 工单；人为配置非法派发规则或 handler-picker 抛错。
- 步骤：调用 submit。
- 预期：接口返回 4xx/5xx 业务错误；主工单仍为 `draft`；不产生半截子工单。

### P3-WO-SM-004 processing 全部子工单完成后 completed
- 优先级：P0
- 关联接口：`POST /api/dispatched-orders/:id/complete`
- 前置：processing 主工单下全部子工单均处于 processing。
- 步骤：逐个完成子工单，最后一个完成后查询主工单。
- 预期：主工单状态变为 `completed`，`completedAt` 非空；再次修改被拒。

### P3-WO-SM-005 任一子工单退回后主工单 returned
- 优先级：P0
- 关联接口：`POST /api/dispatched-orders/:id/return`
- 前置：processing 主工单；至少一个子工单 processing。
- 步骤：对子工单填写 returnReason 后退回。
- 预期：子工单 `returned`；主工单 `returned`；业务员可看到退回原因。

### P3-WO-SM-006 终态 completed/withdrawn 禁止逆向跳转
- 优先级：P0
- 关联接口：`PUT /api/work-orders/:id`、`POST /api/work-orders/:id/submit`
- 前置：存在 completed 或 withdrawn 主工单。
- 步骤：尝试编辑、重新提交、退回。
- 预期：返回 409 或业务状态错误；状态不变；记录拒绝原因。

## 2. 子工单生成与 handler_id 绑定

### P3-DISPATCH-001 仅无条件规则命中生成 2 个子工单
- 优先级：P0
- 关联接口：`POST /api/work-orders/:id/submit`
- 前置：`need_onboarding_contact=否`、`need_company_contract=否`；默认 data_entry/social_security 无条件规则启用。
- 步骤：提交主工单。
- 预期：生成 data_entry、social_security 两个子工单；同主单同 module 不重复。

### P3-DISPATCH-002 命中入职联系生成 3 个子工单
- 优先级：P0
- 关联接口：`POST /api/work-orders/:id/submit`
- 前置：`need_onboarding_contact=是`、`need_company_contract=否`。
- 步骤：提交主工单。
- 预期：生成 data_entry、social_security、onboarding_contact；handler_id 按各自策略绑定。

### P3-DISPATCH-003 命中合同生成 3 个子工单
- 优先级：P0
- 关联接口：`POST /api/work-orders/:id/submit`
- 前置：`need_onboarding_contact=否`、`need_company_contract=是`；合同条件必填字段完整。
- 步骤：提交主工单。
- 预期：生成 data_entry、social_security、contract；contract handler_id 按 fixed/配置绑定。

### P3-DISPATCH-004 完全命中生成 4 个子工单
- 优先级：P0
- 关联接口：`POST /api/work-orders/:id/submit`
- 前置：`need_onboarding_contact=是`、`need_company_contract=是`；所有必填字段完整。
- 步骤：提交主工单。
- 预期：生成 data_entry、social_security、onboarding_contact、contract；每个 module 一条。

### P3-DISPATCH-005 pool 策略 handler_id 为空
- 优先级：P0
- 关联接口：`POST /api/work-orders/:id/submit`、`GET /api/dispatched-orders`
- 前置：目标模块 dispatchStrategy=pool。
- 步骤：提交命中该模块的工单并查询子工单。
- 预期：子工单 `handlerId=null`；该模块启用处理人可在公共池列表看到。

### P3-DISPATCH-006 fixed/load_balance/round_robin 绑定处理人
- 优先级：P1
- 关联接口：`POST /api/work-orders/:id/submit`
- 前置：分别配置三类策略和多个处理人。
- 步骤：连续提交多张主工单。
- 预期：fixed 固定人；load_balance 选择未完成量最少；round_robin 按游标轮询且跳过停用人。

## 3. 子工单生命周期

### P3-DO-LIFE-001 指派给当前用户的 pending 子工单可接单
- 优先级：P0
- 关联接口：`POST /api/dispatched-orders/:id/accept`
- 前置：子工单 status=pending，handlerId=当前用户。
- 步骤：调用 accept。
- 预期：状态变为 `processing`；acceptedAt 非空；写 accept 日志。

### P3-DO-LIFE-002 pool 子工单接单时绑定当前用户
- 优先级：P0
- 关联接口：`POST /api/dispatched-orders/:id/accept`
- 前置：子工单 status=pending，handlerId=null；当前用户属于该 module。
- 步骤：调用 accept。
- 预期：handlerId 更新为当前用户；状态变为 processing。

### P3-DO-LIFE-003 接单乐观锁冲突
- 优先级：P0
- 关联接口：`POST /api/dispatched-orders/:id/accept`
- 前置：pool 子工单 pending；两个同模块用户并发接单。
- 步骤：并发发送两次 accept。
- 预期：仅一个成功；另一个返回 409/乐观锁冲突；handlerId 不被覆盖。

### P3-DO-LIFE-004 complete 触发主工单完成检查
- 优先级：P0
- 关联接口：`POST /api/dispatched-orders/:id/complete`、`GET /api/work-orders/:id`
- 前置：主工单下只有一个未完成子工单。
- 步骤：完成该子工单后查询主工单。
- 预期：主工单 completed；completedAt 非空。

### P3-DO-LIFE-005 complete 缺反馈字段失败
- 优先级：P1
- 关联接口：`POST /api/dispatched-orders/:id/complete`
- 前置：模块要求反馈字段，如 contract_feedback。
- 步骤：不传反馈字段直接 complete。
- 预期：返回 400；子工单仍 processing。

### P3-DO-LIFE-006 return 使主工单 returned
- 优先级：P0
- 关联接口：`POST /api/dispatched-orders/:id/return`
- 前置：子工单 pending 或 processing。
- 步骤：填写 returnReason 后退回。
- 预期：子工单 returned；主工单 returned；退回原因可见。

## 4. 字段权限过滤（5 场景 × 4 权限）

### P3-FP-MAIN-001 main visible 字段原样返回
- 优先级：P0
- 关联接口：`GET /api/work-orders/:id`
- 前置：业务员 main 场景对 `employee_name` 为 visible。
- 步骤：查询主工单详情。
- 预期：`extraData.employee_name` 原样返回。

### P3-FP-MAIN-002 main hidden 字段不返回
- 优先级：P0
- 关联接口：`GET /api/work-orders/:id`
- 前置：main 场景将某字段配置 hidden。
- 步骤：查询详情。
- 预期：响应中不存在该字段 key。

### P3-FP-MAIN-003 main readonly 字段返回 readonly 标记
- 优先级：P0
- 关联接口：`GET /api/work-orders/:id`
- 前置：main 场景 `contract_feedback` 为 readonly。
- 步骤：查询详情。
- 预期：字段值返回，permission/readonlyFields 标记为 readonly；写接口不可修改。

### P3-FP-MAIN-004 main masked 字段脱敏
- 优先级：P0
- 关联接口：`GET /api/work-orders/:id`
- 前置：main 场景将 `id_card_no` 配置 masked。
- 步骤：查询详情。
- 预期：身份证仅显示前 6 后 4，中间为星号；不泄露明文。

### P3-FP-CONTRACT-001 contract visible 字段返回
- 优先级：P0
- 关联接口：`GET /api/dispatched-orders/:id`
- 前置：`dispatched:contract` 对 1-32、41-47、53 相关字段为 visible。
- 步骤：合同组查询合同子工单详情。
- 预期：合同所需字段原样返回。

### P3-FP-CONTRACT-002 contract hidden 社保/银行字段不返回
- 优先级：P0
- 关联接口：`GET /api/dispatched-orders/:id`
- 前置：`social_base`、`bank_account` 在 contract 场景 hidden。
- 步骤：查询合同子工单。
- 预期：响应中不存在社保/银行字段。

### P3-FP-CONTRACT-003 contract readonly 非回写字段不可编辑
- 优先级：P1
- 关联接口：`POST /api/dispatched-orders/:id/complete`
- 前置：contract 场景基础信息 readonly。
- 步骤：尝试在完成接口修改 `employee_name`。
- 预期：返回 403/字段不可写；只允许合同反馈字段。

### P3-FP-CONTRACT-004 contract masked 薪资字段脱敏
- 优先级：P1
- 关联接口：`GET /api/dispatched-orders/:id`
- 前置：合同场景将 `base_salary` 配置 masked。
- 步骤：查询子工单。
- 预期：薪资显示 `***` 或策略脱敏值。

### P3-FP-ONBOARD-001 onboarding_contact visible 联系字段返回
- 优先级：P0
- 关联接口：`GET /api/dispatched-orders/:id`
- 前置：入职联系场景可见姓名、电话、地址等字段。
- 步骤：入职联系岗查询详情。
- 预期：联系办理所需字段返回。

### P3-FP-ONBOARD-002 onboarding_contact hidden 薪资/社保/合同细节不返回
- 优先级：P0
- 关联接口：`GET /api/dispatched-orders/:id`
- 前置：薪资、社保基数、合同细节在入职联系场景 hidden。
- 步骤：查询详情。
- 预期：响应中无上述字段 key。

### P3-FP-ONBOARD-003 onboarding_contact readonly 基础字段不可写
- 优先级：P1
- 关联接口：`POST /api/dispatched-orders/:id/supplement`
- 前置：`employee_name` 为 readonly。
- 步骤：尝试补充 employee_name。
- 预期：返回 403；不写 supplement log。

### P3-FP-ONBOARD-004 onboarding_contact masked 身份证脱敏
- 优先级：P0
- 关联接口：`GET /api/dispatched-orders/:id`
- 前置：`id_card_no` 在该场景 masked。
- 步骤：查询详情。
- 预期：身份证脱敏，不能出现完整明文。

### P3-FP-DATA-001 data_entry visible 全字段可见
- 优先级：P0
- 关联接口：`GET /api/dispatched-orders/:id`
- 前置：数据录入场景大部分字段 visible。
- 步骤：数据录入岗查询详情。
- 预期：录入所需字段完整返回。

### P3-FP-DATA-002 data_entry hidden 字段不返回
- 优先级：P1
- 关联接口：`GET /api/dispatched-orders/:id`
- 前置：将某测试字段配置 hidden。
- 步骤：查询子工单。
- 预期：hidden 字段从 extraData/fields 中移除。

### P3-FP-DATA-003 data_entry readonly 非反馈字段不可写
- 优先级：P1
- 关联接口：`POST /api/dispatched-orders/:id/complete`
- 前置：仅 `data_entry_feedback` 可编辑。
- 步骤：完成时同时传入其它字段修改。
- 预期：其它字段被拒；反馈字段可保存。

### P3-FP-DATA-004 data_entry masked 字段按策略脱敏
- 优先级：P1
- 关联接口：`GET /api/dispatched-orders/:id`
- 前置：测试配置 `bank_account` 为 masked。
- 步骤：查询详情。
- 预期：仅保留后 4 位，前面星号。

### P3-FP-SS-001 social_security visible 社保字段返回
- 优先级：P0
- 关联接口：`GET /api/dispatched-orders/:id`
- 前置：社保场景可见 social_location/start_month/social_base/fund_base/fund_ratio。
- 步骤：社保岗查询详情。
- 预期：社保办理字段返回。

### P3-FP-SS-002 social_security hidden 薪资/合同/银行字段不返回
- 优先级：P0
- 关联接口：`GET /api/dispatched-orders/:id`
- 前置：薪资、合同、银行字段在社保场景 hidden。
- 步骤：查询详情。
- 预期：响应中无对应字段。

### P3-FP-SS-003 social_security readonly 基础字段不可写
- 优先级：P1
- 关联接口：`POST /api/dispatched-orders/:id/supplement`
- 前置：姓名、身份证、户籍等为 readonly。
- 步骤：尝试补充这些字段。
- 预期：返回字段权限错误。

### P3-FP-SS-004 social_security masked 手机号脱敏
- 优先级：P1
- 关联接口：`GET /api/dispatched-orders/:id`
- 前置：`mobile` 配置 masked。
- 步骤：查询详情。
- 预期：手机号显示前三后四，中间星号。

## 5. 字段补充回流

### P3-SUP-001 入职联系补充银行卡字段
- 优先级：P0
- 关联接口：`POST /api/dispatched-orders/:id/supplement`
- 前置：入职联系子工单 processing；`bank_name`、`bank_account` 允许补充。
- 步骤：提交银行信息。
- 预期：写 field_supplement_logs；主工单 extraData 更新。

### P3-SUP-002 多字段补充一次事务成功
- 优先级：P1
- 关联接口：`POST /api/dispatched-orders/:id/supplement`
- 前置：多个字段均允许补充。
- 步骤：一次提交两个以上字段。
- 预期：全部成功或全部回滚；日志逐字段记录 old/new。

### P3-SUP-003 多模块同步
- 优先级：P0
- 关联接口：`POST /api/dispatched-orders/:id/supplement`、`GET /api/dispatched-orders/:id`
- 前置：field_supplement_rules.sync_to_modules 包含 data_entry。
- 步骤：入职联系补充 bank_account 后查询数据录入子工单。
- 预期：数据录入详情可见最新字段值；未配置模块不同步。

### P3-SUP-004 未授权字段补充失败
- 优先级：P0
- 关联接口：`POST /api/dispatched-orders/:id/supplement`
- 前置：字段未配置 supplementer_module 或当前角色无权限。
- 步骤：提交补充请求。
- 预期：返回 403；主工单不更新；无补充日志。

### P3-SUP-005 补充乐观锁冲突
- 优先级：P0
- 关联接口：`POST /api/dispatched-orders/:id/supplement`
- 前置：两个用户/请求基于同一 version 补充同一字段。
- 步骤：并发提交不同值。
- 预期：仅一个成功；另一个 409；最终值可追溯。

### P3-SUP-006 completed 子工单禁止补充
- 优先级：P1
- 关联接口：`POST /api/dispatched-orders/:id/supplement`
- 前置：子工单 completed。
- 步骤：调用 supplement。
- 预期：返回状态错误；数据不变。

## 6. 派发引擎单元测

### P3-DE-AST-001 12 个 AST 官方示例命中/不命中
- 优先级：P0
- 关联接口：单元测试 `ConditionEvaluator.evaluate`
- 前置：准备 §7.1-§7.12 的 AST 与上下文。
- 步骤：每个示例至少执行命中、不命中、空值边界。
- 预期：结果与 `docs/DispatchEngine-JSON-AST规范.md` 一致，trace 完整。

### P3-DE-AST-002 AND/OR/NOT 短路 trace
- 优先级：P0
- 关联接口：单元测试 `ConditionEvaluator.evaluate`
- 前置：构造多子节点 AND/OR/NOT。
- 步骤：让首个节点决定短路。
- 预期：trace 标记 shortCircuited，未求值节点不影响结果。

### P3-DE-AST-003 REGEX 熔断与非法正则
- 优先级：P0
- 关联接口：单元测试 `ConditionEvaluator.evaluate`
- 前置：准备指数型正则和非法 pattern。
- 步骤：执行 REGEX 求值。
- 预期：100ms 左右熔断或保存阶段拒绝；系统不中断。

### P3-DE-AST-004 同 target_module 去重
- 优先级：P0
- 关联接口：单元测试 `DispatchEngine.evaluate`
- 前置：两条命中规则 targetModule 相同，priority 不同。
- 步骤：执行 evaluate。
- 预期：childrenToCreate 只保留 priority 最小；hits 保留全部并标记 deduped。

### P3-DE-AST-005 四种 handler 策略
- 优先级：P0
- 关联接口：单元测试 `HandlerPicker.pick`
- 前置：配置 fixed/round_robin/load_balance/pool 候选。
- 步骤：分别执行 pick。
- 预期：fixed 固定人、RR 轮询、LB 最小负载、pool 返回 null。

### P3-DE-AST-006 字段停用或不存在时返回 false
- 优先级：P1
- 关联接口：单元测试 `AstValidator` / `ConditionEvaluator`
- 前置：AST 引用不存在或停用字段。
- 步骤：保存新规则与执行历史规则。
- 预期：新规则保存拒绝；历史规则求值 false 且不崩溃。

## 7. FieldPermissionInterceptor

### P3-FPI-001 详情对象 extraData 应脱敏
- 优先级：P0
- 关联接口：`GET /api/work-orders/:id`
- 前置：接口使用 FieldPermissionInterceptor；身份证 masked。
- 步骤：查询详情。
- 预期：extraData 中身份证脱敏。

### P3-FPI-002 列表数组每个元素都过滤
- 优先级：P0
- 关联接口：`GET /api/work-orders`
- 前置：列表返回多条主工单；字段权限包含 hidden/masked。
- 步骤：查询列表。
- 预期：数组每个元素都应用 hidden 删除和 masked 脱敏。

### P3-FPI-003 fields[] 结构过滤 hidden 字段
- 优先级：P0
- 关联接口：`GET /api/dispatched-orders/:id`
- 前置：响应包含 fields[]。
- 步骤：查询子工单详情。
- 预期：hidden 字段不在 fields[]；非 hidden 字段带 permission。

### P3-FPI-004 无 FieldScenario 装饰器时不处理
- 优先级：P2
- 关联接口：任意不涉及工单字段的接口
- 前置：接口未声明 FieldScenario。
- 步骤：调用接口。
- 预期：响应不被拦截器误改。

### P3-FPI-005 Controller 不得返回原始 extraData
- 优先级：P0
- 关联接口：`GET /api/work-orders/:id`、`GET /api/dispatched-orders/:id`
- 前置：敏感字段存在明文。
- 步骤：抓包检查响应。
- 预期：任何路径都不出现完整身份证、银行卡、薪资明文。

## 8. 主工单撤回申请 pending 阶段（预写）

### P3-WD-001 processing 工单可发起 withdraw pending
- 优先级：P2
- 关联接口：`POST /api/work-orders/:id/withdraw`
- 前置：主工单 processing。
- 步骤：业务员提交撤回原因。
- 预期：创建 withdraw_requests，status=pending；主工单暂不关闭。

### P3-WD-002 completed 工单不可发起撤回
- 优先级：P2
- 关联接口：`POST /api/work-orders/:id/withdraw`
- 前置：主工单 completed。
- 步骤：发起撤回。
- 预期：返回状态错误。

### P3-WD-003 非创建者不可撤回
- 优先级：P2
- 关联接口：`POST /api/work-orders/:id/withdraw`
- 前置：业务员 B 访问业务员 A 的主工单。
- 步骤：发起撤回。
- 预期：403。

### P3-WD-004 pending 撤回申请不可重复创建
- 优先级：P2
- 关联接口：`POST /api/work-orders/:id/withdraw`
- 前置：已有 pending withdraw_request。
- 步骤：再次发起撤回。
- 预期：返回 409，提示已有待审批申请。

### P3-WD-005 撤回申请记录未完成子工单审批明细
- 优先级：P2
- 关联接口：`POST /api/work-orders/:id/withdraw`
- 前置：主工单下存在 pending/processing 子工单。
- 步骤：发起撤回。
- 预期：为每个未完成子工单创建 withdraw_approvals，状态 pending。

## 9. 并发安全

### P3-CON-001 重复提交主工单防重复派发
- 优先级：P0
- 关联接口：`POST /api/work-orders/:id/submit`
- 前置：draft 主工单。
- 步骤：并发两次 submit。
- 预期：只有一次成功；子工单不重复；另一请求 409 或返回已提交。

### P3-CON-002 重复接单只允许一次成功
- 优先级：P0
- 关联接口：`POST /api/dispatched-orders/:id/accept`
- 前置：pool pending 子工单。
- 步骤：两个用户并发 accept。
- 预期：一个成功，一个 409；handlerId 稳定。

### P3-CON-003 重复补充同字段冲突
- 优先级：P0
- 关联接口：`POST /api/dispatched-orders/:id/supplement`
- 前置：同一子工单 processing。
- 步骤：并发提交不同 bank_account。
- 预期：一个成功，一个 409；日志不出现互相覆盖的双成功。

### P3-CON-004 重复完成只允许一次成功
- 优先级：P0
- 关联接口：`POST /api/dispatched-orders/:id/complete`
- 前置：子工单 processing。
- 步骤：并发两次 complete。
- 预期：一个成功；另一个 409/状态错误；主工单完成检查只执行一次有效状态变更。

### P3-CON-005 return 与 complete 并发时状态一致
- 优先级：P0
- 关联接口：`POST /api/dispatched-orders/:id/complete`、`POST /api/dispatched-orders/:id/return`
- 前置：子工单 processing。
- 步骤：并发 complete 与 return。
- 预期：只有一个最终状态生效；主工单 status 与子工单最终状态一致。

## 10. 跨角色访问

### P3-ACCESS-001 业务员 B 查询业务员 A 主工单返回 403
- 优先级：P0
- 关联接口：`GET /api/work-orders/:id`
- 前置：主工单由业务员 A 创建；业务员 B 无同部门授权。
- 步骤：B 查询该主工单详情。
- 预期：返回 403；不泄露字段数据。

### P3-ACCESS-002 业务员 B 列表不出现 A 的工单
- 优先级：P0
- 关联接口：`GET /api/work-orders`
- 前置：A/B 各有工单。
- 步骤：B 查询主工单列表。
- 预期：只返回 B 有权限的数据。

### P3-ACCESS-003 后道人员不能查看非本模块子工单
- 优先级：P0
- 关联接口：`GET /api/dispatched-orders/:id`
- 前置：合同岗访问入职联系子工单。
- 步骤：调用详情接口。
- 预期：403 或不可见；不泄露 extraData。

### P3-ACCESS-004 pool 子工单仅同模块成员可见
- 优先级：P0
- 关联接口：`GET /api/dispatched-orders`
- 前置：handlerId=null 的 pool 子工单。
- 步骤：同模块用户与非同模块用户分别查询列表。
- 预期：同模块可见，非同模块不可见。

### P3-ACCESS-005 主管仅能查看授权模块团队子工单
- 优先级：P1
- 关联接口：`GET /api/dispatched-orders/team/:module`
- 前置：合同主管和社保主管分别登录。
- 步骤：访问不同 module 的 team 列表。
- 预期：只允许本人主管模块；跨模块返回 403。

### P3-ACCESS-006 admin 可查看全量但仍保留审计
- 优先级：P1
- 关联接口：`GET /api/work-orders/:id`、`GET /api/dispatched-orders/:id`
- 前置：admin 登录。
- 步骤：查询任意主/子工单。
- 预期：可查看全量；敏感访问可记录 operation_logs 或审计 trace。
