import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnsureFieldConfigTemplateFlag20260805005500 implements MigrationInterface {
  name = 'EnsureFieldConfigTemplateFlag20260805005500';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE field_configs
      ADD COLUMN IF NOT EXISTS is_included_in_template boolean NOT NULL DEFAULT true
    `);

    await queryRunner.query(`
      UPDATE field_configs
      SET is_included_in_template = false
      WHERE field_code IN ('education', 'graduation_school', 'major', 'graduation_date')
        AND is_active = true
    `);
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    // Preserve template inclusion configuration if this compatibility migration is reverted.
  }
}
