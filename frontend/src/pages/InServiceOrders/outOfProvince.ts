import type { InServiceOrder } from '@/services/inServiceOrders';

export const OUT_OF_PROVINCE_INCREASE_LIST_HEADERS = [
  '查看',
  '状态',
  '参保单位',
  '员工姓名',
  '证件号',
  '缴纳地',
  '社保起缴月',
  '公积金起缴月',
  '社保是否办结',
  '医保是否办结',
  '公积金是否办结',
  '社保公积金办理备注',
  '派发时间',
  '完成时间',
] as const;

export const OUT_OF_PROVINCE_DECREASE_LIST_HEADERS = [
  '查看',
  '状态',
  '参保单位',
  '员工姓名',
  '证件号',
  '缴纳地',
  '社保停缴月',
  '公积金停缴月',
  '社保是否办结',
  '医保是否办结',
  '公积金是否办结',
  '社保公积金办理备注',
  '派发时间',
  '完成时间',
] as const;

export const OUT_OF_PROVINCE_INCREASE_EXPORT_HEADERS = [
  '姓名',
  '身份证号',
  '参保单位',
  '参保地',
  '客户名称',
  '缴纳地',
  '社保起缴月',
  '社保缴费工资',
  '公积金起缴月',
  '公积金缴费工资',
  '公积金比例',
  '移动电话',
  '社保是否办结',
  '医保是否办结',
  '公积金是否办结',
  '社保公积金办理备注',
  '备注',
  '特殊备注',
  '岗位',
  '岗位类型',
  '婚姻状况',
  '户籍性质',
  '现住地址',
  '户籍地址',
  '人员类型',
  '合同期限形式',
  '合同开始日期',
  '合同终止日期',
  '学历',
  '毕业院校',
  '专业',
  '毕业时间',
  '开户银行信息',
  '银行借记卡帐号',
  '发起人',
] as const;

export const OUT_OF_PROVINCE_DECREASE_EXPORT_HEADERS = [
  '姓名',
  '身份证号',
  '参保单位',
  '缴纳地',
  '客户名称',
  '社保停缴月',
  '公积金停缴月',
  '离职原因',
  '最后工作日',
  '社保是否办结',
  '医保是否办结',
  '公积金是否办结',
  '社保公积金办理备注',
  '备注',
  '发起人',
] as const;

const EXTRA_ALIASES: Record<string, string[]> = {
  insured_unit: ['contract_subject', 'contractSubject', 'insured_unit', 'insuredUnit', '参保单位', 'payment_institution', 'paymentInstitution'],
  social_pay_region: ['social_pay_region', 'socialPayRegion', '缴纳地', '参保地'],
  start_month: ['start_month', 'startMonth', '社保起缴月', '社保生效月份'],
  fund_start_month: ['fund_start_month', 'fundStartMonth', '公积金起缴月', '公积金生效月份'],
  social_base: ['social_base', 'socialBase', '社保缴费工资', '社保基数'],
  fund_base: ['fund_base', 'fundBase', '公积金缴费工资', '公积金基数'],
  fund_ratio: ['fund_ratio', 'fundRatio', '公积金比例'],
  mobile: ['mobile', '移动电话', '联系电话', '手机'],
  social_insurance_result: ['social_insurance_result', 'socialInsuranceResult', '社保是否办结'],
  medical_insurance_result: ['medical_insurance_result', 'medicalInsuranceResult', '医保是否办结'],
  housing_fund_result: ['housing_fund_result', 'housingFundResult', '公积金是否办结'],
  social_insurance_remark: ['social_insurance_remark', 'socialInsuranceRemark', '社保公积金办理备注'],
  remark: ['remark', '备注', '申请备注'],
  special_remark: ['special_remark', 'specialRemark', '特殊备注'],
  position: ['position', '岗位'],
  position_type: ['position_type', 'positionType', '岗位类型'],
  marital_status: ['marital_status', 'maritalStatus', '婚姻状况'],
  household_type: ['household_type', 'householdType', '户籍性质'],
  current_address: ['current_address', 'currentAddress', '现住地址', '现住址（文书送达地址）', '现居住地址'],
  household_address: ['household_address', 'householdAddress', '户籍地址'],
  employee_type: ['employee_type', 'employeeType', '人员类型'],
  contract_term_type: ['contract_term_type', 'contractTermType', '合同期限形式'],
  contract_start_date: ['contract_start_date', 'contractStartDate', '合同开始日期'],
  contract_end_date: ['contract_end_date', 'contractEndDate', '合同终止日期', '合同截止日期'],
  education: ['education', '学历'],
  graduation_school: ['graduation_school', 'graduationSchool', '毕业院校'],
  major: ['major', '专业'],
  graduation_date: ['graduation_date', 'graduationDate', '毕业时间'],
  bank_name: ['bank_name', 'bankName', '开户银行信息'],
  bank_account: ['bank_account', 'bankAccount', '银行借记卡帐号', '银行借记卡账号'],
  resignation_reason: ['resignation_reason', 'resignationReason', '离职原因'],
  social_stop_month: ['social_stop_month', 'socialStopMonth', '社保停缴月', '社保最后缴纳月份'],
  fund_stop_month: ['fund_stop_month', 'fundStopMonth', '公积金停缴月', '公积金最后缴纳月份'],
  last_work_date: ['last_work_date', 'lastWorkDate', '最后工作日'],
};

export function readOutOfProvinceExtra(
  order: Pick<InServiceOrder, 'extraData'> | Record<string, unknown>,
  fieldCode: string,
): unknown {
  const source = (
    (order as { extraData?: Record<string, unknown> }).extraData ?? order
  ) as Record<string, unknown>;
  for (const alias of EXTRA_ALIASES[fieldCode] ?? [fieldCode]) {
    const value = source?.[alias];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return null;
}

export function displayOutOfProvinceRegion(order: InServiceOrder): string {
  return [order.province, order.city].filter(Boolean).join(' / ') || '-';
}

export function displayOutOfProvinceExtra(order: InServiceOrder, fieldCode: string): string {
  const value = readOutOfProvinceExtra(order, fieldCode);
  return value === null || value === undefined || String(value).trim() === '' ? '-' : String(value);
}

export function displayOutOfProvinceDate(value: unknown): string {
  if (value === null || value === undefined || String(value).trim() === '') return '-';
  return String(value).slice(0, 10);
}

export function sortOutOfProvinceOrders(items: InServiceOrder[]): InServiceOrder[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const leftPriority = left.item.extraData?.__materialChangeRequest ? 0 : 1;
      const rightPriority = right.item.extraData?.__materialChangeRequest ? 0 : 1;
      return leftPriority - rightPriority || left.index - right.index;
    })
    .map(({ item }) => item);
}
