# E2E 测试计划 0520：反馈问题 + 工单流程 + BUG 回归

> 角色：测试工程师  
> 日期：2026-05-20  
> 范围：26 个反馈问题、6 类工单流程、5 个 BUG，以及新增工单流程配置/管理员权限/编辑后重新提交语义的回归验证。  
> 纪律：本文先准备脚本与步骤，不要求立即执行。后端上线或测试环境就绪后，QA/Leader 可按环境变量一键复用 curl 或后端 e2e 脚本。

---

## 0. 环境变量与执行约定

### 0.1 必填环境变量

PowerShell：

```powershell
$env:BASE_URL = "http://localhost:3000/api"
$env:FRONTEND_URL = "http://localhost:5173"

# 5 类核心角色 token
$env:ADMIN_TOKEN = "<管理员 JWT>"
$env:SALES_TOKEN = "<业务员 JWT>"
$env:BACKOFFICE_SUPERVISOR_TOKEN = "<后道主管 JWT>"
$env:BACKOFFICE_HANDLER_TOKEN = "<后道办理人员 JWT>"
$env:SHARED_OWNER_TOKEN = "<共享负责人 JWT>"

# 可选：用于数据隔离与复测定位
$env:E2E_RUN_ID = "0520-$(Get-Date -Format yyyyMMddHHmmss)"
$env:E2E_IMPORT_VALID_XLSX = "D:\\fixtures\\onboarding-valid.xlsx"
$env:E2E_IMPORT_MISSING_REQUIRED_XLSX = "D:\\fixtures\\onboarding-missing-required.xlsx"
```

Bash：

```bash
export BASE_URL="http://localhost:3000/api"
export FRONTEND_URL="http://localhost:5173"
export ADMIN_TOKEN="<管理员 JWT>"
export SALES_TOKEN="<业务员 JWT>"
export BACKOFFICE_SUPERVISOR_TOKEN="<后道主管 JWT>"
export BACKOFFICE_HANDLER_TOKEN="<后道办理人员 JWT>"
export SHARED_OWNER_TOKEN="<共享负责人 JWT>"
export E2E_RUN_ID="0520-$(date +%Y%m%d%H%M%S)"
export E2E_IMPORT_VALID_XLSX="/fixtures/onboarding-valid.xlsx"
export E2E_IMPORT_MISSING_REQUIRED_XLSX="/fixtures/onboarding-missing-required.xlsx"
```

### 0.2 通用响应提取约定

系统响应可能为 `{ code, data, message }` 包装，也可能直接返回业务对象。本文中的 `id/status/items/rows` 均指：优先从 `data` 读取，否则从响应根对象读取。

### 0.3 建议执行顺序

1. 先跑静态/API 烟测：登录、`/auth/me`、菜单权限、dashboard/cards。
2. 再创建本轮专属测试工单，避免污染历史数据。
3. 按 R1~R6 流程构造状态。
4. 最后跑导入、消息、权限与 UI 回归。

---

## 1. 数据准备脚本

### TC-SETUP-01：确认 5 角色 token 有效

**步骤**
1. 分别以 5 个 token 请求 `/auth/me`。
2. 记录返回的用户 id、username、roles。
3. 确认业务员角色不会被识别成共享负责人或共享团队视角。

**curl**

```powershell
curl.exe -s -H "Authorization: Bearer $env:ADMIN_TOKEN" "$env:BASE_URL/auth/me"
curl.exe -s -H "Authorization: Bearer $env:SALES_TOKEN" "$env:BASE_URL/auth/me"
curl.exe -s -H "Authorization: Bearer $env:BACKOFFICE_SUPERVISOR_TOKEN" "$env:BASE_URL/auth/me"
curl.exe -s -H "Authorization: Bearer $env:BACKOFFICE_HANDLER_TOKEN" "$env:BASE_URL/auth/me"
curl.exe -s -H "Authorization: Bearer $env:SHARED_OWNER_TOKEN" "$env:BASE_URL/auth/me"
```

**预期**
- 5 个请求均 HTTP 200。
- `roles` 存在且与预期账号一致。
- 业务员 canonical 后仍为业务员，不出现共享负责人/共享团队视角。

### TC-SETUP-02：创建入职主工单并提交拆分

**步骤**
1. 业务员创建入职工单。
2. 提交工单。
3. 查询主工单详情与子工单列表。
4. 记录 `WORK_ORDER_ID` 和 4 个子工单 id。

**curl**

