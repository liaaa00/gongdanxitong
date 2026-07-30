export type SocialInsuranceResultValue = '是' | '否';
export type SocialInsuranceFeedbackModuleCode = 'social_insurance' | 'resignation_social_insurance';

export type SocialInsuranceFeedbackFieldCode =
  | 'social_insurance_result'
  | 'medical_insurance_result'
  | 'housing_fund_result'
  | 'social_insurance_remark';

export interface SocialInsuranceFeedbackField {
  code: SocialInsuranceFeedbackFieldCode;
  name: string;
  type: 'dropdown' | 'textarea';
}

export const SOCIAL_INSURANCE_FEEDBACK_MODULE_CODES: SocialInsuranceFeedbackModuleCode[] = [
  'social_insurance',
  'resignation_social_insurance',
];

export const SOCIAL_INSURANCE_RESULT_COMPLETED: SocialInsuranceResultValue = '是';
export const SOCIAL_INSURANCE_RESULT_NOT_COMPLETED: SocialInsuranceResultValue = '否';

export const SOCIAL_INSURANCE_RESULT_OPTIONS: Array<{ label: SocialInsuranceResultValue; value: SocialInsuranceResultValue }> = [
  { label: '是', value: SOCIAL_INSURANCE_RESULT_COMPLETED },
  { label: '否', value: SOCIAL_INSURANCE_RESULT_NOT_COMPLETED },
];

export const SOCIAL_INSURANCE_FEEDBACK_FIELDS: SocialInsuranceFeedbackField[] = [
  { code: 'social_insurance_result', name: '社保是否办结', type: 'dropdown' },
  { code: 'medical_insurance_result', name: '医保是否办结', type: 'dropdown' },
  { code: 'housing_fund_result', name: '公积金是否办结', type: 'dropdown' },
  { code: 'social_insurance_remark', name: '社保公积金办理备注', type: 'textarea' },
];

export const SOCIAL_INSURANCE_FEEDBACK_FIELD_CODES: SocialInsuranceFeedbackFieldCode[] = SOCIAL_INSURANCE_FEEDBACK_FIELDS.map((field) => field.code);
export const SOCIAL_INSURANCE_RESULT_FIELD_CODES: SocialInsuranceFeedbackFieldCode[] = SOCIAL_INSURANCE_FEEDBACK_FIELDS
  .filter((field) => field.type === 'dropdown')
  .map((field) => field.code);

export const LEGACY_SOCIAL_INSURANCE_FEEDBACK_FIELD_ALIASES: Record<string, SocialInsuranceFeedbackFieldCode> = {
  social_security_result: 'social_insurance_result',
  social_security_remark: 'social_insurance_remark',
  medical_insurance_remark: 'social_insurance_remark',
  housing_fund_remark: 'social_insurance_remark',
};

export const LEGACY_COMPLETED_VALUES = ['已完成', '已办结'];
export const LEGACY_NOT_COMPLETED_VALUES = ['未完成', '未办', '办理中'];

export function isSocialInsuranceFeedbackModule(moduleCode?: string | null): moduleCode is SocialInsuranceFeedbackModuleCode {
  return SOCIAL_INSURANCE_FEEDBACK_MODULE_CODES.includes(moduleCode as SocialInsuranceFeedbackModuleCode);
}

export function normalizeSocialInsuranceFeedbackFieldCode(code: string): SocialInsuranceFeedbackFieldCode | string {
  return LEGACY_SOCIAL_INSURANCE_FEEDBACK_FIELD_ALIASES[code] || code;
}

export function normalizeSocialInsuranceResultValue(value: unknown): string {
  const text = String(value ?? '').trim();
  if (LEGACY_COMPLETED_VALUES.includes(text)) return SOCIAL_INSURANCE_RESULT_COMPLETED;
  if (LEGACY_NOT_COMPLETED_VALUES.includes(text)) return SOCIAL_INSURANCE_RESULT_NOT_COMPLETED;
  return text;
}

export function getSocialInsuranceFeedbackFieldName(code: string): string | undefined {
  const normalizedCode = normalizeSocialInsuranceFeedbackFieldCode(code);
  return SOCIAL_INSURANCE_FEEDBACK_FIELDS.find((field) => field.code === normalizedCode)?.name;
}

export function isSocialInsuranceFullyCompleted(extraData?: Record<string, unknown> | null): boolean {
  if (!extraData) return false;
  return SOCIAL_INSURANCE_RESULT_FIELD_CODES.every((code) => normalizeSocialInsuranceResultValue(extraData[code]) === SOCIAL_INSURANCE_RESULT_COMPLETED);
}
