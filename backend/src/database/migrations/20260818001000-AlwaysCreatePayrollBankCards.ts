import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlwaysCreatePayrollBankCards20260818001000 implements MigrationInterface {
  name = 'AlwaysCreatePayrollBankCards20260818001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // 只修正未来派单规则；历史已存在的子工单不在 migration 中处理。
    await queryRunner.query(
      "UPDATE dispatch_rules SET trigger_conditions = NULL WHERE order_type = 'onboarding' AND (target_module = 'payroll_bank_card' OR sub_module = 'payroll_bank_card') AND is_active = true",
    );
    await queryRunner.query(
      "UPDATE field_configs SET help_text = '仅用于薪酬银行卡页面显示，不决定银行卡记录生成或导出资格。' WHERE field_code = 'need_payroll_slip' AND help_text = '选择“是”时生成薪酬银行卡子工单。'",
    );
  }

  async down(): Promise<void> {
    // 不恢复旧的工资单触发条件，避免回滚重新产生错误的派单口径。
  }
}