```powershell
$payload = @{
  orderType = "onboarding"
  extraData = @{
    employee_name = "E2E入职_$env:E2E_RUN_ID"
    id_card_no = "330102199001010019"
    customer_code = "E2E-CUST"
    customer_name = "E2E测试客户"
    mobile = "13800000000"
    need_onboarding_contact = "是"
    need_company_contract = "是"
  }
} | ConvertTo-Json -Depth 10

$created = curl.exe -s -X POST -H "Authorization: Bearer $env:SALES_TOKEN" -H "Content-Type: application/json" -d $payload "$env:BASE_URL/work-orders"
# 从 created.data.id 或 created.id 提取 WORK_ORDER_ID

curl.exe -s -X POST -H "Authorization: Bearer $env:SALES_TOKEN" -H "Content-Type: application/json" -d '{}' "$env:BASE_URL/work-orders/$env:WORK_ORDER_ID/submit"
curl.exe -s -H "Authorization: Bearer $env:SALES_TOKEN" "$env:BASE_URL/work-orders/$env:WORK_ORDER_ID"
curl.exe -s -H "Authorization: Bearer $env:ADMIN_TOKEN" "$env:BASE_URL/dispatched-orders?page=1&pageSize=50&moduleCode=onboarding_contact"
```

**预期**
- 创建成功，主工单为 draft 或可提交状态。
- 提交后主工单进入 pending/processing。
- 生成 4 类子工单：`data_entry`、`social_insurance`、`onboarding_contact`、`contract`。
- UI：业务员在“我发起的”可看到该主工单；后道办理人员/主管在“我的待办”或“团队工单”可看到授权范围内子工单。

---

## 2. 6 类工单流程端到端场景

### R1：常规办理：创建 → 后道办理 → 完成

**步骤**
1. 使用 TC-SETUP-02 创建并提交入职工单。
2. 后道办理人员领取/接受其中一个子工单。
3. 后道办理人员完成该子工单并填写办理备注。
4. 管理员或共享负责人查询主工单与子工单状态。
5. 重复办理剩余子工单，直到主流程闭环。

**curl**

```powershell
curl.exe -s -X POST -H "Authorization: Bearer $env:BACKOFFICE_HANDLER_TOKEN" -H "Content-Type: application/json" -d '{}' "$env:BASE_URL/dispatched-orders/$env:DISPATCHED_ID/accept"

curl.exe -s -X POST -H "Authorization: Bearer $env:BACKOFFICE_HANDLER_TOKEN" -H "Content-Type: application/json" -d '{"remark":"E2E常规办理完成"}' "$env:BASE_URL/dispatched-orders/$env:DISPATCHED_ID/complete"

curl.exe -s -H "Authorization: Bearer $env:ADMIN_TOKEN" "$env:BASE_URL/work-orders/$env:WORK_ORDER_ID/timeline"
```

**预期**
- 子工单从 pending/processing 变为 completed。
- 时间线记录 accept/complete 操作人、时间、备注。
- 完成子单不再出现在个人待办。
- 所有必需子单完成后，主工单进入 completed 或符合现有状态机的完成态。

### R2：创建入职工单 → 后道退回 → 业务员退回后作废

**步骤**
1. 业务员创建并提交入职工单。
2. 后道办理人员或后道主管退回一个子工单。
3. 业务员在“我的待办/我发起的/详情页”看到 returned 主工单。
4. 业务员发起作废申请并填写作废原因。
5. 后道主管审批同意作废。
6. 业务员、后道、管理员分别查看状态与消息。

**curl**

```powershell
curl.exe -s -X POST -H "Authorization: Bearer $env:BACKOFFICE_HANDLER_TOKEN" -H "Content-Type: application/json" -d '{"returnReason":"E2E后道退回：资料缺失"}' "$env:BASE_URL/dispatched-orders/$env:DISPATCHED_ID/return"

curl.exe -s -X POST -H "Authorization: Bearer $env:SALES_TOKEN" -H "Content-Type: application/json" -d '{"reason":"E2E退回后业务员申请作废"}' "$env:BASE_URL/work-orders/$env:WORK_ORDER_ID/void"

curl.exe -s -X POST -H "Authorization: Bearer $env:BACKOFFICE_SUPERVISOR_TOKEN" -H "Content-Type: application/json" -d '{"approved":true,"comment":"E2E同意作废"}' "$env:BASE_URL/work-orders/$env:WORK_ORDER_ID/void/approve"
```

**预期**
- 退回后主工单为 returned，业务员可处理。
- 发起作废后主工单为 void_pending。
- 审批同意后主工单为 void，相关待办取消或不可继续办理。
- UI：详情页与列表页均可发起作废；终态 void 不显示撤回/作废/催办/编辑/重提按钮。
- 消息：业务员收到作废审批结果，后道主管收到待审批消息；消息 count 与 list 一致。

