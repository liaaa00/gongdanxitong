import { MigrationInterface, QueryRunner } from 'typeorm';

type Scope = 'beilun' | 'out_of_province';

const SCOPES: Scope[] = ['beilun', 'out_of_province'];
const PAYROLL_ROLE = {
  id: '',
  code: 'payroll_bank_card_exporter',
  name: '薪酬银行卡导出人员',
  description: '可查看并导出薪酬银行卡清单；不提供其他子工单办理权限。',
};
const SWITCH_ROLE = {
  id: '',
  code: 'business_scope_switcher',
  name: '跨业务范围切换人员',
  description: '原北仑岗位人员可切换进入菜鸟业务范围，并获得菜鸟业务操作权限；保留原岗位角色。',
};

const PAYROLL_ACTIONS = [
  'route.dashboard',
  'route.onboarding',
  'route.onboarding_payroll_bank_card',
  'module.payroll_bank_card.manage',
];
const SWITCH_ACTIONS = [
  'business_scope.switch',
  'work_order.view', 'work_order.create', 'work_order.import', 'work_order.update',
  'work_order.withdraw', 'work_order.void', 'work_order.urge',
  'route.dashboard', 'route.notifications', 'route.work_orders', 'route.work_order_create',
  'route.work_order_import', 'route.work_order_detail', 'route.dispatched_detail',
  'route.onboarding', 'route.onboarding_contract', 'route.onboarding_contact',
  'route.onboarding_data_entry', 'route.onboarding_social_insurance', 'route.resignation_contact',
  'route.data_entry_resign', 'route.social_insurance_resign', 'route.offboarding',
  'dispatched_order.batch_urge',
];

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function addRoleToConfig(config: any, role: typeof PAYROLL_ROLE | typeof SWITCH_ROLE, scope: Scope): any {
  const roles = Array.isArray(config?.roles) ? config.roles : [];
  const nextRoles = roles.filter((candidate: any) => (
    candidate?.code !== role.code && candidate?.canonicalCode !== role.code
  ));
  nextRoles.push({
    id: role.id || role.code,
    code: role.code,
    name: role.name,
    canonicalCode: role.code,
    isActive: true,
    description: role.description,
    level: 'execution',
  });

  const routePermissions = Array.isArray(config?.routePermissions)
    ? config.routePermissions.map((route: any) => ({ ...route, allowedRoles: [...(route.allowedRoles || [])] }))
    : [];
  const addRoute = (path: string, actions: string[]) => {
    const route = routePermissions.find((candidate: any) => candidate.path === path);
    if (route) {
      route.allowedRoles = unique([...route.allowedRoles, role.code]);
      route.backendActions = unique([...(route.backendActions || []), ...actions]);
    } else {
      routePermissions.push({ path, allowedRoles: [role.code], backendActions: actions });
    }
  };

  if (role.code === PAYROLL_ROLE.code) {
    addRoute('/onboarding/payroll_bank_card', PAYROLL_ACTIONS);
    const payrollRoute = routePermissions.find((route: any) => route.path === '/onboarding/payroll_bank_card');
    if (payrollRoute) payrollRoute.allowedRoles = unique(['admin', ...payrollRoute.allowedRoles]);
  } else {
    [
      '/out-of-province',
      '/out-of-province/orders',
      '/out-of-province/orders/:id',
      '/out-of-province/increase',
      '/out-of-province/increase/:id',
      '/out-of-province/decrease',
      '/out-of-province/decrease/:id',
      '/out-of-province/single-business',
      '/out-of-province/single-business/:id',
    ].forEach((path) => addRoute(path, SWITCH_ACTIONS.filter((action) => action !== 'business_scope.switch')));
  }

  return {
    ...config,
    roles: nextRoles,
    routePermissions,
  };
}

export class ProvisionScopedPermissionRoles20260813002000 implements MigrationInterface {
  name = 'ProvisionScopedPermissionRoles20260813002000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const rolesWithIds: Array<typeof PAYROLL_ROLE | typeof SWITCH_ROLE> = [];
    for (const role of [PAYROLL_ROLE, SWITCH_ROLE]) {
      await queryRunner.query(
        `INSERT INTO roles (code, name, level, description, is_active)
         VALUES ($1, $2, 'execution', $3, true)
         ON CONFLICT (code) DO UPDATE
           SET name = EXCLUDED.name,
               description = EXCLUDED.description,
               is_active = true`,
        [role.code, role.name, role.description],
      );
      const rows = await queryRunner.query(
        `SELECT id FROM roles WHERE code = $1 LIMIT 1`,
        [role.code],
      ) as Array<{ id: string }>;
      if (!rows[0]?.id) throw new Error(`Permission role ${role.code} was not created`);
      rolesWithIds.push({ ...role, id: rows[0].id });
    }

    const payrollRole = rolesWithIds.find((role) => role.code === PAYROLL_ROLE.code) || PAYROLL_ROLE;
    const switchRole = rolesWithIds.find((role) => role.code === SWITCH_ROLE.code) || SWITCH_ROLE;
    for (const scope of SCOPES) {
      const settings = await queryRunner.query(
        `SELECT value FROM system_settings
         WHERE key = $1
         LIMIT 1`,
        [`roleActionPermissions.v1.${scope}`],
      ) as Array<{ value: string }>;

      let stored: { roles?: Record<string, string[]> } = {};
      try {
        stored = settings[0]?.value ? JSON.parse(settings[0].value) : {};
      } catch {
        stored = {};
      }
      stored.roles = stored.roles || {};
      stored.roles[payrollRole.code] = unique([...(stored.roles[payrollRole.code] || []), ...PAYROLL_ACTIONS]);
      stored.roles[switchRole.code] = unique([...(stored.roles[switchRole.code] || []), ...SWITCH_ACTIONS]);

      await queryRunner.query(
        `INSERT INTO system_settings (key, value, is_encrypted)
         VALUES ($1, $2, false)
         ON CONFLICT (key) DO UPDATE
           SET value = EXCLUDED.value, is_encrypted = false, updated_at = now()`,
        [`roleActionPermissions.v1.${scope}`, JSON.stringify(stored)],
      );

      const activeRows = await queryRunner.query(
        `SELECT id, config
         FROM permission_config_versions
         WHERE business_scope = $1 AND is_active = true
         ORDER BY activated_at DESC NULLS LAST, created_at DESC
         LIMIT 1`,
        [scope],
      ) as Array<{ id: string; config: any }>;
      const active = activeRows[0];
      if (!active) continue;

      const nextConfig = addRoleToConfig(
        addRoleToConfig(active.config, payrollRole, scope),
        switchRole,
        scope,
      );
      await queryRunner.query(
        `UPDATE permission_config_versions
         SET config = $1::jsonb
         WHERE id = $2 AND business_scope = $3`,
        [JSON.stringify(nextConfig), active.id, scope],
      );
    }
  }

  async down(): Promise<void> {
    // Role assignment is an administrator decision; rollback must not guess or delete user bindings.
  }
}
