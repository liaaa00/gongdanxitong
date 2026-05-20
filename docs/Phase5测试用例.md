# Phase 5 撤回与审批测试用例

依据：`docs/Phase5撤回与审批设计.md`。

优先级：P0 = 阻塞验收；P1 = 核心高风险；P2 = 边界体验。

## 1. 撤回申请创建

### P5-WD-CREATE-001 processing 主工单可创建撤回申请
- 优先级：P0
- 关联接口：`POST /api/work-orders/:id/withdraw`
- 前置：业务员创建的主工单 status=processing，存在 pending/processing 子工单。
- 步骤：提交撤回原因。
- 预期：创建 withdraw_requests，status=pending；主工单状态暂不变；写 operation_logs。

### P5-WD-CREATE-002 只为未完成子工单创建审批项
- 优先级：P0
- 关联接口：`POST /api/work-orders/:id/withdraw`
- 前置：主工单下有 completed、pending、processing、returned 子工单。
- 步骤：发起撤回。
- 预期：仅 pending/processing/returned（按最终契约）未完成子工单生成 withdraw_approvals；completed 不生成。

### P5-WD-CREATE-003 非创建者不可撤回
- 优先级：P0
- 关联接口：`POST /api/work-orders/:id/withdraw`
- 前置：业务员 B 访问业务员 A 的工单。
- 步骤：B 发起撤回。
- 预期：返回 403；不创建 withdraw_requests。

### P5-WD-CREATE-004 已有 pending 申请不可重复创建
- 优先级：P0
- 关联接口：`POST /api/work-orders/:id/withdraw`
- 前置：同主工单已有 withdraw_requests.status=pending。
- 步骤：再次发起撤回。
- 预期：返回 409；提示已有待审批申请。

### P5-WD-CREATE-005 completed/withdrawn 工单不可撤回
- 优先级：P1
- 关联接口：`POST /api/work-orders/:id/withdraw`
- 前置：主工单状态 completed 或 withdrawn。
- 步骤：发起撤回。
- 预期：返回状态错误；终态不改变。

## 2. 全员 agree

### P5-WD-AGREE-001 单审批项 agree 后主工单 withdrawn
- 优先级：P0
- 关联接口：`POST /api/withdraw-requests/:id/approve`
- 前置：撤回申请只有一个审批项 pending。
- 步骤：对应 handler 审批 agree。
- 预期：withdraw_request=approved；主工单 withdrawn；子工单关闭/终止（按契约 closed 或 withdrawn）。

### P5-WD-AGREE-002 多审批项全部 agree 后统一撤回
- 优先级：P0
- 关联接口：`POST /api/withdraw-requests/:id/approve`
- 前置：撤回申请有多个审批项。
- 步骤：逐个审批 agree，最后一个完成后查询主工单。
- 预期：前 N-1 个 agree 后仍 pending；最后一个 agree 后 request approved，主工单 withdrawn。

### P5-WD-AGREE-003 agree 幂等防重复审批
- 优先级：P1
- 关联接口：`POST /api/withdraw-requests/:id/approve`
- 前置：审批项已 agree。
- 步骤：同一审批人重复提交 agree。
- 预期：返回 409 或幂等成功但不重复写关键状态；operation_logs 不重复记核心审批。

### P5-WD-AGREE-004 withdrawn 后子工单不可继续处理
- 优先级：P0
- 关联接口：`POST /api/dispatched-orders/:id/accept`、`POST /api/dispatched-orders/:id/complete`
- 前置：撤回已全员 agree，主工单 withdrawn。
- 步骤：尝试接单/完成关联子工单。
- 预期：返回状态错误；子工单不可继续流转。

## 3. 任一 reject

### P5-WD-REJECT-001 任一 reject 使撤回失败
- 优先级：P0
- 关联接口：`POST /api/withdraw-requests/:id/approve`
- 前置：多审批项 pending。
- 步骤：其中一个审批人提交 reject 和 rejectReason。
- 预期：withdraw_request=rejected；主工单仍 processing/returned；其它 pending 审批项可标记无需处理。

### P5-WD-REJECT-002 reject_reason 回邮业务员
- 优先级：P0
- 关联接口：`POST /api/withdraw-requests/:id/approve`、`GET /api/notifications`
- 前置：业务员有站内通知权限。
- 步骤：审批 reject 后业务员查看通知。
- 预期：收到 withdraw_rejected 通知；内容包含 rejectReason、审批人和工单号。

