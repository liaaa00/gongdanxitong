import { FieldConfig, FieldType, OrderType } from 'src/entities';
import { MappingSuggestion } from './types';

const INCREASE_SHEET_NAME = '参保申请单';
const DECREASE_SHEET_NAME = '停保申请单';

const INCREASE_REQUIRED_FIELDS = new Set([
  'customer_name',
  'employee_name',
  'id_card_no',
  'province',
  'city',
  'payment_institution',
  'contract_start_date',
  'contract_end_date',
]);

const DECREASE_REQUIRED_FIELDS = new Set([
  'customer_name',
  'employee_name',
  'id_card_no',
  'province',
  'city',
  'payment_institution',
  'last_work_date',
]);

const NUMBER_FIELDS = new Set([
  'social_base',
  'pension_base',
  'medical_base',
  'unemployment_base',
  'injury_base',
  'maternity_base',
  'critical_illness_base',
  'disability_base',
  'fund_base',
]);

const DATE_FIELDS = new Set([
  'start_month',
  'fund_start_month',
  'contract_start_date',
  'contract_end_date',
  'last_work_date',
  'expected_last_work_date',
  'dispatch_date',
  'social_stop_month',
  'fund_stop_month',
]);

const INCREASE_FIELD_NAMES: Record<string, string> = {
  insured_unit: '参保单位',
  customer_name: '客户/项目名称',
  employee_name: '员工姓名',
  id_card_no: '身份证号',
  province: '参保省份',
  city: '参保城市',
  social_pay_region: '参保地（福利地）',
  work_location: '工作地点',
  payment_institution: '社保缴纳机构',
  fund_payment_institution: '公积金缴纳机构',
  start_month: '社保生效月份',
  fund_start_month: '公积金生效月份',
  social_base: '综合缴纳基数',
  pension_base: '养老缴纳基数',
  medical_base: '医疗缴纳基数',
  unemployment_base: '失业缴纳基数',
  injury_base: '工伤缴纳基数',
  maternity_base: '生育缴纳基数',
  critical_illness_base: '大病缴纳基数',
  disability_base: '残保金缴纳基数',
  fund_base: '公积金基数',
  mobile: '手机',
  email: '邮箱',
  ethnicity: '民族',
  education: '学历',
  current_address: '现居住地址',
  household_type: '户籍性质',
  household_address: '户籍地址',
  contract_subject: '合同主体',
  contract_start_date: '合同开始日期',
  contract_end_date: '合同截止日期',
  applicant: '申报人',
  dispatch_date: '派单日期',
  remark: '申请备注',
  employee_no: '工号',
  organization_location: '组织地点',
  job_level: '职级',
  is_management_trainee: '是否管培生',
  province_order_action_type: '参保类型',
  entry_date: '入职时间',
  old_fund_plan_name: '原公积金方案名称',
  new_fund_plan_name: '现公积金方案名称',
};

const DECREASE_FIELD_NAMES: Record<string, string> = {
  insured_unit: '参保单位',
  customer_name: '客户/项目名称',
  employee_name: '员工姓名',
  id_card_no: '身份证号',
  province: '参保省份',
  city: '参保城市',
  social_pay_region: '参保地（福利地）',
  work_location: '工作地点',
  payment_institution: '社保缴纳机构',
  fund_payment_institution: '公积金缴纳机构',
  social_stop_month: '社保最后缴纳月份',
  fund_stop_month: '公积金最后缴纳月份',
  last_work_date: '最后工作日',
  expected_last_work_date: '预计最后工作日',
  resignation_reason: '离职原因',
  applicant: '申报人',
  dispatch_date: '派单日期',
  remark: '申请备注',
  employee_no: '工号',
  job_level: '职级',
  is_management_trainee: '是否管培生',
  province_order_action_type: '停保类型',
};

