import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 在职证明数据模型建立
 * 1. 新增 certificate_types 表存储证明类型
 * 2. field_configs 表新增 certificate_type_code 列关联证明类型
 */
export class AddCertificateSupport1785259176749 implements MigrationInterface {
  name = 'AddCertificateSupport1785259176749';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 创建证明类型表
    await queryRunner.query(`
      CREATE TABLE certificate_types (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        type_code varchar(64) NOT NULL UNIQUE,
        type_name varchar(128) NOT NULL,
        description varchar(512),
        is_active boolean NOT NULL DEFAULT true,
        display_order integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_certificate_types_type_code ON certificate_types(type_code)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_certificate_types_is_active ON certificate_types(is_active)
    `);

    // field_configs 表新增 certificate_type_code 列
    await queryRunner.query(`
      ALTER TABLE field_configs
        ADD COLUMN certificate_type_code varchar(64)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_field_configs_certificate_type_code ON field_configs(certificate_type_code)
    `);

    // 添加外键约束
    await queryRunner.query(`
      ALTER TABLE field_configs
        ADD CONSTRAINT fk_field_configs_certificate_type
        FOREIGN KEY (certificate_type_code)
        REFERENCES certificate_types(type_code)
        ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 回退：移除外键
    await queryRunner.query(`
      ALTER TABLE field_configs
        DROP CONSTRAINT IF EXISTS fk_field_configs_certificate_type
    `);

    // 回退：移除索引
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_field_configs_certificate_type_code
    `);

    // 回退：移除列
    await queryRunner.query(`
      ALTER TABLE field_configs
        DROP COLUMN IF EXISTS certificate_type_code
    `);

    // 回退：删除索引
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_certificate_types_is_active
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_certificate_types_type_code
    `);

    // 回退：删除表
    await queryRunner.query(`
      DROP TABLE IF EXISTS certificate_types
    `);
  }
}
