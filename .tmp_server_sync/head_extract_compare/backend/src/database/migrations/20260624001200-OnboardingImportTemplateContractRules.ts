import { MigrationInterface, QueryRunner } from 'typeorm';

const yesNoOptions = `'["1.是","2.否"]'::jsonb`;
const needCompanyContractYes = `'{"op":"EQ","field":"need_company_contract","value":"1.是"}'::jsonb`;
const needEsignYes = `'{"op":"EQ","field":"need_esign","value":"1.是"}'::jsonb`;
const needOnboardingContactYes = `'{"op":"EQ","field":"need_onboarding_contact","value":"1.是"}'::jsonb`;
const commonTemplateYes = `'{"op":"AND","children":[{"op":"EQ","field":"need_onboarding_contact","value":"1.是"},{"op":"EQ","field":"is_common_template","value":"1.是"}]}'::jsonb`;

export class OnboardingImportTemplateContractRules20260624001200 implements MigrationInterface {
  name = 'OnboardingImportTemplateContractRules20260624001200';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE field_configs
         SET dropdown_options = ${yesNoOptions},
             help_text = '选择“1.是”时拆分劳动合同签订工单。'
       WHERE field_code = 'need_company_contract'
    `);
    await queryRunner.query(`
      UPDATE field_configs
         SET dropdown_options = ${yesNoOptions},
             conditional_required = ${needCompanyContractYes}
       WHERE field_code = 'need_esign'
    `);
    await queryRunner.query(`
      UPDATE field_configs
         SET conditional_required = ${needEsignYes}
       WHERE field_code = 'esign_platform'
    `);
    await queryRunner.query(`
      UPDATE field_configs
         SET conditional_required = ${needCompanyContractYes}
       WHERE field_code IN ('contract_subject', 'company_address', 'project_name', 'contract_template')
    `);
    await queryRunner.query(`
      UPDATE field_configs
         SET dropdown_options = ${yesNoOptions},
             conditional_required = ${needCompanyContractYes}
       WHERE field_code = 'need_contract_urge'
    `);
    await queryRunner.query(`
      UPDATE field_configs
         SET dropdown_options = ${yesNoOptions},
             help_text = '选择“1.是”时拆分入职联系工单。'
       WHERE field_code = 'need_onboarding_contact'
    `);
    await queryRunner.query(`
      UPDATE field_configs
         SET conditional_required = ${needOnboardingContactYes}
       WHERE field_code = 'feedback_deadline'
    `);
    await queryRunner.query(`
      UPDATE field_configs
         SET dropdown_options = ${yesNoOptions},
             conditional_required = ${needOnboardingContactYes}
       WHERE field_code = 'is_common_template'
    `);
    await queryRunner.query(`
      UPDATE field_configs
         SET conditional_required = ${commonTemplateYes}
       WHERE field_code = 'template_name'
    `);
    await queryRunner.query(`
      UPDATE field_configs
         SET dropdown_options = ${yesNoOptions}
       WHERE field_code = 'need_company_payroll'
    `);
    await queryRunner.query(`
      UPDATE field_configs
         SET conditional_required = '{"op":"EQ","field":"need_company_payroll","value":"1.是"}'::jsonb
       WHERE field_code = 'payroll_location'
    `);
    await queryRunner.query(`
      UPDATE field_configs
         SET dropdown_options = ${yesNoOptions},
             help_text = '导入表中必须维护“1.是/2.否”；未维护或填写异常时该行导入失败。'
       WHERE field_code = 'social_urge'
    `);

    await queryRunner.query(`
      WITH ordered(field_code, display_order) AS (
        SELECT field_code, ROW_NUMBER() OVER (ORDER BY display_order ASC, created_at ASC) AS display_order
          FROM field_configs
         WHERE is_active = true
           AND (order_type = 'onboarding'::order_type_enum OR business_context @> '["onboarding"]'::jsonb)
           AND field_code NOT IN ('contract_feedback', 'onboarding_feedback', 'data_entry_feedback')
      )
      INSERT INTO import_template_fields(order_type, field_code, display_order, header_alias, is_required_override, is_active)
      SELECT 'onboarding'::order_type_enum, ordered.field_code, ordered.display_order, NULL, NULL, true
        FROM ordered
      ON CONFLICT (order_type, field_code) DO UPDATE
        SET display_order = EXCLUDED.display_order,
            is_active = true,
            updated_at = now()
    `);

    await queryRunner.query(`
      UPDATE import_template_fields
         SET is_active = false,
             updated_at = now()
       WHERE order_type = 'onboarding'::order_type_enum
         AND field_code IN ('contract_feedback', 'onboarding_feedback', 'data_entry_feedback')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE field_configs
         SET dropdown_options = '["是","否"]'::jsonb
       WHERE field_code IN (
         'need_company_contract', 'need_esign', 'need_contract_urge',
         'need_onboarding_contact', 'is_common_template', 'need_company_payroll', 'social_urge'
       )
    `);
    await queryRunner.query(`
      UPDATE field_configs
         SET conditional_required = '{"op":"EQ","field":"need_company_contract","value":"是"}'::jsonb
       WHERE field_code IN ('need_esign', 'esign_platform', 'contract_subject', 'company_address', 'project_name', 'contract_template', 'need_contract_urge')
    `);
    await queryRunner.query(`
      UPDATE field_configs
         SET conditional_required = '{"op":"EQ","field":"need_onboarding_contact","value":"是"}'::jsonb
       WHERE field_code IN ('feedback_deadline', 'is_common_template')
    `);
    await queryRunner.query(`
      UPDATE field_configs
         SET conditional_required = '{"op":"AND","children":[{"op":"EQ","field":"need_onboarding_contact","value":"是"},{"op":"EQ","field":"is_common_template","value":"是"}]}'::jsonb
       WHERE field_code = 'template_name'
    `);
    await queryRunner.query(`
      UPDATE field_configs
         SET conditional_required = '{"op":"EQ","field":"need_company_payroll","value":"是"}'::jsonb
       WHERE field_code = 'payroll_location'
    `);
    await queryRunner.query(`
      DELETE FROM import_template_fields
       WHERE order_type = 'onboarding'::order_type_enum
         AND field_code = 'contract_template'
    `);
  }
}
