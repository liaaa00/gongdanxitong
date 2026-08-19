import { MigrationInterface, QueryRunner } from 'typeorm';

type RoutePermission = {
  path: string;
  allowedRoles?: string[];
  backendActions?: string[];
  [key: string]: unknown;
};

type PermissionConfig = {
  version?: string;
  routePermissions?: RoutePermission[];
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

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function allowAdminPayrollBankCardRoute(source: PermissionConfig): PermissionConfig {
  const routePermissions = [...(source.routePermissions ?? [])];
  const existing = routePermissions.find((route) => route.path === PAYROLL_PATH);
  if (existing) {
    existing.allowedRoles = unique(['admin', ...(existing.allowedRoles ?? [])]);
    existing.backendActions = unique([...(existing.backendActions ?? []), ...PAYROLL_ACTIONS]);
  } else {
    routePermissions.push({
      path: PAYROLL_PATH,
      allowedRoles: ['admin'],
      backendActions: [...PAYROLL_ACTIONS],
    });
  }

  return {
    ...source,
    version: (source.version ?? 'permission') + '-admin-payroll',
    routePermissions,
    metadata: {
      ...(source.metadata ?? {}),
      updatedAt: new Date().toISOString(),
      comment: 'Payroll bank-card export is admin-only until explicit operators are approved',
    },
  };
}

export class FixPayrollAdminRoutePermission20260817002000 implements MigrationInterface {
  name = 'FixPayrollAdminRoutePermission20260817002000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const activeConfigs = await queryRunner.query(
      `SELECT id, config
       FROM permission_config_versions
       WHERE is_active = true`
    ) as Array<{ id: string; config: PermissionConfig | string }>;

    for (const row of activeConfigs) {
      const source = typeof row.config === 'string' ? JSON.parse(row.config) : row.config;
      const config = allowAdminPayrollBankCardRoute(source ?? {});
      await queryRunner.query(
        `UPDATE permission_config_versions
         SET config = $1::jsonb, updated_at = now()
         WHERE id = $2`,
        [JSON.stringify(config), row.id],
      );
    }
  }

  async down(): Promise<void> {
    // Permission configuration may be edited after deployment; do not remove later legitimate access.
  }
}
