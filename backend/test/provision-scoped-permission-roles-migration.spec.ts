import { ProvisionScopedPermissionRoles20260813002000 } from 'src/database/migrations/20260813002000-ProvisionScopedPermissionRoles';

describe('ProvisionScopedPermissionRoles20260813002000', () => {
  it('provisions only scoped permission metadata without assigning users or touching business rows', async () => {
    const statements: Array<{ sql: string; params?: unknown[] }> = [];
    const roleIds: Record<string, string> = {
      payroll_bank_card_exporter: '11111111-1111-4111-8111-111111111111',
      business_scope_switcher: '22222222-2222-4222-8222-222222222222',
    };
    const query = jest.fn(async (sql: string, params?: unknown[]) => {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      statements.push({ sql: normalized, params });
      if (normalized.startsWith('SELECT id FROM roles')) {
        return [{ id: roleIds[String(params?.[0])] }];
      }
      if (normalized.startsWith('SELECT value FROM system_settings')) {
        return [{ value: JSON.stringify({ roles: { admin: ['system.admin'] } }) }];
      }
      if (normalized.startsWith('SELECT id, config FROM permission_config_versions')) {
        const scope = String(params?.[0]);
        return [{
          id: `config-${scope}`,
          config: {
            version: `test-${scope}`,
            roles: [],
            routePermissions: [
              { path: '/dashboard', allowedRoles: ['admin'], backendActions: ['route.dashboard'] },
            ],
            fieldPermissions: [],
          },
        }];
      }
      return [];
    });

    const migration = new ProvisionScopedPermissionRoles20260813002000();
    await migration.up({ query } as never);

    const sql = statements.map((item) => item.sql).join('\n');
    expect(sql).toContain('INSERT INTO roles');
    expect(sql).toContain('INSERT INTO system_settings');
    expect(sql).toContain('UPDATE permission_config_versions');
    expect(sql).not.toMatch(/(?:INSERT INTO|UPDATE|DELETE FROM)\s+(?:users|user_roles|work_orders|dispatched_orders|customers|operation_logs|notifications)\b/i);

    const settingWrites = statements.filter((item) => item.sql.startsWith('INSERT INTO system_settings'));
    expect(settingWrites).toHaveLength(2);
    for (const write of settingWrites) {
      const stored = JSON.parse(String(write.params?.[1]));
      expect(stored.roles.payroll_bank_card_exporter).toEqual(expect.arrayContaining([
        'route.onboarding_payroll_bank_card',
        'module.payroll_bank_card.manage',
      ]));
      expect(stored.roles.business_scope_switcher).toContain('business_scope.switch');
    }

    const configWrites = statements.filter((item) => item.sql.startsWith('UPDATE permission_config_versions'));
    expect(configWrites).toHaveLength(2);
    for (const write of configWrites) {
      const config = JSON.parse(String(write.params?.[0]));
      expect(config.roles).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: roleIds.payroll_bank_card_exporter,
          code: 'payroll_bank_card_exporter',
        }),
        expect.objectContaining({
          id: roleIds.business_scope_switcher,
          code: 'business_scope_switcher',
        }),
      ]));
      expect(config.routePermissions).toEqual(expect.arrayContaining([
        expect.objectContaining({
          path: '/onboarding/payroll_bank_card',
          allowedRoles: expect.arrayContaining(['payroll_bank_card_exporter']),
        }),
        expect.objectContaining({
          path: '/out-of-province/increase',
          allowedRoles: expect.arrayContaining(['business_scope_switcher']),
        }),
      ]));
    }

    await expect(migration.down()).resolves.toBeUndefined();
  });
});
