import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBeilunTotalPayrollLocation20260824001000 implements MigrationInterface {
  name = 'AddBeilunTotalPayrollLocation20260824001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE field_configs
          SET dropdown_options = CASE
                WHEN COALESCE(dropdown_options, '[]'::jsonb) @> '["北仑总发薪"]'::jsonb
                  THEN COALESCE(dropdown_options, '[]'::jsonb)
                ELSE COALESCE(dropdown_options, '[]'::jsonb) || '["北仑总发薪"]'::jsonb
              END,
              help_text = '沿用薪酬银行卡模板的67项发薪地，包含北仑总发薪，独立选择，不与合同主体联动。'
        WHERE field_code = 'payroll_location'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE field_configs
          SET dropdown_options = COALESCE(dropdown_options, '[]'::jsonb) - '北仑总发薪',
              help_text = '沿用薪酬银行卡模板的66项发薪地，独立选择，不与合同主体联动。'
        WHERE field_code = 'payroll_location'`,
    );
  }
}
