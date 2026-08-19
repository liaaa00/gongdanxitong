import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRegionalSpecialFundField20260817004000 implements MigrationInterface {
  name = 'AddRegionalSpecialFundField20260817004000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE field_configs
       SET is_active = true,
           is_included_in_template = false,
           is_required = false,
           default_required = false,
           business_context = '[\"onboarding\",\"resignation\"]'::jsonb
       WHERE field_code = 'supplementary_fund_ratio'`,
    );

    await queryRunner.query(
      `WITH configured(module_code, display_order) AS (
         VALUES ('social_insurance', 9), ('resignation_social_insurance', 6)
       )
       INSERT INTO module_fields (
         module_code, business_scope, field_code, group_name, display_order,
         is_required_override, is_active, created_at, updated_at
       )
       SELECT configured.module_code, scope.business_scope, 'supplementary_fund_ratio',
              '社保公积金', configured.display_order, false, true, now(), now()
       FROM configured
       CROSS JOIN (VALUES ('beilun'), ('out_of_province')) AS scope(business_scope)
       ON CONFLICT (module_code, field_code, business_scope) DO UPDATE
         SET group_name = EXCLUDED.group_name,
             display_order = EXCLUDED.display_order,
             is_required_override = false,
             is_active = true,
             updated_at = now()`,
    );

    await queryRunner.query(
      `WITH source AS (
         SELECT role_id, permission, scenario, business_scope
         FROM field_permissions
         WHERE field_code = 'fund_ratio'
           AND scenario = 'dispatched:social_insurance'
       )
       INSERT INTO field_permissions (
         role_id, field_code, permission, scenario, business_scope, created_at
       )
       SELECT role_id, 'supplementary_fund_ratio', permission, scenario, business_scope, now()
       FROM source
       ON CONFLICT (role_id, field_code, scenario, business_scope) DO UPDATE
         SET permission = EXCLUDED.permission`,
    );

    await queryRunner.query(
      `WITH source AS (
         SELECT role_id, permission, scenario, business_scope
         FROM field_permissions
         WHERE field_code = 'social_insurance_result'
           AND scenario = 'dispatched:resignation_social_insurance'
       )
       INSERT INTO field_permissions (
         role_id, field_code, permission, scenario, business_scope, created_at
       )
       SELECT role_id, 'supplementary_fund_ratio', permission, scenario, business_scope, now()
       FROM source
       ON CONFLICT (role_id, field_code, scenario, business_scope) DO UPDATE
         SET permission = EXCLUDED.permission`,
    );

    await queryRunner.query(
      `UPDATE dispatched_orders
       SET visible_fields = CASE module_code
         WHEN 'social_insurance' THEN visible_fields || '[\"supplementary_fund_ratio\"]'::jsonb
         WHEN 'resignation_social_insurance' THEN visible_fields || '[\"supplementary_fund_ratio\"]'::jsonb
         ELSE visible_fields
       END
       WHERE module_code IN ('social_insurance', 'resignation_social_insurance')
         AND NOT (visible_fields @> '[\"supplementary_fund_ratio\"]'::jsonb)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM module_fields
       WHERE field_code = 'supplementary_fund_ratio'
         AND module_code IN ('social_insurance', 'resignation_social_insurance')`,
    );
    await queryRunner.query(
      `DELETE FROM field_permissions
       WHERE field_code = 'supplementary_fund_ratio'
         AND scenario IN ('dispatched:social_insurance', 'dispatched:resignation_social_insurance')`,
    );
  }
}
