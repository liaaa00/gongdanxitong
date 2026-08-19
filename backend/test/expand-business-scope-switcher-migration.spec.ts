import { ConvergeBusinessScopeSwitcherPermissions20260816002000 } from 'src/database/migrations/20260816002000-ConvergeBusinessScopeSwitcherPermissions';

describe('ConvergeBusinessScopeSwitcherPermissions migration', () => {
  it('keeps only switch eligibility, removes automatic routes, and preserves unrelated manual actions', async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const runner = {
      query: jest.fn(async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params });
        if (sql.includes('SELECT value FROM system_settings')) {
          return [{
            value: JSON.stringify({
              roles: {
                business_scope_switcher: ['business_scope.switch', 'work_order.create', 'module.data_entry.manage'],
              },
            }),
          }];
        }
        if (sql.includes('SELECT id, config')) {
          return [{
            id: 'config-1',
            config: {
              roles: [{ code: 'business_scope_switcher' }],
              routePermissions: [{
                path: '/out-of-province/increase',
                allowedRoles: ['business_scope_switcher', 'biz_member'],
              }],
            },
          }];
        }
        return [];
      }),
    } as any;

    await new ConvergeBusinessScopeSwitcherPermissions20260816002000().up(runner);

    const settingsWrite = calls.find((item) => item.sql.includes('INSERT INTO system_settings'));
    const stored = JSON.parse(String(settingsWrite?.params?.[1]));
    expect(stored.roles.business_scope_switcher).toEqual([
      'business_scope.switch',
      'module.data_entry.manage',
    ]);

    const configWrite = calls.find((item) => item.sql.includes('UPDATE permission_config_versions'));
    const config = JSON.parse(String(configWrite?.params?.[0]));
    expect(config.routePermissions[0].allowedRoles).toEqual(['biz_member']);
    expect(calls.every((item) => !/\b(users|user_roles|work_orders|in_service_orders|dispatched_orders)\b/i.test(item.sql))).toBe(true);
  });
});
