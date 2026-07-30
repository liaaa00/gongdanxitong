import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixResignationContactVisibility20260729003000 implements MigrationInterface {
  name = 'FixResignationContactVisibility20260729003000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO field_permissions (id, role_id, field_code, permission, scenario)
      SELECT
        uuid_generate_v4(),
        role.id,
        field.field_code,
        (CASE WHEN role.code = 'admin' THEN 'visible' ELSE 'readonly' END)::field_permission_mode_enum,
        'dispatched:resignation_contact'
      FROM roles role
      CROSS JOIN (VALUES ('mobile'), ('email')) AS field(field_code)
      WHERE role.code IN (
        'onboarding_resignation_member', 'shared_team_owner', 'onboarding_specialist',
        'shared_leader', 'admin', 'business_owner', 'business_group_leader',
        'biz_manager', 'biz_leader'
      )
      ON CONFLICT (role_id, field_code, scenario)
      DO UPDATE SET permission = EXCLUDED.permission
    `);

    await queryRunner.query(`
      UPDATE dispatched_orders
      SET visible_fields = COALESCE(visible_fields, '[]'::jsonb) || '["mobile"]'::jsonb
      WHERE module_code = 'resignation_contact'
        AND NOT COALESCE(visible_fields, '[]'::jsonb) ? 'mobile'
    `);
    await queryRunner.query(`
      UPDATE dispatched_orders
      SET visible_fields = COALESCE(visible_fields, '[]'::jsonb) || '["email"]'::jsonb
      WHERE module_code = 'resignation_contact'
        AND NOT COALESCE(visible_fields, '[]'::jsonb) ? 'email'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE dispatched_orders
      SET visible_fields = COALESCE(visible_fields, '[]'::jsonb) - 'mobile' - 'email'
      WHERE module_code = 'resignation_contact'
    `);
    await queryRunner.query(`
      UPDATE field_permissions permission
      SET permission = 'hidden'
      FROM roles role
      WHERE permission.role_id = role.id
        AND permission.scenario = 'dispatched:resignation_contact'
        AND permission.field_code IN ('mobile', 'email')
        AND role.code IN (
          'onboarding_resignation_member', 'shared_team_owner', 'onboarding_specialist',
          'shared_leader', 'admin', 'business_owner', 'business_group_leader',
          'biz_manager', 'biz_leader'
        )
    `);
  }
}
