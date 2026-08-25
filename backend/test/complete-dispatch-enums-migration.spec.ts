import { CompleteDispatchEnums20260825001000 } from 'src/database/migrations/20260825001000-CompleteDispatchEnums';

describe('CompleteDispatchEnums20260825001000 migration', () => {
  it('adds missing enum values idempotently without touching business tables', async () => {
    const statements: string[] = [];
    const queryRunner = {
      query: jest.fn(async (sql: string) => {
        statements.push(String(sql).replace(/\s+/g, ' ').trim());
        return [];
      }),
    };

    await new CompleteDispatchEnums20260825001000().up(queryRunner as never);

    expect(statements).toHaveLength(3);
    expect(statements[0]).toContain("typname = 'exception_module_handlers_module_code_enum'");
    expect(statements[0]).toContain("e.enumlabel = 'payroll_bank_card'");
    expect(statements[0]).toContain("ALTER TYPE exception_module_handlers_module_code_enum ADD VALUE 'payroll_bank_card'");
    expect(statements[1]).toContain("e.enumlabel = 'in_service_certificate'");
    expect(statements[1]).toContain("ALTER TYPE exception_module_handlers_module_code_enum ADD VALUE 'in_service_certificate'");
    expect(statements[2]).toContain("typname = 'dispatch_strategy_enum'");
    expect(statements[2]).toContain("e.enumlabel = 'team_claim'");
    expect(statements[2]).toContain("ALTER TYPE dispatch_strategy_enum ADD VALUE 'team_claim'");
    expect(statements.join('\n')).not.toMatch(/\b(?:INSERT INTO|UPDATE|DELETE FROM)\s+(?:work_orders|dispatched_orders|users)\b/i);
  });

  it('does not attempt to remove enum values on rollback', async () => {
    await new CompleteDispatchEnums20260825001000().down();
  });
});
