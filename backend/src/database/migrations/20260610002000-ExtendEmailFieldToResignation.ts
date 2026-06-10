import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExtendEmailFieldToResignation20260610002000 implements MigrationInterface {
  name = 'ExtendEmailFieldToResignation20260610002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE field_configs
      SET business_context = CASE
        WHEN business_context IS NULL THEN '["onboarding", "renewal", "resignation"]'::jsonb
        WHEN business_context @> '["resignation"]'::jsonb THEN business_context
        ELSE business_context || '["resignation"]'::jsonb
      END
      WHERE field_code = 'email'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE field_configs
      SET business_context = COALESCE(business_context, '[]'::jsonb) - 'resignation'
      WHERE field_code = 'email'
        AND order_type = 'onboarding'::order_type_enum
    `);
  }
}
