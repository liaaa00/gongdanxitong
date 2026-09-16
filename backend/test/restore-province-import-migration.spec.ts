import { RestoreProvinceMainOrderImport20260916000000 } from 'src/database/migrations/20260916000000-RestoreProvinceMainOrderImport';

const BUSINESS_ROLES = ['business_group_member', 'business_group_leader', 'biz_member', 'biz_leader', 'salesperson'];

describe('out-of-province main-order import recovery', () => {
  it('restores import only for the out_of_province scope business roles', async () => {
    const roles: Record<string, string[]> = {
      biz_member: ['work_order.create', 'route.work_order_create'],
      biz_leader: [], business_group_member: [], business_group_leader: [], salesperson: [],
      business_owner: [], contract_specialist: ['module.contract.manage'],
    };
    let saved: any;
    const query = jest.fn(async (sql: string, args: any[]) => {
      expect(args[0]).toBe('roleActionPermissions.v1.out_of_province');
      if (sql.startsWith('SELECT')) return [{ value: JSON.stringify({ roles }) }];
      saved = JSON.parse(args[1]);
      return [];
    });
    await new RestoreProvinceMainOrderImport20260916000000().up({ query } as never);
    for (const role of BUSINESS_ROLES) {
      expect(saved.roles[role]).toEqual([...roles[role], 'work_order.import', 'route.work_order_import']);
    }
    expect(saved.roles.business_owner).toEqual([]);
    expect(saved.roles.contract_specialist).toEqual(roles.contract_specialist);
    // beilun key must never be touched
    expect(query.mock.calls.every((c: any[]) => c[1][0] === 'roleActionPermissions.v1.out_of_province')).toBe(true);
  });

  it('is idempotent and never creates settings for an unconfigured scope', async () => {
    let value = JSON.stringify({ roles: { biz_member: ['work_order.import', 'route.work_order_import'] } });
    const original = value;
    const query = jest.fn(async (sql: string, args: any[]) => {
      if (sql.startsWith('SELECT')) return [{ value }];
      value = args[1];
      return [];
    });
    const migration = new RestoreProvinceMainOrderImport20260916000000();
    await migration.up({ query } as never);
    await migration.up({ query } as never);
    expect(value).toBe(original);
    const empty = jest.fn().mockResolvedValue([]);
    await migration.up({ query: empty } as never);
    expect(empty).toHaveBeenCalledTimes(1);
  });
});
