import { MigrationInterface, QueryRunner } from 'typeorm';

export class RestoreSocialUrgeField20260520004000 implements MigrationInterface {
  name = 'RestoreSocialUrgeField20260520004000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO field_configs (
        field_code, field_name, field_type, is_required, default_required,
        dropdown_options, collection_group, help_text, order_type, business_context,
        display_order, is_active
      )
      VALUES (
        'social_urge',
        '社保公积金未办是否需要催办',
        'dropdown',
        true,
        true,
        '["是","否"]'::jsonb,
        '社保公积金信息',
        '导入表中必须维护“是/否”；未维护或填写异常时该行导入失败。',
        'onboarding',
        '["onboarding"]'::jsonb,
        107,
        true
      )
      ON CONFLICT (field_code) DO UPDATE
        SET field_name = EXCLUDED.field_name,
            field_type = EXCLUDED.field_type,
            is_required = EXCLUDED.is_required,
            default_required = EXCLUDED.default_required,
            dropdown_options = EXCLUDED.dropdown_options,
            collection_group = EXCLUDED.collection_group,
            help_text = EXCLUDED.help_text,
            order_type = EXCLUDED.order_type,
            business_context = EXCLUDED.business_context,
            is_active = true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE field_configs
         SET is_active = false,
             is_required = false,
             default_required = false,
             collection_group = NULL
       WHERE field_code = 'social_urge'
    `);
  }
}
