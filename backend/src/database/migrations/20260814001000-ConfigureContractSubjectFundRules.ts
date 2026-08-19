import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  CONTRACT_SUBJECT_FUND_RULES,
  PAYROLL_LOCATIONS,
} from 'src/common/constants/contract-subject-fund';

export class ConfigureContractSubjectFundRules20260814001000 implements MigrationInterface {
  name = 'ConfigureContractSubjectFundRules20260814001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE contract_subjects
        ADD COLUMN IF NOT EXISTS fund_ratio_options jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS supplementary_fund_ratio_options jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS fund_ratio_mode varchar(16) NOT NULL DEFAULT 'same'
    `);

    await queryRunner.query(`
      UPDATE contract_subjects
      SET fund_ratio_options = '[]'::jsonb,
          supplementary_fund_ratio_options = '[]'::jsonb,
          fund_ratio_mode = 'same'
    `);

    for (const rule of CONTRACT_SUBJECT_FUND_RULES) {
      await queryRunner.query(
        `UPDATE contract_subjects
         SET fund_ratio_options = $1::jsonb,
             supplementary_fund_ratio_options = $2::jsonb,
             fund_ratio_mode = $3,
             updated_at = now()
         WHERE social_credit_code = $4`,
        [
          JSON.stringify(rule.fundRatioOptions),
          JSON.stringify(rule.supplementaryFundRatioOptions),
          rule.fundRatioMode,
          rule.socialCreditCode,
        ],
      );
    }

    await queryRunner.query(
      `UPDATE field_configs
       SET field_type = 'dropdown',
           is_required = false,
           default_required = false,
           dropdown_options = NULL,
           placeholder = '请选择公积金比例',
           help_text = '根据劳动合同主体自动加载可选比例。广州、深圳的单位与个人比例可分别选择。'
       WHERE field_code = 'fund_ratio'`,
    );

    await queryRunner.query(
      `UPDATE field_configs
       SET field_type = 'dropdown',
           dropdown_options = $1::jsonb,
           placeholder = '请选择发薪地',
           help_text = '沿用薪酬银行卡模板的66项发薪地，独立选择，不与合同主体联动。'
       WHERE field_code = 'payroll_location'`,
      [JSON.stringify(PAYROLL_LOCATIONS)],
    );

    await queryRunner.query(`
      INSERT INTO field_configs (
        field_code, field_name, field_type, is_required, default_required,
        conditional_required, validation_regex, validation_msg, dropdown_options,
        collection_group, placeholder, help_text, order_type, business_context,
        display_order, is_active, is_included_in_template
      )
      VALUES (
        'supplementary_fund_ratio', '补充公积金比例', 'dropdown', false, false,
        NULL, NULL, NULL, NULL,
        '社保公积金类', '请选择补充公积金比例',
        '仅选择配置了补充公积金的上海劳动合同主体时显示并可选。',
        'onboarding', '["onboarding"]'::jsonb,
        42, true, true
      )
      ON CONFLICT (field_code) DO UPDATE SET
        field_name = EXCLUDED.field_name,
        field_type = EXCLUDED.field_type,
        dropdown_options = EXCLUDED.dropdown_options,
        collection_group = EXCLUDED.collection_group,
        placeholder = EXCLUDED.placeholder,
        help_text = EXCLUDED.help_text,
        order_type = EXCLUDED.order_type,
        business_context = EXCLUDED.business_context,
        is_active = true,
        is_included_in_template = true
    `);

    await queryRunner.query(`
      UPDATE import_template_fields target
      SET display_order = target.display_order + 1,
          updated_at = now()
      FROM import_template_fields fund
      WHERE fund.order_type = 'onboarding'
        AND fund.field_code = 'fund_ratio'
        AND fund.business_scope = target.business_scope
        AND target.order_type = 'onboarding'
        AND target.display_order > fund.display_order
        AND NOT EXISTS (
          SELECT 1
          FROM import_template_fields supplementary
          WHERE supplementary.order_type = 'onboarding'
            AND supplementary.field_code = 'supplementary_fund_ratio'
            AND supplementary.business_scope = target.business_scope
        )
    `);

    await queryRunner.query(`
      INSERT INTO import_template_fields (
        order_type, field_code, display_order, header_alias,
        is_required_override, is_active, business_scope
      )
      SELECT
        'onboarding', 'supplementary_fund_ratio', fund.display_order + 1,
        NULL, false, true, fund.business_scope
      FROM import_template_fields fund
      WHERE fund.order_type = 'onboarding'
        AND fund.field_code = 'fund_ratio'
      ON CONFLICT (order_type, field_code, business_scope) DO UPDATE SET
        display_order = EXCLUDED.display_order,
        is_required_override = false,
        is_active = true,
        updated_at = now()
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE import_template_fields
      SET is_active = false
      WHERE order_type = 'onboarding' AND field_code = 'supplementary_fund_ratio'
    `);
    await queryRunner.query(`
      UPDATE field_configs
      SET is_active = false
      WHERE field_code = 'supplementary_fund_ratio'
    `);
    await queryRunner.query(`
      UPDATE field_configs
      SET field_type = 'text', dropdown_options = NULL
      WHERE field_code IN ('fund_ratio', 'payroll_location')
    `);
    await queryRunner.query(`
      ALTER TABLE contract_subjects
        DROP COLUMN IF EXISTS fund_ratio_mode,
        DROP COLUMN IF EXISTS supplementary_fund_ratio_options,
        DROP COLUMN IF EXISTS fund_ratio_options
    `);
  }
}
