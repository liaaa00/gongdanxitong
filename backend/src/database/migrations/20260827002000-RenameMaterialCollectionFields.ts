import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameMaterialCollectionFields20260827002000 implements MigrationInterface {
  name = 'RenameMaterialCollectionFields20260827002000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE field_configs
         SET field_name = '是否使用通用材料'
       WHERE field_code = 'is_common_template'
    `);
    await queryRunner.query(`
      UPDATE field_configs
         SET field_name = '特殊材料收集内容',
             help_text = '选择否时填写额外需要收集的材料，例如学生证、毕业证。'
       WHERE field_code = 'template_name'
    `);
    await queryRunner.query(`
      UPDATE export_templates template
         SET field_list = COALESCE((
           SELECT jsonb_agg(
                    CASE
                      WHEN item->>'fieldCode' = 'is_common_template'
                        THEN jsonb_set(item, '{alias}', to_jsonb('是否使用通用材料'::text))
                      WHEN item->>'fieldCode' = 'template_name'
                        THEN jsonb_set(item, '{alias}', to_jsonb('特殊材料收集内容'::text))
                      ELSE item
                    END
                    ORDER BY ord
                  )
             FROM jsonb_array_elements(COALESCE(template.field_list, '[]'::jsonb))
                  WITH ORDINALITY AS elements(item, ord)
         ), '[]'::jsonb)
       WHERE template.module_code IN ('onboarding_contact', 'resignation_contact')
    `);
  }

  async down(): Promise<void> {
    // ponytail: retain the clarified labels during rollback; historical aliases remain accepted on import.
  }
}
