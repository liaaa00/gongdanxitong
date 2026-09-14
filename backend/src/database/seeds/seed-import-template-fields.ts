import { DataSource } from 'typeorm';
import { ImportTemplateField, OrderType } from 'src/entities';

// 入职通用模板字段；邮编和地区特殊字段保留为系统字段但不进入客户标准模板。
export const ONBOARDING_TEMPLATE_ORDER = [
  'customer_name',
  'employee_name',
  'id_card_type',
  'id_card_no',
  'mobile',
  'email',
  'position',
  'position_type',
  'contract_term_type',
  'contract_start_date',
  'contract_end_date',
  'probation_start_date',
  'probation_end_date',
  'work_city',
  'work_hour_system',
  'salary_form',
  'base_salary',
  'other_salary',
  'probation_salary',
  'probation_other_salary',
  'payroll_cycle',
  'payroll_date',
  'social_location',
  'start_month',
  'social_base',
  'fund_base',
  'fund_ratio',
  'supplementary_fund_ratio',
  'need_payroll_slip',
  'remark',
  'household_type',
  'ethnicity',
  'education',
  'marital_status',
  'current_address',
  'household_address',
  'bank_location',
  'bank_name',
  'bank_account',
  'customer_code',
  'outsource_type',
  'business_mode',
  'employee_type',
  'need_company_contract',
  'need_esign',
  'esign_platform',
  'contract_subject',
  'company_address',
  'project_name',
  'work_arrangement',
  'contract_template',
  'special_contract_template_name',
  'need_contract_urge',
  'need_onboarding_contact',
  'feedback_deadline',
  'is_common_template',
  'template_name',
  'need_company_payroll',
  'payroll_location',
  'social_urge',
  'special_remark',
];

const ONBOARDING_TEMPLATE_HEADER_ALIASES: Partial<Record<(typeof ONBOARDING_TEMPLATE_ORDER)[number], string>> = {
  company_address: '劳动合同主体注册地',
  special_contract_template_name: '特殊合同模板名称',
};

const ONBOARDING_TEMPLATE_REQUIRED_OVERRIDES: Partial<Record<(typeof ONBOARDING_TEMPLATE_ORDER)[number], boolean>> = {
  feedback_deadline: false,
};

export async function seedImportTemplateFields(dataSource: DataSource): Promise<void> {
  await dataSource.query('SELECT pg_advisory_lock(hashtext($1))', ['seedImportTemplateFields']);
  try {
    const repository = dataSource.getRepository(ImportTemplateField);

    // 清除现有配置
    await repository.delete({ orderType: OrderType.ONBOARDING });

    // 插入新配置
    for (let i = 0; i < ONBOARDING_TEMPLATE_ORDER.length; i++) {
      const fieldCode = ONBOARDING_TEMPLATE_ORDER[i];
      await repository.save(
        repository.create({
          orderType: OrderType.ONBOARDING,
          fieldCode,
          displayOrder: i + 1,
          headerAlias: ONBOARDING_TEMPLATE_HEADER_ALIASES[fieldCode] ?? null,
          isRequiredOverride: ONBOARDING_TEMPLATE_REQUIRED_OVERRIDES[fieldCode] ?? null,
          isActive: true,
        }),
      );
    }

    console.log(`✓ 已配置入职导入模板 ${ONBOARDING_TEMPLATE_ORDER.length} 个字段`);
  } finally {
    await dataSource.query('SELECT pg_advisory_unlock(hashtext($1))', ['seedImportTemplateFields']).catch(() => undefined);
  }
}
