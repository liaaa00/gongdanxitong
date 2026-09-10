import * as XLSX from 'xlsx';
import type { BatchCustomerRuleRow, CustomerRuleItem, RuleValue, SaveCustomerRuleInput } from '@/services/customerRules';

export const COMPLETE_BUSINESS_TYPES = ['onboarding', 'resignation', 'salary'] as const;
export const DEFAULT_RESULT_FIELDS = ['order_no', 'order_type', 'customer_name', 'employee_name', 'employee_id_card'];
const ONBOARDING_TEMPLATE_FIELDS = [
  ['business_mode', '入职·业务模式'], ['outsource_type', '入职·外包类型'], ['employee_type', '入职·员工类型'],
  ['fund_ratio', '入职·公积金比例'], ['contract_subject', '入职·合同主体'], ['company_address', '入职·企业地址'],
  ['project_name', '入职·项目名称'], ['work_arrangement', '入职·工作安排'], ['need_company_contract', '入职·需要企业合同'],
  ['need_esign', '入职·需要电子签'], ['esign_platform', '入职·电子签平台'], ['contract_template', '入职·合同模板'],
  ['need_onboarding_contact', '入职·需要入职联系'], ['feedback_deadline', '入职·反馈时限'], ['is_common_template', '入职·通用模板'],
  ['supplementary_materials', '入职·补充材料'], ['need_company_payroll', '入职·企业发薪'], ['payroll_location', '入职·发薪地'],
  ['payroll_cycle', '入职·发薪月份'], ['payroll_date', '入职·发薪日'], ['need_payroll_slip', '入职·是否需要工资单'],
  ['purchased_products', '入职·已购产品'], ['service_fee', '入职·服务费'], ['deposit', '入职·押金'],
  ['need_contract_urge', '入职·催签合同'], ['social_urge', '入职·社保公积金催办规则'], ['special_remark', '入职·特殊说明'],
] as const;
const RESIGNATION_TEMPLATE_FIELDS = [
  ['need_resignation_cert', '离职·是否开具离职证明'], ['cert_delivery_address', '离职·证明送达地址'],
  ['cert_delivery_method', '离职·证明形式'], ['certificate_template', '离职·证明模板'],
] as const;
export const CUSTOMER_RULE_FIELD_LABELS: Record<string, string> = {
  ...Object.fromEntries([...ONBOARDING_TEMPLATE_FIELDS, ...RESIGNATION_TEMPLATE_FIELDS].map(([key, label]) => [key, label.replace(/^.*?·/, '')])),
  branch_id: '商社', branchId: '商社', branch_code: '商社编码', branch_name: '商社名称', social_location: '缴纳地',
};
const BOOLEAN_ONBOARDING_FIELDS = new Set(['need_company_contract', 'need_esign', 'need_onboarding_contact', 'need_company_payroll', 'need_contract_urge']);
export const TEMPLATE_HEADERS = [
  '客户UUID', '客户编码', '客户名称', ...ONBOARDING_TEMPLATE_FIELDS.map(([, label]) => label),
  ...RESIGNATION_TEMPLATE_FIELDS.map(([, label]) => label), '薪资·每月账单日', '薪资·启用提醒', '薪资·发薪周期',
  '共享邮箱·地址', '共享邮箱·路由标识', '办结邮件·启用', '办结邮件·收件人', '办结邮件·抄送',
  '办结邮件·回复地址', '办结邮件·结果字段', '客户异议期限（天）', '规则·启用',
];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SpreadsheetRuleRow extends BatchCustomerRuleRow {
  rowNumber: number;
  customerCode: string;
  customerName: string;
  error?: string;
}

export function valueToCell(value: unknown): string | number {
  if (Array.isArray(value)) return value.join(';');
  if (value === true) return '是';
  if (value === false) return '否';
  return typeof value === 'number' ? value : String(value ?? '');
}

function cellToValue(value: unknown, boolean = false): RuleValue | undefined {
  if (value === undefined || value === null || String(value).trim() === '') return undefined;
  if (!boolean) return typeof value === 'number' ? value : String(value).trim();
  const normalized = String(value).trim().toLowerCase();
  if (['是', '1.是', '1', 'true', 'yes'].includes(normalized)) return true;
  if (['否', '2.否', '0', 'false', 'no'].includes(normalized)) return false;
  throw new Error('请填写“是”或“否”');
}

function splitValues(value: unknown): string[] {
  return String(value || '').split(/[;,；，\s]+/).map((item) => item.trim()).filter(Boolean);
}

