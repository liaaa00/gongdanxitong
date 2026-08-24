import { AddBeilunTotalPayrollLocation20260824001000 } from 'src/database/migrations/20260824001000-AddBeilunTotalPayrollLocation';

describe('AddBeilunTotalPayrollLocation20260824001000 migration', () => {
  it('appends the option idempotently and updates the field description', async () => {
    const statements: string[] = [];
    const query = jest.fn(async (sql: string) => {
      statements.push(String(sql).replace(/\s+/g, ' ').trim());
      return [];
    });

    await new AddBeilunTotalPayrollLocation20260824001000().up({ query } as never);

    const sql = statements.join('\n');
    expect(sql).toContain('北仑总发薪');
    expect(sql).toContain('COALESCE(dropdown_options, \'[]\'::jsonb)');
    expect(sql).toContain('||');
    expect(sql).toContain('67项发薪地');
  });

  it('removes only the added option on rollback', async () => {
    const statements: string[] = [];
    const query = jest.fn(async (sql: string) => {
      statements.push(String(sql).replace(/\s+/g, ' ').trim());
      return [];
    });

    await new AddBeilunTotalPayrollLocation20260824001000().down({ query } as never);

    const sql = statements.join('\n');
    expect(sql).toContain("- '北仑总发薪'");
    expect(sql).toContain('66项发薪地');
  });
});
