import { QueryRunner } from 'typeorm';
import { CreatePortalAccountLinks20260917010000 } from 'src/database/migrations/20260917010000-CreatePortalAccountLinks';

describe('create portal account links migration', () => {
  it('creates the link table with unique constraints and a restict-fk to customers', async () => {
    const queryRunner = { query: jest.fn().mockResolvedValue([]) } as unknown as QueryRunner;
    const migration = new CreatePortalAccountLinks20260917010000();

    await migration.up(queryRunner);

    const statements = (queryRunner.query as jest.Mock).mock.calls.map(([sql]) => sql as string).join('\n');
    expect(statements).toContain('CREATE TABLE IF NOT EXISTS customer_portal_account_links');
    expect(statements).toContain('UNIQUE (account_id, customer_id)');
    expect(statements).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_portal_account_links_primary');
    expect(statements).toContain('ON customer_portal_account_links (account_id) WHERE is_primary');
    expect(statements).toContain('FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT');
    expect(statements).toContain('FOREIGN KEY (account_id) REFERENCES customer_portal_accounts(id) ON DELETE CASCADE');
  });

  it('backfills one primary link per existing account so the backfill count equals the account count', async () => {
    const queryRunner = { query: jest.fn().mockResolvedValue([]) } as unknown as QueryRunner;
    const migration = new CreatePortalAccountLinks20260917010000();

    await migration.up(queryRunner);

    const calls = (queryRunner.query as jest.Mock).mock.calls.map(([sql]) => sql as string);
    const backfill = calls.find((sql) => sql.includes('INSERT INTO customer_portal_account_links'));
    expect(backfill).toBeDefined();
    // 回填口径：SELECT id, customer_id, true FROM customer_portal_accounts（无 WHERE/LIMIT），
    // 行数恒等于 customer_portal_accounts 全表 count；ON CONFLICT 保证幂等可重跑。
    expect(backfill).toContain('SELECT id, customer_id, true\n        FROM customer_portal_accounts');
    expect(backfill).not.toMatch(/WHERE/i);
    expect(backfill).not.toMatch(/LIMIT/i);
    expect(backfill).toContain('ON CONFLICT (account_id, customer_id) DO NOTHING');
  });

  it('drops only the link table on rollback without touching accounts', async () => {
    const queryRunner = { query: jest.fn().mockResolvedValue([]) } as unknown as QueryRunner;
    const migration = new CreatePortalAccountLinks20260917010000();

    await migration.down(queryRunner);

    const statements = (queryRunner.query as jest.Mock).mock.calls.map(([sql]) => sql as string).join('\n');
    expect(statements.trim()).toBe('DROP TABLE IF EXISTS customer_portal_account_links');
  });
});
