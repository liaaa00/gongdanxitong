import { MigrationInterface, QueryRunner } from 'typeorm';

const currentAddressHelp = '入职材料不需要集约收集时必填。格式：X省X市X区X路X号X室。';
const currentAddressOldHelp = '格式：X省X市X区X路X号X室。';
const probationStartHelp = '填写后，试用期（月）、试用期结束日期和试用期工资必填。标准格式：年-月-日。';
const probationStartOldHelp = '标准格式：年-月-日。';
const needOnboardingContactNo = `'{"op":"EQ","field":"need_onboarding_contact","value":"否"}'::jsonb`;
const probationStartExists = `'{"op":"EXISTS","field":"probation_start_date"}'::jsonb`;

export class OnboardingConditionalRequiredRules20260722001000 implements MigrationInterface {
  name = 'OnboardingConditionalRequiredRules20260722001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE field_configs
         SET is_required = false,
             default_required = false,
             conditional_required = ${needOnboardingContactNo},
             help_text = $1
       WHERE order_type = 'onboarding'
         AND field_code = 'current_address'
    `, [currentAddressHelp]);

    await queryRunner.query(`
      UPDATE field_configs
         SET is_required = false,
             default_required = false,
             conditional_required = NULL,
             help_text = $1
       WHERE order_type = 'onboarding'
         AND field_code = 'probation_start_date'
    `, [probationStartHelp]);

    await queryRunner.query(`
      UPDATE field_configs
         SET is_required = false,
             default_required = false,
             conditional_required = ${probationStartExists}
       WHERE order_type = 'onboarding'
         AND field_code IN ('probation_months', 'probation_end_date', 'probation_salary')
    `);

    await queryRunner.query(`
      UPDATE import_template_fields
         SET is_required_override = NULL
       WHERE order_type = 'onboarding'
         AND field_code IN (
           'current_address',
           'probation_start_date',
           'probation_months',
           'probation_end_date',
           'probation_salary'
         )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE field_configs
         SET is_required = false,
             default_required = false,
             conditional_required = NULL,
             help_text = $1
       WHERE order_type = 'onboarding'
         AND field_code = 'current_address'
    `, [currentAddressOldHelp]);

    await queryRunner.query(`
      UPDATE field_configs
         SET is_required = true,
             default_required = true,
             conditional_required = NULL,
             help_text = $1
       WHERE order_type = 'onboarding'
         AND field_code = 'probation_start_date'
    `, [probationStartOldHelp]);

    await queryRunner.query(`
      UPDATE field_configs
         SET is_required = true,
             default_required = true,
             conditional_required = NULL
       WHERE order_type = 'onboarding'
         AND field_code IN ('probation_months', 'probation_end_date')
    `);

    await queryRunner.query(`
      UPDATE field_configs
         SET is_required = false,
             default_required = false,
             conditional_required = NULL
       WHERE order_type = 'onboarding'
         AND field_code = 'probation_salary'
    `);

    await queryRunner.query(`
      UPDATE import_template_fields
         SET is_required_override = false
       WHERE order_type = 'onboarding'
         AND field_code IN (
           'current_address',
           'probation_start_date',
           'probation_months',
           'probation_end_date',
           'probation_salary'
         )
    `);
  }
}