### P5-WD-REJECT-003 reject 后不可继续 agree
- 优先级：P1
- 关联接口：`POST /api/withdraw-requests/:id/approve`
- 前置：withdraw_request 已 rejected。
- 步骤：其它审批人尝试 agree。
- 预期：返回状态错误；request 不从 rejected 变 approved。

### P5-WD-REJECT-004 reject_reason 必填
- 优先级：P0
- 关联接口：`POST /api/withdraw-requests/:id/approve`
- 前置：审批人选择 reject。
- 步骤：不传 rejectReason。
- 预期：返回 400；审批项仍 pending。

## 4. auto_agree_after 到期

### P5-WD-AUTO-001 到期自动 agree
- 优先级：P1
- 关联接口：Cron/worker、`GET /api/withdraw-requests/pending`
- 前置：审批项 pending，配置 auto_agree_after 已到期。
- 步骤：触发定时任务。
- 预期：审批项变 agree，approval_source=auto；若全部 agree 则主工单 withdrawn。

### P5-WD-AUTO-002 未到期不自动处理
- 优先级：P1
- 关联接口：Cron/worker
- 前置：审批项 pending，但当前时间未超过 auto_agree_after。
- 步骤：触发定时任务。
- 预期：状态仍 pending；不写自动审批日志。

### P5-WD-AUTO-003 已 reject 的申请不自动 agree
- 优先级：P1
- 关联接口：Cron/worker
- 前置：withdraw_request=rejected，仍存在历史 pending 审批项。
- 步骤：触发定时任务。
- 预期：不自动 agree；申请保持 rejected。

## 5. admin 强制审批与审计

### P5-WD-ADMIN-001 admin 强制 approve
- 优先级：P0
- 关联接口：`POST /api/withdraw-requests/:id/admin-resolve`
- 前置：withdraw_request=pending。
- 步骤：admin 选择强制通过。
- 预期：request approved；主工单 withdrawn；所有未决审批项记录 admin_override。

### P5-WD-ADMIN-002 admin 强制 reject
- 优先级：P0
- 关联接口：`POST /api/withdraw-requests/:id/admin-resolve`
- 前置：withdraw_request=pending。
- 步骤：admin 选择强制拒绝并填写原因。
- 预期：request rejected；业务员收到通知；主工单保持原状态。

### P5-WD-ADMIN-003 operation_logs 记录 before/after
- 优先级：P0
- 关联接口：`GET /api/admin/logs`
- 前置：admin 强制处理过撤回申请。
- 步骤：查询操作日志。
- 预期：日志包含 entityType=withdraw_request、actionType=admin_resolve、beforeData/afterData、userId、traceId。

## 6. 编辑 PUT 走审批

### P5-MODIFY-001 processing 工单 PUT 创建 modify 申请
- 优先级：P0
- 关联接口：`PUT /api/work-orders/:id`
- 前置：主工单 processing，业务员想修改 extraData。
- 步骤：提交修改字段。
- 预期：不直接改主工单；创建 withdraw_requests requestType=modify，modifyData 保存差异。

### P5-MODIFY-002 modify 全员同意后合并主工单
- 优先级：P0
- 关联接口：`POST /api/withdraw-requests/:id/approve`、`GET /api/work-orders/:id`
- 前置：modify 申请 pending，审批项全部同意。
- 步骤：审批完成后查询主工单。
- 预期：modifyData 合并到 extraData；updatedAt 变更；审计记录 before/after。

### P5-MODIFY-003 modify 被拒绝不改变主工单
- 优先级：P0
- 关联接口：`POST /api/withdraw-requests/:id/approve`
- 前置：modify 申请 pending。
- 步骤：任一审批人 reject。
- 预期：request rejected；主工单 extraData 保持原值；业务员收到原因。

### P5-MODIFY-004 modify_data 非法字段被拒
- 优先级：P1
- 关联接口：`PUT /api/work-orders/:id`
- 前置：业务员尝试修改 orderType/customerId/createdBy 等禁止字段。
- 步骤：提交 PUT。
- 预期：返回 400/403；不创建审批申请。

### P5-MODIFY-005 并发 modify 申请冲突
- 优先级：P1
- 关联接口：`PUT /api/work-orders/:id`
- 前置：已有 pending modify 申请。
- 步骤：再次提交不同修改。
- 预期：返回 409；提示先处理已有申请。
