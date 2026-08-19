import { describe, expect, it } from 'vitest';
import { normalizePayrollSlipDisplay } from './payrollBankCard';

describe('payroll bank-card display normalization', () => {
  it.each([
    ['是', '是'],
    ['1.是', '是'],
    [true, '是'],
    ['需要', '是'],
    ['否', '否'],
    ['2.否', '否'],
    [false, '否'],
    ['无需', '否'],
    ['', '-'],
    [null, '-'],
  ])('normalizes %p to %s', (input, expected) => {
    expect(normalizePayrollSlipDisplay(input)).toBe(expected);
  });
});
