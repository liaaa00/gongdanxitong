const YES_TOKENS = new Set(['是', 'yes', 'y', 'true', '1', '1是', '1.是', '需要', '需', '生成']);
const NO_TOKENS = new Set(['否', 'no', 'n', 'false', '0', '2', '2否', '2.否', '不需要', '无需']);

export type PayrollSlipDisplay = '是' | '否' | '-';

export function normalizePayrollSlipDisplay(value: unknown): PayrollSlipDisplay {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (YES_TOKENS.has(normalized)) return '是';
  if (NO_TOKENS.has(normalized)) return '否';
  return '-';
}
