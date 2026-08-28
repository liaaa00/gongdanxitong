import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnsureInServiceCertificateModule20260826002000 implements MigrationInterface {
  name = 'EnsureInServiceCertificateModule20260826002000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO work_order_modules (
        module_code, business_scope, module_name, parent_module_code, module_type,
        description, display_order, is_active, dispatch_strategy,
        sla_hours, sla_reminder_before_hours, created_at, updated_at
      )
      SELECT
        'in_service_certificate', 'beilun', '证明开具', 'employment_management',
        'sub_module', '在职证明开具，支持管理员补派历史未指派工单', 24, true,
        'fixed'::dispatch_strategy_enum, 24, 4, now(), now()
      WHERE EXISTS (
        SELECT 1 FROM work_order_modules WHERE module_code = 'employment_management'
      )
      ON CONFLICT (module_code) DO UPDATE SET
        business_scope = EXCLUDED.business_scope,
        module_name = EXCLUDED.module_name,
        parent_module_code = EXCLUDED.parent_module_code,
        module_type = EXCLUDED.module_type,
        description = EXCLUDED.description,
        display_order = EXCLUDED.display_order,
        is_active = true,
        sla_hours = EXCLUDED.sla_hours,
        sla_reminder_before_hours = EXCLUDED.sla_reminder_before_hours,
        updated_at = now()
    `);
  }

  async down(): Promise<void> {
    // ponytail: preserve configured module and handler data during rollback; removal requires an explicit audited operation.
  }
}
