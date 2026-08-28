import { MigrationInterface, QueryRunner } from 'typeorm';

export class RestoreSupplementaryFundInOnboardingTemplate20260828002000 implements MigrationInterface {
  name = 'RestoreSupplementaryFundInOnboardingTemplate20260828002000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE field_configs
         SET is_included_in_template = true,
             is_active = true,
             is_required = false,
             default_required = false
       WHERE field_code = 'supplementary_fund_ratio'
    `);

    await queryRunner.query(`
      UPDATE import_template_fields target
         SET display_order = target.display_order + 1,
             updated_at = now()
        FROM import_template_fields fund
       WHERE target.order_type = 'onboarding'::order_type_enum
         AND target.field_code <> 'supplementary_fund_ratio'
         AND target.display_order > fund.display_order
         AND fund.order_type = 'onboarding'::order_type_enum
         AND fund.field_code = 'fund_ratio'
         AND target.business_scope IS NOT DISTINCT FROM fund.business_scope
         AND NOT EXISTS (
           SELECT 1
             FROM import_template_fields current_supplementary
            WHERE current_supplementary.order_type = 'onboarding'::order_type_enum
              AND current_supplementary.field_code = 'supplementary_fund_ratio'
              AND current_supplementary.business_scope IS NOT DISTINCT FROM fund.business_scope
              AND current_supplementary.is_active = true
              AND current_supplementary.display_order = fund.display_order + 1
         )
    `);

    await queryRunner.query(`
      INSERT INTO import_template_fields (
        order_type, field_code, display_order, header_alias,
        is_required_override, is_active, business_scope, created_at, updated_at
      )
      SELECT
        'onboarding'::order_type_enum,
        'supplementary_fund_ratio',
        fund.display_order + 1,
        NULL,
        false,
        true,
        fund.business_scope,
        now(),
        now()
      FROM import_template_fields fund
      WHERE fund.order_type = 'onboarding'::order_type_enum
        AND fund.field_code = 'fund_ratio'
      ON CONFLICT (order_type, field_code, business_scope) DO UPDATE
         SET display_order = EXCLUDED.display_order,
             is_required_override = false,
             is_active = true,
             updated_at = now()
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE import_template_fields
         SET is_active = false,
             updated_at = now()
       WHERE order_type = 'onboarding'::order_type_enum
         AND field_code = 'supplementary_fund_ratio'
    `);

    await queryRunner.query(`
      UPDATE field_configs
         SET is_included_in_template = false
       WHERE field_code = 'supplementary_fund_ratio'
    `);
  }
}
