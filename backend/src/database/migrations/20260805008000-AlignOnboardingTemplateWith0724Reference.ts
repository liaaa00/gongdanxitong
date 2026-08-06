import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlignOnboardingTemplateWith0724Reference20260805008000 implements MigrationInterface {
  name = 'AlignOnboardingTemplateWith0724Reference20260805008000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE field_configs
      SET
        is_required = true,
        default_required = true,
        conditional_required = NULL,
        help_text = CASE
          WHEN field_code = 'contract_term' THEN NULL
          ELSE help_text
        END
      WHERE field_code IN ('contract_term', 'contract_end_date')
    `);

    await queryRunner.query(`
      UPDATE field_configs
      SET
        field_type = 'number',
        help_text = '数字格式：保留小数点后两位。'
      WHERE field_code IN ('base_salary', 'probation_salary')
    `);

    await queryRunner.query(`
      UPDATE field_configs
      SET help_text = '城市的名字（待确认）'
      WHERE field_code = 'bank_location'
    `);

    await queryRunner.query(`
      UPDATE field_configs
      SET
        is_required = false,
        default_required = false,
        conditional_required = NULL
      WHERE field_code = 'feedback_deadline'
    `);

    await queryRunner.query(`
      UPDATE import_template_fields
      SET
        is_required_override = CASE
          WHEN field_code IN ('contract_term', 'contract_end_date') THEN true
          WHEN field_code = 'feedback_deadline' THEN false
          ELSE is_required_override
        END,
        updated_at = now()
      WHERE order_type = 'onboarding'::order_type_enum
        AND field_code IN ('contract_term', 'contract_end_date', 'feedback_deadline')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE import_template_fields
      SET is_required_override = NULL, updated_at = now()
      WHERE order_type = 'onboarding'::order_type_enum
        AND field_code IN ('contract_term', 'contract_end_date', 'feedback_deadline')
    `);

    await queryRunner.query(`
      UPDATE field_configs
      SET
        is_required = false,
        default_required = false,
        conditional_required = '{"field":"contract_term_type","op":"NEQ","value":"无固定期限"}'::jsonb,
        help_text = CASE
          WHEN field_code = 'contract_term' THEN '固定期限时必填，如3年。'
          ELSE '标准格式：年-月-日。'
        END
      WHERE field_code IN ('contract_term', 'contract_end_date')
    `);

    await queryRunner.query(`
      UPDATE field_configs
      SET
        field_type = 'text',
        help_text = '可填写数字、货币格式或文字说明。'
      WHERE field_code IN ('base_salary', 'probation_salary')
    `);

    await queryRunner.query(`
      UPDATE field_configs
      SET help_text = NULL
      WHERE field_code = 'bank_location'
    `);

    await queryRunner.query(`
      UPDATE field_configs
      SET conditional_required = '{"field":"need_onboarding_contact","op":"EQ","value":"是"}'::jsonb
      WHERE field_code = 'feedback_deadline'
    `);
  }
}
