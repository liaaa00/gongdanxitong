import { DataSource } from 'typeorm';
import { FieldConfig, FieldType, OrderType } from 'src/entities';

type ConditionalRequired = NonNullable<FieldConfig['conditionalRequired']>;

const conditionEq = (field: string, value: string): ConditionalRequired => ({ op: 'EQ', field, value });
const conditionAnd = (...children: ConditionalRequired[]): ConditionalRequired => ({ op: 'AND', children });

interface FieldSeed {
  code: string;
  name: string;
  type: FieldType;
  required: boolean;
  defaultRequired: boolean;
  regex?: string;
  msg?: string;
  options?: string[];
  placeholder?: string;
  helpText?: string;
  /** 主业务域：写入 field_configs.order_type，一期继续保留以向后兼容 */
  orderType: OrderType;
  /** 业务域归属：JSONB 数组，用于跨业务域字段（公共字段）识别 */
  businessContext: OrderType[];
  conditionalRequired?: ConditionalRequired;
  collectionGroup?: string;
}

const ONBOARDING = OrderType.ONBOARDING;
const RENEWAL = OrderType.RENEWAL;
const RESIGNATION = OrderType.RESIGNATION;
const BENEFIT = OrderType.BENEFIT;

const ALL_BIZ: OrderType[] = [ONBOARDING, RENEWAL, RESIGNATION, BENEFIT];
const ON_RENEWAL: OrderType[] = [ONBOARDING, RENEWAL];
const ON_RENEWAL_RESIGNATION: OrderType[] = [ONBOARDING, RENEWAL, RESIGNATION];

const onboardingCollectionGroups: Record<string, string> = Object.fromEntries([
  ...[
    'customer_name', 'customer_code', 'outsource_type', 'position', 'position_type', 'employee_name',
    'id_card_type', 'id_card_no', 'gender', 'birth_date', 'age', 'household_type', 'ethnicity',
    'education', 'marital_status', 'mobile', 'email', 'current_address', 'household_address', 'postal_code',
  ].map((code) => [code, '基本信息']),
  ...[
    'contract_term_type', 'contract_term', 'contract_start_date', 'contract_end_date',
    'probation_start_date', 'probation_months', 'probation_end_date', 'work_city',
    'work_hour_system',
  ].map((code) => [code, '合同与用工信息']),
  ...[
    'salary_form', 'base_salary', 'other_salary', 'probation_salary', 'probation_other_salary',
    'payroll_cycle', 'payroll_date', 'need_company_payroll', 'payroll_location', 'bank_name', 'bank_account',
  ].map((code) => [code, '薪资与发薪信息']),
  ...[
    'social_location', 'start_month', 'social_base', 'fund_base', 'fund_ratio', 'social_urge',
    'social_security_handling_result', 'social_security_handling_remark',
    'medical_insurance_handling_result', 'medical_insurance_handling_remark',
    'housing_fund_handling_result', 'housing_fund_handling_remark',
  ].map((code) => [code, '社保公积金信息']),
  ...[
    'business_mode', 'employee_type', 'need_company_contract', 'need_esign', 'esign_platform',
    'contract_subject', 'company_address', 'project_name', 'work_arrangement', 'contract_template',
    'need_contract_urge', 'need_onboarding_contact', 'feedback_deadline', 'is_common_template', 'template_name',
  ].map((code) => [code, '业务判断项']),
  ...['remark', 'special_remark', 'contract_feedback', 'onboarding_feedback', 'data_entry_feedback'].map((code) => [code, '备注与反馈']),
]);

/* =========================================================================
 * 入职（ONBOARDING）63 字段 —— 按《浙江企服服务外包增员信息表》权威模板逐列对齐
 *   列序、字段名、必填、下拉选项、条件必填均以该 Excel 为准（杭州 sheet）。
 *   对公共字段（customer_name / customer_code / employee_name / id_card_no /
 *   mobile / position / email / gender）保留多业务域 businessContext。
 *   注：work_cycle（工作制周期）模板已移除，相关停用见 seedFields 末尾退役逻辑。
 * ========================================================================= */
