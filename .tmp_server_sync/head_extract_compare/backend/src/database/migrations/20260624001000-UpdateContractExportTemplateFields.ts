import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateContractExportTemplateFields20260624001000 implements MigrationInterface {
  name = 'UpdateContractExportTemplateFields20260624001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      WITH patched AS (
        SELECT
          id,
          CASE sign_platform
            WHEN '速创' THEN (
              SELECT jsonb_agg(
                CASE
                  WHEN item->>'alias' = '签订方式' AND item ? 'const' THEN item || jsonb_build_object('const', '1.新签', 'header', jsonb_build_array('签订方式', '默认为“1.新签”即可'))
                  ELSE item
                END
                ORDER BY ord
              )
              FROM jsonb_array_elements(field_list) WITH ORDINALITY AS list(item, ord)
            )
            ELSE field_list
          END AS base_field_list
        FROM export_templates
        WHERE module_code = 'contract'
          AND is_shared = true
          AND sign_platform IN ('速创', 'E签宝')
      ), ensured AS (
        SELECT
          id,
          CASE
            WHEN (SELECT sign_platform FROM export_templates t WHERE t.id = patched.id) = '速创' THEN
              (CASE WHEN NOT EXISTS (SELECT 1 FROM jsonb_array_elements(base_field_list) existing WHERE COALESCE(existing->>'fieldCode', existing->>'field_code') = 'contract_template')
                    THEN base_field_list || jsonb_build_array(jsonb_build_object('fieldCode', 'contract_template', 'alias', '劳动合同模板', 'header', jsonb_build_array('劳动合同模板', ''), 'order', jsonb_array_length(base_field_list) + 1))
                    ELSE base_field_list END)
            WHEN (SELECT sign_platform FROM export_templates t WHERE t.id = patched.id) = 'E签宝' THEN
              (CASE WHEN NOT EXISTS (SELECT 1 FROM jsonb_array_elements(base_field_list) existing WHERE COALESCE(existing->>'fieldCode', existing->>'field_code') = 'contract_template')
                    THEN base_field_list || jsonb_build_array(jsonb_build_object('fieldCode', 'contract_template', 'alias', '劳动合同模板（标准模板/特殊模板）', 'header', jsonb_build_array('文件-全日制劳动合同+员工手册.pdf', '劳动合同模板（标准模板/特殊模板）', 'contract_template', ''), 'order', jsonb_array_length(base_field_list) + 1))
                    ELSE base_field_list END)
            ELSE base_field_list
          END AS field_list
        FROM patched
      ), ensured_suchuang_subject AS (
        SELECT
          id,
          CASE
            WHEN (SELECT sign_platform FROM export_templates t WHERE t.id = ensured.id) = '速创'
             AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(field_list) existing WHERE COALESCE(existing->>'fieldCode', existing->>'field_code') = 'contract_subject')
            THEN field_list || jsonb_build_array(jsonb_build_object('fieldCode', 'contract_subject', 'alias', '劳动合同主体', 'header', jsonb_build_array('劳动合同主体', ''), 'order', jsonb_array_length(field_list) + 1))
            ELSE field_list
          END AS field_list
        FROM ensured
      )
      UPDATE export_templates t
         SET field_list = ensured_suchuang_subject.field_list
        FROM ensured_suchuang_subject
       WHERE t.id = ensured_suchuang_subject.id
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE export_templates
         SET field_list = (
           SELECT COALESCE(jsonb_agg(
             CASE
               WHEN item->>'alias' = '签订方式' AND item ? 'const' THEN item || jsonb_build_object('const', '新签', 'header', jsonb_build_array('签订方式', '默认为“新签”即可'))
               ELSE item
             END
             ORDER BY ord
           ), '[]'::jsonb)
           FROM jsonb_array_elements(field_list) WITH ORDINALITY AS list(item, ord)
           WHERE NOT (
             item->>'fieldCode' IN ('contract_template', 'contract_subject')
             AND item->>'alias' IN ('劳动合同模板', '劳动合同模板（标准模板/特殊模板）', '劳动合同主体')
           )
         )
       WHERE module_code = 'contract'
         AND is_shared = true
         AND sign_platform IN ('速创', 'E签宝')
    `);
  }
}
