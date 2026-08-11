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
  ...PAYROLL_BANK_CARD_FIELDS,
  'branch_code',
] as const;

export type PayrollBankCardField = (typeof PAYROLL_BANK_CARD_FIELDS)[number];

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

export function getMissingPayrollBankCardFields(
  extraData: Record<string, unknown> | null | undefined,
): PayrollBankCardField[] {
  const data = extraData ?? {};
  return PAYROLL_BANK_CARD_FIELDS.filter((fieldCode) => !hasValue(data[fieldCode]));
}

export function isPayrollBankCardReady(
  extraData: Record<string, unknown> | null | undefined,
): boolean {
  return getMissingPayrollBankCardFields(extraData).length === 0;
}
