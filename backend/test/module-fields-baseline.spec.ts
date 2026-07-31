import { readFileSync } from 'fs';
import { join } from 'path';

describe('onboarding module_fields baseline', () => {
  const moduleSeed = readFileSync(join(process.cwd(), 'src/database/seeds/seed-module-configs.ts'), 'utf8');

  function extractFields(moduleCode: string): string[] {
    const inlineMatch = moduleSeed.match(new RegExp(`${moduleCode}: \\[([\\s\\S]*?)\\],`));
    if (inlineMatch) {
      return Array.from(inlineMatch[1].matchAll(/'([^']+)'/g)).map((item) => item[1]);
    }
    const aliasMatch = moduleSeed.match(new RegExp(`${moduleCode}:\\s*([A-Za-z0-9_]+),`));
    expect(aliasMatch).toBeTruthy();
    const aliasName = aliasMatch![1];
    const definitionMatch = moduleSeed.match(new RegExp(`const ${aliasName} = \\[([\\s\\S]*?)\\];`));
    expect(definitionMatch).toBeTruthy();
    return Array.from(definitionMatch![1].matchAll(/'([^']+)'/g)).map((item) => item[1]);
  }

  it('matches the approved onboarding module field lists including Xiamen education fields', () => {
    expect(extractFields('onboarding_contact')).toEqual([
      'customer_name', 'customer_code', 'employee_name', 'id_card_no',
      'mobile', 'email',
      'education', 'graduation_school', 'major', 'graduation_date',
      'bank_name', 'bank_account',
      'need_onboarding_contact', 'onboarding_feedback',
    ]);

    expect(extractFields('contract')).toEqual([
      'customer_name', 'customer_code', 'outsource_type', 'position',
      'employee_name', 'id_card_no', 'gender',
      'mobile', 'email', 'current_address', 'household_address',
      'contract_term_type', 'contract_term', 'contract_start_date', 'contract_end_date',
      'probation_start_date', 'probation_months', 'probation_end_date',
      'work_city', 'work_hour_system', 'work_cycle', 'salary_form',
      'base_salary', 'other_salary', 'probation_salary',
      'payroll_cycle', 'payroll_date',
      'business_mode', 'employee_type',
      'need_company_contract', 'contract_subject', 'contract_template', 'need_contract_urge',
      'contract_feedback',
    ]);

    expect(extractFields('data_entry')).toEqual([
      'customer_name', 'customer_code', 'outsource_type', 'position',
      'employee_name', 'id_card_no', 'gender',
      'birth_date', 'age', 'household_type', 'ethnicity',
      'education', 'graduation_school', 'major', 'graduation_date',
      'mobile', 'email', 'current_address', 'household_address', 'postal_code',
      'social_location', 'start_month', 'social_base', 'fund_base', 'fund_ratio',
      'bank_name', 'bank_account', 'remark',
      'business_mode',
      'need_company_payroll', 'payroll_location',
      'data_entry_feedback',
    ]);

    expect(extractFields('social_insurance')).toEqual([
      'customer_name', 'customer_code', 'employee_name', 'id_card_no', 'mobile', 'email',
      'education', 'graduation_school', 'major', 'graduation_date',
      'social_location', 'start_month', 'social_base', 'fund_base', 'fund_ratio',
    ]);
  });

  it('keeps unconfirmed fields out while retaining confirmed Xiamen education fields', () => {
    expect(extractFields('social_insurance')).toEqual([
      'customer_name', 'customer_code', 'employee_name', 'id_card_no', 'mobile', 'email',
      'education', 'graduation_school', 'major', 'graduation_date',
      'social_location', 'start_month', 'social_base', 'fund_base', 'fund_ratio',
    ]);
    expect(extractFields('social_insurance')).toEqual(expect.arrayContaining([
      'education', 'graduation_school', 'major', 'graduation_date',
    ]));
    expect(extractFields('social_insurance')).not.toContain('remark');
    expect(extractFields('data_entry')).not.toContain('base_salary');
    expect(extractFields('data_entry_resign')).toEqual(expect.arrayContaining(['mobile', 'email']));
    expect(extractFields('resignation_social_insurance')).toEqual(expect.arrayContaining(['mobile', 'email']));
  });

  it('does not treat out-of-province direct-order types as child module codes', () => {
    expect(moduleSeed).not.toContain("moduleCode: 'out_of_province_increase'");
    expect(moduleSeed).not.toContain("moduleCode: 'out_of_province_decrease'");
    expect(moduleSeed).not.toMatch(/out_of_province_(increase|decrease):/);
  });
});
