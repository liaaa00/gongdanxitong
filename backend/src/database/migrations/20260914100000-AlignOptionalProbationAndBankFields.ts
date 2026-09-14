import { MigrationInterface, QueryRunner } from 'typeorm';

/** Apply the reviewed seed changes without reseeding production accounts or configuration. */
export class AlignOptionalProbationAndBankFields20260914100000 implements MigrationInterface {
  name = 'AlignOptionalProbationAndBankFields20260914100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Only remove the legacy default; retain administrator-defined conditions.
    await queryRunner.query(`
      UPDATE field_configs SET conditional_required = NULL
      WHERE field_code IN ('probation_months', 'probation_end_date', 'probation_salary')
        AND conditional_required = '{"op":"EXISTS","field":"probation_start_date"}'::jsonb
        AND is_required = false AND default_required = false
    `);
    await queryRunner.query(`
      INSERT INTO field_permissions (role_id, field_code, scenario, permission, business_scope)
      SELECT r.id, f.field_code, 'dispatched:onboarding_contact',
        CASE WHEN r.code IN ('business_owner','business_group_leader','business_group_member',
          'biz_manager','biz_leader','biz_member') THEN 'readonly' ELSE 'visible' END::field_permission_mode_enum,
        s.business_scope
      FROM roles r
      CROSS JOIN field_configs f
      CROSS JOIN (VALUES ('beilun'), ('out_of_province')) s(business_scope)
      WHERE f.field_code IN ('bank_name','bank_account')
        AND r.code IN ('admin','welfare_specialist','onboarding_resignation_member','shared_team_owner',
          'onboarding_specialist','shared_leader','business_owner','business_group_leader',
          'business_group_member','biz_manager','biz_leader','biz_member')
      ON CONFLICT (role_id, field_code, scenario, business_scope)
      DO UPDATE SET permission = EXCLUDED.permission
      WHERE field_permissions.permission = 'hidden'
    `);
  }

  async down(): Promise<void> {
    // Do not erase subsequently edited permissions or reinstate obsolete required fields.
    // Release rollback uses the reviewed pre-release configuration backup when necessary.
  }
}
