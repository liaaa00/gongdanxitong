import { RestoreBusinessMainOrderImport20260914220000 } from 'src/database/migrations/20260914220000-RestoreBusinessMainOrderImport';
import { AddPortalBusinessRoutes20260911001000 } from 'src/database/migrations/20260911001000-AddPortalBusinessRoutes';

describe('business main-order import recovery', () => {
  it('restores only import for business aliases, preserving other roles and scope', async () => {
    const roles: Record<string, string[]> = { biz_member: ['route.portal_intake_review'], biz_leader: [], business_group_member: [], business_group_leader: [], salesperson: [], business_owner: [], contract_specialist: ['module.contract.manage'] };
    let saved: any;
    const query = jest.fn(async (sql: string, args: any[]) => {
      expect(args[0]).toBe('roleActionPermissions.v1.beilun');
      if (sql.startsWith('SELECT')) return [{ value: JSON.stringify({ roles }) }];
      saved = JSON.parse(args[1]);
      return [];
    });
    const migration = new RestoreBusinessMainOrderImport20260914220000();
    await migration.up({ query } as never);
    for (const role of ['biz_member', 'biz_leader', 'business_group_member', 'business_group_leader', 'salesperson']) {
      expect(saved.roles[role]).toEqual([...roles[role], 'work_order.import', 'route.work_order_import']);
    }
    expect(saved.roles.business_owner).toEqual([]);
    expect(saved.roles.contract_specialist).toEqual(roles.contract_specialist);
  });

  it('is idempotent and never creates settings for an unconfigured scope', async () => {
    let value = JSON.stringify({ roles: { biz_member: ['work_order.import', 'route.work_order_import'] } });
    const original = value;
    const query = jest.fn(async (sql: string, args: any[]) => {
      if (sql.startsWith('SELECT')) return [{ value }];
      value = args[1];
      return [];
    });
    const migration = new RestoreBusinessMainOrderImport20260914220000();
    await migration.up({ query } as never);
    await migration.up({ query } as never);
    expect(value).toBe(original);
    const empty = jest.fn().mockResolvedValue([]);
    await migration.up({ query: empty } as never);
    expect(empty).toHaveBeenCalledTimes(1);
  });

  it('portal migration retains absent default roles and explicit overrides', async () => {
    const query = jest.fn(async (sql: string, args: any[]) => {
      if (sql.startsWith('SELECT')) return [{ value: JSON.stringify({ roles: { biz_member: ['work_order.import'], biz_leader: [] } }) }];
      const saved = JSON.parse(args[1]);
      expect(saved.roles.biz_member).toContain('work_order.import');
      expect(saved.roles.biz_leader).not.toContain('work_order.import');
      expect(saved.roles).not.toHaveProperty('salesperson');
      return [];
    });
    await new AddPortalBusinessRoutes20260911001000().up({ query } as never);
  });
});
