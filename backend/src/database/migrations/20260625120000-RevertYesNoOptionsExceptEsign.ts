import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 仅 need_esign（是否电子签）保留下拉「1.是 / 2.否」；
 * 其余所有「是否」字段回退为「是 / 否」，并把对应条件必填值由 "1.是" 改回 "是"。
 * 修复上一版 20260624001200 误把全部是否字段改成 1.是/2.否 的问题。
 */
const yesNoOptions = `'["是","否"]'::jsonb`;
const needCompanyContractYes = `'{"op":"EQ","field":"need_company_contract","value":"是"}'::jsonb`;
const needOnboardingContactYes = `'{"op":"EQ","field":"need_onboarding_contact","value":"是"}'::jsonb`;
const needCompanyPayrollYes = `'{"op":"EQ","field":"need_company_payroll","value":"是"}'::jsonb`;
const commonTemplateYes = `'{"op":"AND","children":[{"op":"EQ","field":"need_onboarding_contact","value":"是"},{"op":"EQ","field":"is_common_template","value":"是"}]}'::jsonb`;

export class RevertYesNoOptionsExceptEsign20260625120000 implements MigrationInterface {
  name = 'RevertYesNoOptionsExceptEsign20260625120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 非 need_esign 的是否字段：下拉回退为「是/否」
    await queryRunner.query(`
      UPDATE field_configs
         SET dropdown_options = ${yesNoOptions}
       WHERE field_code IN (
         'need_company_contract', 'need_contract_urge', 'need_onboarding_contact',
         'is_common_template', 'need_company_payroll', 'social_urge'
       )
    `);

    // help_text 中的「1.是」措辞回退
    await queryRunner.query(`
      UPDATE field_configs
         SET help_text = '选择“是”时拆分劳动合同签订工单。'
       WHERE field_code = 'need_company_contract'
    `);
    await queryRunner.query(`
      UPDATE field_configs
         SET help_text = '选择“是”时拆分入职联系工单。'
       WHERE field_code = 'need_onboarding_contact'
    `);
    await queryRunner.query(`
      UPDATE field_configs
         SET help_text = '导入表中必须维护“是/否”；未维护或填写异常时该行导入失败。'
       WHERE field_code = 'social_urge'
    `);

    // 条件必填值：依赖 need_company_contract = 是
    await queryRunner.query(`
      UPDATE field_configs
         SET conditional_required = ${needCompanyContractYes}
       WHERE field_code IN (
         'need_esign', 'contract_subject', 'company_address', 'project_name',
         'contract_template', 'need_contract_urge'
       )
    `);
    // 条件必填值：依赖 need_onboarding_contact = 是
    await queryRunner.query(`
      UPDATE field_configs
         SET conditional_required = ${needOnboardingContactYes}
       WHERE field_code IN ('feedback_deadline', 'is_common_template')
    `);
    // template_name：AND(need_onboarding_contact=是, is_common_template=是)
    await queryRunner.query(`
      UPDATE field_configs
         SET conditional_required = ${commonTemplateYes}
       WHERE field_code = 'template_name'
    `);
    // payroll_location：依赖 need_company_payroll = 是
    await queryRunner.query(`
      UPDATE field_configs
         SET conditional_required = ${needCompanyPayrollYes}
       WHERE field_code = 'payroll_location'
    `);

    // need_esign 自身保持「1.是/2.否」，esign_platform 依赖 need_esign = 1.是（不变）
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const yesNo12 = `'["1.是","2.否"]'::jsonb`;
    const needCompanyContractYes12 = `'{"op":"EQ","field":"need_company_contract","value":"1.是"}'::jsonb`;
    const needOnboardingContactYes12 = `'{"op":"EQ","field":"need_onboarding_contact","value":"1.是"}'::jsonb`;
    const needCompanyPayrollYes12 = `'{"op":"EQ","field":"need_company_payroll","value":"1.是"}'::jsonb`;
    const commonTemplateYes12 = `'{"op":"AND","children":[{"op":"EQ","field":"need_onboarding_contact","value":"1.是"},{"op":"EQ","field":"is_common_template","value":"1.是"}]}'::jsonb`;

    await queryRunner.query(`
      UPDATE field_configs
         SET dropdown_options = ${yesNo12}
       WHERE field_code IN (
         'need_company_contract', 'need_contract_urge', 'need_onboarding_contact',
         'is_common_template', 'need_company_payroll', 'social_urge'
       )
    `);
    await queryRunner.query(`
      UPDATE field_configs
         SET conditional_required = ${needCompanyContractYes12}
       WHERE field_code IN (
         'need_esign', 'contract_subject', 'company_address', 'project_name',
         'contract_template', 'need_contract_urge'
       )
    `);
    await queryRunner.query(`
      UPDATE field_configs
         SET conditional_required = ${needOnboardingContactYes12}
       WHERE field_code IN ('feedback_deadline', 'is_common_template')
    `);
    await queryRunner.query(`
      UPDATE field_configs
         SET conditional_required = ${commonTemplateYes12}
       WHERE field_code = 'template_name'
    `);
    await queryRunner.query(`
      UPDATE field_configs
         SET conditional_required = ${needCompanyPayrollYes12}
       WHERE field_code = 'payroll_location'
    `);
  }
}
