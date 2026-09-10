import { MigrationInterface, QueryRunner } from 'typeorm';

export class AllowContractEsignPlatformSupplement20260908000000 implements MigrationInterface {
  name = 'AllowContractEsignPlatformSupplement20260908000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO field_supplement_rules (field_code, supplementer_module, sync_to_modules, is_active)
      SELECT 'esign_platform', 'contract', NULL, true
      WHERE NOT EXISTS (
        SELECT 1 FROM field_supplement_rules
         WHERE field_code = 'esign_platform'
           AND supplementer_module = 'contract'
      )
    `);

    await queryRunner.query(`
      UPDATE detail_view_templates template
         SET field_list = COALESCE(template.field_list, '[]'::jsonb)
                        || '[{"fieldCode":"esign_platform","kind":"field"}]'::jsonb,
             updated_at = now()
       WHERE template.module_code = 'contract'
         AND template.is_active = true
         AND NOT EXISTS (
           SELECT 1
             FROM jsonb_array_elements(COALESCE(template.field_list, '[]'::jsonb)) item
            WHERE COALESCE(item->>'fieldCode', item->>'field_code') = 'esign_platform'
         )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM field_supplement_rules
       WHERE field_code = 'esign_platform'
         AND supplementer_module = 'contract'
    `);
  }
}
