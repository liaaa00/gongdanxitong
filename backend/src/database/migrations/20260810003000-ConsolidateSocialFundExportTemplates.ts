import { MigrationInterface, QueryRunner } from 'typeorm';
import { getSocialFundExportFieldList, getSocialFundExportTemplateName } from '../../modules/admin/export-templates/social-fund-export';

const SPECS = [
  {
    moduleCode: 'social_insurance',
    legacyNames: ['社保公积金增员导出模板', '社保公积金增员导出表'],
  },
  {
    moduleCode: 'resignation_social_insurance',
    legacyNames: ['社保公积金减员导出模板', '社保公积金减员导出表'],
  },
] as const;

export class ConsolidateSocialFundExportTemplates20260810003000 implements MigrationInterface {
  name = 'ConsolidateSocialFundExportTemplates20260810003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const spec of SPECS) {
      const canonicalName = getSocialFundExportTemplateName(spec.moduleCode);
      const fieldList = getSocialFundExportFieldList(spec.moduleCode);
      if (!canonicalName || !fieldList) continue;

      const names = [canonicalName, ...spec.legacyNames];
      const existing = await queryRunner.query(
        `SELECT id, template_name
           FROM export_templates
          WHERE module_code = $1
            AND business_scope = 'beilun'
            AND sign_platform IS NULL
            AND template_name = ANY($2::varchar[])
          ORDER BY CASE WHEN template_name = $3 THEN 0 ELSE 1 END, created_at ASC`,
        [spec.moduleCode, names, canonicalName],
      ) as Array<{ id: string; template_name: string }>;

      let keeperId = existing[0]?.id;
      if (!keeperId) {
        const inserted = await queryRunner.query(
          `INSERT INTO export_templates (
             template_name, module_code, field_list, created_by,
             is_shared, sign_platform, business_scope
           )
           SELECT $1, $2, $3::jsonb, id, true, NULL, 'beilun'
             FROM users
            WHERE username = 'admin'
              AND is_active = true
            LIMIT 1
           RETURNING id`,
          [canonicalName, spec.moduleCode, JSON.stringify(fieldList)],
        ) as Array<{ id: string }>;
        keeperId = inserted[0]?.id;
      }

      if (!keeperId) continue;

      await queryRunner.query(
        `UPDATE export_templates
            SET template_name = $1,
                field_list = $2::jsonb,
                is_shared = true,
                sign_platform = NULL,
                business_scope = 'beilun'
          WHERE id = $3`,
        [canonicalName, JSON.stringify(fieldList), keeperId],
      );

      await queryRunner.query(
        `DELETE FROM export_templates
          WHERE module_code = $1
            AND business_scope = 'beilun'
            AND sign_platform IS NULL
            AND id <> $2
            AND template_name = ANY($3::varchar[])`,
        [spec.moduleCode, keeperId, names],
      );
    }
  }

  // This is a data consolidation; rolling back would reintroduce the stale
  // templates that this migration intentionally removes.
  public async down(): Promise<void> {}
}
