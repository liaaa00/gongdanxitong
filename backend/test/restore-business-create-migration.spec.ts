import { RestoreBusinessMainOrderCreate20260915000000 } from 'src/database/migrations/20260915000000-RestoreBusinessMainOrderCreate';

const BUSINESS_ROLES = ['business_group_member', 'business_group_leader', 'biz_member', 'biz_leader', 'salesperson'];

function makeStore(initial: Record<string, any>) {
  const store: Record<string, string> = {};
  for (const [k, v] of Object.entries(initial)) store[k] = JSON.stringify(v);
  const query = jest.fn(async (sql: string, args: any[]) => {
    const key = args[0];
    if (sql.startsWith('SELECT')) {
      return store[key] ? [{ value: store[key] }] : [];
    }
    store[key] = args[1];
    return [];
  });
  return { store, query };
}

describe('business main-order single create recovery', () => {
  it('restores create for business roles in both scopes, preserving other roles', async () => {
    const beilun = {
      roles: {
        biz_member: ['route.portal_intake_review'], biz_leader: [], business_group_member: [],
        business_group_leader: [], salesperson: [], business_owner: [], biz_manager: [],
        manager: [], contract_specialist: ['module.contract.manage'],
      },
    };
    const oop = { roles: { biz_member: [], salesperson: [], business_owner: [] } };
    const { store, query } = makeStore({
      'roleActionPermissions.v1.beilun': beilun,
      'roleActionPermissions.v1.out_of_province': oop,
    });
    await new RestoreBusinessMainOrderCreate20260915000000().up({ query } as never);

    const savedBeilun = JSON.parse(store['roleActionPermissions.v1.beilun']);
    for (const role of BUSINESS_ROLES) {
      expect(savedBeilun.roles[role]).toContain('work_order.create');
      expect(savedBeilun.roles[role]).toContain('route.work_order_create');
    }
    expect(savedBeilun.roles.biz_member).toEqual(['route.portal_intake_review', 'work_order.create', 'route.work_order_create']);
    expect(savedBeilun.roles.business_owner).toEqual([]);
    expect(savedBeilun.roles.biz_manager).toEqual([]);
    expect(savedBeilun.roles.contract_specialist).toEqual(['module.contract.manage']);

    const savedOop = JSON.parse(store['roleActionPermissions.v1.out_of_province']);
    expect(savedOop.roles.biz_member).toEqual(['work_order.create', 'route.work_order_create']);
    expect(savedOop.roles.salesperson).toEqual(['work_order.create', 'route.work_order_create']);
    expect(savedOop.roles.business_owner).toEqual([]);
  });

  it('is idempotent and never creates settings for an unconfigured scope', async () => {
    const original = JSON.stringify({ roles: { biz_member: ['work_order.create', 'route.work_order_create'] } });
    const { store, query } = makeStore({ 'roleActionPermissions.v1.beilun': JSON.parse(original) });
    const migration = new RestoreBusinessMainOrderCreate20260915000000();
    await migration.up({ query } as never);
    await migration.up({ query } as never);
    expect(store['roleActionPermissions.v1.beilun']).toBe(original);
    // out_of_province had no row: two SELECTs only, no UPDATE written for it.
    expect(store['roleActionPermissions.v1.out_of_province']).toBeUndefined();
    expect(query.mock.calls.filter((c: any[]) => String(c[0]).startsWith('UPDATE') && c[1][0] === 'roleActionPermissions.v1.out_of_province')).toHaveLength(0);
  });
});
