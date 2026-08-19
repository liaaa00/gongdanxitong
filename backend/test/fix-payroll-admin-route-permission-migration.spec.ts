import { FixPayrollAdminRoutePermission20260817002000 } from 'src/database/migrations/20260817002000-FixPayrollAdminRoutePermission';

describe('FixPayrollAdminRoutePermission20260817002000', () => {
  it('adds admin route and backend actions without assigning users', async () => {
    let updatedConfig: any;
    const query = jest.fn(async (sql: string, params?: unknown[]) => {
      if (String(sql).includes('SELECT id, config')) {
        return [{
          id: 'config-1',
          config: {
            version: 'active',
            routePermissions: [
              { path: '/onboarding/payroll_bank_card', allowedRoles: ['payroll_bank_card_exporter'] },
            ],
          },
        }];
      }
      if (String(sql).startsWith('UPDATE permission_config_versions')) {
        updatedConfig = JSON.parse(String(params?.[0]));
      }
      return [];
    });

    await new FixPayrollAdminRoutePermission20260817002000().up({ query } as never);

    expect(updatedConfig.routePermissions).toEqual([
      expect.objectContaining({
        path: '/onboarding/payroll_bank_card',
        allowedRoles: ['admin', 'payroll_bank_card_exporter'],
        backendActions: expect.arrayContaining([
          'route.dashboard',
          'route.onboarding',
          'route.onboarding_payroll_bank_card',
          'module.payroll_bank_card.manage',
        ]),
      }),
    ]);
  });

  it('updates every active scope config and never writes user bindings', async () => {
    const statements: string[] = [];
    const query = jest.fn(async (sql: string) => {
      statements.push(String(sql).replace(/\s+/g, ' ').trim());
      if (String(sql).includes('SELECT id, config')) {
        return [{ id: 'config-1', config: { version: 'v1', routePermissions: [] } }];
      }
      return [];
    });
    await new FixPayrollAdminRoutePermission20260817002000().up({ query } as never);
    expect(statements.some((sql) => sql.startsWith('UPDATE permission_config_versions'))).toBe(true);
    expect(statements.join('\n')).not.toMatch(/(?:INSERT INTO|UPDATE|DELETE FROM)\s+(?:users|user_roles)/i);
  });
});
