import { MigrationInterface, QueryRunner } from 'typeorm';

export class CorrectOnboardingSystemAndTemplateFields20260805007000 implements MigrationInterface {
  name = 'CorrectOnboardingSystemAndTemplateFields20260805007000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE field_configs
      SET field_name = '甲方住所'
      WHERE field_code = 'company_address'
    `);

    await queryRunner.query(`
      UPDATE import_template_fields
      SET header_alias = '劳动合同主体注册地', updated_at = now()
      WHERE order_type = 'onboarding'::order_type_enum
        AND field_code = 'company_address'
        AND business_scope = 'beilun'
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // The preceding onboarding migration owns the template field definition.
  }
}
