import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIsIncludedInTemplateToFieldConfigs1722844800000 implements MigrationInterface {
  name = 'AddIsIncludedInTemplateToFieldConfigs1722844800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 添加 is_included_in_template 字段，默认 true（所有现有字段默认包含在标准模板中）
    await queryRunner.query(`
      ALTER TABLE field_configs
      ADD COLUMN IF NOT EXISTS is_included_in_template boolean NOT NULL DEFAULT true
    `);

    // 将学历4字段设为可选字段（不包含在标准模板中）
    await queryRunner.query(`
      UPDATE field_configs
      SET is_included_in_template = false
      WHERE field_code IN ('education', 'graduation_school', 'major', 'graduation_date')
        AND is_active = true
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Preserve template inclusion configuration because later migrations depend on this column.
  }
}
