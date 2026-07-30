import { MigrationInterface, QueryRunner } from 'typeorm';

const salaryTextHelp = '可填写数字、货币格式或文字说明。';
const salaryNumberHelp = '数字格式：保留小数点后两位。';

export class OnboardingBaseAndProbationSalaryText20260724001000 implements MigrationInterface {
  name = 'OnboardingBaseAndProbationSalaryText20260724001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE field_configs
         SET field_type = 'text',
             help_text = $1
       WHERE order_type = 'onboarding'
         AND field_code IN ('base_salary', 'probation_salary')
    `, [salaryTextHelp]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE field_configs
         SET field_type = 'number',
             help_text = $1
       WHERE order_type = 'onboarding'
         AND field_code IN ('base_salary', 'probation_salary')
    `, [salaryNumberHelp]);
  }
}
