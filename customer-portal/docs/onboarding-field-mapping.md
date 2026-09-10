# 入职字段四方映射矩阵

更新时间：2026-09-02

## 口径

- Excel《当前字段配置》实际有 **62 个业务字段**（B:BK），MRD 中“61 字段”的说法与 Excel 不一致；第 62 个字段为 `特殊备注`，需要产品最终确认是否保留。
- Excel 的字段归属说明存在一列重叠：`B:AF` 为客户必须填写，`AG:AP` 为客户填写或外服补收集，`AP:BJ` 又标注为客户经理填写；因此 `AP 客户代码` 的归属存在冲突。本实现不让客户手填，而是从签名链接绑定。
- 门户提交只允许客户侧字段；客户配置、电子签渠道、合同主体等内部字段不允许由浏览器伪造。
- “门户字段”中的“签名链接”表示字段由专属链接绑定，不出现在客户表单中；“派生”表示页面根据其他字段自动计算。

## 映射表

| # | Excel字段 | Excel归属 | 门户字段/来源 | Connector / API字段 | 内部工单字段 | 当前结论 |
|---:|---|---|---|---|---|---|
| 1 | 客户名称 | 客户必填 | 签名链接 | — | `customer_name` | 不允许客户手填，防止串客户 |
| 2 | 姓名 | 客户必填 | `employee_name` | `employee_name` | `employee_name` | 已接入、必填 |
| 3 | 证件类型 | 客户必填 | `id_card_type` | `id_card_type` | `id_card_type` | 已接入、必填 |
| 4 | 证件号码 | 客户必填 | `id_card_no` | `id_card_no` | `id_card_no` | 已接入、必填 |
| 5 | 移动电话 | 客户必填 | `mobile` | `mobile` | `mobile` | 已接入、11位手机号校验 |
| 6 | 电子邮件 | 客户必填 | `email` | `email` | `email` | 已接入、页面格式校验；Excel必填与内部非必填不一致 |
| 7 | 岗位 | 客户必填 | `position` | `position` | `position` | 已接入、必填 |
| 8 | 岗位类型 | 客户必填 | `position_type` | `position_type` | `position_type` | 已接入；页面值转换为管理类/非管理类 |
| 9 | 合同期限形式 | 客户必填 | `contract_type` | `contract_term_type` | `contract_term_type` | 已映射为固定期限/无固定期限 |
| 10 | 合同期限 | 客户必填 | `contract_duration` | `contract_term` | `contract_term` | 固定期限时提交月份数；无固定期限不提交 |
| 11 | 合同开始日期 | 客户必填 | `contract_start_date` | `contract_start_date` | `contract_start_date` | 已接入、日期校验 |
| 12 | 合同终止日期 | 客户必填 | 派生 `contract_end_date` | `contract_end_date` | `contract_end_date` | 固定期限自动计算；无固定期限不提交 |
| 13 | 试用期开始日期 | 客户必填 | `probation_start_date` | `probation_start_date` | `probation_start_date` | 已接入；默认合同开始日 |
| 14 | 试用期（月） | 客户必填 | `probation_months` | `probation_months` | `probation_months` | 已接入；法定上限联动仍需补强 |
| 15 | 试用期结束日期 | 客户必填 | 派生 `probation_end_date` | `probation_end_date` | `probation_end_date` | 自动计算后提交 |
| 16 | 工作城市 | 客户必填 | `work_city` | `work_city` | `work_city` | 已接入、必填 |
| 17 | 工时制 | 客户必填 | `working_hours` | `work_hour_system` | `work_hour_system` | 已映射；内部当前仅正式支持标准工时制 |
| 18 | 工资形式 | 客户必填 | `salary_type` | `salary_form` | `salary_form` | 已映射；内部当前仅正式支持按月 |
| 19 | 基本工资 | 客户必填 | `base_salary` | `base_salary` | `base_salary` | 已接入、必填 |
| 20 | 其他工资 | 客户必填 | `other_salary` | `other_salary` | `other_salary` | 已接入、选填 |
| 21 | 试用期工资 | 客户必填 | `probation_salary` | `probation_salary` | `probation_salary` | 已接入；条件必填规则待补 |
| 22 | 试用期其他工资 | 客户必填 | 未展示 | 未开放 | `probation_other_salary` | 一期页面缺口 |
| 23 | 发薪周期 | 后台配置 | 不展示 | 不允许客户提交 | `payroll_cycle` | 客户门户移除，改由后台/数创系统维护 |
| 24 | 发薪日期 | 后台配置 | 不展示 | 不允许客户提交 | `payroll_date` | 客户门户移除，改由后台/数创系统维护 |
| 25 | 缴纳地 | 客户必填 | `social_location` | `social_location` | `social_location` | 已接入 |
| 26 | 社保起缴月 | 客户必填 | `social_start_month` | `start_month` | `start_month` | 已改为1月-12月，并默认关联合同开始月 |
| 27 | 社保缴费工资 | 客户必填 | `social_base` | `social_base` | `social_base` | 已接入 |
| 28 | 公积金缴费工资 | 客户必填 | `fund_base` | `fund_base` | `fund_base` | 已接入 |
| 29 | 公积金比例 | 客户必填 | 后台自动带出（只读） | 不允许客户提交 | `fund_ratio` | 已由本地客户规则配置可信注入，服务器环境待联调 |
| 30 | 是否需要工资单 | 后台配置 | 不展示 | 不允许客户提交 | — | 不属于客户门户一期字段 |
| 31 | 备注 | 客户必填 | 未展示 | 未开放 | `remark` | 一期页面缺口 |
| 32 | 户籍性质 | 可由外服补收集 | `household_type` | `household_type` | `household_type` | 已接入、选填；选项需与内部统一 |
| 33 | 民族 | 可由外服补收集 | `ethnicity` | `ethnicity` | `ethnicity` | 已接入、选填 |
| 34 | 学历 | 可由外服补收集 | `education` | `education` | `education` | 已接入、选填；选项需与内部统一 |
| 35 | 婚姻状况 | 可由外服补收集 | `marital_status` | `marital_status` | `marital_status` | 已接入、选填 |
| 36 | 现住地址 | 可由外服补收集 | `current_address` | `current_address` | `current_address` | 已接入、选填 |
| 37 | 户籍地址 | 可由外服补收集 | `household_address` | `household_address` | `household_address` | 已接入；页面选填、内部当前必填，口径不一致 |
| 38 | 开户地 | 可由外服补收集 | `bank_location` | `bank_location` | **无对应字段** | 已收集并限制空格/括号；后端需新增字段 |
| 39 | 开户银行信息 | 可由外服补收集 | `bank_name` | `bank_name` | `bank_name` | 已接入、允许后补 |
| 40 | 银行借记卡帐号 | 可由外服补收集 | `bank_account` | `bank_account` | `bank_account` | 已接入、允许后补；只允许8-30位数字 |
| 41 | 客户代码 | 归属重叠 | 签名链接 | — | `customer_code` | 不允许客户手填；与客户UUID共同绑定 |
| 42 | 外包类型 | 客户经理配置 | 不展示 | 禁止客户提交 | `outsource_type` | 应由客户规则配置注入 |
| 43 | 业务模式 | 客户经理配置 | 不展示 | 禁止客户提交 | `business_mode` | 应由客户规则配置注入 |
| 44 | 人员类型 | 客户经理配置 | 不展示 | 禁止客户提交 | `employee_type` | 应由客户规则配置注入 |
| 45 | 是否企服发起劳动合同 | 客户经理配置 | 不展示 | 禁止客户提交 | `need_company_contract` | 应由客户规则配置注入 |
| 46 | 是否电子签 | 客户经理配置 | 不展示 | 禁止客户提交 | `need_esign` | 应由客户规则配置注入 |
| 47 | 电子签平台 | 客户经理配置 | 不展示 | 禁止客户提交 | `esign_platform` | 应由客户规则配置注入速创/E签宝 |
| 48 | 劳动合同主体 | 客户经理配置 | 不展示 | 禁止客户提交 | `contract_subject` | 应按缴纳地/客户规则自动带出 |
| 49 | 劳动合同主体注册地 | 客户经理配置 | 不展示 | 禁止客户提交 | `company_address` | Excel名称与内部“甲方住所”需统一 |
| 50 | 项目名称 | 客户经理配置 | 不展示 | 禁止客户提交 | `project_name` | 应由客户规则配置注入 |
| 51 | 安排或调整工作的情况 | 客户经理配置 | 不展示 | 禁止客户提交 | `work_arrangement` | 应由客户规则配置注入 |
| 52 | 劳动合同模板（标准模板/特殊模板） | 客户经理配置 | 不展示 | 禁止客户提交 | `contract_template` | 已有内部字段 |
| 53 | 特殊合同模板名称 | 客户经理配置 | 不展示 | 禁止客户提交 | `template_name`（疑似复用） | 与入职收集模板名称存在语义冲突，需拆字段确认 |
| 54 | 劳动合同签署是否需要催办员工 | 客户经理配置 | 不展示 | 禁止客户提交 | `need_contract_urge` | 已有内部字段 |
| 55 | 入职材料是否需要集约收集 | 客户经理配置 | 不展示 | 禁止客户提交 | `need_onboarding_contact` | 已有内部字段 |
| 56 | 反馈截止日期 | 客户经理配置 | 不展示 | 禁止客户提交 | `feedback_deadline` | 条件必填 |
| 57 | 是否为入职信息收集通用模板 | 客户经理配置 | 不展示 | 禁止客户提交 | `is_common_template` | 已有内部字段 |
| 58 | 补充收集材料内容 | 客户经理配置 | 不展示 | 禁止客户提交 | **无精确对应字段** | 不能直接挪用备注，需新增/确认字段 |
| 59 | 是否企服发薪 | 客户经理配置 | 不展示 | 禁止客户提交 | `need_company_payroll` | 已有内部字段 |
| 60 | 发薪地 | 客户经理配置 | 不展示 | 禁止客户提交 | `payroll_location` | 条件必填 |
| 61 | 社保公积金未办是否需要催办 | 客户经理配置 | 不展示 | 禁止客户提交 | `social_urge` | 代码中存在，但迁移记录显示曾停用，需确认最终口径 |
| 62 | 特殊备注 | 未在归属说明覆盖 | 不展示 | 禁止客户提交 | `special_remark` | Excel比MRD多出的字段，待产品确认 |

## 当前必须确认的字段决策

1. Excel是61字段还是62字段，`特殊备注`是否正式保留。
2. `客户代码`由签名链接绑定，客户不可手填。
3. `bank_location` 等内部或历史字段不得回流客户门户；离职证明相关字段全部由后台配置。
4. `特殊合同模板名称`和“入职信息收集通用模板名称”是否需要拆成两个字段。
5. 门户中的“电子邮件、户籍地址、备注、试用期其他工资”必填口径，以Excel还是现有内部字段配置为准。
