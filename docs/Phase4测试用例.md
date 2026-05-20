# Phase 4 导入与字段回流测试用例

依据：`docs/Phase4导入与回流设计.md`、`docs/Phase4AI映射样本库.md`。

优先级：P0 = 阻塞验收；P1 = 核心高风险；P2 = 边界体验。

## 1. Excel 导入正常/异常

### P4-IMPORT-001 标准模板完整导入并自动提交
- 优先级：P0
- 关联接口：`POST /api/work-orders/import/preview`、`POST /api/work-orders/import/confirm`、`GET /api/work-orders/import/:jobId`
- 前置：业务员已登录；标准 54 字段 Excel；客户、字段配置、派发规则有效。
- 步骤：上传标准模板；确认 AI 映射；选择 `autoSubmit=true`；轮询 job。
- 预期：preview 返回 fileId/headers/rowCount/suggestion；job 从 processing 到 completed；successRows 等于总行数；主工单创建并触发派发。

### P4-IMPORT-002 表头重命名仍能映射
- 优先级：P0
- 关联接口：`POST /api/work-orders/import/preview`
- 前置：Excel 将“姓名”改为“员工姓名”、“身份证号”改为“身份证号码”。
- 步骤：上传预览。
- 预期：AI/降级相似度建议映射到 `employee_name`、`id_card_no`；置信度合理；无需手工强制修正。

### P4-IMPORT-003 合并单元格两行表头预处理
- 优先级：P1
- 关联接口：`POST /api/work-orders/import/preview`
- 前置：Excel 表头存在“基本信息/姓名”“合同信息/开始日期”两层结构。
- 步骤：上传预览。
- 预期：后端展开合并单元格并用 `/` 拼接；合同开始日期映射 `contract_start_date`，社保基数映射 `social_base`。

### P4-IMPORT-004 带单位列名映射正确
- 优先级：P0
- 关联接口：`POST /api/work-orders/import/preview`
- 前置：表头包含“基本薪资(元)”“社保基数(元/月)”“公积金比例(单位%+个人%)”。
- 步骤：上传预览。
- 预期：括号单位被忽略，分别映射 `base_salary`、`social_base`、`fund_ratio`。

### P4-IMPORT-005 多余列进入 unmatched
- 优先级：P0
- 关联接口：`POST /api/work-orders/import/preview`
- 前置：Excel 包含“内部编号”“考勤组”“公司车牌号”等无关列。
- 步骤：上传预览。
- 预期：无关列在 unmatched；不得强行映射到 special_remark 或其它字段。

### P4-IMPORT-006 缺必填映射阻断 confirm
- 优先级：P0
- 关联接口：`POST /api/work-orders/import/confirm`
- 前置：Excel 缺 `customer_code`、`id_card_no` 等必填列，且 confirm 未提供 defaultValue。
- 步骤：确认导入。
- 预期：返回 4401/映射不完整；import_jobs 不进入 processing；响应列出 missing_required。

### P4-IMPORT-007 部分成功并生成错误报表
- 优先级：P0
- 关联接口：`POST /api/work-orders/import/confirm`、`GET /api/work-orders/import/:jobId/error-report`
- 前置：Excel 中混合法行、身份证格式错误、枚举非法、缺条件必填行。
- 步骤：确认导入并轮询完成；下载错误报告。
- 预期：successRows/failRows 正确；合法行入库；错误报表 Sheet1 含原始列 + `__error_code`/`__error_message`，Sheet2 有错误码统计。

### P4-IMPORT-008 超最大行数直接拒绝
- 优先级：P1
- 关联接口：`POST /api/work-orders/import/preview`
- 前置：Excel 超过 `MAX_IMPORT_ROWS`。
- 步骤：上传预览。
- 预期：返回 4400；文件不进入导入队列；提示最大行数限制。

## 2. AI 映射置信度分档

### P4-AI-001 高置信度自动继承
- 优先级：P0
- 关联接口：`POST /api/ai/field-mapping`、`POST /api/work-orders/import/preview`
- 前置：表头“客户名称”“身份证号”“邮箱”等置信度 > 0.9。
- 步骤：上传预览。
- 预期：前端默认采用建议映射；无需人工确认标记；confirm payload 可直接使用。

### P4-AI-002 中置信度黄标提醒复核
- 优先级：P1
- 关联接口：`POST /api/ai/field-mapping`
- 前置：表头“掌机号”“Hire Date”等置信度 0.7~0.9。
- 步骤：查看映射表。
- 预期：建议仍填入，但 UI 黄标；用户可手工调整；confirm 记录最终 mapping。

### P4-AI-003 低置信度红标强制手调
- 优先级：P0
- 关联接口：`POST /api/ai/field-mapping`、`POST /api/work-orders/import/confirm`
- 前置：表头“薪口”“unknown”等置信度 < 0.7 或 unmatched。
- 步骤：不调整直接 confirm。
- 预期：前端阻止或后端返回映射不完整；必须手动选择字段或明确忽略。

### P4-AI-004 AI 不可用时本地相似度降级
- 优先级：P1
- 关联接口：`POST /api/ai/field-mapping`
- 前置：OPENAI_API_KEY 未配置或 AI 超时。
- 步骤：调用映射接口。
- 预期：返回本地相似度 suggestion/confidence/unmatched；响应提示 fallback；preview 不阻断。

## 3. 字段补充回流

