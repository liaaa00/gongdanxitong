import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExportTemplateSignPlatform20260609002000 implements MigrationInterface {
  name = 'ExportTemplateSignPlatform20260609002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "export_templates"
      ADD COLUMN IF NOT EXISTS "sign_platform" varchar(16)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "export_templates"
      DROP COLUMN IF EXISTS "sign_platform"
    `);
  }
}
