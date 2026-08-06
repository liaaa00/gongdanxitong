import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemovePostalCodeFromOnboardingTemplate20260806002000 implements MigrationInterface {
  name = 'RemovePostalCodeFromOnboardingTemplate20260806002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Keep postal_code as an active system field, but remove it from the standard customer template.
    await queryRunner.query(`
      UPDATE field_configs
      SET is_included_in_template = false
      WHERE field_code = 'postal_code'
        AND order_type = 'onboarding'::order_type_enum
    `);

    await queryRunner.query(`
      UPDATE import_template_fields
      SET is_active = false, updated_at = now()
      WHERE order_type = 'onboarding'::order_type_enum
        AND business_scope = 'beilun'
        AND field_code = 'postal_code'
    `);

    await queryRunner.query(`
      UPDATE import_template_fields
      SET display_order = display_order - 1, updated_at = now()
      WHERE order_type = 'onboarding'::order_type_enum
        AND business_scope = 'beilun'
        AND is_active = true
        AND display_order > 37
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE import_template_fields
      SET display_order = display_order + 1, updated_at = now()
      WHERE order_type = 'onboarding'::order_type_enum
        AND business_scope = 'beilun'
        AND is_active = true
        AND display_order >= 37
    `);

    await queryRunner.query(`
      UPDATE import_template_fields
      SET is_active = true, display_order = 37, updated_at = now()
      WHERE order_type = 'onboarding'::order_type_enum
        AND business_scope = 'beilun'
        AND field_code = 'postal_code'
    `);

    await queryRunner.query(`
      UPDATE field_configs
      SET is_included_in_template = true
      WHERE field_code = 'postal_code'
        AND order_type = 'onboarding'::order_type_enum
    `);
  }
}