### R3：创建工单 → 后道退回 → 业务员修改重提

**步骤**
1. 创建并提交入职工单。
2. 后道退回子工单。
3. 业务员编辑 returned 主工单字段，例如手机号或合同字段。
4. 业务员点击重新提交。
5. 后道查询新待办与变更记录。

**curl**

```powershell
curl.exe -s -X POST -H "Authorization: Bearer $env:BACKOFFICE_HANDLER_TOKEN" -H "Content-Type: application/json" -d '{"returnReason":"E2E退回：手机号需修正"}' "$env:BASE_URL/dispatched-orders/$env:DISPATCHED_ID/return"

curl.exe -s -X PUT -H "Authorization: Bearer $env:SALES_TOKEN" -H "Content-Type: application/json" -d '{"extraData":{"mobile":"13900000000"}}' "$env:BASE_URL/work-orders/$env:WORK_ORDER_ID"

curl.exe -s -X POST -H "Authorization: Bearer $env:SALES_TOKEN" -H "Content-Type: application/json" -d '{}' "$env:BASE_URL/work-orders/$env:WORK_ORDER_ID/resubmit"
```

**预期**
- returned 状态允许业务员修改。
- 重新提交后主工单离开 returned，待办重新生成或 returned 子单回到 pending/processing。
- 被修改字段产生 dirty mark 或字段变更消息。
- UI：业务员必须能看到“重新提交”入口；保存后不应无提示停留在旧状态。

### R4：创建工单 → 业务员编辑 → 强制重新提交

**步骤**
1. 创建并提交入职工单，使其进入处理中。
2. 业务员打开详情页点击编辑。
3. 修改任意会影响后道办理的字段并保存。
4. 验证保存后必须进入重新提交流程：展示“重新提交”按钮或状态回到待重新提交；后道不能无感继续处理旧数据。
5. 业务员点击重新提交。
6. 后道查看变更消息和最新字段。

**curl**

```powershell
curl.exe -s -X PUT -H "Authorization: Bearer $env:SALES_TOKEN" -H "Content-Type: application/json" -d '{"extraData":{"mobile":"13700000000","special_remark":"E2E编辑后强制重提"}}' "$env:BASE_URL/work-orders/$env:WORK_ORDER_ID"

curl.exe -s -H "Authorization: Bearer $env:SALES_TOKEN" "$env:BASE_URL/work-orders/$env:WORK_ORDER_ID"

curl.exe -s -X POST -H "Authorization: Bearer $env:SALES_TOKEN" -H "Content-Type: application/json" -d '{}' "$env:BASE_URL/work-orders/$env:WORK_ORDER_ID/resubmit"
```

**预期**
- 这是本轮重点：编辑后必须强制走重新提交语义。
- 若设计为“保存后待重提”：主工单应显示 pending/returned/待重提状态，UI 显示重新提交入口。
- 若设计为“保存即重派”：接口必须返回新派发结果，后道收到字段变更/重派消息。
- 不接受：业务员保存成功但后道继续按旧数据处理且无重提/通知。

### R5：创建工单 → 业务员申请撤回 → 后道同意

**步骤**
1. 创建并提交工单，确认后道尚未完成。
2. 业务员在详情页发起撤回申请并填写原因。
3. 后道主管或可审批后道角色查看待审批消息。
4. 后道同意撤回。
5. 业务员、后道、管理员分别查询状态和待办。

**curl**

```powershell
curl.exe -s -X POST -H "Authorization: Bearer $env:SALES_TOKEN" -H "Content-Type: application/json" -d '{"reason":"E2E申请撤回"}' "$env:BASE_URL/work-orders/$env:WORK_ORDER_ID/withdraw"

curl.exe -s -X POST -H "Authorization: Bearer $env:BACKOFFICE_SUPERVISOR_TOKEN" -H "Content-Type: application/json" -d '{"approved":true,"comment":"E2E同意撤回"}' "$env:BASE_URL/work-orders/$env:WORK_ORDER_ID/withdraw/approve"
```

**预期**
- 发起撤回后主工单为 withdraw_pending。
- 同意后主工单为 withdrawn 或系统定义的撤回终态。
- 后道待办取消或不可继续办理。
- UI：详情页可发起撤回；终态不显示撤回/作废/催办。

### R6：已完成/已撤回/已作废终态不可操作

