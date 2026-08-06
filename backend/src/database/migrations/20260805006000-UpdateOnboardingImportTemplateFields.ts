import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateOnboardingImportTemplateFields20260805006000 implements MigrationInterface {
  name = 'UpdateOnboardingImportTemplateFields20260805006000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO field_configs (
        field_code, field_name, field_type, is_required, default_required,
        order_type, business_context, display_order, is_active,
        is_included_in_template, created_at
      )
      VALUES (
        'bank_location', '开户地', 'text', false, false,
        'onboarding'::order_type_enum, '["onboarding"]'::jsonb, 0, true,
        true, now()
      )
      ON CONFLICT (field_code) DO UPDATE SET
        field_name = EXCLUDED.field_name,
        field_type = EXCLUDED.field_type,
        is_required = EXCLUDED.is_required,
        default_required = EXCLUDED.default_required,
        order_type = EXCLUDED.order_type,
        business_context = EXCLUDED.business_context,
        is_active = true,
        is_included_in_template = true
    `);

    await queryRunner.query(`
      UPDATE field_configs
      SET field_name = '甲方住所'
      WHERE field_code = 'company_address'
    `);

    await queryRunner.query(`
      UPDATE field_configs
      SET is_included_in_template = CASE
        WHEN field_code = 'education' THEN true
        ELSE false
      END
      WHERE field_code IN ('education', 'graduation_school', 'major', 'graduation_date')
    `);

    await queryRunner.query(`
      WITH desired(field_code, display_order) AS (
        VALUES
          ('customer_name', 1),
          ('employee_name', 2),
          ('id_card_type', 3),
          ('id_card_no', 4),
          ('mobile', 5),
          ('email', 6),
          ('position', 7),
          ('position_type', 8),
          ('contract_term_type', 9),
          ('contract_term', 10),
          ('contract_start_date', 11),
          ('contract_end_date', 12),
          ('probation_start_date', 13),
          ('probation_months', 14),
          ('probation_end_date', 15),
          ('work_city', 16),
          ('work_hour_system', 17),
          ('salary_form', 18),
          ('base_salary', 19),
          ('other_salary', 20),
          ('probation_salary', 21),
          ('probation_other_salary', 22),
          ('payroll_cycle', 23),
          ('payroll_date', 24),
          ('social_location', 25),
          ('start_month', 26),
          ('social_base', 27),
          ('fund_base', 28),
          ('fund_ratio', 29),
          ('remark', 30),
          ('household_type', 31),
          ('ethnicity', 32),
          ('education', 33),
          ('marital_status', 34),
          ('current_address', 35),
          ('household_address', 36),
          ('postal_code', 37),
          ('bank_location', 38),
          ('bank_name', 39),
          ('bank_account', 40),
          ('customer_code', 41),
          ('outsource_type', 42),
          ('business_mode', 43),
          ('employee_type', 44),
          ('need_company_contract', 45),
          ('need_esign', 46),
          ('esign_platform', 47),
          ('contract_subject', 48),
          ('company_address', 49),
          ('project_name', 50),
          ('work_arrangement', 51),
          ('contract_template', 52),
          ('need_contract_urge', 53),
          ('need_onboarding_contact', 54),
          ('feedback_deadline', 55),
          ('is_common_template', 56),
          ('template_name', 57),
          ('need_company_payroll', 58),
          ('payroll_location', 59),
          ('social_urge', 60),
          ('special_remark', 61)
      )
      INSERT INTO import_template_fields (
        order_type, field_code, display_order, header_alias,
        is_required_override, is_active, business_scope, created_at, updated_at
      )
      SELECT
        'onboarding'::order_type_enum, desired.field_code, desired.display_order,
        CASE WHEN desired.field_code = 'company_address' THEN '劳动合同主体注册地' ELSE NULL END,
        NULL, true, 'beilun', now(), now()
      FROM desired
      INNER JOIN field_configs field ON field.field_code = desired.field_code
      ON CONFLICT (order_type, field_code, business_scope) DO UPDATE SET
        display_order = EXCLUDED.display_order,
        header_alias = COALESCE(EXCLUDED.header_alias, import_template_fields.header_alias),
        is_active = true,
        updated_at = now()
    `);

    await queryRunner.query(`
      WITH desired(field_code) AS (
        VALUES
          ('customer_name'), ('employee_name'), ('id_card_type'), ('id_card_no'),
          ('mobile'), ('email'), ('position'), ('position_type'), ('contract_term_type'),
          ('contract_term'), ('contract_start_date'), ('contract_end_date'),
          ('probation_start_date'), ('probation_months'), ('probation_end_date'),
          ('work_city'), ('work_hour_system'), ('salary_form'), ('base_salary'),
          ('other_salary'), ('probation_salary'), ('probation_other_salary'),
          ('payroll_cycle'), ('payroll_date'), ('social_location'), ('start_month'),
          ('social_base'), ('fund_base'), ('fund_ratio'), ('remark'), ('household_type'),
          ('ethnicity'), ('education'), ('marital_status'), ('current_address'),
          ('household_address'), ('postal_code'), ('bank_location'), ('bank_name'),
          ('bank_account'), ('customer_code'), ('outsource_type'), ('business_mode'),
          ('employee_type'), ('need_company_contract'), ('need_esign'), ('esign_platform'),
          ('contract_subject'), ('company_address'), ('project_name'), ('work_arrangement'),
          ('contract_template'), ('need_contract_urge'), ('need_onboarding_contact'),
          ('feedback_deadline'), ('is_common_template'), ('template_name'),
          ('need_company_payroll'), ('payroll_location'), ('social_urge'), ('special_remark')
      )
      UPDATE import_template_fields template
      SET is_active = false, updated_at = now()
      WHERE template.order_type = 'onboarding'::order_type_enum
        AND template.business_scope = 'beilun'
        AND NOT EXISTS (
          SELECT 1 FROM desired WHERE desired.field_code = template.field_code
        )
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // The preceding onboarding migration owns the old 63-field rollback state.
  }
}
