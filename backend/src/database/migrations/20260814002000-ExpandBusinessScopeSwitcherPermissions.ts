import { MigrationInterface, QueryRunner } from 'typeorm';

type Scope = 'beilun' | 'out_of_province';

const SCOPES: Scope[] = ['beilun', 'out_of_province'];
const ROLE_CODE = 'business_scope_switcher';
const ROLE_NAME = '跨业务范围切换人员';
const ROLE_DESCRIPTION = '原北仑岗位人员可切换进入菜鸟业务范围，并获得菜鸟业务操作权限；保留原岗位角色。';
const ACTIONS = [
  'business_scope.switch',
  'work_order.view',
  'work_order.create',
  'work_order.import',
  'work_order.update',
  'work_order.withdraw',
  'work_order.void',
  'work_order.urge',
  'route.dashboard',
  'route.notifications',
  'route.work_orders',
  'route.work_order_create',
  'route.work_order_import',
  'route.work_order_detail',
  'route.dispatched_detail',
  'route.onboarding',
  'route.onboarding_contract',
  'route.onboarding_contact',
  'route.onboarding_data_entry',
  'route.onboarding_social_insurance',
  'route.resignation_contact',
  'route.data_entry_resign',
  'route.social_insurance_resign',
  'route.offboarding',
  'dispatched_order.batch_urge',
] as const;
const ROUTES = [
  '/out-of-province',
  '/out-of-province/orders',
  '/out-of-province/orders/:id',
  '/out-of-province/orders/new',
  '/out-of-province/increase',
  '/out-of-province/increase/:id',
  '/out-of-province/increase/new',
  '/out-of-province/decrease',
  '/out-of-province/decrease/:id',
  '/out-of-province/decrease/new',
  '/out-of-province/single-business',
  '/out-of-province/single-business/:id',
  '/out-of-province/single-business/new',
  '/out-of-province/import',
  '/out-of-province/new',
];

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

export class ExpandBusinessScopeSwitcherPermissions20260814002000 implements MigrationInterface {
  name = 'ExpandBusinessScopeSwitcherPermissions20260814002000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE roles
       SET name = $1, description = $2, is_active = true
       WHERE code = $3`,
      [ROLE_NAME, ROLE_DESCRIPTION, ROLE_CODE],
    );

    for (const scope of SCOPES) {
      const settingsRows = await queryRunner.query(
        `SELECT value FROM system_settings WHERE key = $1 LIMIT 1`,
        [`roleActionPermissions.v1.${scope}`],
      ) as Array<{ value: string }>;
      let stored: { roles?: Record<string, string[]> } = {};
      try {
        stored = settingsRows[0]?.value ? JSON.parse(settingsRows[0].value) : {};
      } catch {
        stored = {};
      }
      stored.roles = stored.roles || {};
      stored.roles[ROLE_CODE] = unique([...(stored.roles[ROLE_CODE] || []), ...ACTIONS]);
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

      const config = active.config || {};
      const roles = Array.isArray(config.roles) ? config.roles.map((role: any) => ({ ...role })) : [];
      const existingRole = roles.find((role: any) => role.code === ROLE_CODE || role.canonicalCode === ROLE_CODE);
      if (existingRole) {
        existingRole.name = ROLE_NAME;
        existingRole.description = ROLE_DESCRIPTION;
        existingRole.isActive = true;
      } else {
        roles.push({
          id: ROLE_CODE,
          code: ROLE_CODE,
          canonicalCode: ROLE_CODE,
          name: ROLE_NAME,
          description: ROLE_DESCRIPTION,
          level: 'execution',
          isActive: true,
        });
      }

      const routePermissions = Array.isArray(config.routePermissions)
        ? config.routePermissions.map((route: any) => ({
          ...route,
          allowedRoles: [...(route.allowedRoles || [])],
          backendActions: [...(route.backendActions || [])],
        }))
        : [];
      for (const path of ROUTES) {
        const route = routePermissions.find((candidate: any) => candidate.path === path);
        if (route) {
          route.allowedRoles = unique([...route.allowedRoles, ROLE_CODE]);
          route.backendActions = unique([...route.backendActions, ...ACTIONS]);
        } else {
          routePermissions.push({
            path,
            allowedRoles: [ROLE_CODE],
            backendActions: [...ACTIONS],
          });
        }
      }

      await queryRunner.query(
        `UPDATE permission_config_versions SET config = $1::jsonb WHERE id = $2 AND business_scope = $3`,
        [JSON.stringify({ ...config, roles, routePermissions }), active.id, scope],
      );
    }
  }

  async down(): Promise<void> {
    // Do not remove actions or role bindings on rollback; an administrator may have assigned the role.
  }
}