**步骤**
1. 准备 completed、withdrawn、void 三类终态工单。
2. 业务员尝试编辑、撤回、作废、催办、重新提交。
3. 后道尝试 accept/complete/return 已终态关联子工单。
4. 管理员查询操作日志和时间线。

**curl**

```powershell
curl.exe -s -X PUT -H "Authorization: Bearer $env:SALES_TOKEN" -H "Content-Type: application/json" -d '{"extraData":{"mobile":"13600000000"}}' "$env:BASE_URL/work-orders/$env:TERMINAL_WORK_ORDER_ID"

curl.exe -s -X POST -H "Authorization: Bearer $env:SALES_TOKEN" -H "Content-Type: application/json" -d '{"reason":"E2E终态作废拦截"}' "$env:BASE_URL/work-orders/$env:TERMINAL_WORK_ORDER_ID/void"
```

**预期**
- API 返回 400/403/409，不允许状态变更。
- UI 隐藏不可用按钮。
- 时间线无非法状态跃迁。

---

## 3. 反馈问题 P1~P4 验证点

### P1.1 仪表盘左下角姓名直显，无需 hover

**步骤**
1. 管理员、业务员、后道、共享负责人分别登录。
2. 进入仪表盘。
3. 查看左下角或用户信息区域。

**UI 描述**
- `$FRONTEND_URL/dashboard`。
- 截图记录用户名区域。

**预期**
- 真实姓名/显示名直接展示，不要求鼠标 hover。
- 名称过长时省略展示但仍可通过 title 或详情查看完整名称。

### P1.2 仪表盘 4 卡片按角色取数

**步骤**
1. 5 角色分别请求 `/dashboard/cards`。
2. 构造至少 1 条 draft、pending、processing、returned、withdraw_pending、void_pending、completed、withdrawn、void 数据。
3. 对比“处理中/我的消息/待办/完成”等卡片统计口径。
4. UI 登录各角色核对卡片数。

**curl**

```powershell
curl.exe -s -H "Authorization: Bearer $env:ADMIN_TOKEN" "$env:BASE_URL/dashboard/cards"
curl.exe -s -H "Authorization: Bearer $env:SALES_TOKEN" "$env:BASE_URL/dashboard/cards"
curl.exe -s -H "Authorization: Bearer $env:BACKOFFICE_HANDLER_TOKEN" "$env:BASE_URL/dashboard/cards"
curl.exe -s -H "Authorization: Bearer $env:BACKOFFICE_SUPERVISOR_TOKEN" "$env:BASE_URL/dashboard/cards"
curl.exe -s -H "Authorization: Bearer $env:SHARED_OWNER_TOKEN" "$env:BASE_URL/dashboard/cards"
```

**预期**
- 卡片按角色数据范围过滤。
- 处理中应包含 pending/processing/returned/withdraw_pending/void_pending，不包含 draft/completed/withdrawn/void。
- 正常派单消息不混入“我的消息”异常/协同消息。

### P1.3 趋势图 moduleCode 过滤

**步骤**
1. 管理员或业务负责人请求 onboarding 总趋势。
2. 分别请求 `moduleCode=onboarding_contact`、`contract`、`data_entry`、`social_insurance`。
3. UI 切换入职/在职/离职与办理事项。

**curl**

```powershell
curl.exe -s -H "Authorization: Bearer $env:ADMIN_TOKEN" "$env:BASE_URL/dashboard/leader-trend?orderType=onboarding"
curl.exe -s -H "Authorization: Bearer $env:ADMIN_TOKEN" "$env:BASE_URL/dashboard/leader-trend?orderType=onboarding&moduleCode=onboarding_contact"
curl.exe -s -H "Authorization: Bearer $env:ADMIN_TOKEN" "$env:BASE_URL/dashboard/leader-trend?orderType=onboarding&moduleCode=social_insurance"
```

**预期**
- 响应包含 `moduleCode` 或按该模块过滤后的 buckets。
- 不同 moduleCode 在存在数据差异时趋势不同。
- 普通业务员无权看到管理趋势或只看到本人范围。

### P1.4 仪表盘总表 dimension=node

**步骤**
1. 管理员请求 `dimension=node`。
2. 校验返回行维度是子工单/办理事项，不是主工单类型。
3. UI 仪表盘总表展示子工单维度。

**curl**

```powershell
curl.exe -s -H "Authorization: Bearer $env:ADMIN_TOKEN" "$env:BASE_URL/dashboard/order-type-matrix?dimension=node"
```

