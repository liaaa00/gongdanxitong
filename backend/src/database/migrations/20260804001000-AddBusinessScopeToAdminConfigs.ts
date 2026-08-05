import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBusinessScopeToAdminConfigs20260804001000 implements MigrationInterface {
  name = 'AddBusinessScopeToAdminConfigs20260804001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE work_order_modules ADD COLUMN IF NOT EXISTS business_scope varchar(32) NOT NULL DEFAULT 'beilun'",
    );
    await queryRunner.query(
      "ALTER TABLE detail_view_templates ADD COLUMN IF NOT EXISTS business_scope varchar(32) NOT NULL DEFAULT 'beilun'",
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_work_order_modules_business_scope ON work_order_modules(business_scope)',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_detail_view_templates_business_scope ON detail_view_templates(business_scope)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_detail_view_templates_business_scope');
    await queryRunner.query('DROP INDEX IF EXISTS idx_work_order_modules_business_scope');
    await queryRunner.query('ALTER TABLE detail_view_templates DROP COLUMN IF EXISTS business_scope');
    await queryRunner.query('ALTER TABLE work_order_modules DROP COLUMN IF EXISTS business_scope');
  }
}
