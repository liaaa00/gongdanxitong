import { AlwaysCreatePayrollBankCards20260818001000 } from 'src/database/migrations/20260818001000-AlwaysCreatePayrollBankCards';
import { normalizeNeedPayrollSlip } from 'src/modules/dispatched-orders/payroll-bank-card';

describe('AlwaysCreatePayrollBankCards20260818001000', () => {
  it.each([
    ['是', '是'], ['1.是', '是'], [true, '是'],
    ['否', '否'], ['2.否', '否'], [false, '否'],
    ['', null], [null, null],
  ])('normalizes payroll-slip flag %p', (input, expected) => {
    expect(normalizeNeedPayrollSlip(input)).toBe(expected);
  });

  it('updates only active onboarding payroll dispatch rules', async () => {
    const statements: string[] = [];
    const query = jest.fn(async (sql: string) => {
      statements.push(String(sql).replace(/\s+/g, ' ').trim());
      return [];
    });

    await new AlwaysCreatePayrollBankCards20260818001000().up({ query } as never);

    const sql = statements.join('\n');
    expect(sql).toContain('UPDATE dispatch_rules');
    expect(sql).toContain('trigger_conditions = NULL');
    expect(sql).toContain("order_type = 'onboarding'");
    expect(sql).toContain("target_module = 'payroll_bank_card'");
    expect(sql).not.toMatch(/(?:INSERT INTO|UPDATE|DELETE FROM) (?:work_orders|dispatched_orders|customers|users)\b/i);
  });
});
