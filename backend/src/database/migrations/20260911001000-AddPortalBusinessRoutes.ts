import { MigrationInterface, QueryRunner } from 'typeorm';

const ACTIONS = ['route.portal_intake_review', 'route.salary_returns'];
const ROLES = ['business_owner', 'business_group_leader', 'business_group_member', 'biz_manager', 'biz_leader', 'biz_member', 'manager', 'salesperson'];

export class AddPortalBusinessRoutes20260911001000 implements MigrationInterface {
  name = 'AddPortalBusinessRoutes20260911001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const scope of ['beilun', 'out_of_province']) {
      const key = `roleActionPermissions.v1.${scope}`;
      const rows = await queryRunner.query('SELECT value FROM system_settings WHERE key = $1 LIMIT 1', [key]) as Array<{ value: string }>;
      let stored: { roles?: Record<string, string[]> } = {};
      try { stored = rows[0]?.value ? JSON.parse(rows[0].value) : {}; } catch { stored = {}; }
      stored.roles ??= {};
      // Missing roles inherit defaults; creating a sparse override removes existing access.
      for (const role of ROLES) {
        if (Array.isArray(stored.roles[role])) {
          stored.roles[role] = Array.from(new Set([...stored.roles[role], ...ACTIONS]));
        }
      }
      await queryRunner.query(
        'INSERT INTO system_settings (key, value, is_encrypted) VALUES ($1, $2, false) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, is_encrypted = false, updated_at = now()',
        [key, JSON.stringify(stored)],
      );
    }
  }

  async down(): Promise<void> {
    // Keep administrator customizations intact.
  }
}
