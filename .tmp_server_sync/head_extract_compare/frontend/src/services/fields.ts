import request from './request';
import { isMockMode, mockDelay } from './mock';
import { loadList, saveList, nextId } from './_mockStore';

export interface FieldConfigItem {
  id: string;
  field_code: string;
  field_name: string;
  field_type: 'text' | 'number' | 'date' | 'dropdown' | 'textarea';
  is_required: boolean;
  default_required: boolean;
  conditional_required?: boolean | null;
  validation_regex: string | null;
  validation_msg: string | null;
  dropdown_options: { label: string; value: string }[] | null;
  placeholder: string | null;
  help_text: string | null;
  order_type: string | null;
  /** ★ 字段来源分类: customer_filled=客户填报, agent_supplemented=业务员补充, process_judgment=流程判断 */
  source_category?: 'customer_filled' | 'agent_supplemented' | 'process_judgment' | null;
  /** ★ 子工单可见范围: all=全部；多子工单用逗号分隔 */
  sub_ticket_scope?: 'all' | 'data_entry' | 'onboarding_contact' | 'contract' | 'social_insurance' | string | null;
  /** ★ 所属采集分组（入职基线五组：基本信息、劳动合同新签、入职联系、发薪信息、社保公积金类） */
  collection_group?: string | null;
  /** ★ 后端业务域归属：用于续签/离职复用入职公共字段 */
  business_context?: string[] | null;
  display_order: number;
  is_active: boolean;
}

const FIELD_MOCK_STORE_KEY = 'mock_admin_fields_v3';
const YES_NO_OPTIONS = [{ label: '是', value: '是' }, { label: '否', value: '否' }];
const FEEDBACK_OPTIONS = [{ label: '未办', value: '未办' }, { label: '办理中', value: '办理中' }, { label: '已办结', value: '已办结' }];
const ALL_BIZ_CONTEXT = ['onboarding', 'renewal', 'resignation', 'benefit'];
const ON_RENEWAL_CONTEXT = ['onboarding', 'renewal'];
const ON_RENEWAL_RESIGNATION_CONTEXT = ['onboarding', 'renewal', 'resignation'];

function options(values: string[]) {
  return values.map((value) => ({ label: value, value }));
}

