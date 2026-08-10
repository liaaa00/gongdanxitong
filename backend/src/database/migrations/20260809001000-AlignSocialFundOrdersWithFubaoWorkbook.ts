import { MigrationInterface, QueryRunner } from 'typeorm';

const MONTH_OPTIONS = '["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"]';

export class AlignSocialFundOrdersWithFubaoWorkbook20260809001000 implements MigrationInterface {
  name = 'AlignSocialFundOrdersWithFubaoWorkbook20260809001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO field_configs (
        field_code, field_name, field_type, is_required, default_required,
        dropdown_options, collection_group, order_type, business_context,
        display_order, is_active, is_included_in_template
      )
      VALUES
        ('insured_unit', '参保单位', 'text', true, true, NULL, '社保公积金', 'onboarding', '["onboarding","resignation"]'::jsonb, 130, true, true),
        ('fund_start_month', '公积金起缴月', 'dropdown', true, true, '${MONTH_OPTIONS}'::jsonb, '社保公积金', 'onboarding', '["onboarding"]'::jsonb, 131, true, true),
        ('fund_stop_month', '公积金停缴月', 'dropdown', true, true, '${MONTH_OPTIONS}'::jsonb, '其他字段', 'resignation', '["resignation"]'::jsonb, 132, true, true)
      ON CONFLICT (field_code) DO UPDATE
        SET field_name = EXCLUDED.field_name,
            field_type = EXCLUDED.field_type,
            is_required = EXCLUDED.is_required,
            default_required = EXCLUDED.default_required,
            dropdown_options = EXCLUDED.dropdown_options,
            collection_group = EXCLUDED.collection_group,
            business_context = EXCLUDED.business_context,
            is_active = true,
            is_included_in_template = true
    `);

    await queryRunner.query(`
      UPDATE field_configs
         SET field_name = CASE field_code
           WHEN 'start_month' THEN '社保起缴月'
           WHEN 'social_base' THEN '社保缴费工资'
           WHEN 'fund_base' THEN '公积金缴费工资'
           WHEN 'social_pay_region' THEN '缴纳地'
           WHEN 'social_stop_month' THEN '社保停缴月'
           ELSE field_name
         END,
         business_context = CASE
           WHEN field_code = 'social_pay_region' THEN '["onboarding","resignation"]'::jsonb
           ELSE business_context
         END
       WHERE field_code IN ('start_month', 'social_base', 'fund_base', 'social_pay_region', 'social_stop_month')
    `);

    await queryRunner.query(`
      UPDATE module_fields
         SET is_active = false,
             updated_at = now()
       WHERE business_scope = 'beilun'
         AND module_code IN ('social_insurance', 'resignation_social_insurance')
    `);

    await queryRunner.query(`
      WITH configured(module_code, field_code, group_name, display_order, required_override) AS (
        VALUES
          ('social_insurance', 'insured_unit', '社保公积金', 1, true),
          ('social_insurance', 'social_insurance_remark', '社保公积金', 2, false),
          ('social_insurance', 'social_pay_region', '社保公积金', 3, true),
          ('social_insurance', 'start_month', '社保公积金', 4, true),
          ('social_insurance', 'social_base', '社保公积金', 5, true),
          ('social_insurance', 'fund_start_month', '社保公积金', 6, true),
          ('social_insurance', 'fund_base', '社保公积金', 7, true),
          ('social_insurance', 'fund_ratio', '社保公积金', 8, false),
          ('social_insurance', 'social_insurance_result', '社保公积金', 9, false),
          ('social_insurance', 'medical_insurance_result', '社保公积金', 10, false),
          ('social_insurance', 'housing_fund_result', '社保公积金', 11, false),
          ('resignation_social_insurance', 'social_insurance_result', '社保公积金', 1, false),
          ('resignation_social_insurance', 'medical_insurance_result', '社保公积金', 2, false),
          ('resignation_social_insurance', 'housing_fund_result', '社保公积金', 3, false),
          ('resignation_social_insurance', 'social_pay_region', '社保公积金', 4, true),
          ('resignation_social_insurance', 'social_insurance_remark', '社保公积金', 5, false),
          ('resignation_social_insurance', 'insured_unit', '其他字段', 6, true),
          ('resignation_social_insurance', 'social_stop_month', '其他字段', 7, true),
          ('resignation_social_insurance', 'fund_stop_month', '其他字段', 8, true),
          ('resignation_social_insurance', 'last_work_date', '其他字段', 9, true)
      )
      INSERT INTO module_fields (
        module_code, business_scope, field_code, group_name, display_order,
        is_required_override, is_active, created_at, updated_at
      )
      SELECT module_code, 'beilun', field_code, group_name, display_order,
             required_override, true, now(), now()
        FROM configured
      ON CONFLICT (module_code, field_code, business_scope) DO UPDATE
        SET group_name = EXCLUDED.group_name,
            display_order = EXCLUDED.display_order,
            is_required_override = EXCLUDED.is_required_override,
            is_active = true,
            updated_at = now()
    `);

    await queryRunner.query(`
      WITH mapping(scenario, source_field, target_field) AS (
        VALUES
          ('dispatched:social_insurance', 'social_location', 'insured_unit'),
          ('dispatched:social_insurance', 'social_location', 'social_pay_region'),
          ('dispatched:social_insurance', 'start_month', 'fund_start_month'),
          ('dispatched:resignation_social_insurance', 'social_pay_region', 'insured_unit'),
          ('dispatched:resignation_social_insurance', 'social_stop_month', 'fund_stop_month'),
          ('dispatched:resignation_social_insurance', 'social_stop_month', 'last_work_date')
      )
      INSERT INTO field_permissions (role_id, field_code, permission, scenario, business_scope, created_at)
      SELECT permission.role_id, mapping.target_field, permission.permission,
             permission.scenario, permission.business_scope, now()
        FROM mapping
        JOIN field_permissions permission
          ON permission.scenario = mapping.scenario
         AND permission.field_code = mapping.source_field
      ON CONFLICT (role_id, field_code, scenario, business_scope) DO UPDATE
        SET permission = EXCLUDED.permission
    `);

    await queryRunner.query(`
      UPDATE dispatched_orders
         SET visible_fields = CASE module_code
           WHEN 'social_insurance' THEN '["insured_unit","social_insurance_remark","social_pay_region","start_month","social_base","fund_start_month","fund_base","fund_ratio","social_insurance_result","medical_insurance_result","housing_fund_result"]'::jsonb
           WHEN 'resignation_social_insurance' THEN '["social_insurance_result","medical_insurance_result","housing_fund_result","social_pay_region","social_insurance_remark","insured_unit","social_stop_month","fund_stop_month","last_work_date"]'::jsonb
           ELSE visible_fields
         END
       WHERE module_code IN ('social_insurance', 'resignation_social_insurance')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM field_permissions
       WHERE field_code IN ('insured_unit', 'fund_start_month', 'fund_stop_month')
         AND scenario IN ('dispatched:social_insurance', 'dispatched:resignation_social_insurance')
    `);

    await queryRunner.query(`
      UPDATE module_fields
         SET is_active = true,
             updated_at = now()
       WHERE business_scope = 'beilun'
         AND module_code IN ('social_insurance', 'resignation_social_insurance')
    `);

    await queryRunner.query(`
      UPDATE field_configs
         SET field_name = CASE field_code
           WHEN 'start_month' THEN '参保起始月'
           WHEN 'social_base' THEN '社保基数'
           WHEN 'fund_base' THEN '公积金基数'
           WHEN 'social_pay_region' THEN '缴纳地区'
           WHEN 'social_stop_month' THEN '社保公积金停保月'
           ELSE field_name
         END
       WHERE field_code IN ('start_month', 'social_base', 'fund_base', 'social_pay_region', 'social_stop_month')
    `);

    await queryRunner.query(`
      UPDATE field_configs
         SET is_active = false
       WHERE field_code IN ('insured_unit', 'fund_start_month', 'fund_stop_month')
    `);
  }
}