export function buildTemplateRow(rule: CustomerRuleItem) {
  const row: Record<string, string | number> = { 客户UUID: rule.customerId, 客户编码: rule.customerCode, 客户名称: rule.customerName };
  for (const [code, label] of ONBOARDING_TEMPLATE_FIELDS) row[label] = valueToCell(rule.onboardingDefaults?.[code]);
  for (const [code, label] of RESIGNATION_TEMPLATE_FIELDS) row[label] = valueToCell(rule.resignationDefaults?.[code]);
  row['薪资·每月账单日'] = valueToCell(rule.salaryRules?.billingDay);
  row['薪资·启用提醒'] = valueToCell(rule.salaryRules?.reminderEnabled);
  row['薪资·发薪周期'] = rule.salaryRules?.payrollMonthMode === 'current' ? '当月发当月' : rule.salaryRules?.payrollMonthMode === 'previous' ? '当月发上月' : '';
  row['共享邮箱·地址'] = valueToCell(rule.sharedEmailRules?.mailbox);
  row['共享邮箱·路由标识'] = valueToCell(rule.sharedEmailRules?.routeKey);
  row['办结邮件·启用'] = valueToCell(rule.completionEmailEnabled);
  row['办结邮件·收件人'] = valueToCell(rule.completionEmailTo);
  row['办结邮件·抄送'] = valueToCell(rule.completionEmailCc);
  row['办结邮件·回复地址'] = valueToCell(rule.completionEmailReplyTo);
  row['办结邮件·结果字段'] = valueToCell(rule.completionEmailFields);
  row['客户异议期限（天）'] = valueToCell(rule.objectionDeadlineDays);
  row['规则·启用'] = valueToCell(rule.isActive);
  return row;
}

export function createRulesWorkbook(customers: CustomerRuleItem[]): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(customers.map(buildTemplateRow), { header: TEMPLATE_HEADERS });
  sheet['!cols'] = TEMPLATE_HEADERS.map((_, index) => ({ wch: index === 0 ? 38 : index === 2 ? 30 : 24 }));
  XLSX.utils.book_append_sheet(workbook, sheet, '客户办理规则');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['填写说明'],
    ['客户UUID为唯一识别依据，请勿修改；客户编码和名称仅供核对，不参与匹配。'],
    ['模板预置当前筛选范围全部客户和已有配置；可删除无需修改的客户行。'],
    ['空白单元格表示保留已有配置，不能通过留空批量清除；清除配置请使用页面。'],
    ['是/否字段填写“是”或“否”；薪资账单日填写1至28的整数；邮箱用分号分隔。'],
    ['薪资提醒固定为账单日前3/2/1个工作日，不提供修改列；办结邮件固定覆盖入职、离职、薪资。'],
    ['附件统一使用共享邮箱；账单日、共享邮箱和办结邮件收件人须由人工配置。'],
    ['每个客户UUID仅允许一行，不支持公式；导入后查看逐行成功和失败明细。'],
    ['入职发薪月份填写“当月”或“次月”，发薪日填写1至31；是否需要工资单填写“是”或“否”。'],
    ['薪资发薪周期填写“当月发当月”或“当月发上月”；已购产品、服务费、押金为选填提醒信息。'],
    ['缴纳地与商社规则通过页面维护；本模板不修改或清除这些城市规则。'],
    ['入职规则非空时需要配置员工类型；只维护薪资业务可以保留入职规则为空。'],
  ]), '填写说明');
  return workbook;
}

