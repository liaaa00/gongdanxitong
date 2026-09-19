import { QueryRunner } from 'typeorm';
import { ProvisionBusinessGroup5Members20260919010000 } from 'src/database/migrations/20260919010000-ProvisionBusinessGroup5Members';

function makeQueryRunner(anchorResult: Array<{ role_id: string | null; department_id: string | null }>) {
  return { query: jest.fn().mockResolvedValue(anchorResult) } as unknown as QueryRunner;
}

describe('provision business group 5 members migration', () => {
  const MEMBERS = ['chenshi', 'hechuhong'];

  it('inserts both members with beilun scope, forced password change, and the shared temporary hash', async () => {
    const queryRunner = makeQueryRunner([{ role_id: 'role-1', department_id: 'dept-1' }]);
    const migration = new ProvisionBusinessGroup5Members20260919010000();

    await migration.up(queryRunner);

    const calls = (queryRunner.query as jest.Mock).mock.calls.map(([sql]) => sql as string);
    const insert = calls.find((sql) => sql.includes('INSERT INTO users'));
    expect(insert).toBeDefined();
    expect(insert).toContain("'chenshi', '陈诗'");
    expect(insert).toContain("'hechuhong', '何楚红'");
    expect(insert).toContain("'beilun', true, NULL, 0, 0, NULL");
    expect(insert).toContain('ON CONFLICT (username) DO UPDATE');
    expect(insert).toContain("WHERE users.business_scope = 'beilun'");
  });

  it('binds biz_member with BUSINESS_GROUP_5 as primary role via the anchored ids', async () => {
    const queryRunner = makeQueryRunner([{ role_id: 'role-1', department_id: 'dept-1' }]);
    const migration = new ProvisionBusinessGroup5Members20260919010000();

    await migration.up(queryRunner);

    const calls = (queryRunner.query as jest.Mock).mock.calls.map(([sql, params]) => ({ sql, params }));
    const bind = calls.find((call) => call.sql.includes('INSERT INTO user_roles'));
    expect(bind).toBeDefined();
    expect(bind!.sql).toContain('ON CONFLICT (user_id, role_id, department_id) DO UPDATE');
    expect(bind!.sql).toContain('SET is_primary = true');
    expect(bind!.params).toEqual(['role-1', 'dept-1', MEMBERS]);
  });

  it('skips silently when the biz_member role or BUSINESS_GROUP_5 department is missing', async () => {
    const queryRunner = makeQueryRunner([{ role_id: null, department_id: 'dept-1' }]);
    const migration = new ProvisionBusinessGroup5Members20260919010000();

    await migration.up(queryRunner);

    const calls = (queryRunner.query as jest.Mock).mock.calls.map(([sql]) => sql as string);
    expect(calls.some((sql) => sql.includes('INSERT INTO users'))).toBe(false);
    expect(calls.some((sql) => sql.includes('INSERT INTO user_roles'))).toBe(false);
  });

  it('deactivates only members without other active department bindings on rollback', async () => {
    const queryRunner = makeQueryRunner([]);
    const migration = new ProvisionBusinessGroup5Members20260919010000();

    await migration.down(queryRunner);

    const calls = (queryRunner.query as jest.Mock).mock.calls.map(([sql, params]) => ({ sql, params }));
    const down = calls.find((call) => call.sql.includes('UPDATE users'));
    expect(down).toBeDefined();
    expect(down!.sql).toContain('SET is_active = false');
    expect(down!.sql).toContain("department.code <> 'BUSINESS_GROUP_5'");
    expect(down!.params).toEqual([MEMBERS]);
    expect((queryRunner.query as jest.Mock).mock.calls.some(([sql]) => String(sql).includes('DELETE FROM users'))).toBe(false);
  });
});
