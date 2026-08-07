import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameSocialLocationLabel20260807001000 implements MigrationInterface {
  name = 'RenameSocialLocationLabel20260807001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE field_configs
      SET field_name = '参保机构名称',
          placeholder = CASE
            WHEN placeholder = '请输入参保地' THEN '请输入参保机构名称'
            ELSE placeholder
          END
      WHERE field_code = 'social_location'
    `);

    await queryRunner.query(`
      UPDATE import_template_fields
      SET header_alias = '参保机构名称', updated_at = now()
      WHERE order_type = 'onboarding'::order_type_enum
        AND field_code = 'social_location'
    `);

    await queryRunner.query(`
      UPDATE export_templates
      SET field_list = (
        SELECT jsonb_agg(
          CASE
            WHEN COALESCE(item ->> 'fieldCode', item ->> 'field_code') = 'social_location'
              THEN jsonb_set(
                jsonb_set(item, '{alias}', to_jsonb('参保机构名称'::text), true),
                '{title}',
                to_jsonb('参保机构名称'::text),
                true
              )
            ELSE item
          END
          ORDER BY ordinal
        )
        FROM jsonb_array_elements(field_list) WITH ORDINALITY AS fields(item, ordinal)
      )
      WHERE module_code = 'social_insurance'
        AND jsonb_typeof(field_list) = 'array'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE export_templates
      SET field_list = (
        SELECT jsonb_agg(
          CASE
            WHEN COALESCE(item ->> 'fieldCode', item ->> 'field_code') = 'social_location'
              THEN jsonb_set(
                jsonb_set(item, '{alias}', to_jsonb('社保参缴地'::text), true),
                '{title}',
                to_jsonb('社保参缴地'::text),
                true
              )
            ELSE item
          END
          ORDER BY ordinal
        )
        FROM jsonb_array_elements(field_list) WITH ORDINALITY AS fields(item, ordinal)
      )
      WHERE module_code = 'social_insurance'
        AND jsonb_typeof(field_list) = 'array'
    `);

    await queryRunner.query(`
      UPDATE import_template_fields
      SET header_alias = '参保地', updated_at = now()
      WHERE order_type = 'onboarding'::order_type_enum
        AND field_code = 'social_location'
    `);

    await queryRunner.query(`
      UPDATE field_configs
      SET field_name = '参保地',
          placeholder = CASE
            WHEN placeholder = '请输入参保机构名称' THEN '请输入参保地'
            ELSE placeholder
          END
      WHERE field_code = 'social_location'
    `);
  }
}
