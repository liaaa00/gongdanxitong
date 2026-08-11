import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeContractTermConditionallyRequired20260810002000 implements MigrationInterface {
  name = 'MakeContractTermConditionallyRequired20260810002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE field_configs
      SET
        is_required = false,
        default_required = false,
        conditional_required = '{"field":"contract_term_type","op":"NEQ","value":"无固定期限"}'::jsonb,
        help_text = CASE
          WHEN field_code = 'contract_term' THEN '固定期限时必填，如3年。'
          ELSE '固定期限时必填。标准格式：年-月-日。'
        END
      WHERE field_code IN ('contract_term', 'contract_end_date')
    `);

    await queryRunner.query(`
      UPDATE import_template_fields
      SET is_required_override = NULL, updated_at = now()
      WHERE order_type = 'onboarding'::order_type_enum
        AND field_code IN ('contract_term', 'contract_end_date')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE import_template_fields
      SET is_required_override = true, updated_at = now()
      WHERE order_type = 'onboarding'::order_type_enum
        AND field_code IN ('contract_term', 'contract_end_date')
    `);

    await queryRunner.query(`
      UPDATE field_configs
      SET
        is_required = true,
        default_required = true,
        conditional_required = NULL,
        help_text = CASE
          WHEN field_code = 'contract_term' THEN NULL
          ELSE '标准格式：年-月-日。'
        END
      WHERE field_code IN ('contract_term', 'contract_end_date')
    `);
  }
}
