import { Workbook } from 'exceljs';
import { InServiceOrder, InServiceOrderKind } from 'src/entities';

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
  insured_unit: [
    'contract_subject', 'contractSubject', 'insured_unit', 'insuredUnit', '参保单位',
  ],
  social_pay_region: ['social_pay_region', 'socialPayRegion', '缴纳地'],
  start_month: ['start_month', 'startMonth', '社保起缴月', '社保生效月份'],
  social_base: ['social_base', 'socialBase', '社保缴费工资', '社保基数'],
  fund_start_month: ['fund_start_month', 'fundStartMonth', '公积金起缴月', '公积金生效月份'],
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
  current_address: ['current_address', 'currentAddress', '现住地址', '现居住地址'],
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
  social_stop_month: ['social_stop_month', 'socialStopMonth', '社保停缴月', '社保最后缴纳月份'],
  fund_stop_month: ['fund_stop_month', 'fundStopMonth', '公积金停缴月', '公积金最后缴纳月份'],
  resignation_reason: ['resignation_reason', 'resignationReason', '离职原因'],
  last_work_date: ['last_work_date', 'lastWorkDate', '最后工作日'],
};

export function readOutOfProvinceExportValue(
  extraData: Record<string, unknown>,
  fieldCode: string,
): unknown {
  for (const alias of EXTRA_ALIASES[fieldCode] ?? [fieldCode]) {
    const value = extraData[alias];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
}

function insuredRegion(order: InServiceOrder): string {
  return [order.province, order.city].filter(Boolean).join(' / ');
}

function customerName(order: InServiceOrder): string {
  return order.customer?.customerName ?? String(order.extraData?.customer_name ?? '');
}

function creatorName(order: InServiceOrder): string {
  return order.creator?.realName ?? order.createdBy;
}

export function buildOutOfProvinceExport(
  order: InServiceOrder,
): { headers: readonly string[]; values: unknown[]; sheetName: string; fileName: string } {
  const extraData = order.extraData ?? {};
  const value = (fieldCode: string) => readOutOfProvinceExportValue(extraData, fieldCode);
  if (order.orderKind === InServiceOrderKind.OUT_OF_PROVINCE_INCREASE) {
    return {
      headers: OUT_OF_PROVINCE_INCREASE_EXPORT_HEADERS,
      values: [
        order.employeeName ?? '',
        order.idCardNo ?? '',
        value('insured_unit'),
        insuredRegion(order),
        customerName(order),
        value('social_pay_region'),
        value('start_month'),
        value('social_base'),
        value('fund_start_month'),
        value('fund_base'),
        value('fund_ratio'),
        value('mobile'),
        value('social_insurance_result'),
        value('medical_insurance_result'),
        value('housing_fund_result'),
        value('social_insurance_remark'),
        value('remark'),
        value('special_remark'),
        value('position'),
        value('position_type'),
        value('marital_status'),
        value('household_type'),
        value('current_address'),
        value('household_address'),
        value('employee_type'),
        value('contract_term_type'),
        value('contract_start_date'),
        value('contract_end_date'),
        value('education'),
        value('graduation_school'),
        value('major'),
        value('graduation_date'),
        value('bank_name'),
        value('bank_account'),
        creatorName(order),
      ],
      sheetName: '省外增员',
      fileName: `省外增员-${order.orderNo}.xlsx`,
    };
  }
  if (order.orderKind !== InServiceOrderKind.OUT_OF_PROVINCE_DECREASE) {
    throw new Error('仅省外增员或减员工单可使用此导出');
  }
  return {
    headers: OUT_OF_PROVINCE_DECREASE_EXPORT_HEADERS,
    values: [
      order.employeeName ?? '',
      order.idCardNo ?? '',
      value('insured_unit'),
      value('social_pay_region'),
      customerName(order),
      value('social_stop_month'),
      value('fund_stop_month'),
      value('resignation_reason'),
      value('last_work_date'),
      value('social_insurance_result'),
      value('medical_insurance_result'),
      value('housing_fund_result'),
      value('social_insurance_remark'),
      value('remark'),
      creatorName(order),
    ],
    sheetName: '省外减员',
    fileName: `省外减员-${order.orderNo}.xlsx`,
  };
}

export function buildOutOfProvinceExportRows(
  orders: InServiceOrder[],
): { headers: readonly string[]; rows: unknown[][]; sheetName: string; fileName: string } {
  if (orders.length === 0) throw new Error('至少选择一条省外工单');
  const first = buildOutOfProvinceExport(orders[0]);
  const rows = [first.values];
  for (const order of orders.slice(1)) {
    const current = buildOutOfProvinceExport(order);
    if (current.sheetName !== first.sheetName) {
      throw new Error('省外增员和减员不能合并导出');
    }
    rows.push(current.values);
  }
  return { headers: first.headers, rows, sheetName: first.sheetName, fileName: first.fileName };
}

export async function createOutOfProvinceExportWorkbook(
  orderOrOrders: InServiceOrder | InServiceOrder[],
): Promise<{ buffer: Buffer; fileName: string }> {
  const orders = Array.isArray(orderOrOrders) ? orderOrOrders : [orderOrOrders];
  const exportData = buildOutOfProvinceExportRows(orders);
  const workbook = new Workbook();
  const worksheet = workbook.addWorksheet(exportData.sheetName);
  worksheet.addRow([...exportData.headers]);
  exportData.rows.forEach((row) => worksheet.addRow(row));
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: exportData.headers.length },
  };
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.columns.forEach((column, index) => {
    const title = exportData.headers[index] ?? '';
    column.width = Math.max(12, Math.min(32, title.length * 2 + 4));
  });
  const content = await workbook.xlsx.writeBuffer();
  const fileName = orders.length > 1
    ? `${exportData.sheetName}-批量.xlsx`
    : exportData.fileName;
  return { buffer: Buffer.from(content), fileName };
}
