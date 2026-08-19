import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConfigureResignationCertificateFormat20260816001000 implements MigrationInterface {
  name = 'ConfigureResignationCertificateFormat20260816001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO field_configs (
        field_code, field_name, field_type, is_required, default_required,
        conditional_required, validation_regex, validation_msg, dropdown_options,
        collection_group, placeholder, help_text, order_type, business_context,
        display_order, is_active, is_included_in_template
      )
      VALUES (
        'resignation_cert_format', '离职证明形式', 'dropdown', false, false,
        '{"op":"EQ","field":"need_resignation_cert","value":"是"}'::jsonb,
        NULL, NULL, '["电子证明","纸质证明"]'::jsonb,
        '离职信息', '请选择离职证明形式',
        '需要开具离职证明时必填：电子证明或纸质证明。',
        'resignation', '["resignation"]'::jsonb,
        17, true, true
      )
      ON CONFLICT (field_code) DO UPDATE SET
        field_name = EXCLUDED.field_name,
        field_type = EXCLUDED.field_type,
        is_required = false,
        default_required = false,
        conditional_required = EXCLUDED.conditional_required,
        dropdown_options = EXCLUDED.dropdown_options,
        collection_group = EXCLUDED.collection_group,
        placeholder = EXCLUDED.placeholder,
        help_text = EXCLUDED.help_text,
        order_type = EXCLUDED.order_type,
        business_context = EXCLUDED.business_context,
        is_active = true,
        is_included_in_template = true
    `);

    await queryRunner.query(`
      UPDATE import_template_fields target
      SET display_order = target.display_order + 1,
          updated_at = now()
      FROM import_template_fields cert
      WHERE target.order_type = 'resignation'
        AND target.business_scope = cert.business_scope
        AND cert.order_type = 'resignation'
        AND cert.field_code = 'need_resignation_cert'
        AND target.display_order > cert.display_order
        AND NOT EXISTS (
          SELECT 1
          FROM import_template_fields existing
          WHERE existing.order_type = 'resignation'
            AND existing.field_code = 'resignation_cert_format'
            AND existing.business_scope = target.business_scope
        )
    `);

    await queryRunner.query(`
      INSERT INTO import_template_fields (
        order_type, field_code, display_order, header_alias,
        is_required_override, is_active, business_scope
      )
      SELECT
        'resignation',
        'resignation_cert_format',
        cert.display_order + 1,
        NULL,
        false,
        true,
        cert.business_scope
      FROM import_template_fields cert
      WHERE cert.order_type = 'resignation'
        AND cert.field_code = 'need_resignation_cert'
      ON CONFLICT (order_type, field_code, business_scope) DO UPDATE SET
        display_order = EXCLUDED.display_order,
        is_required_override = false,
        is_active = true,
        updated_at = now()
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE import_template_fields
      SET is_active = false
      WHERE order_type = 'resignation'
        AND field_code = 'resignation_cert_format'
    `);
    await queryRunner.query(`
      UPDATE field_configs
      SET is_active = false
      WHERE field_code = 'resignation_cert_format'
    `);
  }
}
