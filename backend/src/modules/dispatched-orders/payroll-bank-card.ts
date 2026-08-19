export const PAYROLL_BANK_CARD_MODULE_CODE = 'payroll_bank_card';

export const PAYROLL_BANK_CARD_FIELDS = [
  'bank_name',
  'bank_account',
  'bank_location',
  'payroll_location',
] as const;

export const PAYROLL_BANK_CARD_VISIBLE_FIELDS = [
  'employee_name',
  'id_card_no',
  'need_payroll_slip',
  ...PAYROLL_BANK_CARD_FIELDS,
  'branch_code',
] as const;

export type PayrollBankCardField = (typeof PAYROLL_BANK_CARD_FIELDS)[number];

export const PAYROLL_BANK_CARD_FIELD_NAMES: Record<PayrollBankCardField, string> = {
  bank_name: '开户银行',
  bank_account: '银行卡号',
  bank_location: '开户地',
  payroll_location: '发薪地',
};

const NO_TOKENS = new Set(['否', 'no', 'n', 'false', '0', '2', '2否', '2.否', '不需要', '无需']);
const YES_TOKENS = new Set(['是', 'yes', 'y', 'true', '1', '1是', '1.是', '需要', '需', '生成']);

export function normalizeNeedPayrollSlip(value: unknown): '是' | '否' | null {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (YES_TOKENS.has(normalized)) return '是';
  if (NO_TOKENS.has(normalized)) return '否';
  return null;
}

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function isNo(value: unknown): boolean {
  if (typeof value === 'boolean') return !value;
  return NO_TOKENS.has(String(value ?? '').trim().toLowerCase());
}

export function getMissingPayrollBankCardFields(
  extraData: Record<string, unknown> | null | undefined,
): PayrollBankCardField[] {
  const data = extraData ?? {};
  return PAYROLL_BANK_CARD_FIELDS.filter((fieldCode) => !hasValue(data[fieldCode]));
}

/**
 * Bank details must be complete on the creator's order when no centralized
 * onboarding-material collection child is expected.
 */
export function requiresCreatorPayrollBankCardFields(
  extraData: Record<string, unknown> | null | undefined,
): boolean {
  const data = extraData ?? {};
  return isNo(data.need_onboarding_contact);
}

export function getCreatorRequiredMissingPayrollBankCardFields(
  extraData: Record<string, unknown> | null | undefined,
): PayrollBankCardField[] {
  if (!requiresCreatorPayrollBankCardFields(extraData)) {
    return [];
  }
  return getMissingPayrollBankCardFields(extraData);
}

export function isPayrollBankCardReady(
  extraData: Record<string, unknown> | null | undefined,
): boolean {
  return getMissingPayrollBankCardFields(extraData).length === 0;
}