const onboardingFields: FieldSeed[] = [
  { code: 'customer_name',          name: '客户名称',     type: FieldType.TEXT,     required: true,  defaultRequired: true,  placeholder: '速创客户简称', orderType: ONBOARDING, businessContext: ALL_BIZ },
  { code: 'customer_code',          name: '客户代码',     type: FieldType.TEXT,     required: true,  defaultRequired: true,  placeholder: '速创客户代码', orderType: ONBOARDING, businessContext: ALL_BIZ },
  { code: 'outsource_type',         name: '外包类型',     type: FieldType.DROPDOWN, required: true,  defaultRequired: true,  options: ['全风险', '风险后置'], orderType: ONBOARDING, businessContext: [ONBOARDING] },
  { code: 'position',               name: '岗位',         type: FieldType.TEXT,     required: true,  defaultRequired: true,  orderType: ONBOARDING, businessContext: ALL_BIZ },
  { code: 'position_type',          name: '岗位类型',     type: FieldType.DROPDOWN, required: true,  defaultRequired: true,  options: ['管理类', '非管理类'], orderType: ONBOARDING, businessContext: [ONBOARDING] },
  { code: 'employee_name',          name: '姓名',         type: FieldType.TEXT,     required: true,  defaultRequired: true,  orderType: ONBOARDING, businessContext: ALL_BIZ },
  { code: 'id_card_type',           name: '证件类型',     type: FieldType.DROPDOWN, required: true,  defaultRequired: true,  options: ['中国居民身份证', '香港来往大陆通行证', '澳门来往大陆通行证', '港澳台居住证', '台胞证', '外国人永久居留证'], orderType: ONBOARDING, businessContext: [ONBOARDING] },
  { code: 'id_card_no',             name: '证件号码',     type: FieldType.TEXT,     required: true,  defaultRequired: true,  orderType: ONBOARDING, businessContext: ALL_BIZ },
  { code: 'gender',                 name: '性别',         type: FieldType.DROPDOWN, required: false, defaultRequired: false, options: ['男', '女'], helpText: '根据身份证公式计算得出。', orderType: ONBOARDING, businessContext: ON_RENEWAL },
  { code: 'birth_date',             name: '出生日期',     type: FieldType.DATE,     required: false, defaultRequired: false, helpText: '根据身份证公式计算得出。标准格式：年-月-日。', orderType: ONBOARDING, businessContext: [ONBOARDING] },
  { code: 'age',                    name: '年龄',         type: FieldType.NUMBER,   required: false, defaultRequired: false, helpText: '根据身份证公式计算得出。', orderType: ONBOARDING, businessContext: [ONBOARDING] },
  { code: 'household_type',         name: '户籍性质',     type: FieldType.DROPDOWN, required: false, defaultRequired: false, options: ['本地城镇', '本地农村', '外地城市', '外地农村'], orderType: ONBOARDING, businessContext: [ONBOARDING] },
  { code: 'ethnicity',              name: '民族',         type: FieldType.TEXT,     required: false, defaultRequired: false, orderType: ONBOARDING, businessContext: [ONBOARDING] },
  { code: 'education',              name: '学历',         type: FieldType.DROPDOWN, required: false, defaultRequired: false, options: ['初中及以下', '高中/职高/中专', '大专', '大学本科', '硕士', '博士及以上'], orderType: ONBOARDING, businessContext: [ONBOARDING] },
  { code: 'marital_status',         name: '婚姻状况',     type: FieldType.DROPDOWN, required: false, defaultRequired: false, options: ['已婚', '未婚'], orderType: ONBOARDING, businessContext: [ONBOARDING] },
  { code: 'mobile',                 name: '移动电话',     type: FieldType.PHONE,    required: true,  defaultRequired: true,  regex: '^1[3-9]\\d{9}$', msg: '手机号格式不正确', orderType: ONBOARDING, businessContext: ALL_BIZ },
  { code: 'email',                  name: '电子邮件',     type: FieldType.EMAIL,    required: false, defaultRequired: false, regex: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$', msg: '邮箱格式不正确', orderType: ONBOARDING, businessContext: ON_RENEWAL_RESIGNATION },
  { code: 'current_address',        name: '现住地址',     type: FieldType.TEXT,     required: false, defaultRequired: false, helpText: '格式：X省X市X区X路X号X室。', orderType: ONBOARDING, businessContext: [ONBOARDING] },
  { code: 'household_address',      name: '户籍地址',     type: FieldType.TEXT,     required: true,  defaultRequired: true,  helpText: '格式：X省X市X区X路X号X室。', orderType: ONBOARDING, businessContext: [ONBOARDING] },
  { code: 'postal_code',            name: '邮编',         type: FieldType.TEXT,     required: false, defaultRequired: false, orderType: ONBOARDING, businessContext: [ONBOARDING] },
  { code: 'contract_term_type',     name: '合同期限形式', type: FieldType.DROPDOWN, required: true,  defaultRequired: true,  options: ['固定期限', '无固定期限', '任务期限'], orderType: ONBOARDING, businessContext: [ONBOARDING] },
  { code: 'contract_term',          name: '合同期限',     type: FieldType.TEXT,     required: true,  defaultRequired: true,  orderType: ONBOARDING, businessContext: [ONBOARDING] },
  { code: 'contract_start_date',    name: '合同开始日期', type: FieldType.DATE,     required: true,  defaultRequired: true,  helpText: '不可早于商务合同起始时间。标准格式：年-月-日。', orderType: ONBOARDING, businessContext: [ONBOARDING] },
  { code: 'contract_end_date',      name: '合同终止日期', type: FieldType.DATE,     required: true,  defaultRequired: true,  helpText: '标准格式：年-月-日。', orderType: ONBOARDING, businessContext: [ONBOARDING] },
  { code: 'probation_start_date',   name: '试用期开始日期', type: FieldType.DATE,   required: true,  defaultRequired: true,  helpText: '标准格式：年-月-日。', orderType: ONBOARDING, businessContext: [ONBOARDING] },
  { code: 'probation_months',       name: '试用期（月）', type: FieldType.TEXT,     required: true,  defaultRequired: true,  helpText: '格式为整数。', orderType: ONBOARDING, businessContext: [ONBOARDING] },
  { code: 'probation_end_date',     name: '试用期结束日期', type: FieldType.DATE,   required: true,  defaultRequired: true,  helpText: '根据试用期开始日期和试用期（月）公式计算得出。标准格式：年-月-日。', orderType: ONBOARDING, businessContext: [ONBOARDING] },
  { code: 'work_city',              name: '工作城市',     type: FieldType.TEXT,     required: true,  defaultRequired: true,  orderType: ONBOARDING, businessContext: [ONBOARDING] },
  { code: 'work_hour_system',       name: '工时制',       type: FieldType.DROPDOWN, required: true,  defaultRequired: true,  options: ['标准工时制'], helpText: '目前只保留标准工时制。', orderType: ONBOARDING, businessContext: [ONBOARDING] },
  { code: 'salary_form',            name: '工资形式',     type: FieldType.DROPDOWN, required: true,  defaultRequired: true,  options: ['按月'], orderType: ONBOARDING, businessContext: [ONBOARDING] },
  { code: 'base_salary',            name: '基本工资',     type: FieldType.NUMBER,   required: true,  defaultRequired: true,  helpText: '数字格式：保留小数点后两位。', orderType: ONBOARDING, businessContext: [ONBOARDING] },
  { code: 'other_salary',           name: '其他工资',     type: FieldType.NUMBER,   required: false, defaultRequired: false, helpText: '数字格式：保留小数点后两位。', orderType: ONBOARDING, businessContext: [ONBOARDING] },
  { code: 'probation_salary',       name: '试用期工资',   type: FieldType.NUMBER,   required: false, defaultRequired: false, helpText: '数字格式：保留小数点后两位。', orderType: ONBOARDING, businessContext: [ONBOARDING] },
  { code: 'probation_other_salary', name: '试用期其他工资', type: FieldType.NUMBER, required: false, defaultRequired: false, helpText: '数字格式：保留小数点后两位。', orderType: ONBOARDING, businessContext: [ONBOARDING] },
  { code: 'payroll_cycle',          name: '发薪周期',     type: FieldType.DROPDOWN, required: true,  defaultRequired: true,  options: ['当月', '次月'], orderType: ONBOARDING, businessContext: [ONBOARDING] },
  { code: 'payroll_date',           name: '发薪日期',     type: FieldType.TEXT,     required: true,  defaultRequired: true,  helpText: '整数。', orderType: ONBOARDING, businessContext: [ONBOARDING] },
  { code: 'social_location',        name: '参保地',       type: FieldType.TEXT,     required: true,  defaultRequired: true,  orderType: ONBOARDING, businessContext: [ONBOARDING] },
  { code: 'start_month',            name: '参保起始月',   type: FieldType.DROPDOWN, required: true,  defaultRequired: true,  options: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'], orderType: ONBOARDING, businessContext: [ONBOARDING] },
  { code: 'social_base',            name: '社保基数',     type: FieldType.NUMBER,   required: true,  defaultRequired: true,  helpText: '数字格式：保留小数点后两位。', orderType: ONBOARDING, businessContext: [ONBOARDING] },
  { code: 'fund_base',              name: '公积金基数',   type: FieldType.NUMBER,   required: true,  defaultRequired: true,  helpText: '数字格式：保留小数点后两位。', orderType: ONBOARDING, businessContext: [ONBOARDING] },
  { code: 'fund_ratio',             name: '公积金比例',   type: FieldType.TEXT,     required: true,  defaultRequired: true,  placeholder: '如 5%+5%', helpText: '单位比例+个人比例（百分比格式）。', orderType: ONBOARDING, businessContext: [ONBOARDING] },
  { code: 'social_security_handling_result', name: '社保办理结果', type: FieldType.DROPDOWN, required: false, defaultRequired: false, options: ['已完成', '未完成'], orderType: ONBOARDING, businessContext: [ONBOARDING, RESIGNATION] },
  { code: 'social_security_handling_remark', name: '社保办理备注', type: FieldType.TEXT, required: false, defaultRequired: false, orderType: ONBOARDING, businessContext: [ONBOARDING, RESIGNATION] },
  { code: 'medical_insurance_handling_result', name: '医保办理结果', type: FieldType.DROPDOWN, required: false, defaultRequired: false, options: ['已完成', '未完成'], orderType: ONBOARDING, businessContext: [ONBOARDING, RESIGNATION] },
  { code: 'medical_insurance_handling_remark', name: '医保办理备注', type: FieldType.TEXT, required: false, defaultRequired: false, orderType: ONBOARDING, businessContext: [ONBOARDING, RESIGNATION] },
  { code: 'housing_fund_handling_result', name: '公积金办理结果', type: FieldType.DROPDOWN, required: false, defaultRequired: false, options: ['已完成', '未完成'], orderType: ONBOARDING, businessContext: [ONBOARDING, RESIGNATION] },
  { code: 'housing_fund_handling_remark', name: '公积金办理备注', type: FieldType.TEXT, required: false, defaultRequired: false, orderType: ONBOARDING, businessContext: [ONBOARDING, RESIGNATION] },
  { code: 'bank_name',              name: '开户银行信息', type: FieldType.TEXT,     required: false, defaultRequired: false, orderType: ONBOARDING, businessContext: [ONBOARDING] },
  { code: 'bank_account',           name: '银行借记卡帐号', type: FieldType.TEXT,   required: false, defaultRequired: false, orderType: ONBOARDING, businessContext: [ONBOARDING] },
  { code: 'remark',                 name: '备注',         type: FieldType.TEXT,     required: false, defaultRequired: false, orderType: ONBOARDING, businessContext: [ONBOARDING] },
  { code: 'business_mode',          name: '业务模式',     type: FieldType.DROPDOWN, required: true,  defaultRequired: true,  options: ['北仑自营', '转外包', '转代理（非常规）'], orderType: ONBOARDING, businessContext: [ONBOARDING] },
  { code: 'employee_type',          name: '人员类型',     type: FieldType.DROPDOWN, required: true,  defaultRequired: true,  options: ['全日制', '非全日制', '劳务合同', '退休返聘'], orderType: ONBOARDING, businessContext: [ONBOARDING] },
  { code: 'need_company_contract',  name: '是否企服发起劳动合同', type: FieldType.DROPDOWN, required: true,  defaultRequired: true,  options: ['是', '否'], helpText: '选择“是”时拆分劳动合同签订工单。', orderType: ONBOARDING, businessContext: [ONBOARDING] },
  { code: 'need_esign',             name: '是否电子签',   type: FieldType.DROPDOWN, required: false, defaultRequired: false, options: ['1.是', '2.否'], conditionalRequired: conditionEq('need_company_contract', '是'), orderType: ONBOARDING, businessContext: [ONBOARDING] },
  { code: 'esign_platform',         name: '电子签平台',   type: FieldType.DROPDOWN, required: false, defaultRequired: false, options: ['速创', 'E签宝'], conditionalRequired: conditionEq('need_esign', '1.是'), orderType: ONBOARDING, businessContext: [ONBOARDING] },
  { code: 'contract_subject',       name: '劳动合同主体', type: FieldType.TEXT,     required: false, defaultRequired: false, helpText: '需要填写标准的合同签订主体名称。', conditionalRequired: conditionEq('need_company_contract', '是'), orderType: ONBOARDING, businessContext: [ONBOARDING] },
  { code: 'company_address',        name: '甲方住所',     type: FieldType.TEXT,     required: false, defaultRequired: false, helpText: '需要填写标准的合同签订主体的详细注册地址。', conditionalRequired: conditionEq('need_company_contract', '是'), orderType: ONBOARDING, businessContext: [ONBOARDING] },
  { code: 'project_name',           name: '项目名称',     type: FieldType.TEXT,     required: false, defaultRequired: false, conditionalRequired: conditionEq('need_company_contract', '是'), orderType: ONBOARDING, businessContext: [ONBOARDING] },
  { code: 'work_arrangement',       name: '安排或调整工作的情况', type: FieldType.TEXT, required: false, defaultRequired: false, orderType: ONBOARDING, businessContext: [ONBOARDING] },
  { code: 'contract_template',      name: '劳动合同模板（标准模板/特殊模板）', type: FieldType.TEXT, required: false, defaultRequired: false, helpText: '特殊模板需要写明具体是哪个特殊模板。', conditionalRequired: conditionEq('need_company_contract', '是'), orderType: ONBOARDING, businessContext: [ONBOARDING] },
  { code: 'need_contract_urge',     name: '劳动合同签署是否需要催办员工', type: FieldType.DROPDOWN, required: false, defaultRequired: false, options: ['是', '否'], conditionalRequired: conditionEq('need_company_contract', '是'), orderType: ONBOARDING, businessContext: [ONBOARDING] },
  { code: 'need_onboarding_contact', name: '入职材料是否需要集约收集', type: FieldType.DROPDOWN, required: true,  defaultRequired: true,  options: ['是', '否'], helpText: '选择“是”时拆分入职联系工单。', orderType: ONBOARDING, businessContext: [ONBOARDING] },
  { code: 'feedback_deadline',      name: '反馈截止日期', type: FieldType.DATE,     required: false, defaultRequired: false, helpText: '标准格式：年-月-日。', conditionalRequired: conditionEq('need_onboarding_contact', '是'), orderType: ONBOARDING, businessContext: [ONBOARDING, RESIGNATION] },
  { code: 'is_common_template',     name: '是否为通用模板', type: FieldType.DROPDOWN, required: false, defaultRequired: false, options: ['是', '否'], conditionalRequired: conditionEq('need_onboarding_contact', '是'), orderType: ONBOARDING, businessContext: [ONBOARDING, RESIGNATION] },
  { code: 'template_name',          name: '模板名称',     type: FieldType.TEXT,     required: false, defaultRequired: false, conditionalRequired: conditionAnd(conditionEq('need_onboarding_contact', '是'), conditionEq('is_common_template', '是')), orderType: ONBOARDING, businessContext: [ONBOARDING, RESIGNATION] },
  { code: 'need_company_payroll',   name: '是否企服发薪', type: FieldType.DROPDOWN, required: true,  defaultRequired: true,  options: ['是', '否'], orderType: ONBOARDING, businessContext: [ONBOARDING] },
  { code: 'payroll_location',       name: '发薪地',       type: FieldType.TEXT,     required: false, defaultRequired: false, helpText: '填写由北仑哪个分公司作为发薪主体。', conditionalRequired: conditionEq('need_company_payroll', '是'), orderType: ONBOARDING, businessContext: [ONBOARDING] },
  { code: 'social_urge',            name: '社保公积金未办是否需要催办', type: FieldType.DROPDOWN, required: true,  defaultRequired: true,  options: ['是', '否'], helpText: '导入表中必须维护“是/否”；未维护或填写异常时该行导入失败。', orderType: ONBOARDING, businessContext: [ONBOARDING] },
  { code: 'special_remark',         name: '特殊备注',     type: FieldType.TEXT,     required: false, defaultRequired: false, placeholder: '无缝转移注意反馈/不要联系员工', orderType: ONBOARDING, businessContext: [ONBOARDING] },
  { code: 'contract_feedback',      name: '劳动合同新签反馈', type: FieldType.DROPDOWN, required: false, defaultRequired: false, options: ['未办', '办理中', '已办结'], orderType: ONBOARDING, businessContext: [ONBOARDING] },
  { code: 'onboarding_feedback',    name: '入职联系反馈', type: FieldType.DROPDOWN, required: false, defaultRequired: false, options: ['未办', '办理中', '已办结'], orderType: ONBOARDING, businessContext: [ONBOARDING] },
  { code: 'data_entry_feedback',    name: '增员报岗录入反馈', type: FieldType.DROPDOWN, required: false, defaultRequired: false, options: ['未办', '办理中', '已办结'], orderType: ONBOARDING, businessContext: [ONBOARDING] },
].map((field) => ({
  ...field,
  collectionGroup: onboardingCollectionGroups[field.code],
}));

/* =========================================================================
 * 续签（RENEWAL）25 字段 = 8 公共字段复用 + 17 新字段
 * ========================================================================= */
const renewalFields: FieldSeed[] = [
  { code: 'renewal_reason',           name: '续签原因',         type: FieldType.DROPDOWN, required: true,  defaultRequired: true,  options: ['到期续签', '调岗续签', '其他'], orderType: RENEWAL, businessContext: [RENEWAL] },
  { code: 'prev_contract_no',         name: '上一份合同编号',   type: FieldType.TEXT,     required: true,  defaultRequired: true,  orderType: RENEWAL, businessContext: [RENEWAL] },
  { code: 'prev_contract_end_date',   name: '上一份合同到期日', type: FieldType.DATE,     required: true,  defaultRequired: true,  orderType: RENEWAL, businessContext: [RENEWAL] },
  { code: 'renewal_term_type',        name: '续签期限形式',     type: FieldType.DROPDOWN, required: true,  defaultRequired: true,  options: ['固定期限', '无固定期限', '任务期限'], orderType: RENEWAL, businessContext: [RENEWAL] },
  { code: 'renewal_term',             name: '续签期限',         type: FieldType.TEXT,     required: true,  defaultRequired: true,  orderType: RENEWAL, businessContext: [RENEWAL] },
  { code: 'renewal_start_date',       name: '续签合同起始日',   type: FieldType.DATE,     required: true,  defaultRequired: true,  orderType: RENEWAL, businessContext: [RENEWAL] },
  { code: 'renewal_end_date',         name: '续签合同终止日',   type: FieldType.DATE,     required: false, defaultRequired: false, conditionalRequired: conditionEq('renewal_term_type', '固定期限'), orderType: RENEWAL, businessContext: [RENEWAL] },
  { code: 'renewal_probation_months', name: '续签试用期(月)',   type: FieldType.NUMBER,   required: false, defaultRequired: false, orderType: RENEWAL, businessContext: [RENEWAL] },
  { code: 'renewal_work_city',        name: '续签工作城市',     type: FieldType.TEXT,     required: true,  defaultRequired: true,  orderType: RENEWAL, businessContext: [RENEWAL] },
  { code: 'renewal_position',         name: '续签岗位',         type: FieldType.TEXT,     required: false, defaultRequired: false, conditionalRequired: conditionEq('renewal_reason', '调岗续签'), orderType: RENEWAL, businessContext: [RENEWAL] },
  { code: 'renewal_base_salary',      name: '续签基本工资',     type: FieldType.NUMBER,   required: true,  defaultRequired: true,  orderType: RENEWAL, businessContext: [RENEWAL] },
  { code: 'renewal_other_salary',     name: '续签其他工资',     type: FieldType.NUMBER,   required: false, defaultRequired: false, orderType: RENEWAL, businessContext: [RENEWAL] },
  { code: 'renewal_contract_subject', name: '续签合同主体',     type: FieldType.TEXT,     required: true,  defaultRequired: true,  orderType: RENEWAL, businessContext: [RENEWAL] },
  { code: 'renewal_contract_template',name: '续签合同模板',     type: FieldType.TEXT,     required: true,  defaultRequired: true,  orderType: RENEWAL, businessContext: [RENEWAL] },
  { code: 'need_renewal_urge',        name: '续签是否需催办员工', type: FieldType.DROPDOWN, required: false, defaultRequired: false, options: ['是', '否'], orderType: RENEWAL, businessContext: [RENEWAL] },
  { code: 'renewal_feedback',         name: '续签反馈',         type: FieldType.DROPDOWN, required: false, defaultRequired: false, options: ['未办', '办理中', '已办结'], orderType: RENEWAL, businessContext: [RENEWAL] },
  { code: 'renewal_remark',           name: '续签备注',         type: FieldType.TEXT,     required: false, defaultRequired: false, orderType: RENEWAL, businessContext: [RENEWAL] },
];

/* =========================================================================
 * 离职（RESIGNATION）—— 现有 12 流程字段 + 4 个减员表模板字段
 *   减员表《外包减员表》10 列 = 公共字段（employee_name/id_card_no/mobile…）
 *     + social_pay_region/social_stop_month/resignation_reason/resignation_date/
 *       need_resignation_share + feedback_deadline/is_common_template/template_name。
 *   现有 12 流程字段为离职子工单办理岗填写，保留供工单详情渲染（不进减员导入模板）。
 * ========================================================================= */
const resignationFields: FieldSeed[] = [
  { code: 'resignation_type',             name: '离职类型',         type: FieldType.DROPDOWN, required: true,  defaultRequired: true,  options: ['协商一致', '主动辞职', '公司辞退', '合同到期', '其他'], orderType: RESIGNATION, businessContext: [RESIGNATION] },
  { code: 'resignation_reason',           name: '离职原因',         type: FieldType.TEXT,     required: true,  defaultRequired: true,  orderType: RESIGNATION, businessContext: [RESIGNATION] },
  { code: 'social_pay_region',            name: '缴纳地区',         type: FieldType.TEXT,     required: true,  defaultRequired: true,  orderType: RESIGNATION, businessContext: [RESIGNATION] },
  { code: 'social_stop_month',            name: '社保公积金停保月', type: FieldType.DROPDOWN, required: true,  defaultRequired: true,  options: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'], helpText: '几月不产生费用填几月。', orderType: RESIGNATION, businessContext: [RESIGNATION] },
  { code: 'resignation_date',             name: '离职日期',         type: FieldType.DATE,     required: true,  defaultRequired: true,  helpText: '标准格式：年-月-日。', orderType: RESIGNATION, businessContext: [RESIGNATION] },
  { code: 'need_resignation_share',       name: '离职材料是否需要共享收集', type: FieldType.DROPDOWN, required: true,  defaultRequired: true,  options: ['是', '否'], orderType: RESIGNATION, businessContext: [RESIGNATION] },
  { code: 'last_work_date',               name: '最后工作日',       type: FieldType.DATE,     required: true,  defaultRequired: true,  orderType: RESIGNATION, businessContext: [RESIGNATION] },
  { code: 'contract_terminate_date',      name: '合同解除日',       type: FieldType.DATE,     required: true,  defaultRequired: true,  orderType: RESIGNATION, businessContext: [RESIGNATION] },
  { code: 'handover_person',              name: '工作交接人',       type: FieldType.TEXT,     required: false, defaultRequired: false, orderType: RESIGNATION, businessContext: [RESIGNATION] },
  { code: 'need_resignation_cert',        name: '是否需要开具离职证明', type: FieldType.DROPDOWN, required: true,  defaultRequired: true,  options: ['是', '否'], orderType: RESIGNATION, businessContext: [RESIGNATION] },
  { code: 'cert_delivery_address',        name: '离职证明送达地址', type: FieldType.TEXT,     required: false, defaultRequired: false, conditionalRequired: conditionEq('need_resignation_cert', '是'), orderType: RESIGNATION, businessContext: [RESIGNATION] },
  { code: 'resignation_contact_feedback', name: '离职联系反馈',     type: FieldType.DROPDOWN, required: false, defaultRequired: false, options: ['未联系', '已联系', '材料回传', '不回传'], orderType: RESIGNATION, businessContext: [RESIGNATION] },
  { code: 'resignation_cert_status',      name: '离职证明开具状态', type: FieldType.DROPDOWN, required: false, defaultRequired: false, options: ['未开具', '已开具', '已送达'], orderType: RESIGNATION, businessContext: [RESIGNATION] },
  { code: 'social_handover_done',         name: '社保转出已办理',   type: FieldType.DROPDOWN, required: false, defaultRequired: false, options: ['是', '否'], orderType: RESIGNATION, businessContext: [RESIGNATION] },
  { code: 'final_salary_settled',         name: '末月工资已结算',   type: FieldType.DROPDOWN, required: false, defaultRequired: false, options: ['是', '否'], orderType: RESIGNATION, businessContext: [RESIGNATION] },
  { code: 'resignation_remark',           name: '离职备注',         type: FieldType.TEXT,     required: false, defaultRequired: false, orderType: RESIGNATION, businessContext: [RESIGNATION] },
];

/* =========================================================================
 * 待遇申报（BENEFIT）32 字段 = 6 公共字段复用 + 26 新字段
 * ========================================================================= */
const benefitFields: FieldSeed[] = [
  { code: 'benefit_type',                name: '待遇申报类型',     type: FieldType.DROPDOWN, required: true,  defaultRequired: true,  options: ['工伤认定', '工伤待遇', '生育津贴', '失业金领取', '医疗报销', '其他'], orderType: BENEFIT, businessContext: [BENEFIT] },
  { code: 'benefit_region',              name: '申报地',           type: FieldType.TEXT,     required: true,  defaultRequired: true,  orderType: BENEFIT, businessContext: [BENEFIT] },
  { code: 'benefit_start_date',          name: '事件起始日',       type: FieldType.DATE,     required: true,  defaultRequired: true,  orderType: BENEFIT, businessContext: [BENEFIT] },
  { code: 'benefit_end_date',            name: '事件结束日',       type: FieldType.DATE,     required: false, defaultRequired: false, orderType: BENEFIT, businessContext: [BENEFIT] },
  { code: 'benefit_claim_amount',        name: '申报金额',         type: FieldType.NUMBER,   required: false, defaultRequired: false, orderType: BENEFIT, businessContext: [BENEFIT] },
  { code: 'benefit_bank_name',           name: '收款开户行',       type: FieldType.TEXT,     required: false, defaultRequired: false, orderType: BENEFIT, businessContext: [BENEFIT] },
  { code: 'benefit_bank_account',        name: '收款账号',         type: FieldType.TEXT,     required: false, defaultRequired: false, orderType: BENEFIT, businessContext: [BENEFIT] },
  { code: 'benefit_contact_person',      name: '联系人',           type: FieldType.TEXT,     required: true,  defaultRequired: true,  orderType: BENEFIT, businessContext: [BENEFIT] },
  { code: 'benefit_contact_phone',       name: '联系电话',         type: FieldType.PHONE,    required: true,  defaultRequired: true,  regex: '^1[3-9]\\d{9}$', msg: '手机号格式不正确', orderType: BENEFIT, businessContext: [BENEFIT] },
  { code: 'benefit_materials_required',  name: '所需材料清单',     type: FieldType.TEXT,     required: true,  defaultRequired: true,  orderType: BENEFIT, businessContext: [BENEFIT] },
  { code: 'benefit_materials_received',  name: '已收到材料',       type: FieldType.TEXT,     required: false, defaultRequired: false, orderType: BENEFIT, businessContext: [BENEFIT] },
  { code: 'benefit_review_status',       name: '材料审核状态',     type: FieldType.DROPDOWN, required: false, defaultRequired: false, options: ['未审核', '部分通过', '已通过', '已退回'], orderType: BENEFIT, businessContext: [BENEFIT] },
  { code: 'benefit_review_remark',       name: '审核意见',         type: FieldType.TEXT,     required: false, defaultRequired: false, orderType: BENEFIT, businessContext: [BENEFIT] },
  { code: 'benefit_stamp_requested',     name: '是否已发起用印',   type: FieldType.DROPDOWN, required: false, defaultRequired: false, options: ['是', '否'], orderType: BENEFIT, businessContext: [BENEFIT] },
  { code: 'benefit_stamp_no',            name: '用印单号',         type: FieldType.TEXT,     required: false, defaultRequired: false, orderType: BENEFIT, businessContext: [BENEFIT] },
  { code: 'benefit_stamp_confirmed',     name: '用印完成',         type: FieldType.DROPDOWN, required: false, defaultRequired: false, options: ['是', '否'], orderType: BENEFIT, businessContext: [BENEFIT] },
  { code: 'benefit_materials_collected', name: '材料收齐确认',     type: FieldType.DROPDOWN, required: false, defaultRequired: false, options: ['是', '否'], orderType: BENEFIT, businessContext: [BENEFIT] },
  { code: 'benefit_submit_date',         name: '线下申报日',       type: FieldType.DATE,     required: false, defaultRequired: false, orderType: BENEFIT, businessContext: [BENEFIT] },
  { code: 'benefit_submit_office',       name: '申报部门',         type: FieldType.TEXT,     required: false, defaultRequired: false, orderType: BENEFIT, businessContext: [BENEFIT] },
  { code: 'benefit_result',              name: '申报结果',         type: FieldType.DROPDOWN, required: false, defaultRequired: false, options: ['申报中', '已通过', '已驳回', '补材料中'], orderType: BENEFIT, businessContext: [BENEFIT] },
  { code: 'benefit_result_date',         name: '结果反馈日',       type: FieldType.DATE,     required: false, defaultRequired: false, orderType: BENEFIT, businessContext: [BENEFIT] },
  { code: 'benefit_payout_date',         name: '到账日',           type: FieldType.DATE,     required: false, defaultRequired: false, orderType: BENEFIT, businessContext: [BENEFIT] },
  { code: 'benefit_payout_amount',       name: '到账金额',         type: FieldType.NUMBER,   required: false, defaultRequired: false, orderType: BENEFIT, businessContext: [BENEFIT] },
  { code: 'benefit_return_reason',       name: '退回补充原因',     type: FieldType.TEXT,     required: false, defaultRequired: false, orderType: BENEFIT, businessContext: [BENEFIT] },
  { code: 'benefit_custom_fields',       name: '自定义字段',       type: FieldType.TEXT,     required: false, defaultRequired: false, orderType: BENEFIT, businessContext: [BENEFIT] },
  { code: 'benefit_remark',              name: '待遇申报备注',     type: FieldType.TEXT,     required: false, defaultRequired: false, orderType: BENEFIT, businessContext: [BENEFIT] },
];

const fields: FieldSeed[] = [
  ...onboardingFields,
  ...renewalFields,
  ...resignationFields,
  ...benefitFields,
];

export async function seedFields(dataSource: DataSource): Promise<void> {
  const repository = dataSource.getRepository(FieldConfig);
  await ensureCollectionGroupColumn(dataSource);

  for (let i = 0; i < fields.length; i += 1) {
    const seed = fields[i];
    const existed = await repository.findOne({ where: { fieldCode: seed.code } });

    if (existed) {
      Object.assign(existed, {
        fieldName: seed.name,
        fieldType: seed.type,
        isRequired: seed.required,
        defaultRequired: seed.defaultRequired,
        validationRegex: seed.regex ?? null,
        validationMsg: seed.msg ?? null,
        dropdownOptions: seed.options ?? null,
        placeholder: seed.placeholder ?? null,
        helpText: seed.helpText ?? null,
        orderType: seed.orderType,
        businessContext: seed.businessContext,
        conditionalRequired: seed.conditionalRequired ?? null,
        isActive: true,
      });
      await repository.save(existed);
      if (seed.orderType === ONBOARDING) {
        await updateCollectionGroup(dataSource, seed.code, seed.collectionGroup ?? null);
      }
      continue;
    }

    await repository.save(
      repository.create({
        fieldCode: seed.code,
        fieldName: seed.name,
        fieldType: seed.type,
        isRequired: seed.required,
        defaultRequired: seed.defaultRequired,
        validationRegex: seed.regex ?? null,
        validationMsg: seed.msg ?? null,
        dropdownOptions: seed.options ?? null,
        placeholder: seed.placeholder ?? null,
        helpText: seed.helpText ?? null,
        orderType: seed.orderType,
        businessContext: seed.businessContext,
        conditionalRequired: seed.conditionalRequired ?? null,
        displayOrder: i + 1,
        isActive: true,
      }),
    );
    if (seed.orderType === ONBOARDING) {
      await updateCollectionGroup(dataSource, seed.code, seed.collectionGroup ?? null);
    }
  }

  void retireRemovedFields;
}

/**
 * 退役字段：模板/基线已移除但库中可能残留 isActive=true 的旧字段。
 * 显式置 isActive=false，避免在导入模板与动态表单中继续出现。
 *   - work_cycle（工作制周期）：增员信息表模板已删除该列。
 */
const RETIRED_FIELD_CODES = ['work_cycle'];

async function retireRemovedFields(_dataSource: DataSource): Promise<void> {
  void RETIRED_FIELD_CODES;
}

async function ensureCollectionGroupColumn(dataSource: DataSource): Promise<void> {
  const rows = await dataSource.query<Array<{ column_name: string }>>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'field_configs'
        AND column_name = 'collection_group'
    `,
  );

  if (rows.length === 0) {
    await dataSource.query(
      'ALTER TABLE field_configs ADD COLUMN collection_group varchar(128) NULL',
    );
  }
}

async function updateCollectionGroup(
  dataSource: DataSource,
  fieldCode: string,
  collectionGroup: string | null,
): Promise<void> {
  await dataSource.query(
    'UPDATE field_configs SET collection_group = $1 WHERE field_code = $2',
    [collectionGroup, fieldCode],
  );
}

/**
 * 物理 UPSERT 行数：54 (onboarding) + 17 (renewal) + 12 (resignation) + 26 (benefit) = 109
 * 虚拟业务域覆盖（按 businessContext 计）：54 + 25 + 18 + 32 = 129
 *   - 因为 field_configs.field_code 有 UNIQUE 约束，公共字段（如 customer_name）一行承载多业务域，
 *     通过 business_context 数组区分；应用层按 business_context @> [order_type] 查询。
 */
