export interface ReadableDiffField {
  field_code: string;
  field_name: string;
  old_value?: unknown;
  new_value?: unknown;
  fieldCode: string;
  fieldName: string;
  oldValue?: unknown;
  newValue?: unknown;
  field: string;
  fieldLabel: string;
  field_label: string;
  before?: unknown;
  after?: unknown;
  oldText: string;
  newText: string;
  old_text: string;
  new_text: string;
}

export interface FieldDiffLike {
  field?: unknown;
  fieldCode?: unknown;
  field_code?: unknown;
  fieldName?: unknown;
  field_name?: unknown;
  fieldLabel?: unknown;
  field_label?: unknown;
  before?: unknown;
  after?: unknown;
  oldValue?: unknown;
  old_value?: unknown;
  newValue?: unknown;
  new_value?: unknown;
  oldText?: unknown;
  old_text?: unknown;
  newText?: unknown;
  new_text?: unknown;
}

export const FALLBACK_FIELD_LABELS: Record<string, string> = {
  customer_name: '客户名称',
  customer_code: '客户代码',
  outsource_type: '外包类型',
  position: '岗位',
  employee_name: '姓名',
  id_card_no: '身份证号码（护照）',
  gender: '性别',
  birth_date: '出生日期',
  age: '年龄',
  household_type: '户籍性质',
  ethnicity: '民族',
  mobile: '移动电话',
  email: '电子邮件',
  current_address: '现住地址',
  household_address: '户籍地址',
  contract_term_type: '合同期限形式',
  contract_term: '合同期限',
  contract_start_date: '合同开始日期',
  contract_end_date: '合同终止日期',
  probation_start_date: '试用期开始日期',
  probation_months: '试用期（月）',
  probation_end_date: '试用期结束日期',
  work_city: '工作城市',
  work_hour_system: '工时制',
  work_cycle: '工作制周期',
  salary_form: '工资形式',
  need_company_payroll: '是否企服发薪',
  need_onboarding_contact: '入职材料是否需要集约收集',
  base_salary: '基本工资',
  other_salary: '其他工资',
  probation_salary: '试用期工资',
  payroll_cycle: '发薪周期',
  payroll_date: '发薪日期',
  social_location: '参保地',
  start_month: '起始月',
  social_base: '社保基数',
  fund_base: '公积金基数',
  fund_ratio: '公积金比例',
  bank_name: '开户银行信息',
  bank_account: '银行借记卡账号',
  remark: '备注',
  business_mode: '业务模式',
  employee_type: '人员类型',
  need_company_contract: '是否企服发起劳动合同',
  contract_subject: '劳动合同主体',
  contract_template: '劳动合同模板',
  need_contract_urge: '劳动合同签署是否需要催办员工',
  contract_feedback: '劳动合同新签反馈',
  onboarding_feedback: '入职联系反馈',
  payroll_location: '发薪地',
  social_urge: '社保公积金未办是否需要催办',
  special_remark: '特殊备注',
  data_entry_feedback: '增员报岗录入反馈',
  need_renewal_urge: '续签是否需催办员工',
  renewal_feedback: '劳动合同续签反馈',
  resignation_contact_feedback: '离职材料收集反馈',
  resignation_cert_status: '离职材料收集状态',
  benefit_review_status: '材料审核状态',
  benefit_result: '申报结果',
};

export const FALLBACK_MODULE_LABELS: Record<string, string> = {
  onboarding_contact: '入职联系',
  contract: '劳动合同新签',
  data_entry: '增员报岗录入',
  social_insurance: '社保公积金增员',
  renewal_contract: '劳动合同续签',
  benefit_apply: '待遇申报',
  social_insurance_change: '社保公积金变更',
  resignation_contact: '离职材料收集',
  data_entry_resign: '减员报岗录入',
  resignation_social_insurance: '社保公积金减员',
  resignation_cert: '离职材料收集',
};

const INTERNAL_KEY_PATTERN = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g;

export function fallbackBusinessLabel(code: string | null | undefined): string | undefined {
  if (!code) return undefined;
  return FALLBACK_FIELD_LABELS[code] ?? FALLBACK_MODULE_LABELS[code];
}

export function isInternalKey(value: string): boolean {
  return /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/.test(value);
}

export function resolveBusinessLabel(code: string, labels: Map<string, string> = new Map()): string {
  return labels.get(code) ?? fallbackBusinessLabel(code) ?? (isInternalKey(code) ? '业务字段' : code);
}

export function extractInternalKeysFromText(text: string | null | undefined): string[] {
  if (!text) return [];
  return Array.from(new Set(text.match(INTERNAL_KEY_PATTERN) ?? []));
}

