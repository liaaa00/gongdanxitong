import { UnassignPayrollBankCardRole20260812001000 } from 'src/database/migrations/20260812001000-UnassignPayrollBankCardRole';

describe('UnassignPayrollBankCardRole20260812001000', () => {
  it('removes guessed role configuration without touching business data', async () => {
    const statements: string[] = [];
    const queryMock = jest.fn<Promise<unknown[]>, [string, unknown[]?]>(async (sql: string) => {
      statements.push(String(sql).replace(/\s+/g, ' ').trim());
      if (String(sql).includes('FROM system_settings')) {
        return [{ value: JSON.stringify({ roles: {
          admin: ['route.onboarding_payroll_bank_card', 'module.payroll_bank_card.manage'],
          data_entry_leader: ['route.onboarding_payroll_bank_card', 'module.payroll_bank_card.manage', 'module.data_entry.manage'],
        } }) }];
      }
      return [];
    });
    const queryRunner = { query: queryMock };

    await new UnassignPayrollBankCardRole20260812001000().up(queryRunner as never);

    const sql = statements.join('\n');
    for (const table of ['field_permissions', 'module_handlers', 'module_supervisors', 'system_settings']) {
      expect(sql).toContain(table);
    }
    expect(sql).toContain("role.code <> 'admin'");
    expect(sql).toContain("module_code = 'payroll_bank_card'");
    expect(sql).not.toMatch(/(?:INSERT INTO|UPDATE|DELETE FROM) work_orders\b/i);
    expect(sql).not.toMatch(/(?:INSERT INTO|UPDATE|DELETE FROM) dispatched_orders\b/i);
    expect(sql).not.toMatch(/(?:INSERT INTO|UPDATE|DELETE FROM) customers\b/i);
    expect(sql).not.toMatch(/(?:INSERT INTO|UPDATE|DELETE FROM) users\b/i);

    const updateCall = queryMock.mock.calls.find(([statement, params]) => (
      String(statement).includes('UPDATE system_settings') && Array.isArray(params)
    ));
    expect(updateCall).toBeTruthy();
    const stored = JSON.parse(String(updateCall?.[1]?.[0]));
    expect(stored.roles.admin).toContain('module.payroll_bank_card.manage');
    expect(stored.roles.data_entry_leader).toEqual(['module.data_entry.manage']);
  });
});