### P4-SUP-001 单字段补充成功
- 优先级：P0
- 关联接口：`POST /api/dispatched-orders/:id/supplement`
- 前置：入职联系子工单 processing；`bank_name` 允许由 onboarding_contact 补充。
- 步骤：提交 `bank_name` 与 workOrderUpdatedAt。
- 预期：主工单 extra_data 更新；field_supplement_logs 写入 old/new；operation_logs 有 supplement。

### P4-SUP-002 多字段同事务补充
- 优先级：P0
- 关联接口：`POST /api/dispatched-orders/:id/supplement`
- 前置：`bank_name`、`bank_account` 均允许补充。
- 步骤：一次提交两个字段。
- 预期：全部成功或全部失败；日志逐字段记录；updated_at 更新一次。

### P4-SUP-003 多模块通知同步
- 优先级：P0
- 关联接口：`POST /api/dispatched-orders/:id/supplement`、`GET /api/dispatched-orders/:id`
- 前置：sync_to_modules 包含 data_entry/social_security。
- 步骤：入职联系补充银行卡后，查询数据录入和社保子工单。
- 预期：读取主工单实时值；配置模块收到通知；未配置模块不收到通知。

### P4-SUP-004 乐观锁冲突
- 优先级：P0
- 关联接口：`POST /api/dispatched-orders/:id/supplement`
- 前置：两个用户基于同一 workOrderUpdatedAt。
- 步骤：并发提交不同补充值。
- 预期：一个成功；另一个返回 4301/409；响应包含 latest 更新时间。

### P4-SUP-005 已有不同值默认拒绝覆盖
- 优先级：P1
- 关联接口：`POST /api/dispatched-orders/:id/supplement`
- 前置：`bank_account` 已有值。
- 步骤：不带 overwrite 提交不同值。
- 预期：返回 4302；原值不变；无错误覆盖。

### P4-SUP-006 overwrite=true 允许覆盖并审计
- 优先级：P1
- 关联接口：`POST /api/dispatched-orders/:id/supplement?overwrite=true`
- 前置：字段已有值且当前模块允许补充。
- 步骤：提交不同值并带 overwrite。
- 预期：更新成功；operation_logs 记录 before/after；field_supplement_logs 记录旧值。

## 4. 退回流程

### P4-RETURN-001 子工单退回使主工单 returned
- 优先级：P0
- 关联接口：`POST /api/dispatched-orders/:id/return`、`GET /api/work-orders/:id`
- 前置：主工单 processing；子工单 processing。
- 步骤：后道填写 returnReason 并退回。
- 预期：子工单 returned；主工单 returned；业务员可见退回原因。

### P4-RETURN-002 业务员修改后重新提交 returned 子工单重置 pending
- 优先级：P0
- 关联接口：`POST /api/work-orders/:id/resubmit`
- 前置：主工单 returned；存在 returned 子工单。
- 步骤：业务员修改字段后 resubmit。
- 预期：returned 子工单变 pending；returnReason 清空；主工单 processing；completed 子工单不重置。

### P4-RETURN-003 重新提交后新增命中模块
- 优先级：P1
- 关联接口：`POST /api/work-orders/:id/resubmit`
- 前置：退回前未勾选合同，退回修改后 `need_company_contract=是`。
- 步骤：resubmit。
- 预期：新增 contract 子工单；已有模块不重复；handler 按策略选择。

### P4-RETURN-004 重新提交后原模块不再命中
- 优先级：P1
- 关联接口：`POST /api/work-orders/:id/resubmit`
- 前置：onboarding_contact 子工单 returned；业务员改为 `need_onboarding_contact=否`。
- 步骤：resubmit。
- 预期：该模块按设计标记 completed/关闭或不再待办；审计说明不再命中规则。

## 5. import_jobs 状态机

### P4-JOB-001 processing 进度递增
- 优先级：P0
- 关联接口：`GET /api/work-orders/import/:jobId`
- 前置：大文件导入中。
- 步骤：每 2 秒轮询 job。
- 预期：status=processing；progress 单调递增；successRows+failRows 不超过 totalRows。

### P4-JOB-002 全部成功进入 completed
- 优先级：P0
- 关联接口：`GET /api/work-orders/import/:jobId`
- 前置：所有行合法。
- 步骤：轮询到结束。
- 预期：status=completed；successRows=totalRows；failRows=0；completedAt 非空。

### P4-JOB-003 部分失败也流程完成
- 优先级：P0
- 关联接口：`GET /api/work-orders/import/:jobId`
- 前置：部分行非法。
- 步骤：轮询到结束。
- 预期：status=completed 或 partial（按最终契约）；successRows>0、failRows>0；errorReportUrl 非空。

### P4-JOB-004 不可恢复异常进入 failed
- 优先级：P0
- 关联接口：`GET /api/work-orders/import/:jobId`
- 前置：模拟文件损坏或数据库批次异常且重试失败。
- 步骤：confirm 后轮询。
- 预期：status=failed；errorSummary 描述异常；无半截脏数据。

### P4-JOB-005 用户取消 processing 任务
- 优先级：P1
- 关联接口：`POST /api/work-orders/import/:jobId/cancel`
- 前置：job 仍 processing。
- 步骤：调用 cancel。
- 预期：status=cancelled；未处理行不再导入；已提交事务保留并在报告中说明。

### P4-JOB-006 终态任务不可重复确认或取消
- 优先级：P1
- 关联接口：`POST /api/work-orders/import/:jobId/cancel`
- 前置：job completed/failed/cancelled。
- 步骤：再次 cancel 或重复 confirm。
- 预期：返回 409；状态不变。