export function extractInternalKeysFromPayload(payload: Record<string, unknown> | null | undefined): string[] {
  if (!payload) return [];
  const keys = new Set<string>();
  for (const key of ['fieldCode', 'field_code', 'moduleCode', 'module_code']) {
    const value = payload[key];
    if (typeof value === 'string' && isInternalKey(value)) keys.add(value);
  }
  for (const key of ['fieldCodes', 'field_codes', 'fields', 'modules']) {
    const value = payload[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string' && isInternalKey(item)) keys.add(item);
      }
    }
  }
  for (const field of normalizeReadableDiffFields(payload, new Map())) {
    if (isInternalKey(field.field_code)) keys.add(field.field_code);
  }
  return Array.from(keys);
}

export function localizeInternalKeysInText(text: string, labels: Map<string, string> = new Map()): string {
  return text.replace(INTERNAL_KEY_PATTERN, (token) => resolveBusinessLabel(token, labels));
}

export function normalizeReadableDiffFields(
  payload: Record<string, unknown> | null | undefined,
  labels: Map<string, string> = new Map(),
): ReadableDiffField[] {
  if (!payload) return [];
  const rawDiff = Array.isArray(payload.diffFields)
    ? payload.diffFields
    : Array.isArray(payload.diff_fields)
      ? payload.diff_fields
      : Array.isArray(payload.diff)
        ? payload.diff
        : payload.diff && typeof payload.diff === 'object'
          ? [payload.diff]
          : undefined;

  if (rawDiff) {
    return rawDiff
      .map((item) => normalizeReadableDiffField(item as FieldDiffLike, labels))
      .filter((item): item is ReadableDiffField => Boolean(item));
  }

  const fieldCode = readString(payload.fieldCode) ?? readString(payload.field_code);
  if (!fieldCode) return [];
  return [toReadableDiffField({
    fieldCode,
    fieldName: readString(payload.fieldName) ?? readString(payload.field_name) ?? readString(payload.fieldLabel) ?? readString(payload.field_label),
    oldValue: payload.oldValue ?? payload.old_value ?? payload.before,
    newValue: payload.newValue ?? payload.new_value ?? payload.after,
  }, labels)];
}

export function normalizeReadableDiffField(item: FieldDiffLike, labels: Map<string, string> = new Map()): ReadableDiffField | null {
  const fieldCode = readString(item.fieldCode) ?? readString(item.field_code) ?? readString(item.field);
  if (!fieldCode) return null;
  return toReadableDiffField({
    fieldCode,
    fieldName: readString(item.fieldName) ?? readString(item.field_name) ?? readString(item.fieldLabel) ?? readString(item.field_label),
    oldValue: item.oldValue ?? item.old_value ?? item.before,
    newValue: item.newValue ?? item.new_value ?? item.after,
  }, labels);
}

export function toReadableDiffField(input: {
  fieldCode: string;
  fieldName?: string;
  oldValue?: unknown;
  newValue?: unknown;
}, labels: Map<string, string> = new Map()): ReadableDiffField {
  const configuredName = labels.get(input.fieldCode);
  const fieldName = configuredName ?? (input.fieldName && !isInternalKey(input.fieldName)
    ? input.fieldName
    : resolveBusinessLabel(input.fieldCode, labels));
  const oldText = formatNotificationValue(input.oldValue);
  const newText = formatNotificationValue(input.newValue);
  return {
    field_code: input.fieldCode,
    field_name: fieldName,
    old_value: input.oldValue,
    new_value: input.newValue,
    fieldCode: input.fieldCode,
    fieldName,
    oldValue: input.oldValue,
    newValue: input.newValue,
    field: input.fieldCode,
    fieldLabel: fieldName,
    field_label: fieldName,
    before: input.oldValue,
    after: input.newValue,
    oldText,
    newText,
    old_text: oldText,
    new_text: newText,
  };
}

export function buildDiffSummary(diffFields: ReadableDiffField[]): string | undefined {
  if (diffFields.length === 0) return undefined;
  return diffFields.map((field) => buildSingleDiffSummary(field)).join('；');
}

export function buildReadableFieldChangeContent(input: {
  actorName?: string;
  objectName?: string;
  diffFields: ReadableDiffField[];
  action?: string;
}): string | null {
  if (input.diffFields.length === 0) return null;
  const actorName = input.actorName?.trim() || '操作人';
  const objectName = input.objectName?.trim() || '工单字段';
  const action = input.action?.trim() || '修改了';
  const summary = buildDiffSummary(input.diffFields);
  if (!summary) return null;
  return `${actorName} ${action}【${objectName}】：${summary}`;
}

export function formatNotificationValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '空';
  if (value === 'filled') return '已补充';
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => formatNotificationValue(item)).join('、');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function buildSingleDiffSummary(field: ReadableDiffField): string {
  const fieldLabel = `【${field.field_name}】`;
  const hasOld = field.old_value !== undefined;
  const hasNew = field.new_value !== undefined;
  if (hasOld || hasNew) {
    return `${fieldLabel}由【${formatNotificationValue(field.old_value)}】改为【${formatNotificationValue(field.new_value)}】`;
  }
  return fieldLabel;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}
