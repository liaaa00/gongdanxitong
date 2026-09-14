import { MigrationInterface, QueryRunner } from 'typeorm';

export class UseEnteredProbationEndInContractExports20260914210000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // Replace only the shipped legacy formula, leaving custom formulas and column order intact.
    await queryRunner.query(`UPDATE export_templates t SET field_list = (
      SELECT jsonb_agg(CASE WHEN COALESCE(item->>'fieldCode', item->>'field_code') = 'probation_end_date' AND item->>'formula' = $1
        THEN item - 'formula' ELSE item END ORDER BY ordinal)
      FROM jsonb_array_elements(t.field_list) WITH ORDINALITY AS entries(item, ordinal)
    ) WHERE t.module_code = 'contract' AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(t.field_list) AS item
      WHERE COALESCE(item->>'fieldCode', item->>'field_code') = 'probation_end_date' AND item->>'formula' = $1
    )`, ['IFERROR(EDATE({probation_start_date},VALUE({probation_months}))-1,"")']);
  }

  async down(): Promise<void> {
    // Restoring the obsolete formula would discard entered dates from contract exports.
  }
}
