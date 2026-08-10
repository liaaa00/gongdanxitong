export interface SocialFundExportColumn {
  fieldCode: string;
  alias: string;
  header: string[];
  order: number;
}

const INCREASE_COLUMNS: ReadonlyArray<readonly [string, string]> = [
  ['employee_name', '姓名'],
  ['id_card_no', '身份证号'],
  ['insured_unit', '参保单位'],
  ['social_location', '参保地'],
  ['customer_name', '客户名称'],
  ['social_pay_region', '缴纳地'],
  ['start_month', '社保起缴月'],
  ['social_base', '社保缴费工资'],
  ['fund_start_month', '公积金起缴月'],
  ['fund_base', '公积金缴费工资'],
  ['fund_ratio', '公积金比例'],
  ['mobile', '移动电话'],
  ['social_insurance_result', '社保是否办结'],
  ['medical_insurance_result', '医保是否办结'],
  ['housing_fund_result', '公积金是否办结'],
  ['social_insurance_remark', '社保公积金办理备注'],
  ['remark', '备注'],
  ['special_remark', '特殊备注'],
  ['position', '岗位'],
  ['position_type', '岗位类型'],
  ['marital_status', '婚姻状况'],
  ['household_type', '户籍性质'],
  ['current_address', '现住地址'],
  ['household_address', '户籍地址'],
  ['employee_type', '人员类型'],
  ['contract_term_type', '合同期限形式'],
  ['contract_start_date', '合同开始日期'],
  ['contract_end_date', '合同终止日期'],
  ['education', '学历'],
  ['graduation_school', '毕业院校'],
  ['major', '专业'],
  ['graduation_date', '毕业时间'],
  ['bank_name', '开户银行信息'],
  ['bank_account', '银行借记卡帐号'],
  ['created_by_name', '发起人'],
];

const DECREASE_COLUMNS: ReadonlyArray<readonly [string, string]> = [
  ['employee_name', '姓名'],
  ['id_card_no', '身份证号'],
  ['insured_unit', '参保单位'],
  ['social_pay_region', '缴纳地'],
  ['customer_name', '客户名称'],
  ['social_stop_month', '社保停缴月'],
  ['fund_stop_month', '公积金停缴月'],
  ['resignation_reason', '离职原因'],
  ['last_work_date', '最后工作日'],
  ['social_insurance_result', '社保是否办结'],
  ['medical_insurance_result', '医保是否办结'],
  ['housing_fund_result', '公积金是否办结'],
  ['social_insurance_remark', '社保公积金办理备注'],
  ['remark', '备注'],
  ['created_by_name', '发起人'],
];

function toFieldList(columns: ReadonlyArray<readonly [string, string]>): SocialFundExportColumn[] {
  return columns.map(([fieldCode, alias], index) => ({
    fieldCode,
    alias,
    header: [alias],
    order: index + 1,
  }));
}

export function getSocialFundExportFieldList(moduleCode: string): SocialFundExportColumn[] | null {
  if (moduleCode === 'social_insurance') return toFieldList(INCREASE_COLUMNS);
  if (moduleCode === 'resignation_social_insurance') return toFieldList(DECREASE_COLUMNS);
  return null;
}

export function getSocialFundExportTemplateName(moduleCode: string): string | null {
  if (moduleCode === 'social_insurance') return '社保公积金增员导出表';
  if (moduleCode === 'resignation_social_insurance') return '社保公积金减员导出表';
  return null;
}
