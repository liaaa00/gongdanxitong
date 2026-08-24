export type DispatchCategory = 'onboarding' | 'in_service' | 'resignation' | 'system';

const CATEGORY_BY_MODULE: Record<string, DispatchCategory> = {
  onboarding_contact: 'onboarding',
  payroll_bank_card: 'onboarding',
  contract: 'onboarding',
  contract_signing: 'onboarding',
  data_entry: 'onboarding',
  social_insurance: 'onboarding',
  renewal_contract: 'in_service',
  benefit: 'in_service',
  benefit_apply: 'in_service',
  social_insurance_change: 'in_service',
  in_service_single_business: 'in_service',
  resignation_contact: 'resignation',
  data_entry_resign: 'resignation',
  resignation_social_insurance: 'resignation',
  social_insurance_resign: 'resignation',
  resignation_cert: 'resignation',
};

export const DISPATCH_CATEGORY_ORDER: DispatchCategory[] = [
  'onboarding',
  'in_service',
  'resignation',
  'system',
];

export const DISPATCH_CATEGORY_LABELS: Record<DispatchCategory, string> = {
  onboarding: '入职',
  in_service: '在职',
  resignation: '离职',
  system: '系统/兼容',
};

export const DISPATCH_CATEGORY_COLORS: Record<DispatchCategory, string> = {
  onboarding: 'blue',
  in_service: 'gold',
  resignation: 'red',
  system: 'default',
};

export function getDispatchCategory(moduleCode?: string | null): DispatchCategory {
  return CATEGORY_BY_MODULE[String(moduleCode || '').trim()] || 'system';
}

export function getDispatchCategoryOrder(moduleCode?: string | null): number {
  return DISPATCH_CATEGORY_ORDER.indexOf(getDispatchCategory(moduleCode));
}
