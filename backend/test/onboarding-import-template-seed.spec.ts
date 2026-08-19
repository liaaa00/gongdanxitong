import { DataSource } from 'typeorm';
import { seedFields } from 'src/database/seeds/seed-fields';
import { FieldType } from 'src/entities';
import { ONBOARDING_TEMPLATE_ORDER, seedImportTemplateFields } from 'src/database/seeds/seed-import-template-fields';

describe('onboarding import template seeds', () => {
  it('keeps the universal order without regional supplementary fund and preserves special remark as the final column', async () => {
    const saved: Array<Record<string, unknown>> = [];
    const repository = {
      delete: jest.fn().mockResolvedValue(undefined),
      create: jest.fn((value: Record<string, unknown>) => value),
      save: jest.fn(async (value: Record<string, unknown>) => {
        saved.push(value);
        return value;
      }),
    };
    const dataSource = {
      query: jest.fn().mockResolvedValue([]),
      getRepository: jest.fn(() => repository),
    } as unknown as DataSource;

    await seedImportTemplateFields(dataSource);

    expect(new Set(ONBOARDING_TEMPLATE_ORDER)).toHaveProperty('size', ONBOARDING_TEMPLATE_ORDER.length);
    expect(ONBOARDING_TEMPLATE_ORDER).not.toContain('supplementary_fund_ratio');
    expect(ONBOARDING_TEMPLATE_ORDER.at(-1)).toBe('special_remark');
    expect(ONBOARDING_TEMPLATE_ORDER.indexOf('need_payroll_slip')).toBe(ONBOARDING_TEMPLATE_ORDER.indexOf('remark') - 1);
    expect(ONBOARDING_TEMPLATE_ORDER.slice(36, 53)).toEqual([
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
      'need_contract_urge',
    ]);
    expect(ONBOARDING_TEMPLATE_ORDER).not.toContain('postal_code');
    expect(ONBOARDING_TEMPLATE_ORDER).not.toEqual(expect.arrayContaining([
      'graduation_school',
      'major',
      'graduation_date',
    ]));
    expect(saved.map((row) => row.fieldCode)).toEqual(ONBOARDING_TEMPLATE_ORDER);
    expect(saved.find((row) => row.fieldCode === 'social_location')).toMatchObject({
      headerAlias: null,
    });
    expect(saved.find((row) => row.fieldCode === 'need_payroll_slip')).toMatchObject({
      isRequiredOverride: null,
    });
    expect(saved.find((row) => row.fieldCode === 'company_address')).toMatchObject({
      headerAlias: '劳动合同主体注册地',
    });
    expect(saved.find((row) => row.fieldCode === 'contract_term')).toMatchObject({ isRequiredOverride: null });
    expect(saved.find((row) => row.fieldCode === 'contract_end_date')).toMatchObject({ isRequiredOverride: null });
    expect(saved.find((row) => row.fieldCode === 'feedback_deadline')).toMatchObject({ isRequiredOverride: false });
  });

  it('seeds the new names without excluding education', async () => {
    const saved: Array<Record<string, unknown>> = [];
    const repository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value: Record<string, unknown>) => value),
      save: jest.fn(async (value: Record<string, unknown>) => {
        saved.push(value);
        return value;
      }),
    };
    const dataSource = {
      query: jest.fn().mockResolvedValue([{ column_name: 'collection_group' }]),
      getRepository: jest.fn(() => repository),
    } as unknown as DataSource;

    await seedFields(dataSource);

    const byCode = new Map(saved.map((row) => [row.fieldCode, row]));
    expect(byCode.get('bank_location')).toMatchObject({
      fieldName: '开户地',
      helpText: '城市的名字（待确认）',
      isIncludedInTemplate: true,
    });
    expect(byCode.get('contract_term')).toMatchObject({
      isRequired: false,
      defaultRequired: false,
      conditionalRequired: { field: 'contract_term_type', op: 'NEQ', value: '无固定期限' },
    });
    expect(byCode.get('contract_end_date')).toMatchObject({
      isRequired: false,
      defaultRequired: false,
      conditionalRequired: { field: 'contract_term_type', op: 'NEQ', value: '无固定期限' },
    });
    expect(byCode.get('base_salary')).toMatchObject({
      fieldType: FieldType.TEXT,
      helpText: '可填写数字、货币格式或文字说明。',
    });
    expect(byCode.get('probation_salary')).toMatchObject({
      fieldType: FieldType.TEXT,
      helpText: '可填写数字、货币格式或文字说明。',
    });
    expect(byCode.get('feedback_deadline')).toMatchObject({
      isRequired: false,
      defaultRequired: false,
      conditionalRequired: null,
    });
    expect(byCode.get('company_address')).toMatchObject({
      fieldName: '劳动合同主体注册地',
    });
    expect(byCode.get('social_location')).toMatchObject({
      fieldName: '缴纳地',
    });
    expect(byCode.get('need_payroll_slip')).toMatchObject({
      fieldName: '是否需要工资单',
      fieldType: FieldType.DROPDOWN,
      isRequired: true,
      defaultRequired: true,
    });
    expect(byCode.get('education')).toMatchObject({ isIncludedInTemplate: true });
    expect(byCode.get('supplementary_fund_ratio')).toMatchObject({
      isIncludedInTemplate: false,
      businessContext: ['onboarding', 'resignation'],
      isRequired: false,
      defaultRequired: false,
    });
    expect(byCode.get('postal_code')).toMatchObject({ isIncludedInTemplate: false, isActive: true });
    expect(byCode.get('graduation_school')).toMatchObject({ isIncludedInTemplate: false });
    expect(byCode.get('major')).toMatchObject({ isIncludedInTemplate: false });
    expect(byCode.get('graduation_date')).toMatchObject({ isIncludedInTemplate: false });
  });
});
