import type { ConditionalRequired } from '@/components/DynamicForm';

export const CONDITIONAL_REQUIRED_BY_TYPE: Record<'onboarding' | 'resignation', ConditionalRequired[]> = {
  onboarding: [
    { field: 'need_company_contract', value: '是', requireFields: ['need_esign', 'esign_platform', 'contract_subject', 'project_name', 'work_arrangement', 'contract_template', 'need_contract_urge'] },
    { field: 'esign_platform', value: 'E签宝', requireFields: ['company_address'] },
    { field: 'need_company_payroll', value: '是', requireFields: ['payroll_location'] },
    { field: 'need_onboarding_contact', value: '否', requireFields: ['current_address'] },
    { field: 'need_onboarding_contact', value: '否', requireFields: ['bank_name', 'bank_account', 'bank_location', 'payroll_location'] },
    { field: 'contract_template', value: '特殊模板', requireFields: ['special_contract_template_name'] },
    { field: 'is_common_template', value: '否', requireFields: ['template_name'] },
  ],
  resignation: [
    { field: 'is_common_template', value: '否', requireFields: ['template_name'] },
  ],
};