// ======================== Mock 种子：入职信息采集表字段 ========================
const mockFields: FieldConfigItem[] = [
  // ── 入职字段（按会议表格列序 / docs 基线对齐）──
  { id: '1', field_code: 'customer_name', field_name: '客户名称', field_type: 'text', is_required: true, default_required: true, validation_regex: null, validation_msg: null, dropdown_options: null, placeholder: '请输入客户名称', help_text: '速创客户简称', order_type: 'onboarding', source_category: 'customer_filled', sub_ticket_scope: 'all', collection_group: '基本信息', business_context: ALL_BIZ_CONTEXT, display_order: 1, is_active: true },
  { id: '2', field_code: 'customer_code', field_name: '客户代码', field_type: 'text', is_required: true, default_required: true, validation_regex: null, validation_msg: null, dropdown_options: null, placeholder: '请输入客户代码', help_text: '速创客户代码', order_type: 'onboarding', source_category: 'customer_filled', sub_ticket_scope: 'all', collection_group: '基本信息', business_context: ALL_BIZ_CONTEXT, display_order: 2, is_active: true },
  { id: '3', field_code: 'outsource_type', field_name: '外包类型', field_type: 'dropdown', is_required: true, default_required: true, validation_regex: null, validation_msg: null, dropdown_options: options(['全风险', '风险后置']), placeholder: '请选择外包类型', help_text: null, order_type: 'onboarding', source_category: 'agent_supplemented', sub_ticket_scope: 'contract,data_entry', collection_group: '基本信息', business_context: ['onboarding'], display_order: 3, is_active: true },
  { id: '4', field_code: 'position', field_name: '岗位', field_type: 'text', is_required: true, default_required: true, validation_regex: null, validation_msg: null, dropdown_options: null, placeholder: '请输入岗位', help_text: null, order_type: 'onboarding', source_category: 'agent_supplemented', sub_ticket_scope: 'contract,data_entry', collection_group: '基本信息', business_context: ALL_BIZ_CONTEXT, display_order: 4, is_active: true },
  { id: 'o_position_type', field_code: 'position_type', field_name: '岗位类型', field_type: 'dropdown', is_required: true, default_required: true, validation_regex: null, validation_msg: null, dropdown_options: options(['管理类', '非管理类']), placeholder: '请选择岗位类型', help_text: null, order_type: 'onboarding', source_category: 'agent_supplemented', sub_ticket_scope: 'contract,data_entry', collection_group: '基本信息', business_context: ['onboarding'], display_order: 5, is_active: true },
  { id: '5', field_code: 'employee_name', field_name: '姓名', field_type: 'text', is_required: true, default_required: true, validation_regex: null, validation_msg: null, dropdown_options: null, placeholder: '请输入姓名', help_text: null, order_type: 'onboarding', source_category: 'customer_filled', sub_ticket_scope: 'all', collection_group: '基本信息', business_context: ALL_BIZ_CONTEXT, display_order: 6, is_active: true },
  { id: 'o_id_card_type', field_code: 'id_card_type', field_name: '证件类型', field_type: 'dropdown', is_required: true, default_required: true, validation_regex: null, validation_msg: null, dropdown_options: options(['中国居民身份证', '香港来往大陆通行证', '澳门来往大陆通行证', '港澳台居住证', '台胞证', '外国人永久居留证']), placeholder: '请选择证件类型', help_text: null, order_type: 'onboarding', source_category: 'customer_filled', sub_ticket_scope: 'all', collection_group: '基本信息', business_context: ['onboarding'], display_order: 7, is_active: true },
  { id: '6', field_code: 'id_card_no', field_name: '身份证号码（护照）', field_type: 'text', is_required: true, default_required: true, validation_regex: '(^\\d{17}[\\dXx]$)|(^[A-Za-z0-9]{5,20}$)', validation_msg: '身份证或护照格式不正确', dropdown_options: null, placeholder: '请输入身份证号码或护照号', help_text: null, order_type: 'onboarding', source_category: 'customer_filled', sub_ticket_scope: 'all', collection_group: '基本信息', business_context: ALL_BIZ_CONTEXT, display_order: 8, is_active: true },
  { id: '7', field_code: 'gender', field_name: '性别', field_type: 'dropdown', is_required: false, default_required: false, validation_regex: null, validation_msg: null, dropdown_options: options(['男', '女']), placeholder: '请选择性别', help_text: null, order_type: 'onboarding', source_category: 'customer_filled', sub_ticket_scope: 'contract,data_entry', collection_group: '基本信息', business_context: ON_RENEWAL_CONTEXT, display_order: 9, is_active: true },
  { id: '8', field_code: 'birth_date', field_name: '出生日期', field_type: 'date', is_required: false, default_required: false, validation_regex: null, validation_msg: null, dropdown_options: null, placeholder: '请选择出生日期', help_text: '标准格式：年-月-日', order_type: 'onboarding', source_category: 'customer_filled', sub_ticket_scope: 'data_entry', collection_group: '基本信息', business_context: ['onboarding'], display_order: 10, is_active: true },
  { id: '9', field_code: 'age', field_name: '年龄', field_type: 'number', is_required: false, default_required: false, validation_regex: null, validation_msg: null, dropdown_options: null, placeholder: '请输入年龄', help_text: null, order_type: 'onboarding', source_category: 'customer_filled', sub_ticket_scope: 'data_entry', collection_group: '基本信息', business_context: ['onboarding'], display_order: 11, is_active: true },
  { id: '10', field_code: 'household_type', field_name: '户籍性质', field_type: 'dropdown', is_required: false, default_required: false, validation_regex: null, validation_msg: null, dropdown_options: options(['本地城镇', '本地农村', '外地城市', '外地农村']), placeholder: '请选择户籍性质', help_text: null, order_type: 'onboarding', source_category: 'customer_filled', sub_ticket_scope: 'data_entry', collection_group: '基本信息', business_context: ['onboarding'], display_order: 12, is_active: true },
  { id: '11', field_code: 'ethnicity', field_name: '民族', field_type: 'text', is_required: false, default_required: false, validation_regex: null, validation_msg: null, dropdown_options: null, placeholder: '请输入民族', help_text: null, order_type: 'onboarding', source_category: 'customer_filled', sub_ticket_scope: 'data_entry', collection_group: '基本信息', business_context: ['onboarding'], display_order: 13, is_active: true },
  { id: 'o_education', field_code: 'education', field_name: '学历', field_type: 'dropdown', is_required: false, default_required: false, validation_regex: null, validation_msg: null, dropdown_options: options(['初中及以下', '高中/职高/中专', '大专', '大学本科', '硕士', '博士及以上']), placeholder: '请选择学历', help_text: null, order_type: 'onboarding', source_category: 'customer_filled', sub_ticket_scope: 'data_entry', collection_group: '基本信息', business_context: ['onboarding'], display_order: 14, is_active: true },
  { id: 'o_marital_status', field_code: 'marital_status', field_name: '婚姻状况', field_type: 'dropdown', is_required: false, default_required: false, validation_regex: null, validation_msg: null, dropdown_options: options(['已婚', '未婚']), placeholder: '请选择婚姻状况', help_text: null, order_type: 'onboarding', source_category: 'customer_filled', sub_ticket_scope: 'data_entry', collection_group: '基本信息', business_context: ['onboarding'], display_order: 15, is_active: true },
  { id: '12', field_code: 'mobile', field_name: '移动电话', field_type: 'text', is_required: true, default_required: true, validation_regex: '^1[3-9]\\d{9}$', validation_msg: '手机号格式不正确', dropdown_options: null, placeholder: '请输入移动电话', help_text: null, order_type: 'onboarding', source_category: 'customer_filled', sub_ticket_scope: 'onboarding_contact,contract,data_entry', collection_group: '基本信息', business_context: ALL_BIZ_CONTEXT, display_order: 16, is_active: true },
  { id: '13', field_code: 'email', field_name: '电子邮件', field_type: 'text', is_required: false, default_required: false, validation_regex: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$', validation_msg: '邮箱格式不正确', dropdown_options: null, placeholder: '请输入电子邮件', help_text: null, order_type: 'onboarding', source_category: 'customer_filled', sub_ticket_scope: 'onboarding_contact,contract,data_entry', collection_group: '基本信息', business_context: ON_RENEWAL_RESIGNATION_CONTEXT, display_order: 17, is_active: true },
  { id: '14', field_code: 'current_address', field_name: '现住地址', field_type: 'text', is_required: false, default_required: false, validation_regex: null, validation_msg: null, dropdown_options: null, placeholder: '请输入现住地址', help_text: '格式：X省X市X区X路X号X室', order_type: 'onboarding', source_category: 'customer_filled', sub_ticket_scope: 'contract,data_entry', collection_group: '基本信息', business_context: ['onboarding'], display_order: 18, is_active: true },
  { id: '15', field_code: 'household_address', field_name: '户籍地址', field_type: 'text', is_required: true, default_required: true, validation_regex: null, validation_msg: null, dropdown_options: null, placeholder: '请输入户籍地址', help_text: '格式：X省X市X区X路X号X室', order_type: 'onboarding', source_category: 'customer_filled', sub_ticket_scope: 'contract,data_entry', collection_group: '基本信息', business_context: ['onboarding'], display_order: 19, is_active: true },
  { id: '16', field_code: 'postal_code', field_name: '邮编', field_type: 'text', is_required: false, default_required: false, validation_regex: null, validation_msg: null, dropdown_options: null, placeholder: '请输入邮编', help_text: null, order_type: 'onboarding', source_category: 'customer_filled', sub_ticket_scope: 'data_entry', collection_group: '基本信息', business_context: ['onboarding'], display_order: 20, is_active: true },
  { id: '17', field_code: 'contract_term_type', field_name: '合同期限形式', field_type: 'dropdown', is_required: true, default_required: true, validation_regex: null, validation_msg: null, dropdown_options: options(['固定期限', '无固定期限', '任务期限']), placeholder: '请选择合同期限形式', help_text: null, order_type: 'onboarding', source_category: 'customer_filled', sub_ticket_scope: 'contract', collection_group: '基本信息', business_context: ['onboarding'], display_order: 21, is_active: true },
  { id: '18', field_code: 'contract_term', field_name: '合同期限', field_type: 'text', is_required: true, default_required: true, validation_regex: null, validation_msg: null, dropdown_options: null, placeholder: '如：2年', help_text: null, order_type: 'onboarding', source_category: 'customer_filled', sub_ticket_scope: 'contract', collection_group: '基本信息', business_context: ['onboarding'], display_order: 22, is_active: true },
  { id: '19', field_code: 'contract_start_date', field_name: '合同开始日期', field_type: 'date', is_required: true, default_required: true, validation_regex: null, validation_msg: null, dropdown_options: null, placeholder: '请选择合同开始日期', help_text: '不可早于商务合同起始时间', order_type: 'onboarding', source_category: 'customer_filled', sub_ticket_scope: 'contract', collection_group: '基本信息', business_context: ['onboarding'], display_order: 23, is_active: true },
  { id: '20', field_code: 'contract_end_date', field_name: '合同终止日期', field_type: 'date', is_required: true, default_required: true, validation_regex: null, validation_msg: null, dropdown_options: null, placeholder: '请选择合同终止日期', help_text: null, order_type: 'onboarding', source_category: 'customer_filled', sub_ticket_scope: 'contract', collection_group: '基本信息', business_context: ['onboarding'], display_order: 24, is_active: true },
  { id: '21', field_code: 'probation_start_date', field_name: '试用期开始日期', field_type: 'date', is_required: true, default_required: true, validation_regex: null, validation_msg: null, dropdown_options: null, placeholder: '请选择试用期开始日期', help_text: null, order_type: 'onboarding', source_category: 'customer_filled', sub_ticket_scope: 'contract', collection_group: '基本信息', business_context: ['onboarding'], display_order: 25, is_active: true },
  { id: '22', field_code: 'probation_months', field_name: '试用期（月）', field_type: 'text', is_required: true, default_required: true, validation_regex: null, validation_msg: null, dropdown_options: null, placeholder: '如：3个月', help_text: null, order_type: 'onboarding', source_category: 'customer_filled', sub_ticket_scope: 'contract', collection_group: '基本信息', business_context: ['onboarding'], display_order: 26, is_active: true },
  { id: '23', field_code: 'probation_end_date', field_name: '试用期结束日期', field_type: 'date', is_required: true, default_required: true, validation_regex: null, validation_msg: null, dropdown_options: null, placeholder: '请选择试用期结束日期', help_text: '可由开始日期 + 月数算出', order_type: 'onboarding', source_category: 'customer_filled', sub_ticket_scope: 'contract', collection_group: '基本信息', business_context: ['onboarding'], display_order: 27, is_active: true },
  { id: '24', field_code: 'work_city', field_name: '工作城市', field_type: 'text', is_required: true, default_required: true, validation_regex: null, validation_msg: null, dropdown_options: null, placeholder: '请输入工作城市', help_text: null, order_type: 'onboarding', source_category: 'customer_filled', sub_ticket_scope: 'contract', collection_group: '基本信息', business_context: ['onboarding'], display_order: 28, is_active: true },
  { id: '25', field_code: 'work_hour_system', field_name: '工时制', field_type: 'dropdown', is_required: true, default_required: true, validation_regex: null, validation_msg: null, dropdown_options: options(['标准工时制']), placeholder: '请选择工时制', help_text: '目前只保留标准工时制', order_type: 'onboarding', source_category: 'customer_filled', sub_ticket_scope: 'contract', collection_group: '基本信息', business_context: ['onboarding'], display_order: 29, is_active: true },
  { id: '27', field_code: 'salary_form', field_name: '工资形式', field_type: 'dropdown', is_required: true, default_required: true, validation_regex: null, validation_msg: null, dropdown_options: options(['按月']), placeholder: '请选择工资形式', help_text: null, order_type: 'onboarding', source_category: 'customer_filled', sub_ticket_scope: 'contract', collection_group: '基本信息', business_context: ['onboarding'], display_order: 30, is_active: true },
  { id: '28', field_code: 'base_salary', field_name: '基本工资', field_type: 'number', is_required: true, default_required: true, validation_regex: null, validation_msg: null, dropdown_options: null, placeholder: '请输入基本工资', help_text: null, order_type: 'onboarding', source_category: 'customer_filled', sub_ticket_scope: 'contract', collection_group: '基本信息', business_context: ['onboarding'], display_order: 31, is_active: true },
  { id: '29', field_code: 'other_salary', field_name: '其他工资', field_type: 'text', is_required: false, default_required: false, validation_regex: null, validation_msg: null, dropdown_options: null, placeholder: '请输入其他工资', help_text: '可填写文字说明，如可填写数字加文字。', order_type: 'onboarding', source_category: 'customer_filled', sub_ticket_scope: 'contract', collection_group: '基本信息', business_context: ['onboarding'], display_order: 32, is_active: true },
  { id: '30', field_code: 'probation_salary', field_name: '试用期工资', field_type: 'number', is_required: false, default_required: false, validation_regex: null, validation_msg: null, dropdown_options: null, placeholder: '请输入试用期工资', help_text: null, order_type: 'onboarding', source_category: 'customer_filled', sub_ticket_scope: 'contract', collection_group: '基本信息', business_context: ['onboarding'], display_order: 33, is_active: true },
  { id: 'o_probation_other_salary', field_code: 'probation_other_salary', field_name: '试用期其他工资', field_type: 'text', is_required: false, default_required: false, validation_regex: null, validation_msg: null, dropdown_options: null, placeholder: '请输入试用期其他工资', help_text: '可填写文字说明，如可填写数字加文字。', order_type: 'onboarding', source_category: 'customer_filled', sub_ticket_scope: 'contract', collection_group: '基本信息', business_context: ['onboarding'], display_order: 34, is_active: true },
  { id: '31', field_code: 'payroll_cycle', field_name: '发薪周期', field_type: 'dropdown', is_required: true, default_required: true, validation_regex: null, validation_msg: null, dropdown_options: options(['当月', '次月']), placeholder: '请选择发薪周期', help_text: null, order_type: 'onboarding', source_category: 'customer_filled', sub_ticket_scope: 'contract', collection_group: '基本信息', business_context: ['onboarding'], display_order: 35, is_active: true },
  { id: '32', field_code: 'payroll_date', field_name: '发薪日期', field_type: 'text', is_required: true, default_required: true, validation_regex: null, validation_msg: null, dropdown_options: null, placeholder: '如：15日', help_text: null, order_type: 'onboarding', source_category: 'customer_filled', sub_ticket_scope: 'contract', collection_group: '基本信息', business_context: ['onboarding'], display_order: 36, is_active: true },
  { id: '33', field_code: 'social_location', field_name: '参保地', field_type: 'text', is_required: true, default_required: true, validation_regex: null, validation_msg: null, dropdown_options: null, placeholder: '请输入参保地', help_text: null, order_type: 'onboarding', source_category: 'customer_filled', sub_ticket_scope: 'data_entry,social_insurance', collection_group: '基本信息', business_context: ['onboarding'], display_order: 37, is_active: true },
  { id: '34', field_code: 'start_month', field_name: '参保起始月', field_type: 'dropdown', is_required: true, default_required: true, validation_regex: null, validation_msg: null, dropdown_options: options(['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']), placeholder: '请选择参保起始月', help_text: '社保起缴月', order_type: 'onboarding', source_category: 'customer_filled', sub_ticket_scope: 'data_entry,social_insurance', collection_group: '基本信息', business_context: ['onboarding'], display_order: 38, is_active: true },
  { id: '35', field_code: 'social_base', field_name: '社保基数', field_type: 'number', is_required: true, default_required: true, validation_regex: null, validation_msg: null, dropdown_options: null, placeholder: '请输入社保基数', help_text: null, order_type: 'onboarding', source_category: 'customer_filled', sub_ticket_scope: 'data_entry,social_insurance', collection_group: '基本信息', business_context: ['onboarding'], display_order: 39, is_active: true },
  { id: '36', field_code: 'fund_base', field_name: '公积金基数', field_type: 'number', is_required: true, default_required: true, validation_regex: null, validation_msg: null, dropdown_options: null, placeholder: '请输入公积金基数', help_text: null, order_type: 'onboarding', source_category: 'customer_filled', sub_ticket_scope: 'data_entry,social_insurance', collection_group: '基本信息', business_context: ['onboarding'], display_order: 40, is_active: true },
  { id: '37', field_code: 'fund_ratio', field_name: '公积金比例', field_type: 'text', is_required: true, default_required: true, validation_regex: null, validation_msg: null, dropdown_options: null, placeholder: '如：5%+5%', help_text: '单位比例 + 个人比例（百分比格式）', order_type: 'onboarding', source_category: 'customer_filled', sub_ticket_scope: 'data_entry,social_insurance', collection_group: '基本信息', business_context: ['onboarding'], display_order: 41, is_active: true },
  { id: 'o_social_insurance_result', field_code: 'social_insurance_result', field_name: '社保是否办结', field_type: 'dropdown', is_required: false, default_required: false, validation_regex: null, validation_msg: null, dropdown_options: YES_NO_OPTIONS, placeholder: '请选择社保是否办结', help_text: null, order_type: 'onboarding', source_category: 'agent_supplemented', sub_ticket_scope: 'social_insurance', collection_group: '社保公积金类', business_context: ['onboarding', 'resignation'], display_order: 42, is_active: true },
  { id: 'o_social_insurance_remark', field_code: 'social_insurance_remark', field_name: '社保公积金办理备注', field_type: 'text', is_required: false, default_required: false, validation_regex: null, validation_msg: null, dropdown_options: null, placeholder: '请输入社保公积金办理备注', help_text: null, order_type: 'onboarding', source_category: 'agent_supplemented', sub_ticket_scope: 'social_insurance', collection_group: '社保公积金类', business_context: ['onboarding', 'resignation'], display_order: 43, is_active: true },
  { id: 'o_medical_insurance_result', field_code: 'medical_insurance_result', field_name: '医保是否办结', field_type: 'dropdown', is_required: false, default_required: false, validation_regex: null, validation_msg: null, dropdown_options: YES_NO_OPTIONS, placeholder: '请选择医保是否办结', help_text: null, order_type: 'onboarding', source_category: 'agent_supplemented', sub_ticket_scope: 'social_insurance', collection_group: '社保公积金类', business_context: ['onboarding', 'resignation'], display_order: 44, is_active: true },
  { id: 'o_housing_fund_result', field_code: 'housing_fund_result', field_name: '公积金是否办结', field_type: 'dropdown', is_required: false, default_required: false, validation_regex: null, validation_msg: null, dropdown_options: YES_NO_OPTIONS, placeholder: '请选择公积金是否办结', help_text: null, order_type: 'onboarding', source_category: 'agent_supplemented', sub_ticket_scope: 'social_insurance', collection_group: '社保公积金类', business_context: ['onboarding', 'resignation'], display_order: 45, is_active: true },
  { id: '38', field_code: 'bank_name', field_name: '开户银行信息', field_type: 'text', is_required: false, default_required: false, validation_regex: null, validation_msg: null, dropdown_options: null, placeholder: '请输入开户银行信息', help_text: '业务员发起时可空，由入职联系节点补全后回灌', order_type: 'onboarding', source_category: 'agent_supplemented', sub_ticket_scope: 'data_entry', collection_group: '基本信息', business_context: ['onboarding'], display_order: 42, is_active: true },
  { id: '39', field_code: 'bank_account', field_name: '银行借记卡帐号', field_type: 'text', is_required: false, default_required: false, validation_regex: null, validation_msg: null, dropdown_options: null, placeholder: '请输入银行借记卡帐号', help_text: '业务员发起时可空，由入职联系节点补全后回灌', order_type: 'onboarding', source_category: 'agent_supplemented', sub_ticket_scope: 'data_entry', collection_group: '基本信息', business_context: ['onboarding'], display_order: 43, is_active: true },
  { id: '40', field_code: 'remark', field_name: '备注', field_type: 'textarea', is_required: false, default_required: false, validation_regex: null, validation_msg: null, dropdown_options: null, placeholder: '请输入备注', help_text: null, order_type: 'onboarding', source_category: 'agent_supplemented', sub_ticket_scope: 'data_entry', collection_group: '基本信息', business_context: ['onboarding'], display_order: 44, is_active: true },
  { id: '41', field_code: 'business_mode', field_name: '业务模式', field_type: 'dropdown', is_required: true, default_required: true, validation_regex: null, validation_msg: null, dropdown_options: options(['北仑自营', '转外包', '转代理（非常规）']), placeholder: '请选择业务模式', help_text: '转代理为非常规业务模式', order_type: 'onboarding', source_category: 'agent_supplemented', sub_ticket_scope: 'contract,data_entry', collection_group: '劳动合同新签', business_context: ['onboarding'], display_order: 45, is_active: true },
  { id: '42', field_code: 'employee_type', field_name: '人员类型', field_type: 'dropdown', is_required: true, default_required: true, validation_regex: null, validation_msg: null, dropdown_options: options(['全日制', '非全日制', '劳务合同', '退休返聘']), placeholder: '请选择人员类型', help_text: null, order_type: 'onboarding', source_category: 'agent_supplemented', sub_ticket_scope: 'contract', collection_group: '劳动合同新签', business_context: ['onboarding'], display_order: 46, is_active: true },
  { id: '43', field_code: 'need_company_contract', field_name: '是否企服发起劳动合同', field_type: 'dropdown', is_required: true, default_required: true, validation_regex: null, validation_msg: null, dropdown_options: YES_NO_OPTIONS, placeholder: '请选择是否企服发起劳动合同', help_text: '选择“是”才生成劳动合同新签子工单', order_type: 'onboarding', source_category: 'process_judgment', sub_ticket_scope: 'contract', collection_group: '劳动合同新签', business_context: ['onboarding'], display_order: 47, is_active: true },
  { id: 'o_need_esign', field_code: 'need_esign', field_name: '是否电子签', field_type: 'dropdown', is_required: false, default_required: false, validation_regex: null, validation_msg: null, dropdown_options: YES_NO_OPTIONS, placeholder: '请选择是否电子签', help_text: '当“是否企服发起劳动合同”为是时必填', order_type: 'onboarding', source_category: 'process_judgment', sub_ticket_scope: 'contract', collection_group: '劳动合同新签', business_context: ['onboarding'], display_order: 48, is_active: true },
  { id: 'o_esign_platform', field_code: 'esign_platform', field_name: '电子签平台', field_type: 'dropdown', is_required: false, default_required: false, validation_regex: null, validation_msg: null, dropdown_options: options(['速创', 'E签宝']), placeholder: '请选择电子签平台', help_text: '当“是否企服发起劳动合同”为是时必填；决定劳动合同导出模板', order_type: 'onboarding', source_category: 'process_judgment', sub_ticket_scope: 'contract', collection_group: '劳动合同新签', business_context: ['onboarding'], display_order: 49, is_active: true },
  { id: '44', field_code: 'contract_subject', field_name: '劳动合同主体', field_type: 'text', is_required: false, default_required: false, validation_regex: null, validation_msg: null, dropdown_options: null, placeholder: '请输入劳动合同主体', help_text: '当“是否企服发起劳动合同”为是时必填', order_type: 'onboarding', source_category: 'agent_supplemented', sub_ticket_scope: 'contract', collection_group: '劳动合同新签', business_context: ['onboarding'], display_order: 50, is_active: true },
  { id: 'o_company_address', field_code: 'company_address', field_name: '甲方住所', field_type: 'text', is_required: false, default_required: false, validation_regex: null, validation_msg: null, dropdown_options: null, placeholder: '请输入甲方住所', help_text: '电子签平台为速创时非必填；电子签平台为E签宝时必填', order_type: 'onboarding', source_category: 'agent_supplemented', sub_ticket_scope: 'contract', collection_group: '劳动合同新签', business_context: ['onboarding'], display_order: 51, is_active: true },
  { id: 'o_project_name', field_code: 'project_name', field_name: '项目名称', field_type: 'text', is_required: false, default_required: false, validation_regex: null, validation_msg: null, dropdown_options: null, placeholder: '请输入项目名称', help_text: '当“是否企服发起劳动合同”为是时必填', order_type: 'onboarding', source_category: 'agent_supplemented', sub_ticket_scope: 'contract', collection_group: '劳动合同新签', business_context: ['onboarding'], display_order: 52, is_active: true },
  { id: 'o_work_arrangement', field_code: 'work_arrangement', field_name: '安排或调整工作的情况', field_type: 'text', is_required: false, default_required: false, validation_regex: null, validation_msg: null, dropdown_options: null, placeholder: '请输入安排或调整工作的情况', help_text: null, order_type: 'onboarding', source_category: 'agent_supplemented', sub_ticket_scope: 'contract', collection_group: '劳动合同新签', business_context: ['onboarding'], display_order: 53, is_active: true },
  { id: '45', field_code: 'contract_template', field_name: '劳动合同模板（标准模板 / 特殊模板）', field_type: 'text', is_required: false, default_required: false, validation_regex: null, validation_msg: null, dropdown_options: null, placeholder: '请输入劳动合同模板', help_text: '当“是否企服发起劳动合同”为是时必填', order_type: 'onboarding', source_category: 'agent_supplemented', sub_ticket_scope: 'contract', collection_group: '劳动合同新签', business_context: ['onboarding'], display_order: 54, is_active: true },
  { id: '46', field_code: 'need_contract_urge', field_name: '劳动合同签署是否需要催办员工', field_type: 'dropdown', is_required: false, default_required: false, validation_regex: null, validation_msg: null, dropdown_options: YES_NO_OPTIONS, placeholder: '请选择是否需要催办员工', help_text: '当“是否企服发起劳动合同”为是时必填', order_type: 'onboarding', source_category: 'process_judgment', sub_ticket_scope: 'contract', collection_group: '劳动合同新签', business_context: ['onboarding'], display_order: 55, is_active: true },
  { id: '48', field_code: 'need_onboarding_contact', field_name: '入职材料是否需要集约收集', field_type: 'dropdown', is_required: true, default_required: true, validation_regex: null, validation_msg: null, dropdown_options: YES_NO_OPTIONS, placeholder: '请选择入职材料是否需要集约收集', help_text: '选择“是”才生成入职联系子工单', order_type: 'onboarding', source_category: 'process_judgment', sub_ticket_scope: 'onboarding_contact', collection_group: '入职联系', business_context: ['onboarding'], display_order: 56, is_active: true },
  { id: 'o_feedback_deadline', field_code: 'feedback_deadline', field_name: '反馈截止日期', field_type: 'date', is_required: false, default_required: false, validation_regex: null, validation_msg: null, dropdown_options: null, placeholder: '请选择反馈截止日期', help_text: null, order_type: 'onboarding', source_category: 'agent_supplemented', sub_ticket_scope: 'onboarding_contact', collection_group: '入职联系', business_context: ['onboarding', 'resignation'], display_order: 57, is_active: true },
  { id: 'o_is_common_template', field_code: 'is_common_template', field_name: '是否为通用模板', field_type: 'dropdown', is_required: true, default_required: true, validation_regex: null, validation_msg: null, dropdown_options: YES_NO_OPTIONS, placeholder: '请选择是否为通用模板', help_text: null, order_type: 'onboarding', source_category: 'process_judgment', sub_ticket_scope: 'onboarding_contact', collection_group: '入职联系', business_context: ['onboarding', 'resignation'], display_order: 58, is_active: true },
  { id: 'o_template_name', field_code: 'template_name', field_name: '模板名称', field_type: 'text', is_required: false, default_required: false, validation_regex: null, validation_msg: null, dropdown_options: null, placeholder: '请输入模板名称', help_text: '当“是否为通用模板”为是时必填', order_type: 'onboarding', source_category: 'agent_supplemented', sub_ticket_scope: 'onboarding_contact', collection_group: '入职联系', business_context: ['onboarding', 'resignation'], display_order: 59, is_active: true },
  { id: '50', field_code: 'need_company_payroll', field_name: '是否企服发薪', field_type: 'dropdown', is_required: true, default_required: true, validation_regex: null, validation_msg: null, dropdown_options: YES_NO_OPTIONS, placeholder: '请选择是否企服发薪', help_text: '选择“是”时发薪地为必填', order_type: 'onboarding', source_category: 'process_judgment', sub_ticket_scope: 'data_entry', collection_group: '发薪信息', business_context: ['onboarding'], display_order: 60, is_active: true },
  { id: '51', field_code: 'payroll_location', field_name: '发薪地', field_type: 'text', is_required: false, default_required: false, validation_regex: null, validation_msg: null, dropdown_options: null, placeholder: '请输入发薪地', help_text: '当“是否企服发薪”为是时必填', order_type: 'onboarding', source_category: 'agent_supplemented', sub_ticket_scope: 'data_entry', collection_group: '发薪信息', business_context: ['onboarding'], display_order: 61, is_active: true },
  { id: 'o_social_urge', field_code: 'social_urge', field_name: '社保公积金未办是否需要催办', field_type: 'dropdown', is_required: true, default_required: true, validation_regex: null, validation_msg: null, dropdown_options: YES_NO_OPTIONS, placeholder: '请选择社保公积金未办是否需要催办', help_text: null, order_type: 'onboarding', source_category: 'process_judgment', sub_ticket_scope: 'social_insurance', collection_group: '社保公积金类', business_context: ['onboarding'], display_order: 62, is_active: true },
  { id: '53', field_code: 'special_remark', field_name: '特殊备注', field_type: 'textarea', is_required: false, default_required: false, validation_regex: null, validation_msg: null, dropdown_options: null, placeholder: '请输入特殊备注', help_text: '归属暂未确认，暂不硬挂任何子单', order_type: 'onboarding', source_category: 'agent_supplemented', sub_ticket_scope: null, collection_group: '社保公积金类', business_context: ['onboarding'], display_order: 63, is_active: true },
  { id: '26', field_code: 'work_cycle', field_name: '工作制周期', field_type: 'text', is_required: false, default_required: false, validation_regex: null, validation_msg: null, dropdown_options: null, placeholder: '如：1年', help_text: null, order_type: 'onboarding', source_category: 'customer_filled', sub_ticket_scope: 'contract', collection_group: '基本信息', business_context: ['onboarding'], display_order: 64, is_active: true },
  { id: '47', field_code: 'contract_feedback', field_name: '劳动合同新签反馈', field_type: 'dropdown', is_required: false, default_required: false, validation_regex: null, validation_msg: null, dropdown_options: FEEDBACK_OPTIONS, placeholder: '请选择劳动合同新签反馈', help_text: '由劳动合同新签子工单办理岗完成时填写', order_type: 'onboarding', source_category: 'agent_supplemented', sub_ticket_scope: 'contract', collection_group: '劳动合同新签', business_context: ['onboarding'], display_order: 65, is_active: true },
  { id: '49', field_code: 'onboarding_feedback', field_name: '入职联系反馈', field_type: 'dropdown', is_required: false, default_required: false, validation_regex: null, validation_msg: null, dropdown_options: FEEDBACK_OPTIONS, placeholder: '请选择入职联系反馈', help_text: '由入职联系子工单办理岗完成时填写', order_type: 'onboarding', source_category: 'agent_supplemented', sub_ticket_scope: 'onboarding_contact', collection_group: '入职联系', business_context: ['onboarding'], display_order: 66, is_active: true },
  { id: '54', field_code: 'data_entry_feedback', field_name: '增员报岗录入反馈', field_type: 'dropdown', is_required: false, default_required: false, validation_regex: null, validation_msg: null, dropdown_options: FEEDBACK_OPTIONS, placeholder: '请选择增员报岗录入反馈', help_text: '由增员报岗录入岗在子单完成时填写', order_type: 'onboarding', source_category: 'agent_supplemented', sub_ticket_scope: 'data_entry', collection_group: '社保公积金类', business_context: ['onboarding'], display_order: 67, is_active: true },

  // ── 通用字段（非入职专用） ──
  { id: 'r1', field_code: 'renewal_reason', field_name: '续签原因', field_type: 'dropdown', is_required: true, default_required: true, validation_regex: null, validation_msg: null, dropdown_options: options(['到期续签', '调岗续签', '其他']), placeholder: null, help_text: null, order_type: 'renewal', source_category: null, sub_ticket_scope: null, collection_group: null, display_order: 1, is_active: true },
  { id: 'r2', field_code: 'prev_contract_no', field_name: '上一份合同编号', field_type: 'text', is_required: true, default_required: true, validation_regex: null, validation_msg: null, dropdown_options: null, placeholder: null, help_text: null, order_type: 'renewal', source_category: null, sub_ticket_scope: null, collection_group: null, display_order: 2, is_active: true },
  { id: 'rs1', field_code: 'social_pay_region', field_name: '缴纳地区', field_type: 'text', is_required: true, default_required: true, validation_regex: null, validation_msg: null, dropdown_options: null, placeholder: '请输入缴纳地区', help_text: null, order_type: 'resignation', source_category: null, sub_ticket_scope: null, collection_group: null, business_context: ['resignation'], display_order: 1, is_active: true },
  { id: 'rs2', field_code: 'social_stop_month', field_name: '社保公积金停保月', field_type: 'dropdown', is_required: true, default_required: true, validation_regex: null, validation_msg: null, dropdown_options: options(['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']), placeholder: '请选择社保公积金停保月', help_text: null, order_type: 'resignation', source_category: null, sub_ticket_scope: null, collection_group: null, business_context: ['resignation'], display_order: 2, is_active: true },
  { id: 'rs3', field_code: 'resignation_reason', field_name: '离职原因', field_type: 'text', is_required: true, default_required: true, validation_regex: null, validation_msg: null, dropdown_options: null, placeholder: '请输入离职原因', help_text: null, order_type: 'resignation', source_category: null, sub_ticket_scope: null, collection_group: null, business_context: ['resignation'], display_order: 3, is_active: true },
  { id: 'rs4', field_code: 'resignation_date', field_name: '离职日期', field_type: 'date', is_required: true, default_required: true, validation_regex: null, validation_msg: null, dropdown_options: null, placeholder: '请选择离职日期', help_text: null, order_type: 'resignation', source_category: null, sub_ticket_scope: null, collection_group: null, business_context: ['resignation'], display_order: 4, is_active: true },
  { id: 'rs5', field_code: 'need_resignation_share', field_name: '离职材料是否需要共享收集', field_type: 'dropdown', is_required: true, default_required: true, validation_regex: null, validation_msg: null, dropdown_options: YES_NO_OPTIONS, placeholder: '请选择离职材料是否需要共享收集', help_text: null, order_type: 'resignation', source_category: null, sub_ticket_scope: null, collection_group: null, business_context: ['resignation'], display_order: 5, is_active: true },
];

// ======================== API ========================

function matchesOrderType(field: FieldConfigItem, orderType?: string): boolean {
  if (!orderType) return true;
  return field.order_type === orderType
    || field.order_type === null
    || (Array.isArray(field.business_context) && field.business_context.includes(orderType));
}

export function getFallbackFields(orderType?: string): FieldConfigItem[] {
  return mockFields.filter((f) => f.is_active && matchesOrderType(f, orderType));
}

export async function getFields(orderType?: string): Promise<FieldConfigItem[]> {
  if (isMockMode) {
    const list = loadList<FieldConfigItem>(FIELD_MOCK_STORE_KEY, mockFields).filter((f) => f.is_active && matchesOrderType(f, orderType));
    return mockDelay(list);
  }
  try {
    // 后端业务只读字段接口是分页接口；新建工单/导出模板配置需要完整系统字段库，避免只取第一页导致字段缺失。
    const pageSize = 200;
    const first = await request.get('/work-order-fields', { params: { orderType, page: 1, pageSize }, silentError: true } as any) as any;
    const firstList = Array.isArray(first) ? first : (first?.list || first?.items || first?.data || []);
    const total = Array.isArray(first) ? first.length : Number(first?.total ?? firstList.length);
    const all = Array.isArray(firstList) ? [...firstList] : [];
    const totalPages = Math.ceil(total / pageSize);
    for (let page = 2; page <= totalPages; page += 1) {
      const result = await request.get('/work-order-fields', { params: { orderType, page, pageSize }, silentError: true } as any) as any;
      const rawList = Array.isArray(result) ? result : (result?.list || result?.items || result?.data || []);
      if (Array.isArray(rawList)) all.push(...rawList);
    }
    return all.map(normalizeField).filter((f) => f.is_active);
  } catch {
    return mockFields.filter((f) => f.is_active && matchesOrderType(f, orderType));
  }
}

function normalizeFieldType(type: unknown): FieldConfigItem['field_type'] {
  const value = String(type ?? 'text').toLowerCase();
  if (value === 'number' || value === 'digit') return 'number';
  if (value === 'date' || value === 'datetime') return 'date';
  if (value === 'dropdown' || value === 'select') return 'dropdown';
  if (value === 'textarea') return 'textarea';
  // 后端存在 PHONE/EMAIL 等专用类型，前端新建页按文本框渲染，并继续使用 validation_regex 校验。
  return 'text';
}

function normalizeDropdownOptions(options: unknown): FieldConfigItem['dropdown_options'] {
  if (!Array.isArray(options)) return null;
  return options.map((item) => {
    if (typeof item === 'string') return { label: item, value: item };
    const obj = item as Record<string, unknown>;
    const label = String(obj.label ?? obj.name ?? obj.value ?? '');
    const value = String(obj.value ?? obj.label ?? obj.name ?? '');
    return { label, value };
  }).filter((item) => item.label && item.value);
}

function normalizeField(f: any): FieldConfigItem {
  return {
    id: String(f.id ?? ''),
    field_code: f.field_code ?? f.fieldCode ?? '',
    field_name: f.field_name ?? f.fieldName ?? '',
    field_type: normalizeFieldType(f.field_type ?? f.fieldType),
    is_required: f.is_required ?? f.isRequired ?? false,
    default_required: f.default_required ?? f.defaultRequired ?? false,
    conditional_required: f.conditional_required ?? f.conditionalRequired ?? null,
    validation_regex: f.validation_regex ?? f.validationRegex ?? null,
    validation_msg: f.validation_msg ?? f.validationMsg ?? null,
    dropdown_options: normalizeDropdownOptions(f.dropdown_options ?? f.dropdownOptions),
    placeholder: f.placeholder ?? null,
    help_text: f.help_text ?? f.helpText ?? null,
    order_type: f.order_type ?? f.orderType ?? null,
    source_category: f.source_category ?? f.sourceCategory ?? null,
    sub_ticket_scope: f.sub_ticket_scope ?? f.subTicketScope ?? null,
    collection_group: f.collection_group ?? f.collectionGroup ?? null,
    business_context: Array.isArray(f.business_context) ? f.business_context : (Array.isArray(f.businessContext) ? f.businessContext : null),
    display_order: f.display_order ?? f.displayOrder ?? 99,
    is_active: f.is_active ?? f.isActive ?? true,
  };
}

export async function createField(data: Partial<FieldConfigItem>): Promise<FieldConfigItem> {
  if (isMockMode) {
    const list = loadList<FieldConfigItem>(FIELD_MOCK_STORE_KEY, mockFields);
    const item: FieldConfigItem = {
      id: nextId(list),
      field_code: data.field_code || '',
      field_name: data.field_name || '',
      field_type: data.field_type || 'text',
      is_required: data.is_required ?? false,
      default_required: data.default_required ?? false,
      validation_regex: data.validation_regex ?? null,
      validation_msg: data.validation_msg ?? null,
      dropdown_options: data.dropdown_options ?? null,
      placeholder: data.placeholder ?? null,
      help_text: data.help_text ?? null,
      order_type: data.order_type ?? null,
      source_category: data.source_category ?? null,
      sub_ticket_scope: data.sub_ticket_scope ?? null,
      collection_group: data.collection_group ?? null,
      display_order: data.display_order ?? 99,
      is_active: data.is_active ?? true,
    };
    list.push(item);
    saveList(FIELD_MOCK_STORE_KEY, list);
    return mockDelay(item);
  }
  return request.post('/admin/fields', packField(data)) as Promise<FieldConfigItem>;
}

function packField(data: Partial<FieldConfigItem>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (data.field_code !== undefined) body.fieldCode = data.field_code;
  if (data.field_name !== undefined) body.fieldName = data.field_name;
  if (data.field_type !== undefined) body.fieldType = data.field_type;
  if (data.is_required !== undefined) body.isRequired = data.is_required;
  if (data.default_required !== undefined) body.defaultRequired = data.default_required;
  if (data.validation_regex !== undefined) body.validationRegex = data.validation_regex;
  if (data.validation_msg !== undefined) body.validationMsg = data.validation_msg;
  if (data.dropdown_options !== undefined) body.dropdownOptions = data.dropdown_options;
  if (data.placeholder !== undefined) body.placeholder = data.placeholder;
  if (data.help_text !== undefined) body.helpText = data.help_text;
  if (data.order_type !== undefined) body.orderType = data.order_type;
  if (data.display_order !== undefined) body.displayOrder = data.display_order;
  if (data.is_active !== undefined) body.isActive = data.is_active;
  return body;
}

export async function updateField(id: string, data: Partial<FieldConfigItem>): Promise<FieldConfigItem> {
  if (isMockMode) {
    const list = loadList<FieldConfigItem>(FIELD_MOCK_STORE_KEY, mockFields);
    const idx = list.findIndex((f) => f.id === id);
    if (idx === -1) return mockDelay(Promise.reject(new Error('字段不存在')));
    list[idx] = { ...list[idx], ...data, id };
    saveList(FIELD_MOCK_STORE_KEY, list);
    return mockDelay(list[idx]);
  }
  return request.put(`/admin/fields/${id}`, packField(data)) as Promise<FieldConfigItem>;
}

export async function deleteField(id: string): Promise<void> {
  if (isMockMode) {
    const list = loadList<FieldConfigItem>(FIELD_MOCK_STORE_KEY, mockFields).filter((f) => f.id !== id);
    saveList(FIELD_MOCK_STORE_KEY, list);
    return mockDelay(undefined);
  }
  return request.delete(`/admin/fields/${id}`) as Promise<void>;
}
