import { RepairInServiceWorkflowSnapshots20260817003000 } from 'src/database/migrations/20260817003000-RepairInServiceWorkflowSnapshots';

describe('RepairInServiceWorkflowSnapshots20260817003000', () => {
  it('creates both scope copies and repairs only legacy copied snapshots', async () => {
    const statements: string[] = [];
    const query = jest.fn(async (sql: string) => {
      statements.push(String(sql).replace(/\s+/g, ' ').trim());
      if (String(sql).includes('SELECT user_account.id')) return [{ id: 'admin-1' }];
      return [];
    });

    await new RepairInServiceWorkflowSnapshots20260817003000().up({ query } as never);

    const inserts = statements.filter((sql) => sql.startsWith('INSERT INTO workflow_definitions'));
    expect(inserts).toHaveLength(6);
    expect(inserts.every((sql) => sql.includes('ON CONFLICT (flow_key, business_scope)'))).toBe(true);
    expect(statements.filter((sql) => sql.startsWith('UPDATE workflow_definitions'))).toHaveLength(4);
    expect(statements.join('\n')).toContain('business_scope');
  });
});
