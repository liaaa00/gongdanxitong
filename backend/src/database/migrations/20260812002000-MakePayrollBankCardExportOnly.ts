import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakePayrollBankCardExportOnly20260812002000 implements MigrationInterface {
  name = 'MakePayrollBankCardExportOnly20260812002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE work_order_modules
         SET module_name = '薪酬银行卡导出',
             module_type = 'export_list',
             description = '银行卡资料完整后进入固定模板导出清单，不参与工单流转',
             dispatch_strategy = 'fixed',
             sla_hours = NULL,
             sla_reminder_before_hours = NULL,
             updated_at = now()
       WHERE module_code = 'payroll_bank_card'
         AND business_scope = 'beilun'
    `);
    await queryRunner.query(`
      UPDATE action_configs
         SET is_active = false, updated_at = now()
       WHERE module_code = 'payroll_bank_card'
         AND business_scope = 'beilun'
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
  }

  public async down(): Promise<void> {
    // The former workflow configuration represented an incorrect business rule and is not restored.
  }
}