const INCREASE_HEADER_MAPPING: Record<string, string> = {
  参保单位: 'insured_unit',
  参保机构名称: 'insured_unit',
  单位名称: 'insured_unit',
  标签: 'customer_name',
  员工姓名: 'employee_name',
  身份证号: 'id_card_no',
  福利地: 'social_pay_region',
  工作地点: 'work_location',
  社保缴纳机构: 'payment_institution',
  公积金缴纳机构: 'fund_payment_institution',
  社保生效月份: 'start_month',
  公积金生效月份: 'fund_start_month',
  综合缴纳基数: 'social_base',
  养老缴纳基数: 'pension_base',
  医疗缴纳基数: 'medical_base',
  失业缴纳基数: 'unemployment_base',
  工伤缴纳基数: 'injury_base',
  生育缴纳基数: 'maternity_base',
  大病缴纳基数: 'critical_illness_base',
  残保金缴纳基数: 'disability_base',
  公积金基数: 'fund_base',
  手机: 'mobile',
  邮箱: 'email',
  民族: 'ethnicity',
  学历: 'education',
  现居住地址: 'current_address',
  户籍性质: 'household_type',
  户籍地址: 'household_address',
  合同主体: 'contract_subject',
  合同开始日期: 'contract_start_date',
  合同截止日期: 'contract_end_date',
  申报人: 'applicant',
  派单日期: 'dispatch_date',
  申请备注: 'remark',
  工号: 'employee_no',
  组织地点: 'organization_location',
  职级: 'job_level',
  是否管培生: 'is_management_trainee',
  参保类型: 'province_order_action_type',
  入职时间: 'entry_date',
  原公积金方案名称: 'old_fund_plan_name',
  现公积金方案名称: 'new_fund_plan_name',
};

const DECREASE_HEADER_MAPPING: Record<string, string> = {
  参保单位: 'insured_unit',
  参保机构名称: 'insured_unit',
  单位名称: 'insured_unit',
  标签: 'customer_name',
  员工姓名: 'employee_name',
  身份证号: 'id_card_no',
  福利地: 'social_pay_region',
  工作地点: 'work_location',
  社保缴纳机构: 'payment_institution',
  公积金缴纳机构: 'fund_payment_institution',
  社保最后缴纳月份: 'social_stop_month',
  公积金最后缴纳月份: 'fund_stop_month',
  最后工作日: 'last_work_date',
  预计最后工作日: 'expected_last_work_date',
  离职原因: 'resignation_reason',
  申报人: 'applicant',
  派单日期: 'dispatch_date',
  申请备注: 'remark',
  工号: 'employee_no',
  职级: 'job_level',
  是否管培生: 'is_management_trainee',
  停保类型: 'province_order_action_type',
};

const PROVINCE_PATTERN = /^(北京|天津|上海|重庆|广东|安徽|黑龙江|湖北|江西|云南|吉林|江苏|山西|山东|陕西|辽宁|福建|湖南|河南|河北|贵州|四川|广西|甘肃|新疆|宁夏|海南|浙江|青海)(?:省|市|自治区|维吾尔自治区|回族自治区|壮族自治区)?$/;

export function isOutOfProvinceImportOrderType(orderType: OrderType): orderType is OrderType.OUT_OF_PROVINCE_INCREASE | OrderType.OUT_OF_PROVINCE_DECREASE {
  return orderType === OrderType.OUT_OF_PROVINCE_INCREASE || orderType === OrderType.OUT_OF_PROVINCE_DECREASE;
}

export function selectOutOfProvinceSheetName(orderType: OrderType): string | undefined {
  if (orderType === OrderType.OUT_OF_PROVINCE_INCREASE) return INCREASE_SHEET_NAME;
  if (orderType === OrderType.OUT_OF_PROVINCE_DECREASE) return DECREASE_SHEET_NAME;
  return undefined;
}

export function buildOutOfProvinceFieldConfigs(orderType: OrderType): FieldConfig[] {
  const names = orderType === OrderType.OUT_OF_PROVINCE_DECREASE ? DECREASE_FIELD_NAMES : INCREASE_FIELD_NAMES;
  const required = orderType === OrderType.OUT_OF_PROVINCE_DECREASE ? DECREASE_REQUIRED_FIELDS : INCREASE_REQUIRED_FIELDS;
  return Object.entries(names).map(([fieldCode, fieldName], index) => ({
    id: `out-of-province:${fieldCode}`,
    fieldCode,
    fieldName,
    fieldType: fieldTypeOf(fieldCode),
    isRequired: required.has(fieldCode),
    defaultRequired: required.has(fieldCode),
    conditionalRequired: null,
    validationRegex: fieldCode === 'id_card_no' ? '^[0-9Xx*]{6,18}$' : null,
    validationMsg: fieldCode === 'id_card_no' ? '身份证号格式错误' : null,
    dropdownOptions: null,
    collectionGroup: null,
    placeholder: null,
    helpText: null,
    orderType,
    businessContext: [orderType],
    displayOrder: index + 1,
    isActive: true,
    createdAt: new Date(0),
  } as FieldConfig));
}