**预期**
- rows 至少可包含 `onboarding_contact`、`contract`、`data_entry`、`social_insurance`。
- 每行包含 moduleCode/moduleName/total/processing/completed/completionRate 等可展示字段。
- 不应只显示“入职/续签/离职/待遇申报”4 个主类型。

### P2.1 入职联系专员/社保专员/合同专员菜单限制

**步骤**
1. 分别用入职联系专员、社保专员、合同专员账号登录。
2. 查看左侧菜单与直接访问 URL。
3. 尝试访问无权模块，例如合同专员访问社保池。

**UI/API**

```powershell
curl.exe -s -H "Authorization: Bearer $env:BACKOFFICE_HANDLER_TOKEN" "$env:BASE_URL/auth/me"
```

**预期**
- 入职联系专员只看到授权联系/办理模块。
- 社保专员只看到社保公积金相关模块。
- 合同专员只看到劳动合同相关模块。
- 非管理员不显示字段管理、导出模板、门户/仪表盘配置等管理员菜单；URL 直达返回 403 或前端无权页。

### P2.2 “我的工单”4 子菜单区分

**步骤**
1. 业务员登录查看“我发起的/我的待办/我的已办/团队工单”。
2. 后道办理人员登录查看“我的待办/我的已办”。
3. 共享负责人查看团队工单。
4. 对比各子菜单请求参数与数据集合。

**UI 描述**
- `/my-work/initiated`：业务员本人发起主工单。
- `/my-work/pending`：当前用户待处理事项；业务员应包含退回待修改主工单。
- `/my-work/done`：当前用户已办/已完成事项。
- `/my-work/team`：主管/共享负责人团队范围。

**预期**
- pending 与 done 不是同一份数据。
- 业务员 pending 能看到 returned 待修改/待重提主工单。
- 非团队角色看不到团队工单入口。

### P2.3 主工单列表与新建入口合并

**步骤**
1. 业务员进入主工单列表。
2. 点击“新建入职”或统一新建入口。
3. 确认不再存在重复入口导致的两个不一致表单。

**预期**
- 从主列表进入新建流程。
- 新建入口权限仅业务员/业务组长/admin 可见。

### P3.1 批导入字段映射机制

**步骤**
1. 上传标准模板。
2. 上传非标准表头但可 AI/规则识别的模板。
3. 上传缺少关键映射的模板。
4. 确认 preview 返回 mappingMode，并在 confirm 前拦截缺映射。

**curl**

```powershell
curl.exe -s -X POST -H "Authorization: Bearer $env:SALES_TOKEN" -F "file=@$env:E2E_IMPORT_VALID_XLSX" -F "orderType=onboarding" "$env:BASE_URL/work-orders/import/preview"
```

**预期**
- 标准模板为 `mappingMode=standard`。
- 智能映射模板为 `mappingMode=ai` 或返回清晰置信度/映射建议。
- 缺映射为 `manual_required` 或 confirm 400，不允许静默导入。

### P3.2 social_urge 完全不可见

**步骤**
1. 新建入职工单表单搜索“社保公积金未办是否需要催办”。
2. 导出模板字段勾选列表搜索 social_urge/中文名。
3. 导入 preview/confirm 使用不包含 social_urge 的模板。
4. 后端字段基线、AI 映射、导入错误中搜索返回。

**curl**

```powershell
curl.exe -s -H "Authorization: Bearer $env:ADMIN_TOKEN" "$env:BASE_URL/admin/fields?keyword=social_urge"
curl.exe -s -H "Authorization: Bearer $env:ADMIN_TOKEN" "$env:BASE_URL/admin/fields?keyword=社保公积金未办是否需要催办"
```

**预期**
- UI 表单、导出模板、导入映射均不可见。
- 后端不再要求该字段必填。
- 若字段保留用于兼容，也必须 inactive 且 required=false/defaultRequired=false，不参与校验。

### P3.3 搜索框 5 字段

**步骤**
1. 主工单列表分别按员工姓名、身份证号、客户名称、手机号、工单号搜索。
2. 验证组合筛选与清空。

**预期**
- 5 字段均可命中。
- 非授权数据不会因搜索泄露。

### P3.4 删除列配置看板/网格

**步骤**
1. 主工单列表、我的待办、团队工单页面检查列设置入口。
2. 刷新页面，确认无旧配置残留。

**预期**
- 不再显示用户反馈要求删除的列配置看板/网格入口。
- 表格默认列满足业务验收。

### P3.5 列表操作按钮：修改/撤回/作废/催办，终态隐藏

