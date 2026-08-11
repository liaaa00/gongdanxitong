import { AddPayrollBankCardWorkflow20260811001000 } from 'src/database/migrations/20260811001000-AddPayrollBankCardWorkflow';

describe('AddPayrollBankCardWorkflow20260811001000', () => {
  it('upserts only configuration tables and leaves business orders untouched', async () => {
    const statements: string[] = [];
    const queryRunner = {
      query: jest.fn(async (sql: string) => {
        statements.push(String(sql).replace(/\s+/g, ' ').trim());
        return [];
      }),
    };

    await new AddPayrollBankCardWorkflow20260811001000().up(queryRunner as never);

    const sql = statements.join('\n');
    for (const table of [
      'field_configs',
      'import_template_fields',
      'work_order_modules',
      'module_fields',
      'action_configs',
      'dispatch_rules',
      'field_permissions',
      'field_supplement_rules',
      'export_templates',
      'detail_view_templates',
      'system_settings',
    ]) {
      expect(sql).toContain(table);
    }

    expect(sql).toContain('need_payroll_slip');
    expect(sql).toContain('payroll_bank_card');
    expect(sql).toContain('resignation_cert');
    expect(sql).not.toMatch(/(?:INSERT INTO|UPDATE|DELETE FROM) work_orders\b/i);
    expect(sql).not.toMatch(/(?:INSERT INTO|UPDATE|DELETE FROM) dispatched_orders\b/i);
    expect(sql).not.toMatch(/(?:INSERT INTO|UPDATE|DELETE FROM) users\b/i);
  });
});