function parseTemplateRow(row: Record<string, unknown>): SaveCustomerRuleInput {
  const rule: SaveCustomerRuleInput = {};
  const read = (label: string, boolean = false) => {
    try { return cellToValue(row[label], boolean); }
    catch (error) { throw new Error(label + '：' + (error as Error).message); }
  };
  const onboardingDefaults: Record<string, RuleValue> = {};
  for (const [code, label] of ONBOARDING_TEMPLATE_FIELDS) {
    const value = read(label, BOOLEAN_ONBOARDING_FIELDS.has(code));
    if (value === undefined) continue;
    if (code === 'payroll_cycle' && !['当月', '次月'].includes(String(value))) throw new Error(`${label}：请填写“当月”或“次月”`);
    if (code === 'payroll_date' && (!/^\d{1,2}$/.test(String(value)) || Number(value) < 1 || Number(value) > 31)) throw new Error(`${label}：请输入1至31的整数`);
    if (code === 'need_payroll_slip' && !['是', '否'].includes(String(value))) throw new Error(`${label}：请填写“是”或“否”`);
    onboardingDefaults[code] = ['payroll_cycle', 'payroll_date', 'need_payroll_slip', 'purchased_products', 'service_fee', 'deposit'].includes(code) ? String(value) : value;
  }
  if (Object.keys(onboardingDefaults).length) rule.onboardingDefaults = onboardingDefaults;
  const resignationDefaults: Record<string, RuleValue> = {};
  for (const [code, label] of RESIGNATION_TEMPLATE_FIELDS) {
    const value = read(label);
    if (value !== undefined) resignationDefaults[code] = value;
  }
  if (Object.keys(resignationDefaults).length) rule.resignationDefaults = resignationDefaults;
  const billingDay = read('薪资·每月账单日');
  const reminderEnabled = read('薪资·启用提醒', true);
  const payrollMonthMode = read('薪资·发薪周期');
  if (billingDay !== undefined || reminderEnabled !== undefined || payrollMonthMode !== undefined) {
    rule.salaryRules = { reminderWorkdayOffsets: [3, 2, 1] };
    if (billingDay !== undefined) {
      const day = Number(billingDay);
      if (!Number.isInteger(day) || day < 1 || day > 28) throw new Error('薪资·每月账单日：请输入1至28的整数');
      rule.salaryRules.billingDay = day;
    }
    if (reminderEnabled !== undefined) rule.salaryRules.reminderEnabled = reminderEnabled as boolean;
    if (payrollMonthMode !== undefined) {
      if (!['当月发当月', '当月发上月', 'current', 'previous'].includes(String(payrollMonthMode))) throw new Error('薪资·发薪周期：请填写“当月发当月”或“当月发上月”');
      rule.salaryRules.payrollMonthMode = ['当月发当月', 'current'].includes(String(payrollMonthMode)) ? 'current' : 'previous';
    }
  }
  const mailbox = read('共享邮箱·地址');
  const routeKey = read('共享邮箱·路由标识');
  if (mailbox !== undefined || routeKey !== undefined) {
    rule.sharedEmailRules = {};
    if (mailbox !== undefined) rule.sharedEmailRules.mailbox = String(mailbox);
    if (routeKey !== undefined) rule.sharedEmailRules.routeKey = String(routeKey);
  }
  const enabled = read('办结邮件·启用', true);
  if (enabled !== undefined) rule.completionEmailEnabled = enabled as boolean;
  if (read('办结邮件·收件人') !== undefined) rule.completionEmailTo = splitValues(row['办结邮件·收件人']);
  if (read('办结邮件·抄送') !== undefined) rule.completionEmailCc = splitValues(row['办结邮件·抄送']);
  if (read('办结邮件·回复地址') !== undefined) rule.completionEmailReplyTo = String(row['办结邮件·回复地址']).trim();
  if (read('办结邮件·结果字段') !== undefined) rule.completionEmailFields = splitValues(row['办结邮件·结果字段']);
  if (Object.keys(rule).some((key) => key.startsWith('completionEmail'))) rule.completionEmailBusinessTypes = [...COMPLETE_BUSINESS_TYPES];
  const deadline = read('客户异议期限（天）');
  if (deadline !== undefined) {
    const days = Number(deadline);
    if (!Number.isInteger(days) || days < 0 || days > 30) throw new Error('客户异议期限：请输入0至30的整数');
    rule.objectionDeadlineDays = days;
  }
  const active = read('规则·启用', true);
  if (active !== undefined) rule.isActive = active as boolean;
  return rule;
}

export function parseRulesWorkbook(workbook: XLSX.WorkBook): SpreadsheetRuleRow[] {
  const sheet = workbook.Sheets['客户办理规则'] || workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet || !sheet['!ref']) throw new Error('Excel中没有办理规则数据');
  const range = XLSX.utils.decode_range(sheet['!ref']);
  if (range.e.r - range.s.r > 10000) throw new Error('一次最多导入10000行客户规则');
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', blankrows: true, raw: true });
  const headers = (grid[0] || []).map((value) => String(value).trim());
  if (!headers.includes('客户UUID') && !headers.includes('客户ID')) throw new Error('缺少客户UUID列，请下载办理规则模板');
  const known = new Set([...TEMPLATE_HEADERS, '客户ID']);
  const unknown = headers.filter((header) => header && !known.has(header));
  if (unknown.length) throw new Error('无法识别模板列：' + unknown.join('、'));
  if (headers.some((header, index) => header && headers.indexOf(header) !== index)) throw new Error('模板包含重复列名');
  const rows: SpreadsheetRuleRow[] = [];
  for (let index = 1; index < grid.length; index += 1) {
    const cells = grid[index];
    if (!cells.some((value) => String(value ?? '').trim() !== '')) continue;
    const row = Object.fromEntries(headers.map((header, column) => [header, cells[column]]));
    const item: SpreadsheetRuleRow = {
      rowNumber: range.s.r + index + 1, customerId: String(row['客户UUID'] || row['客户ID'] || '').trim().toLowerCase(),
      customerCode: String(row['客户编码'] || ''), customerName: String(row['客户名称'] || ''), rule: {},
    };
    try {
      if (!UUID_PATTERN.test(item.customerId)) throw new Error('客户UUID缺失或格式错误，不能使用客户编码或名称匹配');
      if (headers.some((_, column) => sheet[XLSX.utils.encode_cell({ r: range.s.r + index, c: range.s.c + column })]?.f)) throw new Error('不支持公式，请粘贴为值后重试');
      item.rule = parseTemplateRow(row);
      if (Object.keys(item.rule).length === 0) throw new Error('本行未填写办理规则，未作修改');
    } catch (error) { item.error = error instanceof Error ? error.message : '格式错误'; }
    rows.push(item);
  }
  const counts = new Map<string, number>();
  rows.forEach((row) => counts.set(row.customerId, (counts.get(row.customerId) || 0) + 1));
  rows.forEach((row) => { if (row.customerId && (counts.get(row.customerId) || 0) > 1) row.error = '客户UUID重复，请每个客户只保留一行'; });
  if (!rows.length) throw new Error('Excel中没有需要导入的客户规则');
  return rows;
}