**步骤**
1. 业务员查看未终态本人主工单列表。
2. 查看 returned 主工单。
3. 查看 completed/withdrawn/void 终态工单。
4. 非创建人查看同一工单。

**预期**
- 未终态本人可见符合状态的修改、撤回、作废、催办。
- returned 可见修改/重新提交/作废。
- 终态隐藏全部可变更按钮。
- 非创建人不显示业务员专属操作。

### P3.6 工单详情页撤回/作废/催办按钮

**步骤**
1. 打开未终态本人主工单详情页。
2. 分别点击撤回、作废、催办并取消/确认。
3. 打开终态详情页。

**curl**

```powershell
curl.exe -s -X POST -H "Authorization: Bearer $env:SALES_TOKEN" -H "Content-Type: application/json" -d '{"reason":"E2E详情页撤回"}' "$env:BASE_URL/work-orders/$env:WORK_ORDER_ID/withdraw"
curl.exe -s -X POST -H "Authorization: Bearer $env:SALES_TOKEN" -H "Content-Type: application/json" -d '{"reason":"E2E详情页作废"}' "$env:BASE_URL/work-orders/$env:WORK_ORDER_ID/void"
curl.exe -s -X POST -H "Authorization: Bearer $env:SALES_TOKEN" -H "Content-Type: application/json" -d '{"remark":"E2E详情页催办"}' "$env:BASE_URL/work-orders/$env:WORK_ORDER_ID/urge"
```

**预期**
- 详情页按钮与列表页一致。
- 撤回/作废要求原因；催办生成后道消息。
- 终态详情页不显示这些按钮。

### P3.7 详情页搜索筛选栏调整

**步骤**
1. 打开包含多个子工单/动态字段的详情页。
2. 使用搜索/筛选栏按字段、节点、状态筛选。
3. 清空筛选。

**预期**
- 筛选栏位置、文案、交互符合新 UI。
- 筛选不影响权限控制。

### P4.1 入职表单分组栅格

**步骤**
1. 业务员打开新建入职表单。
2. 在桌面宽屏、窄屏、移动端宽度检查布局。
3. 填写并提交。

**UI 描述**
- 期待分组：基础信息、合同信息、社保公积金、银行信息、备注等。

**预期**
- PC 端 3 列栅格；移动端单列。
- 长字段合理跨列。
- 必填标识与校验信息不丢失。
- 提交 payload 与改造前兼容。

### P4.2 新增工单流程配置功能

**步骤**
1. 管理员登录后台，查找“工单流程配置/流程配置”。
2. 创建或编辑流程节点、节点办理角色/办理人、流转动作、SLA 或备注必填配置。
3. 保存并新建一条工单验证是否按新流程生成待办。
4. 非管理员账号登录，检查菜单不可见并直接访问 URL/API。

**curl（按最终实现接口调整）**

```powershell
curl.exe -s -H "Authorization: Bearer $env:ADMIN_TOKEN" "$env:BASE_URL/admin/workflows"
curl.exe -s -H "Authorization: Bearer $env:SALES_TOKEN" "$env:BASE_URL/admin/workflows"
```

**预期**
- 管理员可见并可配置流程。
- 非管理员不显示菜单，URL/API 返回 403。
- 配置生效后，新建工单按新流程派发。
- 若本期仅实现最小版，需在测试报告标注支持范围；不能把空菜单视为通过。

### P4.3 字段管理权限只授权给管理员

**步骤**
1. 管理员访问字段管理、字段权限矩阵并执行新增/编辑/保存。
2. 业务员、后道主管、后道办理人员、共享负责人分别检查菜单。
3. 非管理员直接访问字段接口。

**curl**

```powershell
curl.exe -s -H "Authorization: Bearer $env:ADMIN_TOKEN" "$env:BASE_URL/admin/fields"
curl.exe -s -H "Authorization: Bearer $env:SALES_TOKEN" "$env:BASE_URL/admin/fields"
curl.exe -s -H "Authorization: Bearer $env:SHARED_OWNER_TOKEN" "$env:BASE_URL/admin/field-permissions/matrix"
```

**预期**
- 仅管理员可见字段管理菜单并可调用接口。
- 非管理员菜单不可见；API 返回 401/403。
- 本次按用户最新要求：字段管理权限只授权管理员，不再开放给非管理员。

### P4.4 导出模板字段勾选

**步骤**
1. 管理员进入导出模板配置。
2. 新建模板，勾选多个字段并预览。
3. 保存后应用导出。
4. 非管理员检查菜单不可见。

**curl**

