import { MigrationInterface, QueryRunner } from 'typeorm';

type PermissionConfig = {
  routePermissions?: Array<{
    path: string;
    allowedRoles?: string[];
    backendActions?: string[];
    [key: string]: unknown;
  }>;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
};

const PAYROLL_PATH = '/onboarding/payroll_bank_card';
const PAYROLL_ACTIONS = [
  'route.dashboard',
  'route.onboarding',
  'route.onboarding_payroll_bank_card',
  'module.payroll_bank_card.manage',
];
const BUSINESS_ROLES = [
  'business_owner',
  'business_group_leader',
  'business_group_member',
];

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function grantPayrollRoute(config: PermissionConfig): PermissionConfig {
  const routePermissions = Array.isArray(config.routePermissions)
    ? config.routePermissions.map((route) => ({
      ...route,
      allowedRoles: [...(route.allowedRoles ?? [])],
      backendActions: [...(route.backendActions ?? [])],
    }))
    : [];

  const route = routePermissions.find((candidate) => candidate.path === PAYROLL_PATH);
  if (route) {
    route.allowedRoles = unique([
      'admin',
      ...BUSINESS_ROLES,
      ...(route.allowedRoles ?? []),
    ]);
    route.backendActions = unique([...(route.backendActions ?? []), ...PAYROLL_ACTIONS]);
  } else {
    routePermissions.push({
      path: PAYROLL_PATH,
      allowedRoles: ['admin', ...BUSINESS_ROLES],
      backendActions: [...PAYROLL_ACTIONS],
    });
  }

  return {
    ...config,
    routePermissions,
    metadata: {
      ...(config.metadata ?? {}),
      updatedAt: new Date().toISOString(),
      comment: 'Payroll bank-card list/export is available to business roles within their data scope',
    },
  };
}

export class GrantPayrollBusinessRoutePermission20260818002000 implements MigrationInterface {
  name = 'GrantPayrollBusinessRoutePermission20260818002000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const activeConfigs = await queryRunner.query(
      'SELECT id, config FROM permission_config_versions WHERE is_active = true',
    ) as Array<{ id: string; config: PermissionConfig | string }>;

    for (const row of activeConfigs) {
      const source = typeof row.config === 'string' ? JSON.parse(row.config) : row.config;
      const next = grantPayrollRoute(source ?? {});
      await queryRunner.query(
        'UPDATE permission_config_versions SET config = $1::jsonb WHERE id = $2',
        [JSON.stringify(next), row.id],
      );
    }

    for (const scope of ['beilun', 'out_of_province']) {
      const key = 'roleActionPermissions.v1.' + scope;
      const rows = await queryRunner.query(
        'SELECT value FROM system_settings WHERE key = $1 LIMIT 1',
        [key],
      ) as Array<{ value: string }>;
      let stored: { roles?: Record<string, string[]> } = {};
      try {
        stored = rows[0]?.value ? JSON.parse(rows[0].value) : {};
      } catch {
        stored = {};
      }
      stored.roles = stored.roles ?? {};
      for (const role of BUSINESS_ROLES) {
        stored.roles[role] = unique([...(stored.roles[role] ?? []), ...PAYROLL_ACTIONS]);
      }
      await queryRunner.query(
        'INSERT INTO system_settings (key, value, is_encrypted) VALUES ($1, $2, false) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, is_encrypted = false, updated_at = now()',
        [key, JSON.stringify(stored)],
      );
    }
  }

  async down(): Promise<void> {
    // 角色授权可能已被管理员继续调整，回滚不猜测也不删除现有权限。
  }
}
