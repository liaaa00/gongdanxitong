import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Keep supplementary fund ratio as a conditional system field, but remove it
 * from the universal onboarding workbook. Regional templates can opt into it.
 */
export class RemoveSupplementaryFundFromUniversalTemplate20260817001000 implements MigrationInterface {
  name = 'RemoveSupplementaryFundFromUniversalTemplate20260817001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE field_configs
       SET is_included_in_template = false,
           is_active = true,
           is_required = false,
           default_required = false
       WHERE field_code = 'supplementary_fund_ratio'`,
    );
    await queryRunner.query(
      `UPDATE import_template_fields
       SET is_active = false,
           updated_at = now()
       WHERE order_type = 'onboarding'
         AND field_code = 'supplementary_fund_ratio'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE field_configs
       SET is_included_in_template = true
       WHERE field_code = 'supplementary_fund_ratio'`,
    );
    await queryRunner.query(
      `UPDATE import_template_fields
       SET is_active = true,
           updated_at = now()
       WHERE order_type = 'onboarding'
         AND field_code = 'supplementary_fund_ratio'`,
    );
  }
}
