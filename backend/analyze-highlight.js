// 当前的不标黄字段
const NON_HIGHLIGHT = new Set([
  'customer_code', 'outsource_type',
  'business_mode', 'employee_type', 'need_company_contract', 'need_esign', 'esign_platform',
  'contract_subject', 'company_address', 'project_name', 'work_arrangement', 'contract_template',
  'need_contract_urge', 'need_onboarding_contact', 'feedback_deadline', 'is_common_template', 'template_name',
  'need_company_payroll', 'payroll_location', 'social_urge', 'special_remark',
]);

// 从Excel读取的63个字段
const currentFields = [
  'customer_name', 'customer_code', 'outsource_type', 'position', 'position_type',
  'employee_name', 'id_card_type', 'id_card_no', 'household_type', 'ethnicity',
  'education', 'graduation_school', 'major', 'graduation_date', 'marital_status',
  'mobile', 'email', 'current_address', 'household_address', 'postal_code',
  'contract_term_type', 'contract_term', 'contract_start_date', 'contract_end_date',
  'probation_start_date', 'probation_months', 'probation_end_date', 'work_city',
  'work_hour_system', 'salary_form', 'base_salary', 'other_salary',
  'probation_salary', 'probation_other_salary', 'payroll_cycle', 'payroll_date',
  'social_location', 'start_month', 'social_base', 'fund_base', 'fund_ratio',
  'bank_name', 'bank_account', 'remark',
  'business_mode', 'employee_type', 'need_company_contract', 'need_esign', 'esign_platform',
  'contract_subject', 'company_address', 'project_name', 'work_arrangement', 'contract_template',
  'need_contract_urge', 'need_onboarding_contact', 'feedback_deadline', 'is_common_template', 'template_name',
  'need_company_payroll', 'payroll_location', 'social_urge', 'special_remark',
];

console.log('===== 当前标黄字段（除了NON_HIGHLIGHT） =====');
const highlighted = currentFields.filter(f => !NON_HIGHLIGHT.has(f));
console.log(`共 ${highlighted.length} 个字段会标黄`);
highlighted.forEach((f, i) => console.log(`${i + 1}. ${f}`));

console.log('\n===== 业务判断项（不标黄） =====');
const businessFields = currentFields.filter(f => NON_HIGHLIGHT.has(f));
console.log(`共 ${businessFields.length} 个字段不标黄`);
businessFields.forEach((f, i) => console.log(`${i + 1}. ${f}`));
