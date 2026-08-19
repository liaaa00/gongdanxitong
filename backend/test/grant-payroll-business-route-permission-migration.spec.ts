import { GrantPayrollBusinessRoutePermission20260818002000 } from 'src/database/migrations/20260818002000-GrantPayrollBusinessRoutePermission';

describe('GrantPayrollBusinessRoutePermission20260818002000', () => {
  it('grants the payroll route to business roles and preserves admin access', async () => {
    let savedConfig: any;
    const query = jest.fn(async (sql: string, params?: unknown[]) => {
      if (String(sql).includes('SELECT id, config')) {
        return [{
          id: 'config-1',
          config: {
            routePermissions: [
              { path: '/onboarding/payroll_bank_card', allowedRoles: ['payroll_bank_card_exporter'] },
            ],
          },
        }];
      }
      if (String(sql).startsWith('UPDATE permission_config_versions')) {
        savedConfig = JSON.parse(String(params?.[0]));
      }
      return [];
    });

    await new GrantPayrollBusinessRoutePermission20260818002000().up({ query } as never);

    expect(savedConfig.routePermissions[0]).toEqual(expect.objectContaining({
      path: '/onboarding/payroll_bank_card',
      allowedRoles: expect.arrayContaining([
        'admin',
        'business_owner',
        'business_group_leader',
        'business_group_member',
        'payroll_bank_card_exporter',
      ]),
      backendActions: expect.arrayContaining(['module.payroll_bank_card.manage']),
    }));
  });

  it('does not touch business records or user bindings', async () => {
    const statements: string[] = [];
    const query = jest.fn(async (sql: string) => {
      statements.push(String(sql).replace(/\s+/g, ' ').trim());
      if (String(sql).includes('SELECT id, config')) {
        return [];
      }
      return [];
    });

    await new GrantPayrollBusinessRoutePermission20260818002000().up({ query } as never);

    const sql = statements.join('\n');
    expect(sql).not.toMatch(/(?:INSERT INTO|UPDATE|DELETE FROM) (?:work_orders|dispatched_orders|users|user_roles)\b/i);
    expect(sql).toContain('permission_config_versions');
    expect(sql).toContain('system_settings');
  });
});
