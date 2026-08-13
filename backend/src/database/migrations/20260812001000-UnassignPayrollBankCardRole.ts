import { MigrationInterface, QueryRunner } from 'typeorm';

const PAYROLL_ACTIONS = new Set([
  'route.onboarding_payroll_bank_card',
  'module.payroll_bank_card.manage',
]);

export class UnassignPayrollBankCardRole20260812001000 implements MigrationInterface {
  name = 'UnassignPayrollBankCardRole20260812001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE field_permissions permission
         SET permission = 'hidden'::field_permission_mode_enum
        FROM roles role
       WHERE permission.role_id = role.id
         AND permission.scenario = 'dispatched:payroll_bank_card'
         AND permission.business_scope = 'beilun'
         AND role.code <> 'admin'
    `);
    await queryRunner.query(`
      UPDATE module_handlers
         SET is_active = false
       WHERE module_code = 'payroll_bank_card'
         AND business_scope = 'beilun'
    `);
    await queryRunner.query(`
      UPDATE module_supervisors
         SET is_active = false, updated_at = now()
       WHERE module_code = 'payroll_bank_card'
         AND business_scope = 'beilun'
    `);

    const settingRows = await queryRunner.query(`
      SELECT value
        FROM system_settings
       WHERE key = 'roleActionPermissions.v1.beilun'
    `) as Array<{ value: string }>;
    if (!settingRows[0]) return;

    try {
      const parsed = JSON.parse(settingRows[0].value) as { roles?: Record<string, string[]> };
      const roles = parsed.roles ?? {};
      for (const [roleCode, actions] of Object.entries(roles)) {
        if (roleCode === 'admin' || !Array.isArray(actions)) continue;
        roles[roleCode] = actions.filter((action) => !PAYROLL_ACTIONS.has(action));
      }
      await queryRunner.query(
        `UPDATE system_settings
            SET value = $1, is_encrypted = false, updated_at = now()
          WHERE key = 'roleActionPermissions.v1.beilun'`,
        [JSON.stringify({ ...parsed, roles })],
      );
    } catch {
      // Keep malformed custom settings untouched; static and seed permissions are already restricted.
    }
  }

  public async down(): Promise<void> {
    // Role ownership is a business decision and must not be guessed during rollback.
  }
}