```powershell
curl.exe -s -H "Authorization: Bearer $env:ADMIN_TOKEN" "$env:BASE_URL/admin/export-templates"
curl.exe -s -H "Authorization: Bearer $env:SALES_TOKEN" "$env:BASE_URL/admin/export-templates"
```

**预期**
- 字段以列表勾选方式展示。
- 勾选字段与导出列一致。
- 导出模板配置仅管理员可见/可用。

---

## 4. 5 个 BUG 回归

### B1：批导入必填缺失必须报错

**步骤**
1. 上传缺必填字段的 Excel。
2. preview 后尝试 confirm。
3. 查询 job 状态与错误报告。
4. 确认没有生成成功工单。

**curl**

```powershell
curl.exe -s -X POST -H "Authorization: Bearer $env:SALES_TOKEN" -F "file=@$env:E2E_IMPORT_MISSING_REQUIRED_XLSX" -F "orderType=onboarding" "$env:BASE_URL/work-orders/import/preview"

curl.exe -s -X POST -H "Authorization: Bearer $env:SALES_TOKEN" -H "Content-Type: application/json" -d '{"fileId":"<preview返回fileId>","orderType":"onboarding","mapping":{},"autoSubmit":true,"jobName":"E2E缺必填导入"}' "$env:BASE_URL/work-orders/import/confirm"

curl.exe -s -H "Authorization: Bearer $env:SALES_TOKEN" "$env:BASE_URL/work-orders/import/$env:IMPORT_JOB_ID"
```

**预期**
- preview/confirm/job 至少一处明确返回缺必填错误。
- failRows > 0，successRows 不包含缺必填行。
- 不允许旧 confirmImport 静默标记 completed。

### B2：导入后仪表盘更新，且业务员不显示“共享团队视角”

**步骤**
1. 记录业务员导入前 `/dashboard/cards`。
2. 上传合法入职导入文件并 confirm autoSubmit=true。
3. 轮询 job 到 completed。
4. 再次请求 `/dashboard/cards` 并打开前端仪表盘。
5. 查看主工单列表标题/视角。

**curl**

```powershell
curl.exe -s -H "Authorization: Bearer $env:SALES_TOKEN" "$env:BASE_URL/dashboard/cards"
curl.exe -s -X POST -H "Authorization: Bearer $env:SALES_TOKEN" -F "file=@$env:E2E_IMPORT_VALID_XLSX" -F "orderType=onboarding" "$env:BASE_URL/work-orders/import/preview"
curl.exe -s -X POST -H "Authorization: Bearer $env:SALES_TOKEN" -H "Content-Type: application/json" -d '{"fileId":"<fileId>","orderType":"onboarding","mapping":{},"autoSubmit":true,"jobName":"E2E合法导入"}' "$env:BASE_URL/work-orders/import/confirm"
```

**预期**
- 导入完成后业务员本人的发起数/处理中数按口径更新。
- 自动提交的入职工单生成子工单，不显示“未派发”。
- 业务员 UI 显示业务员视角/本人范围，不显示“共享团队视角”。

### B3：消息记录一致性

**步骤**
1. 构造退回、催办、撤回审批、作废审批、字段变更各 1 条消息。
2. 比较 dashboard cards、unread-count、unread-count-by-bucket、notifications list。
3. 点击 UI 消息入口进入列表。

**curl**

```powershell
curl.exe -s -H "Authorization: Bearer $env:BACKOFFICE_HANDLER_TOKEN" "$env:BASE_URL/dashboard/cards"
curl.exe -s -H "Authorization: Bearer $env:BACKOFFICE_HANDLER_TOKEN" "$env:BASE_URL/notifications/unread-count"
curl.exe -s -H "Authorization: Bearer $env:BACKOFFICE_HANDLER_TOKEN" "$env:BASE_URL/notifications/unread-count-by-bucket"
curl.exe -s -H "Authorization: Bearer $env:BACKOFFICE_HANDLER_TOKEN" "$env:BASE_URL/notifications?isRead=false&pageSize=50"
```

**预期**
- 正常派单类消息不计入“我的消息”异常/协同消息。
- 计数与列表 total 一致。
- 点击消息可定位详情，不出现“有数量无记录”。

### B4：个人待办批量办理

**步骤**
1. 后道办理人员进入 `/my-work/pending`。
2. 勾选 2 条 pending/processing 子工单。
3. 点击批量办理/批量完成。
4. 不填备注尝试提交。
5. 填备注后提交。
6. 用 51 条 ids 调用接口验证上限。

**curl**

