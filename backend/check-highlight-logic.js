const CUSTOMER_REQUIRED = new Set([
  'customer_name', 'employee_name', 'id_card_type', 'id_card_no', 'mobile',
  'position', 'contract_start_date', 'work_city', 'base_salary', 'social_location',
  'bank_account', 'bank_name'
]);

const fields = [
  'customer_name', 'employee_name', 'id_card_type', 'id_card_no', 'mobile',
  'position', 'contract_start_date', 'work_city', 'base_salary', 'social_location',
  'bank_account', 'bank_name', 'customer_code', 'outsource_type',
  'position_type', 'household_type', 'ethnicity', 'education', 'graduation_school', 'major'
];

console.log('字段高亮判断：');
fields.forEach((code, i) => {
  const shouldHighlight = CUSTOMER_REQUIRED.has(code);
  console.log(`${i+1}. ${code}: ${shouldHighlight ? '应标黄' : '不应标黄'}`);
});
