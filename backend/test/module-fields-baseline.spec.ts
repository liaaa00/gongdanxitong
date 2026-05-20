import { readFileSync } from 'fs';
import { join } from 'path';

describe('onboarding module_fields baseline', () => {
  const moduleSeed = readFileSync(join(process.cwd(), 'src/database/seeds/seed-module-configs.ts'), 'utf8');

  function extractFields(moduleCode: string): string[] {
    const match = moduleSeed.match(new RegExp(`${moduleCode}: \\[([\\s\\S]*?)\\],`));
    expect(match).toBeTruthy();
    return Array.from(match![1].matchAll(/'([^']+)'/g)).map((item) => item[1]);
  }

  it('matches onboarding split-4 module field lists from the 20260515 baseline', () => {
    expect(extractFields('onboarding_contact')).toEqual([
      'customer_name', 'customer_code', 'employee_name', 'id_card_no',
      'mobile', 'email',
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
      'mobile', 'email', 'current_address', 'household_address', 'postal_code',
      'social_location', 'start_month', 'social_base', 'fund_base', 'fund_ratio',
      'bank_name', 'bank_account', 'remark',
      'business_mode',
      'need_company_payroll', 'payroll_location',
      'data_entry_feedback',
    ]);

    expect(extractFields('social_insurance')).toEqual([
      'customer_name', 'customer_code', 'employee_name', 'id_card_no',
      'social_location', 'start_month', 'social_base', 'fund_base', 'fund_ratio',
    ]);
  });

  it('keeps suspended fields out of child module_fields until product confirmation', () => {
    expect(extractFields('social_insurance')).not.toContain('social_urge');
    expect(extractFields('social_insurance')).not.toContain('remark');
    expect(extractFields('data_entry')).not.toContain('base_salary');
  });
});