```powershell
curl.exe -s -X POST -H "Authorization: Bearer $env:BACKOFFICE_HANDLER_TOKEN" -H "Content-Type: application/json" -d '{"ids":["'$env:DISPATCHED_ID_1'","'$env:DISPATCHED_ID_2'"],"remark":"E2E个人待办批量办理"}' "$env:BASE_URL/dispatched-orders/batch-complete"
```

**预期**
- UI 有批量办理按钮，而不是只有批量导出。
- 备注必填。
- 成功项从待办消失或状态变 completed。
- 超过 50 条返回 400。

### B5：共享负责人中文名筛选

**步骤**
1. 共享负责人进入团队工单。
2. 用模块下拉选择“入职联系”“劳动合同签订”“数据录入”“社保公积金办理”。
3. 直接请求 moduleName 中文参数。
4. 清空筛选。

**curl**

```powershell
curl.exe -s -H "Authorization: Bearer $env:SHARED_OWNER_TOKEN" "$env:BASE_URL/dispatched-orders/team/onboarding_contact?moduleName=入职联系"
curl.exe -s -H "Authorization: Bearer $env:SHARED_OWNER_TOKEN" "$env:BASE_URL/dispatched-orders?page=1&pageSize=20&moduleName=社保公积金办理"
```

**预期**
- UI 使用下拉，不要求手输 code。
- 中文名筛选能映射到 moduleCode。
- 无权限模块不泄露。

---

## 5. 权限与菜单专项

### TC-AUTH-01：导出模板与门户/仪表盘配置仅管理员可见

**步骤**
1. 管理员登录，检查导出模板、门户配置/仪表盘配置菜单可见。
2. 业务员、后道主管、后道办理人员、共享负责人登录检查菜单不可见。
3. 非管理员直接访问 URL。

**预期**
- 仅管理员显示并可进入。
- 非管理员 URL 直达被前端拦截或后端 403。

### TC-AUTH-02：字段管理只管理员可见可操作

**步骤**
1. 管理员访问 `/admin/fields`、`/admin/field-permissions`。
2. 非管理员访问同 URL 和 API。

**预期**
- 管理员可操作。
- 非管理员菜单不显示，API 403。

### TC-AUTH-03：流程配置仅管理员可见可操作

**步骤**
1. 管理员访问流程配置菜单。
2. 非管理员确认菜单不可见。
3. 非管理员直接请求流程配置 API。

**预期**
- 与导出模板、字段管理同样只开放管理员。

---

## 6. 后端 supertest 复用脚本

本计划配套可选脚本：`backend/test/e2e/feedback-coverage.e2e.spec.ts`。

推荐运行方式（不影响现有 jest-e2e 的 `*.e2e-spec.ts` 规则）：

```powershell
cd backend
$env:BASE_URL = "http://localhost:3000/api"
$env:ADMIN_TOKEN = "..."
$env:SALES_TOKEN = "..."
$env:BACKOFFICE_SUPERVISOR_TOKEN = "..."
$env:BACKOFFICE_HANDLER_TOKEN = "..."
$env:SHARED_OWNER_TOKEN = "..."
npx jest --config ./test/jest-e2e.json --testRegex "feedback-coverage\\.e2e\\.spec\\.ts$" --runInBand
```

说明：脚本以外部 `BASE_URL` + token 模式运行，不负责启动服务、不写死账号密码；未提供必要 token 时会 skip 数据流测试。

---

## 7. 通过/失败判定

### 7.1 PASS

- 5 角色主路径均通过。
- R1~R6 中除明确经产品确认延期项外均通过。
- B1~B5 全部通过。
- 字段管理、导出模板、门户/仪表盘配置、流程配置均只对管理员展示。
- 编辑后重新提交语义明确且可验证，不允许“保存后后道无感继续旧数据”。

### 7.2 FAIL

出现任一情况判 FAIL：

- 缺必填导入仍静默成功。
- 消息 count/list 不一致。
- 业务员仍出现共享团队视角。
- 个人待办没有批量办理。
- shared owner 中文模块筛选无结果。
- social_urge 仍在 UI 或后端必填链路中可见。
- 非管理员可见或可调用管理员配置菜单/API。
- 工单编辑后没有重新提交或重派/通知闭环。

### 7.3 失败上报模板

```text
[0520 E2E FAIL]
用例：TC-____
角色：admin / sales / backoffice_supervisor / backoffice_handler / shared_owner
环境：BASE_URL=____ FRONTEND_URL=____
步骤：
1. ...
实际结果：
预期结果：
证据：curl 响应 / 截图 / 日志 / 工单ID
建议责任方：frontend / backend / both
是否阻断上线：是/否
```
