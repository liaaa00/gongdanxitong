import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateImportTemplateFields20260610001000 implements MigrationInterface {
  name = 'CreateImportTemplateFields20260610001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS import_template_fields (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        order_type order_type_enum NOT NULL,
        field_code varchar(128) NOT NULL,
        display_order int NOT NULL DEFAULT 0,
        header_alias varchar(128) NULL,
        is_required_override boolean NULL,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_import_template_fields_order_field UNIQUE(order_type, field_code),
        CONSTRAINT fk_import_template_fields_field FOREIGN KEY(field_code) REFERENCES field_configs(field_code) ON DELETE CASCADE
      )
    `);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_import_template_fields_order ON import_template_fields(order_type, is_active, display_order)');

    await queryRunner.query(`
      INSERT INTO import_template_fields(order_type, field_code, display_order, header_alias, is_required_override, is_active)
      SELECT 'onboarding'::order_type_enum, field_code, ROW_NUMBER() OVER (ORDER BY display_order ASC, created_at ASC), NULL, NULL, true
      FROM field_configs
      WHERE is_active = true
        AND (order_type = 'onboarding'::order_type_enum OR business_context @> '["onboarding"]'::jsonb)
        AND field_code NOT IN ('contract_feedback', 'onboarding_feedback', 'data_entry_feedback', 'contract_template')
      ON CONFLICT (order_type, field_code) DO NOTHING
    `);

    await queryRunner.query(`
      WITH configured(field_code, display_order) AS (
        VALUES
          ('employee_name', 1),
          ('id_card_no', 2),
          ('social_pay_region', 3),
          ('social_stop_month', 4),
          ('resignation_reason', 5),
          ('resignation_date', 6),
          ('need_resignation_share', 7),
          ('feedback_deadline', 8),
          ('is_common_template', 9),
          ('template_name', 10)
      )
      INSERT INTO import_template_fields(order_type, field_code, display_order, header_alias, is_required_override, is_active)
      SELECT 'resignation'::order_type_enum, c.field_code, c.display_order, NULL, NULL, true
      FROM configured c
      INNER JOIN field_configs f ON f.field_code = c.field_code AND f.is_active = true
      ON CONFLICT (order_type, field_code) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_import_template_fields_order');
    await queryRunner.query('DROP TABLE IF EXISTS import_template_fields');
  }
}