export function suggestOutOfProvinceMapping(orderType: OrderType, headers: string[]): MappingSuggestion {
  const configured = orderType === OrderType.OUT_OF_PROVINCE_DECREASE ? DECREASE_HEADER_MAPPING : INCREASE_HEADER_MAPPING;
  const fields = buildOutOfProvinceFieldConfigs(orderType);
  const fieldCodes = new Set(fields.map((field) => field.fieldCode));
  const suggestion: Record<string, string> = {};
  const confidence: Record<string, number> = {};
  const unmatched: string[] = [];

  for (const header of headers) {
    const fieldCode = configured[header] ?? configured[normalizeHeader(header)];
    if (fieldCode && fieldCodes.has(fieldCode)) {
      suggestion[header] = fieldCode;
      confidence[header] = 1;
    } else if (!/^__col_\d+__$/.test(header)) {
      unmatched.push(header);
    }
  }

  const mappedFields = new Set(Object.values(suggestion));
  const missingRequired = fields
    .filter((field) => field.isRequired && !mappedFields.has(field.fieldCode) && !derivedOutOfProvinceField(field.fieldCode))
    .map((field) => field.fieldCode);

  return {
    suggestion,
    confidence,
    unmatched,
    missingRequired,
    modelUsed: 'fixed:out-of-province-cainiao',
    promptHash: headers.join('|'),
    localMatchedCount: Object.keys(suggestion).length,
    llmMatchedCount: 0,
  };
}

export function normalizeOutOfProvinceRow(row: Record<string, unknown>): Record<string, unknown> {
  const next = { ...row };
  const region = readText(next.social_pay_region) ?? readText(next.work_location);
  const parsed = parseProvinceCity(region);
  if (!readText(next.province) && parsed.province) next.province = parsed.province;
  if (!readText(next.city) && parsed.city) next.city = parsed.city;
  if (!readText(next.payment_institution) && readText(next.fund_payment_institution)) {
    next.payment_institution = readText(next.fund_payment_institution);
  }
  if ((next.social_base === null || next.social_base === undefined || next.social_base === '')
    && next.pension_base !== null && next.pension_base !== undefined && next.pension_base !== '') {
    // ponytail: 养老基数仅作为缺失社保基数的回退；省级差异出现后再配置化。
    next.social_base = next.pension_base;
  }
  next.insured_unit = readText(next.insured_unit)
    ?? readText(next.insuredUnit)
    ?? readText(next.social_location)
    ?? readText(next.socialLocation)
    ?? readText(next['参保机构名称'])
    ?? readText(next['参保单位'])
    ?? next.insured_unit;
  next.paymentInstitution = readText(next.paymentInstitution) ?? readText(next.payment_institution) ?? readText(next.fund_payment_institution) ?? next.paymentInstitution;
  next.contractStartDate = readText(next.contractStartDate) ?? readText(next.contract_start_date) ?? next.contractStartDate;
  next.contractEndDate = readText(next.contractEndDate) ?? readText(next.contract_end_date) ?? next.contractEndDate;
  next.lastWorkDate = readText(next.lastWorkDate) ?? readText(next.last_work_date) ?? next.lastWorkDate;
  return next;
}

function fieldTypeOf(fieldCode: string): FieldType {
  if (NUMBER_FIELDS.has(fieldCode)) return FieldType.NUMBER;
  if (DATE_FIELDS.has(fieldCode)) return FieldType.DATE;
  if (fieldCode === 'mobile') return FieldType.PHONE;
  if (fieldCode === 'email') return FieldType.EMAIL;
  return FieldType.TEXT;
}

function derivedOutOfProvinceField(fieldCode: string): boolean {
  return fieldCode === 'province' || fieldCode === 'city';
}

function normalizeHeader(value: string): string {
  return String(value ?? '').replace(/　/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseProvinceCity(value: string | undefined): { province?: string; city?: string } {
  if (!value) return {};
  const parts = value
    .split(/[\/／|｜,，\s-]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
  if (parts.length === 0) return {};
  const province = normalizeProvince(parts[0]);
  const city = parts[1]?.trim();
  return { province, city };
}

function normalizeProvince(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  const match = trimmed.match(PROVINCE_PATTERN);
  if (!match) return trimmed.replace(/省$|市$|自治区$|维吾尔自治区$|回族自治区$|壮族自治区$/g, '');
  return match[1];
}

function readText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}
