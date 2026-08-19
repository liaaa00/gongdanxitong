import { MigrationInterface, QueryRunner } from 'typeorm';

type Scope = 'beilun' | 'out_of_province';

const SCOPES: Scope[] = ['beilun', 'out_of_province'];
const ROLE_CODE = 'business_scope_switcher';
const ROLE_NAME = '跨业务范围切换人员';
const ROLE_DESCRIPTION = '仅提供北仑与菜鸟业务范围切换资格；具体菜鸟业务动作由管理员按人员手动配置，并保留原岗位角色。';
const AUTO_ACTIONS = new Set([
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
]);
const AUTO_ROUTES = new Set([
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
]);

function parseSettings(value: unknown): { roles?: Record<string, string[]> } {
  if (typeof value !== 'string' || !value) return {};
  try {
    return JSON.parse(value) as { roles?: Record<string, string[]> };
  } catch {
    return {};
  }
}

export class ConvergeBusinessScopeSwitcherPermissions20260816002000 implements MigrationInterface {
  name = 'ConvergeBusinessScopeSwitcherPermissions20260816002000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE roles SET name = $1, description = $2, is_active = true WHERE code = $3`,
      [ROLE_NAME, ROLE_DESCRIPTION, ROLE_CODE],
    );

    for (const scope of SCOPES) {
      const settingsRows = await queryRunner.query(
        `SELECT value FROM system_settings WHERE key = $1 LIMIT 1`,
        [`roleActionPermissions.v1.${scope}`],
      ) as Array<{ value: string }>;
      const stored = parseSettings(settingsRows[0]?.value);
      stored.roles = stored.roles || {};
      const retainedManualActions = (stored.roles[ROLE_CODE] || [])
        .filter((action) => !AUTO_ACTIONS.has(action));
      stored.roles[ROLE_CODE] = Array.from(new Set(['business_scope.switch', ...retainedManualActions]));
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
      const roles = Array.isArray(config.roles) ? config.roles : [];
      const routePermissions = Array.isArray(config.routePermissions)
        ? config.routePermissions.map((route: any) => {
          if (!AUTO_ROUTES.has(route.path)) return route;
          return {
            ...route,
            allowedRoles: Array.isArray(route.allowedRoles)
              ? route.allowedRoles.filter((role: string) => role !== ROLE_CODE)
              : [],
          };
        })
        : [];

      await queryRunner.query(
        `UPDATE permission_config_versions
         SET config = $1::jsonb
         WHERE id = $2 AND business_scope = $3`,
        [JSON.stringify({ ...config, roles, routePermissions }), active.id, scope],
      );
    }
  }

  async down(): Promise<void> {
    // Do not restore automatic business actions; administrators can configure them explicitly.
  }
}
