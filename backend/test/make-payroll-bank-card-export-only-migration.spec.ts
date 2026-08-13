import { MakePayrollBankCardExportOnly20260812002000 } from 'src/database/migrations/20260812002000-MakePayrollBankCardExportOnly';

describe('MakePayrollBankCardExportOnly20260812002000', () => {
  it('disables payroll workflow configuration without touching business data', async () => {
    const statements: string[] = [];
    const query = jest.fn(async (sql: string) => {
      statements.push(String(sql).replace(/\s+/g, ' ').trim());
      return [];
    });

    await new MakePayrollBankCardExportOnly20260812002000().up({ query } as never);

    const sql = statements.join('\n');
    for (const table of ['work_order_modules', 'action_configs', 'module_handlers', 'module_supervisors']) {
      expect(sql).toContain(table);
    }
    expect(sql).toContain("module_type = 'export_list'");
    expect(sql).toContain("module_code = 'payroll_bank_card'");
    expect(sql).toContain('is_active = false');
    expect(sql).not.toMatch(/(?:INSERT INTO|UPDATE|DELETE FROM) work_orders\b/i);
    expect(sql).not.toMatch(/(?:INSERT INTO|UPDATE|DELETE FROM) dispatched_orders\b/i);
    expect(sql).not.toMatch(/(?:INSERT INTO|UPDATE|DELETE FROM) customers\b/i);
    expect(sql).not.toMatch(/(?:INSERT INTO|UPDATE|DELETE FROM) users\b/i);
  });
});
